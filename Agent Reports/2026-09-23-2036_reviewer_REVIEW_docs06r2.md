# Task Report: reviewer-docs06r2-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2036_reviewer_REVIEW_docs06r2.md
- MODIFIED: none

## Dependencies Added
- None (review-only; no manifest, no install)

## Assumptions Made
- Web research unneeded: task is disk verification of doc claims against on-disk files. Every check below is a direct read/grep/ls on disk.
- RUNBOOK "§7.2.5" string accepted as the repo's pre-existing convention (infra/RUNBOOK.md:182 uses "(7.2.5)" for the same step; doc path "RUNBOOK.md" vs on-disk "infra/RUNBOOK.md" is pre-existing, out of this fix's scope) — not counted as a defect.
- Diff judged by hunk content, not stat: file was already dirty from the pre-existing E-wave rewrite before this fix.

## Open Questions for Orchestrator
- None for this clause — fix verified correct.
- UNTRACKED 0011–0013 CAVEAT (carried, confirmed again): `git ls-files -- apps/gateway/drizzle/` tracks only 0001–0010; 0011/0012/0013 exist on disk but are untracked. §5's "0001 → 0013 … the schema the product ships" is true on disk and true for CI once committed, but until those three files are committed, any fresh checkout/CI runs only 0001–0010. §5 carries no uncommitted caveat (§2/§3 do note "working tree unmerged" for the 0011 tables). Decide: (a) commit the three files, or (b) add one caveat clause to §5. Out of this review's write scope either way.

## Public Interface Exposed
None (review only; no code, config, or doc edits made).

## Known Limitations
- Review covers §5 line 202 + its cited sources only. Pre-existing E-wave hunks elsewhere in the same file (header, §1–§4) were scope-checked (headings/order intact) but not fact-checked — that belongs to their own review tasks.
- migrate.mjs behaviour verified by code read, not by executing against a live DB. No DB was started; no prod contact.
- Finding: deploy.yml, ci.yml, infra/RUNBOOK.md are themselves M-modified in the working tree; citations are to working-tree line numbers, which may shift at commit.

## Verification

| # | Claim | On-disk truth | Result |
|---|---|---|---|
| 1 | False clause gone | Line 202 contains no "no migrate/psql/seed" string (grep-clean) | PASS |
| 2 | New clause present + true | Line 202: "runs the same runner only in its gates job against a throwaway CI DB (`deploy.yml:74-75`) and never touches the live DB — the prod apply stays an explicit, gated RUNBOOK §7.2.5 step behind a pre-deploy `pg_dump` snapshot." deploy.yml:74-75 is exactly the `Migrate (journaled runner over empty CI DB)` step in the `gates` job; :42-45 comment confirms throwaway-DB scope ("touches nothing else… does NOT migrate the live database"); no migrate/psql/seed step exists in `build` or `deploy` jobs; infra/RUNBOOK.md:150-171 has pg_dump-before-migrate + forward-only runner + --check + 0010 history; :182 "(7.2.5)" explicit-step note | PASS |
| 3 | migrate.mjs:1-5 header truth | Header states journal filename+sha256, forward-only hard fail, `[--check]` usage — matches doc | PASS |
| 4 | §5 range 0001→0013 | Line 202: "applied in number order (`0001` → `0013`; RUNBOOK.md §7.2.5)" | PASS |
| 5 | Journal + checksum tripwire | migrate.mjs:30-49 validateChecksums (missing-file fail :35, mismatch fail :42-44); :72 journal INSERT; :100-102 schema_migrations DDL | PASS |
| 6 | `--check` verify-only | migrate.mjs:109-115 (--check fails when pending); infra/RUNBOOK.md:158-159 corroborates | PASS |
| 7 | Per-file txn + advisory lock + CONCURRENTLY rejection | :57 BEGIN / :78 ROLLBACK per file; :120/:135 advisory lock/unlock; :61-63 CONCURRENTLY reject | PASS |
| 8 | No port fallback | :84-86 DATABASE_URL unset → exit 1, "Refusing to guess a port" | PASS |
| 9 | CI citation ci.yml:37-38 | :37 `- name: Migrate (journaled runner over empty CI DB)` / :38 `run: node apps/gateway/scripts/migrate.mjs` — exact match | PASS |
| 10 | 0010 non-idempotent warning present | §5: "0010's trailing UPDATE is NON-IDEMPOTENT (re-arms the trial) — never re-run it." Source 0010_accounts_trial_ends.sql:20 confirms the UPDATE | PASS |
| 11 | Forward-only rule | §5: "Never edit a shipped migration; add a new one." + frozen-file tripwire sentence | PASS |
| 12 | Destructive gate | §5: "Destructive migrations (drop/alter) require a pre-deploy `pg_dump` snapshot + orchestrator sign." | PASS |
| 13 | drizzle-kit devDependency + config, no migrate() in src | apps/gateway/package.json:36 `"drizzle-kit": "^0.31.0"`; apps/gateway/drizzle.config.ts exists; `grep -rn "migrate(" apps/gateway/src/` → zero hits | PASS |
| 14 | pg-boss note | §5: "v12.30.0 installed; latest bundled migration is v40 in `migrationStore.js`". node_modules/pg-boss package.json version 12.30.0; migrationStore.js `version: 40` (:1472) | PASS |
| 15 | Scope: fix touched only the §5 clause | `git status --porcelain -- Docs/06_data_model.md` → ` M` (that path only). Full diff vs HEAD shows pre-existing E-wave hunks (header/§1–§4) plus the §5 paragraph; within §5 the only change vs the pre-fix text is the deploy.yml parenthetical replacement. No other file dirtied | PASS |
| 16 | Prettier | `npx prettier --check Docs/06_data_model.md` → "All matched files use Prettier code style!", exit 0 | PASS |
| 17 | Cleanliness | Docs-only review; no commit/restore/stash, no prod, no secrets read or written | PASS |

SECURITY: no prod/box/GHCR/keys touched; no manifest/lockfile/.env edits; no git restore/stash/checkout/reset; no commit; no secret values printed.
