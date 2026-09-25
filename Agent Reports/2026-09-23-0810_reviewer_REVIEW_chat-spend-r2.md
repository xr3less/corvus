# Task Report: reviewer-chat-spend-r2

## Status
SUCCESS

## Verdict
Re-verified after scope-trim fix: persona-prompt injection is gone and all four spend-accounting fixes are intact and test-locked.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0810_reviewer_REVIEW_chat-spend-r2.md
- READ (only): Agent Reports/2026-09-23-0805_chat-spend-scope_FIX_chat-spend-scope.md, Agent Reports/2026-09-23-0745_reviewer_REVIEW_chat-spend.md, Agent Reports/2026-09-23-0347_sweep_REVIEW_sweep-synthesis.md (Items M-11, m-23, m-24, m-25 only), apps/web/app/api/chat/route.ts, apps/web/app/api/chat/route.test.ts, apps/web/package.json

## Dependencies Added
None.

## Assumptions Made
- Toolchain detected from disk: npm workspaces (package-lock.json present; no pnpm/yarn/bun lockfile). Real commands used: `npm run test/typecheck/lint --workspace @corvus/web`, prettier via `npx --prefix apps/web`.
- `.env.example` + `package-lock.json` dirt is pre-existing (Creem billing TEST MODE names, dev-login switch, testbot workspace entry) from other uncommitted waves — verified by diff content, not this task; author touched neither.
- Locked-copy check is presence + exact-string (per brief: no HEAD byte-diff).
- $4.40 / lane-count provenance taken from prior review (lanes.ts out of my read scope); re-verified the gate behavior it produces via boundary tests.

## Open Questions for Orchestrator
- The `req.signal.aborted` full-reserve branch (`route.ts:465-466`) still has no abort-signal test — covered by code read only, same gap as the prior review. Acceptable, or require a test?

## Public Interface Exposed
No interface changes by this review. Spend internals verified present: `reserveChatSpend`, `trueUpChatSpend`, `PERSONA_RESERVE_CALLS` (= `LANES.persona.length`, `route.ts:128`), `PERSONA_RESERVE_CREDITS`.

## Known Limitations
- Review is static + suite-level: no live-provider or real-DB run (pool is stubbed by design); concurrency window (two turns racing before either INSERT lands) is narrowed, not eliminated.
- No abort-signal test exists (see Open Questions).

## Verification (exact commands + results)
1. Scope trim: `buildPersonaPrompt` grep over `apps/web/app/api/chat/` → no matches; persona call uses pre-injection contract `messages: [...history, { role: 'user', content: message }]` (`route.ts:428`). Test at `route.test.ts:306-337` asserts the OLD contract with `toEqual([...history, message])` AND explicit `messages.some(m => m.role === 'system')` → false (fails if injection returns).
2. M-11: mid-stream-throw test pins one estimated row with success-row shape (`route.test.ts:339-382`); hold-kept path writes exactly one INSERT, zero UPDATEs (`:384-404`). Abort fallback read-verified (`route.ts:465-468`) but untested.
3. m-23: reserve-INSERT-before-true-up-UPDATE + gate-read-before-reserve ordering test-locked (`route.test.ts:735-754`); refusal-before-reserve locked (403 paths assert zero INSERTs, `:693-733`).
4. m-24: failover-aware reserve (`PERSONA_RESERVE_CREDITS` as `estimatedCredits`, `route.ts:388`) test-locked: 98.5 → 403 (`:715-733`), 97.29664 → 200 (`:783-795`).
5. m-25: `console.error('chat: persona stream failed mid-turn', streamError)` present (`route.ts:443`) and asserted (`route.test.ts:374-378`).
6. Suites: `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → 33/33 passed; `npm run test --workspace @corvus/web -- lib/chat/thread.test.ts` → 18/18 passed.
7. `npm run typecheck --workspace @corvus/web` → exit 0. `npm run lint --workspace @corvus/web -- app/api/chat/route.ts app/api/chat/route.test.ts` → exit 0, zero warnings. `npx --prefix apps/web prettier --check apps/web/app/api/chat/route.ts apps/web/app/api/chat/route.test.ts` → clean.
8. Locked copy exact-string present: trial-ended (`route.ts:88`), trial-budget (`route.ts:107`), error frame (`route.ts:444`). Diff secret-scan: only `test-key` placeholders and `*_API_KEY` env names. No manifest/lockfile/.env edits by this task.
9. MY OWN guard-break (not the author's): `UPDATE ai_spend` → `UPDATE_BROKEN ai_spend` in `trueUpChatSpend` → suite 3 failed / 30 passed; restored from outside-repo backup (`$env:TEMP/chat-route-backup-r2.ts`), SHA256 `A2FB96D4…` verified identical before/after, region re-read clean (`UPDATE ai_spend` ×1, `UPDATE_BROKEN` gone, no `buildPersonaPrompt`); re-run 33/33 green. Test-file hash `86D7574A…` untouched throughout.

Verdict: PASS
