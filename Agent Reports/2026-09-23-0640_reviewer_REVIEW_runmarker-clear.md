# Task Report: reviewer-m9followup-retry

## Status
SUCCESS

## Verdict
FAIL

## Files Touched
- CREATED: Agent Reports/2026-09-23-0640_reviewer_REVIEW_runmarker-clear.md
- READ (read-only review, no modifications): Agent Reports/2026-09-23-0618_fix-newpage-m9followup_FIX_runmarker-clear.md (author report, read in full), Agent Reports/2026-09-23-0619_reviewer_REVIEW_newpage-m9.md (Open Question 1 only, the residual as filed), apps/web/app/dashboard/new/page.tsx (latch effect region, direct region read), apps/web/app/dashboard/new/page.test.tsx (new test, direct region read), apps/web/components/ui/builder-progress.tsx (hook ownership check), apps/web/package.json (toolchain detection)
- TRANSIENT (mutated, then restored byte-identically — see Verification): apps/web/app/dashboard/new/page.tsx

## Dependencies Added
None.

## Assumptions Made
- The working tree carries large pre-existing uncommitted waves, so HEAD diff cannot isolate this task. I verified the latch hunk and new test by direct region read instead of by diff, and I say so honestly.
- Baseline of 40 tests is accepted arithmetically: the file now holds 41 tests total; the author declares 40 baseline + 1 new, consistent with the prior reviewer's 40 total (39 baseline + 1 M-9 test) plus this 1 follow-up test.
- Toolchain detected from disk: `apps/web/package.json` scripts are `typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check`, `test: vitest run`; workspace `@corvus/web` via npm. All gates were run with these real commands, not assumed ones.

## Open Questions for Orchestrator
1. **(Gate failure, needs a fix agent) The residual is NOT fixed: `latchRunIdRef` is write-only and the stale `failed` phase still marks the fresh run.** The shipped latch effect (`page.tsx:122-133`) sets `latchRunIdRef.current = runId` on every run but never reads it in any condition; the mark branch is still bare `if (buildPhase === 'failed') runFailedRunIdRef.current = runId`. At the commit where `setRunId('run-2')` lands, the page-owned `useBuilderProgress(runId)` poll still holds run-1's terminal `'failed'` (hook keeps last state across a truthy runId change — verified in `builder-progress.tsx:65-121`, state only resets when runId is falsy), so the effect fires with `buildPhase === 'failed'` and immediately sets the marker to `run-2`. The run gate (`runId !== null && marker !== runId → return`, page.tsx:137) therefore stands OPEN for the whole live second run — exactly the residual filed as Open Question 1 in the prior review. The author's report claims "a fresh runId clears any marker carried from the previous run, and the stale phase ... is ignored", but the code contains no clear-on-runId-change and no stale-ignore condition. Suggested fix (still small and atomic): in the latch effect, detect a runId change against the previously watched id — clear `runFailedRunIdRef` on change and skip the mark on the same commit (e.g. only mark when the `failed` phase is observed while already watching the current runId, not on the runId-change commit itself). The new test already encodes the correct acceptance (silence at exactly 2 POSTs on a NEW user row at turn 6); the fix agent just has to make it green without touching the verdict guard, M-7 mint lines, or M-8 judged lines.

## Public Interface Exposed
None (no signature changes; verdict POST shape { botId, turns } unchanged).

## Known Limitations
- Review is static plus suite-level: focused suite, typecheck, lint, prettier, plus one guard-break mutation with restore. I did not boot the app in a browser.
- Copy check is presence + exact-string match of `A yes after a failed build starts a fresh run.` (page.tsx:340) and `ASK_LINE = 'Can I start?'` (page.tsx:51); "byte-identical" for locked copy is not proven by byte-diff against a clean baseline (no clean baseline exists in this tree).
- `package-lock.json` working-tree modification noted in the prior review is pre-existing and unrelated; this task declares no dependencies and the hunk contains none. I verified content, not authorship.

