# Task Report: live-smoke-001

## Status

PARTIAL

## Files Touched

- CREATED: Docs/2026-09-19-1543_live-smoke-001_CREATE_builder-smoke.md
- NOT-TOUCHED-LOCAL: all repo files (no stage/commit/restore; dirty grab files left alone)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), .env (names+shapes only), pgdata, caddy_data
- TRANSIENT-BOX (created then deleted, see Cleanup): one accounts row, one bots row, one builder_runs row

## Dependencies Added

None. Reused existing helpers outside the repo ($TEMP/sshwork: ssh-exec.js, run-sh.js + new .sh scripts, node_modules ssh2 already installed). No installs run.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; compose ps showed web healthy, gateway Up, postgres healthy, caddy Up 15h.
- Builder worker confirmed already running in corvus-gateway-1 (log line `builder-worker-started`) — no process started.
- Baseline `SELECT count(*) FROM bots` = 0 confirmed before inserting fixtures.
- bots.token_cipher is NOT NULL but the builder never reads Discord tokens, so dummy `decode('00','hex')` is a valid smoke fixture (no real token ever touched).
- accounts.tier column exists (migration 0008 applied); smoke account inserted with tier='trial', discord_id='builder-smoke-2026-09-19-001'.
- WIRO_API_KEY presence was the mapper's verify-before-spending assumption: verified ABSENT (all five AI key names exist in /opt/corvus/.env but are EMPTY; gateway container env likewise empty). The run was still triggered once because the expected outcome (honest failed/router_failed, zero billable calls) is itself valid smoke evidence of the phase machine.
- Cost math from mapper accepted as stated; no code read beyond the whitelisted files.

## Open Questions for Orchestrator

1. **All AI provider keys are EMPTY on the box** (.env names present, values empty; gateway env likewise). The builder lane therefore skips every route (`no-key`) and every run fails honestly as `failed/router_failed` with zero spend. To prove the `live` path, the founder must add at least one key (cheapest first route is WIRO_API_KEY for wiro-glm-5-2) and authorize a re-smoke. No key material was requested, received, or written by this task.
2. **Boss retries after cleanup are harmless but noted:** the pg-boss job was in `retry` state at evidence time; the run/bot/account rows it references are now deleted, so each retry resolves as `run_gone` (early return, no phase write, no spend) and dead-letters. Per mapper this was left in place (self-deletes after deleteAfterSeconds=604800); cancel via `boss.cancel('builder', '<JOBID>')` if tidiness is preferred.
3. **Only 1 of 2 allowed attempts per command was needed** — no command failed, so the second attempt was never used. Box left running.

## Public Interface Exposed

Job contract v2 as implemented (route.ts + gateway worker), observed live:

- Enqueue shape: `{runId, botId, brief}` on queue `builder`, options `{singletonKey: runId, retryLimit: 3, retryDelay: 30, expireInSeconds: 3600, deleteAfterSeconds: 604800}`.
- This run: runId `2ba3774c-fc62-49aa-8806-5e528ddf489d`, jobId `3396b357-4b64-4dd9-9e6f-ac76a5eb510f`, botId `2dc3e41e-519c-4f26-9f6a-1c5f0a1202a8`, accountId `6e12493f-337c-45e8-a81d-37c50e9e762a`.
- Terminal row observed: phase `failed`, detail `{"step": "generate", "error": "router_failed"}` (2s after insert: created 12:42:35Z, updated 12:42:37Z).
- Spend for the account: 0 rows, 0 credits. Spec versions for the bot: 0 rows.
- Boss job row: `builder|retry|{"error": "builder_failed"}` at evidence time.

## Known Limitations

- The `live` path (model draft -> spec_versions row -> draft pointer) is NOT proven: with no provider keys the run cannot reach `sync`. Proven instead: enqueue path, worker pickup, phase machine to terminal `failed`, coded-error honesty (`router_failed`, no provider text), and zero-spend on total provider failure.
- No UI, login, or Discord publish was exercised (by design: zero Discord publish; brief/name test-marked `smoke-2026-09-19`).
- Bounded poll (~10 min) collapsed to a single check: the run was already terminal 2s after enqueue, so no waiting loop was needed.
- Report filename uses local wall-clock (1543 +03); box evidence timestamps are UTC (12:42Z).

## Step-by-step evidence (commands + results, secrets redacted)

0. **Pre-checks (read-only):** box HEAD = 5c6c13409387d9f0f3e17e3815de397ce40a975b, status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 15h. Gateway node resolves `pg` + `pg-boss` (MODS_OK). bots count 0, smoke accounts 0.
1. **Key shapes (names only, never values):** full .env enumeration shows SET: DATABASE_URL, APP_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, TAG, GHCR_OWNER, POSTGRES_USER, POSTGRES_PASSWORD (48 chars), POSTGRES_DB, ENCRYPTION_KEY (64 chars); EMPTY: WIRO_API_KEY, WIRO_BASE_URL, OPENROUTER_API_KEY, ZAI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY. (Earlier confusing MISSING lines were a local-shell quoting artifact of ssh-exec.js arg passing; the file-based runner run-sh.js reports the true EMPTY state.) Gateway container env matches: all five AI keys EMPTY, DATABASE_URL SET. Worker log: `builder-worker-started`.
2. **Step 1 — smoke account:** `INSERT INTO accounts (discord_id, tier) VALUES ('builder-smoke-2026-09-19-001','trial') RETURNING id` -> `6e12493f-337c-45e8-a81d-37c50e9e762a`, INSERT 0 1.
3. **Step 1 — smoke bot:** `INSERT INTO bots (account_id, name, token_cipher, status) VALUES ('<ACCT>','smoke-2026-09-19-bot', decode('00','hex'), 'draft') RETURNING id` -> `2dc3e41e-519c-4f26-9f6a-1c5f0a1202a8`, INSERT 0 1.
4. **Step 2 — run row + boss send (inside corvus-gateway-1):** INSERT builder_runs RETURNING id + `boss.send('builder',{runId,botId,brief:'smoke test one builder run cents cap'},...)` -> `{"runId":"2ba3774c-fc62-49aa-8806-5e528ddf489d","jobId":"3396b357-4b64-4dd9-9e6f-ac76a5eb510f"}`, EXIT 0.
5. **Step 3 — poll:** first check already terminal: `failed|{"step": "generate", "error": "router_failed"}`. Full detail + timestamps confirm generate-step router failure, 2s turnaround. ai_spend for account: count 0, sum 0. spec_versions for bot: 0. pgboss.job: `builder|retry|{"error": "builder_failed"}`.
6. **Step 4 — cleanup (mapper order):** `DELETE FROM builder_runs WHERE bot_id='<BOT>'` -> DELETE 1; `DELETE FROM bots WHERE id='<BOT>'` -> DELETE 1; `DELETE FROM accounts WHERE id='<ACCT>'` -> DELETE 1. Verify: bots id count 0, ai_spend account count 0, total bots 0, smoke accounts 0. Box left running; pg-boss operational rows untouched.
7. **Cost:** 0 billable calls, 0 credits, $0.00 — under the single-run cap by construction (RouterError path writes no ledger row). Stop rules respected: no premium-model path taken (no keys exist to call anything); no loops; every command attempted once, all EXIT 0.
