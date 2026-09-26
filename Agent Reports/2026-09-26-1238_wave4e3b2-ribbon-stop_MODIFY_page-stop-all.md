# Task Report: wave4e3b2-ribbon-stop

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/new/page.tsx (stop-all-poll fix: page-owned `useBuilderProgress(buildStopped ? null : runId)` + two comment updates; no behavior change to card/versions/undo/D-153/M-9)
- DELETED: apps/web/app/dashboard/new/stop-probe.test.tsx (temporary network probe, green then removed per the task)

## Dependencies Added

- None.

## Assumptions Made

- Null means "do not poll" for `useBuilderProgress` — VERIFIED by reading `apps/web/components/ui/builder-progress.tsx:64-75` before coding (`if (!runId) { setState(IDLE_STATE); return; }`), never assumed.
- While stopped, `buildPhase` goes stale/IDLE (`null`) per the null-arg reset; the M-9 latch effect simply does not mark (no failed-marking from a non-observation, no latch reset since `runId` is unchanged). On Devam et the poll resumes and the latch continues exactly as before.
- Ribbon stopped copy (`Durduruldu`, `Sunucudaki kurulum devam eder.`, `Devam et`) is owned by the ribbon component, so this slice adds zero new user-facing strings; page comments only.

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

- No new exports. One-line behavior change: `const buildPhase = useBuilderProgress(buildStopped ? null : runId).phase;` (hook call stays unconditional per the hooks rule; only the argument is gated). Ribbon `onStop`/`onResume` (`setBuildStopped(true/false)`) now gate BOTH pollers: the display poll via the existing `{buildStopped ? null : <BuilderProgress runId={runId} />}` unmount, and the page-owned latch poll via the null arg.

## Known Limitations

- While stopped, the ribbon pill shows `Durduruldu` (stopped takes precedence per `build-status-ribbon.tsx` resolvePill) and VersionHistory stays hidden even if the run failed server-side mid-stop (gate needs `buildPhase === 'failed'`); on Devam et the resumed poll re-observes the terminal phase and the gate mounts. This matches the M-9 latch semantics (no marking from a non-observation).
- Card (wave4e3a: APPROVAL_WORD, showApprovalCard, handleApprove) + versions/undo (wave4e3c2: historyKey/failedRunId/handleUndo/showVersionHistory) + D-153 verdict effect + M-9 latch untouched in behavior; verified via `git diff` review, not by editing.

## Verification

- Temporary network probe `stop-probe.test.tsx` (DELETED after green, 1/1 passed): plan streams → verdict yes → `run-stop-1` → `Durdur` visible → stopped fetch count recorded → 2600ms real-timer stopped window (longer than the 2000ms poll interval) → assert builder GET count UNCHANGED → `Devam et` → `Queued` back + count increased → set phase `failed` → `Build failed with error` + `Compare versions` mounts (post-resume M-9 intact). Note: probe needed a `/api/bots/<id>/versions` → `{ versions: [] }` stub (VersionHistory fetch) and a 30000ms test timeout; the first run without the versions stub hung at the final `Compare versions` wait (test timeout 5000ms), fixed by adding the stub, not by touching the page.
- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint apps/web/app/dashboard/new/page.tsx --max-warnings 0` (repo root) → exit 0, zero warnings (no output).
- `npx vitest run app/dashboard/new/page.test.tsx` (inside `apps/web`, the owning workspace) → 1 file passed, 58 passed / 58 (baseline preserved; `page.test.tsx` untouched).
- No web research needed (no version/API question arose); Next.js docs not re-read (no App Router/client-component/route-handler code touched — one hook-call argument + comments only).
