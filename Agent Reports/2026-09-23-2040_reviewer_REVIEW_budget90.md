# Task Report: reviewer-budget90-2014

## Status
PASS

## Files Touched
- CREATED: `Agent Reports/2026-09-23-2040_reviewer_REVIEW_budget90.md` (this report)
- MODIFIED: none
- DELETED: none
- Read-only verification. No production source, test, config, or manifest file was modified. No git state-changing command was run (no stash/checkout/restore/reset/commit/push).

## Dependencies Added
None.

## Assumptions Made
- "Pre-task state" for the byte-identical claim is interpreted as the pre-task **working-tree** state (which already contained the uncommitted refill feature wave), not HEAD. The builder's sha1 (`f1d7667010e1993c6f0017077cddc4ae8a7983c3`) is self-reported; there is no independently recorded pre-task hash, so disk-sha-equals-claimed-sha is corroboration, not cryptographic proof. Content-coherence checks (below) carry the real weight.
- Baseline counts (144 full-ai, 39 focused) were not re-run pre-task; they are accepted as credible because the post-task numbers (153, 48) were independently re-run and the arithmetic holds exactly (153 − 9 = 144, 48 − 9 = 39).
- Mutation red-restore evidence (M1–M4) is accepted as a claim from the builder's log; the reviewer scope forbids prod edits so mutations were not re-run. What was independently verified instead: no mutation residue on disk, no stash usage, and logic-probe adequacy of the guard assertions.

