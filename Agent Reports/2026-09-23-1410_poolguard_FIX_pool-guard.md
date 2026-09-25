# Task Report: poolguard-pool-guard

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/lib/db/pool.test.ts (only file modified; `git diff --numstat` reports `167 1` for it; `apps/web/lib/db/pool.ts` numstat still exactly `15 0` from the webwire task — untouched by this task)
- CREATED: Agent Reports/2026-09-23-1410_poolguard_FIX_pool-guard.md (this report)

No other repository file was created, modified, or deleted. No manifest, lockfile, `.env`, or config touched. No install run. No git restore/stash/checkout/reset/commit. No production contact.

## Dependencies Added
None. `@corvus/ai` was already a declared dependency of `@corvus/web`; the test imports `REFILL_CREDITS_SQL`, `__resetRefillPool`, `__setRefillPool`, `refillAllowance` from the built package (`packages/ai/dist`, mtime 13:27:38 newer than `src/budget.ts` 11:21:56, seam present). Verified from disk: pg-boss 12.30.0, Postgres server 17.11, Node 24.15.0.

## What Was Added

Two new `describe` blocks in `apps/web/lib/db/pool.test.ts` (3 new tests; file goes 2 → 5 tests):

1. **`refill-pool wiring guard (webwire)` — hermetic, no live DB.** Lets `getPool()` take the real `new Pool(...)` construction branch with the unroutable fixture URL (`pg` opens sockets lazily on first query, never at construction — verified: no socket opened, no query dialed), then observes WITHOUT calling any setter:
   - Positive: intercepts the constructed pool's `query` (plain assignment shadows the prototype method — verified writable/configurable on `Pool.prototype`) and asserts `refillAllowance('guard-account')` resolves `1000` with exactly one call carrying `REFILL_CREDITS_SQL` and `['guard-account', 'refill']`. Fails if `pool.ts:90` (`__setRefillPool(pool);`) is removed.
   - Stand-in pin: with no `DATABASE_URL`, the stand-in still rejects and the seam still reads `0` — pins that the KI-021 lazy property was not traded away (passes with or without the wiring line, by design).
2. **`refill 90-day boundary on live Postgres` — repo live-PG idiom.** Module-level probe with loud skip (`describe.skipIf`, never silent-pass, plus `console.warn` with reason). Inserts an 89-day-old refill row (1000, must count) and a 91-day-old refill row (5000, must NOT count) for a fresh account, wires the live pool to the seam, and asserts `refillAllowance(accountId)` resolves to exactly `1000` — a single exact number, not a range, so a leaking aged row reads `6000` and fails. Cleans up via `DELETE FROM accounts` (cascade) in `finally`.

## Acceptance Criteria — Evidence

| Criterion | Result | Proof |
|---|---|---|
| Guard fails when wiring removed, passes when restored (both runs stated) | **PASS** | BROKEN run (`__setRefillPool(pool);` replaced by a comment, via temp copy outside the repo, restored after): **1 failed / 4 passed** — `expected +0 to be 1000` on the positive guard test; stand-in pin passes by design. RESTORED run: **5/5 pass** (`pool.ts` numstat back to exactly `15 0`). |
| Pool suite green | **PASS** | `npx vitest run lib/db/pool.test.ts`: **5/5** (2 KI-021 + 2 guard + 1 live boundary, the last executed, not skipped — 258–309 ms runs). |
| Typecheck 0 on touched scope | **PASS** | `npx tsc --noEmit` exit 0 at final verification; `grep -c "error TS"` → `0`; zero errors mention `lib/db/pool`. (Note: an earlier session run surfaced 5× TS2345 in `app/api/spec/rollback/rollback.test.ts` — a file concurrently modified by the wave, not by this task; it is clean at final verification.) |
| Lint 0 | **PASS** | `npx eslint lib/db/pool.test.ts lib/db/pool.ts --max-warnings 0` exit 0; `prettier --check lib/db/pool.test.ts` clean. |
| 90-day boundary tested live | **PASS** | No TODO needed — the boundary test runs against live Postgres (CI fixture URL, migration 0011 tables present: `credit_ledger` + `accounts` confirmed) and passes. SQL text named in the test comment, identical in `packages/ai/src/budget.ts:61-63` and `apps/web/app/api/credits/route.ts:75-77`. |
| Full web suite | **DOCUMENTED PRE-EXISTING ONLY** | Full `npx vitest run`: 63 files, 915 passed / 6 failed in 3 files (`rollback.test.ts` 2, `ai-chat-input.test.tsx` 3, `bots/[id]/page.test.tsx` 1). All three files show `M` status from concurrent wave work; none imports or depends on `pool.test.ts` or the refill seam; `pool.ts` was not touched by this task. Failures are unrelated to this change (recorded, not fixed — out of scope; STOP rule respected). |

