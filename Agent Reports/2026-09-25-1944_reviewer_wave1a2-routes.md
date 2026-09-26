# Review: wave1a2-conv-routes (conversations API routes)

## Verdict

FAIL — one blocking ownership defect in DELETE; everything else passes.

## Files Confirmed on Disk

- `apps/web/app/api/conversations/route.ts` — 5746 bytes, present.
- `apps/web/app/api/conversations/route.test.ts` — 7816 bytes, present.
- `apps/web/app/api/conversations/[id]/route.ts` — 15308 bytes, present.
- `apps/web/app/api/conversations/[id]/route.test.ts` — 14102 bytes, present.

## 1. Does it actually work?

- Typecheck: `npm run typecheck --workspace @corvus/web` from repo root → exit 0, no errors.
- ESLint: `npx eslint` on all 4 touched files with `--max-warnings 0` from repo root → exit 0, no warnings.
- Tests: `npx vitest run app/api/conversations/route.test.ts "app/api/conversations/[id]/route.test.ts"` inside `apps/web` → 2 files passed, 32 tests passed (19 + 13 as reported).
- Hermetic fake-pool tests only; no live-Postgres path exercised (acknowledged in the builder's Known Limitations). Gates describe these trees, not the merged tree — orchestrator still owes the merged-tree gate run plus the live probe per SPEC §5.

## 2. Contracts

- POST `botId`-or-null → `conversationId`: PASS. Null skips the ownership read; well-formed uuid checks `OWN_BOT_SQL` (own account + `deleted_at IS NULL`); malformed uuid → 422, foreign/soft-deleted → 404 with one shape. Matches pack contract.
- Turns append-only INSERT-only, bounded (`TURNS_CAP`/`TURNS_BATCH_MAX` = 50, text 1–2000 trimmed): PASS on the write path. No UPDATE/DELETE of turn rows in POST; idempotent ordered-prefix guard skips re-sent tails. The known ancient-head re-send edge (INSERTs rather than skips on 100+ turn threads) is accepted and documented; clients replay the tail.
- GET 50-cap window ending at last user exchange with `older-history-truncated` note: PASS as implemented. DESC over-read of 51 → newest-50 candidate → `windowTurns` → note when either fetch-truncated or window-truncated. Constants verified (`TURNS_CAP=50`, `OLDER_HISTORY_NOTE='older-history-truncated'`).
- Ownership by `account_id`: PASS on POST-create, GET-list, GET-one, POST-turns (all check before read/write). **FAIL on DELETE** — see below.
- Soft-deleted bots excluded (404) on GET-one and POST-turns: PASS. POST-create: PASS via `OWN_BOT_SQL`.
- Honest 5xx on DB failure + canonical `database not configured` via `mapDbError`: PASS on all five handlers; tests cover both shapes.
- Draft-exclusion judgment call (newest user row treated as in-flight draft, kept out of GET): SOUND for rehydration — the client holds the draft locally, so returning it from history would duplicate it. Wave 4 must consume it this way (render local draft over fetched history, never merge the draft into the persisted window). Flagged as handoff note, not a defect.
- BLOCKING DEFECT — DELETE destroys foreign turns before the ownership check: `DELETE` runs `DELETE_TURNS_SQL` (`DELETE FROM conversation_turns WHERE conversation_id = $1`, no account scoping) BEFORE `DELETE_CONVERSATION_SQL` (which is account-scoped and yields the 404). Calling DELETE on another account's conversation id wipes its turns, then answers 404. GET-one and POST-turns both call `loadOwned` first; DELETE never calls it. The existing "404 for a foreign conversation" test does not catch this because the fake pool's turn-delete is a no-op rowCount stub, not a stateful delete. Required fix: `loadOwned(id, session.accountId)` first (404 when null; decide botDeleted policy — recommend allow-delete of orphaned threads, but at minimum require ownership), then delete turns, then delete conversation. Consider a transaction (or conversation-first-then-turns-catchup) so a crash between the two cannot leave turns deleted under a live conversation.
- Secondary (non-blocking): `LIST_TURNS_SQL` (ASC twin) is exported but no live path uses it — both GET and POST use the DESC twin. Dead export; either use it or remove it so the next reader does not infer two live orderings.

## 3. Copy freeze (SPEC §3)

- PASS. No frozen string touched (grep over the four files: no `VERDICT_HINT`/`PLAN_MISSING`/`MINT_FALLBACK`/`START_FALLBACK`/`ATTACHMENTS`, no `Queued/Generating/Syncing`, no `Sohbet` Turkish strings — correctly absent at the route layer). Error bodies are machine codes only (`unauthorized`, `not found`, `body must be JSON`, `botId must be a uuid`, `turns must …`, `could not create/load/save/delete …`, `database not configured`). The only `!`-adjacent characters are `!==`/`!=` operators. No emoji. No new user-facing strings; `older-history-truncated` is a diagnostic note code, quarantined correctly.

## 4. Quality

- No secrets or credentials in any of the four files. No new dependencies declared or installed; `package.json`/lockfiles untouched (git status confirms: only pre-existing builder/css modifications plus untracked new files).
- No out-of-scope writes: the wave created exactly its four files under `apps/web/app/api/conversations/`; no frozen file (§1) appears in the diff. Read-only `git diff --name-only` / `git status --short` used for this check; no restore commands run.
- Next.js route-handler conventions: PASS. `{ params: Promise<{ id: string }> }` + `await params` matches the hoisted guide (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` uses `Promise<{ slug }>` shapes) and all four sibling routes (`bots/[botId]/activity`, `bots/[botId]/token`, `bots/[botId]/go-live`, `templates/[slug]`).
- `isUuid` reused from `apps/web/lib/editor/drafts`; `mapDbError` re-exported from `lib/db/pool` (via `map-db-error`); session-reader seam mirrors `app/api/bots/route.ts`. No manifest edits, no installs.
- Non-blocking doc drift: `0014_conversations.sql` header says `conversation_turns` is "INSERT + SELECT only, never UPDATE or DELETE by the app," but DELETE-conversation deletes whole-thread turns by design (no FK cascade). Clarify the comment to "no per-turn UPDATE/DELETE; whole-thread delete only via conversation delete" so the next reader does not file a false defect.

## Wave-4 handoff notes

- Do NOT integrate these routes into `page.tsx` or build the rail client until the DELETE fix lands and is re-reviewed; the current DELETE is unsafe to expose to any caller holding another user's conversation id.
- After fix: re-run the three gates on the merged tree (typecheck + eslint + vitest), then extend the `[id]` suite with a stateful fake where turn-delete actually removes rows, asserting a foreign DELETE leaves turns intact and returns 404.
- Consume `windowTurns` draft-exclusion as specified above; consume `OLDER_HISTORY_NOTE` with the Wave-1 string `Conversation history unavailable — new messages still send.` only for the down-path, never as a substitute for the truncation note.
