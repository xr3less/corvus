# Task Report: reviewer-rollbackkinds-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2045_reviewer_REVIEW_rollbackkinds.md
- MODIFIED: nothing
- DELETED: nothing

## Dependencies Added
- None

## Assumptions Made
- The builder's "prod route untouched" claim is scoped to its own task window (2014 task): verified by mtime + zero new-identifier hits. The working tree DOES contain uncommitted route.ts changes vs HEAD from a prior wave (runtime-row sync) — flagged below, not blamed on this task.
- `package-lock.json` shows as modified vs HEAD but its mtime (2026-09-20 11:09) predates this task; pre-existing, not this task's doing.
- No full-suite run by me: the criterion requires honest attribution only "if run". The focused evidence (23/23 + 52/52 pairing, each re-run by me) isolates this task; the builder's full-suite numbers are assessed from its report.
- No prod re-mutation performed per scope; guard-break adequacy assessed by code read plus my own clean runs (no mutation cycles run at all).

## Open Questions for Orchestrator
1. **Tree-vs-HEAD route.ts diff (prior wave, NOT this task — needs correct attribution).** `git diff HEAD -- apps/web/app/api/spec/rollback/route.ts` shows +87/-~22 uncommitted lines: translator import from publish route, `__setTranslator` seam, `syncRuntimeRows` DELETE+INSERT, `spec` column added to target select, runtime-row sync inside the transaction. Route mtime is 2026-09-23 01:46, ~19h before the 2014 task window (test file mtime 20:43, builder report 20:44), and route.ts contains zero hits for any 2014-task identifier. Conclusion: the 2014 task did not touch the route; the diff belongs to the earlier runtime-sync wave that the test comments describe ("Before this fix rollback moved prod_spec_id..."). If any gate reads "prod route untouched" as "route.ts == HEAD", that reading is FALSE at tree level — true only task-scoped. Recommend the orchestrator verify that prior wave's route diff has its own review before merge.
2. **Pre-existing full-suite failure (not this task).** Builder records `app/dashboard/bots/[id]/page.test.tsx > shows the attachment count...` failing identically in isolation with zero reference to rollback.test.ts. I did not re-run the full suite to re-confirm; if the merge gate needs a clean tree number, that file needs its own owner/wave.
3. **Follow-ups the builder correctly left open (no action for this task):** (a) `NOT VALID` on the FALLBACK_DDL re-assert vs current loud-canary validating ADD (Open Question 1 of builder report); (b) `rollback/route.ts:18`-era header comment and `Docs/06_data_model.md` §5 / `Docs/10_deployment.md` / `PLAN.md:195` 6-vs-8 doc drift. All doc/comment-only, outside both scopes.

## Public Interface Exposed
None. Read-only review; no code added. No exported surface.

## Known Limitations
- Guard-breaks A/B/C/D were verified structurally by code read (exact failing assertions, failure messages, and cross-file race reasoning all read off disk) plus my own clean focused/pair runs — per scope I did not re-mutate the working copy to re-prove the breaks. The builder's report documents the mutation cycles with hash-verified restore; I take that procedural claim on record, not on re-execution.
- Full web suite not re-run by me (moving tree, concurrent waves per builder §3 instrument caveat); no full-suite number is asserted in this report.
- Next.js AGENTS.md docs path: confirmed `apps/web/node_modules/next` absent, repo-root `node_modules/next/dist/docs/` present (`01-app`, `02-pages`, `03-architecture`, `04-community`, `index.md`). Test-only task; no guide load-bearing. No block.

