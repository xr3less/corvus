# Task Report: bench-a

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1800_bench-a_CREATE_bench-runs.md
- NOT-TOUCHED-LOCAL: all other repo files (no git command of any kind run locally — no stage/commit/restore/pull/push; helper scripts only under $TEMP\sshwork, outside the repo, new this task: ba-pre.sh, ba{1..5}-{acct,bot,send,poll,ev,clean}.sh, ba-bot-tpl.txt, ba4-diag.sh, ba4-q.sh, ba-final.sh)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), /opt/corvus/.env (never read or modified — length-only lens checks), pgdata, caddy_data, all other box files, other services (web/postgres/caddy/gateway not recreated; gateway only used as the documented boss.send execution host)
- TRANSIENT-BOX (created then deleted, see Cleanup): per brief N=1..5, one accounts row (discord_id='bench-2026-09-19-a-N', tier='trial'), one bots row (name 'bench-2026-09-19-a-N-bot', status 'draft', dummy token_cipher), one builder_runs row. Zero -b- rows touched.

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2 already installed). No installs run. No package.json/lockfile edits.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 17h.
- wiro-key-001d state confirmed at pre-check: WIRO_FILE_LEN=32, gateway runtime env len 32, worker log `builder-worker-started` present — no process started by this task.
- bots.token_cipher is NOT NULL but the builder never reads Discord tokens, so dummy `decode('00','hex')` is a valid fixture (no real token ever touched).
- Job contract v2 as stated in the task (queue `builder`, payload {runId,botId,brief}, options {singletonKey:runId,retryLimit:3,retryDelay:30,expireInSeconds:3600,deleteAfterSeconds:604800}) — executed exactly as specified, inside corvus-gateway-1.
- Wall seconds per brief = builder_runs.updated_at minus created_at (box UTC); enqueue-to-terminal is ~1s longer (job send precedes run-row insert by milliseconds — negligible).
- Runner B (bench-b) was concurrently active on the same single-worker queue; its rows explain every non-zero global count observed after my own rows verified 0. My deletes were always scoped to my own bot_id/account_id, so no cross-runner interference was possible.
- USD conversion at USD_PER_CREDIT=0.005 (from spec/grader contract) for the cost rollup.

## Open Questions for Orchestrator

1. B4 wall time (59s) includes ~40s queued behind runner B's jobs — the single builder worker serializes the shared queue, so concurrent runners contend. If the grader compares wall times across runners, note B4/B5 carry queue-wait, not slower generation. Consider staggering runners next time if clean wall times matter.
2. FK cascade observation (confirms live-smoke-003): deleting the bench account also deleted its ai_spend + spec_versions rows — the pre-delete snapshots below ARE the spend/spec evidence; post-cleanup re-audit from the DB is not possible. Final global check shows 1 live builder_runs row + 1 account + 1 ai_spend row, all runner B's (`bench-2026-09-19-b-9-bot`) — left untouched.
3. Only 1 attempt per command was needed except polls (re-polled to terminal, no command failures). Box left running.

## Public Interface Exposed

Builder lane v2 executions observed live (all `live`, model `glm/5-2`, stub false, boss `completed`):

- B1: runId `87477b84-ac2b-41ec-8f54-59a682af98bc`, jobId `41cd5223-11de-479f-a58d-fd78bcb7e004`, botId `8c6ed884-0a79-4756-bf98-e4692e8889ed`, accountId `08eb3840-9ca7-423a-860e-a8f9019c0244`
- B2: runId `dc187c0e-fefe-4031-9b39-823f981fab89`, jobId `797e6eeb-a0a2-4bc2-851d-4391e3fe2656`, botId `c73a29fa-9774-4c2f-bd20-e5d32823c7f5`, accountId `525b51c3-2e7e-4a70-a93c-d4eb48341c78`
- B3: runId `a94b7d79-f6c9-4ae3-9741-4bb9fea1f9a7`, jobId `7741f9c4-8055-4958-b139-3684727f90d6`, botId `c3d58a70-e091-4eec-ae61-838c3ebbc6fb`, accountId `fd25ae09-a41c-437c-bfd3-d050b7c8c925`
- B4: runId `32632dda-f6a4-4701-93f4-13bce5a86dbb`, jobId `df1c8fca-5946-46ca-bba6-a317cb4f668f`, botId `022a18f6-f8bc-4305-9c52-e02af9764560`, accountId `25ad9dda-b8b1-44e4-a0ce-1f4303ab07fa`
- B5: runId `8ac1e88d-1f54-486f-a110-70785d2c0925`, jobId `79b0bbf6-3cf8-4610-a1e2-22e500aee696`, botId `b50080fd-f031-469e-abb8-de4ac800165b`, accountId `81d7b4f0-6f31-4e42-9631-24e2e3cef871`
- Every run: terminal detail `{"stub": false, "model": "glm/5-2", "version": 1}`, boss output `{"ok": true, "phase": "live"}`, bot status stayed `draft` (zero Discord publish), 1 ai_spend row + 1 spec_versions row (version 1) per run, all inside the billable ceiling (≤3 calls, ≤54 credits).

## Known Limitations

