# Task Report: fix-newpage-m8-only

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx (M-8 judged-pin lines ONLY — M-7 mint reset lines untouched; verdict transport-failure catch now clears judgedUserIdRef and records the failed row in verdictFailedUserIdRef; effect skips only that failed row so the next eligible ask-line turn posts fresh)
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx (ONE new test ONLY: "a verdict transport failure retries on the next eligible turn")

## Dependencies Added
None.

## Assumptions Made
- Pre-existing working-tree changes (uncommitted verdict feature + M-7 fix) were the baseline; diff vs HEAD is large for that reason. My delta is only the M-8 judged-pin lines and the one new test. M-7 mint lines and copy strings untouched.
- Concurrent verdict POSTs stay guarded: buildingRef/building/runId guards untouched; the failure-marker skip narrows only the same-row settle loop, never eligibility of new rows.

## Open Questions for Orchestrator
- The new test counts 2 verdict POSTs total (first dies, second lands run-789). A middle non-eligible turn still asserts 1 POST, pinning that retries come from eligibility, not same-row loops. Acceptable, or should M-9 (runId latch) extend it?
- M-9 (runId latch, page.tsx:101/105) untouched per spec — needs the follow-up task.

## Public Interface Exposed
None (no signature changes; verdict POST shape { botId, turns } unchanged).

## Known Limitations
- Does NOT cover M-9 (runId set-once latch) — follow-up task.
- Failure marker is per-row: only the failed user row is held from same-row re-posts; every other eligibility rule (ask-line adjacency, botId, streaming/building guards) unchanged.

## Verification
- `cd apps/web && npx vitest run app/dashboard/new/page.test.tsx` → 39 passed (38 baseline + 1 new). Run 3x consecutive before the new test (38/38 x3) and 2x after (39/39). Note: must run from apps/web; repo-root run misresolves `@/`.
- Baseline note: before my edit, the pre-existing tree showed 36 passed / 2 failed on single runs (the verdict-fallback test timing out at 5s), settling to 38/38 only with the failure-marker guard present. After my edit: stable green.
- `cd apps/web && npx tsc --noEmit` → exit 0.
- `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` (repo root) → exit 0, zero warnings.
- `npx prettier --check` on both files → clean.
- Guard: removed the `verdictFailedUserIdRef.current = lastUser.id` write (GUARD-BREAK) and ran `-t "retries on the next eligible turn"` → 1 failed / 38 skipped (no alert found — the failure storm re-posted the failed row on settle). Restored → 39/39 green.
- Diff reviewed: no secrets; page.tsx lines 87, 117, 179-180; test at page.test.tsx:928.
