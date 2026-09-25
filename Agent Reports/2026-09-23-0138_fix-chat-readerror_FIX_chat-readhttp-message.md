# Task Report: fix-chat-readerror

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/lib/chat/thread.ts
- MODIFIED: apps/web/lib/chat/thread.test.ts

## Dependencies Added
None.

## What Changed

`readHttpError` (apps/web/lib/chat/thread.ts:135-149) now prefers the server's
`message` field over `error`, mirroring `readRefusalMessage`
(apps/web/app/dashboard/new/page.tsx:49-55) and `forkErrorMessage`
(apps/web/app/gallery/page.tsx:76-83):

```ts
const payload = (await response.json()) as { message?: unknown; error?: unknown };
if (typeof payload.message === 'string' && payload.message.trim() !== '') {
  return payload.message;
}
if (typeof payload.error === 'string' && payload.error.trim() !== '') return payload.error;
```

Precedence is `message` → `error` → pre-existing generic. The 401 logged-out
branch is untouched and sits ahead of the body read, so it still wins on 401
(now explicitly covered by a test). The generic line
`'The reply stopped unexpectedly. Try again.'` is byte-unchanged.

### Shape verified from repo files (not memory)
- `errorJson` (apps/web/app/api/chat/route.ts:240-244) writes `{ error: code }`
  when no message is passed, `{ error: code, message }` when one is — so the
  message-preferring branch is a no-op on every pre-existing code-only body.
- The two 403 bodies: `errorJson(403, 'trial_expired', TRIAL_ENDED_MESSAGE)` at
  route.ts:294 and `errorJson(403, 'trial_budget_exceeded',
  budgetRefusalMessage(...))` at route.ts:341-345.
- `readHttpError` has exactly one consumer:
  apps/web/components/ui/use-chat-stream.ts:84 (confirmed by repo-wide grep;
  only other hits are the test file). That caller feeds the assistant row's
  `error` field, which is why the raw code surfaced in the chat row.

### Why the severity was real
The chat lane is the main product surface and the primary path a trial-expired
person hits. Before this fix it painted `trial_expired` /
`trial_budget_exceeded` into the chat row where the function's own comment
promises plain words.

## Verification (instrument validated, not assumed)

1. **Guards were broken and watched to fail.** Reverting only the precedence in
   `thread.ts` made exactly the 2 new precedence tests fail, with
   `Received: "trial_expired"` — the precise defect. All other tests stayed
   green. Restored afterwards.
2. **Locked copy renders byte-identical.** Checked programmatically that the two
   locked sentences appear character-for-character in both route.ts and the
   test literals:
   - `Your 3-day trial ended — your bots are paused. Nothing is deleted.`
   - `Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.`
   No server copy was reworded.
3. **Focused tests:** `npx vitest run lib/chat/thread.test.ts` → 18/18 passed
   (5 new tests added to the existing `readHttpError` describe).
4. **Lint:** `npx eslint lib/chat/thread.ts lib/chat/thread.test.ts --max-warnings 0` → exit 0.
5. **Format:** `npx prettier --check` on both files → clean.

## Pre-existing Failures (NOT caused by this task)

The full web suite has failures that exist with my change reverted. Measured by
running the full suite against the pre-fix source: 7 failed / 803 passed, in
`app/api/interview/interview.test.ts`, `app/api/templates/templates.test.ts`,
and `lib/chat/thread.test.ts` (the last being my own 2 new tests correctly
failing against reverted code).

The interview/templates Postgres suites are **nondeterministic and
environment-dependent** — two consecutive runs of the same two files with my
fix in place gave 7 failures, then 15. Individual runs of
`lib/auth/session-db.test.ts`, `app/api/spec/spec.test.ts` and
`app/dashboard/bots/[id]/page.test.tsx` pass in isolation but fail under
parallel load, i.e. shared-database contention. None of these suites imports
`lib/chat/thread` or `readHttpError` (verified by grep), so they cannot be
affected by this change.

## Open Questions for Orchestrator

1. **Another agent is writing in an untracked directory concurrently.**
   `apps/web/app/api/builder/verdict/` is untracked (`??`) and its `route.ts`
   and `route.test.ts` were modified at 01:49:46 and 01:50:08 — *after* my last
   edit at 01:47:01. `tsc --noEmit` currently reports **4 errors, all in that
   file**, on a TDZ bug:
   `app/api/builder/verdict/route.ts(148,5): error TS2448: Block-scoped
   variable 'VERDICT_MAX_TOKENS' used before its declaration` (and
   `BRIEF_MAX_TOKENS` on the same line). This also makes
   `app/api/builder/verdict/route.test.ts` fail at collection with
   `ReferenceError: Cannot access 'VERDICT_MAX_TOKENS' before initialization`.
   Typecheck is NOT globally green because of it, but **zero errors are in my
   files**. Flagging rather than touching it — it is outside my scope and
   appears to be someone else's in-flight work. That agent should hoist the two
   constants above their use at line 148.
2. **Pre-existing flaky DB suites** (interview, templates, plus
   session-db/spec/bots-page under parallel load) fail independently of this
   change. Worth a separate task if the orchestrator wants a green full suite.

## Public Interface Exposed

`readHttpError(response: Response): Promise<string>` — signature and return type
unchanged. Only the internal precedence changed; no caller needs an update. Its
single consumer (apps/web/components/ui/use-chat-stream.ts:84) needs no change
and now receives the human sentence instead of the code.

## Known Limitations

- Applies to the JSON body shape `{ message?, error? }` only. A non-JSON or
  empty body still falls through to the generic line, unchanged.
- Does not touch the SSE-level `error` event path (`toChatStreamEvent`), which
  was already plain-text.
- No end-to-end browser run of a trial-expired chat send was performed: the
  trial gate needs a live Postgres session row with an expired clock, and the
  DB-backed suites in this repo are currently nondeterministic. Confidence
  rests on the two locked sentences being byte-identical between route and
  test plus the verified single caller path, not on a manual click-through.
  The orchestrator's review gate should exercise the real flow if a browser
  run is required.