## Open Questions for Orchestrator
1. **Prod-param fix (builder finding #1, endorsed).** `REFILL_WINDOW_DAYS = 90` (`packages/ai/src/budget.ts:53`) does not govern `REFILL_CREDITS_SQL`'s hardcoded `interval '90 days'` (`packages/ai/src/budget.ts:63`) — confirmed on disk. The `toContain(`interval '${REFILL_WINDOW_DAYS} days'`)` drift guard is interim-adequate (it goes red when either literal moves) but it is still a test pinning two literals together, not one source of truth. Real fix needs a prod edit: bound `$3` parameter or single interpolation at module load. Recommend a scoped follow-up task.
2. **4x window duplication (builder finding #2, confirmed real, not invented).** Verified on disk: `apps/web/app/api/credits/route.ts:74,77` (constant + SQL literal — the customer-facing balance read), `apps/web/app/api/checkout/refill/route.ts:60` (third `REFILL_WINDOW_DAYS`), `apps/web/app/terms/page.tsx:99-100` (prose promise). The new guard covers only the `packages/ai` pair. A drift in `credits/route.ts` would show a balance disagreeing with the budget gate. Recommend a cross-package parity test or a single shared constant as a follow-up.
3. **No-live-Postgres gap (builder-stated, endorsed as honestly recorded).** The 89/91-day boundary is pinned at SQL-text level plus a modelled fixture predicate, not by executing Postgres. A live-DB leg (per the in-repo precedent `apps/gateway/src/db/__tests__/0011-billing.test.ts`) would be strictly better proof. Recommend scheduling it; do not treat the current block as DB-semantics proof (it cannot catch e.g. a `TimeZone` or column-type change).
4. **Claim-wording correction for the builder's report.** "PRODUCTION SOURCE: NOT TOUCHED … byte-identical to its pre-task state" is true relative to the working tree but false relative to HEAD (`git diff --stat` shows `packages/ai/src/budget.ts | 79 ++++++---`, sha1 disk `f1d7667…` vs HEAD `e2b1a94…`). The vs-HEAD diff is the pre-existing uncommitted refill-feature wave (prior task scope), not this task — the test-file diff is isolated (`budget.test.ts | 274 insertions, 1 deletion`, matching the claimed block). No action needed beyond reading the claim with the right baseline; flagging so a future auditor comparing against HEAD is not alarmed.
5. **Minor test-naming overreach (non-blocking).** The case at `budget.test.ts:487` is titled "counts only refill rows that are both inside the window and the account" but exercises only window filtering; account scoping is covered by the next case (`:506`). Suggest a rename on next touch, not a fix task.

## Public Interface Exposed
No production interface changed. This review adds no code and no exports.

## Known Limitations
- Mutations M1–M4 were not re-executed (prod edits forbidden in reviewer scope); red-restore is verified by residue-absence + assertion-adequacy, not by reproduction.
- Pre-task working-tree hash has no independent witness; byte-identity rests on builder self-report plus content coherence.
- Full-repo suite was not run — only the `packages/ai` suite (the affected package), plus tsc/eslint/prettier on the touched file. Cross-package impact is nil by construction (test-only change in one package), but it was not machine-proven.
- Live-Postgres semantics (timestamptz comparison, interval exactness) were not exercised; see Open Question 3.

## Verification Performed

Toolchain detected from disk, never assumed: `packages/ai` uses vitest, `tsc --noEmit`, flat ESLint 9, Prettier 3. All commands run from `C:\Users\xr3less\Desktop\corvus\packages\ai` unless noted.

| # | Check | Command / method | Result |
|---|---|---|---|
| 1 | New 9-case block exists on disk | Read `packages/ai/src/budget.test.ts:352-515` | PASS — `describe('refill window boundary — $5 / 1,000 credits / 90 days')` with 9 `it` cases; fixture clock, `refillWindowCutoffMs()` derived from the prod constant, `refillPoolFromGrants()` modelling the shipped predicate |
| 2 | Finding #1 real (constant vs SQL duplication) | Read `packages/ai/src/budget.ts:53,63` | PASS — `REFILL_WINDOW_DAYS = 90` never interpolated; SQL hardcodes `interval '90 days'`. Drift guard (`toContain` interval literal, `:415-416`) adjudicated INTERIM-ADEQUATE: fails on either-side drift, but not a single source of truth |
| 3 | Byte-identical claim | `git diff --stat`, `git show HEAD:… \| sha1sum` vs disk sha1sum | CLARIFIED PASS — disk sha `f1d7667…` matches builder's claimed pre-task sha; vs HEAD it differs (`e2b1a94…`, +79/−8) because the pre-existing uncommitted refill wave sits in the working tree. This task's own diff is test-only (see #4). No mutation residue: `90 days` + `>=` present and correct on disk |
| 4 | Test-only scope | `git diff --stat -- packages/ai/src/budget.test.ts` | PASS — 274 insertions / 1 deletion (builder claimed +275/−1; trivial count rounding), confined to the test file plus the `REFILL_CREDITS_SQL` import |
| 5 | Finding #2 real (4x duplication) | Read `credits/route.ts:74,77`, `refill/route.ts:60`, `terms/page.tsx:99-100` | PASS — all three duplicates exist exactly as builder reported; escalation is real |
| 6 | Focused suite | `npx vitest run src/budget.test.ts` | PASS — **48/48** (39 existing + 9 new), independently re-run |
| 7 | Full ai suite | `npm run test` in `packages/ai` | PASS — **6 files, 153/153** (144 baseline + 9; zero pre-existing tests touched) |
| 8 | Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS — exit 0 |
| 9 | Lint | `npx eslint src/budget.test.ts --max-warnings 0` | PASS — exit 0 |
| 10 | Format | `npx prettier --check src/budget.test.ts` | PASS — clean |
| 11 | SQL length pin (147) | Independent PowerShell measure of the literal | PASS — 147 chars, matches the test's `toHaveLength(147)`; not copied from a failure message (builder also documents independent derivation) |
| 12 | Mutation hygiene | `git stash list` (empty), `git status --porcelain` (no stash artifacts; `M budget.ts`/`M budget.test.ts` are the pre-existing wave + this task's test edit) | PASS — no stash used; no residue; backup-outside-repo claim accepted as stated (nothing in-repo contradicts it) |
| 13 | 90d-edge reading | Read `budget.test.ts:445-455` | PASS — exactly-90d asserted COUNTED with `>=` rationale and an explicit customer-favouring comment; boundary-inclusive semantics documented as built |
| 14 | Guard-assertion adequacy (logic probe, no prod edit) | Read `:427-432` | PASS — `toContain('created_at >=')` + `not.toContain('created_at > ')` (trailing space makes the negative check exact, not vacuous) + full-statement regex; an operator flip or one-day drift necessarily trips at least one assertion |

### Break-the-guard assessment (without re-mutating)
M1 (`>=`→`>`) must trip `:427` (`toContain('created_at >=')`) and the `:430-432` regex — structurally certain. M2 (SQL `90`→`89`) must trip `:415-416` and the `:416` literal pin plus the regex — structurally certain. M3/M4 (constant `90`→`89`/`91`) must trip `:408` (`toBe(90)`) and `:415` (interpolated `toContain`) — structurally certain; the fixture cutoff moves with the constant while the SQL text does not, so the 89/91-day behavioural cases would additionally diverge. The guard design is sound; reproduction was correctly left to the builder's log.
