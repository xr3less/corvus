# SPEC: KI-033 trial enforcement — option A (founder-ordered 2026-09-19 night)

## Status: SPEC (founder: option A, enforce. No sleep-charity: expired = blocked with an honest message, not paywalled — there is no checkout yet.)

## Goal

Close KI-033 (`Docs/Teknik_Borc/KI-033_trial-unenforced.md`): the locked trial rules
(3-day full-Pro trial, 1 bot, 100 credits, no card; expiry = blocked, nothing deleted,
12-month data keep) are enforced in product code, and every public promise matches
the behavior. Rule: **promise == behavior** — where the code cannot yet keep a
promise, the words change; where the founder ordered enforcement, the words flip
from "not enforced yet" to present-tense truth.

## Rulings (orchestrator decisions — agents do NOT re-decide these)

1. **Clock = new `accounts.trial_ends_at` (timestamptz, nullable).** NOT `created_at + 3 days`
   (created_at stays a pure signup stamp; existing accounts get grandfathered explicitly).
   Set at account creation: `trial_ends_at = now() + interval '3 days'`.
2. **Grandfathering:** all accounts existing at migration time get
   `trial_ends_at = now() + interval '3 days'` (a fresh 3 days from deploy, not from
   their old created_at — generous, simple, one UPDATE in the migration). Document it
   in the migration comment.
3. **"100 credits" = monthly allowance gate (existing `checkBudget` semantics), NOT a
   spend-down balance.** The repo's gate is recurrence-based (`date_trunc('month')`);
   the SPEC does not redesign the credit model. `accounts.credits` stays untouched.
4. **"Expired" blocks WRITES ONLY: mint (all 3 entry points) + builder start + chat.**
   Reads (dashboard, activity, gallery, spec view) never block. Gateway is OUT of
   scope: no bot-loader exists in production, no clean hook — the bot simply keeps
   whatever Discord state it has; the honest copy says "paused", and the gateway
   catch-up is a named follow-up (KI follow-up below), not this wave.
5. **No sleep job, no cron, no scheduler.** Expiry is checked inline at request time
   (`trial_ends_at < now()`), lazily. No background process is built in this wave.
6. **Status quo `tier` column untouched** (no writes, no CHECK, no removal). Only
   `trial_ends_at` is added. `builder-runs.ts:170` stale comment gets fixed
   (one line) by whoever touches that file.
7. **Privacy page present-tense nap line (`privacy:137-138`) is CORRECT AS-IS** under
   enforcement and stays. The "not enforced yet" disclaimers flip to present tense
   (copy locks below).

## Ground truth (inventory `ki033-inventory-trial`, verified read-only this session)

- Migrations live in `apps/gateway/drizzle/`, applied by hand in number order
  (`infra/RUNBOOK.md:155-157`). NO `apps/web/drizzle`, NO drizzle config.
- `accounts` columns today: `id` uuid PK, `discord_id` UNIQUE, `email`, `creem_id`,
  `credits` (never read as balance), `created_at` (stable signup stamp),
  `tier` (default `'trial'`, no CHECK; nothing in product writes it).
- Single product INSERT: `apps/web/lib/auth/session.ts:100-102`
  (`upsertAccountByDiscordId`; sets discord_id + email only). Caller
  `handleOAuthCallback` (`session.ts:504`) from `api/auth/callback/route.ts`.
  Memory double `AccountRow` (`session.ts:25-32`) has NO tier field.
- `checkBudget` (`packages/ai/src/budget.ts:106-133`) is the only budget gate;
  trial→100/mo, pro→2000, studio→6000, scale→20000. Builder pre-check at
  `apps/gateway/src/db/builder-runs.ts:598-607` (budget_exceeded → failed, zero calls).
  `createAccountsTierResolver` (`apps/gateway/src/db/tier-resolver.ts:19-33`)
  consumed ONLY there; sole caller `apps/gateway/src/start.ts:215`.
  Web can import `checkBudget` with no new dep (`@corvus/ai` already a web dep).
- Chat `apps/web/app/api/chat/route.ts` (POST `:193-261`): NO budget check, NO tier
  read, NO bot ownership check. Spend recorded after stream (`recordChatSpend :164-191`).
