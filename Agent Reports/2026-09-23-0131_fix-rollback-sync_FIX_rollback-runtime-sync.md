# Task Report: fix-rollback-sync

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/spec/rollback/route.ts
- MODIFIED: apps/web/app/api/spec/rollback/rollback.test.ts

No other file was created, modified, or deleted. `publish/route.ts`, gateway files, migrations,
and shared manifests were NOT touched (all confirmed via `git diff --stat`).

## Dependencies Added
None. No install was run; `node_modules` was already present.

## Assumptions Made
- **Reuse was chosen over mirroring for the translator.** The fix direction permitted either
  ("reuse publish's sync function if importable without side effects; otherwise mirror its SQL").
  `syncRuntimeRows` is module-private in `publish/route.ts` (an out-of-scope file), so it could not be
  reused without editing that file. `translateProdSpec` and the `RuntimeRow` / `PublishTranslator`
  types ARE exported, so those are imported and reused rather than copied. Only the DELETE+INSERT
  persistence is mirrored, and it is byte-identical to publish's (verified by diffing both functions).
  The rationale: duplicating the kind vocabulary + alias table is the drift that would let rollback
  write rows a publish would not, whereas duplicating a 2-statement SQL write is checkable — and it is
  checked by the parity test below.
- **The route → route import is deliberate and flagged in-code.** `lib/spec/preflight.ts:3-4` records
  that a previous wave extracted a shared helper specifically "so rollback no longer imports across a
  route boundary". That precedent was honoured for the Red-block *decision* (which genuinely differs
  between the routes). The row mapping does not differ, so importing beats a second copy. No cycle is
  created — `publish` imports nothing from `rollback`. An in-code `Flag:` recommends the eventual
  `lib/spec/runtime-rows.ts` extraction so both routes import from a lib module.
- **A translator failure is a 500, matching publish.** Once the translator is shared, an injected
  throwing translator can no longer isolate the row-sync statement; the failure-path test therefore
  covers translation failure, which routes through the same `catch` and proves the same thing — the
  whole transaction unwinds (pointer, audit row, runtime rows unchanged).
- **`version` in the new target query.** `SELECT id, version, state, spec` now also reads `spec`,
  which is what the sync translates. No extra round trip was added.
- **Rollback's response shape is unchanged** (`{ version }`, 200) because the existing tests and any
  dashboard consumer assert it; only publish returns `runtimeRows`.

## Open Questions for Orchestrator
- **Pre-existing failures, NOT caused by this task (see Verification).** `interview.test.ts` (3) and
  `templates.test.ts` (2) fail on this machine both BEFORE and AFTER the fix, on a pristine database.
  Root cause appears to be test-harness/DB prep (`expected 404 to be 422`; `column "tier" of relation
  "accounts" does not exist`), not this change. Flagging rather than silently absorbing; the shared
  test-DB `ensurePg()` pattern is a harness-level defect worth a separate look.
