# Task Report: fix-newpage-m9followup

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx (latch effect ONLY: new `latchRunIdRef` tracking the runId under watch; a fresh runId clears `runFailedRunIdRef` and ignores the stale carried-over phase, with `return` so only a `failed` observed while watching THIS runId marks it. Verdict guard, M-7 mint lines, M-8 judged lines untouched.)
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx (ONE new test ONLY: "a live second run keeps the run gate closed for a further eligible yes")

## Dependencies Added
None.

## Assumptions Made
- Pre-existing uncommitted waves make the HEAD diff large; my delta is only the latch lines plus the one new test. M-7 (4x `mintAttemptedRef.current = false`, grep-verified) and M-8 (`verdictFailedUserIdRef`, judged pin) shapes are byte-untouched.
- Hook idiom mirrors builder-progress.tsx: reset-on-identity-change plus null-clear, no hook changes.
- The new test's turn-6 yes is a NEW user row (judged pin cannot hold it), so silence at exactly 2 verdict POSTs proves the run gate — not the pin — holds run-2 shut.

## Open Questions for Orchestrator
- None.

## Public Interface Exposed
None (no signature changes; verdict POST shape { botId, turns } unchanged).

## Known Limitations
- The latch still opens only on an observed terminal `failed` poll while watching the current runId. A run that dies without ever polling `failed` keeps the gate shut (honest conservative direction, inherited from M-9).

## Verification
- `npm run test --workspace @corvus/web -- app/dashboard/new/page.test.tsx` → 1 file passed, 41 passed (41) (40 baseline + 1 new).
- `npm run typecheck --workspace @corvus/web` (tsc --noEmit) → exit 0, no output.
- `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` (repo root) → exit 0, zero warnings.
- `npx prettier --check` on both files → clean.
- Guard broken and watched (outside-repo backup $env:TEMP\m9followup\page-fixed-backup.tsx, SHA256-verified, restored byte-identically — hashes matched 33BB2175...): removed the ref-clear and poisoned the mark, ran `-t "live second run keeps the run gate closed"` → 1 failed | 40 skipped (41). Restored → 41/41 green, typecheck/lint/prettier re-verified.
- No secrets in diff (secret-pattern grep hit only "ask-line" false positives); locked copy strings untouched.