## Verification
- **Artifacts exist.** Author report on disk and read in full. Latch hunk confirmed by direct region read: `runFailedRunIdRef` declared (page.tsx:93), page-owned `useBuilderProgress(runId)` poll feeding only the latch (page.tsx:95-97), latch effect with `latchRunIdRef` + null-clear branch + bare `failed` mark (page.tsx:122-133), verdict guard `if (runId !== null && runFailedRunIdRef.current !== runId) return;` (page.tsx:137). New follow-up test present (page.test.tsx:1119-1243, `it('a live second run keeps the run gate closed for a further eligible yes')` at :1125).
- **Focused suite (must run via workspace — repo root lacks the `@/` alias):** `npm run test --workspace @corvus/web -- app/dashboard/new/page.test.tsx` → **1 failed | 40 passed (41)**, run TWICE with identical result (Start at 06:32:16 and 06:32:46, Duration ~5.52s each). The single failure is the NEW residual test: `app/dashboard/new/page.test.tsx:1239:56 — expected [ …(3) ] to have a length of 2 but got 3` (a third verdict POST fires on the turn-6 eligible yes while run-2 is live; the held-link assertion at :1240-1241 is not reached). Deterministic, not flaky.
- **Lone new-test run (restored tree):** `npm run test --workspace @corvus/web -- app/dashboard/new/page.test.tsx -t "live second run keeps the run gate closed"` → **1 failed | 40 skipped (41)**, `FAIL ... AssertionError: expected [ …(3) ] to have a length of 2 but got 3` at page.test.tsx:1239. Confirms the residual test itself fails on the shipped code.
- **Typecheck:** `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) → exit 0, no output (TSC_CLEAN).
- **Lint:** `npx eslint apps/web/app/dashboard/new/page.tsx "apps/web/app/dashboard/new/page.test.tsx"` (repo root) → exit 0, zero warnings (PowerShell completed with no output).
- **Prettier:** `npx prettier --check "apps/web/app/dashboard/new/page.tsx" "apps/web/app/dashboard/new/page.test.tsx"` → `All matched files use Prettier code style!`
- **Spec adherence (grep/read-verified):** FAIL on the core claim — fresh runId does NOT clear the marker and the stale carried-over `failed` phase is NOT ignored (see Open Question 1; `latchRunIdRef` is written at page.tsx:126/129 and never read anywhere — grep for `latchRunIdRef|runFailedRunIdRef` hits only page.tsx:93/122/125/126/129/131/137). PASS on the invariants: verdict guard shape unchanged (page.tsx:137); M-7 mint resets intact (4 occurrences of `mintAttemptedRef.current = false` in page.tsx); M-8 failure marker intact (`verdictFailedUserIdRef` at page.tsx:87/149/212, shape unmodified); no `setRunId(null)` path anywhere (grep-negative) so `Build failed` keeps rendering; copy strings present (`ASK_LINE`, page.tsx:340 sentence).
- **Guard honesty (my own transient mutation, no git restore commands used):** backed up page.tsx outside the repo (`$env:TEMP\runmarker_guard_backup.tsx`), SHA256 before == backup (`F614F07304AFB041EDE4E3AC42947855ED9658E59229EF3AF2C1CD8688E3AA4D` both), mutated `buildPhase === 'failed'` → `'BLOWN'` (strong form: latch can never open), ran `npm run test --workspace @corvus/web -- "app/dashboard/new/page.test.tsx" -t "a failed build lets a later yes"` → **1 failed | 40 skipped (41)** (latch never opened, second verdict never posted — the M-9 test genuinely guards the latch). Restored via plain file copy; SHA256 after == backup (`F614...` both), region re-read confirms `buildPhase === 'failed'` restored at page.tsx:130.
- **Scope/security:** `git status --short` on the three review files shows only `M apps/web/app/dashboard/new/page.tsx`, `M apps/web/app/dashboard/new/page.test.tsx`, `?? Agent Reports/2026-09-23-0618_fix-newpage-m9followup_FIX_runmarker-clear.md` — no manifest/lockfile/.env edits by this task, no installs run, no secrets in the hunk. No commits made, no git restore commands used (restore was plain file copy with hash verify).
