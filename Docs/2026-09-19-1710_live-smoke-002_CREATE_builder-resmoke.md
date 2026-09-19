# Task Report: live-smoke-002

## Status

FAILED

## Files Touched

- CREATED: Docs/2026-09-19-1710_live-smoke-002_CREATE_builder-resmoke.md
- NOT-TOUCHED-LOCAL: all repo files (no stage/commit/restore; helper scripts only under $TEMP\sshwork, outside the repo: sm2-*.sh, new this task)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), /opt/corvus/.env (read names/shapes only, never modified), pgdata, caddy_data, all other box files, other services (web/postgres/caddy not recreated)
- TRANSIENT-BOX (created then deleted, see Cleanup): one accounts row, one bots row, one builder_runs row

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2 already installed). No installs run.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 16h.
- Gateway had been recreated by wiro-key-001c ~10 min before this smoke (gateway Up 2 min at pre-check); worker log `builder-worker-started` present — no process started.
- Baseline `SELECT count(*) FROM bots` = 0 and smoke accounts = 0 confirmed before inserting fixtures.
- bots.token_cipher is NOT NULL but the builder never reads Discord tokens, so dummy `decode('00','hex')` is a valid smoke fixture (no real token ever touched).
- accounts.tier column exists (migration 0008 applied); smoke account inserted with tier='trial', discord_id='builder-smoke-2026-09-19-002' (002 suffix to distinguish from 001 fixtures).
- Builder lane contract from mapper accepted as stated: single GLM-lane run, BUILDER_BILLABLE_CEILING=3, worst case 54 credits = $0.27; zero Discord publish by design (brief/name test-marked `smoke-2026-09-19-live2`).
- The `router_failed` detail shape carries no per-attempt breakdown (coded class only, by design), so the 401 cause was established by a separate status-only auth probe, not from the run row.

## Open Questions for Orchestrator

1. **The installed WIRO_API_KEY is rejected by the provider (HTTP 401).** Plumbing is proven end-to-end: file len 64, gateway runtime env len 64, worker running, provider reachable (unauthenticated GET to the WIRO base URL returns HTTP 200 in 284ms). But a status-only POST with the key from the gateway env returns 401, and the builder run failed as `failed/router_failed` in 35s (created 14:05:37Z, updated 14:06:12Z) with zero spend. Router policy explains the shape: first WIRO route 401 is recorded, second WIRO route 401 trips the one-extra-attempt rule and throws RouterError before reaching any other lane. Either the key material is wrong (recall 001c parsed 2 candidates from the source file — len 64 winner installed, len 32 discarded as non-key) or the key was never activated/provisioned on the provider side. No key material was requested, received, displayed, or written by this task — lengths only.
2. **WIRO_BASE_URL is EMPTY in both /opt/corvus/.env and the gateway env (len 0).** Harmless per the lanes code read from the image: routes fall back to the compiled default `https://llm.wiro.ai/v1` when the override env is empty, and connectivity to that default was confirmed. No action unless a non-default base URL is intended.
3. **pg-boss retry rows are accumulating:** both the 001 job (`3396b357-...`) and this 002 job (`352ba809-...`) sit in `retry` with `{"error": "builder_failed"}`; their run/bot/account rows are now deleted so each retry resolves as `run_gone` (early return, no phase write, no spend) until deleteAfterSeconds=604800. Cancel via `boss.cancel('builder', '<JOBID>')` if tidiness is preferred, same as 001.
4. Only 1 of 2 allowed attempts per command was needed — no command failed, so the second attempt was never used. Box left running.

## Public Interface Exposed

Job contract v2 as implemented (route + gateway worker), observed live:

