# Task Report: fix-chat-spend-retry

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/chat/route.ts (spend-accounting only: reservation, failover-aware estimate, abort/mid-stream spend write, mid-stream catch logging)
- MODIFIED: apps/web/app/api/chat/route.test.ts (updated locking test + new coverage)

## Dependencies Added
None.

## Assumptions Made
- `ai_spend` has no reservation/hold column, so the m-23 hold is a same-shape estimate row trued up with one UPDATE (one row per turn), not a separate state machine.
- persona lane has 3 routes today; the m-24 multiplier derives from `LANES.persona.length` so it tracks lane edits automatically.
- Client-abort turns reserve the full worst case; provider-throw turns with unknown metering write the usage-unavailable NULL row (never zero).

## Open Questions for Orchestrator
None.

## Public Interface Exposed
No public interface changes. Internal helpers added in route.ts: `reserveChatSpend`, `trueUpChatSpend`, `PERSONA_RESERVE_CALLS`, `PERSONA_RESERVE_CREDITS`. Gate semantics unchanged (spent + reserve > allowance refuses; landing exactly on it allows).

## Known Limitations
- Reservation is an estimate row, not a transactional hold: two turns admitted in the same instant before either INSERT lands can still both pass; the window is narrowed to the reserve-write latency, not eliminated.
- The mid-stream true-up UPDATE has no row-count check; a concurrent cleanup deleting the hold would silently leave zero rows (no such deleter exists today).

## Verification
- `npx vitest run app/api/chat/route.test.ts` from apps/web: 33 passed.
- `npx vitest run lib/chat/thread.test.ts` from apps/web: 18 passed (sibling regression check).
- `npx tsc --noEmit` from apps/web: exit 0.
- `npx eslint apps/web/app/api/chat/route.ts apps/web/app/api/chat/route.test.ts` from repo root: exit 0, zero warnings.
- `npx prettier --check` on both files: clean.
- Guard mutation: replaced the no-`done` fallback write with a no-op, suite went 1 failed / 32 passed (failing test: "writes an estimated spend row on a mid-stream throw (same shape as success)"); restored from outside-repo backup, SHA256 verified byte-identical for both files (route `60D2436B...`, test `8E4F902E...`), suite re-run 33 green.
- Locked user-facing copy untouched (refusal sentences, error frame verified byte-identical via diff grep); no secrets in diff (only `test-key` placeholders).
