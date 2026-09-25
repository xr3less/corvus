# Task Report: aibuild-reviewer

## Verdict
PASS

## Status
SUCCESS

## Files Touched
- CREATED: Agent Reports/2026-09-22-1939_reviewer_REVIEW_aibuild.md
- No source files created, modified, or deleted. No manifest, lockfile, env, config, or git actions taken.

## Dependencies Added
- None. No installs run (node_modules present at root and apps/web; verified by directory check, not by install).

## Assumptions Made
- The SPEC `Agent Reports/2026-09-22-1939_orchestrator_SPEC_aibuild-verdict.md` is the source of truth and supersedes trigger parts C2/C3 of the 1902 SPEC (per its header, lines 3-9). Everything else in 1902 (C1 ask line, C4 progress, C5 gates, C6 shell pin) stands.
- Toolchain detection is from repo files, not memory: lockfile is `package-lock.json` (npm; yarn/pnpm/bun lockfiles absent), scripts from root `package.json` (typecheck/lint/format/test delegation) and workspace `package.json` files (`@corvus/web`, `@corvus/ai`). Commands below are the project's real commands.
- The vitest results cache (`apps/web/node_modules/.vite/.../results.json`) and `.next/dev/cache` are regenerable artifacts, not source. grep findings distinguish source dirs from these caches explicitly.
- `Modal.tsx` confirmLabel/confirmPhrase/confirmBlock is an unrelated delete-confirmation UI and was intentionally left untouched per the task.
- No live persona-provider, builder-worker, or DB-write flows were exercised live on purpose (would create spend/builder rows; lane owns keys). Hermetic mocked-lane/pool tests are the contract evidence; the live entry-point check below is honestly scoped.

## Verification 1 — Real toolchain gates on the MERGED tree
- `npm run typecheck --workspaces --if-present` — PASS. All 5 workspaces clean (`tsc --noEmit` each): gateway, testbot, web, ai, spec. Zero errors.
- `npm run lint` (root: `eslint . --max-warnings 0`) — PASS. No output, zero warnings.
- `npm run format` (root prettier check + per-workspace `prettier --check --ignore-unknown .`) — PASS. Root plus all of gateway/testbot/web/ai/spec report "All matched files use Prettier code style".
- `npm run test --workspace @corvus/ai` — PASS. 5 files, 132/132 green, including `src/persona-prompt.test.ts` (37 tests: 27 pre-existing incl. C1 ask-line + 10 new verdict/brief).
- `npx vitest run app/api/builder/verdict/route.test.ts` — PASS. 19/19 green.
- `cd apps/web && npx vitest run app/dashboard/new/page.test.tsx` — PASS. 30/30 green (vitest 5.0.0 in web workspace; a root-cwd run of this file fails only on the `@/` alias, which is a cwd artifact, not a code defect).
- `cd apps/web && npx vitest run` (full web suite) — PASS. 726 passed, 65 skipped, 0 failed.
- Root `npm test` as a single all-workspace command was NOT run; per-workspace equivalents were run for both touched workspaces (ai, web). gateway/spec/testbot suites were not run (untouched by this wave). No check was invented or silently skipped: every gate above uses the project's real script names.

