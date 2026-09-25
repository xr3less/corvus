# Task Report: fix-runmarker-v2

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx (latch effect ONLY: runId-change detect — compare latchRunIdRef to runId FIRST; on change, update ref, clear runFailedRunIdRef, RETURN before the mark branch. Verdict guard, M-7 mint lines, M-8 judged lines untouched)
- MODIFIED: none in page.test.tsx (ZERO test changes — the existing residual test encoded the correct acceptance and now passes)

## Dependencies Added
None.

## Assumptions Made
- None beyond the task spec; hook behavior taken from builder-progress.tsx as read (state resets only when runId is falsy).

## Open Questions for Orchestrator
- None.

## Public Interface Exposed
None (no signature changes; verdict POST shape { botId, turns } unchanged).

## Known Limitations
- The latch still opens only on an observed terminal `failed` poll while watching the current runId. A run that dies without ever polling `failed` keeps the gate shut (honest conservative direction, inherited from M-9).

## Verification
- Focused suite (restored/fixed tree): `npm run test --workspace @corvus/web -- app/dashboard/new/page.test.tsx` → 41 passed (41), including residual test `a live second run keeps the run gate closed for a further eligible yes` (exactly 2 verdict POSTs, run stays run-2).
- M-9 test (`a failed build lets a later yes`) green within the same 41/41 run; all 40 prior tests green.
- Typecheck: `npm run typecheck --workspace @corvus/web` (tsc --noEmit) → exit 0, no output.
- Lint: `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` (repo root) → exit 0, zero warnings.
- Prettier: `npx prettier --check` on both files → `All matched files use Prettier code style!`
- Guard broken and watched (outside-repo backup $env:TEMP\runmarker_v2\page-fixed-backup.tsx, SHA256-verified 837A47C7... both, restored byte-identically via plain file copy — no git restore commands): reverted to write-only latch (`latchRunIdRef.current = runId` + bare `if (buildPhase === 'failed')`), ran focused suite → 1 failed | 40 passed (41), failing test `a live second run keeps the run gate closed for a further eligible yes`, `AssertionError: expected [ …(3) ] to have a length of 2 but got 3`. Restored → 41/41 green.
- Grep-verify: M-7 intact (4x `mintAttemptedRef.current = false` at page.tsx:246/255/259/264); M-8 intact (`verdictFailedUserIdRef` at :87/153/216, shape unmodified); verdict guard unchanged (`if (runId !== null && runFailedRunIdRef.current !== runId) return;` at :141); latch now reads latchRunIdRef (:129) before the mark branch (:134).
- No secrets in diff; locked copy untouched; no commits, no manifests, no installs, no production contact.
