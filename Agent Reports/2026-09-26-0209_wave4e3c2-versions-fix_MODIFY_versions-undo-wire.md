# Task Report: wave4e3c2-versions-fix

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/new/page.tsx
- (Pre-existing, additive-only, verified byte-shape — NOT edited by this slice but re-gated: apps/web/app/api/bots/[botId]/versions/route.ts, apps/web/app/api/bots/[botId]/versions/route.test.ts, apps/web/components/ui/version-history.tsx, apps/web/components/ui/version-history.test.tsx)
- DELETED: apps/web/app/dashboard/new/versions-probe.test.tsx (temporary e2e proof, green then removed per the task)

## Dependencies Added

- None.

## Assumptions Made

- The numeric `version` in the versions GET / VersionHistory (added by the prior wave-4d/contract pass on this same wave) is the source of truth carried into the rollback POST body. No mapping is guessed.
- `runFailedRunIdRef` stays the M-9 authority; the new `failedRunId` state is a render-only mirror.

## Open Questions for Orchestrator

- None. No scope expansion was needed; frozen motor, card/ribbon, D-153 verdict effect, M-9 latch semantics, Turkish copy all preserved.

## Public Interface Exposed

- Versions GET item: `{ id: string; version: number; createdAt: string; isDraft: boolean; isProd: boolean }`.
- `VersionHistoryProps.onUndo: (versionId: string, versionNumber: number) => void`.
- Page `handleUndo(_versionId, versionNumber)` POSTs `{ botId, version: versionNumber }` to `/api/spec/rollback`; success bumps `historyKey` (remount → refetch), failure surfaces the route's sentence via `readRefusalMessage ?? START_FALLBACK_ERROR`.
- Render gate: `showVersionHistory = runFailed && botId !== null` where `runFailed = runId !== null && buildPhase === 'failed' && runFailedRunIdRef.current === runId && failedRunId === runId`.

## Known Limitations

- Pre-publish bots (prod_spec_id NULL) 404 honestly from the rollback route; the page surfaces that message as-is, no special pre-publish copy (per the locked decision).
- Undo revalidation is a full VersionHistory remount (refetch), not a list hand-edit — by design.
- Card + ribbon (waves 4e3a/4e3b) wiring rides in this tree's uncommitted diff but was NOT touched by this slice; its byte-preservation was verified by reading the diff, not by editing.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/components/ui/version-history.tsx apps/web/components/ui/version-history.test.tsx "apps/web/app/api/bots/[botId]/versions/route.ts" "apps/web/app/api/bots/[botId]/versions/route.test.ts" --max-warnings 0` (repo root) → exit 0, zero warnings.
- `npx vitest run "app/api/bots/[botId]/versions/route.test.ts" components/ui/version-history.test.tsx app/dashboard/new/page.test.tsx` (inside apps/web) → 3 files passed, 70 passed (versions 10 + history 2 + page 58).
- E2E wiring proof (temporary `versions-probe.test.tsx`, DELETED after green): failed phase → `Compare versions` renders with 2 `Undo to previous version` buttons → clicking the v1 row POSTs `/api/spec/rollback` with body `{ botId: BOT_ID, version: 1 }` → 1/1 passed.
- Scope guard: no rollback-route, card, ribbon, D-153 effect, M-9 latch, frozen motor, globals.css, manifest file was edited; no installs; no push/deploy. `git status` shows the probe deleted (no `versions-probe.test.tsx` row) and no scope-file additions from this slice.
- No web research needed: the fix is a local contract carry-through; all versions/model/API facts were read from files on disk (rollback validator, versions SQL, Next boundary guide per mandate).
