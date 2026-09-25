# Task Report: expansion-e2c-interview

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/interview/answer/route.ts

## Dependencies Added
None.

## Assumptions Made
- builder/start's enqueue block (route.ts:193-211: boss.start, createQueue(BUILDER_QUEUE), boss.send with { runId, botId, brief } plus singletonKey/retryLimit/retryDelay/expireInSeconds/deleteAfterSeconds, plus markEnqueueFailed flip to `failed`) is the locked provenance to copy; copied identically rather than importing across routes (keeps the one-file scope).
- Brief source: the recorded interview answers already loaded for the spec mint (same `entries` array), stitched as one `questionId: answer` line each, clamped to the 1..2000 builder contract. No model call, no new input surface.
- Enqueue is best-effort after the COMMIT: the draft-spec write is authoritative, so an enqueue failure still answers 200 done with the minted spec plus an honest `enqueue: 'enqueue_failed'` marker (never a mint failure). Duplicate-completion path (23505 -> 422) is untouched and enqueues nothing.
- Done response is additive only: `{ done, draftSpecId, version }` preserved; success adds `runId` + `phase: 'queued'` for BuilderProgress wiring. Non-done (nextQuestion) responses unchanged.
- Injectable `__setBossFactory` / `__resetBossFactory` seam mirrors builder/start so future hermetic tests can stub pg-boss without env vars.

## Open Questions for Orchestrator
None.

## Public Interface Exposed
- `BUILDER_QUEUE = 'builder'` (re-exported constant, same queue name as builder/start).
- `BuilderBoss` interface + `__setBossFactory` / `__resetBossFactory` (test-only writers, same shape as builder/start).
- POST /api/interview/answer done body: `{ done: true, draftSpecId, version: 1, runId, phase: 'queued' }` on enqueued success; `{ done: true, draftSpecId, version: 1, enqueue: 'enqueue_failed' }` when the post-commit enqueue fails.

## Known Limitations
- This task covers the server enqueue only; no client change (interview page does not yet wire runId into BuilderProgress — a separate file/scope).
- Live pg-boss enqueue is exercised only where DATABASE_URL + a reachable boss exist; in suites without a boss the route degrades to the honest `enqueue_failed` marker with the mint intact (verified: interview suite green either way).
- Verification: `npx tsc --noEmit` zero errors (apps/web); `npx eslint app/api/interview/answer/route.ts` zero warnings; `vitest run app/api/interview/interview.test.ts` 14/14 green; interview page + lib suites (page, session-bind, tree, progress-store) 35/35 green.
