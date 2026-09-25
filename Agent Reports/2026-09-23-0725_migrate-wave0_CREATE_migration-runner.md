# Task Report: migrate-wave0

## Status
SUCCESS

## Files Touched
- CREATED: apps/gateway/scripts/migrate.mjs
- MODIFIED: .github/workflows/ci.yml
- MODIFIED: infra/RUNBOOK.md

## Dependencies Added
None. Runner uses only on-disk `pg` (root node_modules) + node builtins. Suggested future manifest addition (orchestrator-owned, NOT applied): `migrate` script in apps/gateway/package.json → `node scripts/migrate.mjs`.

## Assumptions Made
- Scratch proof ran against disposable DBs on the local `corvus-ci-pg` container (port 5434, host-mapped), same postgres:17 image as CI. CI step itself uses job-env DATABASE_URL (port 5432) — not executed here.
- `0012`/`0011` untracked working-tree files were treated as on-disk facts (not restored from HEAD); guard backup lived outside the repo with hash verify.

## Open Questions for Orchestrator
- None. All four locked decisions (no backfill/baseline, manual+CI trigger, suites frozen, 0010 zero special-casing) applied as specified.

## Public Interface Exposed
- `node apps/gateway/scripts/migrate.mjs [--check]` with `DATABASE_URL` required (fail fast, no port fallback). Journal table `public.schema_migrations(filename text PK, checksum text NOT NULL, applied_at timestamptz DEFAULT now())`. Exit 0 all-applied; non-zero naming file (+ statement on apply failure). `--check` = verify-only.
- Behavior: journal absent → create + apply all; journal present → apply missing only; checksum mismatch or journaled-but-missing file → hard fail naming the file. Advisory lock serializes concurrent invocations; per-file transaction; CONCURRENTLY statements rejected loudly.

## Known Limitations
- No `migrate.test.mjs`: skipped per scope (zero-new-deps rule) — behavior proven directly against disposable DBs instead.
- migrate.mjs carries a `/* global ... */` comment because the root flat ESLint config has no node-globals block for `.mjs` scripts; a future harness change (files-block for scripts/) would let that line go.
- Concurrent-race path (two runners on first boot) serializes via advisory lock by construction but was not load-tested here; Wave 1 must prove it.

## Verification
- Fresh empty DB `migrate_wave0_final`: applied 0001–0012 in order, journal = 12/12 rows, exit 0.
- Re-run: exit 0 no-op (`nothing to do`); `--check` on full journal: exit 0; `--check` on empty DB: exit 1 naming all 12 files.
- Tampered checksum (scratch only, `0008` → `deadbeef`): exit 1 `checksum mismatch for journaled file 0008_accounts_tier.sql`.
- DATABASE_URL unset: exit 1, no fallback.
- Guard mutation (0012 removed, backup at /tmp with sha256 `7658a537…` both sides): `--check` and run both exit 1 `journaled file 0012_bot_runtime_config.sql is missing…`; restored byte-identical (hash match), re-run green. No git restore commands used.
- `npx eslint apps/gateway/scripts/migrate.mjs --max-warnings 0` → 0; `prettier --check` clean on migrate.mjs, RUNBOOK.md, ci.yml; ci.yml YAML parses (js-yaml exit 0); ci.yml diff = exactly the one new step between Install and Test; no secrets in runner (grep exit 1). Scratch DBs dropped.
