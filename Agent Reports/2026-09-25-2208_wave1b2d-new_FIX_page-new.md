# Task Report: wave1b2d-new

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/new/page.test.tsx

## Dependencies Added

- None. No manifest touched; no install run.

## Assumptions Made

- Consumed `apps/web/components/ui/use-chat-stream.ts` (lines 125-160) and `apps/web/lib/conversations/client.ts` (lines 94-113 plus 144-249 for list/get/append shapes) read-only: every submit awaits deduped `ensureConversation()` (POST /api/conversations, `{ botId }` coerced via `chatBotId`) BEFORE POST /api/chat, and appends completed rows AFTER the stream settles (POST /api/conversations/[id], `{ turns }`, short-circuits empty with `{ saved: 0 }`).
- The new page test file is git-tracked but its HEAD content predates Wave 1 wiring, so working-tree state needed stub re-alignment only; no product file touched.
- The open id doubles as the mint botId default (`conversationStub(url, init, botId)` defaults to `BOT_ID`, per-stub override for fixed-id tests). It is a valid uuid so `isUuid` passes on append/get paths; it never travels on chat/verdict bodies asserted by pins.
- Turkish constants untouched and byte-identical; no frozen strings, no emoji, no new user strings. `getByText('Build failed with error')` matches `run-timeline.tsx:178` byte-exact (substring of the component's own heading); the old exact `'Build failed'` could never match Testing Library exact-string semantics.

## Open Questions for Orchestrator

- None. Scope held: only the one test file modified; other `git status` modified entries pre-exist from parallel waves.

## Public Interface Exposed

None (test-only change). Test helper shape inside the fixed suite:

```ts
// Conversation-lane stubs matching lib/conversations/client.ts shapes:
// POST /api/conversations -> { conversationId } (valid uuid, defaults BOT_ID)
// GET  /api/conversations -> { conversations: [] }
// GET  /api/conversations/[id] -> { turns: [] }
// POST /api/conversations/[id] -> { saved: 0 }
function conversationStub(url: string, init?: RequestInit, botId: string = BOT_ID);
// Only /api/chat draws from the stream queue; verdict/builder/mint stubs byte-identical.
```

## Known Limitations

- Test-only fix; no product code touched.
- `git diff --name-only` repo-wide lists pre-existing wave modifications; within this task's scope exactly one file changed (`apps/web/app/dashboard/new/page.test.tsx`), verified via `git diff --name-only -- apps/web/app/dashboard/new/page.test.tsx`.

## Verification

- Before: `npx vitest run app/dashboard/new/page.test.tsx` in `apps/web` -> 22 passed, 36 failed (every stub that counted chat slots positionally; plus 2 M-9 exact-match misses).
- After: same command -> `Test Files 1 passed (1) / Tests 58 passed (58)`, exit 0.
- `npm run typecheck --workspace @corvus/web` from repo root -> exit 0.
- `npx eslint apps/web/app/dashboard/new/page.test.tsx --max-warnings 0` from repo root -> exit 0 (also clean workspace-relative).
- `git diff --name-only -- apps/web/app/dashboard/new/page.test.tsx` -> exactly that one path.

## What Changed (truthful counts, no vacuous weakening)

- `chatFirstStub` + all 12 `mockImplementation` + 15 `vi.fn` stubs: added `(url, init?)` signature and `conversationStub(url, init, <botId>)` fallthrough BEFORE any chat/verdict routing, so the ensure POST no longer steals a stream slot. Verdict/builder/mint stubs byte-identical.
- Mint-gate, retry-mint, failing-mint (500), trial-gate (403), mid-mint-gate, and second-half re-stub sites routed the same way.
- Stream-queue stubs (`streams.push`) gated on `url === '/api/chat'` with fail-fast reject on anything else.
- `second turn carries...`: sync `toHaveLength(2)` became `await waitFor(...)` (ensure POST precedes chat POST; second chat is async-awaited after the first stream settles).
- M-9 tests: added `waitFor(streams).toHaveLength(n)` before each positional push (streams array now fills only on /api/chat, so the queue lags one microtask behind submit).
- M-9 assertions (2x): `getByText('Build failed')` -> `getByText('Build failed with error')` per `run-timeline.tsx:178`.
- All pins kept truthful: mint-once, verdict once-guards, M-6 attachment guard, position-gate, 12-turn tail, bounds checks, Turkish copy — unchanged.
