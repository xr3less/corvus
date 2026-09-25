# Task Report: expansion-e5a1r-retry-narrow

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/runtime/dispatcher.ts
- MODIFIED: apps/gateway/src/runtime/dispatcher.test.ts

## Dependencies Added
- None

## Assumptions Made
- `withRateLimitRetry` helper retained for ack (deferReply), cooldown-deny reply, and honest error reply steps only; it no longer wraps `command.execute()`.
- Execute-once is a structural guarantee (single `await command.execute(interaction)` call site, no loop/retry around it) rather than a guard flag — no flag state to leak across interactions.
- Existing 429-backoff test ('backs off on 429 with retry-after and completes') still passes unchanged: ack-429 retries the ack, then execute runs once.

## Open Questions for Orchestrator
- None. No handler modules touched, no new BotEvents, no secrets involved.

## Public Interface Exposed
- `createDispatcher(registry, opts)` signature unchanged (`maxRateLimitRetries`, `sleep`, `now`, `logger` all intact).
- Flow per interaction unchanged except: `execute()` invoked at most once; a 429 thrown mid-handler goes straight to the honest ephemeral error reply (rate-limit wording via `followUp` when deferred, `reply` otherwise) with `dispatcher-command-error` logged. Defer-before-execute ordering, bounded retries with retry-after respect + cap, cooldown stamp-after-success (m-31), and bare-try/catch error path all preserved.
- New test: 'e5a1r: execute 429 is never retried — handler side effects run at most once' (execute throws RateLimitError → exactly 1 execute call, 1 defer, 1 followUp rate-limit reply, no throw).

## Known Limitations
- Ran ONLY the dispatcher test file (`npx vitest run src/runtime/dispatcher.test.ts` from repo root: 12/12 passed) plus gateway package typecheck (`npx tsc --noEmit -p apps/gateway/tsconfig.json`: exit 0). Full gateway suite and lint deliberately skipped per command budget.
- No live-Discord verification (unit fakes only, no live Discord per requirements). No secrets touched.
