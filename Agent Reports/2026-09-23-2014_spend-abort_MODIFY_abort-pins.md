# Task Report: spend-abort-pin

## Status
SUCCESS (with a corrected brief premise — see "Brief Premise Correction" below)

## Files Touched
- MODIFIED: apps/web/app/api/chat/route.test.ts (`abortedChatRequest` helper + 2 pins; net +151 lines, 823 → 974)
- UNTOUCHED (verified byte-identical to pre-task state): apps/web/app/api/chat/route.ts — SHA256 `8c5d0586…` before and after, diffstat identical to the pre-existing wave (110 insertions / 11 deletions), zero break markers left.
- CREATED: Agent Reports/2026-09-23-2014_spend-abort_MODIFY_abort-pins.md

## Dependencies Added
None.

## Brief Premise Correction (read this first)
The brief's premise — "turns ending without a done frame write NO ai_spend row, so monthly SUM undercounts; the existing route.test.ts:326-345 locks no-write" — describes **HEAD (`d9cf8d7`)**, not the working tree this task ran in. The working tree carries an **uncommitted spend wave** that has already implemented M-11 and inverted the direction:

- HEAD `route.ts:370-374` — `if (done) { await recordChatSpend(...) }` with **no else branch at all**. That is the no-write behavior the brief describes; an abort or a mid-stream throw genuinely wrote nothing.
- Working-tree `route.ts:450-473` — an `else if (reservationId === null)` branch writes an estimated row on abort (`credits = PERSONA_RESERVE_CREDITS`) or a NULL `usage-unavailable` row on throw.

So in the tree this task actually ran in, the undercount hole is **already closed**, and the residual mismatch is the mirror risk the brief did not name: an estimate that can be too **HIGH** for a turn the provider never billed. I did NOT treat this as a reason to stop — the brief's own instruction was to pin the current contract and defer the product call, and "current" means the working tree. I pinned what is actually on disk and documented the reversal in both tests. Product decision (warn vs backfill) remains deferred, exactly as briefed; spend logic untouched.

### Cited line numbers are HEAD-relative and off by 8–16 in the working tree
| Brief cite | Working-tree actual |
|---|---|
| route.ts:378 (budget check) | route.ts:378 is inside the `checkBudget` call region; the gate check begins ~:378 but the reserve call is :419 |
| route.ts:372-377 (spend logic) | the in-flight spend logic is :450-473 |
| SUM :124-126 | SUM is :134-136 (`SPENT_CREDITS_SQL`) |
| test :326-345 | in the working tree that region is the persona-prompt test (:311-343) |

## What the two pins lock
1. `writes an estimated spend row when the stream starts on an aborted request` — aborted `req.signal`, lane yields nothing at all; asserts 200 + empty frame list, exactly 2 INSERT attempts (rejected hold + landed abort fallback), the fallback row carrying `usd_cost = RESERVE_CREDITS * USD_PER_CREDIT` / `credits = RESERVE_CREDITS`, zero UPDATEs, and the reserve-failure log line.
2. `writes exactly one estimated row when the provider throws mid-stream despite the abort` — content on the wire then a throw; asserts the m-25 error frame + logged cause, 2 INSERT attempts, and the abort branch winning over the throw branch (`params[2]` is the reserve estimate, not null).

Both carry an M-11 header comment naming the deferred product call (warn vs backfill) and instructing that no assertion be "fixed" to match a future decision before that decision is made.

## Assumptions Made
- **The working tree, not HEAD, is the contract to pin.** The brief's own scope note (`HEAD d9cf8d7`) reads as provenance for the task, but the acceptance criterion says "pin M-11's current contract" and the deliverable is a lock on present behavior. Pinning HEAD's no-write behavior would have asserted something false about the code on disk and would have failed immediately against `route.ts:450-473`.
- `req.signal.aborted` is reachable in a Vitest unit test — **validated empirically before writing**, not assumed: a fired `AbortController.signal` passed to `new Request(...)` reads back `aborted === true`, while a live one reads `false`. Instrument validated before use.
- `failReserveOnly: true` is the correct way to reach the abort fallback branch (see Guard-Break A — this was a real defect in my first draft).

