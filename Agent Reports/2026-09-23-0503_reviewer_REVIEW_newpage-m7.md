# Task Report: reviewer-newpage-m7

## Status
SUCCESS

## Verdict
PASS — the M-7 mint-retry fix is truly done.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0503_reviewer_REVIEW_newpage-m7.md (this report; my only write)

## Dependencies Added
None.

## Verification evidence (exact commands + results)

All commands run from `C:\Users\xr3less\Desktop\corvus\apps\web` (toolchain detected from disk: npm via root `package-lock.json`, no pnpm/yarn/bun lockfile; scripts in `apps/web/package.json`: `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `lint` = `eslint .`):

1. `npx vitest run app/dashboard/new/page.test.tsx` → **38/38 passed** (Test Files 1 passed, Tests 38 passed, Duration ~4.5s). The `it.each([501, 1500, 2000])` plan-length case expands to 3, so 36 `it`/`it.each` blocks = 38 tests: 37 baseline + 1 new (`a failed mint retries on the next submit and the id still lands`, page.test.tsx:975-1033).
2. `npx tsc --noEmit` → **exit 0**.
3. `npx eslint app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx` → **exit 0, zero warnings**.
4. `npx prettier --check app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx` → **clean** ("All matched files use Prettier code style!").

## What was checked, in order

1. **Artifacts exist.** Author report `Agent Reports/2026-09-23-0502_fix-newpage-m7_FIX_newpage-mint-retry.md` read; `apps/web/app/dashboard/new/page.tsx` (mintOnce lines 175-217) and `page.test.tsx` (new test lines 975-1033) read on disk. Caveat, stated honestly: `git diff` against HEAD `d9cf8d7` shows far more than the M-7 hunk because the working tree carries large pre-existing uncommitted waves (verdict auto-start, composer unlock, etc.). The M-7 hunk itself was verified by direct region read, not by HEAD diff: `setMintError(null)` at page.tsx:180 (retry entry) plus `mintAttemptedRef.current = false` on all four async failure sites — !ok path (:197), bad/missing botId (:206), JSON-parse catch (:210), fetch catch (:215). No other mint lines changed.
2. **It actually works.** Suite is 38/38 green as run above, not just claimed. The new-test-fails-without-the-fix leg was verified by code-reading per the no-mutation guard (I mutated nothing): without the resets, `mintAttemptedRef` stays `true` after the first 500, so the second `handleSubmit` skips `mintOnce`, `/api/bots` stays at 1 call and the `toHaveLength(2)` assertion at test line 1023 fails; the third-turn `botId` assertion (line 1030) would likewise fail against null. This matches the author's guard-break run (reset removed → 1 failed / 37 skipped at the retry-count assertion; restored → 38/38), cited as supporting evidence.
3. **In-flight dedup intact.** `handleSubmit` (page.tsx:221-229) still sets `mintAttemptedRef.current = true` synchronously before `mintOnce`, and every reset sits inside an async `.then`/`.catch` handler — so a second submit while the first mint is in flight is still ignored. Covered at runtime by the passing `mint race shows Saving your bot with no POST until the id lands` test (mint gated behind a promise across two submits, single mint, verdict queued only after resolve).
4. **Static gates.** tsc 0, ESLint 0 warnings, Prettier clean — all re-run by me just now (see commands above).
5. **Scope/security.** Grep for `judgedUserIdRef.current = null` and `setRunId(null)` in page.tsx → **zero hits**: M-8/M-9 latches untouched, only `mintAttemptedRef` resets added. Author report declares no dependencies; the `package-lock.json` working-tree diff (testbot entries) is pre-existing and unrelated to this fix. No secrets, credentials, or copy-string changes in the hunk (only the pre-existing `MINT_FALLBACK_ERROR` sentence is reused). I ran no installs, no commits, no git restores, and contacted no production.

## Assumptions Made
- The large pre-existing uncommitted working-tree state (prior waves) is out of scope; I judged only the M-7 mint-retry lines plus the one new test.
- The author's guard-break claim (1 failed / 37 skipped with reset removed) is accepted as supporting evidence; my independent leg is the code-reading argument above, since file mutation was forbidden.

## Open Questions for Orchestrator
None.

## Public Interface Exposed
None (no signature changes; `mintOnce`/`handleSubmit` shapes unchanged, per author report and confirmed by read).

## Known Limitations
- Verification is suite + static gates + code-reading; I did not boot the app or drive the flow in a browser.
- M-8 (`judgedUserIdRef` latch) and M-9 (`runId` latch) remain OPEN by design — follow-up tasks, untouched here as specified.
