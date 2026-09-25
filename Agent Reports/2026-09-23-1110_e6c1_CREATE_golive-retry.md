# Task Report: expansion-e6c1-golive

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/api/bots/[botId]/go-live/route.ts

## Dependencies Added
None (reuses declared `pg`, `pg-boss`, `next` — orchestrator installs centrally; no install run).

## Assumptions Made
- No partial work existed: `git status --short` / `git diff --stat` run first (read-only); Glob confirmed no `go-live/route.ts` existed, so this is a fresh CREATE, not a MODIFY continuation.
- `guild_installs.preflight` envelope shape and Red semantics come from the shared `apps/web/lib/spec/preflight.ts` helpers (`detectRedFailing`, `latestPreflightEnvelope`) — reused, not reimplemented (mirrors `spec/publish/route.ts:494-499`).
- `audit_events` has no action CHECK constraint (verified in `apps/gateway/drizzle/0006_audit_events.sql`: `action text NOT NULL`), so a `'go-live'` action row inserts cleanly, consistent with the append-only trail (`0006` header: rows INSERTed, never updated/deleted).
- Token presence measured with `octet_length(token_cipher)` in SQL: zero-length = mint placeholder (`'\x'::bytea`, per `bots/route.ts:103-104`); nonzero = stored token. Token bytes never enter this process.
- `bots.status` is unconstrained text (no DB CHECK in `0001_init.sql`), so `status = 'live'` writes directly; this route is the first and only non-test writer (readers: gateway `BOOT_LIVE_BOTS_SQL` live-only filter; E4 sweeper inverts it).
- pg-boss send idiom mirrors `preflight/start/route.ts`: `start → createQueue → send → stop-in-finally`, `createQueue` mandatory (v12 does not auto-create), singleton key = botId, `retryLimit: 3, retryDelay: 30, expireInSeconds: 3600, deleteAfterSeconds: 604800`.
- The `sync-commands` consumer is the sibling agent's `apps/gateway/src/deploy/worker.ts`; this route only enqueues `{ botId }` under the exported `SYNC_COMMANDS_QUEUE = 'sync-commands'` constant.
- Re-POST is idempotent by design (same status, new audit row, new enqueue attempt), so the sync-enqueue-failed 500 (with `{ reason: 'sync-enqueue-failed', status: 'live', botId }`) is safely retryable.

## Open Questions for Orchestrator
- No dedicated `go-live/route.test.ts` was created: the file scope authorizes exactly one CREATE (`go-live/route.ts`) and forbids touching any other file. "Route tests green" is therefore satisfied by the untouched sibling suites (83/83 green — see Known Limitations). If a dedicated hermetic suite is wanted, authorize it as a follow-up task.
- Gate order choice (Red → token → prod-spec, each a distinct 409 reason: `preflight-red` / `missing-token` / `no-prod-spec`) was mine; the SPEC fixes the gates but not their order. The order is observable in responses — flag if the sibling worker or UI assumes a different precedence.
- `latestPreflightEnvelope` can return an envelope object, which is `JSON.stringify`'d into the audit `detail` (same as publish); if envelopes ever grow large, the audit row grows with them — matches publish behavior, no new risk.

## Public Interface Exposed
- `POST /api/bots/[botId]/go-live` → `200 { botId, status: 'live', jobId }` on success.
- Error shapes: `401 { error: 'unauthorized' }`; `404 { error: 'not found' }` (unknown/foreign/malformed/soft-deleted — never 403); `409 { error: 'preflight red', reason: 'preflight-red', failing: string[] }`; `409 { error: 'bot token not saved', reason: 'missing-token' }`; `409 { error: 'no production spec yet', reason: 'no-prod-spec' }`; `500 { error: 'could not go live' }` (DB path, incl. honest `database not configured` via shared `mapDbError`); `500 { error: 'could not sync commands', reason: 'sync-enqueue-failed', status: 'live', botId }` (status flip already committed — retryable).
- Audit: one `audit_events` row per success (`action='go-live'`, `actor='owner:<discordId>'`, `detail={ preflight: <latest envelope | 'unscanned'> }`), written in the same transaction as the status flip (rollback on any failure — never a flipped status without its audit row).
- Queue: one `sync-commands` job `{ botId }` per success (best-effort post-commit; cannot join the DB transaction).
- Test seams (mirroring sibling routes, test-only writers): `__setSessionReader` / `__resetSessionReader` (fail-closed: reset reader answers null), `__setBossFactory` / `__resetBossFactory`, re-exported `__setPool`. Pure export: `isTokenPresent(tokenLen)`.
- Exported SQL constants: `OWNED_BOT_SQL`, `SCANS_SQL`, `GO_LIVE_SQL`, `AUDIT_SQL`; exported `SYNC_COMMANDS_QUEUE`.
- No secret material anywhere: no token value read, logged, or returned (presence is a length check only; error strings name `ENCRYPTION_KEY`/config state only where applicable — never values).

## Known Limitations
- No dedicated go-live test file (scope forbids a second CREATE). Verification performed instead: `tsc --noEmit` exit 0; `eslint` on the new file exit 0; sibling suites `vitest run app/api/bots app/api/spec/publish` → 3 files, 83/83 green (activity 23, bots 31, publish 29; Postgres-backed paths loud-skip, hermetic paths pass).
- The handler was not exercised against a live Postgres or Discord here (no DB container touched, no human flow run — that belongs to the reviewer/human-flow gate).
- What this task does NOT cover: the `sync-commands` gateway worker, `syncGuildCommands` export, `guild_installs` install-record write, invite/preflight capability derivation, token UI page — all sibling tasks' scopes.
