# Task Report: review-e2-chat

## Status
PASS

## Verdict
Wave E2 (chat-chain coherence) verified on the merged tree. All three legs hold: (1) chat route prepends the locked persona system prompt, (2) builder prompt admits exactly E1's final 8 kinds plus the honest drop line with the 4 one-liners + fenced-JSON contract byte-identical, (3) interview/answer enqueues builder_runs + pg-boss identically to builder/start. No instant-FAIL condition triggered.

## Artifacts Confirmed on Disk
- apps/web/app/api/chat/route.ts (exists; system prepend at lines 428-432)
- apps/web/app/api/chat/route.test.ts (exists; 3 system-first pins at lines 266-275, 298-309, 311-343)
- packages/ai/src/builder-prompt.ts (exists; kinds line 19 + drop line 20)
- packages/ai/src/builder-prompt.parity.test.ts (exists; 3-test parity net)
- apps/web/app/api/interview/answer/route.ts (exists; enqueue block lines 263-322)
- Provenance refs read: apps/gateway/src/runtime/config.ts (RUNTIME_KINDS 8-tuple, lines 11-20), apps/web/app/api/builder/start/route.ts (enqueue block lines 193-211), packages/ai/src/persona-prompt.ts (ask line), apps/web/app/api/builder/verdict/route.ts (ASK_LINE + 409 gate, lines 107-109, 423-426)

## Evidence

