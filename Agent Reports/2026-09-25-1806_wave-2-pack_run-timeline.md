# Wave 2 pack — per-step run timeline with real diagnostics

SPEC: `2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md` (read it first; frozen motor §1 applies).
Research is done — do not launch research agents.

## Objective

Replace the flat 4-label spinner with a defensive timeline that shows what the server actually reports,
including failure causes, plus additive shell tokens.

## Files in scope

You may CREATE (if any target already exists: STOP, report PARTIAL, do not overwrite):

- `apps/web/components/ui/run-timeline.tsx`

You may MODIFY:

- `apps/web/app/api/builder/route.ts` (GET detail widen ONLY: expose the additive checkpoint keys for active
  phases; gate order, phases, enqueue paths untouched)
- `apps/web/components/ui/builder-progress.tsx`
- `apps/web/components/ui/builder-progress.module.css`
- `apps/web/app/globals.css` (additive `--dashboard-*` vars ONLY; existing `:root` byte-identical)

You may NOT touch: SPEC §1 frozen files, `packages/ai/*`, `package.json`/lockfiles (no new runtime
dependencies; declare needs in your report).

## Contracts

- Consumes `builder/checkpoints.ts` READ-ONLY (owned by wave3-resume; if absent, render defensively —
  never stub or fork it).
- Detail readers: `isRecord` type-guards everywhere, tolerate missing keys, unknown shape renders
  `Unexpected builder phase` — never a blank stepper.
- Polling contract unchanged (2000ms, stop at live/failed).

## Acceptance criteria

- [ ] Timeline shows per-step progress for queued/generating/syncing; failed shows the real error cause.
- [ ] `details`/`summary` sections expand/collapse; empty detail shows `Ayrıntı henüz yok`, never blank.
- [ ] Unknown future phase string → `Unexpected builder phase` error state (mutation-prove this test:
      break the mapping, watch it go red, restore).
- [ ] `globals.css` diff is purely additive (`--dashboard-*`); `:root` byte-identical.
- [ ] Typecheck + eslint clean (no new `any`); `builder-progress.test.tsx` green (poll stops at terminal,
      unknown phase error, failed readout).
- [ ] No frozen string altered (SPEC §3); no new dependency installed.

## New strings (only these; correct Turkish diacritics; no emoji/exclamation)

`Kurulum adımları`, `Ayrıntıları göster`, `Ayrıntıları gizle`, `Ayrıntı henüz yok`,
`Build timeline`, `Step detail`, `Build failed with error`, `Retry check`.

## Report

Write to `Agent Reports/<timestamp>_wave2-time_CREATE_run-timeline.md` in the standard schema
(Status / Files Touched / Dependencies Added / Assumptions / Open Questions / Public Interface Exposed /
Known Limitations). Whitelist: you needed only this pack + the SPEC.

## Toolchain + docs notes (2026-09-25 correction, applies to all waves)

- npm workspaces (NOT pnpm): typecheck `npm run typecheck --workspace @corvus/web`, lint
  `npx eslint <touched-files> --max-warnings 0` from the repo root, tests `npx vitest run <files>` in
  `apps/web`. Never create `pnpm-*` files (a stray pair was created and deleted 2026-09-25).
- apps/web/AGENTS.md: before writing App Router / client-component / route-handler code, read the relevant
  guide in `node_modules/next/dist/docs/` — in this monorepo `next` is hoisted to the repo root
  (`C:\Users\xr3less\Desktop\corvus\node_modules\next\dist\docs\`), NOT under `apps/web` — and heed
  deprecation notices.
