# Task Report: fix-newpage-m7-only

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx (mintOnce: optimistic setMintError(null) on retry entry; mintAttemptedRef.current = false on all three failure paths — !ok, bad/missing botId, catch)
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx (ONE new test: "a failed mint retries on the next submit and the id still lands")

## Dependencies Added
None.

## Assumptions Made
- Only M-7 was in scope; M-8 (judgedUserIdRef latch) and M-9 (runId latch) left untouched per spec.
- In-flight dedup preserved: reset happens only in async failure handlers, never synchronously, so a second submit while the first mint is still in flight is still ignored.
- Clearing the stale mint error optimistically on retry entry is acceptable; a new failure re-sets it.

## Open Questions for Orchestrator
None.

## Public Interface Exposed
None (no signature changes; mintOnce/handleSubmit shapes unchanged).

## Known Limitations
- Does NOT cover M-8 or M-9 (verdict/runId latches) — follow-up tasks.
- Copy strings untouched (byte-identical).

## Verification
- `cd apps/web && npx vitest run app/dashboard/new/page.test.tsx` → 38 passed (37 baseline + 1 new). (Note: must run from apps/web; repo-root run fails to resolve `@/` alias — pre-existing, unrelated.)
- `cd apps/web && npx tsc --noEmit` → exit 0.
- `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` (repo root) → exit 0, zero warnings.
- `npx prettier --check` on both files → clean.
- Guard test: temporarily removed the `!ok`-path reset (GUARD-BREAK comment) and ran `-t "retries on the next submit"` → 1 failed / 37 skipped, failing at the retry count assertion (`/api/bots` stayed at 1 call). Restored → full suite 38/38 green.
- Diff reviewed: no secrets; failure-path lines only in page.tsx plus the one new test.
