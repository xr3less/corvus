# Task Report: bench-b

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1800_bench-b_CREATE_bench-runs.md
- NOT-TOUCHED-LOCAL: all other repo files (no stage/commit/restore/pull/push; only read-only `git status --short` to confirm untouched; pre-existing dirty state unchanged)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), /opt/corvus/.env (never read or modified — lens only via pre-existing awk check), pgdata, caddy_data, all other box files, other services (never recreated)
- TRANSIENT-BOX (created then deleted, see Cleanup): per brief N=6..10, one accounts row (discord_id `bench-2026-09-19-b-N`, tier='trial'), one bots row (name `bench-2026-09-19-b-N-bot`, status 'draft', dummy token_cipher), one builder_runs row
- HELPERS-ONLY (outside repo, $TEMP\sshwork, no installs): bb-t-run/poll/ev/clean.sh templates + bb-one.ps1 driver + per-brief instantiated bb-N-_.sh/out files (same pattern as prior sm3-_ helpers)

## Dependencies Added

None. Reused run-sh.js + ssh2 node_modules already in $TEMP\sshwork. No installs, no manifest edits.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up.
- wiro-key-001d state confirmed at pre-check: WIRO_FILE_LEN=32, gateway runtime env len 32, worker log `builder-worker-started` present — no process started by this task.
- bots.token_cipher NOT NULL; dummy `decode('00','hex')` is the valid fixture (builder never reads Discord tokens; no real token touched).
- Job contract v2 as stated in spec (queue `builder`, singletonKey=runId, retryLimit 3, retryDelay 30, expireInSeconds 3600, deleteAfterSeconds 604800).
- B6 wall-clock note: the first send attempt executed box-side (rows + job created) but the local driver threw on the `EXIT_CODE=0` stderr line (harness bug, $ErrorActionPreference='Stop'), so no ids were captured; the retry hit the unique constraint. B6 ids/evidence were recovered via read-only SELECTs; wall seconds for B6 is therefore the DB created→updated window (~23s), not driver-measured. Driver fixed before B7; B7–B10 walls are driver-measured.
- B7/B8 `cleaned=false` in the raw bb-results.jsonl is a driver artifact: the 4th verify line is the GLOBAL builder_runs count, which was 1 due to runner A's concurrent live row — all own DELETEs returned DELETE 1 and own `-b-` rows verified 0. Corrected to y in the table below.

## Open Questions for Orchestrator