### E2a — chat system prepend (PASS)
- route.ts imports `buildPersonaPrompt` from `@corvus/ai` (line 25) and prepends `{ role: 'system', content: buildPersonaPrompt() }` ahead of `...history` + user message in the `chatStream` call (lines 428-432).
- Ask-line chain closes: persona-prompt.ts emits `Can I start? Reply yes to build.` and verdict/route.ts gates the last assistant turn on substring `Can I start?` (409 `no_plan_asked`). The chat path now produces what verdict gates on.
- Intact: HISTORY_MAX_TURNS=20 (route.ts:167) and client HISTORY_MAX_ROWS=12 (lib/chat/thread.ts:76) both untouched; KI-033 trial clock + allowance gates, personaConfigured 500, reserve/true-up metering, SSE framing (`text/event-stream`, `data:` frames, in-stream error frame) all present. Ledger columns unchanged (`model='persona'`, `reason='persona-run'`, one row per turn via hold + UPDATE true-up).
- Tests: `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → 33 passed / 0 failed.
- Typecheck: `npm run typecheck --workspace @corvus/web` (tsc --noEmit) → exit 0.
- Lint: `npx eslint apps/web/app/api/chat/route.ts apps/web/app/api/chat/route.test.ts apps/web/app/api/interview/answer/route.ts --max-warnings 0` → exit 0.

### E2b — builder kinds + parity (PASS)
- builder-prompt.ts kinds line is verbatim E1's final 8 in order: `welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles` — confirmed character-equal to config.ts RUNTIME_KINDS (same order, same hyphenation). Honest line present: `Anything outside these kinds is dropped at runtime — never emit it.`
- `git diff -- packages/ai/src/builder-prompt.ts` shows exactly 2 added lines vs HEAD; the 4 standing one-liners + fenced-JSON contract untouched (existing 11 verbatim tests still green inside the ai suite).
- Tests: `npm run test --workspace @corvus/ai` → 6 files, 144 passed / 0 failed (parity 3 + builder-prompt 11 + persona 37 + budget 39 + eval 28 + ai 26).
- Typecheck: `npm run typecheck --workspace @corvus/ai` → exit 0. Lint on both builder-prompt files → exit 0.
- Break-the-guard proof (no repo files modified; temp copy at $TEMP\guardproof\ outside the repo): exact-list-equality check on the real file → MATCH=true with all 8 kinds; same check on the temp copy with `tickets,` deleted → MATCH=false (7 kinds: welcome|moderation|xp|giveaway|connector|status|reaction-roles). Honest drop line present in repo file. This corroborates the E2b report's live proof (deleted `tickets,` → parity suite red 2-failed/1-passed, restored → ai suite green), and the parity test file content was re-verified (ordered `toEqual([...EXECUTABLE_KINDS])`, per-kind `toContain`, drop-line `toContain('dropped at runtime')`).

### E2c — interview enqueue (PASS)
- answer/route.ts post-commit path: INSERT `builder_runs (bot_id)` RETURNING id (same shape as builder/start), then `boss.start()` → `createQueue('builder')` → `send('builder', { runId, botId, brief }, { singletonKey: runId, retryLimit: 3, retryDelay: 30, expireInSeconds: 3600, deleteAfterSeconds: 604800 })` — option-for-option identical to builder/start/route.ts:193-211. Failure path flips the row to `failed` via `markEnqueueFailed` (same idiom). Brief is the recorded answers stitched `questionId: answer` per line, clamped to the 1..2000 builder contract.
- Draft-spec write unchanged: spec_versions INSERT + bots.draft_spec_id UPDATE + COMMIT intact; duplicate-completion 23505 → 422 path untouched; non-done (nextQuestion) responses unchanged; done response additive only (`runId` + `phase:'queued'` on success, honest `enqueue:'enqueue_failed'` on post-commit enqueue failure, mint intact).
- Tests: `npm run test --workspace @corvus/web -- app/api/interview/interview.test.ts` → 14 passed / 0 failed.

### Toolchain (detected, not assumed)
- Root: typecheck/lint/test are workspace-fanout wrappers; `ci` = build spec + build ai + typecheck + lint + format + test.
- @corvus/web: typecheck `tsc --noEmit`, lint `eslint .`, test `vitest run`. @corvus/ai: typecheck `tsc --noEmit`, test `vitest run`, build `tsc`. Node v24.15.0. All commands above used these real scripts.

### Security / scope guards
- No secrets found: grep for `sk-|ghp_|xoxb|BEGIN (RSA )?PRIVATE KEY` over chat scope + builder-prompt → no matches. Only `test-key` placeholders and `*_API_KEY` env names. No secret value printed, copied, or transmitted.
- No production contact: no SSH, no box .env, no Contabo, no GHCR push, no live keys. No package.json/lockfile/.env edits, no npm install. No git restore-from-HEAD commands (read-only `git diff`/`git status` only), no commits.

## Files Touched
- CREATED: Agent Reports/2026-09-23-1155_reviewer_REVIEW_e2.md
- MODIFIED: none (read-only review; temp guard-proof files live outside the repo at $TEMP\guardproof\)
- DELETED: none

## Dependencies Added
None.

## Assumptions Made
- E1's vocabulary authority is apps/gateway/src/runtime/config.ts RUNTIME_KINDS as confirmed on disk (matches the E1 report's 8-tuple cited by E2b); parity-test duplication without importing gateway is intentional and accepted.
- `buildPersonaPrompt()` bare (no botName) in the chat route is accepted per the locked KI-036 behavior; botName personalization would need a new DB read and is out of scope.

## Open Questions for Orchestrator
- Merged-tree note (not a failure): `git diff` on chat/route.ts shows ~121 changed lines, not just E2a's "2 hunks" — the extra hunks (failover-aware reserve m-24, hold/true-up m-23, mid-stream log m-25, price 0.5→4.4) come from sibling waves sharing the uncommitted tree. E2a's report understates the merged diff but every extra hunk is covered by the now-green 33/33 chat suite and the SSE/ledger contract is proven intact, so this is an observation, not a FAIL. If a per-wave isolated diff is needed, commit at wave boundaries first.
- No client wiring for interview runId → BuilderProgress yet (E2c covers server enqueue only; E2c report flags this as a separate scope). Panel-builds human flow needs that client piece before it is end-to-end visible.

## Known Limitations
- No live-model verification (mocked chatStream lane, no provider keys); ask-line production is proven by prompt-text tests + the prepend pin, not by a live reply.
- Scoped suites only (chat 33, ai 144, interview 14) — full web/gateway suites not run; E2 acceptance's "full web + ai suites green" should be re-confirmed at the wave-commit gate on the merged tree.
- Human flows ("chat builds", "panel builds" to `live` in BuilderProgress) not exercised against a running app + boss; server paths are test-proven, client completion is not in E2 scope.
