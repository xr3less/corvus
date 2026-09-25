# Task Report: reviewer-rollback-verify

## Status
SUCCESS

## Verdict
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-0523_reviewer_REVIEW_rollback-verify.md
- READ (not modified): Agent Reports/2026-09-23-0509_fix-rollback-verify_FIX_rollback-verify.md
- READ (not modified): Agent Reports/2026-09-23-0347_sweep_REVIEW_sweep-synthesis.md (Item M-10 only)
- READ (not modified): apps/web/app/dashboard/bots/[id]/page.test.tsx
- READ (not modified): apps/web/app/dashboard/bots/[id]/page.tsx
- READ (not modified): apps/web/app/api/spec/rollback/route.ts
- READ (not modified): apps/web/app/api/bots/[botId]/activity/route.ts (supporting feed contract)

## Dependencies Added
None.

## Assumptions Made
- Mock id `bot-3` coerces to `writeBotId: null` (D-112); POST-body assertions of `{ botId: null, version: N }` follow the author's stated assumption and match the on-disk `resolveBotId` usage — not re-derived independently.
- Activity text shapes `Published vN` / `Rolled back to vN` and newest-first ordering are the stable feed contract (verified in activity/route.ts:186-195, 204-229 this review).
- The 54-baseline count comes from the author report; I verified 56 green on disk but did not independently check out a pre-change tree (working tree carries large pre-existing uncommitted waves, so HEAD diff cannot isolate this task — verified by direct region read instead).

## Open Questions for Orchestrator
- None blocking. The author-flagged provenance gap (M-10 derivation had no covering agent report / no prior reviewer pass) is now closed by this review for the derivation as it stands on disk.

## Public Interface Exposed
None (test-only change under review; reviewer created only its own report).

## Known Limitations
- Verification is vitest (focused suite) + tsc + eslint + prettier only; the app was not booted.
- Full monorepo gates (root `npm run ci`, gateway suites) were not run — out of scope for this isolated review.
- Never-published is covered via empty-feed + absent-draft; the unreadable-feed legacy fallback (draft-minus-one, still 404-honest) has no dedicated test — accepted per author report, not re-litigated here.

## Verification

### 1. Artifacts exist
- Author report `Agent Reports/2026-09-23-0509_fix-rollback-verify_FIX_rollback-verify.md` present on disk, read in full.
- The 2 new tests are really there: page.test.tsx:780 (`Rollback derives its target from prod, not the draft head`) and page.test.tsx:813 (`Rollback with no published version rolls nothing back and posts nothing`), inserted after the existing rollback test at :757.
- Derivation region on disk as claimed: prod-first derivation at page.tsx:620-646, feed helpers at :345-380 (`publishedVersionFromFeed`, `readPublishedVersion`, `readDraftVersion`), honest 404 branch at :670-680. Comment block at :605-619 states the route contract and fallback policy.