## Verification 2 — Verdict contract live (mock lane + pool, never live provider/DB)
Route: `apps/web/app/api/builder/verdict/route.ts`. Tests: `apps/web/app/api/builder/verdict/route.test.ts`.
- Gate order 401 -> 403-before-body -> 422 -> 404 mirrors `apps/web/app/api/builder/start/route.ts` (401 at start/route.ts:114; 403 trial clock before body at 123-128; 422 botId at 139; ownership `deleted_at IS NULL` at 152-155; 404 at 164; boss shape singletonKey/retryLimit/retryDelay/expire/deleteAfter at 196-206; markEnqueueFailed UPDATE at 228-237). Verdict route matches: 401 at route.ts:235-244, 403 at 250-255, 422 at 264-272, 404 at 274-292 with the same `deleted_at IS NULL` predicate, boss send shape at 393-403, markEnqueueFailed at 426-435.
- 401 first: test `returns 401 first when there is no session, without touching pool, boss or lane` (route.test.ts:193) — 401 `{error:'unauthorized'}`, zero pool calls, zero boss starts, zero lane calls (asserts at 203-207).
- 403 before body: `checks the trial clock before the body, so a malformed request cannot mask it` (route.test.ts:210) — malformed botId still 403 `trial_expired`, zero pool/boss/lane touches (220-224).
- 422: `returns 422 for a missing or malformed botId` (route.test.ts:227) and `returns 422 for a malformed turns tail` (route.test.ts:244; covers 13 turns, non-array, empty content, 501-char turn, bad role; asserts body validation runs before any pool query at 262-263).
- 404 never 403: `returns 404 - never 403 - for a bot owned by someone else` (route.test.ts:266; asserts 276-281) and `returns 404 for a soft-deleted bot` (route.test.ts:284; asserts the ownership query contains `deleted_at IS NULL` at 299-300).
- 409 no_plan_asked: `returns 409 with no row, no job and no model call when no ask line exists` (route.test.ts:307) — 409 `{error:'no_plan_asked'}`, zero lane calls, zero builder INSERTs, zero spend INSERTs, zero boss sends (326-333); plus `returns 409 when the thread has no assistant turn at all` (route.test.ts:336).
- unclear/no start nothing: `answers unclear with started:false and zero builder INSERTs` (route.test.ts:353; 200 `{verdict:'unclear',started:false}`, 1 lane call, 0 builder INSERTs, 0 jobs, 1 persona-run spend row at 365-371) and `answers no with started:false and zero builder INSERTs` (route.test.ts:374).
- Garbage model JSON: `reads garbage model JSON as unclear without throwing` (route.test.ts:392; inputs at 399-404: prose, wrong-enum verdict, truncated JSON, fenced JSON, empty string — each returns 200 unclear, zero INSERTs/jobs at 408-412). Parser is route.ts:195-208 (JSON.parse in try/catch, strict shape check, fallback `unclear`).
- Brief clamp: `clamps the brief to 2000 chars on a long thread` (route.test.ts:495; asserts `briefChars <= 2000` at 507 and `sent.brief.length <= 2000` at 509). Clamp is route.ts:357 (`briefRaw.slice(0, BRIEF_MAX).trim()`, BRIEF_MAX=2000 at route.ts:69). Empty-after-clamp: `returns 422 empty_brief with no row and no job` (route.test.ts:512-526).
- yes path: `writes the brief, inserts the run and sends the locked job shape` (route.test.ts:449; asserts queue `builder` at 474-475, data `{runId,botId,brief}` at 479-483, options `{singletonKey:runId,retryLimit:3,retryDelay:30,expireInSeconds:3600,deleteAfterSeconds:604800}` at 484-490, 2 persona-run spend rows at 492).
- Enqueue-fail: `marks the run failed and returns a generic 500 when send throws` (route.test.ts:543; asserts 500 `could not start build`, `boss.stop` called, row phase `failed` with detail `{error:'enqueue_failed'}` at 555-558) and `marks the run failed ... when send resolves to null` (route.test.ts:561). Shape matches `markEnqueueFailed` (route.ts:426-435), identical to builder/start.
- Paid bypass + lane failure: `lets a paid tier past an expired clock` (route.test.ts:528); `returns an honest 500 with no row when the lane itself fails` (route.test.ts:577; zero rows, zero jobs).

