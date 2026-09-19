# Task Report: box-redeploy-003

## Status

SUCCESS (box rebuilt from pushed commit 5c6c134; box left running healthy; no secrets exposed)

## Files Touched

- CREATED: Docs/2026-09-19-1405_box-redeploy-003_CREATE_rebuild-retry.md
- MODIFIED-BOX (/opt/corvus): apps/web/Dockerfile + apps/gateway/Dockerfile (checkout origin/master, then pull --ff-only to 5c6c13409387d9f0f3e17e3815de397ce40a975b)
- CREATED-BOX: /opt/corvus/infra/compose/backups/ + /opt/corvus/infra/compose/backups/corvus.dump (59273 bytes, PostgreSQL custom dump v1.16-0)
- RETAGGED-BOX: ghcr.io/xr3less/corvus-web:stable -> c13d1a421ede (313MB) + ghcr.io/xr3less/corvus-gateway:stable -> c88c762a79b9 (638MB), both built FROM REPO DOCKERFILES at /opt/corvus root context
- RECREATED-BOX: corvus-web-1, corvus-gateway-1, corvus-postgres-1 (data survives in pgdata); corvus-caddy-1 left running (Up 13h)
- NOT-TOUCHED-LOCAL: apps/web/app/layout.tsx, apps/web/package.json, package-lock.json (dirty grab changes left alone; never staged/committed/restored)
- NOT-TOUCHED-BOX: /opt/corvus/.env (0600 root preserved, never catted for values, never chmodded), caddy_data, pgdata (never deleted)
- HELPERS-ONLY ($TEMP\sshwork, outside repo, not committed): checkout-pull.sh, pre-backup.sh, backup.sh, diag-backup.sh, backup2.sh, backup3.sh, up-apps.sh, recreate-pg.sh, retag-check.sh, mig-check.sh, verify.sh

## Dependencies Added

None in repo. Operational note (not a repo dep): reused `ssh2` in $TEMP\sshwork from box-redeploy-002 plus new .sh scripts there. Password read from Desktop secret file inside helper process only, never in command lines.

## Assumptions Made

- Box HEAD at task start was b5c9833c2942a458f48a053f9d533328cd040d67 (as expected); origin/master 5c6c13409387d9f0f3e17e3815de397ce40a975b.
- DISCORD_BOT_TOKEN absence from box .env is EXPECTED fleet-only per standing secrets contract — did not block (all other names present, shapes verified).
- TAG=stable honored; no GHCR pull (stable tags stale by design); compose refs ghcr.io/xr3less/corvus-web:stable + gateway:stable were satisfied by retagging locally-built images (documented deviation: build tags corvus-web:rebuild/corvus-gateway:rebuild, then `docker tag` to compose refs).
- No pending migration: drizzle 0001..0009 already applied (accounts.tier present, ai_spend.attempt nullable + partial index ai_spend_ref_reason_attempt_uidx present), so no forward-only drizzle run was needed.
- Contabo snapshot already taken 2026-09-19 (aldim) — did NOT snapshot again per task.
- Timestamp for this report filename is real wall-clock from off-box check (2026-09-19-1405).

## Open Questions for Orchestrator

1. **pg-backup sidecar hangs (needs harness fix, workaround used):** `docker compose --profile backup run --rm pg-backup` stayed `Up 10-12 minutes`, wrote 0-byte /opt/corvus/infra/compose/backups/corvus.dump, `docker logs` empty, inspect showed `running [sh -c pg_dump -Fc -h postgres ... > /backups/corvus.dump]`. Container had to be stopped/removed. Workaround (attempt 3, succeeding path): `exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > infra/compose/backups/corvus.dump` (single quotes keep expansion inside container) produced 59273-byte valid custom dump. Attempt 2 failed differently (role "root" does not exist + /root/.env miss when run from wrong cwd). Recommend fixing pg-backup service (password/interpolation or wait condition) before next deploy.
2. **Local dirty grab files still untouched:** local `git status --short` still shows M Docs/PLAN.md, M apps/web/app/layout.tsx, M apps/web/package.json, M package-lock.json + ?? this report. The three app/lock files are NOT part of pushed wave 5c6c134 (dev-only react-grab Script + dep). Orchestrator should identify writer process before next commit.
3. **Residual :3000 plaintext still live:** web keeps `0.0.0.0:3000->3000/tcp` (documented RUNBOOK 7.5 debug residual, out of scope). 5432 is now closed; 3000 close is future work.
4. **GHCR registry tags diverged from local:** registry `stable` was NOT pushed (no DEPLOY_* secrets, manual-only deploy.yml). Box now runs locally-built images retagged as `:stable`. Next registry push will overwrite; document which side is canonical.

