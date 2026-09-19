# 06 — Data Model

## Status: DRAFT (filled 2026-09-07, Drizzle + Postgres 17 per D-018)

> **DRIFT (2026-09-19, KI-031):** `credit_ledger` and `subscriptions` are documented as schema — **tables do not exist**. `accounts.tier` (0008) and `ai_spend.attempt` (0009) **do** exist and are missing here. FK claims on `bots.account_id` / spec pointers are wrong. Drizzle is a type catalog; runtime is raw `pg` Pool; migrations are hand-written SQL. §3 later admits ledger does not exist (self-contradiction). Detail: `Teknik_Borc/KI-031_docs-stale.md`.

> The shape of the data: the "warehouse" layout. Conventions: `snake_case` tables/columns, `id uuid PK default gen_random_uuid()`, `created_at/updated_at timestamptz`, soft-delete via `deleted_at` (tokens hard-deleted ≤30d per retention). Spec JSON lives in `JSONB`, validated by `packages/spec` zod schemas — DB checks structure, app checks meaning.

---

## 1. Entities overview (plain language)

- Account: the human owner (Discord identity + Creem customer + credit balance).
- Bot: one Discord bot (token vaulted, one spec pointer for prod + one for draft).
- Spec version: one immutable recipe revision (diff, author, publish state).
- Guild install: one server the bot is in (caps, pre-flight state).
- User record: one member's persistent data (XP, warnings, economy) — survives restarts.
- Credit ledger: every credit movement (grant, burn, refill, sale) — money trail.
- Subscription: Creem state mirror (plan, trial ends, past-due).
- Session: one login (server-side row behind the `corvus_session` cookie, 30-day rolling).
- Template: gallery card + versioned source spec + fork/review counters.
- Job: pg-boss row (digest, retry, wakeup) — infra, not user data.
- Audit event: who changed what, when (humans + AI + system).

---

## 2. Schema

```
accounts:
  id              uuid      primary key
  discord_id      text      unique, not null (OAuth subject)
  email           text      recovery + billing contact
  creem_id        text      nullable (set at first paid event)
  credits         numeric   default 0 (allowance ledger balance)
  created_at      timestamptz

bots:
  id              uuid      primary key
  account_id      uuid      -> accounts.id
  name            text      ≤32 chars (Discord limit)
  token_cipher    bytea     AES-256-GCM envelope, never logged (Corvus-owned fleet apps — D-038; decrypt only in gateway, AAD = bot id)
  prod_spec_id    uuid      -> spec_versions.id (nullable until first publish)
  draft_spec_id   uuid      -> spec_versions.id
  status          text      draft|staging|live|sleeping|quarantined
  deleted_at      timestamptz nullable

spec_versions:
  id              uuid      primary key
  bot_id          uuid      -> bots.id
  version         int       monotonic per bot (v1, v2…)
  spec            jsonb     behavior-spec (zod-validated)
  diff_summary    text      plain-language change list (auto)
  author          text      owner:<discord_id> | ai:<model> | system
  state           text      draft|published|rolled_back
  created_at      timestamptz

oauth_states:  (V1-2, D-036 - durable login grants)
  state           text      primary key (unguessable random, atomic single-use consume)
  code_verifier   text
  return_to       text      nullable
  created_at      timestamptz
  expires_at      timestamptz (10-min TTL; swept)

interview_progress:  (V1-2, D-036 - durable interview state)
  interview_id    uuid      primary key (the draft bot id, no FK by design)
  payload         jsonb     { answers[] }
  updated_at      timestamptz
  expires_at      timestamptz (rolling ~24h; deleted on done-mint)

ai_spend:  (V1-2, D-032 - live-cost meter; credit_ledger arrives with billing)
  id              uuid      primary key
  account_id      uuid      -> accounts.id ON DELETE CASCADE
  model           text
  usd_cost        numeric   nullable (null = provider reported none)
  credits         numeric   nullable
  reason          text
  ref_id          uuid      nullable
  created_at      timestamptz

builder_runs:  (V1-7, D-126/D-128 - async builder progress; no FK by design)
  id              uuid      primary key
  bot_id          uuid      not null, no FK (row keyed by own id; never couples to bot lifecycle)
  phase           text      queued|generating|syncing|live|failed (default queued)
  detail          jsonb     per-phase facts ({version, model} on live; {error, step} classes only on failed)
  created_at      timestamptz
  updated_at      timestamptz

guild_installs:  (V1-4, D-039)
  id              uuid      primary key
  bot_id          uuid      -> bots.id
  guild_id        text      Discord guild id, unique per bot
  preflight       jsonb     last scan result ({ scannedAt, rows[], summary } — Red/Yellow/Green rows, scanner §4 catalog)
  joined_at       timestamptz

user_records:
  id              uuid      primary key
  bot_id          uuid      -> bots.id
  guild_id        text
  member_id       text      Discord user id
  xp              int       default 0 (UNIQUE(bot_id, guild_id, member_id))
  warnings        jsonb     [{reason, at, by, action}]
  balance         numeric   economy currency, default 0
  updated_at      timestamptz (written transactionally — NEVER memory-only)

credit_ledger:
  id              uuid      primary key (append-only, never updated/deleted)
  account_id      uuid      -> accounts.id
  delta           numeric   +grant/refill/sale, -burn (credits, 3 decimals)
  reason          text      trial_grant | monthly_grant | refill | burn:builder | burn:persona | sale:template | fee
  ref_id          uuid      nullable (run id / message batch / order)

subscriptions:
  account_id      uuid      -> accounts.id (unique)
  plan            text      trial | pro | studio
  trial_ends_at   timestamptz nullable
  creem_sub_id    text      nullable
  status          text      trialing|active|past_due|paused|canceled
  updated_at      timestamptz (Creem webhooks are the writer)

sessions:  (V1-1, D-031)
  id              uuid      primary key
  account_id      uuid      -> accounts.id ON DELETE CASCADE
  expires_at      timestamptz (30-day rolling, touched past half-TTL)
  created_at      timestamptz

spec_versions:  (V1-1, D-031 — immutable revisions, never updated)
  id              uuid      primary key
  bot_id          uuid      -> bots.id ON DELETE CASCADE
  version         int       monotonic per bot (UNIQUE(bot_id, version))
  spec            jsonb     behavior-spec (zod-validated envelope)
  diff_summary    text      default ''
  author          text      owner:<discord_id> | ai:<model> | system
  state           text      draft|published|rolled_back (default draft)
  created_at      timestamptz

templates:  (V1-6, D-037 — reviews table deferred to the 12-template V2)
  id              uuid      primary key
  slug            text      unique
  name            text
  category        text      1 of 8 locked v1 names (the D-037 set)
  capabilities    jsonb     non-empty subset of the invite vocabulary (drives perms_needed + the fork's invite URL)
  source_spec     jsonb     versioned template envelope (parseSpec-valid; 3-5 opaque behaviors + server_pack note)
  semver          text      template version (bump = reseed via the seed entry, no history table)
  perms_needed    jsonb     [{perm, why}] (1-3 shown; subset of the mapper output for the row's capabilities)
  forks           int       incremented transactionally inside each fork (replaces the nightly-recompute plan)
  created_at      timestamptz

template_reviews:  (V2 — table NOT created in V1-6; schema below is the future contract)

template_reviews:
  id              uuid      primary key
  template_id     uuid      -> templates.id
  account_id      uuid      -> accounts.id (must hold 7d+ live install — enforced)
  stars           smallint  1-5
  note            varchar(140)
  created_at      timestamptz (UNIQUE(template_id, account_id))

audit_events:
  id              uuid      primary key (append-only)
  account_id      uuid      nullable (system events)
  bot_id          uuid      nullable
  actor           text      owner:<id> | ai:<model> | system
  action          text      publish | rollback | grant | quarantine | invite…
  detail          jsonb
  created_at      timestamptz
```

