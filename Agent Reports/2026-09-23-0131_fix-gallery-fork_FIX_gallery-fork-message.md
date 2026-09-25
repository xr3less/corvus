# Task Report: fix-gallery-fork

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/gallery/page.tsx
- MODIFIED: apps/web/app/gallery/page.test.tsx

## Dependencies Added
- None.

## What Changed

`forkErrorMessage` (apps/web/app/gallery/page.tsx:76-83) now prefers `message`
over `error`, mirroring `readRefusalMessage` in
apps/web/app/dashboard/new/page.tsx:49-55:

- `message` — returned when it is a string with non-whitespace content.
- `error` — fallback for the older code-only shape.
- `` `Fork failed (${status}). Try again.` `` — the pre-existing honest generic,
  kept for a body with neither field.

The route at apps/web/app/api/templates/[slug]/fork/route.ts:125 writes both
fields (`{ error: refused.code, message: refused.message }`, status 403), so a
403 trial refusal previously rendered the raw machine code `trial_bot_limit` /
`trial_expired` on the card. It now renders the SPEC-locked sentence from
apps/web/lib/bots.ts:55-57.

Both locked sentences are byte-identical to `lib/bots.ts` — verified by
programmatic `String.includes` against the source file, not by eye (TRIAL_BOT_LIMIT
41 chars, TRIAL_EXPIRED 66 chars; both match in source and test). No user-facing
copy was reworded. Success links, the 401 logged-out branch, the in-flight
disabled state, and the malformed-2xx branch are untouched — the diff is
confined to the comment and body of `forkErrorMessage`.

## Verification (real commands, this machine, merged tree)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` (apps/web) | exit 0, zero errors |
| Lint | `npx eslint app/gallery/page.tsx app/gallery/page.test.tsx --max-warnings 0` | exit 0, zero warnings |
| Format | `npx prettier --check` on both touched files | "All matched files use Prettier code style!" |
| Focused test | `npx vitest run app/gallery/page.test.tsx` | 20 passed (1 file) |
| Full web suite | `npx vitest run` (apps/web) | 58 files passed, 730 passed / 65 skipped (795) |

`apps/web/app/gallery/page.test.tsx` exists, so per the task spec it was
modified rather than created. Four tests were added:

1. fork 403 `{ error: 'trial_bot_limit', message: <locked sentence> }` →
   asserts the alert contains the locked trial sentence **and** does not contain
   `trial_bot_limit`.
2. fork 403 `{ error: 'trial_expired', message: <locked sentence> }` →
   same two assertions for the expired-trial sentence.
3. fork 403 `{ error: 'trial_bot_limit' }` only → asserts the code still renders
   (fallback preserved).
4. fork 403 `{}` (neither field) → asserts `Fork failed (403). Try again.`
   (generic preserved).

### Mutation evidence (guards broken on purpose, watched fail)

Per the standing rule that a guard is not a guard until it has been broken:

- Forced the `message` branch to `false` → tests 1 and 2 failed
  (`Tests 2 failed | 18 passed`). The message-preference guard is real.
- Restored, then forced the `error` branch to `false` → the pre-existing
  "shows the server error text on fork failure" test and new test 3 failed
  (`Tests 2 failed | 18 passed`). The fallback is still load-bearing.
- Restored to final. Final focused run: 20/20 passed.

## Assumptions Made
- Used the same trim-and-non-empty test as `readRefusalMessage` (`.trim() !== ''`)
  rather than `forkErrorMessage`'s previous `!== ''`. This is a strict widening:
  a whitespace-only `message` now falls through to `error`/the generic instead
  of rendering as blank alert text. No existing fork outcome changes — the
  pre-existing 500-shape test (`{ error: 'could not fork' }`) still passes.
- Test literals for the two locked sentences were inlined as constants rather
  than importing `TRIAL_EXPIRED_MESSAGE` / `TRIAL_BOT_LIMIT_MESSAGE` from
  `@/lib/bots`, matching the sibling test's existing convention
  (apps/web/app/dashboard/new/page.test.tsx:12). Byte-identity to the source
  constants was verified programmatically. Importing the constants would make
  the assertion self-referential (a changed constant would silently pass), so
  the inline literal is the stronger guard.
