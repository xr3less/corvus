# KI-029 — Docker images omit workspace packages they import

## Status: OPEN (P0 — code written, uncommitted, local build unproven)

Filed 2026-09-19. Audit: `Agent Reports/2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md`.
Amended 2026-09-19 morning (new-chat handoff). **Not Resolved** — close rule not met.

## What the docs still claim

- `PLAN.md` debt-wave line and `00_START_HERE.md` 2026-09-15: Dockerfiles “built + run-proven”.
- `10_deployment.md`: CI builds and pushes GHCR; deploy is SSH compose pull/up.

## What is true (2026-09-19 morning)

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
