# Task Report: expansion-e2a-chatsystem

## Status
PARTIAL

## Files Touched
- MODIFIED: apps/web/app/api/chat/route.ts (2 hunks only: import `buildPersonaPrompt` from `@corvus/ai`; prepend `{ role: 'system', content: buildPersonaPrompt() }` to the `chatStream` message array)

## Dependencies Added
None. No manifest edits, no installs (nothing run).

## Assumptions Made
- Called `buildPersonaPrompt()` with NO botName (matching the locked KI-036 behavior "System prompt is `buildPersonaPrompt()` with NO botName"). The route body carries only `botId` (a uuid, not a name), and resolving a name would require a new DB read inside the metered/gated path — out of scope and a new failure mode. If the orchestrator wants the botName variant, a follow-up task must add a name lookup (or a `botName` body field) plus its tests.
- "History cap 12" read as do-not-change: route validation `HISTORY_MAX_TURNS = 20` and client tail `HISTORY_MAX_ROWS = 12` both left untouched; gates, metering, reservation/true-up, and SSE framing byte-identical.
- `ChatMessage.role` is `string`, so the `system` role needs no type change (typecheck confirms).

## Open Questions for Orchestrator
- `apps/web/app/api/chat/route.test.ts` was NOT touched (out of scope: only `route.ts` whitelisted) but 3 tests pin the OLD no-system-prompt contract and now fail BY DESIGN: `route.test.ts:265-271` (`toHaveBeenCalledWith` exact `messages: [{ role: 'user', content: 'hi' }]`), `:294-303` (history-forward exact match), and `:306-337` (explicit old-contract guard: `toEqual([...history, message])` + `messages.some(m => m.role === 'system')` false, comment says "Fails if any system-message injection returns"). A follow-up test-update task (allowed to modify `route.test.ts`) must update these three assertions to expect the leading system message; nothing else in the suite depends on the old shape (30/33 pass).

## Public Interface Exposed
No interface changes. `POST /api/chat` request/response shapes, status codes, SSE frames, ledger columns (`model='persona'`, `reason='persona-run'`), and exported test hooks (`__setPool`, `__setSessionReader`, `validateChatBody`, `ChatSession`) all unchanged. The only behavioral delta is the first element of the provider-bound message array.

## Known Limitations
- Chat route tests NOT green: 30/33 pass; the 3 failures are the old-contract pins named above (intentional contract change, test file out of scope for this task).
- No `botName` personalization (see Assumptions) — the persona prompt's botName branch is unexercised by this route.
- No live-model verification performed (no provider keys touched, no network calls); system-message content is the already-locked, verbatim-tested `buildPersonaPrompt()` output.
- No secrets read or printed (only `*_API_KEY` env names referenced); no ledger/SSE contract change; no git restore/commit commands used (read-only `diff --stat`/`status` only, plus pre-existing tree modifications untouched).

## Verification
- `npm run typecheck --workspace @corvus/web` → exit 0, zero errors.
- `npm run lint --workspace @corvus/web -- app/api/chat/route.ts` → exit 0, zero warnings.
- `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → 30 passed / 3 failed, all 3 failures the old-contract pins above (failure diff shows the leading `{ role: 'system', content: <persona prompt incl. 'Can I start? Reply yes to build.'> }` frame followed by the unchanged history+message tail).
- `git status --short -- apps/web/app/api/chat/route.ts` → only that file modified by this task.
