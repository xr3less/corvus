# Task Report: docs06-migration-range

## Status

SUCCESS

## Files Touched

- MODIFIED: Docs/06_data_model.md (§5 "Migrations", line 202 only — single-paragraph rewrite)

## Dependencies Added

- None (docs-only; no manifest, no install)

## Assumptions Made

- Findings #1/#2/#8 of `Agent Reports/2026-09-23-1240_inspect-docs-ci_REVIEW_docs.md` were treated as the defect statement and re-verified on disk before writing (nothing copied on faith — every claim in the new §5 has a file:line behind it, listed under Verification).
- `RUNBOOK.md §7.2.5` is kept as the citation string for the RUNBOOK migrate step. On disk that step is a numbered list item (RUNBOOK.md:154-171) under `### 7.2` (RUNBOOK.md:137), not a literal heading named "7.2.5" — the doc's pre-existing convention/string was preserved, not invented by me.
- "additive spirit" read as: rewrite only the stale clause-set inside §5, keep every surviving claim (0010 warning, forward-only rule, destructive-migration gate, drizzle-kit devDependency, pg-boss note) verbatim-or-stronger. No section was added, removed, or reordered.

## Open Questions for Orchestrator

- `git ls-files` still tracks only `0001–0010`; `0011/0012/0013` are `??` untracked in this working tree. §5 now states the range as `0001 → 0013` (true on disk, and true for CI once they are committed), but until those three files are committed, CI's checkout contains only `0001–0010` and the runner will apply 10 files there, not 13. That is finding #8 of the inspect report — an unfixed repo-state issue, not a doc issue, and out of this task's scope (I cannot commit and must not touch other files). The doc sentence is deliberately worded "the schema the product ships" for the committed state; if the orchestrator prefers the doc to carry the uncommitted caveat, that is a follow-up edit.

## Public Interface Exposed

None (documentation only). No code, config, manifest, or workflow file was touched.

## Known Limitations

- Scope was §5 only, per the task. The sibling drift on the same runner reported as finding #2 (`Docs/10_deployment.md:22`) is NOT fixed here — that file is outside my write scope; it was left untouched and needs its own task.
- Finding #10 of the inspect report (deploy.yml gates missing the Migrate step while its header claims "same gate order as ci.yml") is untouched for the same reason; §5 states the deploy workflow does not run migrations, which is the verified on-disk behaviour.

## Verification

All facts below were re-read from disk in this session; HEAD d9cf8d7, no git restore/stash/checkout/reset/commit used anywhere.

**Migrations exist 0001→0013 (not 0012):**

- `ls apps/gateway/drizzle/` → 13 files, `0001_init.sql` … `0013_runtime_kinds_tickets.sql`.

**Journaled runner exists and is as described:**

- `apps/gateway/scripts/migrate.mjs` (4895 bytes, mtime Sep 23 07:35) — read directly.
- `migrate.mjs:2` comment: "journals each applied file (filename + sha256) in public.schema_migrations"; `:3` "Forward-only: a checksum mismatch on a journaled file is a hard fail"; `:4-5` usage `DATABASE_URL=<url> node apps/gateway/scripts/migrate.mjs [--check]`, `--check = verify-only`.
- `:42-44` checksum mismatch hard fail naming the file; `:35` journaled-file-missing hard fail; `:57` `BEGIN` per file; `:72` journal INSERT; `:78` `ROLLBACK`; `:100-102` `public.schema_migrations(filename, checksum, …)`; `:120`/`:135` `pg_advisory_lock`/`unlock`; `:61-63` `CONCURRENTLY` rejected loudly; `:84-85` `DATABASE_URL` unset → fail with no port fallback.

**CI migrates with the runner:**

- `.github/workflows/ci.yml:37-38` — `- name: Migrate (journaled runner over empty CI DB)` / `run: node apps/gateway/scripts/migrate.mjs`. Verified by grep with line numbers: the only two `migrate`-matching lines in the file.
- `deploy.yml` grep for `migrate|Migrate|psql` → zero matches; its step list (grep `name:`) goes Install → Build spec → Build ai → Typecheck → Lint → Format → Test, no migrate — so the new §5 sentence "deploy.yml does NOT run migrations" holds.
- No `migrate(` call in `apps/gateway/src/` (grep, no hits).

**RUNBOOK step:**

- `infra/RUNBOOK.md:154-171` step 5 "Migrate (forward-only)" — `node apps/gateway/scripts/migrate.mjs`, `--check` variant, journal + checksum-tripwire prose, and the 0010 history note; `:182` "It does NOT run migrations — those stay an explicit step (7.2.5)."

**Surviving claims kept verbatim-or-stronger:**

- "Never edit a shipped migration; add a new one" → present; strengthened by the explicit tripwire sentence ("once applied, a file is frozen").
- 0010 warning → kept word-for-word: "0010's trailing UPDATE is NON-IDEMPOTENT (re-arms the trial) — never re-run it." Cross-checked against `apps/gateway/drizzle/0010_accounts_trial_ends.sql:21` (`UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;`) — non-idempotent as stated.
- Destructive-migration gate, `drizzle-kit` devDependency (`apps/gateway/package.json:36` `"drizzle-kit": "^0.31.0"`), and the pg-boss note all retained.
- pg-boss facts re-verified live rather than trusted: installed version `node_modules/pg-boss/package.json` = 12.30.0; latest bundled migration version in `node_modules/pg-boss/dist/migrationStore.js` = 40 (`version: 36…40`). Note the path in the doc says `migrationStore.js`, which resolves at `dist/migrationStore.js` in the installed package — the pre-existing phrasing was left as-is.

**Prettier (repo root):**

- `npx prettier --check Docs/06_data_model.md` → "All matched files use Prettier code style!" exit 0.

**Write-scope / cleanliness:**

- `git status --porcelain -- Docs/06_data_model.md` → ` M Docs/06_data_model.md` (that path only).
- `git diff --stat -- Docs/06_data_model.md` → 1 file, 52 insertions / 51 deletions vs HEAD. Important attribution note: the great majority of that diff is **pre-existing uncommitted working-tree edits** (the earlier E-wave rewrite of §1–§4 plus the removal of the KI-031 drift banner), not my work. My contribution is exactly one hunk — the §5 body line (currently line 202). The file was already modified before I touched it; I neither introduced nor reverted any earlier change.
- File length is now 202 lines; §5 remains the last section, with no reordering and no new/removed headings (heading list unchanged: §1 Entities, §2 Schema, §3 Relationships, §4 Data lifecycle, §5 Migrations).
- No deletions, no destructive commands, no commit, no network/prod contact, no secrets involved (docs-only edit; no secret values read or written).

SECURITY: production box / Contabo / GHCR / live keys untouched; no package.json/lockfile/.env edits; no git restore/stash/checkout/reset; no commit; no secret values printed.
