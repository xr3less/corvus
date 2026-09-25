# Task Report: expansion-e6c1f-sync-fanout

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/bots/[botId]/go-live/route.ts
- CREATED: Agent Reports/2026-09-23-1225_e6c1f_FIX_sync-fanout.md (this report)
- DELETED: none

## Dependencies Added
- None (reuses declared `pg`, `pg-boss`; no installs, no manifest edits).

## Assumptions Made
- `git status --short` + `git diff --stat` run first (read-only); no partial fan-out work existed — the send block still sent a single `{ botId }`, so this is a fresh fix, not a continuation.
- Worker contract is authoritative: `runSyncCommandsJob` requires `{ botId, guildId }`, returns `bad_job` (→ deadletter) without `guildId`. Queue name `sync-commands` already matched; only the payload/fan-out was wrong.
- The existing `guild_installs` read (`SCANS_SQL`) is the reuse point per task: extended it from `SELECT preflight ... WHERE preflight IS NOT NULL` to `SELECT guild_id, preflight ...` (no new table, no new query pattern). Null-preflight filtering moved from SQL to JS (`filter preflight !== null/undefined`), which is behavior-identical for Red detection, and additionally yields installed guild ids from the same rows.
- `guild_installs.guild_id` is non-null in practice; the fan-out defensively drops null/empty ids and dedupes, so one job per real guild.
- Response shape: kept `jobId` (first job id) so the pre-fan-out success shape still parses, added `jobIds` (full fan-out array). Zero-guild case returns `200 { botId, status: 'live', jobId: null, jobIds: [] }` without starting a boss.
- Per-guild `singletonKey` is `${botId}:${guildId}` (old bot-level key would have collapsed all guilds to one job); same retry/expire/delete options per job.
- Gates, transaction (status flip + audit row), and error shapes unchanged.

## Open Questions for Orchestrator
- None blocking. Note: scope allowed touching the colocated test file only IF one exists — confirmed no `go-live/route.test.ts` exists (only `activity/route.test.ts` + `bots/route.test.ts` under `app/api/bots`), so none was created and the absence is reported per instructions.

## Public Interface Exposed
- `POST /api/bots/[botId]/go-live` → `200 { botId, status: 'live', jobId, jobIds }` on success (`jobId` = first job, `jobIds` = all per-guild job ids; zero guilds → `jobId: null, jobIds: []`).
- Error shapes unchanged: `401 unauthorized`; `404 not found`; `409 preflight-red / missing-token / no-prod-spec`; `500 could not go live` (DB path); `500 could not sync commands { reason: 'sync-enqueue-failed', status: 'live', botId }` (per-guild send failure, retryable re-POST).
- Queue: N `sync-commands` jobs `{ botId, guildId }` per success (N = installed guild count), via existing pg-boss `start → createQueue → send → stop-in-finally` idiom.
- Exported `SCANS_SQL` changed to `'SELECT guild_id, preflight FROM guild_installs WHERE bot_id = $1'`; `SYNC_COMMANDS_QUEUE`, `OWNED_BOT_SQL`, `GO_LIVE_SQL`, `AUDIT_SQL`, `isTokenPresent`, and test seams (`__setSessionReader/__resetSessionReader`, `__setBossFactory/__resetBossFactory`, `__setPool`) unchanged.
- No secret material: no token value read/logged/returned (length check only).

## Known Limitations
- No dedicated go-live test file exists (none created per scope). Verification instead: web `tsc --noEmit` exit 0; `eslint` on the touched route exit 0; sibling suites `vitest run app/api/bots app/api/spec/publish` → 3 files, 83/83 green (activity 23, bots 31, publish 29).
- Handler not exercised against live Postgres/Discord here (no DB container touched; Hermitian fan-out logic verified by code-reading + contract match with worker.ts, not a live enqueue).
- Partial fan-out (job k of N fails) returns the 500 shape with `status: 'live'`; already-sent jobs for earlier guilds stand and re-POST re-enqueues per-guild (singleton keys dedupe still-pending jobs). No compensating delete of sent jobs.
- SECURITY: Production box, Contabo, GHCR, and live keys are OUT OF SCOPE - never touched. No package.json/lockfile/.env edits, no installs, no git restore/commit, no secret values printed or transmitted.