---

## 3. Relationships

```
accounts 1—N bots 1—N spec_versions (prod + draft pointers back to spec_versions)
bots 1—N guild_installs; bots 1—N user_records (per guild+member)
accounts 1—1 subscriptions; accounts 1—N sessions; accounts 1-N ai_spend (append-only live-cost meter)
(credit_ledger does NOT exist yet — allowance enforcement arrives with billing, Phase 4)
templates 1—N template_reviews; bots N—1 templates (forked_from, nullable)
audit_events N—1 accounts/bots (nullable for system)
oauth_states + interview_progress: flow-scoped rows (login grant / interview answers); progress keyed by interview, not account, by design
builder_runs: flow-scoped rows (one per builder run, keyed by run id, no FK — same convention)
```

One account's tokens are decryptable only in the gateway shard owning that account's bots (row-level scoping in app code, not just SQL).

---

## 4. Data lifecycle & retention

- Member content (messages): in-memory unless the owner opts a behavior in; never logged to stdout.
- Bot tokens: encrypted at rest; hard-deleted ≤30 days after bot/account delete; rotated on leak signal with one-click reconnect (fleet-owned — rotation never needs the user, D-038).
- Backups: nightly `pg_dump -Fc` → Hetzner Object Storage, 7 daily + 4 weekly; restore tested monthly.
- Trial-expiry: NOTHING deleted — bot sleeps, data kept 12 months, wake on upgrade.
- Transactions (Creem-side + ledger): 7 years (processor/tax reality).
- Owner rights: export (free JSON/.zip incl. code), correction, deletion via dashboard; support email SLA 3 business days (Creem MoR requirement).

---

## 5. Migrations

Drizzle (`drizzle-kit generate` → review SQL → `migrate` in deploy BEFORE app start). Never edit a shipped migration; add a new one. Destructive migrations (drop/alter) require a pre-deploy `pg_dump` snapshot + orchestrator sign. pg-boss runs its own `schema 39` migration on start (v12 — review release notes before any major bump).