1. None blocking. All 5 briefs reached terminal `live`, model `glm/5-2` on every billable call (no premium-lane drift), bot rows stayed `draft`, total spend 3.707 credits (~$0.0185 at USD_PER_CREDIT=0.005) — far under the $1 abort line.
2. Note for grader: B7 used 2 billable calls (0.9944 + 1.00672 = 2.00112 credits); all other briefs used 1 call each. Every run is within BUILDER_BILLABLE_CEILING (≤3 calls, ≤54 credits).
3. Residual global rows at end of this task: accounts 0, bots 0 (own `-b-` 0/0 verified), builder_runs 0, spec_versions 0. pg-boss operational rows untouched (this task's 5 jobs `completed`; old 001/002 retry rows noted in live-smoke-003 still stand).

## Public Interface Exposed

Builder lane observations (all runs, single GLM lane, detail `{"stub": false, "model": "glm/5-2", "version": 1}`):

- B6 modlog: run `3da15cde-4555-491a-a813-2eb5aeffaac6`, job `51c2b97f-30e3-49e0-af78-3b085e27a262`
- B7 giveaway: run `164f9d90-c986-4225-b690-bfb6362770cf`, job `c601824a-c18b-4989-a09b-eacf46d364b3`
- B8 reactionrole: run `0829e264-60cf-4ee1-ad0e-29334546e031`, job `8d38d8a6-e2c1-4661-bd3e-ce1e053dd64a`
- B9 timeout: run `fe67662f-52ea-4bd7-8a37-a97cb99a62d3`, job `8e5e2db8-0769-4e22-b96c-4026d34d9b10`
- B10 threadwelcome: run `08d18f03-145a-43c0-871c-4a2e0a56b42e`, job `b0876412-95b9-43ee-adc0-bc43a8c93d62`
- All boss jobs `builder|completed|{"ok": true, "phase": "live"}`; all bot rows `draft` (zero Discord publish).

## Known Limitations

- No UI, login, or Discord publish exercised (by design; bots stayed draft, no publish call of any kind).
- Spend/spec evidence captured BEFORE per-brief cleanup; account-delete cascades those rows, so post-hoc DB re-audit is not possible (same FK-cascade observation as live-smoke-003). Snapshots below ARE the evidence.
- B6 wall seconds is the DB created→updated window (~23.3s), not driver-measured (see Assumptions).
- Bounded poll (20s + 15x30s) was more than enough — longest run (B7) went terminal in ~60s DB window.
- Report filename uses local wall-clock (+03); box evidence timestamps are UTC.

## Per-brief table

| brief             | runId                                | phase | wall s            | calls | credits | spec rows | cleaned |
| ----------------- | ------------------------------------ | ----- | ----------------- | ----- | ------- | --------- | ------- |
| B6 modlog         | 3da15cde-4555-491a-a813-2eb5aeffaac6 | live  | ~23.3 (DB window) | 1     | 0.3776  | 1 (v1)    | y       |
| B7 giveaway       | 164f9d90-c986-4225-b690-bfb6362770cf | live  | 94.8              | 2     | 2.00112 | 1 (v1)    | y       |
| B8 reactionrole   | 0829e264-60cf-4ee1-ad0e-29334546e031 | live  | 24.5              | 1     | 0.36652 | 1 (v1)    | y       |
| B9 timeout        | fe67662f-52ea-4bd7-8a37-a97cb99a62d3 | live  | 24.5              | 1     | 0.17436 | 1 (v1)    | y       |
| B10 threadwelcome | 08d18f03-145a-43c0-871c-4a2e0a56b42e | live  | 58.5              | 1     | 0.7874  | 1 (v1)    | y       |

Total: 5/5 `live`, 6 billable calls, 3.707 credits (~$0.0185), 0 premium-lane flags, 0 Discord publishes, own `-b-` rows 0/0 verified at end.

## Step-by-step evidence (commands + results, secrets redacted)

0. **Pre-checks (read-only, sm2-pre.sh):** HEAD 5c6c13409387d9f0f3e17e3815de397ce40a975b, status only `?? infra/compose/backups/`; web healthy / gateway Up 32min / postgres healthy / caddy Up 17h. WIRO_FILE_LEN=32, GW env len 32, `builder-worker-started` present. bots 0, smoke accounts 0. Bench-b rows 0/0 (bb-pre.sh).
1. **B6 modlog** brief: "Build a mod-log bot: log every deleted message (author, channel, time) to a #mod-log channel."
   - First send executed box-side but driver threw on EXIT_CODE stderr (harness bug); retry hit `accounts_discord_id_unique`. Recovered read-only: acct `3eb8c73b-ffb4-43c4-891a-815738db0069`, bot `23e6e6f1-4bc2-4a4b-afb0-d94d5327dd74` (draft), run `3da15cde-...` phase `live`, detail `{"stub": false, "model": "glm/5-2", "version": 1}`, created 15:01:55Z, updated 15:02:19Z (~23.3s). Job `51c2b97f-...` `completed|{"ok": true, "phase": "live"}` (matched via data LIKE runId).
   - Spend: 1 row, 0.3776 credits, `0.3776|glm/5-2|15:02:19Z`. Spec: 1 row, `1|15:02:19Z`.
   - Cleanup (mapper order): DELETE 1 / DELETE 1 / DELETE 1; own `-b-` accounts 0, bots 0, acct spend 0|0 (residual global builder_runs 1 was runner A's concurrent row).
2. **B7 giveaway** brief: "Create a giveaway bot: start a giveaway with a prize and duration, let members enter with a reaction, and pick a random winner at the end."
   - SEND: acct `22a17336-3aa8-4ac5-a0ab-3e9f0f49bbf8`, bot `6ae3d26e-a4e4-4408-ac8e-22d7f19f233c`, run `164f9d90-...`, job `c601824a-...`. Poll → `live` (wall 94.8s; created 15:04:45Z, updated 15:05:45Z).
   - Spend: 2 rows (`0.9944|glm/5-2|15:05:18Z`, `1.00672|glm/5-2|15:05:45Z`), sum 2.00112. Spec: 1 row v1 15:05:45Z. Boss `completed|{"ok": true, "phase": "live"}`. Bot `draft`.
   - Cleanup: DELETE 1/1/1; own rows 0/0 (global builder_runs 1 = runner A's row; jsonl `cleaned=false` artifact, corrected to y).
3. **B8 reactionrole** brief: "Build a reaction-role bot: give members the Gamer role when they react with the game emoji."
   - SEND: acct `812b39af-8fd1-4c7b-a4bb-65dec2a80920`, bot `046e26b9-aa81-4a78-905a-cc993c6f43e0`, run `0829e264-...`, job `8d38d8a6-...`. Poll → `live` (wall 24.5s; created 15:06:55Z, updated 15:07:13Z).
   - Spend: 1 row `0.36652|glm/5-2|15:07:13Z`. Spec: v1 15:07:13Z. Boss completed/live. Bot draft.
   - Cleanup: DELETE 1/1/1; own rows 0/0 (same global-row artifact as B7, corrected to y).
4. **B9 timeout** brief: "Create a timeout bot: time out a member for 10 minutes when a moderator uses the timeout command."
   - SEND: acct `27b6ccfe-0f60-4477-8809-a0047958cdf4`, bot `0b2bf61d-37be-40f0-a7d7-86f28696ce9a`, run `fe67662f-...`, job `8e5e2db8-...`. Poll → `live` (wall 24.5s; created 15:07:38Z, updated 15:07:51Z).
   - Spend: 1 row `0.17436|glm/5-2|15:07:50Z`. Spec: v1 15:07:51Z. Boss completed/live. Bot draft.
   - Cleanup: DELETE 1/1/1; verify 0/0/0|0/0 — fully clean.
5. **B10 threadwelcome** brief: "Build a thread-welcome bot: open a private thread for each new member and post a welcome message inside it."
   - SEND: acct `7d31b99c-6b93-476b-8cd0-46b0dcae6ee0`, bot `5b8a2e91-bef5-408f-96bc-f8a1f3233017`, run `08d18f03-...`, job `b0876412-...`. Poll → `live` (wall 58.5s; created 15:08:17Z, updated 15:08:44Z).
   - Spend: 1 row `0.7874|glm/5-2|15:08:44Z`. Spec: v1 15:08:44Z. Boss completed/live. Bot draft.
   - Cleanup: DELETE 1/1/1; verify 0/0/0|0/0 — fully clean.
6. **Final verify (bb-final.sh):** own `-b-` accounts 0, bots 0; global accounts 0, builder_runs 0, spec_versions 0; HEAD still 5c6c134; all 4 services running. Box left running. No repo files staged/committed/restored. Zero key/token/secret values recorded anywhere — shapes only.
7. **Cost:** 0.3776 + 2.00112 + 0.36652 + 0.17436 + 0.7874 = 3.707 credits ≈ $0.0185 — two orders of magnitude under the $1 abort line. Stop rules respected: sequential (never 2 live jobs at once from this runner), no premium-lane drift (all billable calls `glm/5-2`), max 2 attempts per command (only B6 send needed a second path, via read-only recovery).
