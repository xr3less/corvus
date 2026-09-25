# Task Report: reviewer-docs09-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2031_reviewer_REVIEW_docs09.md
- MODIFIED: none

## Dependencies Added
- None

## Assumptions Made
- The builder's `/tmp/09_before.md` snapshot (mtime 2026-09-23 20:21:04) is trusted as the pre-edit baseline for scope isolation; I re-ran the isolation diff myself rather than trusting the builder's quoted output.
- The concurrent rollback sync fix in `apps/web/app/api/spec/rollback/route.ts` (uncommitted, vs HEAD) is attributed to a parallel task, not to this docs task — this task touched only `Docs/09_auth_and_billing.md` (proven by snapshot diff).
- `Docs/KNOWN_ISSUES.md` KI-035 row text ("Open", two gaps) is the tracker's standing position at review time; the doc row was judged against it.

## Open Questions for Orchestrator
1. **Who wrote the §3 Provider row?** Between the builder's snapshot (20:21:04) and now, the Provider row gained the checkout-session/success-view citations — a content change, not prettier padding. The builder reported "two rows only". Either the builder under-reported, or a concurrent writer touched §3 after 20:22:31 (file mtime is 20:24:22). Content is accurate (all anchors verified, see table), so no rework needed — but attribution matters for `PLAN.md` bookkeeping. See F1.
2. **KI-035 remainder sentence vs the concurrent rollback fix.** The new Free-tier row says "rollback repoints `prod_spec_id` without syncing `bot_runtime_config`" anchored at `rollback/route.ts:102-105`. In the current working tree those exact lines ARE the new `syncRuntimeRows` DELETE+INSERT (the parallel fix), so the sentence describes HEAD behavior, not working-tree behavior. It matches `KNOWN_ISSUES.md` KI-035 text, so it is tracker-consistent — but once the rollback task's review lands, this doc sentence (and the KI-035 row) needs rewording to describe the synced behavior. Recommend a follow-up docs touch after the rollback wave closes. See F2.
3. **`CREEM_TEST_PRODUCT_REFILL` absent from `.env.example`** — confirmed (grep: name appears only in `refill/route.ts:163` and `webhooks/creem/route.ts:407`, no `.env.example` hit). Needs a manifest-owning task, as the builder already escalated. No action for this task.

## Public Interface Exposed
None (review-only task; docs-only change under review).

## Known Limitations
- Review verified anchors and file states; did not run typecheck/lint/tests (docs-only change, no product code touched by this task).
- `success/route.ts` "writes nothing" claim: anchor `:46` verified to exist (message const); full-route write-absence asserted from the file's evident receipt-view shape, not an exhaustive data-flow audit. The sentence lives in the Provider row (see F1), outside the builder's claimed scope.
- Rollback HEAD-vs-worktree analysis is based on `git diff` + working-tree reads, not on the parallel rollback task's report (outside whitelist).

## Verification

| # | Claim | Check performed | Result |
|---|-------|-----------------|--------|
| 1 | Stale sentences gone | `Grep "no refill route exists yet\|bot sleep is deferred\|no file on disk yet" Docs/09_auth_and_billing.md` → no matches; snapshot diff confirms the before-rows contained "no refill route exists yet" (What's billed) and "no file on disk yet" (Free tier), both replaced | PASS |
| 2 | Refill facts + anchors | `refill/route.ts:58-60` → `REFILL_PRICE_USD = 5` / `REFILL_CREDITS = 1000` / `REFILL_WINDOW_DAYS = 90`; `:163` → `process.env.CREEM_TEST_PRODUCT_REFILL`; `terms/page.tsx:99` → "A $5 refill pack of 1,000 credits," (sentence spans 97-100, anchor lands in it); `create/route.ts:137` → `CREEM_TEST_PRODUCT_PRO`; test-host-only confirmed (`CREEM_TEST_API_BASE`, no live branch); row states route "only opens the Creem session and never writes `accounts.tier` or `credit_ledger`" | PASS |
| 3 | Sweeper facts + anchors | `sweeper.ts:25` → `SWEEP_GRACE_MS = 24 * 60 * 60 * 1000`; `:27` → `SWEEPER_POLL_MS = 60 * 1000`; `start.ts:564-565` → `startSweeper(pool, gateway, logger)` + `gateway.attachSweeper(sweeper)`; `gateway.ts:169-174` (interface doc + signature), `:239-245` (handle + attach), `:499-501` (teardown stop-first) all verified by read; fail-open documented in `sweeper.ts:11-15` ("a corrupt trial clock never sleeps a bot") | PASS |
| 4 | Uncommitted qualifiers accurate | `git status --porcelain` → `?? apps/web/app/api/checkout/` (whole dir untracked; `ls` shows `create`, `refill`, `success`), `?? apps/gateway/src/runtime/sweeper.ts`, `M apps/gateway/src/gateway.ts`, `M apps/gateway/src/start.ts`. Doc says "working tree and unmerged" / "sweeper new and unmerged, the two wiring files modified in the working tree" — matches exactly, mirrors §4's existing webhook convention | PASS |
| 5 | Scope isolation (§4/§5 untouched by this task) | Re-ran `diff /tmp/09_before.md Docs/09_auth_and_billing.md`; every changed line is a `\|`-prefixed §3 table row (non-table-line filter → empty). §4/§5 deltas vs HEAD and the drift-block removal predate the snapshot (present in before-file), i.e. belong to the earlier wave, not this task | PASS with F1 |
| 6 | Prettier clean; Docs not in format gate | `npx prettier --check Docs/09_auth_and_billing.md` → "All matched files use Prettier code style!". Root `package.json:16-17` format globs list README/.env.example/.github/infra etc., not `Docs/` — so clean status is courtesy, correctly characterized by builder | PASS |
| 7 | KI-035 not falsely closed | Doc says "KI-035 stays open for its other remainder"; `KNOWN_ISSUES.md:60` still lists KI-035 Open. Builder correctly recorded sweeper as closing gap (a) only, without editing the tracker (outside scope) | PASS with F2 |

## Findings (non-blocking)
- **F1 (minor, reporting accuracy): §3 Provider row changed but unreported.** Snapshot-vs-current diff hunk `28,32c28,32` covers Provider + What's billed + Free tier rows (plus separator re-padding). The builder's report claims "two rows only". The Provider row's added text (checkout session route test-mode-only with `create/route.ts:13-15,36`; success receipt view with `success/route.ts:46`) was spot-verified: anchors resolve (`:13-15` test-host comment, `:36` base const, `:46` message const). Accurate content, but the orchestrator should confirm authorship for wave bookkeeping.
- **F2 (watch item, concurrency): KI-035 remainder anchor points at the fix.** `rollback/route.ts:102-105` in the current working tree is the new `syncRuntimeRows` DELETE+INSERT from the parallel (uncommitted) rollback fix — i.e. the working tree now syncs `bot_runtime_config` in the same transaction (verified: pointer move + audit row + `syncRuntimeRows` + COMMIT in `route.ts:276-298`, header comment "all three in one transaction"). The doc sentence "repoints without syncing" is therefore accurate vs HEAD but stale vs the working tree. No builder fault (out of scope, possibly landed mid-task); flag for a doc follow-up once the rollback task closes, together with narrowing the KI-035 tracker row to any true remainder.

## Safety
No `git restore`/`stash`/`checkout`/`reset`/`commit`/`push` run. No prod, no secrets touched (env names only, no values). Only in-scope CREATE (this report). Reads + `git status`/`git diff`/`ls`/`grep` + read-only `prettier --check` otherwise.
