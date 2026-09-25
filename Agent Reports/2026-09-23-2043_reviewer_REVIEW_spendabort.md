# Task Report: reviewer-spendabort-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2043_reviewer_REVIEW_spendabort.md
- MODIFIED: none (read-only review + test runs; no source edits, no git restore/stash/checkout/reset, no commit/push)

## Dependencies Added
None.

## Assumptions Made
- The builder's stated pre-task route.ts hash (`8c5d0586…`) is taken at face value; I verified the current file hashes to `8C5D0586` and its vs-HEAD diff contains only spend-wave additions, which corroborates but does not independently prove pre-task identity.
- The builder's guard-break red/green counts (A: 3/32, B: 2/33, C: 3/32) were adjudicated by read, not re-run — re-mutating prod was explicitly out of scope. The logic is fully determined by the code paths below.
- The builder's HEAD-swap decisive test (HEAD test file + tree route = 7 chat failures) was not re-run — swapping file contents would be a tree mutation outside my scope. The conclusion follows from reads (HEAD test file has no pool stubbing for the spend wave).

## Open Questions for Orchestrator
- OQ1 (builder): pins are written against the dirty tree and fail on a HEAD checkout of route.ts. CONFIRMED sound — on HEAD there is no reserve INSERT and no fallback write, so `toHaveLength(2)` fails. The M-11 spend wave must land before or with these pins; they are not back-compatible with HEAD. Ordering question remains yours.
- OQ2 (builder): if the deferred product call lands as "backfill", test 2's `params[2]` assertion (pins reserve estimate for an aborted throw) is the first to revisit. CONFIRMED sound — that assertion is exactly the warn-vs-backfill decision point. No action now.
- NITs in the builder report (all non-blocking, none affect the lock): (a) line counts "823 → 974" do not match the shipped file, which is 870 lines — but its SHA256 `25A0DCF7` matches the reported `25a0dcf7…` exactly, so the file is as-shipped and only the numbers are off; (b) the expected pre-existing rollback TS2345 is gone — `tsc --noEmit` is fully clean (exit 0), so another wave fixed it or the tree moved on; stronger than claimed; (c) ai-chat-input now passes 19/19 in isolation (builder saw 3/19 fail) — flaky or fixed elsewhere; attribution conclusion unchanged.

## Public Interface Exposed
None — review only. (Builder's change is test-only: module-private `abortedChatRequest` helper, not exported.)

## Known Limitations
- Guard-breaks verified by read, not by re-execution (scope guard). Each break's failure count is derived, not observed, by this reviewer.
- Full web suite not re-run (flaky 2–4 failures run-to-run per builder; expensive). Attribution established by cheaper decisive checks instead (dirty/untracked status, zero imports, rollback 23/23 isolation).
- The pins lock behavior at the mock boundary (stubbed pool, recorded SQL); no real provider abort or real Postgres is exercised. Mid-flight abort (dead signal after frames flow) remains uncovered — route `cancel()` is a no-op by design.

## Verification

| # | Claim | Check performed | Result |
|---|---|---|---|
| 1 | Helper + 2 pins present with M-11 header | Read `route.test.ts:44-57` (`abortedChatRequest`), `:427-446` (M-11 header + `failReserveOnly` rationale), `:447-509` (aborted-signal pin), `:511-561` (mid-stream-throw abort-wins pin) | PASS — all present as described |
| 2 | `failReserveOnly` reaches `else if (reservationId === null)` | Read stub `:102-107` (only 1st INSERT rejected; reserve at route `:419` is the 1st INSERT) + route `:460` branch | PASS — mechanics correct; pins assert 2nd INSERT by index with `toHaveLength(2)` |
| 3 | Abort-wins discrimination (`params[2]` = estimate, not null) | Read route `:469-472` ternary vs non-aborted throw test at test `:386-394` (expects nulls); pin asserts estimate at `:555-556` | PASS — the two paths assert opposite shapes; dropping the abort check flips the pin red |
| 4 | route.ts untouched by this task (SHA `8c5d0586`, diffstat 110/11) | `Get-FileHash` → `8C5D0586`; `git diff --numstat` → `110 11`; diff grep shows only spend-wave symbols; `BREAK-INSTRUMENT` → 0 hits (sole "break" hit at `:308` is a benign comment) | PASS |
| 5 | Brief-premise correction: HEAD `:370-374` no-else vs tree `:450-473` else-if | `git show HEAD:…route.ts` lines 365-385: `if (done) { … }` with no else — confirmed; tree `:450-473` else-if with aborted/throw fallback — confirmed; SUM at `:134-136`, reserve at `:419` — confirmed | PASS — correction accurate; brief's line cites are HEAD-relative as stated |
| 6 | Chat suite 35/35 (33+2) | `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → 35 passed (35); 35 `it(` blocks counted | PASS |
| 7 | eslint/prettier clean on test file | `eslint …route.test.ts` exit 0, zero warnings; `prettier --check` clean | PASS |
| 8 | tsc state (expected: pre-existing rollback TS2345 only) | `tsc --noEmit -p tsconfig.json` (from `apps/web`) → exit 0, zero errors | PASS (stronger than claimed; see OQ nit b) |
| 9 | Guard-break A (silent drop → 3 failed incl. pre-existing throw test) | By read: deleting `:472` write leaves 1 INSERT under `failReserveOnly`; both pins (`toHaveLength(2)`) + non-aborted throw test (`:384-385`, same shape) fail → 3. Matches | PASS (derived, not re-run) |
| 10 | Guard-break B (abort check → false → exactly the 2 pins) | By read: aborted pins would take the null branch, failing the estimate asserts; non-aborted tests unaffected → exactly 2. Matches | PASS (derived, not re-run) |
| 11 | Guard-break C (double-charge → 3 failed) | By read: duplicated write → 3 INSERTs in both pins + pre-existing throw test → 3. Matches; zero markers left confirmed | PASS (derived, not re-run) |
| 12 | Full-suite red attributed to other waves | `git status --porcelain`: all six failing files `M`, plus `auth/error/page.test.tsx` `??`; test file imports none of them (grep 0); rollback isolation 23/23 green; ai-chat-input isolation now 19/19 green (see nit c) | PASS — none attributable to this task |
| 13 | Reserve mirror (`RESERVE_CREDITS` = 3 routes × call cost) | Test `:136` vs route `:118-129` (`PERSONA_CALL_CREDITS` × `LANES.persona.length`); persona lane has 3 routes per `@corvus/ai` test ordering (wiro-glm, wiro-grok, openrouter fallback) | PASS — mirror sound |
| 14 | No secrets / manifests / destructive git in builder diff | Builder diff adds only test code; `WIRO_API_KEY='test-key'` placeholder matches pre-existing pattern; no manifest/lockfile/`.env` entries in chat diff | PASS |

## Summary judgment
The lock is real: two abort-path pins genuinely reach the `else if (reservationId === null)` fallback (via `failReserveOnly`), assert the estimated row the monthly SUM will count, and discriminate abort-wins-over-throw. The green suite itself validates the instrument — had the dead signal not propagated, `params[2]` would be null and the pins would fail. route.ts is byte-consistent with the claimed pre-task state, gates are clean (tsc fully green), and the brief-premise correction plus both open questions check out. Minor stale numbers in the builder report do not affect the deliverable.
