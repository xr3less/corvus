# Task Report: reviewer-ci-seeding

## Status
SUCCESS

## Verdict
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-0407_reviewer_REVIEW_ci-seeding.md

No product file, test file, manifest, lockfile, config, or .env was modified. Review was read-only plus test execution.

## Verification evidence

### 1. Artifacts exist + scope integrity
- Author report on disk: `Agent Reports/2026-09-23-0405_fix-ci-seeding_FIX_ci-seeding.md` (read).
- Both test files on disk and modified: `apps/web/app/api/interview/interview.test.ts`, `apps/web/app/api/templates/templates.test.ts`.
- `apps/web/lib/bots.ts`: `git diff -- apps/web/lib/bots.ts | wc -c` = **0 bytes** — production cap byte-identical vs HEAD. PASS.
- Scope note: the working tree holds the whole uncommitted wave (many `M` entries), so the spec's "ONLY the two test files modified" cannot hold literally. Scoped check instead: this task's attributable diff is exactly the two test files (interview +41/-3 lines, templates +191/-~60 approx per `git diff --stat`); `package-lock.json` dirt in the tree is an `apps/testbot` workspace entry (unrelated to this task, no dependency of this task touches it); the author declared zero dependencies. No secrets in the task diff (grep for password/secret/api-key/token outside TEST_DATABASE_URL/corvus_ci/DISCORD_CLIENT_ID fixtures: zero hits).
- No git restore/install/commit/production contact performed; no containers touched. The pre-existing scratch container `corvus-ci-pg` (port 5434) was used read-only via the suites' own setup.

### 2. Does it actually work — both suites together, one command, twice
Toolchain detected from disk (never assumed): `package-lock.json` present, no pnpm/yarn/bun lockfiles → npm; `apps/web/package.json` scripts: `test: vitest run`, `typecheck: tsc --noEmit`, `lint: eslint .`. Tests run from `apps/web` per spec.
- Run 1: `npx vitest run app/api/interview/interview.test.ts app/api/templates/templates.test.ts` → **Test Files 2 passed (2), Tests 33 passed (33)** (14 interview + 19 templates).
- Run 2 (same command, same DB state): **33/33** again — deterministic, no order dependence across runs.
- Run 3 (reversed file order): `npx vitest run app/api/templates/templates.test.ts app/api/interview/interview.test.ts` → **33/33**.
- No unexpected 403/500: the only 403s in the suites are the intentional gate assertions (see §3). No `tier`-missing or cap-collision failures in any of the three executions.

### 3. Cap integrity — fix direction is test isolation, never a weakened gate
- `mintGate` (`apps/web/lib/bots.ts:103-111`, `liveBotCount >= 1` → 403) untouched (0-byte diff, §1).
- Gate tests still assert refusal against the production gate: `interview.test.ts:357` (`refuses a second bot`, expects 403 at :367), `:375` expired clock 403, `:415` post-expiry 403; `templates.test.ts:598` (`refuses the second fork`, expects 403 at :612), `:625` expired 403. All passing.
- Diff grep for weakened-cap assertions (a test minting two live bots on one owner expecting success): **none** — `git diff` of both files contains zero `toBe(403)` removals/additions that weaken anything; the only new `toBe(200)` expectations sit behind `freshOwner()` / `forkAsFreshOwner()` (fresh owner per minting test) or the never-minting shared session. References to `liveBotCount >= 1` in the diff are comments citing `bots.ts:111`, not logic changes.
- Fix mechanism confirmed in diff: `TIER_COLUMN_DDL` self-heal (`ADD COLUMN IF NOT EXISTS tier ... DEFAULT 'trial'`, mirroring 0008) in both files' `ensureSchema`; fresh-owner isolation (`freshOwner('itv-*')` on 5 interview flow tests; `forkAsFreshOwner()` + never-minting shared `session` + widened `tfork-%` cleanup in templates).

### 4. Static gates
- `npx tsc --noEmit` from `apps/web`: exit **0**.
- `npx eslint apps/web/app/api/interview/interview.test.ts apps/web/app/api/templates/templates.test.ts --max-warnings 0` from repo root: exit **0**.
- `npx prettier --check` on both files: **clean** ("All matched files use Prettier code style!").

### 5. Scope/security
- No manifest/lockfile/.env edits attributable to this task (§1 note on pre-existing testbot lockfile dirt); no installs, no commits run by reviewer.
- No secrets in the task diff (§1).

## Assumptions Made
- The `package-lock.json` working-tree dirt (testbot workspace entry, last committed touch 9154d9e) predates and is orthogonal to this task; attributed to the wider uncommitted wave, not to fix-ci-seeding, based on content (discord.js/testbot only).
- The author's pristine-DB guard demonstration (8+7 pre-fix failures, `tier`-missing root cause) was accepted from the report's evidence section; the reviewer verified the fix direction statically (diff review) and empirically (post-fix green ×3) rather than re-running pre-fix files, which would have required a forbidden working-tree restore.

## Open Questions for Orchestrator
- None blocking. The author's two follow-ups stand as stated: interview `afterAll` row cleanup (one-block tidy) and M-13/m-50/m-52 (migration runner family) remain open by design.

## Public Interface Exposed
None (review only).

## Known Limitations
- Full-suite (all web files) and cross-workspace runs were not executed — same boundary as the author's acceptance criteria (two in-scope files together, plus reversed order by reviewer).
- Pre-fix failure reproduction was not re-executed (see Assumptions).
