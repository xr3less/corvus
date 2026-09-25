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

CI (`ci.yml`): migrate the throwaway CI database with the journaled runner (`ci.yml:37-38`) → spec-dist build → `tsc --noEmit` → ESLint → Prettier check → Vitest (unit + launch-blocker tests on real PG service) → spec-drift tests (the `parseSpec` parity net in `builder-prompt.test.ts`). There is **no eval merge-gate**: `packages/ai/src/eval/spec-eval.test.ts` is an offline stub (stubbed `chat()`, fetch tripwire, no provider key — `spec-eval.test.ts:1-10`) that gates the prompt + schema contract, **not** model quality; a live model-quality eval is explicitly out of scope for that harness. CI **never pushes images** — the `docker-build` job is build-only (`push: false`, `ci.yml:117`). Images reach GHCR only through `deploy.yml`, which is manual-only (`workflow_dispatch`, `deploy.yml:22-23`); as of the last recorded check (KI-029, 2026-09-19) it has not been run end-to-end — `DEPLOY_*` never set — so the box images to date were built on the box, not pulled from GHCR (`Docs/KNOWN_ISSUES.md` KI-029; box-redeploy-003). Deploy (`deploy.yml`): SSH to box → `docker compose pull && docker compose up -d` (`deploy.yml:156-158`; order in `infra/RUNBOOK.md §7.2`). Rollback: re-run `deploy.yml` with `previous-sha` (documented `deploy.yml:13-16`; manual form in `RUNBOOK.md §7.4`). DB migrations go through the journaled forward-only runner: `apps/gateway/scripts/migrate.mjs` applies each unjournaled `apps/gateway/drizzle/*.sql` in filename order (`.sort()`, `migrate.mjs:88`), one transaction per file, and records filename + sha256 in `public.schema_migrations` (`migrate.mjs:51-81`); a checksum mismatch on a journaled file — or a journaled file missing from disk — is a hard fail (`migrate.mjs:30-49`), and `--check` verifies without applying (`migrate.mjs:109-115`). CI runs it against its throwaway Postgres (`ci.yml:37-38`); `deploy.yml` runs the same step inside its own gates but **never migrates the live database** (`deploy.yml:42-45,74-75`). The box stays a deliberate hand-run step — from the repo root, `node apps/gateway/scripts/migrate.mjs` — and only AFTER the manual pre-deploy `pg_dump` snapshot (`RUNBOOK.md §7.2` steps 4-5). History: `0010_accounts_trial_ends.sql` is the one file in that folder that was NOT safe to run twice by hand — its trailing `UPDATE` (`0010:20`) re-arms the trial clock (`now() + interval '3 days'`) for every account whose clock is NULL, turning an account that should never expire into a 3-day lockout (0011's header warns about exactly this). The journal retires that hazard into the mechanism: applied once, never re-run. Never edit an applied migration file. appleboy/ssh-action is SHA-pinned (`deploy.yml:141`).

---

## 3. Hosting & infrastructure

Interim Contabo VPS 4 Nuremberg (~~€5.50/mo, D-020) → Hetzner CX23 (~~€6) → CX33 (~~€9) as triggers fire. Fixed start ≈ €6/mo; object storage (€6.49) + monitor VPS (~~€5) deferred with triggers (D-019). Money math: 100 Pro users ≈ $1,000/mo vs ~€25/mo infra — infra never binds; allowances do.

---

## 4. Secrets & configuration in production

All secrets in environment (see `07 §7` checklist), injected via Compose env-file owned by root (`0600`), never in images, never in repo, never in logs. `ENCRYPTION_KEY` rotation is **not implemented** — `apps/gateway/src/lib/crypto.ts:16-32` loads a single key; there is no dual-key path, no old-key read-only fallback, no re-encrypt job. `.env.example` lists `ENCRYPTION_KEY=` as shape-only (64 hex chars OR base64 decoding to exactly 32 bytes, `.env.example:43-46`) — but its line-2 promise ("CI fails if code reads a variable not listed here", `.env.example:2`) is **unenforced**: no check-env script exists in `package.json` scripts or CI (confirmed by reviewer report `Agent Reports/2026-09-20-0148_envnames_FIX_creem-checklist.md`). Treat `.env.example` as a checklist, not a gate. Creem webhook secret rotated in dashboard + box same task.

---

## 5. Monitoring & rollback

No Uptime Kuma anywhere yet — not in `infra/compose/compose.yml`, no Telegram/email alerts, no heartbeat monitor, no digest cron in code — so monitoring is a gap; separate-VPS Kuma stays planned for first payer (a monitor on the box dies with the box). Container `healthcheck` + `restart: unless-stopped` = local self-heal (`compose.yml`). Logs: Docker json-file rotation (10m×3) + JSON lines with `botId` (`apps/gateway/src/start.ts`). Rollback: app = re-run `deploy.yml` with `previous-sha`; data = manual `pg_dump` snapshot + Contabo snapshot (`RUNBOOK.md §7.2–7.4`); bot behavior = one-click spec rollback (V1-3). Bad-release drill: quarantining a bot never touches siblings (multiplexed shards isolate per-token). `start.ts` boots the gateway **and** the preflight worker **and** the builder worker **and** the supervisor in one process (`start.ts:1-2`, boot legs at `start.ts:199-220`) — workers DO run in prod.

---

## 6. Backups

Postgres: the `pg_dump -Fc` sidecar **exists but is unscheduled** — `pg-backup` never auto-starts (`profiles: ['backup']`, `compose.yml:36-54`); it runs only when invoked explicitly, and no host cron schedules it yet. Current practice is the manual pre-deploy snapshot (`RUNBOOK.md §7.2` step 4, writes `infra/compose/backups/corvus.dump`). → Hetzner Object Storage (7 daily + 4 weekly) when bought (trigger: PG >60% disk 7d). Box: Contabo free snapshot post-provision + pre-deploy (1 slot — rotate; `RUNBOOK.md §4`, `§7.2` step 3). No restore pass/fail is recorded in `PROJECT_STATUS.md` yet — monthly restore tests are planned, not yet evidenced. Tokens stay AES-256-GCM envelopes (AAD = bot id, `crypto.ts`); key rotation is not implemented. Data loss on restart is a launch-blocker with regression test A (V1-8) — backups are the second net, not the first.
