# Corvus V1 — Server Runbook (for the founder)

Simple English. Short sentences. Follow from top to bottom.

## What you need before you start

- Your Contabo VPS IP address. You find it in your Contabo email or panel.
- Your root password. Contabo showed it once when the server was created.
- A Windows computer with internet.

## 1. How to connect to your server (SSH)

1. Open **Windows Terminal** (or PowerShell).
2. Type this. Replace `1.2.3.4` with your real server IP:
   `ssh root@1.2.3.4`
3. Press Enter. It asks: "Are you sure you want to continue?" Type `yes`. Press Enter.
4. It asks for your password. Type your root password. Press Enter.
   You will see no dots while typing. That is normal.
5. Success looks like this: `root@vmi1234567:~#`
   That `#` means you are inside your server.

If you like PuTTY more: open PuTTY, put your IP in "Host Name", press Open, log in as `root`.

## 2. How to run the setup script

You will copy the file `provision-contabo.sh` onto the server, then run it.

1. On your Windows computer, open `infra\provision-contabo.sh` in Notepad.
2. Select everything. Copy it (Ctrl+A, Ctrl+C).
3. In your SSH window (you are root), type: `nano setup.sh`
   Press Enter. An editor opens.
4. Paste (right-click in Windows Terminal, or Ctrl+Shift+V).
5. Save: press Ctrl+O, then Enter. Exit: press Ctrl+X.
6. Run it: `bash setup.sh`
7. Wait. It takes about 5–10 minutes. Do not close the window.
   You will see clear messages: "Step 1 of 8", "Step 2 of 8", and so on.

## 3. What each step means (one line each)

1. System update — installs the latest fixes from Ubuntu.
2. Docker install — installs Docker version 28.5.2. Your apps run inside Docker.
3. Corvus user — creates a normal user called `corvus` for daily work.
4. Login safety — keeps password login ON. Nothing is locked. Port stays 22.
5. Protection — turns on the firewall (ports 22, 80, 443), fail2ban (blocks password guessers), and automatic security updates.
6. Extra memory — adds a 2GB swap file so busy moments do not crash the server.
7. Log limit — Docker logs are capped at 10MB per file, 3 files each. Logs can never fill the disk.
8. Final check — prints versions and runs a tiny Docker test.

## 4. How to take the Contabo snapshot (do this FIRST after setup)

The snapshot is your save point. If anything breaks later, Contabo can restore it.

1. Log in to the Contabo customer panel (my.contabo.com).
2. Click your VPS (Cloud VPS 4).
3. Click the **Snapshots** tab (or section).
4. Click **Create snapshot** (or "Take snapshot").
5. Give it a name like `corvus-fresh-setup`.
6. Wait until it says done. Do not skip this.

## 5. What success looks like

At the end of the script you see:

- `Docker version 28.5.2, build ...`
- `Docker Compose version v...`
- `Hello from Docker!` (from the tiny test image)
- `ALL DONE. Your server is ready.`
- `Take a SNAPSHOT in your Contabo control panel.`

If you see all of that, you are done. Take the snapshot.

## 6. If something fails

1. Read the last lines on the screen. Red text tells you which step stopped.
2. Just run the script again: `bash setup.sh`
   It is safe to re-run. It skips steps that are already done.
3. If it fails again in the same place, copy the **last 20 lines** and send them to the orchestrator (your AI helper). Example:
   `tail -n 20 /var/log/corvus-provision.log`
4. Do NOT run random commands from the internet. Wait for instructions.
5. Worst case: restore the Contabo snapshot and tell the orchestrator what happened.

## Quick command list (copy and paste)

- Connect: `ssh root@YOUR_SERVER_IP`
- Run setup: `bash setup.sh`
- Run setup again (if needed): `bash setup.sh`
- See last 20 log lines: `tail -n 20 /var/log/corvus-provision.log`
- Check Docker: `docker --version`
- Check firewall: `ufw status`

## 7. Deploy (V1-8) — how a new version reaches the server

The apps run from images built by GitHub and pulled from GHCR. This section is the
deploy order. Follow it top to bottom.

### 7.1 One-time setup (do this once)

