# Task Report: fix-rollback-verify

## Status
SUCCESS — no product-code fix was needed. Both new tests passed on the first run against the untouched on-disk implementation, confirming the prod-first Rollback derivation is already correct per the route contract. The two tests now pin it.

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx (TWO new tests only, inserted after the existing rollback test; no other suite's assertions touched)
- apps/web/app/dashboard/bots/[id]/page.tsx: ZERO net change — transient guard mutation only, restored byte-identically via outside-repo backup + sha256 verify (OK)

## Dependencies Added
None.

## Assumptions Made
- Activity item text shapes `Published vN` / `Rolled back to vN` (from `buildPublishText`/`buildRollbackText` in activity/route.ts:186-195) and newest-first ordering are the stable contract the feed parser reads.
- Mock id `bot-3` coerces to `writeBotId: null` (D-112), so POST bodies assert `{ botId: null, version: N }`.
- The existing happy-path rollback test (no activity stub) keeps passing via the null-feed fallback → draft-minus-one; that legacy path is intentionally preserved for unreadable feeds.

## Open Questions for Orchestrator
- The M-10 derivation itself (page.tsx:336-372, 620-680) has no covering agent report — provenance unclear, possibly residue of an interrupted agent. It is now pinned by tests but has never had a reviewer pass; recommend one.
- `npx prettier --check` flags page.tsx (pre-existing; file restored byte-identically so not caused by this task). Test file is prettier-clean.

## Public Interface Exposed
None (test-only change).

## Known Limitations
- Verification is vitest + tsc + eslint only; the app was not booted.
- Never-published is covered via empty-feed + absent-draft; the unreadable-feed legacy fallback (draft-minus-one, still 404-honest) has no dedicated test.
- Guard run used a `-t` name filter, so its count reads 1 failed | 55 skipped (the 1 failure is the draft-ahead-of-prod test under mutation).

## Verification
- Baseline before change (`npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` from apps/web): 54 passed.
- After adding 2 tests, same command: 56 passed (54 baseline + 2 new), 0 failed.
- Test 1 (draft-ahead-of-prod): activity stub newest item `Published v5`, draft head v6 → POST `/api/spec/rollback` body `{ botId: null, version: 4 }`, note `Rolled back to v4.` PASS.
- Test 2 (never-published): empty activity feed + draft 404 → `Nothing to roll back to yet.`, zero POSTs to `/api/spec/rollback`. PASS.
- `npx tsc --noEmit` from apps/web: exit 0.
- `npx eslint` on both files from repo root: exit 0, zero warnings.
- `npx prettier --check` on test file: clean (page.tsx warn pre-existing, untouched).
- Guard: backed up page.tsx outside repo with sha256; mutated `target = prodKnown - 1` to prefer draft-minus-one; Test 1 failed as required (1 failed | 55 skipped); restored from backup, `sha256sum -c` OK, backup dir removed; full suite re-run green 56/56. `git diff` on page.tsx vs arrival state: no change.
