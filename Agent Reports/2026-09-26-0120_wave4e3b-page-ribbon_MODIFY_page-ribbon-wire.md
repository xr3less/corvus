# Task Report: wave4e3b-page-ribbon

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/new/page.tsx (ribbon wiring ONLY: +1 import, +1 useState, +1 reset effect, +1 ribbon mount, BuilderProgress gated on stopped)
- DELETED: apps/web/app/dashboard/new/ribbon-probe.test.tsx (temporary end-to-end probe, removed after green)

## Dependencies Added

- None.

## Assumptions Made

- `approving={building}` for the ribbon: the page's in-flight verdict flag. While a verdict POST is in flight `runId` is still null so the ribbon is unmounted; the prop only matters for post-run renders. No new loading state created.
- The `buildPhase` page-owned poll keeps running while stopped (it feeds ONLY the M-9 latch, per the file's own comment). The DISPLAY poll the user sees — `BuilderProgress`'s internal poll — is what halts via unmount. The page-owned poll stopping was never required; it stops at terminal anyway and does not fetch visibly.
- The `setBuildStopped(false)` reset effect runs on mount too (no-op, already false) and on every runId change including null → fresh runs always start polling.

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

- No new exports. Internal additions only: `buildStopped` state (default false), `useEffect [runId]` reset, and one conditional `<BuildStatusRibbon phase={buildPhase} streaming={streaming} approving={building} stopped={buildStopped} onStop onResume />` mount above the run-progress copy with `{buildStopped ? null : <BuilderProgress runId={runId} />}`.

## Known Limitations

- Ribbon unmounts with the whole section at terminal states per existing page behavior (runId stays set; section renders). Terminal pill (`Hazır` for live/failed) shows only while the section is up. Failed-run Resume surface is a separate slice.
- No dedicated persistent test added: page.test.tsx (58 tests) has no ribbon pins by design of this slice (test-only stub fixes allowed only if the suite failed from wiring — it did not). End-to-end behavior was proven by the temporary probe (1/1 green, then deleted).

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint apps/web/app/dashboard/new/page.tsx --max-warnings 0` (repo root) → exit 0, zero warnings.
- `npx vitest run app/dashboard/new/page.test.tsx` (inside `apps/web`, the owning workspace; repo-root run cannot resolve `@/` alias) → 1 file passed, 58 passed / 58 (baseline preserved; page.test.tsx untouched).
- Temporary end-to-end probe (deleted after green): plan streams → verdict yes → `run-9` → ribbon `Kurulum sürüyor` + `Durdur` → card absent post-run-start (no overlap) → Durdur → `Durduruldu` + `Sunucudaki kurulum devam eder.` + Queued readout gone + no server-stopped claim → Devam et → `Kurulum sürüyor` + Queued back + builder fetch count increased. Result: 1 passed / 1.
- Frozen checks: `git diff` on page.tsx shows my slice is +import/+state/+reset-effect/+mount/+gate only; wave4e3a card wiring (APPROVAL_WORD, showApprovalCard, handleApprove, card mount), D-153 verdict effect, and M-9 latch byte-preserved in behavior (not edited). No new user-facing strings in page.tsx (comments only; all visible copy comes from the ribbon component).
- Next.js docs read before coding (per apps/web mandate): `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` — confirmed plain client-component import inside the existing `'use client'` page; no App Router API touched. No web research needed (no version/API dependency).
