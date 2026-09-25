# Task Report: reviewer-migrate-wave0

## Status
SUCCESS

## Verdict
PASS — all verifiable gates green; DB-dependent paths re-proved live against a disposable scratch DB. No fix needed.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0735_reviewer_REVIEW_migrate-wave0.md
- No other file created or modified. One transient guard-break mutation to apps/gateway/scripts/migrate.mjs was restored byte-identically (sha256 `5e74cadb…57ba` before/after match) with no git restore commands used.

## Dependencies Added
None.

## Assumptions Made
- The working tree carries multiple pre-existing uncommitted waves (testbot, docker-build job, .env.example billing keys, suite edits). Attribution below is by direct region read, not HEAD diff: only the 2-line Migrate step in ci.yml, the RUNBOOK §7.2.5 block, and the new runner belong to Wave 0.
- `0011`/`0012` untracked drizzle files treated as on-disk facts, per author.
- Scratch proof used local `corvus-ci-pg` (port 5434, postgres:17, same image as CI). CI's own step (port 5432) not executed here.

## Open Questions for Orchestrator
- None blocking. Wave 1 must still prove the two-runner first-boot race under load (lock exists by construction, not load-tested).

## Public Interface Exposed
- (Reviewed, not built): `node apps/gateway/scripts/migrate.mjs [--check]`, `DATABASE_URL` required, fail-fast, no port fallback. Journal `public.schema_migrations(filename text PK, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`.

## Known Limitations
- Concurrent-race path serializes via advisory lock by construction; not load-tested (author discloses; Wave 1 item).
- Tampered-checksum path verified statically + via author claim, not re-executed by me (I re-executed the sibling missing-file path instead).

## Verification (exact commands + results)
1. Artifacts exist: author report + SPEC read in full; `apps/gateway/scripts/migrate.mjs` read (144 lines); ci.yml Migrate region + RUNBOOK §7.2.5 read directly.
2. Scope: runner `grep -c 0010` = 0 (zero special-casing); `grep -ci baseline|backfill|globalSetup|FALLBACK|5434` = 0 (OQ1-4 honored); `apps/gateway/package.json` + root `package.json` untouched (`git status --porcelain` empty for both); zero suite/test files in wave scope (all observed suite/lockfile/`.env.example` diffs belong to other waves by region read). Suggested `migrate` npm script NOT applied — manifest owned by orchestrator, correct.
3. Runner live (scratch DB `reviewer_wave0`, since dropped): fresh apply = 0001–0012 in order, journal 12/12, exit 0; re-run exit 0 no-op; `--check` on full journal exit 0; `DATABASE_URL=""` exit 1 with no-fallback message. Live journal check: 12 rows, `filename:text`, `checksum:text`, `applied_at:timestamptz`, PK `schema_migrations_pkey` on `(filename)`. Static: split on `--> statement-breakpoint`, per-file BEGIN/COMMIT + ROLLBACK with journal INSERT inside, `pg_advisory_lock/unlock(hashtext(...))` with re-read under lock, CONCURRENTLY rejected, checksum-mismatch and journaled-but-missing both `fail()` naming the file.
4. CI: Migrate step `run: node apps/gateway/scripts/migrate.mjs`, ordered Install → Migrate → builds → … → Test (gates job); YAML parses via js-yaml, step order printed. (The `docker-build` job in the same file is another wave's, not Wave 0's.) RUNBOOK documents runner + `--check`, keeps 0010 warning as history with correct mechanism explanation.
5. `npx eslint apps/gateway/scripts/migrate.mjs --max-warnings 0` → exit 0; `prettier --check` on all three files → clean; secret grep on runner → exit 1 (clean).
6. MY guard-break (not author's): runner transiently repointed at scratch drizzle dir with 0012 removed → `--check` and run both exit 1: `journaled file 0012_bot_runtime_config.sql is missing from the migrations directory — migrations are forward-only; never delete or rename an applied file.` Restored byte-identical (hash match), re-run green (exit 0 no-op + `--check` exit 0). Backup lived outside repo; no git restore commands.

Verdict: PASS
