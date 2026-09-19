# Task Report: ki033-c-spend-gate

## Status

SUCCESS (with one named gap — see Known Limitations: the builder-start route's
clock check has no tier bypass, because neither the route's session type nor the
production reader carries a tier field; the full bypass is coded in chat)

## Files Touched

- MODIFIED: `apps/web/app/api/chat/route.ts`
- MODIFIED: `apps/web/app/api/chat/route.test.ts`
- MODIFIED: `apps/web/app/api/builder/start/route.ts`
- MODIFIED: `apps/web/app/api/builder/start/route.test.ts` (existed — see the
  note below)
- MODIFIED: `apps/gateway/src/db/builder-runs.ts` (ONE line, comment text only)
- MODIFIED: `apps/web/app/page.tsx`
- MODIFIED: `apps/web/app/page.test.tsx`
- CREATED: `Docs/2026-09-19-2211_ki033-c_MODIFY_spend-gate.md` (this report)

`apps/web/app/api/builder/start/route.test.ts` **already existed** (16.7 KB), so
it was extended rather than created — no new test file was invented.

## Dependencies Added

None. `checkBudget` / `isPlanTier` / `PlanTier` come from `@corvus/ai`, already a
web dependency and already built (`packages/ai/dist`).

## What was built

### 1. `apps/web/app/api/chat/route.ts` — clock gate, then allowance gate

**`ChatSession` extended** with two optional fields:

- `trialEndsAt?: Date | string | null` — populated through the existing session
  reader path (`lib/interview/session-bind` → `lib/auth/session.getSession` →
  `SessionInfo.trialEndsAt`, the contract ki033-a exported). No second query.
- `tier?: string | null` — the tier behind the allowance. **No session store
  selects this column today** (verified: `PgSessionStore.findSessionWithAccount`
  selects `a.trial_ends_at` only), so it is `undefined` in production and every
  account resolves to the trial allowance. It exists so the paid bypass is coded
  and testable now rather than becoming a wall later.

