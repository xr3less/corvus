# Task Report: wave1b2d-detail

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx

## Dependencies Added

- None. No manifest touched; no install run.

## Assumptions Made

- Consumed `apps/web/components/ui/use-chat-stream.ts` (lines 125-160) and `apps/web/lib/conversations/client.ts` (lines 94-113) read-only: POST /api/conversations precedes POST /api/chat via deduped `ensureConversation()`, coerced botId `{ botId: null }` for mock ids, append is best-effort AFTER the stream settles.
- Detail page (`apps/web/app/dashboard/bots/[id]/page.tsx`) untouched per scope: mount order is trial signal -> draft load -> conversation open -> chat; only the test's fetch stub needed re-alignment.
- Used a fixed honest conversation id `22222222-3333-4444-8555-666666666666` (valid uuid, so append/get routes pass `isUuid`) for the conversation stubs; it never travels on chat/spec writes.
- Turkish constants untouched and byte-identical; no frozen strings, no emoji, no new user strings.

## Open Questions for Orchestrator

- None. Scope held: only the one test file modified; other `git status` entries pre-exist from parallel waves.

## Public Interface Exposed

None (test-only change). Test helper shape inside the three fixed tests:

```ts
// URL-routed fetch stub: /api/conversations* answered honestly, everything
// else served positionally from a queue (trial 401, draft 404, chat streams).
// POST /api/conversations -> { conversationId }
// GET  /api/conversations -> { conversations: [] }
// GET  /api/conversations/[id] -> { turns: [] }
// POST /api/conversations/[id] -> { saved: 2 }
```

## Known Limitations

- Test-only fix; no product code touched.
- `git diff --name-only` repo-wide lists other pre-existing wave modifications; within this task's scope exactly one file changed (this test file), verified via `git diff --name-only -- "apps/web/app/dashboard/bots/[id]/page.test.tsx"`.

## Verification

- Before: `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` in `apps/web` -> 56 passed, 3 failed (`second turn carries the completed first turn as history`, `a 401 says logged-out in plain words and Tekrar dene re-issues after login`, `shows an honest inline error and Tekrar dene re-issues the same message on one row`).
- After: same command -> `Test Files 1 passed (1) / Tests 59 passed (59)`, exit 0.
- `npm run typecheck --workspace @corvus/web` from repo root -> exit 0.
- `npx eslint "apps/web/app/dashboard/bots/[id]/page.test.tsx" --max-warnings 0` from repo root -> exit 0 (also verified workspace-relative; root invocation resolves after shell glob handling).

## What Changed (truthful counts, no vacuous weakening)

- `second turn carries...`: chat slots located by URL filter (`/api/chat` x2) instead of positional index 3; open POST asserts `{ botId: null }` (botId:null coercion preserved); total-call wait is 6 (trial + draft + open + chat1 + append1 + chat2; append2 never fires while stream 2 is open).
- `a 401 says logged-out...`: retry located by `/api/chat` x2 wait instead of total-call count 4; open/append stubbed honestly.
- `honest inline error...`: retry located by `/api/chat` x2 wait instead of total-call count 4; open/append stubbed honestly.
