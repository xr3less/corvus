# Task Report: docs09-refill-sweeper

## Status
SUCCESS

## Files Touched
- MODIFIED: Docs/09_auth_and_billing.md (§3 Billing table, two rows only: "What's billed", "Free tier / trial")
- CREATED: Agent Reports/2026-09-23-2014_docs09_MODIFY_refill-sweeper.md

## Dependencies Added
- None

## Assumptions Made
- Sourced the sweeper facts the task named and confirmed on disk, but recorded KI-035 as **still open for its other remainder** rather than claiming the sweeper closes KI-035. Reason: `Docs/KNOWN_ISSUES.md:60` lists KI-035 as two gaps — (a) deferred gateway-side bot sleep and (b) rollback repointing `prod_spec_id` without syncing `bot_runtime_config`. The sweeper closes (a) only; (b) is still live code on disk (`apps/web/app/api/spec/rollback/route.ts:102-105`). Marking KI-035 resolved would have written a claim the repo's own tracker contradicts. Escalated as an open question below.
- The task brief supplied the env name `CREEM_TEST_PRODUCT_REFILL`; that name is **not yet present in `.env.example`** (which lists only PRO/STUDIO at `.env.example:24-27`). The doc cites the name as read by the code (`refill/route.ts:163`, `webhooks/creem/route.ts:407`), which is true. The `.env.example` gap is review finding #7 and belongs to a manifest-owning task, not this docs task — see Open Questions.
- Cited `terms/page.tsx:99` for the "$5 refill pack of 1,000 credits" promise as the task specified. The full promise sentence spans lines 97-100; line 99 contains the price/grant clause.
- The file was already dirty vs HEAD before this task (uncommitted §4/§5 prose from the earlier docs wave: webhook-built paragraph, privacy/terms honesty paragraph, and the drift block). I left all of that untouched. The raw `git diff` therefore shows 7 insertions / 9 deletions across the whole file; my task's share is the two §3 rows only — proven by the isolation check in Verification below.
- Both new surfaces are **uncommitted**, so each new row carries that qualifier rather than letting a reader assume they are on `master`. `git status --porcelain apps/web/app/api/checkout/` returns `?? apps/web/app/api/checkout/` (the whole directory is untracked — `create/route.ts` too, not just `refill/route.ts`), `apps/gateway/src/runtime/sweeper.ts` is `??`, and `apps/gateway/src/gateway.ts` / `apps/gateway/src/start.ts` are ` M`. This mirrors the file's own §4 convention, which already writes "exist in the working tree, unmerged" about the webhook and its migration. Without the qualifier the two rows would contradict §4 in the same document.

