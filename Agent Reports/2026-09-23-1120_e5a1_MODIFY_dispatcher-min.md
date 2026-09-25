# Task Report: expansion-e5a1-dispatcher-min

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/runtime/dispatcher.ts
- MODIFIED: apps/gateway/src/runtime/dispatcher.test.ts

## Dependencies Added
- None

## Assumptions Made
- deferReply() is called non-ephemerally (no ephemeral flag on the ack); the honest error reply stays ephemeral via followUp/reply, matching the pre-existing ephemeral error-path convention.
- RateLimitError.retryAfter from @discordjs/rest is milliseconds (verified in node_modules/@discordjs/rest/dist/index.d.ts); raw Discord `retry_after` seconds shape also handled, each wait capped at 10s, default 1s when neither field is present.
- Cooldown-denial reply is intentionally NOT deferred (deny happens before ack, unchanged behavior); defer-first applies only to the execute path.
- Default maxRateLimitRetries = 2 (up to 3 attempts per Discord-touching step: defer, execute, deny-reply, error-reply). Reviewer guard-broken case in Agent Reports/2026-09-23-0825_reviewer_REVIEW_gateway-smalls.md noted a prior m-31 cooldown regression; all m-31 tests still pass after this change (run only the dispatcher test file per command budget, not the full suite).
- Pre-existing test 'uses followUp when execute throws after the interaction was replied to' and 'never throws when the error reply itself fails' left semantically intact; the generic-throw test renamed to reflect post-e5a1 followUp behavior (defer lands first, so execute's throw now follows up).

## Open Questions for Orchestrator
- None. No handler modules touched, no new BotEvents, no secrets involved.

## Public Interface Exposed
- `createDispatcher(registry, opts)` unchanged signature, `DispatcherOptions` extended with two optional fields:
  - `maxRateLimitRetries?: number` (default 2) — bounded Discord 429 retries per Discord-touching step.
  - `sleep?: (ms: number) => Promise<void>` (default setTimeout-based) — injectable backoff sleep for instant tests.
- Dispatcher flow per interaction: non-chat-input ignore → unknown-command log+return → cooldown pre-check (deny = ephemeral reply) → defer-first ack (`deferReply()` before `execute()`, skipped if already replied/deferred) → `execute()` with 429 backoff → honest ephemeral error reply (`followUp` if replied/deferred else `reply`; rate-limit-exhausted message names rate limiting explicitly). Cooldown stamp still lands only after successful execute (m-31 preserved). Error reply never escapes (bare try/catch preserved).
- New error-path event: `dispatcher-ack-error` (logged when acknowledge itself fails after 429 backoff); existing `dispatcher-command-error` and `dispatcher-unknown-command` unchanged; backoff attempts logged as `dispatcher-rate-limit-backoff` (info).
- Tests added (colocated, mocked interaction, injectable sleep, no live Discord): (a) slow-handler defer-before-execute ordering, (b) 429 retry-after backoff then completion, (c) exhausted retries → honest rate-limit error reply, no throw, execute never called.

## Known Limitations
- Ran ONLY the dispatcher test file (`npx vitest run src/runtime/dispatcher.test.ts` from repo root: 11/11 passed) plus gateway package typecheck (`npx tsc --noEmit -p apps/gateway/tsconfig.json`: exit 0). Full gateway suite and repo-wide lint deliberately skipped per command budget.
- Real-Discord verification (10062 avoidance against a live token, true 429 from Discord) not performed — unit fakes only, no live Discord per requirements. No secrets touched (presence-by-length not even needed; no env read).
