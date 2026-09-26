# Task Report: wave2-time_CREATE_run-timeline

## Status

SUCCESS (in-scope complete; one out-of-scope downstream break escalated, no scope expansion taken)

## Files Touched

- CREATED: apps/web/components/ui/run-timeline.tsx
- MODIFIED: apps/web/app/api/builder/route.ts (GET detail widen only; gates/phases/enqueue untouched)
- MODIFIED: apps/web/components/ui/builder-progress.tsx
- MODIFIED: apps/web/components/ui/builder-progress.module.css (+165 lines, existing classes untouched)
- MODIFIED: apps/web/app/globals.css (+17 lines, second `:root` only)
- MODIFIED: apps/web/app/api/builder/route.test.ts (+2 tests)
- MODIFIED: apps/web/components/ui/builder-progress.test.tsx (+5 tests, 1 assertion updated to new string)
- Read-only: Agent Reports/2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md + Agent Reports/2026-09-25-1806_wave-2-pack_run-timeline.md (+ wave-3 pack once, for checkpoint key list). No other reports scanned. `apps/web/lib/builder/` confirmed absent at build time — rendered defensively, never stubbed.

Per developer instruction, no report .md file was written by the builder; findings returned directly. OS clock at verification: 2026-09-25-1902.

## Dependencies Added

None. Zero installs, no manifest edits.

## Assumptions Made

- `builder/checkpoints.ts` absent at build time: consumed shape read-only from wave-3 pack keys (briefChars, attempt, stepStartedAt, lastGoodPhase, checkpointBrief, error, provider); all readers `isRecord`-guarded, missing keys degrade to honest empty line.
- Repo uses npm workspaces, not pnpm: acceptance command `pnpm --filter web exec tsc --noEmit` has no matching project, so verified with `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json` (exit 0) and `npm run test --workspace @corvus/web` (route 15/15, progress 12/12).
- Replacing the failed readout `Build failed` with the pack-mandated new string `Build failed with error` is intended (pack new-strings list), not a SPEC S3 violation; all other frozen strings byte-identical.
- One pre-compaction baseline diagnosis used a file-only `git stash push` on builder-progress.tsx then popped; no data loss, not repeated.

## Open Questions for Orchestrator

1. `apps/web/app/dashboard/new/page.test.tsx:1424,1523` asserts exact `getByText('Build failed')`. Under exact matching this can never match the new `Build failed with error`, and the captured M-9 dump shows the timeline still all-pending at assertion time (no failBlock rendered within waitFor). Both the assertion and `page.tsx` are outside wave-2 scope (SPEC S4: page integration lands in Wave 4 only) so the builder did not touch them. Decide: (a) update those two assertions to the new string in Wave 4, or (b) require a backward-compatible exact affordance. Builder recommends (a).
2. Whether the all-pending snapshot in that harness is pure assertion staleness or a real poll-dispatch timing issue needs the page owner (wave-4) to adjudicate — isolated suites prove failed resolution, real-cause readout, and retry re-poll work.

## Public Interface Exposed

- `RUN_TIMELINE_STEPS = ['queued','generating','syncing','live']`, `RunTimelineStep`, `RunTimelinePhase = step | 'failed'`, `RunTimelineProps { phase: string | null; detail: unknown; onRetry?: () => void }`, `RunTimeline({phase, detail, onRetry})`.
- `BUILDER_STEPS` re-exported from `RUN_TIMELINE_STEPS`; `BuilderPhase = RunTimelinePhase`; `BuilderProgressState { phase, detail, error, unknownPhase }`; `useBuilderProgress(runId, intervalMs = 2000, retryNonce = 0)`; `BuilderProgress({runId, intervalMs})` with internal retryNonce + `key={runId:nonce}` remount.
- GET widen: active phases forward allowlisted checkpoint slice primitive-only (`allowlistedCheckpointDetail`); live keeps version/model/stub; failed keeps error/step/numeric attempts; unknown phase and malformed detail degrade to `{}`.
- Behavior: unknown-phase string renders `Unexpected builder phase` + `Retry check` re-poll (role=alert); failed renders `Build failed with error` + verbatim cause (or `Ayrıntı henüz yok`) + step/attempts extras + retry (title role=status); per-step `<details>/<summary>` with `Ayrıntıları göster/gizle`, empty `Ayrıntı henüz yok`; `Kurulum adımları`, section aria-label `Build timeline`, visuallyHidden `Step detail` prefix.

## Known Limitations

- Merged tree has 2 failing dependent tests (M-9 pair in `new/page.test.tsx`) for the reasons above; all in-scope suites green (27/27), tsc 0, eslint 0 on all 5 touched files.
- Mutation probe done: forced `if (false)` on unknown-phase guard, unknown-phase test went red (1 failed), restored, green.
- `globals.css` diff verified purely additive (only the `--dashboard-*` hunk); first `:root` byte-identical; no new `any`; no emoji/exclamation (grep `!` hits only `!==`/`!=`).
- Security: never read wiroai.txt, no secrets printed/committed/embedded; local checks only, no push/deploy/production data.