- **`bot_runtime_config` has no migration path executed by `rollback.test.ts` before this change.**
  The table is created by `0012_bot_runtime_config.sql` (now added to the test's source list) plus an
  inline fallback DDL copy, mirroring `publish.test.ts`. If `audit_events` still has no migration on
  disk (the file's own `Flag:` at line 52), that remains open and is unchanged by this task.

## Public Interface Exposed
Route behaviour:
- `POST /api/spec/rollback` — unchanged request/response contract: 200 `{ version }`; errors
  401 / 404 / 409 `{ reason: 'stale-draft' }` / 422 / 500 `{ error }` all unchanged.

New exports from `apps/web/app/api/spec/rollback/route.ts`:
- `__setTranslator(fn: PublishTranslator): void` — test injection seam, mirrors publish's.
- `__resetTranslator(): void` — restores `defaultTranslateProdSpec`.

Module-private (not exported):
- `syncRuntimeRows(client: PoolClient, botId: string, rows: RuntimeRow[]): Promise<number>`
  — `DELETE FROM bot_runtime_config WHERE bot_id = $1` then one INSERT per row
  (`guild_id NULL`, `params::jsonb`, `spec_version` from the row), inside the caller's transaction.

Reused (imported, not redefined) from `../publish/route`:
- `defaultTranslateProdSpec`, types `PublishTranslator`, `RuntimeRow`.

DB state after a successful rollback: `bots.prod_spec_id` = target row, `bot_runtime_config` rows =
exactly what a publish of that version writes, one `audit_events` row with `action='rollback'` — all
committed in one transaction.

## Known Limitations
- The mirrored `syncRuntimeRows` is not shared code; if publish's version changes, rollback's copy
  must change too. `Flag:` in the route recommends extracting both into `lib/spec/runtime-rows.ts`.
  The parity test in `rollback.test.ts` fails if the two ever disagree, so the drift cannot land
  silently.
- The gateway is not notified/restarted by the sync. It reads `bot_runtime_config` on ready
  (`BOOT_CONFIG_SQL`), so a bot already running picks up the rolled-back rows on its next start —
  same as publish's behaviour today. Not in scope; unchanged by this task.
- No test asserts the true end-to-end path (a live bot re-attaching modules after a rollback) — that
  requires a Discord connection and is out of scope for a hermetic/mocked-PG task.
- `specVersion` written by rollback is the rolled-back version (target's), which is what the boot
  reader validates and what publish writes for the same version.

## Verification (what was actually run, and what it proved)
Commands run with the repo's real toolchain (`apps/web/package.json` scripts; binaries from the root
node_modules). A disposable local Postgres container served `TEST_DATABASE_URL`
(`postgresql://corvus:corvus_ci@localhost:5434/corvus_ci` — CI's own fixture), then was removed.

- `tsc --noEmit` → exit 0, zero errors.
- `eslint app/api/spec/rollback/route.ts rollback.test.ts` → exit 0, zero errors/warnings.
- `prettier --check` on both files → clean.
- `vitest run app/api/spec/` → **58/58 passed** (rollback 16, publish 33, spec 9). The tests are
  Postgres-backed, not skipped: the DB was live for these runs.
- **Guard proven by breaking it (LESSONS §1.8).** With `await syncRuntimeRows(...)` replaced by
  `void rows` (pre-fix behaviour), exactly 3 of the 4 new tests FAIL — the divergence test, the
  publish-parity test, and the retired-kind test. The 4th (transaction unwind) still passes because it
  fails at translation, before the sync. The file was restored byte-identically afterwards
  (`diff` confirmed) and the suite returned to 16/16.
- **Regression scope proven, not asserted.** Full suite `vitest run` → 810 passed, 5 failed. The 5
  are `interview.test.ts` (3) and `templates.test.ts` (2). Neither file imports either module I
  touched (imports inspected). Decisive check: I temporarily reverted `rollback/route.ts` to its
  `HEAD` content and re-ran both files — **the same 3 and 2 failures**, on a freshly recreated
  database. They are pre-existing and unrelated. My fix was then restored from an out-of-repo backup
  and re-verified (`diff` clean).
- Response shape and the `action='rollback'` audit insert were re-read directly in the final file.
- No secret values were printed, copied, or transmitted; presence checks only. The only URL-shaped
  string appearing in the diff is the pre-existing public CI test fixture, which I did not add.

### The 4 new tests
1. `replaces the newer spec rows with the target version rows after publish v2 -> rollback v1` —
   publishes v1, then v2, through the REAL publish route (no hand-seeded audit/rows), then rolls back
   to v1 and asserts the rows are v1's (disjoint kind sets, so a stale row cannot hide behind a
   matching one) and `specVersion` is 1.
2. `leaves the database exactly as a publish of the target version would` — a second bot publishes v1
   through the publish route as an independent control; the rolled-back rows must equal it row-for-row
   (apart from `botId`). This is the parity proof for the mirrored SQL.
3. `drops a kind the rolled-back version never carried` — a DELETE-less sync would leave the newer
   version's `giveaway` row live; asserts it is gone.
4. `a translator failure unwinds the pointer, the audit row, and the runtime rows` — asserts the
   pointer stays on v2, zero rollback audit rows exist, and the runtime rows are untouched.
