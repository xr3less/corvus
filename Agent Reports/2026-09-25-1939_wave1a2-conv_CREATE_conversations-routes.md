# Task Report: wave1a2-conv-routes

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/app/api/conversations/route.ts
- CREATED: apps/web/app/api/conversations/[id]/route.ts
- CREATED: apps/web/app/api/conversations/route.test.ts
- CREATED: apps/web/app/api/conversations/[id]/route.test.ts

## Dependencies Added

- None. No new runtime dependencies; no manifest edits; no install run.

## Assumptions Made

- `gen_random_uuid()` availability and the 0014 table/index shapes come from the already-landed `apps/gateway/drizzle/0014_conversations.sql` (read, not modified); no FK exists, so ownership/append-only are enforced in the route layer per the pack contract.
- POST turns arrive as `{ turns: [{ role, text }] }` (append-only bounded batch, max 50, text 1-2000 trimmed) — the only writer contract the pack's acceptance criteria support; never UPDATE/DELETE existing turn rows.
- `params` is a Promise (`{ params: Promise<{ id: string }> }`, awaited) per the local route-handler guide (`node_modules/next/dist/docs/.../route.md`) and sibling routes (`bots/[botId]/activity`, `bots/[botId]/token`, `templates/[slug]`).
- DELETE removes turns-then-conversation (child before parent) with no soft-delete flag on conversations, matching the migration (no `deleted_at` on conversations).
- Newest-user-row is the current draft and stays out of the GET window; exchange-closing assistant reply kept when stored. No frozen strings touched; error bodies are machine codes only (`unauthorized`, `not found`, `could not ...`, `database not configured`).
- The placeholder `LIST_TURNS_SQL` (ASC twin) constant remains exported for the POST guard's documented ordering; the live POST read uses the DESC twin to cover the thread tail.

## Open Questions for Orchestrator

- None. Sibling owners note: the retry in the prompt title was unnecessary — both CREATE targets were absent, so this attempt created them cleanly with no PARTIAL.

## Public Interface Exposed

- `POST /api/conversations` — body `{ botId: string|null }`; malformed uuid 422, foreign/soft-deleted bot 404, success 200 `{ conversationId }`.
- `GET /api/conversations` — 200 `{ conversations: [{ id, botId, title, updatedAt }] }` newest-first, max 100; empty state `[]`.
- `GET /api/conversations/[id]` — 200 `{ turns: [{ id, role, text }] }` plus `note: 'older-history-truncated'` when older history exists (cap 50, window ends at last stored user exchange, draft excluded); 404 for malformed/unknown/foreign/soft-deleted-bot.
- `POST /api/conversations/[id]` — body `{ turns: [...] }`; idempotent ordered-prefix (role,text) guard, INSERT-only, 200 `{ saved, turns: [{ id }] }`; touches `updated_at` even on fully-duplicate POST.
- `DELETE /api/conversations/[id]` — 200 `{ deleted: true }`; 404 when not owned.
- Pure exports: `windowTurns`, `validateTurnsBody`, constants `TURNS_CAP=50`, `OLDER_HISTORY_NOTE='older-history-truncated'`, `TURNS_BATCH_MAX=50`, `CONVERSATIONS_MAX_LIST=100`, SQL constants, `__setSessionReader/__resetSessionReader` seams.
- All DB failures: honest 5xx (`could not create/load/save/delete conversation(s)`, or canonical `database not configured` via `mapDbError`).

## Known Limitations

- Hermetic fake-pool tests only (19 + 13 = 32 green); no live-Postgres path exercised here.
- POST guard compares the newest ~51 stored turns (exact role+text ordered-prefix); a re-send of the ancient head on a 100+ turn thread would INSERT rather than skip — accepted: clients replay the recent tail (retry/double-path), never the head.
- No list pagination beyond the 100-cap; no title management (column read through as-is).
