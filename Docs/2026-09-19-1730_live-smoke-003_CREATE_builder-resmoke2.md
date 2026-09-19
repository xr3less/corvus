# Task Report: live-smoke-003

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1730_live-smoke-003_CREATE_builder-resmoke2.md
- NOT-TOUCHED-LOCAL: all repo files (no git command of any kind run — no stage/commit/restore/pull; helper scripts only under $TEMP\sshwork, outside the repo, new this task: sm3-acct.sh, sm3-bot.sh, sm3-send.sh, sm3-poll.sh, sm3-ev.sh, sm3-clean.sh, sm3-orph.sh)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), /opt/corvus/.env (never read or modified — only shape DoubleChecked via prior task), pgdata, caddy_data, all other box files, other services (web/postgres/caddy not recreated)
- TRANSIENT-BOX (created then deleted, see Cleanup): one accounts row, one bots row, one builder_runs row

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2 already installed). No installs run.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up 3 min / postgres healthy / caddy Up 17h.
- wiro-key-001d state confirmed at pre-check: WIRO_FILE_LEN=32, gateway runtime env len 32, worker log `builder-worker-started` present — no process started by this task.
- Baseline `SELECT count(*) FROM bots` = 0 and smoke accounts = 0 confirmed before inserting fixtures.
- bots.token_cipher is NOT NULL but the builder never reads Discord tokens, so dummy `decode('00','hex')` is a valid smoke fixture (no real token ever touched).
- accounts.tier column exists (migration 0008 applied); smoke account inserted with tier='trial', discord_id='builder-smoke-2026-09-19-003' (003 suffix to distinguish from 001/002 fixtures).
- Builder lane contract from mapper accepted as stated: single GLM-lane run, BUILDER_BILLABLE_CEILING=3, worst case 54 credits = $0.27; zero Discord publish by design (brief/name test-marked `smoke-2026-09-19-live3`).
- No status-only auth probe was run this task (001d recommended one, but the builder run itself is the decisive test — provider acceptance is proven by the `live` terminal phase, not inferred from a probe).

## Open Questions for Orchestrator

1. **The len-32 WIRO_API_KEY candidate is ACCEPTED by the provider — the `live` builder path is now PROVEN end-to-end.** The 001c len-64 key was plumbing-correct but 401-rejected; this candidate succeeds. Recommend: keep the len-32 key as installed; no further key action needed unless the provider panel says otherwise. No key material was requested, received, displayed, or written by this task — lengths only.
2. **FK cascade observation:** deleting the smoke account also deleted its ai_spend rows (global ai_spend went to 0|0 after account delete; same for spec_versions → 0). Spend evidence below was recorded BEFORE cleanup, so the cost is captured, but the ledger rows no longer exist for re-audit. If per-run spend auditability matters after fixture deletion, consider retaining spend rows or snapshotting them before account cleanup in future smokes. Bot/bot-run/spec cleanup left zero orphans (bots 0, builder_runs 0, spec_versions 0, accounts 0, smoke accounts 0 globally).
3. **pg-boss retry rows from 001/002 still sit in `retry`** (`3396b357-...`, `352ba809-...`, `{"error": "builder_failed"}`); this task's 003 job (`ab558067-...`) is `completed` so it needs no cancel. Cancel the two old ones via `boss.cancel('builder', '<JOBID>')` if tidiness is preferred — their run/bot/account rows are deleted so each retry resolves as `run_gone` (no phase write, no spend) until deleteAfterSeconds=604800.
4. Only 1 attempt per command was needed — no command failed. Box left running.

## Public Interface Exposed

Job contract v2 as implemented (route + gateway worker), observed live:

- Enqueue shape: `{runId, botId, brief}` on queue `builder`, options `{singletonKey: runId, retryLimit: 3, retryDelay: 30, expireInSeconds: 3600, deleteAfterSeconds: 604800}`.
- This run: runId `598428d2-443f-4315-b74c-363c1cdfc5be`, jobId `ab558067-5d6e-4ec6-871f-c14aba2c01cd`, botId `b38f1525-6adb-4660-8f83-f36485145f46`, accountId `eb4e4a31-6843-40b1-93c1-7ac990b7ef17`.
- Terminal row observed: phase `live`, detail `{"stub": false, "model": "glm/5-2", "version": 1}` (created 2026-09-19 14:31:18Z, updated 14:31:42Z — ~24s turnaround).
- Spend for the account (recorded pre-cleanup): 1 row, 0.31696 credits, model `glm/5-2` — far under the single-run cap (ceiling 3 billable calls / 54 credits).
- Spec versions for the bot (recorded pre-cleanup): 1 row, version 1, created 14:31:42Z.
- Boss job row: `builder|completed|{"ok": true, "phase": "live"}`.
- Bot row status stayed `draft` — zero Discord publish by design.

