# Task Report: reviewer-docs07-2014

## Status
FAIL — one factual error in a newly added row (migrate row misstates deploy.yml). All other claims verify. Single-sentence fix required, then PASS.

## Files Touched
- CREATED: Agent Reports/2026-09-23-2031_reviewer_REVIEW_docs07.md
- MODIFIED: none

## Dependencies Added
- None

## Assumptions Made
- Accepted the builder's stated baseline (211-line worktree, not 199-line HEAD) for the additive-only check. HEAD is behind because prior agents' uncommitted edits to this same file were already on disk. The vs-HEAD diff therefore conflates earlier waves' legitimate changes (KI-031 drift-note removal, clone-pryzm deletion, compose.yml rename, etc.) with this builder's +11 rows; judged the builder only on its own 211→222 delta.
- Did not re-run typecheck/lint/test: docs-only change, no code touched. Prettier check is the applicable gate and was run.

## Open Questions for Orchestrator
- Fix decision needed on Finding F1 (deploy.yml sentence): correct the row in place (one-sentence edit, recommended) or accept the inaccuracy and downgrade to a docs nit. One fix agent, trivial scope.
- Builder's Open Questions (deploy gap, untracked migrations, `.env.example` refill entry) remain with their owners; F1 below partially moots the deploy-gap question — the gates ARE in sync, so reviewer finding #10 as described by the builder does not exist in the form stated.

## Public Interface Exposed
None. Docs-only review; no code interface.

## Known Limitations
- The 211-line pre-builder baseline was not independently recoverable (no commit, no backup); the "zero rows removed by this builder" half of additive-only rests on the builder's documented assumption plus consistency evidence (current 222 = 211 + 11, all HEAD topics still present), not on a direct before/after diff of the builder's own edit.
- Did not boot the app or run the test suite; nothing in this change is executable.

---

## Verification table

| # | Claim under test | Method | Result |
|---|---|---|---|
| V1 | 8 file-map rows added (§1) | Read Docs/07 on disk | PASS — all present: refill `route.ts` (:54), webhooks dated re-verify (:55), 0012 (:80 in file order :80–81), 0013, `migrate.mjs`, `sweeper.ts`, `tickets/`, `reaction-roles/` (:82–86). Net line delta 211→222 = +11, consistent with "8 + 4 − 1 update" |
| V2 | 4 surface-map rows added | Read Docs/07 §surface map | PASS — `Kredi dolumu` (:122), `Bot uyku/uyanma` (:123), `Ticket sistemi` (:124), `Rol seçici` (:125), all with plausible route/file cells |
| V3 | Every cited path exists on disk | Glob (no memory) | PASS — `apps/web/app/api/checkout/**/*.ts` (create/success/refill + test), `sweeper.ts` + `sweeper.test.ts`, `tickets/handler.ts` + `tickets.test.ts`, `reaction-roles/handler.ts` + `reaction-roles.test.ts`, `drizzle/0011/0012/0013`, `scripts/migrate.mjs`, `webhooks/creem/route.ts` + `route.test.ts` |
| V4 | Line anchors plausible | Read/Grep each anchor | PASS — `CREEM_TEST_PRODUCT_REFILL` at refill `route.ts:163` (exact); REFILL_* consts `:58-60` (exact); 0012 `UNIQUE NULLS NOT DISTINCT` + 6-value fence (exact); 0013 `DROP IF EXISTS + ADD`, 6→8 (exact); migrate journal+sha256+lock+`--check` `:15-16,:23-28` (exact); `RUNTIME_KINDS` 8-tuple `config.ts:11-20` (exact); `botRuntimeConfig` catalog `schema.ts:99-120` (cited :113 inside block, ok); `startSweeper` import `start.ts:45` + start call `:564` (exact); gateway handle `gateway.ts:241-246,499-501` (matches, ±2 lines); `boot-modules.ts:35-36` ticket/reaction registration (exact); `discord.js ^14.27.0` (exact); `ci.yml:38` migrate step (exact) |
| V5 | Additive-only, section order, pre-existing rows intact | Read + `git diff --ignore-all-space` | PASS (with noted assumption) — `## 1…## 7` order unchanged; all HEAD topics still present in worktree file; vs-HEAD deletions are prior waves' legitimate edits (drift-note removal, clone-pryzm deletion, compose rename), not this builder's. Builder's own delta adds rows; no evidence of removal |
| V6 | `prettier --check` clean | Ran `npx prettier --check Docs/07_folder_structure_and_standards.md` | PASS — exit 0, "All matched files use Prettier code style" |
| V7 | `git status` diff audit: only map rows | `git status --porcelain` + diff | PASS (scoped) — `M Docs/07…md` is this builder; `??` entries (0011/0012/0013, `migrate.mjs`, `webhooks/`, `checkout/`) are other agents' uncommitted work, correctly NOT touched by this builder (no restore/stash/checkout/reset ran) |
| V8 | Untracked caveat correctly documented | `git ls-files` vs doc text | PASS — `git ls-files apps/gateway/drizzle/` lists only 0001–0010; doc stamps 0011/0012/0013 + `migrate.mjs` "untracked, `??`" with 2026-09-23 date; webhooks `??` stamped with re-verified date. (Also found: entire `apps/web/app/api/checkout/` is `??`/untracked — doc says "unmerged", which covers it adequately.) |
| F1 | Migrate row: "deploy.yml gates do NOT yet include the step, despite its header claiming the same gate order" | Read `deploy.yml` + `ci.yml` on disk | **FAIL — factually wrong.** `deploy.yml:74-75` runs exactly `node apps/gateway/scripts/migrate.mjs` ("Migrate (journaled runner over empty CI DB)"), in the same gates-job position as `ci.yml:38`. The header's "same gate order" claim is TRUE as of disk state. The sentence must be corrected, e.g. to: "CI runs it (`ci.yml:38`); `deploy.yml` gates run the same step (`deploy.yml:74-75`) against a throwaway DB — neither migrates the live DB (explicit hand-run per RUNBOOK §7.2.5)." Same correction applies to the builder report's Open Question repeating the gap. |
| N1 | Minor imprecision (not a fail) | Glob | NOTE — sweeper row cites `sweeper.test.ts` (correct); tickets row cites `tickets.test.ts` (correct); reaction-roles row cites `reaction-roles.test.ts` but the file on disk is `reaction-roles/reaction-roles.test.ts`. Harmless; fix opportunistically with F1. |

## Required fix (for the fix agent)
- In `Docs/07_folder_structure_and_standards.md`, `apps/gateway/scripts/migrate.mjs` row: replace the clause "`deploy.yml` gates do NOT yet include the step, despite its header claiming the same gate order" with a correct statement per F1 above (deploy.yml:74-75 has the identical step; live-DB migration stays manual per RUNBOOK §7.2.5). Optionally fix the `reaction-roles.test.ts` → `reaction-roles/reaction-roles.test.ts` filename in the same edit. Re-run `npx prettier --check` on the file after the edit.

SECURITY: no code, prod, secrets, or git-restore surface touched; reads only (`Read`, `Glob`, `Grep`, `git status`/`ls-files`/`diff`/`show`, `prettier --check`). HEAD untouched.