## Verification

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | FALLBACK_DDL 8 kinds + DROP/ADD re-assert mirroring 0013 | PASS | rollback.test.ts:117-129 CHECK lists all 8 (`'tickets', 'reaction-roles'` at :126); :133-135 DROP IF EXISTS + ADD pair; 0013:12-14 identical pair with same 8 literals |
| 2 | MIGRATION_SOURCES includes 0013 | PASS | rollback.test.ts:148-158, 0013 entry at :157 with rationale comment; WIDENING_MIGRATION pinned separately at :162 |
| 3 | RUNTIME_KINDS_8 / expectKindSet / alias blocks at claimed lines | PASS | `RUNTIME_KINDS_8` at :318 (matches claim); `expectKindSet` at :338 (matches); `ALIAS_DIRECTION_CASES` at :393 (matches); `describe 8-kind vocabulary` at :453 (matches); `describe widening-migration pins` at :500 (matches); DB cases at :900 and :981 (match); source-pin asserts at :501-505, disk-read at :508-521 (claim said :500-523 — inside, PASS) |
| 4 | 8-kind truth corroborated off disk | PASS | config.ts:11-20 all 8 incl. tickets + reaction-roles; schema.ts:111-114 same 8 in CHECK; 0013:14 same 8; publish/route.ts:67-76 same 8 (`export type RuntimeKind` is :78 as builder noted — brief's ":66-78" corrected to ":66-76", accurate); builder-prompt.ts:19 same 8 kinds in prompt line |
| 5 | Prod route untouched by THIS task | PASS (task-scoped; see OQ1) | route.ts mtime 2026-09-23 01:46 vs test 20:43 / report 20:44; `grep -c` for RUNTIME_KINDS_8/expectKindSet/ALIAS_DIRECTION_CASES/WIDENING_MIGRATION/0013_runtime_kinds in route.ts = 0 (zero hits confirmed) |
| 6 | Focused suite 23/23 by MY run | PASS | `npx vitest run app/api/spec/rollback/rollback.test.ts` → 1 passed, 23/23, exit 0; `--reporter=verbose` shows all 23 `✓`, zero skips; `grep -c "it("` = 23; 16+7 new (3 vocab + 2 source pins + 2 DB) = 23 arithmetic holds |
| 7 | Typecheck exit 0 | PASS | `npx tsc --noEmit` from apps/web, exit 0 (my run) |
| 8 | ESLint zero warnings | PASS | `npx eslint app/api/spec/rollback/rollback.test.ts --max-warnings 0`, exit 0 (my run) |
| 9 | Prettier clean | PASS | `npx prettier --check` → "All matched files use Prettier code style!", exit 0 (my run) |
| 10 | Guard A (0013 source pin) adequate | PASS (code read) | :501-505 asserts `MIGRATION_SOURCES` contains WIDENING_MIGRATION + substring match; any removal fails exactly that `it`. Fallback-masking rationale documented at :494-499. Structurally certain |
| 11 | Guard B (8-kind fence, 12-fail mode) + diagnostic adequate | PASS (code read) | `expectKindSet` (:338-363) reads live `pg_get_constraintdef`, quoted-literals-only regex, asserts sorted set equality AND length, failure message names 0012-vs-0013 drift + applied/unreadable source split (:349-358). Fence-first ordering at :913 precedes INSERT — drift surfaces as name, not bare PG error. Builder's recorded 12-fail mode under 6-kind narrowing is consistent with this structure |
| 12 | Guard C (message names drift) adequate | PASS (code read) | Message text at :353-357 explicitly states "0012's pre-0013 DDL ... widening never reached this database — the two E1 kinds (tickets, reaction-roles) cannot be stored" plus fence/expected/actual/applied/unreadable context. Names drift by construction |
| 13 | Guard D (52/52 pairing) | PASS (my run) | `npx vitest run rollback.test.ts publish.test.ts` → 2 files passed, 52/52, exit 0 (my run 20:49). Confirms no cross-file fence race from the TEMP-table design |
| 14 | Own-draft defect fix (TEMP table, no txn) sound | PASS (code read) | :981-1039: session-scoped TEMP table, identical 6-then-8 IN-list CHECK, no transaction (rationale at :995-1000: violation aborts txn → poisons pooled conn), both E1 kinds rejected under 6 + six 0012 kinds accepted + both admitted after widen, `DROP TABLE` in finally, real-table fence re-pinned at :1038. Blast-radius reasoning (parallel vitest workers, shared DB, publish.test.ts writes E1 rows) is correct; `NOT VALID` alternative correctly left as follow-up, not required |
| 15 | No secrets in diff | PASS | `git diff HEAD -- rollback.test.ts` grepped for password/secret/api-key/token_cipher/private-key/AKIA/ghp_/sk-/Bearer → zero hits (my run) |
| 16 | No manifest/lockfile edits by this task | PASS | Builder touched only the test file; package-lock.json M flag predates task (mtime 9/20). No install commands in scope; none run by me |
| 17 | Full-suite numbers honest | N/A (not run by me) | Builder reported both observations (906/907 @62 files, then 926/927 @63) with concurrent-wave instrument caveat + isolation rerun of the unrelated bots/[id] failure. Honest attribution; no stable-number claim made. No blame assigned to this task — accepted on record |

### Summary judgment
The builder's claims check out line-for-line against disk: every cited line number landed, the 8-kind truth is a genuine 5-way on-disk agreement (config, schema, 0013, publish route, builder prompt), all four gates pass on my own runs (23/23 focused, 52/52 pairing, tsc/eslint/prettier exit 0), and the guard design is structurally sound with the cross-file race correctly neutralized via TEMP table. The single correction for the orchestrator: "prod route untouched" is true task-scoped but FALSE tree-vs-HEAD (prior wave's runtime-sync diff is uncommitted in route.ts) — merge readiness of route.ts belongs to that wave's review, not this one.
