# Task Report: wave1a2fix-delete-ownership

## Status

SUCCESS

## What changed and why

- `DELETE /api/conversations/[id]` now calls `loadOwned(id, session.accountId)` FIRST and returns 404 before any DELETE runs. Previously it deleted turns (unscoped) before the account-scoped conversation delete, so a foreign DELETE wiped the victim's turns then answered 404.
- Ownership is the requirement: an owned conversation whose bot is soft-deleted is still deletable (orphaned-thread cleanup), matching the migration (no `deleted_at` on conversations).
- The `[id]` test fake is now stateful (turn-delete really removes rows, conversation-delete really removes the row) so the foreign-DELETE test proves turns survive.

## Files Touched

- MODIFIED: apps/web/app/api/conversations/[id]/route.ts (DELETE handler only — added loadOwned-first guard; GET/POST untouched)
- MODIFIED: apps/web/app/api/conversations/[id]/route.test.ts (stateful fake + strengthened DELETE tests only)

## Dependencies Added

- None. No manifest edits, no installs.

## Assumptions Made

- Sequential ownership-first deletes (turns, then conversation) with no transaction: the codebase has no established BEGIN/COMMIT transaction pattern for multi-statement route writes — all sibling routes use sequential `getPool().query` calls, so a transaction would be a new pattern invented for one handler. Crash-between-deletes can leave turns deleted under a live conversation, but it cannot leak across accounts (both deletes are now ownership-gated), which was the blocking defect.
- Orphaned-thread cleanup allowed: owned conversation + soft-deleted bot → DELETE proceeds (200). GET/POST keep their stricter 404-on-botDeleted behavior; DELETE is the cleanup path.
- Dead `LIST_TURNS_SQL` export left untouched per scope (wave closeout owns that cleanup).

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

- Unchanged shapes: `DELETE /api/conversations/[id]` → 200 `{ deleted: true }` / 404 `{ error: 'not found' }` / 500 `{ error: 'could not delete conversation' | 'database not configured' }`.
- Test seam additions on the fake only (not production): `remainingTurns()`, `remainingConvs()`.

## Known Limitations

- Hermetic fake-pool tests only (33 green: 13 list + 20 [id]); no live-Postgres path exercised.
- Old-ordering failure proven by reasoning (stateful fake removes rows on turn-delete; old code issued turn-delete before any ownership read), not by a stage-and-revert run — no git restore commands used per guards.

## Verification

- `npx vitest run "app/api/conversations/[id]/route.test.ts" "app/api/conversations/route.test.ts"` in apps/web → 2 files, 33 tests green.
- `npm run typecheck --workspace @corvus/web` → exit 0.
- `npx eslint <both touched files> --max-warnings 0` from repo root → exit 0.
- New tests: foreign DELETE → 404 with turns + conversation intact and zero DELETE queries issued; own DELETE → 200 with turns + conversation gone; owned + soft-deleted bot → 200.