- No CSS or markup change was needed; the existing alert paragraph is unchanged.

## Open Questions for Orchestrator

**1. THE SAME DEFECT IS LIVE ON TWO MORE SURFACES, BOTH OUTSIDE MY WRITE SCOPE (not touched).**

The defect class is "reads `error`, drops the server's honest `message`". I
enumerated every reader of the `{ error, message }` shape in apps/web and traced
each one to the routes that serve it. Three writers produce the trial 403
(grep-proven, all with the identical `{ error: refused.code, message: refused.message }`
body):

- apps/web/app/api/templates/[slug]/fork/route.ts:125 — **fixed by this task**
- apps/web/app/api/bots/route.ts:141
- apps/web/app/api/interview/start/route.ts:97

Two more readers drop the message, and both are **confirmed live** (not hypothetical):

- **apps/web/lib/chat/thread.ts:129-140** (`readHttpError`) reads `payload.error`
  only. It is called for non-ok responses from `POST /api/chat`
  (apps/web/components/ui/use-chat-stream.ts:84, the only caller), and that route
  writes the same two-field 403 at apps/web/app/api/chat/route.ts:294
  (`errorJson(403, 'trial_expired', TRIAL_ENDED_MESSAGE)`, and `errorJson` at
  route.ts:240-244 emits `{ error, message }` whenever a message is passed).
  The raw code `trial_expired` — and `trial_budget_exceeded` from the credit
  gate at route.ts:341-345 — is what lands in the chat row's error text
  (`patchMessage(..., error: message)`). **This is the worst of the three**: the
  chat lane is the main product surface and the primary path a trial-expired
  person hits, and `readHttpError`'s own comment at thread.ts:127-128 shows it was
  written to say failures "in plain words with the fix".
- **apps/web/app/interview/page.tsx:71-78** (`readErrorMessage`) reads `body.error`
  only, called at :134 for a non-ok `POST /api/interview/start` (:113) — the
  route carrying the trial 403 at route.ts:97. Renders
  `Could not start interview: trial_bot_limit`.

Both are one-function fixes of exactly the shape applied here. Escalating rather
than expanding scope, per the SCOPE GUARD.

**2. Note for the same wave (not a defect, a drift risk).** apps/web/app/api/chat/route.ts:88
defines its own copy of the locked expired-trial sentence as `TRIAL_ENDED_MESSAGE`
instead of importing it from apps/web/lib/bots.ts:55-57. The bytes are currently
identical, but the copy is not single-sourced, so a future edit to `lib/bots.ts`
would silently miss the chat route. Worth a decision on whether that route should
import the constant; out of scope here.

## Public Interface Exposed

No exported surface changed. `forkErrorMessage(payload: unknown, status: number): string`
remains module-private to `apps/web/app/gallery/page.tsx` with an identical
signature; only its precedence order changed. `ForkFailure` and `ForkSuccess`
interfaces are unchanged. No route contract, no API shape, no prop changed.

## Known Limitations
- Only the gallery surface is fixed. Two more live instances of the same class
  (`lib/chat/thread.ts` `readHttpError` on the chat lane, and
  `app/interview/page.tsx` `readErrorMessage`) are confirmed and escalated in
  item 1 above; both are outside this task's write scope by instruction.
- The gallery has no route-level integration test hitting the real fork route;
  the fix is asserted at the page unit level against the route's documented
  403 body shape (read from apps/web/app/api/templates/[slug]/fork/route.ts:125).
  Per LESSONS §2.4, a human completing the fork flow against a real trial-capped
  account in the running app was NOT performed here — that is the reviewer's or
  a later manual pass's job, and is named as not done rather than claimed.
- One jsdom warning appears in the full suite
  (`HTMLCanvasElement's getContext()`), pre-existing and unrelated to these files.
