# Review: reviewer-wave1b2a-thread

## Verdict

PASS

## Scope

- Reviewed: `apps/web/lib/chat/thread.ts`, `apps/web/lib/chat/thread.test.ts`
- Builder report: `Agent Reports/2026-09-25-2038_wave1b2a-thread_MODIFY_thread-only.md`
- Whitelist-only context: SPEC `2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md` (§1, §3), wave-1 pack `2026-09-25-1806_wave-1-pack_conversation-persistence.md`, `apps/web/lib/conversations/client.ts` (read-only). No other reports read, no directories scanned.

## 1. Works — evidence

- `npm run typecheck --workspace @corvus/web` (repo root): exit 0.
- `npx eslint apps/web/lib/chat/thread.ts apps/web/lib/chat/thread.test.ts --max-warnings 0` (repo root): exit 0.
- `npx vitest run lib/chat/thread.test.ts` (in `apps/web`): 1 file passed, 32/32 tests passed, exit 0.
- Artifacts on disk: `apps/web/lib/chat/thread.ts` (12364 bytes), `apps/web/lib/chat/thread.test.ts` (15636 bytes). `git diff --stat` confirms exactly these two files changed by this task (353 insertions, 2 deletions); no manifest edits (`package.json` / lockfiles clean).
- Builder report claims 32/32 green and 55/55 combined with `client.test.ts` — the 32/32 half is independently reproduced here. (Note: report also says "14 new tests" — confirmed: the `persistence wiring` describe block holds exactly 14 `it()` cases.)

## 2. Contracts — evidence

- **botId-before-verdict ordering:** `ensureConversationForBot` persists the coerced `chatBotId(rawBotId)` via `openConversation` (POST /api/conversations) and returns `{ conversationId, botId }` intact. Ordering contract documented on the function and in the module header (await it before the verdict effect). Tests prove uuid passthrough (`{botId: BOT}` in POST body) and display-id coercion (`bot-3` → `{botId: null}`).
- **Rehydrate ≤50, ids intact, truncation surfaced:** `PERSISTED_TURNS_CAP = 50`; `rehydrateThread` maps via `toThreadRow` then `slice(-50)`; `truncated = loaded.truncated || mapped.length > 50`. Test with 60 turns → 50 rows starting at `t-10`, `truncated: true`. `toThreadRow` preserves ids byte-identical; assistant rows land `status: 'done'`; no clock readings fabricated.
- **Read-only refresh:** `rehydrateThread` calls only `getConversationTurns` (GET). Test asserts exactly one fetch with no init (GET, no POST) and no verdict-row content. No import of or write to `/api/builder/verdict` anywhere in the file.
- **Fail-closed, single allowed notice:** all three async helpers return `{ ok: false, status, notice }` forwarding the client's `HISTORY_UNAVAILABLE_NOTICE`; nothing throws for transport/status/shape. `thread.ts` contains zero literal copies of the notice string (imports the constant; `typeof HISTORY_UNAVAILABLE_NOTICE` in all failure interfaces). Tests assert byte-identical `Conversation history unavailable — new messages still send.` on all three failure paths plus `PERSISTED_TURNS_CAP === 50`.
- **Draft overlay non-mutating:** `overlayDraft` is `[...persisted, ...draft]`; test asserts both inputs unmutated and order `[persisted..., draft...]` — draft OVER history, never merged. Matches the route's draft-exclusion assumption stated in the header.
- **`toPersistedTurns`:** completed turns only (mirrors `threadHistory`), trimmed, 2000-char cap; empty/in-flight/error rows skipped. `persistThreadTurns` skips fetch on empty batches (`{ok:true, saved:0}`, fetch not called).

## 3. Freeze — evidence

- No SPEC §1 frozen file touched by this task (frozen list: verdict/start routes, `bounds.ts`, `persona-prompt.ts`, manifests — none in this diff).
- No frozen string altered: pre-existing suite (SSE, credits, refusal, history, brief) untouched and still green.
- No new user-facing strings: the only notice is the imported constant; grep finds no literal copy in `thread.ts`.
- No emoji; no exclamation in user strings — `!` occurrences are code only (`!==`, `!Number.isFinite`, `!opened.ok`, `!loaded.ok`, `!stored.ok`).
- Header comment tweak ("Pure — no React, no I/O" → "Core stays pure — no React") is honest: the new helpers do I/O via `client.ts`, and the persistence block documents it. Not a freeze issue.

## 4. Quality — evidence

- No `any` type in either file (regex for `: any`, `<any`, `as any`, `any[]` — no matches). No non-null assertions. No `fetch(` directly in `thread.ts` — all I/O through the five `client.ts` functions. No secrets/credentials/TODO. No new dependencies, no manifest touched, no install run.
- Write scope clean: builder report lists only the two files, diff confirms only the two files.
- Minor observation (non-blocking): the `python3` probe for non-ASCII punctuation was unavailable in this environment, so emoji-freedom was verified via targeted grep rather than a full codepoint scan. Nothing in the diff suggests non-ASCII beyond the pre-existing em-dash style.

## Hook-wiring handoff note (for the follow-up wiring task)

- Call order in the hook/page: `await ensureConversationForBot(rawBotId)` FIRST (before the verdict effect), keep the returned `botId` for verdict scoping, then `rehydrateThread(conversationId)` on refresh, and render the in-flight newest user row via `overlayDraft(persistedRows, [draftRow])` — never append it to the persisted window.
- On any `{ ok: false }`, show `notice` once and continue the `/api/chat` send lane locally; `persistThreadTurns` failures keep rows local.
- `rehydrateThread` rows carry no `startedAt`/`finishedAt` — rehydrated assistant rows show no elapsed readout by design.
