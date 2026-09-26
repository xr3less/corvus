# Task Report: wave1b2a-thread-only

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/lib/chat/thread.ts
- MODIFIED: apps/web/lib/chat/thread.test.ts

## Dependencies Added

- None. No new runtime dependency; no manifest touched; no install run.

## Assumptions Made

- `apps/web/lib/conversations/client.ts` consumed read-only (the 5 functions + HISTORY_UNAVAILABLE_NOTICE); its wire shape and fail-closed contract taken as landed by wave1b1-conv-client.
- No caller wiring in this task per scope: use-chat-stream.ts, dashboard-rail.tsx, page.tsx, routes untouched. This task exposes the helpers the hook/page wiring task will call.
- `chatBotId` coercion (display id to null) stays the single coercion point; `ensureConversationForBot` reuses it so botId is persisted via POST /api/conversations BEFORE the verdict effect runs.
- GET /api/conversations/[id] excludes the newest user row as the in-flight draft (route `windowTurns`); `overlayDraft` therefore appends the local draft OVER fetched history and never merges it into the persisted window.
- Turn text capped at 2000 chars in `toPersistedTurns` mirrors the [id] route's TURN_TEXT_MAX so a persistable row cannot 422 for shape alone.

## Open Questions for Orchestrator

- None. Hook/page wiring (use-chat-stream.ts + page verdict-effect ordering) belongs to the follow-up task; the ordering contract is documented on `ensureConversationForBot` (await it before the verdict effect).

## Public Interface Exposed

```ts
export const PERSISTED_TURNS_CAP = 50;
export type EnsureConversationResult =
  | { ok: true; conversationId: string; botId: string | null }
  | {
      ok: false;
      botId: string | null;
      status: number | null;
      notice: typeof HISTORY_UNAVAILABLE_NOTICE;
    };
export async function ensureConversationForBot(
  rawBotId: string | null | undefined,
): Promise<EnsureConversationResult>;
export function toThreadRow(turn: ConversationTurn): ThreadRow;
export function toPersistedTurns(rows: ThreadRow[]): AppendTurn[];
export function overlayDraft(persisted: ThreadRow[], draft: ThreadRow[]): ThreadRow[];
export type RehydrateThreadResult =
  | { ok: true; rows: ThreadRow[]; truncated: boolean }
  | {
      ok: false;
      rows: [];
      truncated: false;
      status: number | null;
      notice: typeof HISTORY_UNAVAILABLE_NOTICE;
    };
export async function rehydrateThread(conversationId: string): Promise<RehydrateThreadResult>;
export type PersistThreadTurnsResult =
  | { ok: true; saved: number }
  | { ok: false; status: number | null; notice: typeof HISTORY_UNAVAILABLE_NOTICE };
export async function persistThreadTurns(
  conversationId: string,
  rows: ThreadRow[],
): Promise<PersistThreadTurnsResult>;
```

Fail-closed throughout: transport/status/shape failures return `{ ok: false, status, notice }` with the single allowed sentence and never throw; the /api/chat send lane is never blocked. No new user-facing strings; no frozen string altered. Nothing touches /api/builder/verdict.

## Known Limitations

- Helpers only, no live caller: refresh rehydration, draft overlay, and persistence-down fallback are unit-proven here (fetch-stubbed); the hook/page integration that calls them is out of scope.
- `rehydrateThread` maps server turns with ids byte-identical and assistant rows as `status: 'done'`; clock readings (`startedAt`/`finishedAt`) are not fabricated, so rehydrated rows show no elapsed readout.
- Verified: `npm run typecheck --workspace @corvus/web` exit 0; `npx eslint apps/web/lib/chat/thread.ts apps/web/lib/chat/thread.test.ts --max-warnings 0` exit 0; `npx vitest run lib/chat/thread.test.ts` 32/32 green in apps/web; regression `lib/conversations/client.test.ts + lib/chat/thread.test.ts` 55/55 green. No `any`, no non-null assertion, no secrets.
