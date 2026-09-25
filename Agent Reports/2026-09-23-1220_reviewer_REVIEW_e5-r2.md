# Task Report: review-e5-safety-2

## Status
PASS

## Files Touched (reviewed, NOT modified)
- apps/gateway/src/runtime/dispatcher.ts + dispatcher.test.ts (read in full)
- apps/gateway/src/runtime/tickets/handler.ts + tickets.test.ts (read in full)
- apps/gateway/src/runtime/reaction-roles/handler.ts + reaction-roles.test.ts (read in full)
- apps/gateway/src/runtime/registry.ts (BotEvent union, lines 30-45 — unchanged/closed)
- apps/gateway/src/runtime/connector/connector.test.ts, games/xp.test.ts, games/giveaway.test.ts, moderation/moderation.test.ts (re-run only)
- apps/web/components/ui/error-card.test.tsx (re-run only)

## Verification (evidence, all on merged working tree)
- Artifacts confirmed present by Read before any check (all files exist on disk).
- Toolchain detected from package.json scripts (NOT assumed): gateway `@corvus/gateway` typecheck = `tsc --noEmit`, test = `vitest run` (v3.2.7); web `@corvus/web` test = `vitest run` (v5.0.0).
- `npm run typecheck --workspace @corvus/gateway` → exit 0, no output.
- `npx eslint apps/gateway/src/runtime/dispatcher.ts dispatcher.test.ts tickets/handler.ts tickets.test.ts reaction-roles/handler.ts reaction-roles.test.ts --max-warnings 0` → exit 0, no output.
- Gateway (run FROM workspace via `npm run test --workspace @corvus/gateway -- <7 files>`): 7 files, 130/130 passed — dispatcher 12, tickets 12, reaction-roles 11, connector 27, xp 18, giveaway 18, moderation 32.
- Web (run FROM workspace): `error-card.test.tsx` 5/5 passed.

## Finding 1 re-check: tickets + reaction-roles defer-compat (prior FAIL item 1) — FIXED
- Grep-proof: in tickets/handler.ts the only `interaction.reply` occurrences are line 314 (inside `respondCompat` internals) and line 549 (catch fallback guarded by `interaction.replied || interaction.deferred` at 546). Same shape in reaction-roles/handler.ts: line 218 (helper internals) + line 584 (guarded fallback at 581). Zero bare `interaction.reply(` remains outside the helper + safe fallbacks.
- `respondCompat` (tickets:306-315, reaction-roles:210-219) branches `followUp` when `deferred || replied`, else `reply` — exactly one message per call, Ephemeral flags preserved.
- Converted call sites are transport-only (zero logic change): tickets 11 sites (open x6, close x2, transcript x2, unknown-subcommand x1), reaction-roles 13 sites (post x5, remove x7, unknown x1).
- Deferred-path proof is genuine, not vacuous: both suites' fakes throw `InteractionAlreadyReplied` on `reply()` when deferred (tickets.test.ts:93-94, reaction-roles.test.ts:119-120), and the 2 new tests pass through the deferred path — deferred /ticket close completes via followUp with no throw (tickets.test.ts:198-212), deferred /role post completes via followUp with no throw (reaction-roles.test.ts:215-227). All pre-existing undeferred tests still pass on the reply path.

## Finding 2 re-check: dispatcher 429 retry narrowing (prior FAIL item 2) — FIXED
- `await command.execute(interaction)` appears exactly once (dispatcher.ts:192), inside a plain try/catch with no loop/retry around it — execute at-most-once holds structurally, no guard flag to leak.
- `withRateLimitRetry` is now used ONLY at: line 147 (deferReply ack), lines 163/165 (honest error followUp/reply), lines 223-228 (cooldown-deny reply). It never wraps execute.
- New test `e5a1r: execute 429 is never retried` (dispatcher.test.ts:355-379): execute throws RateLimitError → exactly 1 execute call, 1 defer, 1 followUp rate-limit reply, no throw, `dispatcher-command-error` logged. Passes.
- Pre-existing backoff tests unchanged and green: ack-429 retries the ack then execute runs once (2 defers + sleep [5ms]); exhausted ack-429 → honest error, execute never called, `dispatcher-ack-error` logged, error reply in bare try/catch so it can never escape.

## Verdict-rule checks
- No InteractionAlreadyReplied path remains for /ticket and /role under defer-first: dispatcher defers first (skipped if already replied/deferred), handlers continue via followUp. Deferred+followUp and undeferred+reply paths line up; no double-ack.
- execute() at-most-once holds under ack-429 (ack retried, execute once) and under execute-429 (execute once, honest error reply, never retried).
- No double-ack, no silent drop (every ack/execute failure lands on the honest ephemeral error reply + log event), no behavior-logic change (payload strings and Ephemeral flags unchanged; same events emitted), no new BotEvents (tickets `events: []`, reaction-roles `MessageReactionAdd` pre-existing; registry union closed and unchanged), no secrets (none touched, printed, or transmitted; no package.json/lockfile/.env edits; no install; no git restore/commit; no prod/SSH/GHCR).

## Dependencies Added
None (review added nothing).

## Assumptions Made
- discord.js 14 semantics (`reply` throws InteractionAlreadyReplied when deferred/replied; `followUp` valid post-defer with Ephemeral) taken from the suites' disk-verified fakes mirroring 14.27.0; not re-verified against live Discord per constraints.

## Open Questions for Orchestrator
- None blocking. Prior review's page.tsx non-E5 mixing note (E6b tail ownership) remains the orchestrator's call but is outside this re-verify scope.
