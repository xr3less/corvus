# Review Report: reviewer-wave1b1-client

## Verdict

PASS

## Scope

Reviewed ONLY:

- apps/web/lib/conversations/client.ts (9212 bytes)
- apps/web/lib/conversations/client.test.ts (9450 bytes)

Both files confirmed on disk. `git status --porcelain -- apps/web/lib/conversations/` shows only `?? apps/web/lib/conversations/` (untracked dir holding exactly these two files). No out-of-scope writes.

Whitelist read: orchestrator SPEC `2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md`, wave-1 pack `2026-09-25-1806_wave-1-pack_conversation-persistence.md`, wave1b1 report `2026-09-25-1942_wave1b1-conv_CREATE_client-only.md`, wire-shape reference `apps/web/app/api/conversations/route.ts` plus `[id]/route.ts` (turn/note/deleted/saved shapes only). No other reports read.

## 1. Works — gates with exact exits/counts

- `npm run typecheck --workspace @corvus/web` (repo root): EXIT 0, `tsc --noEmit` clean.
- `npx eslint apps/web/lib/conversations/client.ts apps/web/lib/conversations/client.test.ts --max-warnings 0` (repo root): EXIT 0, no output.
- `npx vitest run lib/conversations/client.test.ts` (in `apps/web`): 1 test file passed, 23/23 tests passed, EXIT 0.

## 2. Contracts

- **Fail-closed, never throw:** all five functions (`openConversation`, `listConversations`, `getConversationTurns`, `appendTurns`, `deleteConversation`) wrap `fetch` in try/catch returning `{ ok:false, status, notice }`; `readJson` catches non-JSON bodies to `null` which then fails closed. No `throw` statement in code (grep `throw` hits only two prose comments). Delete path requires `payload['deleted'] === true` or it returns failure — a failed/malformed delete never reads as confirmed (test: `{}` body asserts `ok === false`; 404 and network-throw both assert failure).
- **Malformed ids fail fast locally:** `getConversationTurns`, `appendTurns`, `deleteConversation` all gate on `isUuid(conversationId)` before any fetch, returning `failure(null)`; tests assert `fetch` not called for `'not-an-id'` on get and append. `openConversation(botId)` takes `string | null` without local uuid coercion — matches the wave1b1 assumption that the caller owns display-id coercion; POST `botId` shape is server-validated (422/404), so no contract breach.
- **camelCase wire assumption independently confirmed:** route `GET` builds `ConversationListItem { id, botId, title, updatedAt }` in TS (route.ts lines 60-65) via `readListItem` converting DB `bot_id`/`updated_at` (snake) to camelCase, then answers `Response.json({ conversations })`. So the JSON wire IS camelCase — client `readListItem` reading `row['botId']`/`row['title']`/`row['updatedAt']` matches. The wave1b1 report's hedge ("if the route returns snake_case JSON...") misreads its own evidence: the snake_case reads are from DB rows, not the wire. Wire contract holds; malformed-row drop remains as defense-in-depth.
- **`[id]` shapes confirmed:** turns carry `{ id, role, text }` (`LIST_TURNS_SQL` + `readTurn`), truncation note is `OLDER_HISTORY_NOTE = 'older-history-truncated'`, append answers `{ saved: number, turns }`, DELETE answers `{ deleted: true }` — all consistent with what the client parses.

## 3. Freeze

- `HISTORY_UNAVAILABLE_NOTICE = 'Conversation history unavailable — new messages still send.'` — byte-identical to SPEC §3 Wave 1 sentence (em dash, trailing period); test pins it with `toBe` against the same literal.
- `OLDER_HISTORY_NOTE = 'older-history-truncated'` — identical to `[id]/route.ts` line 59; it is a diagnostic branch key, never rendered.
- No frozen Turkish string present or altered; no emoji found; no `!` in any user-facing string (code `!` occurrences are only `!response.ok`, `!isRecord`, `!Array.isArray`, `!Number.isInteger`, `!==` negations — zero non-null assertions).

## 4. Quality

- No `any` type (grep hits only the English word "any" in a prose comment), no non-null assertion, no secrets/credentials, no hardcoded user strings beyond the one frozen notice.
- No new dependencies: only import is `isUuid` from `../editor/drafts` plus `vitest` in the test; no manifest touched (wave1b1 report declares none, git status confirms).
- Scope discipline kept: header comment names SOLE OWNER wave1-conv, wave4-hub read-only, and explicitly does not import `thread.ts` / `use-chat-stream.ts` / `dashboard-rail.tsx`.
