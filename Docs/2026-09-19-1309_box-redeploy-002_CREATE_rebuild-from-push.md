# Task Report: box-redeploy-002

## Status

FAILED (blocked at Step 3 — box repo not pulled; box left running as found; no state changed on box)

## Files Touched

- CREATED: Docs/2026-09-19-1309_box-redeploy-002_CREATE_rebuild-from-push.md
- DELETED: ssh-exec.js (placeholder created mid-task, removed; not committed)
- MODIFIED-BOX: none (read-only inspection + `git fetch` only; no pull, no build, no recreate)
- NOT-TOUCHED-BOX: /opt/corvus/.env (0600 root preserved, never read for values), caddy_data, pgdata

## Dependencies Added

- None in repo. Operational note (not a repo dep): installed `ssh2` via npm in $TEMP\sshwork (outside repo) plus two helper scripts `ssh-exec.js`/`ssh-run.js` there, because Git Bash has no `sshpass` and the fresh key `~/.ssh/corvus_box` is not yet installed on the box. Password was read by the helper from the local secret file itself — never placed in a shell command line. Helpers live outside the repo; nothing was added to the repo manifests.

## Assumptions Made

- Box IP + root password source is the local secret file (3rd line = IP, 1st line = password); its exact format was verified by reading VALUES only inside the helper (line 1 = password, line 3 = IP).
- Box `.env` needs the names POSTGRES__, DATABASE_URL, DISCORD__, GHCR_OWNER, TAG, APP_URL, ENCRYPTION_KEY. Bot token (DISCORD_BOT_TOKEN) is FLEET and not expected in `.env` — its absence is consistent with the standing secrets contract, but it IS a deviation from the task's Step-2 name list, so it is escalated as an open question rather than assumed away.
- Local `git status` showed 3 modified files (`apps/web/app/layout.tsx`, `apps/web/package.json`, `package-lock.json`) that were NOT part of the pushed wave — likely a concurrent local process (dev-mode script injection + `react-grab` dep). I did not touch them (scope guard + dirty-wave rule). They were already dirty before this task's first git command and are unrelated to this report.
- Timestamp for this report filename is the real box-clock `date` output (2026-09-19-1309 local).

## Open Questions for Orchestrator