1. **Server secrets.** In the GitHub repo: **Settings -> Secrets and variables -> Actions**.
   Add three secrets (no values are stored in the repo):
   - `DEPLOY_HOST` — your server IP.
   - `DEPLOY_USER` — the SSH user (for example `root`, or `corvus`).
   - `DEPLOY_SSH_KEY` — the private key for that user. Paste the whole key, including
     the `-----BEGIN ...` and `-----END ...` lines.
2. **Put the repo on the server.** In your SSH window:
   `git clone <repo-url> /opt/corvus` (the workflow expects the repo at `/opt/corvus`).
3. **Create the server `.env`.** `cd /opt/corvus`, then `nano .env`. Copy the keys from
   `.env.example` and fill the real values (`POSTGRES_*`, `DATABASE_URL`, `APP_URL`,
   `DISCORD_*`, `GHCR_OWNER`, `TAG`). Save with Ctrl+O, Enter, Ctrl+X.
4. **Log in to GHCR.** The images are private, so the server must log in once:
   `echo <GITHUB_PAT> | docker login ghcr.io -u <github-username> --password-stdin`
   (the token needs `read:packages`).

### 7.2 First deploy — snapshot -> migrate -> pull -> up

1. **Snapshot (Contabo).** Take a Contabo snapshot first (see section 4). This is your
   whole-server save point.
2. **Database snapshot (pg_dump).** This is your schema rollback point, and it MUST run
   before any migration:
   `docker compose --env-file .env -f infra/compose/compose.yml --profile backup run --rm pg-backup`
   It writes `infra/compose/backups/corvus.dump`.
3. **Migrate (forward-only).** Apply every file in `apps/gateway/drizzle/` once, in
   number order (`0001`, `0002`, ...). There is no migration-runner script yet, so run
   them by hand, for example:
   `for f in apps/gateway/drizzle/*.sql; do docker compose --env-file .env -f infra/compose/compose.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < "$f"; done`
   Rules: never edit an old migration, never write new DDL by hand. If unsure, stop and
   ask the orchestrator.
4. **Pull the images:**
   `docker compose --env-file .env -f infra/compose/compose.yml pull web gateway`
5. **Start them:**
   `docker compose --env-file .env -f infra/compose/compose.yml up -d web gateway`

After this, normal deploys can run from the GitHub UI: **Actions -> deploy -> Run workflow**.
The workflow does the CI gates, builds and pushes the images, then runs `pull` + `up` on
the server over SSH. It does NOT run migrations — those stay an explicit step (7.2.3).
The workflow also does NOT read the repo from the server, so run `git -C /opt/corvus pull`
on the server first when `compose.yml` or `.env` changes.

### 7.3 Verify the deploy

1. **Health:** `docker compose --env-file .env -f infra/compose/compose.yml ps`
   `web` should say `healthy` (it health-checks `/`), `gateway` should say `running`.
2. **Answer:** `curl -f http://localhost:3000/` — a normal page means the web app is up.
3. **Version:** `docker compose --env-file .env -f infra/compose/compose.yml images`
   shows the tag currently running (`stable`, or the SHA you deployed). To confirm:
   `docker inspect --format '{{.Config.Image}}' $(docker compose --env-file .env -f infra/compose/compose.yml ps -q web)`

Note: there is no `/healthz` route yet; `web`'s healthcheck uses `/` (the cheap static
route), which is what `ps` reports as `healthy`.

### 7.4 Rollback

Re-run the deploy workflow with **previous-sha** set to the last good commit SHA. It skips
the build and re-pulls that image tag on the server.
Manual equivalent: `TAG=<last-good-sha> docker compose --env-file .env -f infra/compose/compose.yml pull web gateway`
then `... up -d web gateway`.

Migrations are forward-only, so a rollback does NOT undo a schema change. If the bad deploy
also changed the schema, restore the database from the pg_dump (7.2.2) or the Contabo
snapshot (7.2.1) instead.

### 7.5 Still to come (not wired yet)

- **HTTPS/TLS.** No reverse proxy is in compose yet, so the app is not served on 443.
  Follow-up: add a proxy (for example Caddy) that terminates TLS and forwards to
  `web:3000`, then set `APP_URL` to the real domain.
- **Automatic deploy on push to main** is intentionally OFF until the founder approves it.
