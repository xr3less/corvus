# Review: wave1b2c-hook (use-chat-stream persistence wiring)

## Verdict

PASS

## 1. Works — evidence

- `npm run typecheck --workspace @corvus/web` (repo root): exit 0.
- `npx eslint apps/web/components/ui/use-chat-stream.ts apps/web/components/ui/use-chat-stream.test.tsx --max-warnings 0` (repo root): exit 0.
- Vitest **inside `apps/web`** (`npx vitest run components/ui/use-chat-stream.test.tsx components/ui/dashboard-rail.test.tsx lib/chat/thread.test.ts lib/conversations/client.test.ts`): **4 files, 82/82 green**. Hook suite 10/10 (6 pre-existing incl. M-6 guard + 4 new persistence tests); neighbors rail/thread/client unchanged green.
- Repo-root vitest invocation fails to resolve the `@/` alias (`Cannot find package '@/lib/chat/thread'`) — expected toolchain note, already documented in the builder report; not a defect. Workspace-scoped run is the correct command.
- Artifacts confirmed on disk: `apps/web/components/ui/use-chat-stream.ts` (12598 bytes), `apps/web/components/ui/use-chat-stream.test.tsx` (18305 bytes). Builder report `Agent Reports/2026-09-25-2140_wave1b2c-hook_MODIFY_hook-only.md` exists and was read.

## 2. Contracts — evidence

- **ensure-before-chat ordering:** `runStream` awaits deduped `ensureConversation()` (keyed on RAW bot id) before `POST /api/chat` (use-chat-stream.ts:132-139). Test pins byte-exact ordering: open POST `/api/conversations` precedes chat POST, `{ botId: null }` for null and coerced `bot-3`; coerced null also on the open POST.
- **No verdict re-POST on refresh:** hook code issues no fetch to `/api/builder/*` (only `/api/chat`; persistence goes through `thread.ts` helpers). Test asserts zero `/api/builder/verdict` calls on the send path.
- **Best-effort persist:** finally-block `persistThreadTurns` via `messagesRef` mirror; skipped when `persistedId === null` or locally aborted; failed persist sets `historyNotice` once (`current ?? notice`); local rows always stay. Covered by open-fail and append-fail tests (rows land locally, `conversationId` null-or-set correctly, single honest notice).
- **Abort-during-ensure:** aborted run returns before any chat fetch; guarded unlock restores the composer (reset-then-resubmit keeps its own lock — pinned by the new `reset during the conversation open` test).
- **stop() local-only:** aborts in-flight `/api/chat` fetch, clears the ref; no verdict/build request, no DELETE, no copy claiming otherwise. Test asserts no verdict POST and no DELETE.
- **Return-shape backward compatibility:** both page callers (`apps/web/app/dashboard/new/page.tsx:190`, `apps/web/app/dashboard/bots/[id]/page.tsx:301`) destructure the subset `{ messages, streaming, submit, retry }` — verified by grep; added `stop`/`conversationId`/`historyNotice` are additive only. Pages untouched per scope.

## 3. Freeze — evidence

- Zero literal occurrences of `Conversation history unavailable` in `use-chat-stream.ts` (grep: no matches) — the single allowed notice arrives only via the helpers' `notice` field.
- `ATTACHMENTS_UNSUPPORTED` byte-identical to HEAD (`Image sending is not connected yet, so this turn was not sent. Remove the images and try again.`).
- No new user-facing literal with `!` and no emoji found in the hook file; the `!` grep hits are TypeScript operators (`!==`, `!response.ok`, `!controller.signal.aborted`, `!stored.ok`, `!row`) — no non-null assertions, matching the builder's claim.
- The hook diff mentions `verdict` only in comments; no frozen motor file is touched by this task's two-file diff.

## 4. Quality — evidence

- No `any` in the hook file (grep: no matches). No secrets/credentials. No new dependencies (report declares none; no manifest appears in the diff). No out-of-scope writes: `git diff --stat` for the two in-scope paths shows exactly those two files changed (351 insertions, 26 deletions across both; hook file proper +104/-10).
- `'use client'` retained; no `useSearchParams` in the hook — consistent with the client-component convention cited. M-6 guard still green (3/3 attachment tests inside the 82).
- Broader `git status` shows other modified wave files in the tree (expected — parallel waves land in the same checkout); this task's own scope is clean.

## Wave-1 closeout note

All prior Wave-1 reviewer verdicts are PASS: routes fix r2 (`2026-09-25-1948_reviewer_wave1a2fix-r2.md`), client (`2026-09-25-1944_reviewer_wave1b1-client.md`), thread (`2026-09-25-2039_reviewer_wave1b2a-thread.md`), rail (`2026-09-25-2110_reviewer_wave1b2b-rail.md`). With this PASS, **Wave 1 (migration + routes + client + thread + rail + hook) is fully done pending the orchestrator's merged-tree gate + live probe** — no further per-task review remains for Wave 1.
