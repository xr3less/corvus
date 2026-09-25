# Task Report: budget-90day-boundary

## Status
SUCCESS

## Files Touched
- MODIFIED: `C:\Users\xr3less\Desktop\corvus\packages\ai\src\budget.test.ts` (appended one
  `describe('refill window boundary — $5 / 1,000 credits / 90 days')` block, 9 cases; +275/-1 lines.
  The only content-bearing edit in this task.)
- CREATED: `C:\Users\xr3less\Desktop\corvus\Agent Reports\2026-09-23-2014_budget-90day_CREATE_refill-boundary.md` (this report)
- DELETED: none
- **PRODUCTION SOURCE: NOT TOUCHED.** `packages/ai/src/budget.ts` is byte-identical to its
  pre-task state (sha1 `f1d7667010e1993c6f0017077cddc4ae8a7983c3`, verified by `sha1sum -c` after
  every mutation restore and once more at the end). Its mtime moved only because mutation testing
  wrote to it and restored it; content is unchanged, so it will not appear in a content diff.

## Dependencies Added
None. No manifest, lockfile, or config was edited; no install was run.

## Assumptions Made
- **The 90-day window is SQL-resident, so "89/91-day boundary" is pinned at the SQL-text level plus a
  modelled predicate — not by executing Postgres.** `refillAllowance()` issues
  `REFILL_CREDITS_SQL` verbatim and applies a pure read rule (`> 0` keeps, else 0), so boundary
  truth for the window lives in the SQL predicate, not in JS. The suite therefore (a) pins the
  predicate text exactly and (b) drives the real `refillAllowance`/`checkBudget` through a fake pool
  whose fixture models the shipped predicate, so a drifted window loses the on-the-boundary row. A
  live-Postgres leg would be strictly better proof but is outside this task's file scope (the
  in-repo precedent, `apps/gateway/src/db/__tests__/0011-billing.test.ts`, needs `pg` + a scratch
  schema and would have required touching another package). **Recorded as a named residual gap, not
  faked green.**
- The window is asserted as an exact instant interval: `credit_ledger.created_at` is `timestamptz`
  (`apps/gateway/drizzle/0011_credit_ledger_subscriptions.sql:45`) and `interval '90 days'` carries
  no month component, so it is exactly 90 × 24h — no calendar or DST truncation. Source:
  PostgreSQL 18 §9.9, Table 9.32 (`https://www.postgresql.org/docs/current/functions-datetime.html`).
- The reported count is `89` days inside vs `91` days outside. The exactly-90d case is asserted as
  **COUNTED**, because the shipped operator is `>=` (half-open lower bound, inclusive at the
  boundary) — documented as built, not as wished.
- Two assertions inside the new block are intentional duplicate pins of existing behaviour
  (`REFILL_WINDOW_DAYS === 90`, `REFILL_REASON === 'refill'`) so this block names the whole pricing
  promise in one place rather than depending on an earlier describe's assertions still existing.

## Open Questions for Orchestrator
1. **The window constant does not govern the SQL — this is the root risk the task asked me to
   pin, and I can only surface it, not fix it (it needs a production-source change, outside my
   scope).** `REFILL_WINDOW_DAYS = 90` (`packages/ai/src/budget.ts:53`) is never interpolated;
   `REFILL_CREDITS_SQL` hardcodes `interval '90 days'` (`packages/ai/src/budget.ts:63`). The AC
   asked for the window to be "imported from prod (no hardcoded duplicate that drifts)", but no
   import can achieve that here because the SQL is a frozen string literal. My drift-guard test
   (`expect(REFILL_CREDITS_SQL).toContain(`interval '${REFILL_WINDOW_DAYS} days'`)`) is the
   interim substitute: either literal drifting now goes red. **Fix requires a prod edit** — make the
   window a bound `$3` parameter (`... created_at >= now() - ($3 || ' days')::interval`) or
   interpolate the constant once at module load. Recommend raising as a scoped follow-up.
2. **The window is duplicated four times, and only one copy is now guarded.**
   `packages/ai/src/budget.ts:53,63`; `apps/web/app/api/credits/route.ts:74,77`;
   `apps/web/app/api/checkout/refill/route.ts:60`; and the prose promise at
   `apps/web/app/terms/page.tsx:99-100`. My guard covers only the `packages/ai` pair. The
   `credits/route.ts` SQL is the one the **customer-facing balance** reads, so a drift there would
   show a balance that disagrees with the budget gate. A cross-package parity test (or a single
   shared constant) is the real fix — out of this task's scope.
