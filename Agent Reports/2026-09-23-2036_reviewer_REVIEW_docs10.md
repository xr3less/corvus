# Task Report: reviewer-docs10-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2036_reviewer_REVIEW_docs10.md (this report)
- MODIFIED: nothing else

Reviewed (read-only): Docs/10_deployment.md, apps/gateway/scripts/migrate.mjs, .github/workflows/ci.yml, .github/workflows/deploy.yml, infra/RUNBOOK.md (lines 140-199), apps/gateway/drizzle/0010_accounts_trial_ends.sql, apps/gateway/drizzle/0011_credit_ledger_subscriptions.sql (lines 1-15), Docs/KNOWN_ISSUES.md (KI-029 row). Plus the whitelisted builder report Agent Reports/2026-09-23-2014_docs10_MODIFY_runner-truth.md.

## Dependencies Added
None.

## Assumptions Made
- `git diff --stat` HEAD→worktree (4 insertions, 6 deletions) is accepted as the "+4/-6" claim. It includes the pre-existing KI-031 wave (DRIFT-banner removal + §4/§5/§6 rewrites, present before the builder's first Read per its report); the builder's own edit is confined to the §2 line-21 paragraph. No finer-grained attribution is possible from the diff alone, and the builder disclosed this.
- `gh` unavailability (builder's reason for re-scoping KI-029) was not re-proven; the re-scoped wording is judged on its own honesty against the on-disk KI-029 source, which is sufficient.
- No live database, migration run, or Actions-history lookup was performed — correctly out of scope for a docs review (a 0010 replay is the documented harm).

## Open Questions for Orchestrator
- None blocking. Two non-blocking notes from the builder report worth tracking: (1) line-number citations in Docs/10_deployment.md are rot-prone under parallel workflow edits — consider citing step names; (2) Docs/06_data_model.md:202 may still carry the sibling "no runner / no migrate step" staleness under another agent's ownership.

## Public Interface Exposed
None. Documentation review only.

## Known Limitations
- Review is static (file reads + grep + prettier + diff). Correctness of the runner's runtime behavior is attested by code reading, not by executing migrations.
- Anchor line numbers are verified against the live worktree at review time; a concurrent workflow edit could shift them again.

## Verification

| # | Claim | Result | Evidence |
|---|-------|--------|----------|
| 1 | §2 line 21 states CI migrates throwaway CI DB via journaled runner (ci.yml:37-38) | PASS | Line 21 on disk opens with "migrate the throwaway CI database with the journaled runner (`ci.yml:37-38`)"; `sed -n '37,38p' ci.yml` = Migrate step + `run: node apps/gateway/scripts/migrate.mjs` |
| 2 | Runner mechanism (.sort, journal sha256, tripwire, --check) with anchors | PASS | migrate.mjs:88 `.sort()` filename order; :51-81 applyFile (BEGIN…per-statement…INSERT filename+checksum…COMMIT, ROLLBACK on error); :30-49 validateChecksums (missing-file fail 33-39, mismatch fail 40-48); :109-115 CHECK_ONLY verify-without-apply |
| 3 | deploy.yml gates-only, never live DB (deploy.yml:42-45/:74-75) | PASS | deploy.yml:42-45 comment "does NOT migrate the live database… RUNBOOK §7.2.5"; :74-75 Migrate step inside `gates` job (own throwaway Postgres), not in `deploy` SSH script (:152-158 = pull/up/ps only); corroborated by RUNBOOK line 182 |
| 4 | Hand-run forward-only + pg_dump ordering (RUNBOOK §7.2 steps 4-5) | PASS | RUNBOOK lines 150-153 step 4 pg_dump, 154-171 step 5 runner migrate; doc sentence matches runbook order |
| 5 | 0010 warning kept and true (0010:20, 0011:5) | PASS | 0010:20 = `UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;`; 0011:5 = `-- NEVER RE-RUN 0010's UPDATE (it RE-ARMS the trial).` |
| 6 | Stale phrases gone (0 hits) | PASS | `grep -c -i` for "no runner script / never a glob loop / one psql file per command / Do not loop the folder / has never been run" → 0; all migrat/runner/psql/schema_migrations hits confined to line 21 (§2) |
| 7 | New anchors cited in doc all resolve | PASS | ci.yml:117 `push: false`; deploy.yml:22-23 `on:/workflow_dispatch:`; :13-16 rollback comment; :141 appleboy SHA pin `0ff4204…`; :156-158 pull/up/ps; RUNBOOK §7.2 steps 4-5 |
| 8 | Additive: headings intact, §1/§3 untouched | PASS | `grep -n "^## "` → 3,9,19,25,31,37,43 in original order; diff hunks touch only status banner (pre-existing KI-031), §2, §4/§5/§6 (pre-existing KI-031 wave, not this builder) |
| 9 | Diff stat small (+4/-6) | PASS | `git diff --stat -- Docs/10_deployment.md` → `1 file changed, 4 insertions(+), 6 deletions(-)` |
| 10 | Prettier clean | PASS | `npx --no-install prettier --check Docs/10_deployment.md` → "All matched files use Prettier code style!", exit 0 |
| 11 | §5 correctly empty of migration tokens | PASS | `sed -n '37,41p'` (Monitoring & rollback) has 0 matches for migrat/schema/drizzle/psql/forward; builder correctly made no §5 edit |
| 12 | KI-029 re-scope honest | PASS | Doc says "as of the last recorded check (KI-029, 2026-09-19) it has not been run end-to-end — DEPLOY_* never set"; KNOWN_ISSUES.md:54 KI-029 row (2026-09-19) attests exactly "committed deploy.yml never run end-to-end (manual-only, DEPLOY_* never set)". Scoped to recorded check, not fresh present-tense — honest |
| 13 | Security / cleanliness | PASS | Secret-pattern scan of line 21 (password/secret/api-key/token/PRIVATE KEY) → 0; `git status --porcelain -- Docs/10_deployment.md` → `M` only; no commit/push/prod evidence; no out-of-scope write by this review |