## Verification 3 — Mutation sense (reasoning-proof, NO source edits)
Method: reasoning-proof from test assertions, NOT live edits — the reviewer role forbids editing source files, so no temporary in-memory edits were made. Stated here explicitly with the exact assertion lines that prove each guard is asserted AND its size.
- Ask-line guard (route.ts:297-301: last assistant turn must exist and `content.includes(ASK_LINE)` with `ASK_LINE='Can I start?'` at route.ts:56, else 409). If the check were broken to always-true, test route.test.ts:307 (expects 409, `persona.calls` length 0, `builderInserts` length 0) would go red — the stub lane returns `{"verdict":"yes"}` so the request would proceed to 200 with lane calls and a row. If broken to always-409, test route.test.ts:449 (expects 200 `queued` with row + job) would go red. Set AND size: two distinct 409 members (`:307` bare-yes-with-no-plan, `:336` no-assistant-turn-at-all) plus positive controls that pass through (`:353` unclear, `:374` no, `:449` yes — all use turns containing the ask line) prove the guard discriminates rather than existing on paper.
- Brief clamp (route.ts:337-340 thread capped to THREAD_MAX=3000 at route.ts:68; route.ts:357 `slice(0, BRIEF_MAX).trim()` with BRIEF_MAX=2000 at route.ts:69). Removing the slice would turn test route.test.ts:495 red: the stub brief is `'line\n' + 'x'.repeat(3000)` (line 501) and assertions require `briefChars <= 2000` (507) and `sent.brief.length <= 2000` (509). Lower bound is asserted too: route.test.ts:512-526 (whitespace brief → 422 `empty_brief`, zero rows, zero jobs). Both bounds of the 1..2000 contract are pinned.
- V1 prompt guards are likewise assertion-pinned: verdict JSON-schema + unclear rule + bare-greeting rule (persona-prompt.test.ts:183-217), brief 3-8-line rule + `[default]` + 1500-char instruction (persona-prompt.test.ts:219-246), C1 ask line kept byte-identical (persona-prompt.test.ts:140-160).

## Verification 4 — Page flow via the REAL entry point (LESSONS 2.2/2.4)
Human: I, the reviewer, drove this directly against the running dev server.
- A second `next dev` on :3119 refused to start: log reads "Another next dev server is already running — Local: http://127.0.0.1:3000 — PID: 10836 — Dir: C:\Users\xr3less\Desktop\corvus\apps\web". I used that existing server (no deps/versions/config changed to make anything run).
- `GET /api/auth/dev-login` → 405 (GET correctly refused; handler is POST-only per `apps/web/app/api/auth/dev-login/route.ts:77-82`).
- `GET /dashboard/new` (no cookie) → 200, 26556 bytes; contains the hero `What will your bot do today` (1 match), zero occurrences of `Build this bot`, and the auto-start hint `say yes when the plan looks right` (1 match). This is the merged new-wave page served live.
- `POST /api/auth/dev-login` → 307 redirect to `/dashboard` with a real `Set-Cookie: corvus_session=...` (value redacted; session minted through the PgSessionStore path, proving DB reachability and the trial-clock default). Cookie name captured, value never recorded.
- Authed `GET /dashboard/new` on 127.0.0.1:3000 with that cookie → 200 with the hero. Flow completed by the reviewer: dev-login mint → session cookie → authenticated new-page serve.
- NOT exercised and honestly marked: the interactive browser flow plan-with-`Can I start?` → user `yes` → inline progress (client-side verdict effect at `apps/web/app/dashboard/new/page.tsx:97-174` requires JS + chat SSE + persona lane + builder worker). No browser automation exists in this harness, and live POSTs were deliberately avoided (they would write builder/spend rows). That path is covered hermetically: page tests 30/30 (`page.test.tsx:433` verdict-yes posts exactly once with the turns tail and renders inline `Build progress` + `?runId=` link; `:501` 409 silent; `:545` unclear silent; `:587` in-flight single POST; `:659` mint-race `Saving your bot…`; `:718` transport fallback; `:839` trial-gate 403 honest sentence) plus route tests 19/19 above. Green gates alone are not claimed as testing.

