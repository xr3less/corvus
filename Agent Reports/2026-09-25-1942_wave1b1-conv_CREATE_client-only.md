# Task Report: wave1b1-conv-client

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/lib/conversations/client.ts
- CREATED: apps/web/lib/conversations/client.test.ts

## Dependencies Added

- None. No new runtime dependency; no manifest touched.

## Assumptions Made

- `botId` coercion (display-id to null) is the caller's job (chatBotId/resolveBotId); this module takes `string | null` and never imports drafts beyond `isUuid`.
- Fetch paths mirror the route shapes already landed: `POST /api/conversations` answers `{ conversationId }`, `GET` answers `{ conversations: [{ id, bot_id->botId... }] }` — note: the route's `readListItem` reads snake_case `bot_id`/`updated_at`, but this client reads the camelCase `botId`/`updatedAt` keys plus `title`; if the route returns snake_case JSON, list items will be dropped as malformed (fail-closed, never crash). Verified against route code: route `readListItem` parses `row['bot_id']`/`row['updated_at']` from DB rows, not the JSON wire shape, so the wire shape contract is owned by the follow-up wiring task to confirm.
- Conversation ids are uuids: malformed ids fail fast locally (no fetch), matching the route's 404-class treatment.
- `vi.stubGlobal('fetch', ...)` is the established fetch-mock pattern (per app/interview/page.test.tsx).

## Open Questions for Orchestrator

- Confirm the wire shape of `GET /api/conversations` JSON (camelCase `botId`/`updatedAt` vs snake_case) before the rail wiring task consumes `listConversations()` — a mismatch currently degrades to an honest empty list, not a crash, but the follow-up task should assert the exact bytes.
- Confirm `GET /api/conversations/[id]` JSON turns carry `{ id, role, text }` plus optional `note: 'older-history-truncated'` (matches [id]/route.ts GET handler) — assumed yes from the sibling test file.

## Public Interface Exposed

```ts
export const HISTORY_UNAVAILABLE_NOTICE: 'Conversation history unavailable — new messages still send.';
export const OLDER_HISTORY_NOTE: 'older-history-truncated';
export interface ConversationListItem {
  id: string;
  botId: string | null;
  title: string | null;
  updatedAt: string;
}
export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
export interface AppendTurn {
  role: 'user' | 'assistant';
  text: string;
}
export interface ConversationsFailure {
  ok: false;
  status: number | null;
  notice: typeof HISTORY_UNAVAILABLE_NOTICE;
}
export async function openConversation(
  botId: string | null,
): Promise<{ ok: true; conversationId: string } | ConversationsFailure>;
export async function listConversations(): Promise<
  { ok: true; conversations: ConversationListItem[] } | ConversationsFailure
>;
export async function getConversationTurns(
  conversationId: string,
): Promise<{ ok: true; turns: ConversationTurn[]; truncated: boolean } | ConversationsFailure>;
export async function appendTurns(
  conversationId: string,
  turns: AppendTurn[],
): Promise<{ ok: true; saved: number } | ConversationsFailure>;
export async function deleteConversation(
  conversationId: string,
): Promise<{ ok: true } | ConversationsFailure>;
```

## Known Limitations

- This task creates the client only. No caller is wired: thread.ts, use-chat-stream.ts, dashboard-rail.tsx, page.tsx untouched (separate follow-up task owns that direction).
- No new user strings: the only owner-surface sentence is `HISTORY_UNAVAILABLE_NOTICE` (SPEC §3 byte-identical). No frozen string altered.
- Fail-closed throughout: network throw, non-2xx, non-JSON, and malformed bodies all return `{ ok: false, status, notice }` and never throw; failed deletes never read as confirmed.
- Verified: `npx vitest run lib/conversations/client.test.ts` in apps/web — 23/23 green; `npm run typecheck --workspace @corvus/web` zero errors; `npx eslint <both files> --max-warnings 0` zero warnings. No `any`, no non-null assertion.
