# Task Report: reviewer-poolguard-2014

## Status

PASS

The builder claim in `Agent Reports/2026-09-23-2014_pool-guard_CREATE_refill-guard.md` is verified by independent re-execution and code read. The permanent call-shape guard exists, the wiring it protects is preserved byte-for-byte at the claimed hash, the focused suite is 8/8 green by my own run, gates are clean, and all honesty attributions (concurrent writer, pre-existing failure, Hard Rule 14) check out. Per scope, M1–M4 were assessed by code read plus clean test runs — prod was not re-mutated.

## Files Touched

- CREATED: `Agent Reports/2026-09-23-2048_reviewer_REVIEW_poolguard.md` (this report)
- MODIFIED: none
- DELETED: none

## Dependencies Added

None.

## Assumptions Made

- `pool.ts` "untouched" is judged against the pre-task working-tree state (the reviewed PASS state carrying the wiring), not against `HEAD` — the file differs from `HEAD` by exactly the previously-reviewed wiring (+15 lines), which predates this task.
- M1–M4 adequacy is judged structurally (code read + green baseline runs), not by re-executing mutations, per the explicit scope prohibition on prod re-mutation.
- The `bots/[id]/page.test.tsx` failure the builder recorded is evaluated on linkage + my own standalone run rather than by reproducing their exact full-suite numbers on a moving tree.

## Open Questions for Orchestrator

- **OQ-1 (concur with builder OQ-1, process defect).** Two tasks in this wave held `apps/web/lib/db/pool.test.ts` in MODIFY scope (this task + `2026-09-23-1410_poolguard_FIX_pool-guard.md`). No corruption occurred — verified additive-only below — but this was luck plus the builder's re-read discipline, not harness safety. Recommend a mechanical sorted-path collision check on write-scopes before spawning a wave.
- **OQ-2 (informational).** At review time (20:52 local) the `bots/[id]/page.test.tsx` file the builder recorded as failing 1/56 passes **56/56** standalone. Zero linkage to this task either way (grep, no match for `pool`). Consistent with a flaky timing test under a moving tree, not with builder-caused breakage. No action for this task; the file still needs an owner for its flakiness.
- **OQ-3 (concur with builder OQ-4, still open).** No test pins the credits-display SQL string in `apps/web/app/api/credits/route.ts` as textually identical to `REFILL_CREDITS_SQL`. Out of this task's scope; needs a production-scope owner.

## Public Interface Exposed

No production interface changed. This review created no code and changed no interfaces.

## Known Limitations

- M1–M4 judged by structural code read, not by re-running mutations (scope forbade prod re-mutation). Each is marked "structurally certain" with the exact red mechanism named.
- Full web suite was not re-run at review time (moving tree with many uncommitted tasks); full-suite attribution rests on the builder's recorded isolation experiment plus my verified zero-linkage check and a green standalone run of the previously-failing file.
- KI-021 body comparison covered the two `it()` bodies (byte-identical); the one-line `__resetRefillPool()` addition to that describe's `afterEach` is the sibling's, predates this task, and is behavior-preserving cleanup.
- `apps/gateway` not run (out of scope).

## Verification table