3. **`X-Powered-By`-class whitespace note, no action needed:** `apps/web/app/api/checkout/refill/route.ts:60`
   exports a *third* `REFILL_WINDOW_DAYS`, and `apps/web/app/api/webhooks/creem/route.ts:498` exports
   `REFILL_CREDITS = 1000`. Three `1000`s and three `90`s across two apps are the same pricing fact
   stated three times.

## Public Interface Exposed
No production interface changed. Test-only additions inside `packages/ai/src/budget.test.ts`:
- `const ONE_DAY_MS`, `const REFILL_NOW_MS` (fixture clock, fixed at `2026-09-23T12:00:00.000Z`)
- `function refillWindowCutoffMs(nowMs?: number): number` — models the DB's `now() - interval '90 days'`
- `interface RefillGrant { refId; credits; ageDays }`
- `function refillPoolFromGrants(grants: readonly RefillGrant[]): ReturnType<typeof fakeRefillPool>`
- New import added to the existing import block: `REFILL_CREDITS_SQL` from `./budget.js`
- New `describe` block: `'refill window boundary — $5 / 1,000 credits / 90 days'` (9 cases)

## Known Limitations
- **No live-Postgres execution of the predicate** (see Assumptions #1). The window's boundary is
  pinned by exact SQL text + a modelled fixture, not by a real `timestamptz` comparison.
- The fake pool returns a pre-computed SUM, so the tests cannot catch a DB-side semantics change
  (e.g. a different `TimeZone` setting, or `created_at` being migrated to `timestamp without time
  zone`) — only a change in the statement text or the JS read rule.
- Only the `packages/ai` copy of the window is guarded (Open Questions #1, #2).
- Not covered by this task: the ledger-write side (whether a refill row is written with
  `amount_cr = 1000`), and the 90-day window's interaction with `date_trunc('month', now())` used by
  `SPENT_CREDITS_SQL` — i.e. a refill can outlive the month it was bought in, and nothing here
  asserts that cross-period behaviour is intended.
- No commit was made (per task constraint). No git state-changing command was run at any point.

## OSS Basis (5-minute scan, cited)
Patterns reviewed for how OSS billing code pins credit-window boundaries, then built in-repo rather
than imported (the task is a test-only change; no dependency was added):

1. **Kill Bill / Stripe-style — "freeze the clock, then read the boundary as data."** Stripe's
   test-clock write-up (`https://stripe.dev/blog/test-clocks-how-we-made-it-easier-to-test-stripe-billing-integrations.md`)
   describes replacing every real-time read with an injected time provider, then advancing time to
   the *next meaningful event* instead of sleeping. Adopted: my fixture clock is a fixed constant
   and the boundary is computed **from the window constant** (`refillWindowCutoffMs()`), never
   hard-coded — so the fixture cannot agree with a drifted window by accident.
2. **Frappe `central` — expiry tested as a dated, exactly-on-boundary event.**
   `central/billing/tests/test_projection_rollforward.py` (repo `frappe/central`) asserts expiry
   with `expire("2026-10-01")` and `ExpiringCredit` cases such as
   `test_expiry_removes_only_what_is_past_its_date` — i.e. the boundary is an input, and the test
   names the *day* on each side. Adopted: the tests are expressed in day offsets (89 / 90 / 91) so a
   one-day slip is readable in the failure message, not buried in a timestamp diff.
3. **Comparison point for the live-DB gap:** `apps/gateway/src/db/__tests__/0011-billing.test.ts`
   (in-repo) does exactly the real-Postgres leg I could not run here — it applies migrations to a
   scratch schema and proves behaviour, with a loud skip when Postgres is unreachable. Also adopted
   as the in-repo precedent for the "recorded, never faked green" skip posture.

## Verification Performed

Toolchain detected from disk (never assumed): `package.json:19` defines the root `ci` script; the ai
package uses `vitest` (`packages/ai/package.json:19`), `tsc --noEmit` (:21), flat ESLint 9
(`eslint.config.mjs:26-32`), Prettier 3 (`printWidth 100, singleQuote`, `.prettierrc`). Commands run
from `C:\Users\xr3less\Desktop\corvus\packages\ai` unless noted.

| # | Command | Result |
|---|---|---|
| 1 | `npm run test` (baseline, before any edit) | 6 files, **144/144 passed**; `budget.test.ts` 39 |
| 2 | `npx vitest run src/budget.test.ts` (focused) | **48/48 passed** (39 existing + 9 new) |
| 3 | `npm run test` (full ai suite, after edit) | 6 files, **153/153 passed** — 144 baseline + 9, **zero pre-existing test touched or weakened** |
| 4 | `npm run typecheck` (`tsc --noEmit`) | exit 0, no output |
| 5 | `npx eslint packages/ai/src/budget.test.ts --max-warnings 0` | exit 0, clean |
| 6 | `npx prettier --check src/budget.test.ts` | "All matched files use Prettier code style!" |
| 7 | `sha1sum -c` on `budget.ts` after every mutation restore | `OK` — byte-identical to pre-task state |

**Independent confirmation of the pinned length (not copied from a failure message):** the 147-char
assertion was first written as 160 from a hand count, which failed. Rather than pasting the observed
value, the statement was rebuilt from its own semantics (concatenated literals with
`REFILL_WINDOW_DAYS` interpolated) — rebuilt length 147, actual length 147, `EXACT MATCH: true`,
window literal confirmed `90 days`. The assertion was then corrected to the independently derived
value.

### Break-the-guard proof (the AC's mutation requirement)
Production mutation applied with `sed`, suite run, then restored from a `cp` backup held **outside
the repo** (`%LOCALAPPDATA%\Temp\corvus-budget-backup`) and re-verified by `sha1sum -c`. No git
command that restores from HEAD (`stash`, `checkout`, `restore`, `reset`) was used at any point.

| Mutation | What it simulates | Reading |
|---|---|---|
| M1 `created_at >= now()` → `created_at > now()` | the half-open boundary silently becoming exclusive (a full day of refill revenue) | **RED** — `pins the predicate as half-open` fails: `expected … to contain 'created_at >='`. Restored → green, `sha1sum: OK` |
| M2 `interval '90 days'` → `interval '89 days'` (SQL only) | one-day window drift in the SQL literal | **RED** — `derives the SQL window from the same 90 days` fails: `expected … to contain '90 days'` (also trips the pre-existing `sums refill rows within the window` case at :281). Restored → green, `sha1sum: OK` |
| M3 `REFILL_WINDOW_DAYS = 90` → `89` (constant only, SQL untouched) | the two literals drifting apart in the other direction | **RED on two cases** — `pins the terms promise` and `derives the SQL window … (drift guard)`. Restored → green, `sha1sum: OK` |
| M4 `REFILL_WINDOW_DAYS = 90` → `91` | drift upward (window widening, revenue leakage) | **RED on the same two cases.** Restored → green, `sha1sum: OK` |

M3/M4 are the evidence that the drift guard is real: the drift-guard test fails when **either**
literal moves, which is the AC's "no hardcoded duplicate that drifts" intent enforced against the
constants as they actually are.

**A defect found and fixed in my own test during this work:** the first version of the
half-open-predicate case asserted `toHaveLength(160)` *before* the regex, so a flipped operator
failed with a confusing one-character length diff instead of naming the real fault. The length
assertion was moved last (and the operator checks strengthened to `toContain('created_at >=')` /
`not.toContain('created_at > ')`) so the mutation now fails with a message that says what broke.
ESLint then caught a second, real defect — a `spent` fixture assigned but unused, meaning the
`revenue event` test's own comment ("same spend") was **not structurally true**. The two
`checkBudget` calls are now built from one shared `nearBoundary()` factory, so the claim is enforced
by the code rather than asserted in prose.

## Scope Compliance
- Files touched: exactly two — `packages/ai/src/budget.test.ts` (the one permitted MODIFY) and this
  report. Confirmed by `git status --porcelain -- packages/ai` plus mtime comparison: the other
  modified files under `packages/ai` (`ai.test.ts`, `budget.ts`, `builder-prompt.ts`, `index.ts`,
  `lanes.ts`) carry mtimes of 2026-09-21 20:34 / 09-23 09:46, i.e. the pre-existing uncommitted
  wave, not this task. `budget.test.ts` carries this task's only new mtime.
- No production-source, refill-route, or config file modified. No install. No manifest edit.
- No secrets read or printed. No live/network connection made by any test (fakes only).
- No `git stash` / `checkout` / `restore` / `reset`. No commit. No push.
- Escalated rather than silently expanding: the prod change needed to make the window constant
  authoritatively govern the SQL (Open Questions #1) and the cross-package window duplication (#2).
