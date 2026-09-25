# Task Report: fix-newpage-m9-retry

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx (M-9 latch ONLY: new `runFailedRunIdRef` + page-owned `useBuilderProgress(runId)` poll feeding one small effect; verdict guard narrowed from `runId !== null → return` to `runId !== null && runFailedRunIdRef.current !== runId → return`. M-7 mint lines and M-8 judged lines untouched — grep-verified zero collateral.)
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx (ONE new test ONLY: "a failed build lets a later yes post a fresh verdict and start a fresh run")

## Dependencies Added
None.

## Assumptions Made
- Pre-existing uncommitted waves (verdict feature + M-7 + M-8) are the baseline; diff vs HEAD is large for that reason. My delta is only the M-9 latch lines, the one new test, and a duplicate-comment trim.
- Two polls per live run (display's + page-owned latch's) is acceptable: both stop at terminal phases, and sharing one hook instance between display and latch would cross the sibling-reviewer's ownership line.
- A failed verdict HTTP response (non-2xx, e.g. 403/500 with buildError shown) does NOT open the run latch — that path never sets runId, so there is no latch to open; a later yes posts fresh through the normal no-run path. M-9 only covers post-runId `failed` polls.

## Open Questions for Orchestrator
- None.

## Public Interface Exposed
None (no signature changes; verdict POST shape { botId, turns } unchanged).

## Known Limitations
- The latch opens only on the page-observed terminal `failed` poll. A run that dies without ever polling `failed` (e.g. network-down poll errors) keeps the gate shut; that is the honest conservative direction (never opens spuriously).
- `runFailedRunIdRef` clears when runId returns to null (fresh thread); a remount starts with no marker.

## Verification
- `cd apps/web && npx vitest run app/dashboard/new/page.test.tsx` → 40 passed (39 baseline + 1 new). In-flight dedup suite still green inside the 40.
- `cd apps/web && npx tsc --noEmit` → exit 0 (TSC_CLEAN).
- `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` (repo root) → exit 0, zero warnings (one self-introduced unused-var fixed before finishing).
- `npx prettier --check` on both files → clean.
- Guard broken and watched (outside-repo backup /tmp/m9-page-backup.tsx + sha256 verify, restored byte-identically — hashes matched): mutated `buildPhase === 'failed'` to `'BLOWN'` and ran `-t "fresh run"` → 1 failed / 39 skipped (latch never opened, second verdict never posted). Restored → 40/40 green.
- Loop guard mechanism: the judged pin (`judgedUserIdRef`) is deliberately LEFT intact — same class as M-8's failure marker. The same failed row stays pinned so settling alone never re-posts; only a NEW eligible user row (new id) may post. Test asserts verdict POSTs stay at 1 between failure and the fresh yes, then reach exactly 2 with the second body ending at the fresh user row and the link flipping run-1 → run-2, then staying at 2 after the live second run settles.
- Diff reviewed: no secrets; locked copy strings byte-identical.
