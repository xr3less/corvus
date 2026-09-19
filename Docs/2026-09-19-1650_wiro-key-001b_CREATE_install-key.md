# Task Report: wiro-key-001b

## Status

FAILED

## Files Touched

- CREATED: Docs/2026-09-19-1650_wiro-key-001b_CREATE_install-key.md
- NOT-TOUCHED-LOCAL: all repo files (no stage/commit/restore; only transient helpers in $TEMP\sshwork, outside the repo: wiro-merge.py, wiro-push.js, wiro-shape.js, k3/k3b/k3c/k4/k5/k9 .sh scripts)
- BOX-TRANSIENT: /opt/corvus/.env.bak-wiro-20260919 (backup copy, kept on box); /opt/corvus/.env written once by merge then RESTORED from backup (final state identical: 16 lines, WIRO len 0, 0600 root)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), pgdata, caddy_data, all other box files; gateway NOT restarted (stopped per fail rule)

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2). No installs run.

## Assumptions Made

- Pre-checks all green: box HEAD 5c6c13409387d9f0f3e17e3815de397ce40a975b; ps = web healthy / gateway Up 3h / postgres healthy / caddy Up 16h; .env mode 600 root.
- Backup step succeeded (.env.bak-wiro-20260919, mode 600 root, BACKUP_OK).
- Key file never Read/cat by human; read only inside Node helper via fs.readFileSync + trim, only LENGTHS logged; sent to box via SSH stdin pipe only, never argv/echo.
- STOP rule honored: on verification failure, no `compose up -d gateway` was run; box left running untouched.

## Open Questions for Orchestrator

1. **wiroai.txt is NOT a single-line bare key — STOPPED, nothing installed.** Shape only (never values): RAW_BYTES=124, TRIM_LEN=122, TRIM_LINES=4, EQ_COUNT=2, SPACE_COUNT=3, CRLF line endings, starts with two letters. Merged attempt wrote only the first fragment: WIRO line length 11-12, .env grew 16 -> 19 lines (multi-line value split the file), NAMES_SAME otherwise. Expected a single-line `WIRO_API_KEY=<token>` value. Please have the founder confirm: is the file the raw API key, or does it contain labels/instructions/extra lines? Re-run only with a confirmed single-line key value.
2. **Restore verified clean:** .env back to 16 lines, WIRO_FILE_LEN=0, mode 600 root; compose ps all Up (caddy 16h, gateway/postgres/web 3h). The .bak-wiro-20260919 backup remains on the box; delete or keep per founder preference.
3. Only 1 of 2 allowed attempts per command was used for the merge (single attempt, then STOP on shape mismatch). No retry was appropriate — retrying the same malformed value would re-break .env parsing.

## Public Interface Exposed

N/A (ops task, no code interface). Step log, lengths only:

- k1-pre: HEAD=5c6c134, ps all Up, .env 600 root, WIRO_FILE_LEN=0, GW env len 0.
- k2-bak: BACKUP_OK (.bak-wiro-20260919, 600 root).
- wiro-push: LOCAL_KEY_LEN=122 (trimmed), REMOTE WIRO_MERGED_LEN=122, REMOTE_EXIT=0 — merge script reported full stdin length but file write fragmented (multi-line stdin broke the single-line assignment).
- k3-verify: WIRO_FILE_LEN=11 (awk) / 12 (cut) — first-line fragment only; FAIL vs expected N>0 single-line.
- k3b/k3c diag (lengths/shapes only): HAS_EQ line count 17, WIRO value fragment contains `=` (1 `=` in value); L5_LEN=26 (fragment), L7_LEN=1, file 19 lines vs bak 16; WIRO_OCC=1; BAK_WIRO_LEN=0.
- k9-restore: RESTORE_DONE, .env 16 lines, WIRO_FILE_LEN=0, 600 root, ps all Up.

## Known Limitations

- WIRO_API_KEY is still ABSENT on the box (file + gateway env both len 0). Builder lane still skips every route (`no-key`); `live` path still unproven.
- Gateway was deliberately NOT restarted and post-restart worker check (builder-worker-started) was NOT run — pending a valid single-line key install.
- No UI, login, Discord, migration, pull, or build was touched. Report filename uses local wall-clock (1650 +03).
