# 10 — Deployment

## Status: DRAFT (filled 2026-09-07 — path locked D-018, box live D-020)

> How Corvus ships. "Deployed" is not "validated" — a live URL starts learning. First public launch coordinates with the founder (one-way-ish door).

---

## 1. Environments

| Environment         | Purpose                                                                  | URL                                                                            |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Local               | Development (Compose subset: PG + gateway + web)                         | localhost                                                                      |
| Box (prod)          | Real users — Contabo VPS 4 interim → Hetzner CX23/CX33 on stock return   | IP-first: https://\<server-ip\>.nip.io (APP_URL), then real domain at purchase |
| (No staging box V1) | Test guilds + draft simulator cover staging; separate staging pool is V2 | —                                                                              |

---

## 2. How it ships (the pipeline)

CI (`ci.yml`): spec-dist build → `tsc --noEmit` → ESLint → Prettier check → Vitest (unit + launch-blocker A/B on real PG service) → spec-drift tests → **eval gate** (golden Discord.js tasks must pass — merge blocked otherwise). Build images → push GHCR (`SHA` + `stable` tags). Deploy (`deploy.yml`): SSH to box → `docker compose pull && docker compose up -d`. Rollback: re-pull previous SHA (digests retained). DB migrations forward-only via Drizzle, AFTER a pre-deploy `pg_dump` snapshot. appleboy/ssh-action pinned to SHA short-term, migrate to step-security drop-in at next deploy-work touch (health check 2026-09-07).

---

## 3. Hosting & infrastructure

Interim Contabo VPS 4 Nuremberg (~~€5.50/mo, D-020) → Hetzner CX23 (~~€6) → CX33 (~~€9) as triggers fire. Fixed start ≈ €6/mo; object storage (€6.49) + monitor VPS (~~€5) deferred with triggers (D-019). Money math: 100 Pro users ≈ $1,000/mo vs ~€25/mo infra — infra never binds; allowances do.

---

## 4. Secrets & configuration in production

All secrets in environment (see `07 §7` checklist), injected via Compose env-file owned by root (`0600`), never in images, never in repo, never in logs. `ENCRYPTION_KEY` rotation: dual-key envelope (new key encrypts new data, old retained read-only until re-encrypted). Creem webhook secret rotated in dashboard + box same task. `.env.example` is the checklist; CI fails on unlisted vars.

---

## 5. Monitoring & rollback

Uptime Kuma on-box now (Telegram + email alerts on gateway down; heartbeat monitor on the pg-boss digest cron so silent stalls page); separate-VPS Kuma at first payer (a monitor on the box dies with the box). Container `healthcheck` + `restart: unless-stopped` = local self-heal. Logs: Docker json-file rotation (10m×3) + JSON lines with `botId/specVersion`. Rollback: app = previous GHCR SHA (<5 min); data = nightly `pg_dump` + pre-deploy snapshot; bot behavior = one-click spec rollback (V1-3). Bad-release drill: quarantining a bot never touches siblings (multiplexed shards isolate per-token) Preflight worker ships export-only (startup wiring owned by V1-3); no worker runs in prod until then..

---

## 6. Backups

Postgres: nightly `pg_dump -Fc` sidecar → local volume NOW; → Hetzner Object Storage (7 daily + 4 weekly) when bought (trigger: PG >60% disk 7d). Box: Contabo free snapshot post-provision + pre-deploy (1 slot — rotate). Restore tested monthly (documented pass/fail in `PROJECT_STATUS.md`). Tokens re-encrypt, never restore plaintext anywhere. Data loss on restart is a launch-blocker with regression test A (V1-8) — backups are the second net, not the first.
