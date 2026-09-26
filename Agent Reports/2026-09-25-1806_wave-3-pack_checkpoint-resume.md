# Wave 3 pack — checkpoint and resume for builder runs

SPEC: `2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md` (read it first; frozen motor §1 applies).
Research is done — do not launch research agents.

## Objective

A failed or interrupted run resumes from its last good checkpoint as a fresh audited run; terminal rows are
immutable; the duplicated gate block across builder routes is unified behind one shared excerpt.

## Files in scope

You may CREATE (if any target already exists: STOP, report PARTIAL, do not overwrite):

- `apps/web/app/api/builder/resume/route.ts`
- `apps/web/lib/builder/checkpoints.ts` (SOLE OWNER — wave2-time + wave4-hub consume read-only)
- `apps/web/lib/builder/gates.ts` (SOLE OWNER — see gates note below)
- `apps/gateway/drizzle/0015_builder_checkpoint.sql`

You may MODIFY:

- `apps/gateway/src/db/builder-runs.ts` (phase writes + checkpoint-marker reuse + ceiling ONLY)

You may NOT touch: SPEC §1 frozen files, `package.json`/lockfiles (no new runtime dependencies; declare
needs in your report).

## Contracts

- Resume creates a FRESH `builder_runs` row from the checkpoint; terminal (`live`/`failed`) rows are
  immutable — never mutate them.
- Boss send on resume reuses the frozen args VERBATIM with the NEW runId:
  `singletonKey=newRunId, retryLimit=3, retryDelay=30, expireInSeconds=3600, deleteAfterSeconds=604800`;
  never re-send an old runId.
- Checkpoint detail: ADDITIVE keys only in `builder_runs.detail` jsonb
  (`briefChars, attempt, stepStartedAt, lastGoodPhase, checkpointBrief, error, provider`); readers tolerate
  missing keys.
- Migration additive + nullable, no backfill lock on `builder_runs`.
- GATES NOTE (design-first): emit the shared 401/403-trial/403-budget/404-ownership gate excerpt in the
  SPEC-shaped section of your report. Do NOT import `gates.ts` into any route in this wave. Do NOT re-derive
  the excerpt independently (9-file read cap — read the verdict route's gate block once and mirror it).
  Parallel reviewers must NOT rewrite it. On `PARTIAL`-or-drift verdicts, accuse the SPEC
  (§6 build-then-review here is the SUSPECT) — never the robots. Never run a git restore-from-HEAD command.

## Acceptance criteria

- [ ] Kill-to-failed then `POST` resume → fresh runId, identical boss options, terminal row byte-identical.
- [ ] Resume with no checkpoint → fresh run from approved brief + `Checkpoint unavailable…` notice.
- [ ] Double-click/double-POST resume → exactly ONE enqueue (idempotency test, mutation-proved).
- [ ] Gate order on resume re-verified by test (401 → 403 trial → 422 → 404 → 403 budget → 409).
- [ ] `builder-runs.test.ts` green (phase writes, marker reuse, ceiling); typecheck + eslint clean.
- [ ] No frozen string altered (SPEC §3); no new dependency installed.

## New strings (only these; correct Turkish diacritics; no emoji/exclamation)

`Resume build`, `Starting a fresh build from the last checkpoint — the failed run is kept for audit.`,
`Checkpoint unavailable — starting from the approved brief.`

## Report

Write to `Agent Reports/<timestamp>_wave3-resume_CREATE_checkpoint-resume.md` in the standard schema
(Status / Files Touched / Dependencies Added / Assumptions / Open Questions / Public Interface Exposed /
Known Limitations) PLUS the SPEC-shaped gates excerpt section. Whitelist: you needed only this pack + the SPEC.

## Toolchain + docs notes (2026-09-25 correction, applies to all waves)

- npm workspaces (NOT pnpm): typecheck `npm run typecheck --workspace @corvus/web` (+ `--workspace
@corvus/gateway` for gateway files), lint `npx eslint <touched-files> --max-warnings 0` from the repo
  root, tests `npx vitest run <files>` in the owning workspace. Never create `pnpm-*` files (a stray pair
  was created and deleted 2026-09-25).
- apps/web/AGENTS.md: before writing App Router / client-component / route-handler code, read the relevant
  guide in `node_modules/next/dist/docs/` — in this monorepo `next` is hoisted to the repo root
  (`C:\Users\xr3less\Desktop\corvus\node_modules\next\dist\docs\`), NOT under `apps/web` — and heed
  deprecation notices.