## Verification 5 — confirm.* deletion
- `ls apps/web/lib/chat/confirm.ts apps/web/lib/chat/confirm.test.ts` → both `No such file or directory` (exit 2). Gone from disk.
- `grep -rn "lib/chat/confirm|isBuildConfirmation" apps/web/app apps/web/lib apps/web/components` → zero matches (exit 1). Command run as: `grep -rn "lib/chat/confirm\|isBuildConfirmation" apps/web/app apps/web/lib apps/web/components`.
- A raw `grep -rn ... apps/` also matches only regenerable artifacts: turbopack dev-cache binaries under `apps/web/.next/dev/cache/.../*.sst` and the stale vitest cache `apps/web/node_modules/.vite/.../results.json` (which still lists an old `lib/chat/confirm.test.ts` entry). Zero source references.
- `Modal.tsx` `confirmLabel/confirmPhrase/confirmBlock` (lines 12, 15, 26, 28, 33) is the unrelated delete-confirmation UI and was left untouched, as required.
- Git note: `confirm.*` were never tracked (`git ls-files apps/web/lib/chat/` lists only `thread.ts` + `thread.test.ts`; `git log -- apps/web/lib/chat/confirm.ts` is empty), so there is no git deletion entry — V3's "deleted via filesystem rm (not git)" is consistent with this. The orchestrator owns any commit step.

## Verification 6 — No secret values
- `grep -n "process.env" apps/web/app/api/builder/verdict/route.ts apps/web/app/dashboard/new/page.tsx packages/ai/src/persona-prompt.ts` → no matches (exit 1). The route reaches the DB only via the shared `getPool()`/`requireDatabaseUrl()` module and keys only via the persona lane (`chat({lane:'persona'})`); the page holds no keys.
- `.env.local` was inspected by variable NAME only (`DATABASE_URL, APP_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, WIRO_API_KEY, WIRO_BASE_URL, CORVUS_DEV_LOGIN`); presence confirmed by count query, values never printed, copied, or transmitted. The dev-login `Set-Cookie` value was redacted at capture.
- No secret values appear in V1/V2/V3 reports, in this report, or in the captured dev-server log tail (only route/status lines). Spend is recorded as counts/cost-nulls, never keys.

## Open Questions for Orchestrator
- `apps/web/lib/chat/thread.ts` + `thread.test.ts` carry an uncommitted `stitchBrief`/`BRIEF_MAX_CHARS` addition (used by `apps/web/app/dashboard/bots/[id]/page.tsx`) from a different in-flight wave. The verdict route does NOT use `stitchBrief` (it owns its clamp at route.ts:357). Full web suite is green with it. Confirm that wave owns those two files so a later merge does not attribute them here.
- `git status` shows `packages/ai/src/persona-prompt.ts` + `.test.ts` and `apps/web/app/api/builder/verdict/` as untracked (`??`) with page files as modified, inside a 178-file dirty tree from parallel waves. Files exist on disk with correct content and green tests; tracking/commit is orchestrator-owned. V1's report lists itself as CREATED inside its own "Files Touched" — harmless self-reference, no action needed.
- The verdict route trusts a client-sent `turns` tail (bounded 12x500, V2 report's stated fallback since no server-side chat store exists). That trust boundary is SPEC-acknowledged, not a review finding, but a future hardening pass could bind turns to a server-side transcript.

## Public Interface Exposed
- None added by this review. Verified interfaces (unchanged, for the record): `buildVerdictPrompt(planText, userReply)` and `buildBriefPrompt(threadText)` in `packages/ai/src/persona-prompt.ts:31-55`; `POST /api/builder/verdict` contract in `apps/web/app/api/builder/verdict/route.ts:235-422` (401/403-before-body/422/404/409/200/500 shapes per SPEC V2); `NewBotPage` auto-start effect + hint/progress copy in `apps/web/app/dashboard/new/page.tsx:97-174, 282-298`; `.newAiBar` safe-area addition in `page.module.css:102-110`.

## Known Limitations
- Interactive browser E2E (plan → yes → inline progress click-through) was not performed: no browser harness exists here and live POSTs were avoided. Live coverage is entry-point + auth + SSR copy; the decision path is covered by 19 hermetic route tests + 30 hermetic page tests, all green.
- Mutation evidence is reasoning-proof from exact assertions (reviewer no-edit rule), not observed red runs. Assertion lines are cited so any party can reproduce the red in seconds.
- The merged tree is mid-flight (178 changed files across waves). All gates above ran on that merged tree and pass, but a later wave could still perturb these files — re-run the three focused suites (`@corvus/ai` test, verdict route test, new-page test) after the next merge.
- Root `npm test` as one command and gateway/spec/testbot suites were not run (out of wave scope); stated, not skipped silently.