- Mint entry points (THREE — cap all three or the cap is bypassable):
  `apps/web/app/api/bots/route.ts:91-128` (POST), `apps/web/app/api/interview/start/route.ts:67-72`,
  `apps/web/app/api/templates/[slug]/fork/route.ts:157-162`. NO `COUNT(*)` anywhere
  in `apps/web` today. Ownership idiom to mirror:
  `SELECT 1 FROM bots WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL`
  (`activity/route.ts:256`).
- Gateway: `boot()` loads NO bots; `addBot`/`startAll` account-blind, no production
  caller for `startAll`. OUT of scope (ruling 4) — report only.
- Test pattern: real PG, probe → skip, sibling migrations via file URL, FALLBACK_DDL,
  self-heal `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (`activity/route.test.ts:129-146`).
  A NEW accounts column needs: (a) forward-only `0010_*.sql`, (b) entries in every
  web FALLBACK_DDL, (c) self-heal ALTER in web suites. `tier` is already in all
  three fallbacks. Custom `created_at` for bots already demonstrated
  (`bots/route.test.ts:117-121`).

## Shared copy locks (exact — every agent uses these verbatim)

- EXPIRED BLOCK MESSAGE (API + UI): `Your 3-day trial ended — your bots are paused. Nothing is deleted.`
- TRIAL ACTIVE (replaces `TRIAL_DEAL`'s old string — see agent B scope):
  `TRIAL_DEAL = 'Free 3-day trial — 1 bot, 100 AI credits.'`
- LANDING FAQ nap answer (`page.tsx:46`) → `When your trial ends, your bots pause and stay as-is — nothing is deleted.`
- LANDING credits FAQ (`page.tsx:54`): drop `(not enforced yet)`, keep `Planned: ` prefix
  ONLY where the number is still a plan; the 100-credit trial allowance is now real,
  so the trial credit line states the lock above.
- LANDING hero/Starter sub-note (`page.tsx:218-220`, `:741-743`) →
  `Free 3-day trial — 1 bot, 100 AI credits, no card required.`
- LANDING Starter desc (`page.tsx:710-714`) → `Prices and limits are planned — the trial (1 bot, 100 AI credits) is enforced.`
- TERMS planned labels stay (`Planned: Trial:` etc. — the trial is now real but plans
  still aren't sold; agent E rewords minimally: `Trial (live):` for the trial line
  ONLY, everything else keeps `Planned:`).
- PRIVACY `:137-138` stays byte-identical (ruling 7).
- DASHBOARD expired banner (new, agent B): `Your 3-day trial ended — your bots are paused. Nothing is deleted.`
- `demo/*`, `pryzm/*` (parked), interview/pick copy: OUT of scope, do not touch.

## Decomposition (4 agents, disjoint write-scopes — ORDER MATTERS, see below)

| Agent   | Owns (MODIFY only these)                                                                                                                                                                                                                                                                                                                                                   | Report                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ki033-a | `apps/gateway/drizzle/0010_accounts_trial_ends.sql` (CREATE), `apps/web/lib/auth/session.ts`, `apps/web/lib/auth/session-db.test.ts` (if exists, else the closest auth test it finds — it must NOT create new test files outside its scope; new tests go in the existing file)                                                                                             | `Docs/2026-09-19-2211_ki033-a_CREATE_trial-clock.md`  |
| ki033-b | `apps/web/app/api/bots/route.ts`, `apps/web/app/api/bots/route.test.ts`, `apps/web/app/api/interview/start/route.ts`, `apps/web/app/api/interview/interview.test.ts`, `apps/web/app/api/templates/[slug]/fork/route.ts`, `apps/web/app/api/templates/templates.test.ts`, `apps/web/lib/bots.ts`, `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/page.test.tsx` | `Docs/2026-09-19-2211_ki033-b_MODIFY_mint-cap.md`     |
| ki033-c | `apps/web/app/api/chat/route.ts`, `apps/web/app/api/chat/route.test.ts`, `apps/web/app/api/builder/start/route.ts`, `apps/web/app/api/builder/start/route.test.ts` (if exists; else no test file), `apps/gateway/src/db/builder-runs.ts` (ONE-LINE stale-comment fix ONLY at :170 — no logic change), `apps/web/app/page.tsx`, `apps/web/app/page.test.tsx`                | `Docs/2026-09-19-2211_ki033-c_MODIFY_spend-gate.md`   |
| ki033-d | `apps/web/app/terms/page.tsx`, `apps/web/app/terms/page.test.tsx`, `apps/web/app/privacy/page.tsx` (ONLY if a change is needed — default: no change, report says so), `apps/web/app/dashboard/bots/[id]/page.tsx`, `apps/web/app/dashboard/bots/[id]/page.test.tsx`, `apps/web/app/dashboard/new/page.tsx`, `apps/web/app/dashboard/new/page.test.tsx`                     | `Docs/2026-09-19-2211_ki033-d_MODIFY_legal-detail.md` |

## Order + dependency (NOT all-parallel — the clock ships first)

1. **Run ki033-a ALONE first** (migration + `trial_ends_at` writer + `isTrialExpired`
   helper export). It defines the contract every sibling consumes:
   `isTrialExpired(account: { trial_ends_at: Date | string | null }): boolean`
   (null = no clock = NOT expired — fail-open for grandfathered-in-flight rows),
   exported from `apps/web/lib/auth/session.ts` (or a tiny new module
   `apps/web/lib/trial.ts` ONLY if session.ts cannot host it — agent's call, report it).
2. **Then run ki033-b + ki033-c + ki033-d IN PARALLEL** (disjoint scopes, shared
   contract: the `isTrialExpired` helper + `trial_ends_at` column + copy locks above).
   Each whitelists ONLY the spec + ki033-a's report. If ki033-a FAILS, stop the wave
   and escalate — do not run b/c/d on a missing contract.

## Cross-agent contracts (source of truth on mismatch — the SPEC wins)

1. `trial_ends_at` column name, type (timestamptz, nullable), and semantics
   (null = not expired) are locked by this spec. Every consumer uses the helper —
   NOBODY hand-rolls `new Date(...) < ...` comparisons.
2. Mint-cap shape (all three entry points, identical): count live bots
   (`WHERE account_id=$1 AND deleted_at IS NULL`) → if count >= 1 AND tier is
   trial (or tier unknown/null → treat as trial) → `403 { error: 'trial_bot_limit' }`
   with the EXPIRED/ACTIVE message as appropriate. If `trial_ends_at` passed → `403
{ error: 'trial_expired' }` regardless of count. Paid tiers (`pro|studio|scale`)
   bypass BOTH checks (no cap, no clock) — the tiers don't exist yet, but the
   bypass must be coded so the gate doesn't become a wall later.
3. Chat/builder-start gate: `trial_expired` → refuse BEFORE any model call
   (chat: `403 { error: 'trial_expired' }` JSON, not SSE; builder-start: same 403
   before queueing). Plus wire `checkBudget` into the chat path (monthly 100
   allowance via existing `loadSpentCredits`-equivalent read — agent's design,
   report it). Builder worker logic itself is UNTOUCHED (only the :170 comment fix).
4. Copy locks above are byte-level law. Grammar misfit → STOP + escalate via
   Open Questions, never improvise.
5. NO agent touches gateway runtime (except the one-line comment), `demo/*`,
   `pryzm/*`, `interview/*`, `pick/*`, manifests, lockfiles, `.env*`, box files.
   No installs, no migrations run against real data, no git commands, no network,
   no secrets. Tests asserting old "not enforced yet" copy MUST be updated to the
   locks (in-scope test work). Max 2 attempts per failing command, then PARTIAL.

## Gates per agent (project's real commands from repo root)

- `npx tsc --noEmit -p apps/web/tsconfig.json` clean (ki033-a/b/c/d); gateway files:
  agent touching `builder-runs.ts` comment also runs the gateway typecheck the repo
  actually has (discover from package.json scripts — never assume).
- `eslint --max-warnings 0` on owned files. `prettier --check` (then `--write` if
  needed) on owned files.
- Owned vitest files green via `npx vitest run --config apps/web/vitest.config.mjs`.
  New-column tests must include: grandfathered NULL clock (fail-open), expired clock
  blocks, active clock passes, paid-tier bypass.

## Stop rules

- ki033-a first, alone. b/c/d parallel only after a's SUCCESS report exists on disk.
- Reviewer gate per task (fresh agent, clean context) before DONE. Max 3 fix→review
  loops per task, then escalate.
- New follow-up to file (not this wave): gateway-side pause + real sleep/napping
  state + billing/paywall when checkout exists. Name it KI-035 in the close-out.

## Timestamp for reports

`2026-09-19-2211` (passed into prompts so filenames order correctly).
