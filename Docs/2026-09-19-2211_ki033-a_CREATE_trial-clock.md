# Task Report: ki033-a-trial-clock

## Status

SUCCESS (with one named gap — see Known Limitations: the DB-backed half of the
new tests could not be EXECUTED in this environment)

## Files Touched

- CREATED: `apps/gateway/drizzle/0010_accounts_trial_ends.sql`
- CREATED: `apps/web/lib/trial.ts`
- MODIFIED: `apps/web/lib/auth/session.ts`
- MODIFIED: `apps/web/lib/auth/session-db.test.ts`

`Number 0010 was FREE` — the drizzle dir listing showed `0001`..`0009` only, so
no renumbering was needed.

## Dependencies Added

None.

## PUBLIC INTERFACE EXPOSED — THIS IS THE CONTRACT FOR AGENTS b/c/d

### 1. The helper — exact signature

```ts
// DEFINED in apps/web/lib/trial.ts (runtime-agnostic: no `pg`, no Node builtins)
// RE-EXPORTED from apps/web/lib/auth/session.ts — BOTH import paths work.
export function isTrialExpired(
  account: { trial_ends_at?: Date | string | null } | null | undefined,
  now: Date | number = Date.now(), // optional, injectable for tests
): boolean;
```

- Returns `true` ONLY when the value parses AND is `<= now` (boundary inclusive).
- `null` / `undefined` / `''` / unparseable → `false` (FAIL-OPEN). Locked by SPEC.
- Accepts `Date` and ISO `string` interchangeably — callers never convert.
- Accepts the whole account row (`isTrialExpired(account)`) — pass your row
  straight in; do not destructure.
- **Nobody hand-rolls `new Date(a) < new Date(b)`.** This is the single definition.

```ts
import { isTrialExpired } from '@/lib/auth/session'; // or '@/lib/trial'
// or the relative form the routes already use: '../../../../lib/auth/session'
```

### 2. The column — exact name / type / semantics

- Name: **`trial_ends_at`** (snake_case, on table `accounts`)
- Type: **`timestamptz`, NULLABLE** (no default, no NOT NULL, no index)
- Semantics: `NULL` = no clock = **NOT expired** (fail-open). Non-null = the
  instant the trial ends; `trial_ends_at <= now()` = expired.
- Written by `upsertAccountByDiscordId` **on INSERT only**:
  `now() + interval '3 days'`. The `ON CONFLICT DO UPDATE` branch does NOT
  mention the column — **re-login never extends the trial**.
- Grandfathering (migration `0010`): every pre-existing row gets a fresh
  `now() + interval '3 days'` from deploy time. `created_at` is untouched.
- `apps/web/lib/auth/session.ts` returns it on `AccountRow.trial_ends_at`
  (`string | Date | null | undefined`).
- **No tier logic in this task.** `tier` is untouched; the paid-tier bypass is
  b/c/d's job.

### 3. The session field — exact name

- **`SessionInfo.trialEndsAt: Date | string | null | undefined`** (camelCase —
  this is the TS session object, not the DB row). Returned by `getSession(...)`.
- `FoundSession.trialEndsAt: Date | string | null | undefined` — **required key**
  (a new `SessionStore` implementation that omits it is a compile error). The
  VALUE may be `undefined`: `null` = the DB was asked and answered "no clock";
  `undefined` = the store has no clock concept. Both read as not expired.
- The `getSession` join (`findSessionWithAccount`) selects `a.trial_ends_at`, so
  **a route needs no second query** — read `session.trialEndsAt` and pass it to
  the helper.
- To express "expired" in a route test without a DB: inject a `SessionReader`
  returning `{ accountId, discordId, trialEndsAt: new Date(Date.now() - 1) }`.
  `ChatSession` (chat route) does **not** yet carry the field — c owns that file.

## Gates (all run from repo root)

- `npx tsc --noEmit -p apps/web/tsconfig.json` → **exit 0, clean**
- `npx eslint --max-warnings 0` on the three owned TS files → **exit 0, clean**
- `npx prettier --check` on the three owned TS files → **clean**
  (the `.sql` file is left unformatted deliberately: prettier has no SQL parser
  here and migrations are not in the format pipeline — reported, not guessed)
- `npx vitest run --config apps/web/vitest.config.mjs apps/web/lib/auth/session-db.test.ts`
  → **21 passed**