## Assumptions Made
- The repo live-PG idiom (`process.env.DATABASE_URL ?? TEST_DATABASE_URL`, module-level probe, `describe.skipIf`, loud `console.warn`) from `app/api/webhooks/creem/route.test.ts` is the sanctioned pattern for live-DB tests; the new boundary test copies it rather than inventing a convention.
- `pg`'s lazy-connect behaviour (no socket at construction) is what makes the hermetic guard network-free; confirmed by code inspection plus the suite passing with an unroutable URL and an intercepted `query`.
- `__setRefillPool` imported at the top of the test file resolves to the same module instance the web process uses (workspace symlink `node_modules/@corvus/ai` → `packages/ai`, `main: ./dist/index.js`, dist fresh). The guard's break-run empirically confirms instance identity: removing the production call flips the result.
- The 89/91-day margins are far enough from the 90-day boundary to be immune to suite-duration clock skew, and `now() - interval '90 days'` is evaluated per-query in Postgres so there is no midnight-flakiness beyond the multi-day margin.

## Open Questions for Orchestrator
- **OQ-1 (closeout wording).** The webwire report's "exactly one modified path" phrasing is tree-level stale (concurrent wave). This task's diff claim is scoped: `pool.test.ts` is this task's only modified file; `pool.ts` is byte-identical to the webwire handoff. Suggest the wave closeout scope diff claims per-task.
- **OQ-2 (CI port).** The repo's live-PG tests use two ports: `TEST_DATABASE_URL` points at `:5434` while `ci.yml` serves Postgres on `:5432` with `DATABASE_URL` set — so in CI the boundary test runs via `DATABASE_URL`, locally via the `:5434` default. Both paths were verified reachable here. No action; recording that the test exercises whichever is present.
- **OQ-3 (reviewer F2 second pool).** Untouched: `apps/web/lib/auth/session.ts:346` still owns its own session-store pool, correctly unwired. The guard pins only the credits/gate pool identity.

## Public Interface Exposed
No production exports added, removed, or changed. Test-only additions inside `pool.test.ts`: `probeLiveDatabase`/`liveProbe`/`liveSkipReason` (module scope) and the two new `describe` blocks. `pool.ts` surface unchanged.

## Known Limitations
- The hermetic guard intercepts `pool.query` on the constructed instance; it proves the seam names *that* pool object and issues the shared SQL through it, but does not open a socket (by design — no network).
- The live boundary test covers `REFILL_CREDITS_SQL` as executed through `refillAllowance` (the gate side). The credits-display side (`credits/route.ts`) uses a textually identical constant; literal identity of the two SQL strings is asserted by comment, not by a string-equality test (they live in different modules and the duplication is intentional per the existing code comments).
- Full-suite failures (6 in 3 concurrently-modified files) were recorded, not investigated or fixed — out of scope for this task's write-scope.
- No server boot / real HTTP request was performed; evidence is vitest suites plus the break-and-restore run.

## Verification Commands (exact)
- `npx vitest run lib/db/pool.test.ts` → 5/5 (final, post-prettier)
- `npx vitest run lib/db/pool.test.ts --reporter=verbose` → all 5 named, incl. live boundary executed
- Break run (wiring line commented via temp copy, restored after) → 1 failed (`expected +0 to be 1000`) / 4 passed; restored → 5/5, `pool.ts` numstat `15 0`
- `npx eslint lib/db/pool.test.ts lib/db/pool.ts --max-warnings 0` → exit 0
- `npx prettier --check lib/db/pool.test.ts` → clean
- `npx tsc --noEmit` → exit 0, 0 `error TS`, none in `lib/db/pool`
- Full web `npx vitest run` → 915 passed / 6 failed, all 6 in concurrently-modified unrelated files (named above)

## SECURITY
Production box, Contabo, GHCR, and live keys were never touched. No SSH, no box `.env`, no registry push, no deploy. No `package.json`/lockfile/`.env` edit, no install, no commit, no git command that restores from HEAD. No secret value was read, printed, copied, or transmitted — connection strings used are the repo's own checked-in CI fixture literals, presence-checked by reachability only, and no credential appears in this report. No live Discord, no network side effects beyond the repo-sanctioned live-Postgres test idiom against the local CI fixture database. Test data used run-unique `discord_id`s and was deleted in `finally`.
