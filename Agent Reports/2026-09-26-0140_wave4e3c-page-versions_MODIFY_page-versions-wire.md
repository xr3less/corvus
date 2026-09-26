# Task Report: wave4e3c-page-versions

## Status

PARTIAL — blocked by contract mismatch, page.tsx left untouched per scope guard

## Files Touched

- None. `apps/web/app/dashboard/new/page.tsx` was NOT modified (deliberate: wiring it with the current contracts would ship undo that the rollback route must reject).

## Dependencies Added

- None.

## Assumptions Made

- None beyond what the files state. No code was written, so no behavioral assumptions were taken.

## Open Questions for Orchestrator (escalation — needs spec decision)

1. `VersionHistory` emits a row UUID: `onUndo(version.id)` where `version.id` is `spec_versions.id` (`apps/web/components/ui/version-history.tsx:77-81`; props `onUndo: (versionId: string) => void`, version-history.tsx:12-15). The versions GET exposes ONLY `{ id, createdAt, isDraft, isProd }` — the numeric `version` column is used solely for `ORDER BY version DESC` and never returned (`apps/web/app/api/bots/[botId]/versions/route.ts:82-83, 91-102`).
2. The rollback route requires `{ botId: uuid, version: positive integer }` (`validateRollbackBody`, `apps/web/app/api/spec/rollback/route.ts:127-144`) and looks the target up by number: `SELECT id, version, state, spec FROM spec_versions WHERE bot_id = $1 AND version = $2` (line 206), with older-only (223-225) + published-proof (228-244) guards. A UUID in `version` answers 422 `version must be a positive integer` — every undo would fail by construction.
3. So the page cannot build a valid rollback body from `versionId` alone without (a) guessing the number — forbidden, (b) adding a new id-to-number read/mapping — a new mechanism outside "versions wiring ONLY", or (c) changing a file outside scope (versions route, VersionHistory, or rollback route) — explicitly forbidden by this task's scope guard.
4. Page-only workarounds were considered and rejected, and are recorded here so a re-spawn does not retry them:
   - Index arithmetic (`draft version minus row index`) assumes committed `spec_versions` are gapless 1..N. Nothing in the versions contract guarantees this; it is a guess about storage, not a read of it.
   - Prod-minus-one (the bot-detail `runRollback` precedent, `apps/web/app/dashboard/bots/[id]/page.tsx:643-684`) ignores the clicked row (every per-row button would do the same thing) and needs activity/draft reads plus Turkish notes — new fetches, new states, and new copy, all outside this slice's "no new strings, no second polling, versions wiring ONLY" constraints.
   - Worse, for this page's bots rollback cannot succeed at all yet: the builder sync mints `draft` rows only (`apps/gateway/src/db/builder-runs.ts:702-740`, `UPDATE bots SET draft_spec_id`), and rollback answers 404 when `prod_spec_id IS NULL` (rollback/route.ts:183-187). A new bot that never published has no prod to roll back from, so every undo wired here would 404 by design.
5. Request: pick one before this slice is re-spawned —
   - Option A (recommended): extend the versions contract — add numeric `version` to `VersionItem`/`VersionHistoryItem` and carry it through `onUndo` (e.g. `onUndo(versionId, versionNumber)` or pass the item). Small, additive, keeps rollback untouched. Touches versions route + VersionHistory + page — needs a slice whose scope covers those files.
   - Option B: accept a spec-row id UUID in rollback (resolve `version` server-side). Touches the write path — heavier, needs review care.
   - Option C: explicitly authorize the activity/draft-derived mapping inside new/page.tsx with locked copy, accepting the extra reads (and note: still 404 until first publish — the SPEC should say what undo means pre-publish).
6. Render gating itself is unblocked and clear for the follow-up: `buildPhase === 'failed'` (page-owned `useBuilderProgress(runId).phase`, page.tsx:206) corroborated by the M-9 `runFailedRunIdRef` marker (page.tsx:197-254) AND `botId !== null`; revalidation via key-bump re-mount of `VersionHistory` (it refetches on `botId` change, version-history.tsx:37-67, so a local key state works with no list hand-editing). No second poller needed.

## Public Interface Exposed

- None (no code changed, no exports added).

## Known Limitations

- Version history does NOT render on failed runs yet — this slice's objective is unmet pending the contract decision above.
- Card (wave4e3a) + ribbon (wave4e3b) wiring, D-153 verdict effect, M-9 latch, Turkish copy, frozen motor: all byte-preserved (untouched; `git diff` on page.tsx shows only the card+ribbon slices, no versions lines).
- No web research was needed: the blocker is a local contract mismatch proven from files on disk, not a version/API question.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors (re-ran 2026-09-26; tree untouched by this slice).
- `npx eslint apps/web/app/dashboard/new/page.tsx --max-warnings 0` (repo root) → exit 0, zero warnings (re-ran 2026-09-26).
- Vitest NOT re-run: no source file was changed, so there is nothing new to gate; baselines stand per wave4e3a/4e3b reports (58/58 page suite, VersionHistory + versions-route suites green at creation).
- Read-only evidence (all read, none modified):
  - apps/web/components/ui/version-history.tsx (props + `onUndo(version.id)` row-UUID emission + fetch contract)
  - apps/web/app/api/bots/[botId]/versions/route.ts (VERSIONS_SQL id/created_at only; `toVersionItems` drops the number)
  - apps/web/app/api/spec/rollback/route.ts:117-144 (validator), 183-212 (prod-null 404 + lookup by number), 222-244 (guards), 277-298 (swap transaction)
  - apps/web/app/dashboard/new/page.tsx (landmarks: buildPhase:206, M-9 latch:197-254, verdict effect:256-359, card:429-456/510-512, ribbon:181/236-238/520-530; `git diff` confirms card+ribbon only)
  - apps/web/app/dashboard/bots/[id]/page.tsx:360-416 (feed/draft readers), 643-727 (runRollback precedent + honest notes)
  - apps/web/app/api/bots/[botId]/activity/route.ts (feed shape `Published vN` / `Rolled back to vN`)
  - apps/web/app/api/spec/draft/route.ts, patch/route.ts (version numbering vs uuid), publish/route.ts:449-477 (number-keyed lookup twin)
  - apps/gateway/src/db/builder-runs.ts:702-740 (sync mints draft rows, moves draft pointer only)
  - SPEC 2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md + wave-4 pack + wave4d versions report (whitelisted context)
- Next docs mandate: no App Router/client-component/route-handler code was written, so no new guide read was triggered for code.
- Security: never read C:\Users\xr3less\Desktop\wiroai.txt; no secrets printed/committed/embedded. No git restore-from-HEAD commands run. No push/deploy/production data. `package.json`/lockfiles untouched, no installs.