- Full web suite → **875 passed, 1 failed, 50 skipped**. The single failure and
  the 3 file-level collection errors (`apps/gateway/src/launch-blockers.test.ts`,
  `apps/gateway/src/db/guilds.test.ts`, `apps/web/app/pryzm/page.test.tsx`,
  `apps/gateway/src/start.test.ts`) are **PRE-EXISTING and unrelated** — I
  verified by stashing my changes and re-running: the same 4 files fail
  identically on the clean tree (`The URL must be of scheme file` / `ENOENT`,
  a vitest-3 `import.meta.url` path issue). None of them reference
  `isTrialExpired`, `trial_ends_at`, or `auth/session`.

## Guard proof (LESSONS "a guard is not a guard until you have broken the thing")

Both new non-DB guards were broken deliberately and watched to fail:

1. Added `trial_ends_at = EXCLUDED.trial_ends_at` to the `DO UPDATE` list
   → the ON-CONFLICT guard FAILED as intended. Restored.
2. Deleted the migration's backfill `UPDATE` line
   → the grandfathering guard FAILED as intended. Restored (migration verified
   byte-intact afterwards).

## Assumptions Made

- `0010` was free (verified by listing; `0001`..`0009` present).
- The migration intentionally has **no column `DEFAULT`**: a default would
  re-arm the trial on every future row and move the "never extend" guarantee out
  of the statement that owns it. Documented in the migration comment.
- `isTrialExpired` lives in `apps/web/lib/trial.ts` and is re-exported from
  `session.ts`, so both import paths work. Reason: keeps the predicate importable
  by the named gateway follow-up without pulling in `pg`/session internals, while
  b/c/d keep the SPEC's `from session.ts` import unchanged. **Flagged for review.**
- `FoundSession.trialEndsAt` is a required key whose value may be `undefined`
  (see contract §3). This was chosen over coercing to `null` because coercion
  broke three pre-existing exact-shape assertions in `auth.test.ts` — a file
  **outside my write scope** — and because `null` ("asked, none") and
  `undefined` ("no clock concept") are genuinely different facts.
- The memory double's `AccountRow` stays clock-less (**type-only compat**, as
  ordered). It deliberately does NOT mint `now() + 3 days`: this store shares its
  injectable `now()` with tests that seed accounts in the past, so a derived
  clock would come out already-expired and silently change those tests.
- The 3 real regressions I introduced (session-object shape) were fixed in
  `session.ts`/my own test file only, never by editing another agent's file.

## Open Questions for Orchestrator

1. **`apps/web/lib/auth/auth.test.ts` is NOT in my write scope, and the 3
   exact-shape `getSession` assertions there now pass only because
   `SessionInfo.trialEndsAt` is OPTIONAL and my stores propagate `undefined`
   rather than coercing to `null`.** If you would prefer a REQUIRED
   `SessionInfo.trialEndsAt` (a stronger contract), that file needs three
   assertions updated (`:321`, `:332`, `:411`) — please assign it explicitly;
   I did not touch it.
2. **The DB-backed half of the trial-clock tests COULD NOT RUN here** — no
   Postgres on 5432/5434, Docker daemon not running, no `psql`. The 5 DB-backed
   assertions (3-day stamp window, re-login does not move the clock, NULL
   fail-open, expired-blocks/active-passes, clock through `getSession`) are
   written and self-skipping but are UNVERIFIED BY EXECUTION. **They must be run
   on a machine with the test database before this wave is called done** — the
   full suite reported `50 skipped`, and a skip looks identical to a pass.
   I compensated with the no-DB SQL-shape + migration-file blocks (6 assertions,
   run everywhere, both proven to fail when broken), but that is not a substitute.
3. `app/api/auth/callback/route.ts` constructs `PgSessionStore` directly and is
   the production INSERT path — no change needed, but it is the file to check
   when verifying the clock end-to-end on a real deploy.

## Known Limitations

- Does NOT gate anything. It creates the clock and the predicate only; the
  mint cap (b), the chat/builder-start gate (c), and the copy work (d) are
  other agents' scope.
- No tier logic, no `checkBudget` wiring, no gateway change (per SPEC ruling 4/6).
- No index on `trial_ends_at` — none is needed yet; expiry is read per-session
  from a row already fetched by primary key, never scanned.
- `ChatSession` (chat route) does not carry `trialEndsAt`; c extends it.
- The migration must be applied BY HAND in number order
  (`infra/RUNBOOK.md:155-157`). It was NOT run against any database.
- Web test suites other than the one I own still need the self-heal
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz` line
  added to their setup; b, c and d each own the suites they touch. I added it to
  `session-db.test.ts` only.
