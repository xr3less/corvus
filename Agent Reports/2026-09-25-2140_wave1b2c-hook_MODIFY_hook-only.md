# Task Report: wave1b2c-hook-only

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/components/ui/use-chat-stream.ts
- MODIFIED: apps/web/components/ui/use-chat-stream.test.tsx

## Dependencies Added

- None. No new runtime dependency; no manifest touched; no install run.

## Assumptions Made

- Consumed `apps/web/lib/chat/thread.ts` read-only: `ensureConversationForBot(rawBotId)`, `persistThreadTurns(conversationId, rows)`, `chatBotId`, `threadHistory`, `historyBefore`, `parseSseFrame`, `readHttpError`, plus the `ThreadRow` / `ChatStreamEvent` types. Ordering contract honored per thread.ts:175-176 (ensure awaited BEFORE the send lane and before the page verdict effect reads rows).
- Consumed the single allowed down-path sentence only via the helpers' `notice` field (`result.notice`); the hook file holds no literal copy of that sentence. Verified by grep: zero literal occurrences in `use-chat-stream.ts`.
- `persistThreadTurns` short-circuits empty turns (`{ ok: true, saved: 0 }`, thread.ts:300-301), so the hook's finally-block append call is safe on a stream that died before its first event; no extra guard was added in the hook.
- `'use client'` stays correct (state + event handlers, no `useSearchParams` in the hook) per the client-component convention checked in `node_modules/next/dist/docs/` (hoisted at repo root). No frozen motor file touched; no frozen string altered.
- Existing page callers (`apps/web/app/dashboard/new/page.tsx:190`, `apps/web/app/dashboard/bots/[id]/page.tsx:301`) destructure a subset (`{ messages, streaming, submit, retry }`), so the extended return shape (`stop`, `conversationId`, `historyNotice`) is backward compatible — verified by grep, pages untouched per scope.
- Vitest must run from inside `apps/web` for the `@/` alias (repo-root invocation fails to resolve `@/lib/chat/thread`; same toolchain note as reviewer wave1b2b). All test commands below ran workspace-scoped.

## Open Questions for Orchestrator

- None. No scope expansion needed. `thread.ts`, `dashboard-rail.tsx`, `page.tsx` files, routes, `client.ts`, frozen files, migrations, and manifests untouched — `git status --short` for the two in-scope paths shows exactly `M` on those two files.

## Public Interface Exposed

```ts
export function useChatStream(botId: string | null | undefined): {
  messages: ThreadRow[];
  streaming: boolean;
  submit: (value: string, attachments: File[]) => void;
  retry: (id: string) => void;
  reset: () => void;
  stop: () => void; // NEW — local-only halt
  conversationId: string | null; // NEW — server thread id, null while down
  historyNotice: string | null; // NEW — single honest sentence when down
};
export const ATTACHMENTS_UNSUPPORTED: string; // unchanged (M-6)
```

Behavior:

- `runStream` awaits a deduped `ensureConversation()` (one in-flight POST per raw bot key; keyed on the RAW id so a verdict-scoping change re-ensures) BEFORE `POST /api/chat` — open POST precedes chat POST, asserted byte-exact in-test (`{ botId: null }` for null and coerced `bot-3`).
- Abort during ensure (reset/stop/unmount): no chat fetch launches; guarded unlock restores the composer (a reset-then-resubmit keeps its own lock — pinned by the new `reset during the conversation open` test).
- Finally-block persist is best-effort via `messagesRef` mirror (every writer goes through `setRows`; retry/history reads use the ref): skipped when `persistedId === null` or locally aborted; a failed persist only sets `historyNotice` once (`current ?? notice`), local rows always stay.
- `stop()` aborts only the in-flight `/api/chat` fetch and clears the abort ref — no verdict/build request, no DELETE, no copy claiming otherwise.
- Fail-closed: failed ensure/append sets `historyNotice` (the one allowed sentence) and the send lane continues; rows persist locally.

## Known Limitations

- The hook never rehydrates history on mount and never lists/opens/deletes conversations — that is the rail's job (`dashboard-rail.tsx`); thread rendering/selection wiring stays Wave 4's (`page.tsx` untouched).
- History passed to `/api/chat` is the pre-submit local thread (`threadHistory(messagesRef)` at submit time); rehydrated server turns are not merged here — Wave 4 integration owns that.
- `stop()` cannot stop a server build started through the verdict path (by contract it is local-only); the comment on `stop()` states this explicitly.
- Verified: `npm run typecheck --workspace @corvus/web` exit 0; `npx eslint apps/web/components/ui/use-chat-stream.ts apps/web/components/ui/use-chat-stream.test.tsx --max-warnings 0` exit 0; `npx vitest run components/ui/use-chat-stream.test.tsx components/ui/dashboard-rail.test.tsx lib/chat/thread.test.ts lib/conversations/client.test.ts` in `apps/web` — 4 files, 82/82 green (hook suite 10/10: 6 pre-existing incl. M-6 guard + 4 new persistence tests; neighbors rail/thread/client unchanged green). No `any`, no non-null assertion in the hook diff, no secrets, no git restore commands, local checks only.