## Known Limitations

- No UI, login, or Discord publish was exercised (by design: zero Discord publish; brief/name test-marked `smoke-2026-09-19-live3`).
- No premium-model path was touched: the run stayed in the single GLM lane (one billable call), per the stop rule — if it had left WIRO routes, observation would have stopped.
- Bounded poll (~10 min) collapsed to two short checks: first poll showed `generating` (job `active`), second poll showed terminal `live` (job `completed`).
- Spend/spec evidence was captured before cleanup; post-cleanup FK cascade removed those rows, so post-hoc re-audit from the DB is not possible (see Open Question 2).
- Report filename uses local wall-clock (1730 +03); box evidence timestamps are UTC (14:31Z).

## Step-by-step evidence (commands + results, secrets redacted)

0. **Pre-checks (read-only, sm2-pre.sh):** box HEAD = 5c6c13409387d9f0f3e17e3815de397ce40a975b, status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up 3 min / postgres healthy / caddy Up 17h. WIRO_FILE_LEN=32, GW env len 32, `builder-worker-started` present. bots count 0, smoke accounts 0.
1. **Step 1 — smoke account (sm3-acct.sh):** `INSERT INTO accounts (discord_id, tier) VALUES ('builder-smoke-2026-09-19-003','trial') RETURNING id` -> `eb4e4a31-6843-40b1-93c1-7ac990b7ef17`, INSERT 0 1.
2. **Step 1 — smoke bot (sm3-bot.sh):** `INSERT INTO bots (account_id, name, token_cipher, status) VALUES ('<ACCT>','smoke-2026-09-19-live3-bot', decode('00','hex'), 'draft') RETURNING id` -> `b38f1525-6adb-4660-8f83-f36485145f46`, INSERT 0 1.
3. **Step 2 — run row + boss send (sm3-send.sh, inside corvus-gateway-1):** INSERT builder_runs RETURNING id + `boss.send('builder',{runId,botId,brief:'smoke-2026-09-19-live3 single builder cents cap test brief'},...)` -> `{"runId":"598428d2-443f-4315-b74c-363c1cdfc5be","jobId":"ab558067-5d6e-4ec6-871f-c14aba2c01cd"}`, EXIT 0.
4. **Step 3 — poll (sm3-poll.sh):** first check `generating|{}|<updated 14:31:18Z>`, boss `active`; second check `live|{"stub": false, "model": "glm/5-2", "version": 1}|2026-09-19 14:31:42Z`, boss `completed|{"ok": true, "phase": "live"}`.
5. **Step 3 — evidence (sm3-ev.sh):** full detail `live|{"stub": false, "model": "glm/5-2", "version": 1}|created 14:31:18Z|updated 14:31:42Z`. ai_spend for account: count 1, sum 0.31696 credits; row `0.31696|glm/5-2|14:31:42Z`. spec_versions for bot: count 1; row `version 1|14:31:42Z`. Boss job `builder|completed|{"ok": true, "phase": "live"}`. Bot status `draft`.
6. **Step 4 — cleanup (sm3-clean.sh, mapper order):** `DELETE FROM builder_runs WHERE bot_id='<BOT>'` -> DELETE 1; `DELETE FROM bots WHERE id='<BOT>'` -> DELETE 1; `DELETE FROM accounts WHERE id='<ACCT>'` -> DELETE 1. Verify: total bots 0, smoke accounts 0, ai_spend for smoke account 0|0, builder_runs total 0.
7. **Orphan sweep (sm3-orph.sh, global):** builder_runs 0, bots 0, spec_versions 0, ai_spend 0|0, accounts 0. Box left running; pg-boss operational rows untouched.
8. **Cost:** 1 billable call, 0.31696 credits (~$0.0016) — far under the single-run cap (ceiling 3 calls / 54 credits = $0.27). Stop rules respected: no premium-model path (run stayed in the single GLM lane); single run only; no loops; every command attempted once, all EXIT 0.