## Public Interface Exposed

Proven OFF-box from this machine (AFTER rebuild):

- TCP 13.140.181.113:5432 — CLOSED-TIMEOUT (acceptance criterion met; was HANDSHAKE-OK-OPEN before).
- HTTPS https://13-140-181-113.nip.io/ — 200.
- Parked routes (guards now LIVE): /pryzm 404, /pick 404, /pick/results 404, /demo/stats-bento 404, /demo 200 (intended).

Proven ON-box:

- `compose ps`: corvus-web-1 Up healthy (:3000 published), corvus-gateway-1 Up (no published ports), corvus-postgres-1 Up healthy (5432/tcp container-internal only, NO host mapping), corvus-caddy-1 Up 13h (80/443/443udp).
- `curl -f http://localhost:3000/` 200; `curl -f https://13-140-181-113.nip.io/` 200.
- Data survives recreate: 12 relations (accounts, ai_spend, audit_events, bots, builder_runs, guild_installs, interview_progress, oauth_states, sessions, spec_versions, templates, user_records); `SELECT count(*) FROM bots` = 0.
- `ss -tlnp`: only 0.0.0.0:3000 + [::]:3000 via docker-proxy; NO 5432 listener.
- Caddy log tail 50: `certificate obtained successfully` for 13-140-181-113.nip.io; recent warns are scanner/broken-pipe noise only (leakix/php-cgi/nodesync probes, sentry Range probes), no ACME errors.

## Known Limitations