- No UI, login, or Discord publish was exercised (by design: zero Discord publish; bots stayed `draft`).
- No premium-model path was touched: all 5 runs stayed in the single GLM lane (one billable call each) per the stop rule.
- Poll bound (≤10 min per brief) was never stressed: slowest terminal was B4 at 59s wall (incl. ~40s queue wait behind runner B); all others ≤33s.
- Spend/spec evidence captured pre-delete per brief; FK cascade removed those rows on account delete, so post-hoc re-audit from the DB is not possible (see Open Question 2).
- Wall times for B4/B5 include shared-queue wait from concurrent runner B (see Open Question 1).
- Report filename timestamp uses the orchestrator-assigned wave stamp (1800); box evidence timestamps are UTC (~15:00–15:07Z).

## Per-brief table

| brief              | runId (short) | phase | wall s | calls | credits | spec rows | cleaned |
| ------------------ | ------------- | ----- | ------ | ----- | ------- | --------- | ------- |
| B1 welcome         | 87477b84      | live  | 18     | 1     | 0.37116 | 1 (v1)    | y       |
| B2 moderation-warn | dc187c0e      | live  | 33     | 1     | 1.04908 | 1 (v1)    | y       |
| B3 xp-levels       | a94b7d79      | live  | 16     | 1     | 0.32332 | 1 (v1)    | y       |
| B4 poll            | 32632dda      | live  | 59     | 1     | 0.47112 | 1 (v1)    | y       |
| B5 autoresponder   | 8ac1e88d      | live  | 30     | 1     | 0.21368 | 1 (v1)    | y       |

Total: 5 runs, 5 billable calls, 2.42836 credits ≈ $0.01214 (at 0.005) — far under the $1 abort line. All boss jobs `completed`, all bots stayed `draft`.

## Step-by-step evidence (commands + results, secrets redacted)

Box-side checks performed before any write (ba-pre.sh): HEAD `5c6c13409387d9f0f3e17e3815de397ce40a975b`, status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 17h; WIRO_FILE_LEN=32, gateway env len 32, `builder-worker-started` present; own bench-a accounts/bots/runs all 0. STOP conditions all clear, so the wave proceeded.

0. **B1 welcome** (`ba1-acct/bot/send/poll/ev/clean.sh`): account `08eb3840…` / bot `8c6ed884…` inserted; run `87477b84…`, job `41cd5223…` sent (EXIT 0). Poll 1: `generating` / boss `active`; poll 2: `live|{"stub": false, "model": "glm/5-2", "version": 1}` / boss `completed|{"ok": true, "phase": "live"}`. Evidence: created 15:00:59Z → updated 15:01:18Z (wall ~18s); ai_spend 1 row, 0.37116 credits, model `glm/5-2`; spec_versions 1 row (v1); bot `draft`. Cleanup (mapper order runs→bot→account): DELETE 1/1/1; verify own accounts 0, own bots 0, spend-for-acct 0|0, global builder_runs 0.
1. **B2 moderation-warn** (`ba2-*`): account `525b51c3…` / bot `c73a29fa…`; run `dc187c0e…`, job `797e6eeb…`. Four polls `generating`/`active` before terminal `live` / `completed` (created 15:02:18Z → updated 15:02:50Z, wall ~33s). Evidence: ai_spend 1 row, 1.04908 credits, `glm/5-2`; spec 1 row (v1); bot `draft`. Cleanup DELETE 1/1/1; own accounts 0, own bots 0 (global builder_runs read 1 at that instant = runner B's concurrent row, not mine).
2. **B3 xp-levels** (`ba3-*`): account `fd25ae09…` / bot `c3d58a70…`; run `a94b7d79…`, job `7741f9c4…`. Poll 1 `generating`/`active`, poll 2 terminal `live` / `completed` (15:03:45Z → 15:04:00Z, wall ~16s). Evidence: ai_spend 1 row, 0.32332 credits; spec 1 row (v1); bot `draft`. Cleanup DELETE 1/1/1; own 0/0, global runs 0.
3. **B4 poll** (`ba4-*` + diag): account `25ad9dda…` / bot `022a18f6…`; run `32632dda…`, job `df1c8fca…`. Three polls showed `queued`/`created` — diagnosed (ba4-diag.sh) as worker busy with runner B's jobs (queue read: 1 created + 1 active + completed rows incl. B's giveaway `c601824a…` and modlog `51c2b97f…`; gateway Up, worker log present — healthy, just serialized). No retry/re-send (exactly-once per brief preserved). Next polls: `generating`/`active` → terminal `live` / `completed` (created 15:05:04Z → updated 15:06:03Z, wall ~59s incl. ~40s queue wait). Evidence: ai_spend 1 row, 0.47112 credits; spec 1 row (v1); bot `draft`. Cleanup DELETE 1/1/1; own 0/0, global runs 0.
4. **B5 autoresponder** (`ba5-*`): account `81d7b4f0…` / bot `b50080fd…`; run `8ac1e88d…`, job `79b0bbf6…`. Polls: `queued`/`created` → `generating`/`active` → terminal `live` / `completed` (created 15:06:57Z → updated 15:07:27Z, wall ~30s). Evidence: ai_spend 1 row, 0.21368 credits; spec 1 row (v1); bot `draft`. Cleanup DELETE 1/1/1; own accounts 0, own bots 0 (global runs 1 = runner B's live `b-9` row).
5. **Final global verify** (ba-final.sh): own `-a-` accounts 0, own `-a-` bots 0; global builder_runs = 1 row (`fe67662f…|live|bench-2026-09-19-b-9-bot` — runner B's, untouched); global accounts 1, global ai_spend 1 row (both B's). All bench-a fixtures deleted and verified. Box left running; no repo files staged/committed/restored; HEAD + .env + services untouched; zero key/token/secret values recorded anywhere; zero Discord publish calls.
