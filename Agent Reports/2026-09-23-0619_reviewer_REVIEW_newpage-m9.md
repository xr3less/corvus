# Task Report: reviewer-newpage-m9

## Status
SUCCESS

## Verdict
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-0619_reviewer_REVIEW_newpage-m9.md
- READ (read-only review, no modifications): apps/web/app/dashboard/new/page.tsx (M-9 hunk), apps/web/app/dashboard/new/page.test.tsx (new test), Agent Reports/2026-09-23-0527_fix-newpage-m9_FIX_newpage-fresh-run.md, Agent Reports/2026-09-23-0347_sweep_REVIEW_sweep-synthesis.md (Item M-9 only), apps/web/components/ui/builder-progress.tsx
- TRANSIENT (mutated, then restored byte-identically — see Verification): apps/web/app/dashboard/new/page.tsx

## Dependencies Added
None.

## Assumptions Made
- The working tree carries large pre-existing uncommitted waves, so HEAD diff cannot isolate this task. I verified the M-9 hunk by direct region read of page.tsx (lines 84-130) instead of by diff, and I say so honestly.
- Baseline of 39 tests is accepted arithmetically: the test file holds 38 `it`/`it.each` declarations, one of which is `it.each([501, 1500, 2000])` (3 tests), so 38 - 1 (new M-9 test) - 1 (each) + 3 = 39 baseline, + 1 new = 40. The count greps out exactly.

## Open Questions for Orchestrator
1. **(Follow-up, not a gate failure) Stale poll phase spuriously marks the fresh run.** `useBuilderProgress` keeps its last state across a `runId` change (no reset for truthy runId; state only resets when runId is falsy). At the commit where `setRunId('run-2')` lands, the page-owned `buildPhase` still reads `'failed'` from run-1, so the latch effect (`page.tsx:120-126`) fires with `buildPhase === 'failed'` and `marker ('run-1') !== runId ('run-2')` and sets the marker to `run-2`. From then on the run gate (`runId !== null && marker !== runId → return`) stands OPEN for the whole live second run — the "then latched / live second run stays blocked" claim in the test comments actually rests on the judged pin + ask-line adjacency, not on the run gate. Observable acceptance still holds (test-locked at exactly 2 POSTs), and exploiting the residual needs the user to send a new ask-line-adjacent yes mid-build, but run-2's concurrent-build guard is weaker than run-1's was. Suggested follow-up: clear `runFailedRunIdRef` (or ignore the phase) on a `runId` change, e.g. track the observed runId in a ref inside the latch effect. Small, atomic, testable.
2. **Double-poll cost is disclosed and acceptable, no action needed.** The page-owned `useBuilderProgress(runId)` poll plus the `<BuilderProgress runId>` display poll issue 2x `GET /api/builder?runId=` per 2s per live run; both stop at terminal phases and both clean up on unmount (`cancelled` flag + `clearTimeout`). No leak, no interference (separate hook instances, separate state). Noting for the record, not asking for change.

## Public Interface Exposed
None (no signature changes; verdict POST shape `{ botId, turns }` unchanged — test asserts exact key set `['botId', 'turns']`).

## Known Limitations
- Review is static plus suite-level: I ran the focused suite, typecheck, lint, and prettier, and broke/watched the guard once. I did not boot the app in a browser.
- `package-lock.json` shows a working-tree modification, but its diff content is a pre-existing `apps/testbot` (discord.js) workspace entry, unrelated to this task. The author declared no dependencies and the hunk contains none. I verified content, not authorship.
- Copy check is presence + exact-string match of `A yes after a failed build starts a fresh run.` (page.tsx:333) and the locked fallback sentences; "byte-identical" is inherited from the author's claim plus the passing suite, not from a byte-diff against a pre-M-9 baseline (no clean baseline exists in this tree).

## Verification
- **Artifacts exist.** Author report on disk and read in full. M-9 hunk confirmed by direct region read: `runFailedRunIdRef` declared (page.tsx:93), page-owned `useBuilderProgress(runId)` poll feeding only the latch (page.tsx:95-97), latch effect with per-runId mark + null-clear (page.tsx:120-126), narrowed verdict guard `if (runId !== null && runFailedRunIdRef.current !== runId) return;` (page.tsx:130). New M-9 test present (page.test.tsx:1017-1117).
- **Focused suite (must run via workspace — repo root lacks the `@/` alias):** `npm run test --workspace @corvus/web -- app/dashboard/new/page.test.tsx` → 1 file passed, **40 passed (40)**. (A first attempt as bare `npx vitest run` from the repo root failed on `@/components` resolution — wrong cwd, not a code defect; re-ran correctly.)
- **Typecheck:** `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) → exit 0, no output (TSC_CLEAN).
- **Lint:** `npx eslint apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` (repo root) → exit 0, zero warnings.
- **Prettier:** `npx prettier --check apps/web/app/dashboard/new/page.tsx apps/web/app/dashboard/new/page.test.tsx` → clean.
- **Spec adherence (all grep/read-verified):** 2 verdict POSTs with second body ending at the fresh user row (`Yes, start fresh`) and link flipping run-1 → run-2 (test-locked); judged pin (`judgedUserIdRef`, page.tsx:83/141/147) intact as the same-row loop guard; `runId` stays set (no `setRunId(null)` path anywhere — grep-negative) so `Build failed` keeps rendering; in-flight dedup (`buildingRef`/`building`, page.tsx:129) untouched; M-7 mint resets (4x `mintAttemptedRef.current = false`) and M-8 failure marker (`verdictFailedUserIdRef`, page.tsx:87/142/205) present and unmodified in shape; no manifest/lockfile/.env edits by this task; no secrets in hunk.
- **Poll-ownership:** no double-poll interference, no unmount leak (hook cleanup verified in builder-progress.tsx:117-119), poll errors set error state without touching the marker (conservative direction — a dead poll never opens the gate). One residual noted as Open Question 1.
- **Guard honesty (my own transient mutation, no git restore commands used):** backed up page.tsx outside the repo (`$env:TEMP\m9-reviewer-guard\page-backup.tsx`), SHA256 before == backup (`53FD0E546D503A863FFF8E2A9E1D93C7DBA60E8F1C64E7DD73A6306B3162FB5C` both), mutated `buildPhase === 'failed'` → `'BLOWN'`, ran `npm run test --workspace @corvus/web -- app/dashboard/new/page.test.tsx -t "fresh run"` → **1 failed | 39 skipped (40)** (latch never opened, second verdict never posted — the test genuinely guards the latch). Restored via plain file copy; SHA256 after == backup, file compare true. Re-ran full focused suite → **40 passed (40)** green.