**POST order of operations (each step's position is deliberate):**

1. `401` when unauthenticated (unchanged).
2. **`403 { error: 'trial_expired', message: <locked sentence> }`** when the
   account is on trial AND `isTrialExpired({ trial_ends_at: session.trialEndsAt })`.
   Sits **before body parsing** on purpose: an expired account must not be able
   to mask its expiry as a `422`, and a malformed body must not be able to run
   ahead of the refusal. Plain JSON, never SSE — this is a status the client
   branches on, not a frame inside an open stream.
3. `422` body validation (unchanged).
4. `500 'AI is not configured yet'` when no persona key exists (unchanged).
5. **`checkBudget({ accountId, estimatedCredits: PERSONA_CALL_CREDITS,
getSpent: () => loadSpentCredits(session.accountId), tier })`** — the monthly
   trial allowance. On `!ok`, **`403 { error: 'trial_budget_exceeded', message }`**
   before the `ReadableStream` is constructed, so a refused turn makes **zero
   model calls and writes zero ledger rows**.
6. Spend recording after the stream is **byte-identical**; `PERSONA_MAX_TOKENS`
   is unchanged at 1024.

**Design decisions, reported as required:**

- **Estimated cost per persona call** = `PERSONA_MAX_TOKENS / 1e6 *
(0.5 / USD_PER_CREDIT)` = **0.1024 credits** — the exact shape the builder
  worker uses (`remainingAttempts * BUILDER_CALL_CREDITS`), ported to the
  persona lane: the most expensive persona route is wiro `xai/grok-4-1-fast` at
  $0.50/1M output tokens (`lanes.ts`), and `USD_PER_CREDIT` comes from the shared
  meter — no credit count is hardcoded in the route.
- **The spend read** is the same arithmetic as the worker's `SPENT_CREDITS_SQL`
  (`COALESCE(SUM(credits), 0)` scoped to `date_trunc('month', now())`), and the
  same string→number parse (`readSpentCredits`). A malformed SUM becomes `NaN`,
  and `checkBudget` throws on it — a silent `0` would reset an exhausted month.
- **`checkBudget` throwing is a `500`, never a pass and never a refusal.** A DB
  misconfiguration maps through the shared `mapDbError` to `database not
configured`; anything else logs and answers `could not check your AI credits`.
  Check order is "allowance second, after the provider check", so the
  pre-existing `AI is not configured yet` behavior is preserved exactly.
- **Budget-refusal wording is tier-aware.** The trial branch returns the locked
  count verbatim (`Your 3-day trial has used its 100 AI credits for this month.
Nothing is deleted.`). The paid branch takes the allowance the meter actually
  resolved — naming a paid number would be an invented one, since no paid
  allowance is granted yet.

**Message shape on refusals (reported exactly, per the acceptance criteria):**

| Case                    | Status + body                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Expired trial           | `403 {"error":"trial_expired","message":"Your 3-day trial ended — your bots are paused. Nothing is deleted."}`                       |
| Over allowance (trial)  | `403 {"error":"trial_budget_exceeded","message":"Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted."}` |
| Allowance read failed   | `500 {"error":"database not configured"}` or `500 {"error":"could not check your AI credits"}`                                       |
| All pre-existing errors | identical to before (`{ error: <code> }`, no `message`)                                                                              |

The `message` key is additive: every response that existed before this task has
exactly the same body it had, and a suite assertion over all of them still passes.

### 2. `apps/web/app/api/builder/start/route.ts` — clock gate before queueing

`403 { error: 'trial_expired', message: <locked sentence> }` immediately after
the `401` check and **before** body validation, the ownership read, the
`builder_runs` INSERT and the pg-boss send — so an expired account leaves no
row to poll and no job for the worker to pick up. Verified by test: `db.calls`
length 0, `db.runs.size` 0, `boss.record.sent` length 0.

The gateway worker is untouched (comment line only). The monthly allowance is
deliberately **not** duplicated here: the worker already refuses before its first
billable call (`builder-runs.ts:598-607`), and a second gate on the same ledger
would be a second place to get the arithmetic wrong.

### 3. `apps/gateway/src/db/builder-runs.ts` — one-line comment fix

`git diff --stat` for that file is exactly `1 file changed, 1 insertion(+),
1 deletion(-)`:

```
- * does not exist yet (accounts has no `tier` column in the current migrations).
+ * does not exist yet (accounts HAS a `tier` column since migration 0008, default 'trial').
```

`0008_accounts_tier.sql` is the cited source: `ALTER TABLE "accounts" ADD COLUMN
IF NOT EXISTS "tier" text NOT NULL DEFAULT 'trial'`. **No other line in that file
changed**, and `tsc --noEmit -p apps/gateway/tsconfig.json` is clean.

### 4. `apps/web/app/page.tsx` — copy flips (byte-level)

| Site                           | New string                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAQ nap answer (:46)           | `When your trial ends, your bots pause and stay as-is — nothing is deleted.`                                                                             |
| Credits FAQ (:54)              | `(not enforced yet)` dropped; leading `Planned: ` dropped from a now-real trial allowance and replaced with `The trial includes 100 credits for 3 days;` |
| Hero sub-note (:218-220)       | `Free 3-day trial — 1 bot, 100 AI credits, no card required.`                                                                                            |
| Starter sub-note (:741-743)    | same string                                                                                                                                              |
| Starter description (:710-714) | `Prices and limits are planned — the trial (1 bot, 100 AI credits) is enforced.`                                                                         |

Nothing else on the landing page changed (`3 insertions, 3 deletions` plus the
FAQ one-liners). The KI-030 locks this task was told to preserve are intact:
`Planned:` prefixes on still-planned limits, `Prices and limits are planned` on
the pricing lede and the Pro card, the `$10` / `$29` figures, the `coming soon`
buttons, the template/testimonial sections and the community block.

## Tests

Owned suites: **53 passed / 53** (`chat/route.test.ts` 28, `builder/start/route.test.ts`
18, `page.test.tsx` 7) — no skips in the hermetic blocks.

New coverage, mapped to the acceptance criteria:

- expired session injected as `trialEndsAt: new Date(Date.now() - 1)` → chat `403
trial_expired` with the locked message, `chatStreamMock` never called, zero pool
  writes; builder-start `403` with `db.calls` 0 / `runs.size` 0 / `sent` 0.
- active trial passes both routes.
- **NULL clock fail-open** — chat: both `undefined` and explicit `null`; builder-start:
  `undefined` (the real production reader's shape) and explicit `null`.
- **paid-tier bypass** — chat: an _expired_ clock on `tier: 'pro'` still runs;
  `tier: 'trial'` and an unknown `tier: 'platinum'` do not bypass (the
  unknown-tier-is-trial rule).
- **budget over → refused pre-model** — chat: `spent: '99.99'` (0.1024 estimate
  pushes it over) → `403 trial_budget_exceeded`, correct message, no call, no
  insert; plus a boundary test (landing exactly on the allowance is allowed) and
  a failing-read test (`500`, no call, logged).
- clock is checked **before** the body on both routes (a malformed request cannot
  mask an expired trial).
- builder-start fails closed (`401`) when the session read itself throws.
- landing tests updated to the locked strings, including a negative assertion
  that `/not enforced yet/i` appears nowhere.

**Guard proof (LESSONS: "a guard is not a guard until you have broken the thing
it guards and watched it fail").** Three guards were broken deliberately and
watched to fail, then restored and re-verified green:

1. chat trial gate short-circuited to `false` → 2 tests failed as intended.
2. builder-start trial gate short-circuited to `false` → 2 tests failed as intended.
3. landing FAQ answer reverted to the old string → 2 tests failed as intended
   (the text assertion and the `not enforced yet` negative).

## Gates (all from repo root)

- `npx tsc --noEmit -p apps/web/tsconfig.json` → **exit 0**
- `npx tsc --noEmit -p apps/gateway/tsconfig.json` → **exit 0** (the repo's real
  gateway typecheck: `apps/gateway/package.json` has `"typecheck": "tsc --noEmit"`)
- `npx eslint --max-warnings 0 <all 7 owned files>` → **exit 0**
- `npx prettier --check <all 7 owned files>` → **All matched files use Prettier code style**
- `npx vitest run --config apps/web/vitest.config.mjs <3 owned suites>` → **53 passed**
- Full web suite → **914 passed, 1 failed, 62 skipped, 4 file-level collection
  errors**. Those 4 are **PRE-EXISTING and unrelated**: I stashed my changes and
  re-ran the same four files on the clean tree, and they fail identically
  (`apps/gateway/src/launch-blockers.test.ts`, `apps/gateway/src/db/guilds.test.ts`,
  `apps/web/app/pryzm/page.test.tsx` — a vitest-3 `import.meta.url` path issue —
  and `apps/gateway/src/start.test.ts`). None reference the files this task owns.
  (Note: that stash was `push`/`pop` of my own paths only; no `checkout --`,
  `restore` or `reset` was run, so no other agent's uncommitted work was touched.)

## Assumptions Made

- **`ChatSession.tier` is optional and unpopulated in production.** The column
  exists (0008) but no store selects it, so the paid bypass is reachable by tests
  only. Reported rather than silently widened: wiring `tier` through
  `findSessionWithAccount` is a one-line change in `lib/auth/session.ts`, a file
  **outside my write scope** (ki033-a owns it).
- **The locked EXPIRED sentence rides the `trial_expired` response as
  `message`.** The SPEC describes the sentence as the "EXPIRED BLOCK MESSAGE (API
  - UI)" and as what "the honest copy says"; the value of `error` is specified
    separately and exactly (`trial_expired`), so the sentence goes in the additive
    field rather than replacing the code.
- **The budget refusal's message is tier-branching**, because the SPEC's lock is
  written for an expired trial and the over-allowance case includes accounts
  whose clock has not passed. Flagged for review: if the orchestrator wants the
  EXPIRED sentence used for _every_ over-allowance refusal, that is a two-line
  change in `budgetRefusalMessage`.
- **`PERSONA_MAX_OUTPUT_USD_PER_MTOKEN = 0.5`** is read from `lanes.ts`'s
  documented persona prices (wiro `xai/grok-4-1-fast`, $0.20/$0.50). The SPEC
  left the estimate to me and required that I report it.
- **Prettier normalized the FAQ lines' `—` escapes to literal em dashes**
  (printWidth 100, `singleQuote`). Existing `’` escapes elsewhere on the
  page are untouched. Rendered output is byte-identical either way; noted because
  the copy locks are described as byte-level.
- **`BuilderSession` is declared locally in the start route**, extending
  `InterviewSession` with the optional `trialEndsAt`, rather than editing
  `lib/interview/session-bind.ts` (shared with ~15 routes, outside my scope). The
  production reader still satisfies the wider type.

## Open Questions for Orchestrator

1. **The builder-start route's clock check has no tier bypass.** Its session
   type is `lib/interview/session-bind`'s `InterviewSession`, which declares only
   `accountId`/`discordId`, and the production reader is shared by ~15 routes — so
   adding `tier` there is a cross-route change I did not make unilaterally. Today
   that is harmless (`tier` is unpopulated everywhere, so a paid account is still
   tier-blind on every surface), but **when billing ships, builder-start must
   learn the tier or a paid account with a stale clock will be blocked from
   queueing builds.** Recommended follow-up: add `tier` to
   `findSessionWithAccount` + `SessionInfo` + `InterviewSession` in one change.
2. **`tier` is never selected from the database by any web store.** So
   `session.tier` is `undefined` at runtime and `paidTier`/`onTrial` resolve every
   production account to trial. The bypass is coded and tested, not live. Same
   one-line fix as above.
3. **The `100` in the budget-refusal sentence is a SPEC literal**, not read from
   `MONTHLY_GRANTS.trial`. If the trial allowance is ever re-tuned in
   `packages/ai/src/budget.ts`, this string must move with it. Flagged rather
   than coupled, because the SPEC describes both the count and the sentence as
   locked copy.
4. **`ai_spend` writes happen after the stream, so the ledger lags the turn.** A
   burst of turns in flight can each pass a gate that the first one has not yet
   billed — the monthly allowance is a soft ceiling under concurrency, exactly as
   it already is for the builder worker's pre-check. Not a regression, but worth
   naming in the KI-033 close-out.
5. **The chat route still performs no bot-ownership check** (pre-existing, named
   in the SPEC's ground truth, outside this task's scope).

## Public Interface Exposed

```ts
// apps/web/app/api/chat/route.ts
export interface ChatSession {
  accountId: string;
  discordId: string;
  trialEndsAt?: Date | string | null; // NEW (optional — readers without a clock still fit)
  tier?: string | null; // NEW (optional — unpopulated in production today)
}

// apps/web/app/api/builder/start/route.ts
export interface BuilderSession extends InterviewSession {
  // NEW
  trialEndsAt?: Date | string | null;
}
export interface BuilderSessionReader {
  // NEW
  getSession(req: Request): Promise<BuilderSession | null>;
}
// __setSessionReader(reader: BuilderSessionReader) — widened; existing
// SessionReader-shaped fakes still satisfy it (structural typing).
```

HTTP contract changes (additive only):

- `POST /api/chat` — new `403 trial_expired`, `403 trial_budget_exceeded`,
  `500 could not check your AI credits`, `500 database not configured` in front
  of the stream. Statuses and can-it-reach-the-model behavior for every
  pre-existing path are unchanged.
- `POST /api/builder/start` — new `403 trial_expired` after the `401`.
- `POST /api/chat` success responses: unchanged (same SSE frames, same
  post-stream ledger write, same `PERSONA_MAX_TOKENS`).

## Known Limitations

- The builder-start gate is clock-only (see Open Question 1 for why, and for the
  exact follow-up).
- The tier bypass cannot be exercised against a real session today — no store
  selects `tier`. It is proven by injected-session tests only.
- The builder-start live-PG test **skips loudly** on this machine (no Postgres on
  5432/5434, Docker not running) — that skip is pre-existing and unmodified; the
  route's own new tests are all hermetic and ran.
- No test here exercises a real provider or a real database. "Done" for the
  end-to-end flow (a signed-in expired account seeing the 403 in the running app)
  still needs a human on a machine with the test DB and a migrated `accounts`
  table — the same gap ki033-a flagged.
- The gateway worker's own budget behavior was not touched, so the worker's
  existing tests were not run as part of this task beyond the gateway typecheck.
- `apps/web/lib/bots.ts`'s `TRIAL_DEAL` (the dashboard's trial line) is **not**
  mine — ki033-b owns that file, and it still carries the pre-KI-033 string.
  Landing copy here is consistent with the SPEC locks; dashboard consistency is
  b's deliverable.