| # | Criterion | Result | Evidence |
|---|---|---|---|
| V1 | pool.ts untouched, wiring `:90` preserved | PASS | SHA-256 `0F4F6CA1405817917684E4D20CB550DCD530659D8ACEB04B09774D0BBFF123BF` matches builder claim exactly; `git diff --numstat` = `15 0` matches claimed state; `Select-String` confirms `__setRefillPool(pool);` at `apps/web/lib/db/pool.ts:90`; `git diff` vs HEAD shows only the previously-reviewed wiring block (import + comment + call) — no behavior change by this task |
| V2 | pool.test.ts additions exist (boundary spy + 3-test block) | PASS | `vi.hoisted` spy + `vi.mock('@corvus/ai', …)` delegating factory at `apps/web/lib/db/pool.test.ts:25-33`; `describe('refill-pool wiring call shape (guard)')` at `:165-246` with exactly 3 `it()` cases (instrument `:185`, count+identity `:195`, stand-in no-call `:223`); scoped `beforeEach` with `seamSpy.mockClear()` at `:168-173`; import broadened to include `beforeEach, vi` at `:17` |
| V3 | Sibling tests intact, KI-021 bodies byte-identical to HEAD | PASS | Node extraction of both KI-021 `it()` bodies vs `git show HEAD:` → `body0 identical: true`, `body1 identical: true` (640/291 chars each); `git diff -U0` deletions = exactly the 2 claimed import lines, no test content deleted; sibling `webwire` describe (`:102-156`) and live-PG suite (`:287-329`) present and unmodified in body |
| V4 | Focused suite green by reviewer run | PASS | `npx vitest run lib/db/pool.test.ts --reporter=verbose` → **8 passed / 8**, all named: 2× KI-021, 2× webwire effect guard, 3× call-shape guard, 1× live-PG boundary **executed (24 ms), not skipped** |
| V5 | Typecheck / lint / format clean by reviewer run | PASS | `npm run typecheck` (`tsc --noEmit`) exit 0, no output; `npx eslint lib/db/pool.test.ts --max-warnings 0` exit 0; `npx prettier --check lib/db/pool.test.ts` → "All matched files use Prettier code style!" |
| V6 | M1 adequacy (delete wiring → count guard red) | PASS (structural) | With `__setRefillPool(pool);` removed, `seamSpy` records 0 calls → `toHaveBeenCalledTimes(1)` fails; stand-in-path test's post-URL `toHaveBeenCalledTimes(1)` fails likewise. Certain: the spy is the only writer-observation path and delegation preserves real behavior otherwise |
| V7 | M2 adequacy (lookalike pool → identity red, shape-blind) | PASS (structural) | `toBe(pool)` / `toBe(getPool())` at `pool.test.ts:204-205` compare object identity; a second `new Pool(...)` is `!==` the cached instance, so identity fails while any shape/count assertion passes. The "no visual difference" rendering is the expected vitest output for two distinct `Pool` instances with equal config |
| V8 | M3 adequacy + non-redundancy (stand-in wired → only call-shape red) | PASS (structural) | `expect(seamSpy).not.toHaveBeenCalled()` at `:234` fails if the stand-in branch calls the setter. Sibling effect guards are blind: their stand-in pin asserts `refillAllowance` resolves `0`, which holds identically when the seam holds nothing and when it holds the rejecting stand-in (absence-tolerant read). Builder's "1 failed / 7 passed, only mine" is exactly the predicted shape. Guard is **not redundant** — adjudicated in favor of keeping both layers |
| V9 | M4 adequacy (instrument break → validation test red) | PASS (structural) | `expect(__setRefillPool).toBe(seamSpy)` at `:191` fails if the mock specifier stops intercepting, since the named import then binds the real setter. `vi.isMockFunction` check at `:192` is a second tripwire. No `EFFACED` residue: grep of `pool.test.ts` for `EFFACED` returns nothing |
| V10 | Full-suite numbers attributed honestly | PASS with note | Zero-linkage verified: `pool` grep over `app/dashboard/bots/[id]/page.test.tsx` returns no match; that file imports nothing from `pool`, `@corvus/ai`, or the refill seam. Builder's baseline-isolation experiment (failure identical with pre-task `pool.test.ts`) is sound methodology. Note: at review time the file passes **56/56** standalone (builder recorded 55+1 fail) — flaky timing test on a moving tree, consistent with pre-existing, not with this task causing it. Full suite not re-run (moving tree); nothing in this task's scope can affect that file |
| V11 | Hard Rule 14 collision recorded, no overwrite | PASS | `git diff --numstat -- apps/web/lib/db/pool.test.ts` = `272 2`; deletions confirmed as exactly the 2 import lines. All other hunks additive (mock header, new describe, sibling's webwire block + 1-line afterEach addition predating this task). Spec-time defect, not agent fault — concur with builder OQ-1 |
| V12 | No secrets; no manifest/lockfile edits; no commit | PASS | Secrets grep (`sk-`, `api[_-]?key`, `secret`, `token`, `password`) over `pool.test.ts` → clean. `package-lock.json` working-tree diff (`18 0`) is the `apps/testbot` workspace addition from another task (last lockfile commit `9154d9e`, predates this task). Review ran read-only git commands plus test/lint/typecheck only; no stash/checkout/restore/reset, no install, no commit |
