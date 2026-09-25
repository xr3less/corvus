# Task Report: reviewer-docs06-2014

## Status
FAIL

## Files Touched
- CREATED: Agent Reports/2026-09-23-2030_reviewer_REVIEW_docs06.md
- MODIFIED: none

## Dependencies Added
- None (review-only; no manifest, no install)

## Assumptions Made
- Web research unneeded: task is disk verification of doc claims against on-disk files. No versions/APIs taken from memory; every check below is a direct read/grep/ls on disk. HEAD context: file already dirty from E-wave before this task; attribution judged by diff-hunk content, not by stat.
- RUNBOOK "§7.2.5" string accepted as the repo's pre-existing convention (RUNBOOK.md:182 uses "(7.2.5)" for the same step), not a literal heading — not counted as a defect.

## Open Questions for Orchestrator
- FIX REQUIRED (narrow, one-clause): Docs/06_data_model.md:202 parenthetical "(verified: deploy.yml has no migrate/psql/seed step)" is FALSE on current disk — deploy.yml:74-75 runs the same journaled runner in its `gates` job. Suggested reword: "deploy.yml runs the same runner only in its gates job against a throwaway CI DB (deploy.yml:74-75) and never touches the live DB — the prod apply stays an explicit RUNBOOK §7.2.5 step." Builder report's "deploy.yml grep → zero matches" claim is likewise stale/wrong; re-verify after fix.
- UNTRACKED 0011–0013 CAVEAT (carried from builder, confirmed): `git ls-files -- apps/gateway/drizzle/` tracks only 0001–0010; 0011/0012/0013 exist on disk but are `??` untracked. §5's "0001 → 0013 … the schema the product ships" is true on disk and true for CI once committed, but until those three files are committed, any fresh checkout/CI runs only 0001–0010. Doc carries no uncommitted caveat. Decide: (a) commit the three files, or (b) add one caveat clause to §5. Out of this review's write scope either way.
- NOTE: builder's "0010 warning kept word-for-word" is imprecise vs HEAD — HEAD's §5 (6b4466f) had no 0010 sentence at all; the warning was ADDED by this task (correct content, wrong attribution word). No doc change needed; record only.

## Public Interface Exposed
None (review only; no code, config, or doc edits made).

## Known Limitations
- Review covers §5 line 202 + its cited sources only. Pre-existing E-wave hunks elsewhere in the same file (header, §1–§4) were scope-checked (headings/order intact) but not fact-checked — that belongs to their own review tasks.
- migrate.mjs behaviour verified by code read, not by executing against a live DB. No DB was started; no prod contact.
- Finding: deploy.yml, ci.yml, RUNBOOK.md are themselves M-modified in the working tree; citations are to working-tree line numbers, which may shift at commit.

## Verification

| # | Claim | On-disk truth | Result |
|---|---|---|---|
| 1 | §5 states range 0001→0013 | Docs/06_data_model.md:202: "applied in number order (`0001` → `0013`; RUNBOOK.md §7.2.5)" | PASS |
| 2 | Runner path + journal + checksum tripwire | migrate.mjs:1-5 header (journal filename+sha256, forward-only hard fail, usage with [--check]); :30-49 validateChecksums (missing-file fail :35, mismatch fail :42-44); :57 BEGIN, :72 journal INSERT, :78 ROLLBACK, :100-102 schema_migrations DDL, :120/:135 advisory lock/unlock, :61-63 CONCURRENTLY reject, :84-86 DATABASE_URL unset fail | PASS |
| 3 | `--check` verify-only | migrate.mjs:109-115 (--check fails when pending); RUNBOOK.md:158-159 corroborates | PASS |
| 4 | CI citation ci.yml:37-38 | ci.yml:37 `- name: Migrate (journaled runner over empty CI DB)` / :38 `run: node apps/gateway/scripts/migrate.mjs` — exact match | PASS |
| 5 | RUNBOOK citation §7.2.5 | RUNBOOK.md:154-171 step 5 "Migrate (forward-only)" with same runner, --check, journal+tripwire prose, 0010 history; :182 "(7.2.5)" — convention string, accepted | PASS (convention) |
| 6 | 0010 non-idempotent warning present | §5: "0010's trailing UPDATE is NON-IDEMPOTENT (re-arms the trial) — never re-run it." Present. Source 0010_accounts_trial_ends.sql:20 confirms the UPDATE. (Added, not "kept" — see Open Questions) | PASS (content) |
| 7 | Forward-only rule | §5: "Never edit a shipped migration; add a new one." + "once applied, a file is frozen" tripwire sentence | PASS |
| 8 | Destructive gate | §5: "Destructive migrations (drop/alter) require a pre-deploy `pg_dump` snapshot + orchestrator sign." | PASS |
| 9 | drizzle-kit devDependency + config | apps/gateway/package.json:36 `"drizzle-kit": "^0.31.0"`; drizzle.config.ts exists; `grep migrate( apps/gateway/src/` → no hits | PASS |
| 10 | pg-boss note | §5: "v12.30.0 installed; latest bundled migration is v40 in `migrationStore.js`". node_modules/pg-boss/package.json version 12.30.0; migrationStore.js max `version: 40` (:1472) | PASS |
| 11 | deploy.yml "does NOT run migrations (verified: no migrate/psql/seed step)" | deploy.yml:74-75 HAS `Migrate (journaled runner over empty CI DB)` in `gates` job; :42-45 comments confirm throwaway-DB scope, live DB untouched. Substantive point (no live-DB migrate) true; evidence parenthetical false | **FAIL** — reword required, see Open Questions |
| 12 | `ls apps/gateway/drizzle/` = 13 files | 0001_init.sql … 0013_runtime_kinds_tickets.sql, 13 files on disk | PASS |
| 13 | Scope: only §5 by this task | `git status --porcelain -- Docs/06_data_model.md` → ` M` (that path only). Full diff shows other hunks (header/§1–§4) are the pre-existing E-wave rewrite; the sole §5 hunk is the old one-liner → new paragraph. Headings unchanged (5 headings, §5 last, no reorder); file 202 lines | PASS |
| 14 | Prettier | `npx prettier --check Docs/06_data_model.md` → "All matched files use Prettier code style!", exit 0 | PASS |
| 15 | Cleanliness | Docs-only; no commit/restore/stash, no prod, no secrets read or written | PASS |

SECURITY: no prod/box/GHCR/keys touched; no manifest/lockfile/.env edits; no git restore/stash/checkout/reset; no commit; no secret values printed.
