# Task Report: wiro-key-001c

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1703_wiro-key-001c_CREATE_install-key.md
- MODIFIED (box): /opt/corvus/.env — WIRO_API_KEY line merged (file WIRO length 0 -> 64), line count unchanged 16, WIRO occurrences 1, mode 0600 root before and after
- BOX-TRANSIENT: /opt/corvus/.env.bak-wiro-20260919 overwritten with fresh cp -p before merge (0600 root)
- NOT-TOUCHED-LOCAL: all repo files (no stage/commit/restore; helpers only under $TEMP\sshwork, outside the repo: wiro-push-001c.js, k5b-postverify.sh, lc-check.sh)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built), pgdata, caddy_data, all other box files, other services (web/postgres/caddy not recreated)

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2, wiro-merge.py remote script). No installs run.

## Assumptions Made

- Pre-checks all green: box HEAD 5c6c13409387d9f0f3e17e3815de397ce40a975b; ps = web healthy / gateway Up 3h / postgres healthy / caddy Up 16h; .env mode 600 root; WIRO file length 0 and gateway env length 0.
- Founder authorization covers opening C:\Users\xr3less\Desktop\wiroai.txt for WIRO_API_KEY only (explicit 2026-09-19). File was read only inside the Node helper via fs.readFileSync; shapes only logged, never values; key sent to box via SSH stdin pipe only, never argv/echo.
- Parsing result: RAW_BYTES=124, NONEMPTY_LINES=3, line0 len 12 (has =), line1 len 32 (no =), line2 len 72 (has =). Two charset-valid candidates (len 32 on line1, len 64 on line2); winner = line2 candidate len 64 (unique longest, single-line, no CR/LF). Loser (len 32) treated as label/other token, discarded.
- Gateway recreate ran only after file verification showed WIRO_FILE_LEN=64, 16 lines, single occurrence.

## Open Questions for Orchestrator

1. WIRO_API_KEY is now live (file len 64, gateway env len 64, builder-worker-started present). The 001b loser/second candidate (len 32, line1) was discarded as non-key per the longest-token rule — if the provider expected a 32-char format, flag it; otherwise no action.
2. Backup .env.bak-wiro-20260919 remains on the box; delete or keep per founder preference.
3. The stock k5-postverify.sh fails when run outside /opt/corvus (`couldn't find env file: /root/.env`); k5b-postverify.sh (same checks with `cd /opt/corvus` first) passed. Consider replacing the stock script with the cd-first variant.

## Public Interface Exposed

N/A (ops task, no code interface). Step log, lengths only:

- k1-pre: HEAD=5c6c134, ps all Up, .env 600 root, WIRO_FILE_LEN=0, GW env len 0.
- k2-bak: BACKUP_OK (fresh overwrite of .bak-wiro-20260919, 600 root).
- wiro-push-001c: parse shapes RAW_BYTES=124 NONEMPTY_LINES=3 CAND_COUNT=2 (CAND_LEN 32 on line1, 64 on line2), WIN_LINE=2 WIN_LEN=64, REMOTE WIRO_MERGED_LEN=64, REMOTE_EXIT=0.
- lc-check verify: .env 16 lines, WIRO_OCC=1, WIRO_FILE_LEN=64, 600 root.
- k4-upgw: UP_EXIT=0, gateway recreated (Up ~20s at check), postgres/caddy untouched.
- k5b-postverify: ps all Up (gateway Up ~51s, web/postgres healthy, caddy 16h), GW env len 64, builder-worker-started present in gateway logs.

## Known Limitations

- Key validity against the WIRO provider was NOT tested (no billable call made); presence + worker pickup proven only. A live builder re-smoke is still needed to prove the `live` path.
- No UI, login, Discord, migration, pull, or build was touched. Report filename uses local wall-clock (1703 +03).
