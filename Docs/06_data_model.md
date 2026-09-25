# 06 — Data Model

## Status: DRAFT (filled 2026-09-07, Drizzle + Postgres 17 per D-018)

> The shape of the data: the "warehouse" layout. Conventions: `snake_case` tables/columns, `id uuid PK default gen_random_uuid()` (except `oauth_states.state` text PK, `interview_progress.interview_id` uuid PK, `subscriptions.account_id` uuid PK, `webhook_receipts.event_id` text PK). Timestamps are per-table, not uniform — most tables carry `created_at`, several carry `updated_at` instead of or as well as it, and only `bots` has `deleted_at` (soft-delete); `guild_installs` tracks `joined_at`, `oauth_states`/`sessions`/`interview_progress` track `expires_at`, `webhook_receipts` tracks `received_at` (see §2). Spec JSON lives in `JSONB`, validated by `packages/spec` zod schemas — DB checks structure, app checks meaning. Drizzle `pgTable`s are the type catalog (plus a few boot queries); runtime is a raw `pg` Pool and migrations are hand-written SQL in `apps/gateway/drizzle/` (§5).

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
- Webhook receipt: one provider event seen (replay guard; 0011, working tree unmerged).

---

## 2. Schema

```
accounts:  (0002 + 0008 tier + 0010 trial_ends_at; v11.ts:21-30)
  id              uuid      primary key
  discord_id      text      unique, not null (OAuth subject)
  email           text      recovery + billing contact
  creem_id        text      nullable (set at first paid event)
  credits         numeric   default 0 (allowance ledger balance)
  tier            text      not null default 'trial' (reader-facing plan tier; no CHECK — invalid values neutralize to trial at read in tier-resolver.ts)
  trial_ends_at   timestamptz nullable (3-day trial clock, NULL = no clock = not expired; set on INSERT only; SQL-only via 0010 — NO Drizzle pgTable column, read with raw SQL in apps/web/lib/auth/session.ts)
  created_at      timestamptz

bots:  (0001; schema.ts:27-42 — account_id + spec pointers carry NO FK)
  id              uuid      primary key
  account_id      uuid      not null, NO FK (indexed only)
  name            text      ≤32 chars (Discord limit, app-enforced)
  token_cipher    bytea     AES-256-GCM envelope, never logged (Corvus-owned fleet apps — D-038; decrypt only in gateway, AAD = bot id)
  prod_spec_id    uuid      nullable until first publish, opaque pointer, NO FK (spec versions live outside this table's constraint set)
  draft_spec_id   uuid      opaque pointer, NO FK
  status          text      draft|staging|live|sleeping|quarantined (app-enforced)
  deleted_at      timestamptz nullable (the only soft-delete column in the model)
  created_at      timestamptz
  updated_at      timestamptz

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

ai_spend:  (0003 + 0009 attempt; v12.ts:76-92 — attempt is SQL-only: the partial unique index lives in 0009 and has NO Drizzle pgTable counterpart)
  id              uuid      primary key
  account_id      uuid      -> accounts.id ON DELETE CASCADE
  model           text
  usd_cost        numeric   nullable (null = provider reported none)
  credits         numeric   nullable
  reason          text
  ref_id          uuid      nullable (links the spend, NO FK — rows survive their subject)
  attempt         integer   nullable (run-global billable attempt; NULL on chat rows; partial unique (ref_id, reason, attempt) WHERE both NOT NULL — 0009 SQL-only)
  created_at      timestamptz

builder_runs:  (0007; builder-runs.ts:81-92 - async builder progress; no FK by design)
  id              uuid      primary key
  bot_id          uuid      not null, no FK (row keyed by own id; never couples to bot lifecycle)
  phase           text      queued|generating|syncing|live|failed (default queued)
  detail          jsonb     per-phase facts ({version, model} on live; {error, step} classes only on failed)
  created_at      timestamptz
  updated_at      timestamptz

guild_installs:  (0005; guilds.ts:12-30 — UNIQUE(bot_id, guild_id))
  id              uuid      primary key
  bot_id          uuid      -> bots.id ON DELETE CASCADE
  guild_id        text      Discord guild id (unique per bot via the pair constraint)
  preflight       jsonb     nullable until first scan; last scan result ({ scannedAt, rows[], summary } — Red/Yellow/Green rows, scanner §4 catalog)
  joined_at       timestamptz (no created_at/updated_at on this table)

user_records:  (0001; schema.ts:49-67 — UNIQUE(bot_id, guild_id, member_id); carries updated_at, NO created_at)
  id              uuid      primary key
  bot_id          uuid      -> bots.id
  guild_id        text
  member_id       text      Discord user id
  xp              int       default 0 (UNIQUE(bot_id, guild_id, member_id))
  warnings        jsonb     [{reason, at, by, action}]
  balance         numeric   economy currency, default 0
  updated_at      timestamptz (written transactionally — NEVER memory-only)

credit_ledger:  (0011 — EXISTS on disk in working tree, UNMERGED: `git ls-files` lists only 0001–0010; v11.ts:116-136 mirrors it as type catalog)
  id              uuid      primary key (append-only, never updated/deleted)
  account_id      uuid      -> accounts.id ON DELETE CASCADE
  ref_id          uuid      nullable (run id / message batch / order; NO FK — money history outlives its subject)
  reason          text      trial_grant | monthly_grant | refill | burn:builder | burn:persona | sale:template | fee (app-enforced, no CHECK)
  attempt         integer   nullable (run-global billable attempt; partial unique (ref_id, reason, attempt) WHERE both NOT NULL)
  amount_cr       numeric   SIGNED in credits: +grant/refill/sale, -burn (no default — every writer states the sign)
  meta            jsonb     opaque provider payload, default '{}'
  created_at      timestamptz

subscriptions:  (0011 — same working-tree status as credit_ledger; v11.ts:153-169)
  account_id      uuid      PRIMARY KEY -> accounts.id ON DELETE CASCADE (unique by construction)
  tier            text      not null default 'trial' (the provider's last confirmed plan — mirrors it; accounts.tier stays the reader-facing column)
  creem_subscription_id text nullable (partial unique WHERE NOT NULL — one Creem subscription, one account)
  status          text      trialing|active|past_due|paused|canceled (provider vocabulary, app-enforced; Creem webhooks are the writer)
  updated_at      timestamptz

webhook_receipts:  (0011 — same working-tree status; v11.ts:186-197 — replay ledger, INSERTed BEFORE any ledger/tier write)
  event_id        text      primary key (provider event id — text because Creem ids are "evt_…", not uuid; the PK is the replay guard)
  type            text      provider event type as delivered
  received_at     timestamptz (our clock, not the provider's)
  payload_hash    text      hash of the raw request bytes as received

sessions:  (V1-1, D-031)
  id              uuid      primary key
  account_id      uuid      -> accounts.id ON DELETE CASCADE
  expires_at      timestamptz (30-day rolling, touched past half-TTL)
  created_at      timestamptz

spec_versions:  (0002; v11.ts:69-84 — immutable revisions, never updated)
  id              uuid      primary key
  bot_id          uuid      -> bots.id ON DELETE CASCADE
  version         int       monotonic per bot (UNIQUE(bot_id, version))
  spec            jsonb     behavior-spec (zod-validated envelope)
  diff_summary    text      default ''
  author          text      owner:<discord_id> | ai:<model> | system
  state           text      draft|published|rolled_back (default draft)
  created_at      timestamptz

templates:  (0004; v13.ts:20-34 — reviews table deferred to the 12-template V2)
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

audit_events:  (0006; audit-events.ts:16-28 — no FKs by design: rows outlive their subjects)
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
accounts 1—N bots 1—N spec_versions (prod + draft pointers back, opaque — NO FK constraints: schema.ts:25-26)
bots 1—N guild_installs; bots 1—N user_records (per guild+member)
accounts 1—1 subscriptions (0011, working tree unmerged); accounts 1—N sessions; accounts 1—N ai_spend (append-only live-cost meter); accounts 1—N credit_ledger (0011, working tree unmerged — the money trail: grant, burn, refill, sale)
templates 1—N template_reviews (V2 future contract — table NOT created); bots carry NO forked_from column (verified: no matches in code — the N—1 claim was stale)
audit_events N—1 accounts/bots (nullable for system, no FKs — rows outlive their subjects)
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

Hand-written SQL in `apps/gateway/drizzle/`, applied in number order (`0001` → `0013`; RUNBOOK.md §7.2.5). The applier is a journaled runner — `node apps/gateway/scripts/migrate.mjs` from the repo root with `DATABASE_URL` set (no port fallback: unset means exit 1) — which applies each unjournaled file in number order and records `filename + sha256` in `public.schema_migrations`; a checksum mismatch on a journaled file, or a journaled file that has gone missing, is a hard fail naming the file. That is the forward-only tripwire: once applied, a file is frozen. `--check` is verify-only and exits non-zero when anything is pending; each file runs in its own transaction, a `pg_advisory_lock` serializes concurrent invocations, and `CONCURRENTLY` statements are rejected loudly (they cannot run inside that transaction; `migrate.mjs:61-63`). CI applies the whole set to the empty CI database with the same runner (`.github/workflows/ci.yml:37-38`), so CI tests the schema the product ships. The deploy workflow (`deploy.yml`) runs the same runner only in its gates job against a throwaway CI DB (`deploy.yml:74-75`) and never touches the live DB — the prod apply stays an explicit, gated RUNBOOK §7.2.5 step behind a pre-deploy `pg_dump` snapshot. `drizzle-kit` exists only as a devDependency (`apps/gateway/package.json:36`) with a `drizzle.config.ts` pointing at `schema.ts`; no `migrate()` call exists in gateway src (verified by search). Never edit a shipped migration; add a new one. 0010's trailing UPDATE is NON-IDEMPOTENT (re-arms the trial) — never re-run it. Destructive migrations (drop/alter) require a pre-deploy `pg_dump` snapshot + orchestrator sign. pg-boss runs its own migration on start (v12.30.0 installed; latest bundled migration is v40 in `migrationStore.js` — the doc's old "schema 39" was stale).
