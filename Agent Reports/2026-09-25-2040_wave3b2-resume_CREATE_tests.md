# Task Report: wave3b2-resume-tests

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/app/api/builder/resume/route.test.ts

## Dependencies Added

- None. No manifest edit, no install run.

## Assumptions Made

- `__setPool` is imported from the route module's re-export (same module the route itself re-exports from `lib/db/pool`), mirroring sibling suites.
- Gate-order test arms only `run_not_failed` for the 409: the `build_in_progress` twin is mutation-proved by the dedicated double-POST test instead, which is the stronger claim.
- The fake JOIN reads `phase IN (...)` active probe by substring match on `phase IN (`; production text is `phase IN ('queued', 'generating', 'syncing')`, which matches.
- Paid-budget message is `This month's 2000 AI credits are used up. Nothing is deleted.` (pro grant 2000, verdict-route shape), verified green against the route's `budgetRefusalMessage`.

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

- None (tests only). Covers the route's POST body, 200/401/403/404/409/422/500 shapes, and the `__setPool` / `__setSessionReader` / `__setBossFactory` seams without modifying them.

## Known Limitations

- No live-PG section: all 19 tests are hermetic fakes, consistent with the verdict suite's non-live majority. The loud-skip live idiom was intentionally not duplicated here.
- The fake `JOIN bots` treats any unseeded id as missing, so the unknown/foreign/soft-deleted 404 variants share one assertion path rather than three separate DB predicates.
