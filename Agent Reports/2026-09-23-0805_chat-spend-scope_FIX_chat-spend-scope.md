# Task Report: fix-chat-spend-scope

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/chat/route.ts (removed `buildPersonaPrompt` import + system-message injection; spend code untouched)
- MODIFIED: apps/web/app/api/chat/route.test.ts (restored old persona-call contract assertions; spend tests untouched)

## Dependencies Added
None.

## Assumptions Made
- HEAD (pre-spend-work) is the "old contract": `messages: [...history, { role: 'user', content: message }]` with no system prompt. Removing the injection restores those lines to HEAD-identical, so the prompt change leaves zero diff trace.

## Open Questions for Orchestrator
None.

## Public Interface Exposed
No interface changes. Spend internals unchanged: `reserveChatSpend`, `trueUpChatSpend`, `PERSONA_RESERVE_CALLS`, `PERSONA_RESERVE_CREDITS`.

## Known Limitations
- No abort-signal test added (same gap the reviewer noted); abort branch unchanged.
- Locked-copy sentences and gate messages untouched (byte-level requirement honored; not re-verified with a diff since refusal lines were never in my edit hunks).

## Verification
- `grep buildPersonaPrompt` over `apps/web/app/api/chat/` → no matches.
- `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → 33/33 passed.
- `npm run test --workspace @corvus/web -- lib/chat/thread.test.ts` → 18/18 passed.
- `npm run typecheck --workspace @corvus/web` → exit 0.
- `npm run lint --workspace @corvus/web -- app/api/chat/route.ts app/api/chat/route.test.ts` → exit 0, zero warnings.
- `npx prettier --check` on both files → clean.
- Guard-break: `UPDATE ai_spend` → `UPDATE_BROKEN ai_spend` in `trueUpChatSpend` → suite 3 failed / 30 passed; restored from outside-repo backup (`$env:TEMP/chat-route-backup-0805.ts`), SHA256 `A2FB96D4…` verified identical before/after, region re-read clean (`UPDATE ai_spend` x1, `UPDATE_BROKEN` gone, no `buildPersonaPrompt`); re-run 33/33 green. No git restore commands used.
- Secret scan of the diff: only `test-key` placeholders and `*_API_KEY` env names.
