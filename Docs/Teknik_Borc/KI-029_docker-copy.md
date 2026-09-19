# KI-029 — Docker images omit workspace packages they import

## Status: OPEN (P0 — repo fix LIVE-proven on box 2026-09-19; local build + deploy.yml run unproven)

Filed 2026-09-19. Audit: `Agent Reports/2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md`.
Amended 2026-09-19 morning (new-chat handoff). **Not Resolved** — close rule not met.

## What the docs still claim

- `PLAN.md` debt-wave line and `00_START_HERE.md` 2026-09-15: Dockerfiles “built + run-proven”.
- `10_deployment.md`: CI builds and pushes GHCR; deploy is SSH compose pull/up.

## What is true (2026-09-19 afternoon — box-redeploy-003)

- Box `/opt/corvus` pulled `b5c9833`→`5c6c134`; web (313MB) + gateway (638MB) were built ON THE BOX from the repo Dockerfiles (root context, exits 0) and retagged `:stable` (GHCR not pulled by design). Report: `Docs/2026-09-19-1405_box-redeploy-003_CREATE_rebuild-retry.md`.
- Postgres recreated without published 5432; off-box TCP 5432 CLOSED re-verified this session; parked guards live 404s; data survives (12 tables, bots 0); dump at `/opt/corvus/infra/compose/backups/corvus.dump` (exec-based — pg-backup sidecar hangs, see `KNOWN_ISSUES` KI-018 row).
- Still unproven: local `docker build` from repo root on THIS machine (Docker Desktop npipe missing 2026-09-19 morning) + committed deploy.yml never run end-to-end (manual-only, DEPLOY_* never set).

- App **is deployed** (D-136): `https://13-140-181-113.nip.io/`. KI-018 stays Open because that deploy used a **box-local** Dockerfile patch, not committed git. Report: `Agent Reports/2026-09-18-2343_box-deploy-001_CREATE_first-deploy.md`.
- HEAD `b5c9833` Dockerfiles still omit `@corvus/ai` (and gateway `@corvus/spec`) — that is why the first `docker build` failed.
- **Worktree** (uncommitted): `apps/web/Dockerfile` COPY’s `packages/ai` manifest + sources and builds spec → ai → web. `apps/gateway/Dockerfile` COPY’s ai+spec manifests/sources, builds spec → ai → gateway, runner copies `packages/{spec,ai}/{package.json,dist}` (workspace symlinks are load-bearing — box boot `builder-worker-started` proved this).
- Worktree `deploy.yml` SSH pulls/ups `web gateway caddy` — still **uncommitted**. `deploy.yml` remains `workflow_dispatch` only. `ci.yml` does not push GHCR.
- Local `docker build` from the worktree was **not** re-run 2026-09-19 morning (Docker Desktop engine down). Do not claim the repo Dockerfiles are run-proven on this machine.

## Why it matters

First real box deploy will likely fail at image build, or come up without TLS if someone runs the committed deploy.yml as-is.

## Close when

- Both Dockerfiles COPY + build the workspace packages they import (prove with a real `docker build` from repo root).
- Committed deploy.yml pulls/ups `web gateway caddy`.
- KI-018 can then be attempted (still needs founder approval for SSH/secrets).
