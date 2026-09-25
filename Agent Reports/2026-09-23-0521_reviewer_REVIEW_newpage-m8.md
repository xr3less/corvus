# Task Report: reviewer-newpage-m8

## Status
SUCCESS

## Verdict
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-0521_reviewer_REVIEW_newpage-m8.md
- READ-ONLY review of: Agent Reports/2026-09-23-0503_fix-newpage-m8_FIX_newpage-verdict-retry.md, apps/web/app/dashboard/new/page.tsx (M-8 hunk: lines 84-87 decl, 116-117 guards, 171-180 catch), apps/web/app/dashboard/new/page.test.tsx (new test at line 928)
- No product files modified (one transient guard mutation applied and restored byte-identically; see Guard honesty)

## Dependencies Added
None.

## Assumptions Made
- Pre-existing working-tree waves (259 changed files at review time) are the baseline; HEAD diff cannot isolate this task, so verification is by direct region read of the M-8 hunk, not by `git diff HEAD -- <file>`.
- The `package-lock.json` (+18 lines, `apps/testbot` entry) and `.env.example` modifications visible in `git status` are pre-existing waves unrelated to this task, not author edits.
- Toolchain detected from disk: npm (root `package-lock.json` present; no pnpm/yarn/bun lockfile); `apps/web/package.json` scripts: `typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check`, `test: vitest run`. Gates run accordingly from the directories the author specified.

## Open Questions for Orchestrator
- None blocking. M-9 (`runId` set-once latch, page.tsx:71/105) remains open by design — confirm the follow-up task owns it.
- Note for the record: my first guard-break attempt removed the wrong half (`judgedUserIdRef.current = null`, leaving the marker write) and the focused test still passed (1 passed | 38 skipped) — expected, since the judged pin is per-row and a new user row carries a new id. The valid guard-break is the second one below (removing the failure-marker write).

## Public Interface Exposed
None (no signature changes; verdict POST shape `{ botId, turns }` unchanged).

## Known Limitations
- Review scope is M-8 ONLY (Item M-8 of `Agent Reports/2026-09-23-0347_sweep_REVIEW_sweep-synthesis.md`). M-7 mint latch and M-9 runId latch verified untouched, not re-tested.
- Verification is gates + targeted test + transient guard mutation on the real file; the app was not booted end-to-end in a browser.

## Verification

### 1. Artifacts exist
- Author report on disk and read in full: `Agent Reports/2026-09-23-0503_fix-newpage-m8_FIX_newpage-verdict-retry.md`.
- Page hunk confirmed by direct region read:
  - `page.tsx:84-87` — `verdictFailedUserIdRef` declaration + M-8 comment.
  - `page.tsx:116-117` — `if (judgedUserIdRef.current === lastUser.id) return;` + `if (verdictFailedUserIdRef.current === lastUser.id) return;`.
  - `page.tsx:171-180` — transport `.catch()` sets fallback, clears `judgedUserIdRef.current = null`, records `verdictFailedUserIdRef.current = lastUser.id`.
- Test hunk confirmed: `page.test.tsx:928` — `it('a verdict transport failure retries on the next eligible turn', ...)`, ~80 lines through `:1008`.
- HEAD-diff isolation statement: `git status --short | wc -l` → 259 changed files; task delta verified by region read, not HEAD diff.

### 2. Gates (exact commands + results)
- `cd /c/Users/xr3less/Desktop/corvus/apps/web && npx vitest run app/dashboard/new/page.test.tsx` → `Test Files 1 passed (1)`, `Tests 39 passed (39)`, Duration ~4.66s. (Must run from `apps/web`; repo-root run misresolves `@/`.)
- `cd /c/Users/xr3less/Desktop/corvus/apps/web && npx tsc --noEmit` → exit 0, no output.
- `cd /c/Users/xr3less/Desktop/corvus && npx eslint apps/web/app/dashboard/new/page.tsx "apps/web/app/dashboard/new/page.test.tsx"` → exit 0, zero warnings.
- `cd /c/Users/xr3less/Desktop/corvus && npx prettier --check apps/web/app/dashboard/new/page.tsx "apps/web/app/dashboard/new/page.test.tsx"` → `All matched files use Prettier code style!`, exit 0.

### 3. Spec adherence (M-8 only)
- Failed verdict POST clears the pin: `page.tsx:179` `judgedUserIdRef.current = null` in `.catch()` — present.
- Next eligible ask-line turn posts fresh: new test drives 2 verdict POSTs total (`callsTo(fetchStub, '/api/builder/verdict')` 1 after failure → still 1 after middle turn → 2 after re-ask + yes), run lands (`run-789`, link `href="/dashboard?runId=run-789"`).
- SAME failed row never re-posts (loop guard): `page.tsx:117` skips when `verdictFailedUserIdRef.current === lastUser.id`; `:180` records the failed row id. Middle non-eligible turn (preceded by ack, not ASK_LINE) still posts nothing (assert stays at 1 POST).
- M-7 mint lines untouched: `mintAttemptedRef.current = false` resets present at `:210/:219/:223/:228`; `handleSubmit` once-guard at `:237-238` intact.
- M-9 `runId` latch untouched: grep `setRunId\(null\)` in page.tsx → zero hits.
- In-flight/dedup intact: `page.tsx:104` (`streaming || building || buildingRef.current`), `:105` (`runId !== null`), `:104-106` + `:120` (`botId === null`) guards unchanged; `buildingRef` set-before-fetch (`:121`) and cleared in `.finally()` (`:183`).
- Copy byte-identical: `START_FALLBACK_ERROR = 'Could not start the build. Try again.'` (`:36`); test asserts the same string at `:918` and `:978`. `MINT_FALLBACK_ERROR` (`:35`) and M-7 retry copy untouched.

### 4. Guard honesty (own transient mutation, no git restore commands)
- Backup outside repo: `cp apps/web/app/dashboard/new/page.tsx /c/Users/xr3less/m8-guard-backup-page.tsx.bak`; sha256 before = `e1d3e19a559727eddd752846ae1711e39a4f73f1cb0e03eb4979af9eb2945f8f` (file and backup identical).
- Break: removed only the `verdictFailedUserIdRef.current = lastUser.id;` write (kept `judgedUserIdRef.current = null;`, kept the `:117` guard). File hash changed (`cd7da4cb...`), confirming a real derivation break.
- `npx vitest run app/dashboard/new/page.test.tsx -t "retries on the next eligible turn"` → `Test Files 1 failed (1)`, `Tests 1 failed | 38 skipped (39)` — failure at `page.test.tsx:977` (`findByRole('alert')` finds nothing: without the marker the cleared pin lets the settling effect re-post the same row immediately, the retry lands early as `run-789`, and the expected honest-fallback alert never renders).
- Restore: `cp` backup over the file (no `stash`/`checkout --`/`restore`/`reset` used); sha256 after = `e1d3e19a559727eddd752846ae1711e39a4f73f1cb0e03eb4979af9eb2945f8f` — byte-identical to before. Grep confirms `:179-180` both lines present.
- Re-run full suite after restore: 39/39 green.

### 5. Scope/security
- Author delta touches only the two in-scope files (region-read verified). No manifest/lockfile edits by this task (`apps/web/package.json`, root `package.json` unmodified in status; `package-lock.json` diff is the pre-existing `apps/testbot` entry).
- No installs run, no commits, no git restore commands, no production access. No secret values in the hunk (POST body is `{ botId, turns }`; no keys/tokens). No `.env` edits by this task.