- Backup-profile path is broken (see OQ-1); rollback point is the exec-based dump at /opt/corvus/infra/compose/backups/corvus.dump (59273 bytes), NOT a pg-backup-profile dump.
- Box .env was checked for names+shapes only (MODE=600 OWNER=root; POSTGRES_PASSWORD 48 chars; DATABASE_URL 89 chars; DISCORD_CLIENT_SECRET 32 chars; ENCRYPTION_KEY 64-hex; GHCR_OWNER, TAG=stable, APP_URL=https://13-140-181-113.nip.io exact). No values appear in this report.
- `authorized_keys` key install NOT attempted (password helper worked; out of scope).
- Discord redirect + Contabo snapshot remain founder clicks (snapshot stated taken, not re-verified).
- No push, no registry push, no volume deletes performed. Box-local `?? infra/compose/backups/` is untracked by design (dump dir).
- Kuma, eval gate, KI-030 honesty, KI-031 bodies, KI-033 enforcement: untouched, still open.

## Step-by-step evidence (commands + results, secrets redacted)

1. **Local pre-check:** box task files read (002 handoff Next 1-3, compose.yml, RUNBOOK 4 + 7.2). Local HEAD 5c6c134; status shows 3 modified + 1 untracked (grab dirt, left alone). Helpers $TEMP\sshwork\ssh-exec.js + ssh-run.js reused (password+IP read inside helper from Desktop secret file).
2. **Step 1 (box HEAD + fetch, read-only):** HEAD=b5c9833c2942a458f48a053f9d533328cd040d67; `git fetch origin` OK; origin/master=5c6c13409387d9f0f3e17e3815de397ce40a975b; `status --short` showed `M apps/gateway/Dockerfile, M apps/web/Dockerfile`. Worktree diff vs origin/master is comment-only (gateway 1 add/11 del comment lines; web header + shared-package comments), confirming checkout-then-pull is safe per explicit authorization.
3. **Step 2 (env names):** MODE=600 OWNER=root. PRESENT: POSTGRES_USER=corvus, POSTGRES_PASSWORD 48 chars, POSTGRES_DB=corvus, DATABASE_URL 89 chars, DISCORD_CLIENT_ID 1547178080651710524, DISCORD_CLIENT_SECRET 32 chars, GHCR_OWNER=xr3less, TAG=stable, APP_URL=https://13-140-181-113.nip.io exact, ENCRYPTION_KEY 64-hex. MISSING: DISCORD_BOT_TOKEN (EXPECTED fleet-only, not blocking).
4. **Step 2 (checkout + pull, authorized):** `git checkout origin/master -- apps/web/Dockerfile apps/gateway/Dockerfile` -> CHECKOUT_OK; `git pull --ff-only` -> `Updating b5c9833..5c6c134 Fast-forward, 33 files changed, 681 insertions, 75 deletions`; HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b == origin/master; `status --short` clean except `?? infra/compose/backups/` (created next step). Attempt count: 1.
5. **Step 3 pre-checks:** compose postgres block has NO published ports (only comment + pgdata + healthcheck); `grep 5432` hits only comment text. `mkdir -p infra/compose/backups` OK. drizzle dir: 0001_init.sql .. 0009_ai_spend_attempt.sql.
6. **Step 3 (pg_dump):** Attempt 1 (`--profile backup run --rm pg-backup`) HUNG — backgrounded after 300s timeout, sidecar Up 10-12 min, dump 0B, logs empty; stopped task, `docker stop/rm` cleaned. Attempt 2 (exec pg_dump with outer-shell expansion) FAILED EXIT 1: `role "root" does not exist` + `couldn't find env file: /root/.env` (cwd miss). Attempt 3 (exec sh -c inside postgres container, single-quoted env) SUCCEEDED: dump 59273 bytes, `file` = `PostgreSQL custom database dump - v1.16-0`, path /opt/corvus/infra/compose/backups/corvus.dump.
7. **Step 4 (build FROM REPO DOCKERFILES, root context, no GHCR pull):** `docker build --pull -f apps/web/Dockerfile -t corvus-web:rebuild .` WEB_EXIT=0, 313MB c13d1a421ede. `docker build --pull -f apps/gateway/Dockerfile -t corvus-gateway:rebuild .` GW_EXIT=0, 638MB c88c762a79b9. `git diff --stat` at build time showed only `?? infra/compose/backups/` (tree = pulled 5c6c134).
8. **Migration check (before up):** `\dt` 12 rows; accounts.tier 1 row; ai_spend.attempt integer nullable + indexes (pkey, account_created_idx, ref_reason_attempt_uidx) — 0008/0009 already applied. TAG=stable. No migrate run.
9. **Step 5a (retag + up web gateway caddy):** `docker tag corvus-web:rebuild ghcr.io/xr3less/corvus-web:stable` + gateway likewise -> RETAG_OK (IDs match). `up -d web gateway caddy` UPD_EXIT=0; web+gateway Recreated, web Healthy within ~30s. ps: web healthy :3000, gateway Up, postgres healthy (old container), caddy Up 13h.
10. **Step 5b (recreate postgres):** `up -d --force-recreate postgres` RECREATE_EXIT=0; new postgres Up 15s healthy; `5432/tcp` container-only; `ss -tlnp` shows ONLY :3000 listeners, NO 5432. ps all healthy/running.
11. **Step 6 (on-box verify):** `\dt` 12 rows + bots 0, DATA_EXIT=0. LOCAL3000:200, HTTPS:200. Parked: pryzm:404, pick:404, pick/results:404, demo/stats-bento:404, demo:200. `docker logs corvus-caddy-1 --tail 50`: cert obtained, no ACME errors (scanner warns only). Compose ps recorded in Public Interface.
12. **Off-box verify:** TCP5432:CLOSED-TIMEOUT; HTTPS:200; ROUTE pryzm:404, pick:404, pick/results:404, demo/stats-bento:404, demo:200. Wall-clock 2026-09-19-1405.
13. **Stop rules respected:** max 2 attempts per failing command (each distinct command tried once; backup step used 3 different paths, none retried more than twice). Box left running. No secret values in logs/report.