## Open Questions for Orchestrator
1. **Brief premise was stale.** The wave that implemented M-11 is uncommitted (route.ts 110/11 dirty vs HEAD; test file 371/25 including other tasks' work). If the orchestrator believed the abort path still wrote nothing, that belief came from HEAD. Worth confirming whether the M-11 wave is intended to land before this wave's pins are reviewed — the pins are written against the dirty tree and would fail against a HEAD checkout of route.ts.
2. **The brief's "undercount" framing is inverted in the tree.** The live residual risk is overcount (an estimate held for a turn the provider never billed), which is precisely the deferred warn-vs-backfill question. If the product call later lands as "backfill", test 2's `params[2]` assertion is the one to revisit first (it currently pins the reserve estimate for an aborted throw).
3. **Pre-existing red in the full web suite is unrelated to this task** (attribution evidence in Verification §7–8). Someone owns those: `components/ui/ai-chat-input.test.tsx` (fails in isolation too), `app/dashboard/bots/[id]/page.test.tsx`, `app/api/spec/rollback/rollback.test.ts`, `app/api/spec/publish/publish.test.ts`, `app/page.test.tsx`, plus `app/auth/error/page.test.tsx` (untracked).

## Public Interface Exposed
None — test-only. One new local test helper: `abortedChatRequest(body: unknown): Request` (module-private, not exported).

## Known Limitations
- The pins lock **behavior at the mock boundary**; they do not exercise a real provider abort or a real Postgres. The pool is stubbed by design, so `reserveChatSpend`/`recordChatSpend`/`trueUpChatSpend` are observed through recorded SQL, never executed.
- The abort is fired **before** `POST` is called (a signal already dead at stream `start()`). A mid-flight abort (client hangs up while frames are streaming) is not covered — the route's `cancel()` is a documented no-op and the disconnect propagates through the lane, which the mock cannot reproduce.
- `typecheck` and full-tree `lint` are **not globally green in this tree for reasons outside my scope** — attributed below, not silently skipped.

## Verification (exact commands + results)

1. **Scope verified on disk before editing**: `route.ts:378` + `:372-377` (brief cites) → working tree has the spend logic at `:450-473`; `SUM :124-126` → `SPENT_CREDITS_SQL` at `:134-136`; `test :326-345` → working tree region is `:311-343`. HEAD's `route.ts:370-374` confirmed to have **no else branch** (`git show HEAD:…`), i.e. the brief described HEAD.

2. **Baseline before editing**: `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → **33 passed (33)**. Backed up outside the repo as `$TEMP/route-test-backup-2014.ts`, SHA256 `257ea6d2…`; route.ts as `$TEMP/chat-route-backup-2014.ts`, SHA256 `8c5d0586…`. No git stash/checkout/restore/reset used at any point.

3. **Suite after pins**: `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → **35 passed (35)** (33 baseline + 2 new).

4. **Guard-Break A — silent drop** (the billing hole the pins exist to catch): replaced `await recordChatSpend(fallback, …)` with `void fallback;` in the abort branch → **3 failed / 32 passed** (both new pins **and** the pre-existing mid-stream-throw test). Restored from the outside-repo backup; SHA256 re-verified `8c5d0586…`; zero break markers.
   - **This break caught a real defect in my own first draft.** My initial pins used the default pool, where the reserve hold lands (`reservationId !== null`), so the abort fallback branch **never executed** — and both pins still passed with the write deleted. They were asserting the hold-kept path while claiming to test the abort path. Fixed by forcing `failReserveOnly: true` so each pin genuinely reaches `else if (reservationId === null)`, and by asserting the **second** INSERT by index with `toHaveLength(2)`. Re-broken after the fix to confirm: same 3 failures, now including both pins for the right reason.

5. **Guard-Break B — drop the abort check**: `req.signal.aborted` → `false` in the fallback ternary → **2 failed / 33 passed**, failing **exactly the two new pins and nothing else** — correct discrimination, since the non-aborted throw path is covered by pre-existing tests. Restored, hash re-verified.

6. **Guard-Break C — double-charge**: duplicated the `recordChatSpend(fallback, …)` call → **3 failed / 32 passed** (both new pins + the pre-existing throw test). Restored, hash re-verified, `grep BREAK-INSTRUMENT route.ts` → 0.

7. **Gates on my file**: `npx --prefix apps/web eslint apps/web/app/api/chat/route.test.ts` → **exit 0, zero warnings**. `npx --prefix apps/web prettier --check apps/web/app/api/chat/route.test.ts` → **clean**.

8. **Full web suite**: `npm run test --workspace @corvus/web` → **922 passed / 924 (2 failed)**, run-to-run varying (observed 3, then 4, then 2 failures across runs — flaky). **Zero chat-route failures in every run** (`grep "FAIL.*chat/route"` → 0).

9. **Attribution of the pre-existing red** (all five methods agree it is not mine):
   - Every failing file is dirty or untracked from other waves: `git status --porcelain` → `M` on `ai-chat-input.test.tsx`, `bots/[id]/page.test.tsx`, `rollback.test.ts`, `publish.test.ts`, `page.test.tsx`; `??` on `app/auth/error/page.test.tsx`.
   - My file imports none of them (`grep -cE "page.test|publish.test|rollback.test"` → 0).
   - `rollback.test.ts` passes **23/23 in isolation**; `auth/error/page.test.tsx` passes **7/7 in isolation** — full-suite-only failures = concurrency flakes.
   - `ai-chat-input.test.tsx` fails **3/19 in isolation** too → a genuine pre-existing failure in another wave's work.
   - **Decisive**: swapped my file to its HEAD version and re-ran the full suite → **899 passed / 907, 8 failed**, including **7 chat-route failures** (HEAD's test file is incompatible with the working tree's spend wave). My version in place → 33 → 35 green and 0 chat failures. Typecheck attribution likewise: with my file at HEAD, `tsc --noEmit -p apps/web/tsconfig.json` still fails **only** in `apps/web/app/api/spec/rollback/rollback.test.ts` (TS2345 `BootRow`/`RuntimeRow`), unchanged — pre-existing, not mine.
   - Tree lint is red only in `apps/web/lib/demo/brain.test.ts` (3 unused-var errors), a file I never touched.

10. **Secret scan of my diff**: only `WIRO_API_KEY = 'test-key'` placeholders (pre-existing pattern in the same file). No credentials, no `.env` edits, no manifest/lockfile edits.

11. **No destructive git**: no `stash`/`checkout`/`restore`/`reset`; no commit. All restores were `cp` from `$TEMP` backups, hash-verified before and after.

### Process note (my error, disclosed)
During the attribution check I ran `cp "$TEMP/route-test-backup-2014.ts" "$TEMP/route-test-mine-2014.ts"` — accidentally **clobbering my own work-in-progress backup with the pristine baseline**, then restored that over my edited file. My edits were lost mid-task (detected immediately: hash `257ea6d2…`, `grep abortedChatRequest` → 0). I re-applied both edits from the version that had already passed all three guard-breaks, then re-ran all three guard-breaks on the re-applied file (all confirmed again) plus the full battery. No damage to the deliverable — the shipped file is the re-applied version, hash `25a0dcf7…` — but the lesson is real: **never write two backup roles into one filename; the "mine" copy and the "pristine" copy must be different names.**
