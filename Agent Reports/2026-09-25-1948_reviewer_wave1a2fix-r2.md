# Review: wave1a2fix DELETE ownership (re-review, r2)

## Verdict

PASS — the blocking DELETE ownership defect is fixed; no regressions found.

## Files Confirmed on Disk

- `apps/web/app/api/conversations/[id]/route.ts` — present, DELETE handler loadOwned-first (lines 386-402).
- `apps/web/app/api/conversations/[id]/route.test.ts` — present, stateful fake + 5 DELETE tests (lines 373-437).

## 1. Fix (code-read, not report-trust)

- `loadOwned(id, session.accountId)` runs FIRST inside the try block (route.ts lines 390-393), before ANY `DELETE` query. `owned === null` (unknown/malformed already 404'd at line 382; foreign id yields null via `readOwned` account check) returns 404 with zero DELETEs issued — the foreign-DELETE test asserts `pool.queries` contains no `DELETE FROM` string, and the fake is now stateful so a pre-fix ordering would visibly empty `liveTurns` and fail that assertion.
- Owned + soft-deleted bot → 200: DELETE checks only `owned === null`, deliberately NOT `owned.botDeleted` (lines 387-393 comment states orphaned-thread cleanup). This matches the fix report's stated policy and the migration (no `deleted_at` on conversations). GET (line 244) and POST (line 308) keep the stricter `owned === null || owned.botDeleted` → 404, so the asymmetry is intentional and documented.
- Order after the guard is turns-then-conversation (lines 397-398), with a rowCount check on the account-scoped conversation delete (lines 399-401) as a second ownership net. Residual risk (crash between the two DELETEs leaves turns deleted under a live conversation) is acknowledged in the fix report and is NOT a cross-account leak — both deletes are now ownership-gated. Non-blocking.
- Turn-delete SQL itself remains unscoped (`DELETE_TURNS_SQL ... WHERE conversation_id = $1`, line 198) — safe only because of the loadOwned-first gate. Any future refactor must preserve the gate before this statement.

## 2. Tests + gates (run by this reviewer, exact outputs)

- `npx vitest run "app/api/conversations/[id]/route.test.ts" "app/api/conversations/route.test.ts"` in `apps/web` → **2 files passed, 33 tests passed** (20 [id] = 3 window + 3 validate + 6 GET + 3 POST + 5 DELETE; 13 list). Up from 32 at FAIL time; the delta is the strengthened DELETE suite.
- Fake is genuinely stateful (test lines 71-93): turn-delete empties `liveTurns`, conversation-delete splices only on `(id, accountId)` match. Foreign DELETE test (lines 388-405) asserts status 404, body `{ error: 'not found' }`, `remainingTurns()` equals the seeded foreign rows, `remainingConvs()` intact, and zero `DELETE FROM` queries. Own DELETE (lines 374-386) asserts 200 + both stores empty. Owned + soft-deleted bot (lines 407-421) asserts 200 + both stores empty.
- `npm run typecheck --workspace @corvus/web` → exit 0 (`tsc --noEmit`, no errors).
- `npx eslint` on both touched files with `--max-warnings 0` from repo root → exit 0, no warnings.
- Hermetic fake-pool only; no live-Postgres path exercised (same scope as the original review — orchestrator still owes the merged-tree gate + live probe per SPEC §5).

## 3. No-regression

- GET-one body (lines 239-278) and POST-turns body (lines 306-369) still call `loadOwned` first and 404 on `null` or `botDeleted` — behavior unchanged from the original review's PASS findings. List route (`route.ts`) has no DELETE path (only POST/GET exports confirmed via grep); untouched.
- Only behavioral hunk is the DELETE guard + comments; test-file delta is the stateful fake + strengthened DELETE describes. `LIST_TURNS_SQL` dead-export note from the original review is untouched per scope (fix report declares it; wave closeout owns it) — correctly left alone, not scope creep.

## 4. Freeze / quality

- Copy freeze PASS: grep over the `[id]` dir for frozen/Draft strings (`VERDICT_HINT`, `PLAN_MISSING`, `MINT_FALLBACK`, `START_FALLBACK`, `ATTACHMENTS`, `Queued/Generating/Syncing`, `Sohbet`) → no matches. Error bodies remain machine codes only.
- No secrets/credentials in either file (grep for secret/password/api-key patterns → no matches). No new dependencies: `git status` shows no `package.json`/lockfile modification. No out-of-scope writes: conversations dirs are new-per-wave (untracked, as expected); no frozen SPEC §1 file touched. No git restore commands used (read-only `git status`/`git diff` only).
- Minor note (non-blocking): the stateful fake's turn-delete clears ALL `liveTurns` regardless of `conversation_id` — fine for single-conversation tests, but a future multi-conversation test would need per-id filtering in the fake. Not a defect in the shipped handler.

## Wave-4 handoff

- The original review's integration hold is now lifted for this defect: DELETE is safe to expose. Merged-tree gates + live probe per SPEC §5 remain the orchestrator's before integration into `page.tsx`.