## Open Questions for Orchestrator
1. **Is KI-035(a) formally closed?** The sweeper + gateway wiring are on disk and tested, so KI-035's gap (a) is built. If you want KI-035 recorded as partially or fully resolved, that is a `Docs/KNOWN_ISSUES.md` edit — outside this task's write scope (`Docs/09_auth_and_billing.md` only), so I did not make it. Recommend: narrow KI-035's text to remainder (b) only, since (a) now has a file on disk.
2. **`CREEM_TEST_PRODUCT_REFILL` is still absent from `.env.example`** (review finding #7). It needs a manifest-owning task to add the name with an empty value. Until then, `Docs/09` cites a name a fresh clone will not find in the example env.
3. **`Docs/07` surface map has no row** for the refill route or the sweeper (review finding #11). Out of this task's scope.

## Public Interface Exposed
None (docs-only task). The two doc rows now state, for the next agent:
- Refill: route `apps/web/app/api/checkout/refill/route.ts` (test host only), env `CREEM_TEST_PRODUCT_REFILL` (route.ts:163), shape `$5 / 1,000 credits / 90 days` from `terms/page.tsx:99` and `REFILL_PRICE_USD` / `REFILL_CREDITS` / `REFILL_WINDOW_DAYS` (route.ts:58-60); route opens a Creem session only and never writes `accounts.tier` or `credit_ledger`.
- Sleep: `apps/gateway/src/runtime/sweeper.ts`, wired at `start.ts:564-565` and `gateway.ts:169-174,239-245,499-501`; `SWEEPER_POLL_MS` = 60s (sweeper.ts:27), `SWEEP_GRACE_MS` = 24h (sweeper.ts:25); fail-open; KI-035 remainder (b) still open.

## Known Limitations
- Docs-only. No product code, manifest, install, or secret was touched.
- The stale sentence on the sweep being unbuilt lives only in row §3 "Free tier / trial". I did not audit the rest of the repo for the same claim — `Docs/PROJECT_STATUS.md`, `Docs/PLAN.md`, `Docs/DECISIONS.md` and `Docs/Teknik_Borc/KI-033_trial-unenforced.md` all still carry "gateway pause deferred to KI-035" language (grep-confirmed). Those are outside my write scope and need their own tasks.
- The previous review (finding #6) also suggested updating `09:32` §2; §2 (Authorization) contains no sleep claim, so nothing there was stale.

## Verification

Instrument validation first: the repo's own `git status` showed `Docs/09_auth_and_billing.md` already dirty vs HEAD before I started, so a bare `git diff` would misattribute the earlier wave's §4/§5 rewrite to me. I therefore snapshotted the file to `/tmp/09_before.md` **before** any edit and diffed against that snapshot, which isolates my change from both prettier's realignment and the pre-existing wave.

1. **Stale sentences removed.** `grep -n "no refill route exists yet\|bot sleep is deferred\|no file on disk yet" Docs/09_auth_and_billing.md` → no matches (all three gone).
2. **New facts present.** `grep -c` → `CREEM_TEST_PRODUCT_REFILL` 1, `SWEEP_GRACE_MS|SWEEPER_POLL_MS` 1, `KI-035` 1.
3. **Only table rows touched (scope proof).** `diff /tmp/09_before.md Docs/09_auth_and_billing.md | grep -E "^[<>]" | grep -vE "^[<>] \|"` → **empty**. Every changed line in my task's diff is a `|`-prefixed table row; no §4/§5 prose, no heading, no front matter was reworded.
   - **Concurrency caveat (observed, not a defect):** `find Docs -name "*.md" -newermt "-30 minutes"` shows `Docs/06_data_model.md` (20:19), `Docs/07_folder_structure_and_standards.md` (20:21) and `Docs/10_deployment.md` (20:23) also modified during my window, and all of `Docs/` is broadly dirty vs HEAD. Those are **sibling docs tasks running in parallel** (they match review findings #1/#2/#3/#11), not my writes — my only write target was `Docs/09_auth_and_billing.md` (mtime 20:22:31, matching my own prettier run). Recorded so the orchestrator does not attribute them here, and so `PLAN.md`/`00_START_HERE.md` bookkeeping accounts for all four files at the wave boundary.
4. **Prettier clean, with the collateral measured first.** `npx prettier --check Docs/09_auth_and_billing.md` → `All matched files use Prettier code style!`. The file was **not** clean before (`warn Docs/09_auth_and_billing.md`). I measured the prettier-only impact on a copy first — it is 10 diff lines, entirely re-padding the §3/§1 table separator rows so all three columns align at the widest cell; zero prose bytes change. Note this file is **not** covered by the repo's `format` script (root `package.json:16` globs `README.md .env.example .github infra …`, not `Docs/`) or by lint-staged, so "Prettier clean" here is a courtesy to the next agent, not a gate that was previously enforced. The column widths are derived only from the three §3 row lengths — no other table's width changes.
5. **Every cited file:line re-read after the edit** (not recalled):
   - `apps/gateway/src/runtime/sweeper.ts:25` → `export const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;`
   - `apps/gateway/src/runtime/sweeper.ts:27` → `export const SWEEPER_POLL_MS = 60 * 1000;`
   - `apps/gateway/src/start.ts:564-565` → `startSweeper(pool, gateway, logger)` + `gateway.attachSweeper(sweeper)`
   - `apps/gateway/src/gateway.ts:169,174,241,243,499,500` → sweeper doc comment, `attachSweeper` signature, handle, implementation, and teardown `sweeper?.stop()` (gateway stops it first so no tick races teardown)
   - `apps/web/app/api/checkout/refill/route.ts:58-60` → `REFILL_PRICE_USD = 5` / `REFILL_CREDITS = 1000` / `REFILL_WINDOW_DAYS = 90`
   - `apps/web/app/api/checkout/refill/route.ts:163` → `process.env.CREEM_TEST_PRODUCT_REFILL`
   - `apps/web/app/api/checkout/create/route.ts:137` → `process.env.CREEM_TEST_PRODUCT_PRO` (unchanged citation, still accurate)
   - `apps/web/app/terms/page.tsx:99` → `A $5 refill pack of 1,000 credits,`
   - `apps/web/app/api/spec/rollback/route.ts:102-105` → `DELETE FROM bot_runtime_config … INSERT INTO bot_runtime_config` (the live KI-035 remainder)
6. **Route-count claim checked, not assumed.** `ls apps/web/app/api/checkout/` → `create`, `refill`, `success`. The old row's "the only checkout route on disk creates Pro sessions" is false; the new row says "Both checkout routes exist, test-mode only", which the listing supports.
7. **Commit state checked before claiming "exists".** `git status --porcelain apps/web/app/api/checkout/` → `?? apps/web/app/api/checkout/` (whole directory untracked, `create/route.ts` included); `?? apps/gateway/src/runtime/sweeper.ts`; ` M apps/gateway/src/gateway.ts`, ` M apps/gateway/src/start.ts`. Both rows therefore say "working tree and unmerged", matching §4's existing convention for the webhook.
8. **No secrets.** Grep for the env names returns *names and empty values only*; no Creem product id, no API key, no token value was read, printed, or written. No secret file was opened.

## Safety
HEAD `d9cf8d7` untouched; no `git restore`/`checkout`/`stash`/`reset`/`commit`/`push` was run. No production box, GHCR, or live key was contacted. No `package.json`, lockfile, or `.env*` was edited. No install command was run — the only `npx` calls were read-only `prettier --version`, `--check`, and `--write` against the one in-scope doc.