### 2. Does it actually work — real gates from the right directory
Toolchain detected from disk (not assumed): npm workspaces monorepo (`package-lock.json` present, no pnpm/yarn/bun lockfile); web scripts are `typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check`, `test: vitest run`.
- Focused suite from `C:\Users\xr3less\Desktop\corvus\apps\web`: `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` → **1 file passed, 56 passed / 56, 0 failed** (matches author's 54 baseline + 2 new).
- Typecheck from `apps/web`: `npx tsc --noEmit` → **exit 0**.
- Lint on touched files: `npx eslint "app/dashboard/bots/[id]/page.test.tsx" "app/dashboard/bots/[id]/page.tsx" --max-warnings 0` → **exit 0, zero warnings**.
- Prettier: test file → **clean** (`All matched files use Prettier code style!`); page.tsx → **`[warn] app/dashboard/bots/[id]/page.tsx`, exit 1**. Confirmed pre-existing, not introduced here: page.tsx hash was stable across this entire review (SHA256 `41E12A55…A06D3B8` before, during baseline, and after guard restore), and a prettier-formatted temp copy diffs wholesale (quote-style drift across the whole file, not a localized edit). Author's claim holds.

### 3. Contract match (M-10 derivation + both new tests vs route)
- Route contract verified on disk: rollback/route.ts:223 `if (target.version >= current.version) return 404`; :183-187 no-prod (`prod_spec_id === null` → 404); :210-212 unknown target → 404; :242-244 never-published (no audit row + state not published/rolled_back) → 404.
- Derivation satisfies it: `target = prodKnown - 1` (:645); null feed → draft fallback or honest line (:623-640, with `draftKnown > 1 ? draftKnown - 1 : null` else honest); `prodKnown <= 1` → honest (:641-643). Strictly-older-than-prod by construction; the v1 boundary and the no-history case never POST.
- Honest 404 branch (:670-680) maps server 404 to `Nothing to roll back to yet.` (only when no published version is known) or `Could not roll back — try again.` — the false `notSavedYet('...')` line is never used by rollback (grep: `notSavedYet` fires only for publishing/scan/simulate/saving/build paths, never in `runRollback` :599-687).
- Test 1 stubs the feed the way the page really consumes it: handler matches `url.startsWith('/api/bots/bot-3/activity')` (page fetches `/api/bots/${botId}/activity?limit=${ACTIVITY_LIMIT}`, ACTIVITY_LIMIT=20, :360-364); items use real shapes `{ kind: 'publish', text: 'Published v5' }` which `publishedVersionFromFeed` parses via `kind === publish|rollback` + `/v(\d+)\s*$/` (:345-358). Feed builder confirmed: `buildPublishText` → `Published vN`, `buildRollbackText` → `Rolled back to vN`, `mergeActivity` newest-first (activity/route.ts:186-195, 204-229). Draft head v6 + prod v5 → POSTs `{ botId: null, version: 4 }` and shows `Rolled back to v4.`; draft-minus-one (v5) would 404 under the contract (`5 >= 5`), so the test pins the real distinction.
- Test 2 asserts the honest path: empty feed + draft 404 → `Nothing to roll back to yet.` with **zero POSTs** to `/api/spec/rollback` (`expect(apiCallsTo(calls, '/api/spec/rollback')).toHaveLength(0)`).

### 4. Guard honesty (my own transient mutation, no git restore commands)
- Backed up page.tsx to `%TEMP%\reviewer-rollback-verify-backup\page.tsx` (outside repo). Hash before: `41E12A5506E8692EBAC87427F7AA6EF581151FC1C20FD261DC0A0F219A06D3B8`.
- Mutated exactly one line: `target = prodKnown - 1;` → `target = prodKnown; // REVIEWER-GUARD-MUTATION`.
- Re-ran: `npx vitest run "app/dashboard/bots/[id]/page.test.tsx" -t "Rollback derives its target from prod"` → **1 failed | 55 skipped (56)** — the draft-ahead-of-prod test failed as required. (Name-filtered run, so the count shape is expected.)
- Restored from outside-repo backup via plain file copy (no stash/checkout/restore/reset used at any point). Hash after: `41E12A5506E8692EBAC87427F7AA6EF581151FC1C20FD261DC0A0F219A06D3B8` → **RESTORE_OK, byte-identical**. Backup and prettier temp dirs removed.
- Full suite re-run after restore: **56 passed / 56, 0 failed**.

### 5. Scope / security
- Test-only change confirmed: page.tsx SHA256 identical before/after this review's guard cycle; the only test-file delta is the 2 added `it(...)` blocks (:780-835) per region read.
- No manifest/lockfile/`.env` edits, no installs, no commits, no git restore commands, no production access (no SSH/box .env/Contabo/GHCR/live keys). No secret values printed.
- Pre-existing tree caveat stated honestly: HEAD diff cannot isolate this task due to large pre-existing uncommitted waves — verification was by direct region read + hashes + gate runs, not by diff.