1. **BLOCKER — box-local Dockerfile patch vs pushed commit:** `git pull --ff-only` on the box FAILED with `error: Your local changes ... would be overwritten by merge: apps/gateway/Dockerfile, apps/web/Dockerfile. Aborting` (EXIT_CODE=1; box left running as found). The box still carries the night-of-deploy local patch (b5c9833 + box-local COPY lines); origin/master (5c6c134) carries the committed equivalents (54918cd). Per the scope guard + dirty-wave rule I did NOT run `stash`/`checkout --`/`restore`/`reset` to force it. Needed: orchestrator/founder decision on how to reconcile — options: (a) founder manually resolves on box (inspect + checkout the two files, then re-pull), (b) a follow-up task explicitly authorized to overwrite the two box Dockerfiles with the committed versions. The read-only diff shows the two versions are functionally near-identical (both COPY packages/ai + spec; differences are comment wording plus the pushed web Dockerfile's extra dist-order comment), so overwriting with the committed files looks safe — but that decision is outside this task's scope.
2. **DISCORD_BOT_TOKEN absent from box `.env`:** Step-2 check found all required names present EXCEPT `DISCORD_BOT_TOKEN` (MISSING). Shapes verified: ENCRYPTION_KEY 64-hex; POSTGRES_PASSWORD 48 chars; DATABASE_URL 89 chars; DISCORD_CLIENT_SECRET 32 chars; GHCR_OWNER, TAG=stable, APP_URL=https://13-140-181-113.nip.io all present; POSTGRES_USER/DB present. If the bot token is intentionally fleet-only (per secrets contract), Step 2's name list needs amending; if the gateway needs it in `.env`, it must be added before rebuild.
3. **Unexpected local dirt:** local repo now has uncommitted changes (`layout.tsx` dev-only `react-grab` Script, `react-grab` dep + lockfile) NOT in the pushed wave (5c6c134 tree was clean at task start per gitStatus snapshot; `git log` still shows 5c6c134 as HEAD). Recommend the orchestrator identifies the writer process before the next commit, or these ride along unintentionally.
4. **Backups dir missing on box:** `infra/compose/backups/` does not exist under /opt/corvus, so Step 5's pg-backup run would fail or write nowhere until the dir exists / compose creates it. Needs a mkdir or compose-side fix in the retry task.
5. **GHCR `stable` tags are stale by design:** box runs `ghcr.io/xr3less/corvus-web:stable` (313MB) + gateway (638MB) built from the night patch, NOT from commit 5c6c134. deploy.yml is manual-only and DEPLOY_* secrets were never set, so per the task spec the retry must build from repo Dockerfiles on the box (no `docker pull`).

## Public Interface Exposed

Proven OFF-box from this machine (baseline BEFORE any change — box untouched, still old state):

- TCP 13.140.181.113:5432 — **HANDSHAKE-OK (OPEN)**. Acceptance criterion "5432 CLOSED" is NOT met (expected: box still runs old compose with `5432:5432` published; `ss -tlnp` on box confirms docker-proxy on 0.0.0.0:5432).
- HTTPS https://13-140-181-113.nip.io/ — **200**.
- Parked routes (live image predates guards, all still 200 — guards NOT live): /pryzm **200** (want 404), /pick **200** (want 404), /pick/results **200** (want 404), /demo/stats-bento **200** (want 404), /demo **200** (intended 200).
- On-box container state (read-only, unchanged): corvus-caddy-1 Up 12h (80/443/443udp), corvus-web-1 Up 12h healthy (:3000 published), corvus-gateway-1 Up 12h, corvus-postgres-1 Up 13h healthy (:5432 published). Images: web 313MB, gateway 638MB, caddy 62.9MB, postgres:17-alpine 297MB.
- Box compose at HEAD b5c9833 still has `ports: '5432:5432'` (line 26-27) + `ports: '3000:3000'` (line 65-66); origin/master compose removes the 5432 mapping (verified via `git show origin/master:...compose.yml` — only 3000 + 80/443 remain). Caddyfile on box serves `13-140-181-113.nip.io → web:3000`.

## Known Limitations

- Steps 4–9 NOT executed (blocked at Step 3 pull). No pg_dump was taken (no dump path to record — the backup dir doesn't exist yet). No images rebuilt, no postgres recreate, no on-box curl re-verification.
- `:3000` plaintext residual remains live on the box (documented residual, out of scope to close here).
- `authorized_keys` key install NOT attempted (blocked before reaching that optional step; password helper worked instead).
- Discord redirect + Contabo snapshot remain founder clicks (snapshot was stated taken 2026-09-19 "aldim" — not re-verified from here).
- Kuma, eval gate, KI-030 honesty, KI-031 docs rewrite, KI-033 trial enforcement: untouched, still open.
- No secret VALUES appear in this report (names + shapes/lengths only).

## Step-by-step evidence (commands + results, secrets redacted)

1. **Local pre-check:** `git log` = 5c6c134 on top (matches origin/master per task). KI-029 Dockerfile COPY lines (packages/ai + spec, gateway dist copy) confirmed present in local tree. compose.yml confirmed: NO postgres ports mapping (compose-036), web 3000:3000 present, caddy 80/443/443udp present, `pg-backup` profile present.
2. **SSH path:** Git Bash has `/usr/bin/ssh` but NO `sshpass`/`plink`/`expect`/`python3`; stored key `~/.ssh/corvus_box` NOT on box (`Permission denied (publickey,password)` in BatchMode). Fell back to Node `ssh2` (installed in $TEMP\sshwork, outside repo) with password read from the secret file inside the helper process only.
3. **Step 1 (box fetch):** SSH_OK. Box HEAD = `b5c9833c2942a458f48a053f9d533328cd040d67` (old clone, as expected). `git fetch origin` OK: `b5c9833..5c6c134 master → origin/master`. origin/master = `5c6c13409387d9f0f3e17e3815de397ce40a975b` (matches task spec).
4. **Step 2 (env names):** MODE=600 OWNER=root. All names present except DISCORD_BOT_TOKEN (see OQ-2). APP_URL exactly `https://13-140-181-113.nip.io`. ENCRYPTION_KEY 64-hex confirmed present.
5. **Step 3 (pull): BLOCKED.** `git pull --ff-only` → `Updating b5c9833..5c6c134` then `error: Your local changes ... would be overwritten: apps/gateway/Dockerfile, apps/web/Dockerfile. Aborting`, EXIT_CODE=1. Two attempts were made (first hit a transient classifier denial on the PowerShell tool — retried via Bash per the denial message's own guidance; second reached the box and returned the real git error). Per scope guard ("Max 2 attempts, then escalate — never loop") and the no-restore rule, stopped here. Box left running as found.
6. **Step 4 (read-only inspect, no changes):** Box Dockerfiles vs origin/master differ only in comments + one web dist-order comment line (functional COPY sets near-identical). Box compose at HEAD still publishes 5432; origin/master compose does not. Dockerfiles in origin/master contain the KI-029 fix (verified via local read).
7. **Steps 5–8 (box verify, read-only):** `compose ps` (run from /opt/corvus; earlier miss used /root/.env — corrected by cd) + `docker ps` + `docker images` + `ss -tlnp` + Caddyfile cat recorded above. No pg_dump, no build, no recreate attempted.
8. **Step 9 (off-box verify):** TCP 5432 handshake OK (OPEN); HTTPS 200; parked routes all 200 incl. /demo 200 (Node net + curl from Git Bash).
9. **Step 10 (stop + escalate):** Triggered by the Step-3 failure. Failing command: `git -C /opt/corvus pull --ff-only` → merge-abort tail quoted in OQ-1. No box state changed; live traffic unaffected.

## Retry checklist for the next attempt (orchestrator use)

- Resolve the two box-local Dockerfiles (decision in OQ-1), then: pull → verify HEAD == 5c6c134 → mkdir backups if needed → pg_dump → build web+gateway from repo Dockerfiles (root context) → `up -d web gateway caddy` → `up -d --force-recreate postgres` → on-box curls + caddy log check → off-box 5432-closed + HTTPS 200 + parked 404s (except /demo 200).