- Enqueue shape: `{runId, botId, brief}` on queue `builder`, options `{singletonKey: runId, retryLimit: 3, retryDelay: 30, expireInSeconds: 3600, deleteAfterSeconds: 604800}`.
- This run: runId `1aa06251-0bfb-4b16-b985-0ef37a0eaac4`, jobId `352ba809-5f1d-4046-9da5-c32fc558e71e`, botId `ed91d676-d0dc-4e35-bc68-03f29b518557`, accountId `a3cad3d6-4a78-4ad6-8303-5442427a21ea`.
- Terminal row observed: phase `failed`, detail `{"step": "generate", "error": "router_failed"}` (35s after insert: created 14:05:37Z, updated 14:06:12Z — longer than 001's 2s because real provider round-trips happened this time).
- Spend for the account: 0 rows, 0 credits. Spec versions for the bot: 0 rows.
- Boss job row: `builder|retry|{"error": "builder_failed"}` at evidence time.
- Cause evidence (status-only, no secret text): unauthenticated GET to WIRO base URL = HTTP 200 (provider reachable); authenticated POST with gateway env key = HTTP 401 (key rejected). WIRO_BASE_URL len 0 file + gateway (default-base fallback applies).
- Router code as shipped in the image (read-only, `/app/packages/ai/dist/router.js` + `lanes.js`): missing-key routes are skipped as `no-key` without consuming the extra attempt; any non-429 4xx is recorded, exactly one more route is tried, then RouterError is thrown; the builder worker maps RouterError to `router_failed` (coded class, no provider text).

## Known Limitations

- The `live` path (model draft -> spec_versions row -> draft pointer) is NOT proven: the installed key is auth-rejected (401), so the run cannot reach `sync`. Proven instead: key plumbing end-to-end (file -> gateway env), provider reachability, worker pickup, phase machine to terminal `failed`, coded-error honesty (`router_failed`, no provider text), and zero-spend on total provider failure (RouterError path writes no ledger row).
- The 401 cause is attributed via a separate status-only probe, not from the run row itself — the `router_failed` detail shape is identical whether the cause is no-key skip or 401 rejection. Per-attempt classes exist only in the thrown RouterError message in gateway logs, and this gateway logs no per-attempt line at default verbosity (tail showed only startup lines).
- No UI, login, or Discord publish was exercised (by design: zero Discord publish; brief/name test-marked `smoke-2026-09-19-live2`).
- Bounded poll (~10 min) collapsed to short checks: the run was already terminal well within the window, so no waiting loop was needed.
- Report filename uses local wall-clock (1710 +03); box evidence timestamps are UTC (14:05-14:06Z).

## Step-by-step evidence (commands + results, secrets redacted)

0. **Pre-checks (read-only):** box HEAD = 5c6c13409387d9f0f3e17e3815de397ce40a975b, status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up 2 min / postgres healthy / caddy Up 16h. WIRO_FILE_LEN=64, GW env len 64, `builder-worker-started` present. bots count 0, smoke accounts 0.
1. **Step 1 — smoke account:** `INSERT INTO accounts (discord_id, tier) VALUES ('builder-smoke-2026-09-19-002','trial') RETURNING id` -> `a3cad3d6-4a78-4ad6-8303-5442427a21ea`, INSERT 0 1.
2. **Step 1 — smoke bot:** `INSERT INTO bots (account_id, name, token_cipher, status) VALUES ('<ACCT>','smoke-2026-09-19-live2-bot', decode('00','hex'), 'draft') RETURNING id` -> `ed91d676-d0dc-4e35-bc68-03f29b518557`, INSERT 0 1.
3. **Step 2 — run row + boss send (inside corvus-gateway-1):** INSERT builder_runs RETURNING id + `boss.send('builder',{runId,botId,brief:'smoke-2026-09-19-live2 single builder cents cap test brief'},...)` -> `{"runId":"1aa06251-0bfb-4b16-b985-0ef37a0eaac4","jobId":"352ba809-5f1d-4046-9da5-c32fc558e71e"}`, EXIT 0.
4. **Step 3 — poll:** run already terminal: `failed|{"step": "generate", "error": "router_failed"}|2026-09-19 14:05:42Z` at first poll; full timestamps confirm generate-step router failure with 35s turnaround (created 14:05:37Z, updated 14:06:12Z). ai_spend for account: count 0, sum 0. spec_versions for bot: 0. pgboss.job: `builder|retry|{"error": "builder_failed"}`.
5. **Diagnosis (read-only, no key material):** WIRO_BASE_URL len 0 in file and gateway env (default-base fallback applies per lanes.js). Unauthenticated GET to WIRO base = HTTP 200 in 284ms (reachable). Authenticated POST with gateway env key = HTTP 401 (rejected). Gateway log tail shows startup lines only (no per-attempt detail at default verbosity). Router source in image confirms 4xx-once-more-then-throw policy and `no-key` skip semantics.
6. **Step 4 — cleanup (mapper order):** `DELETE FROM builder_runs WHERE bot_id='<BOT>'` -> DELETE 1; `DELETE FROM bots WHERE id='<BOT>'` -> DELETE 1; `DELETE FROM accounts WHERE id='<ACCT>'` -> DELETE 1. Verify: total bots 0, smoke accounts 0, ai_spend for smoke account 0|0, builder_runs total 0. Box left running; pg-boss operational rows untouched.
7. **Cost:** 0 billable calls, 0 credits, $0.00 — under the single-run cap by construction (RouterError path writes no ledger row). Stop rules respected: no premium-model path taken (run threw before any non-WIRO route); single run only; no loops; every command attempted once, all EXIT 0.
