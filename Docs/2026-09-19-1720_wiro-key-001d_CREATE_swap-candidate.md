# Task Report: wiro-key-001d

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1720_wiro-key-001d_CREATE_swap-candidate.md
- MODIFIED (box): /opt/corvus/.env — WIRO_API_KEY line swapped (file WIRO length 64 -> 32), line count unchanged 16, WIRO occurrences 1, mode 0600 root before and after
- BOX-TRANSIENT: /opt/corvus/.env.bak-wiro-20260919 overwritten with fresh cp -p before merge (0600 root), kept afterwards
- NOT-TOUCHED-LOCAL: all repo files (no stage/commit/restore; helpers only under $TEMP\sshwork, outside the repo: wiro-push-001d.js new this task, modecheck.sh transient, plus reuse of run-sh.js + node_modules ssh2 + wiro-merge.py + k1-pre/sm2-pre/k2-bak/lc-check/k4-upgw/k5b-postverify)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built), pgdata, caddy_data, all other box files, other services (web/postgres/caddy not recreated)

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2, wiro-merge.py remote script). No installs run.

## Assumptions Made

- Pre-checks all green before any write: box HEAD 5c6c13409387d9f0f3e17e3815de397ce40a975b; ps = web healthy / gateway Up ~22min / postgres healthy / caddy Up 17h; .env mode 600 root; WIRO file length 64 and gateway env length 64 (leftover 001c state); bots count 0, smoke accounts 0 (via sm2-pre.sh).
- Founder authorization covers opening C:\Users\xr3less\Desktop\wiroai.txt for WIRO_API_KEY only (explicit 2026-09-19). File was read only inside the Node helper via fs.readFileSync; shapes only logged, never values; key sent to box via SSH stdin pipe only, never argv/echo.
- Parsing result identical to 001c: RAW_BYTES=124, NONEMPTY_LINES=3, line0 len 12 (has =), line1 len 32 (no =), line2 len 72 (has =). Two charset-valid candidates (len 32 on line1, len 64 on line2); winner this task = line1 candidate len 32 (the 001c discard). Explicit lens guard (sorted [32,64]) passed.
- Gateway recreate ran only after file verification showed 16 lines, WIRO_OCC=1, WIRO_FILE_LEN=32, 600 root.
- One extra k2-bak run after merge was executed only to display the .env mode line (backup file, not .env) after lc-check.sh showed no mode; .env 600 root was then confirmed via a dedicated transient remote modecheck. The .env file itself was written exactly once (the merge).
- No builder smoke, no DB rows, no billable call, no UI/login/Discord touched.

## Open Questions for Orchestrator

1. WIRO_API_KEY is now swapped to the len-32 candidate (file len 32, gateway env len 32, builder-worker-started present). A status-only auth probe + builder re-smoke is still needed to learn whether the provider accepts this candidate (001c len-64 was plumbing-correct but 401-rejected). Recommend a fresh live-smoke task (new run suffix) — NOT part of this task.
2. Backup .env.bak-wiro-20260919 remains on the box (now holds the len-64 state, 600 root); delete or keep per founder preference.
3. If the len-32 candidate is also 401-rejected, both source-file candidates are exhausted — next step would be provider-side (panel key copy/activation check), not another file swap.

## Public Interface Exposed

N/A (ops task, no code interface). Step log, lengths only:

- k1-pre + k5b + sm2-pre (read-only): HEAD=5c6c134, ps all Up, .env 600 root, WIRO_FILE_LEN=64, GW env len 64, builder-worker-started present, bots 0, smoke accounts 0.
- k2-bak: BACKUP_OK (fresh overwrite of .bak-wiro-20260919, 600 root).
- wiro-push-001d: parse shapes RAW_BYTES=124 NONEMPTY_LINES=3 CAND_COUNT=2 (CAND_LEN 32 on line1, 64 on line2), WIN_LINE=1 WIN_LEN=32, REMOTE WIRO_MERGED_LEN=32, REMOTE_EXIT=0.
- lc-check verify: .env 16 lines, WIRO_OCC=1, WIRO_FILE_LEN=32; modecheck: .env 600 root.
- k4-upgw: UP_EXIT=0, gateway recreated (Up ~20s at check), postgres/caddy untouched.
- k5b-postverify: ps all Up (gateway Up ~28s, web/postgres healthy, caddy 17h), GW env len 32, builder-worker-started present in gateway logs.
- Final HEAD confirm: 5c6c134 unchanged.

## Known Limitations

- Key validity against the WIRO provider was NOT tested (no billable call made, by design); presence + worker pickup proven only. A live builder re-smoke is still needed to prove the `live` path with this candidate.
- No UI, login, Discord, migration, pull, or build was touched. Report filename uses local wall-clock (1720 +03).
