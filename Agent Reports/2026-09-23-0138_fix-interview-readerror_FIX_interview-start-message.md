# Task Report: fix-interview-readerror

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/interview/page.tsx
- MODIFIED: apps/web/app/interview/page.test.tsx

(No files created or deleted. Colocated test file already existed, so per spec it was modified, not created.)

## Dependencies Added
- None.

## What Changed

`readErrorMessage` (apps/web/app/interview/page.tsx:79-91) now prefers `message`
over `error`, mirroring `readRefusalMessage` in
apps/web/app/dashboard/new/page.tsx:49-55 and the already-landed
`forkErrorMessage` in apps/web/app/gallery/page.tsx:76-83:

- `message` — returned when it is a string with non-whitespace content.
- `error` — fallback for the code-only shape.
- `fallback` — the caller's own pre-existing generic, kept for a body with
  neither field (and for an unparseable body).

Verified from files (never memory): POST /api/interview/start writes both fields
on a KI-033 refusal — apps/web/app/api/interview/start/route.ts:97
`Response.json({ error: refused.code, message: refused.message }, { status: 403 })`
— and the caller at apps/web/app/interview/page.tsx:147 (`handleStart`, inside the
`!res.ok` branch) interpolated only the `error` field. A 403 trial refusal
therefore rendered the raw machine code:

```
Could not start interview: trial_bot_limit
```

It now renders the SPEC-locked sentence from apps/web/lib/bots.ts:55-57.

### Locked prefix shape preserved
`Could not start interview: `, `Could not record answer: ` and
`Could not save review: ` are unchanged — only the interpolated value differs.
Confirmed programmatically by `String.includes` against the source file.

### Sibling callers unchanged (byte-identical rendering)
The two other call sites of this helper keep their exact current output, because
neither route emits a `message` field:

- apps/web/app/api/interview/answer/route.ts:48 — `Response.json({ error: message, ...extra }, ...)`;
  every `extra` is `{ expected }` (line 117), never a `message` key.
- apps/web/app/api/spec/patch/route.ts:38 — `Response.json({ error: message, ...extra }, ...)`;
  every `extra` is `{ currentVersion }` (lines 125, 177, 182).
- The 409 branch in the page is handled before the helper and is untouched.

One intentional micro-difference from the pre-fix code: the old guard was
`body.error.length > 0`, the new one trims (`record.error.trim() !== ''`). A
whitespace-only error string previously rendered as blank-ish text; it now falls
back. This matches the sibling implementations exactly and is strictly better —
no route in the flow emits a whitespace-only error.

### Defect-class enumeration (per LESSONS §1.2)
The class is "client reads only `error` while the route writes `message` too".
Every producer of a message-bearing refusal was enumerated from the routes:

| Route | Refusal body | Client | State |
|---|---|---|---|
| `api/interview/start` | `{ error, message }` @:97 | `app/interview/page.tsx` | **FIXED HERE** |
| `api/bots` | `{ error, message }` @:141 | `app/dashboard/new/page.tsx` (mintOnce) | already correct |
| `api/templates/[slug]/fork` | `{ error, message }` @:125 | `app/gallery/page.tsx` | already correct |
| `api/builder/start` | `{ error, message: TRIAL_ENDED_MESSAGE }` @:125 | `app/dashboard/bots/[id]/page.tsx:893` | already correct |
| `api/builder/verdict` | `{ error, message: TRIAL_ENDED_MESSAGE }` @:252 | `app/dashboard/new/page.tsx:144` | already correct |

Excluded with reason: `components/ui/builder-progress.tsx:50 readApiError` reads
`error` only, but it consumes GET /api/builder, which writes `{ error }` alone
(lines 80-114) — no message is ever produced, so there is nothing to prefer.
`app/dashboard/bots/[id]/page.tsx:326,546,734,784,832` read `error` as a
*branching code* (`'no draft yet'`), not as display text — a different concern.

This fix closes the last member of the class. That claim is what makes the
counts in the wave auditable: no route outside the table above writes a
`message` field.

## Verification (real commands, this machine)

| Gate | Command | Result |
|---|---|---|
| Typecheck (my files) | `npx tsc --noEmit` (apps/web) | my files clean; the only errors are 5 pre-existing errors in an untracked concurrent-agent file, `app/api/builder/verdict/route.ts` (see Known Limitations) |
| Lint (my files) | `npx eslint app/interview/page.tsx app/interview/page.test.tsx --max-warnings 0` | exit 0, zero warnings |
| Lint (whole app) | `npx eslint . --max-warnings 0` | my files clean; 3 errors, all in the untracked `verdict/route.ts` |
| Format | `npx prettier --check app/interview/page.tsx app/interview/page.test.tsx` | "All matched files use Prettier code style!" |
| Focused test | `npx vitest run app/interview/page.test.tsx` | **13 passed** (1 file) — 8 pre-existing + 5 added |
| Class-related tests | `npx vitest run app/interview/page.test.tsx app/gallery/page.test.tsx app/dashboard/new/page.test.tsx` | **63 passed** (3 files) |

### Guard validation (a guard is not a guard until you watch it fail)
The two new message-preference tests were run against the **pre-fix** helper and
both failed, reproducing the exact reported symptom:

```
× shows the honest trial sentence on start 403, never the raw refusal code
  Expected: "Free 3-day trial — 1 bot, 100 AI credits."
  Received: "Could not start interview: trial_bot_limit"
× prefers the message on an expired-trial 403 when only the message carries it
  Expected: "Your 3-day trial ended — your bots are paused. Nothing is deleted."
  Received: "Could not start interview: trial_expired"
```

The fix was then restored and both pass. Backup files were kept outside the repo
(`/tmp/corvus-interview-backup/`, md5-verified on restore: page.tsx
`ba8d26be…`, page.test.tsx `6ef06c42…`); no git command that restores from HEAD
was run against the working tree.

### Locked sentences byte-identical (verified programmatically, not by eye)
Against apps/web/lib/bots.ts:

- `TRIAL_BOT_LIMIT_MESSAGE` (41 chars) — `String.includes` true in the test file.
- `TRIAL_EXPIRED_MESSAGE` (66 chars) — `String.includes` true in the test file.
- Both correctly absent from page.tsx: the page renders the server's sentence
  rather than hardcoding locked copy (hardcoding was explicitly not the task).

### Tests added (5)
1. start 403 `{ error: 'trial_bot_limit', message: <locked sentence> }` → the
   honest sentence renders, `trial_bot_limit` does **not**, and the
   `Could not start interview:` prefix survives.
2. start 403 `trial_expired` → the expired sentence renders, code does not.
3. Failure with `error` only (422 `unknown questionId`) → code-only fallback
   still works, proving the `error` path is intact.
4. Answer-path failure (`question out of order`) → renders
   `Could not record answer: question out of order`, proving the sibling caller
   is unchanged.
5. Body with **neither** field (500 `{}`) → the pre-existing generic
   `Could not start interview: error 500` is preserved.

## Assumptions Made
- Treated the task's stated line numbers as approximate; verified the actual
  shape from the files. `readErrorMessage` is at page.tsx:79-91 after the fix
  (was 71-78), and the `handleStart` `!res.ok` call is at :147 (was :134). The
  route's 403 is at route.ts:97 and the gallery sibling at page.tsx:76-83, both
  as stated.
- Kept the helper's existing name and signature (it is module-private, so
  renaming to `readRefusalMessage` for cross-file symmetry was not worth the
  diff against a sibling-agent-owned file being touched in the same wave).

## Open Questions for Orchestrator
- **Pre-existing red in the working tree, outside my scope (not caused by this
  task).** Four full-suite runs produced three *different* failure sets with
  byte-identical code for my two files:
  1. 6 failures — `interview.test.ts` (3), `templates.test.ts` (2),
     `dashboard/bots/[id]/page.test.tsx` (1)
  2. 7 failures (HEAD-baseline run, my files reverted) — same DB tests plus 2 in
     `lib/chat/thread.test.ts`
  3. 2 failures — `lib/chat/thread.test.ts` only
  4. 1 collection error, 0 test failures —
     `app/api/builder/verdict/route.test.ts`
  Root causes identified from files, all independent of this task:
  - **`interview.test.ts` / `templates.test.ts`** — Postgres-backed, share one
    `owner` account that accumulates bots across tests, and pass in isolation
    while failing in the full run. The file's own comment (lines 283-286) states
    the default clock was chosen so a running trial would not turn these into
    gate tests "by accident" — the KI-033 trial cap (commit d9cf8d7) then landed
    on top and made them order-dependent (one observed mismatch was
    `expected 403 to be 200`). Needs a seeding reset per test; not my scope.
  - **`app/api/builder/verdict/route.ts`** — untracked, mid-edit by a concurrent
    agent, currently does not compile:
    `TS2448/TS2454 VERDICT_MAX_TOKENS, BRIEF_MAX_TOKENS used before declaration`
    (line 128), `TS2304 Cannot find name 'askLineWindow'` (line 422), plus 3
    eslint unused-vars and a Prettier failure. This is why the *whole-app*
    typecheck/lint/format gates are red — my files pass cleanly on their own.
    Whoever owns that task should be told before the wave is gated.
  - **`lib/chat/thread.test.ts`** — already modified in the working tree by
    another in-flight change; passes in isolation (18/18), flaky in the full run.
  - This is why I did not claim a green full-suite number. Per LESSONS §1.7, the
    full gates must be run on the merged tree by the orchestrator once the
    concurrent edits settle.

## Public Interface Exposed
None. `readErrorMessage` is module-private to
`apps/web/app/interview/page.tsx` and its signature
`(res: Response, fallback: string) => Promise<string>` is unchanged. No exported
symbol, route, component prop or type was added, removed or altered.

## Known Limitations
- Verified by unit tests against stubbed responses, not by completing the flow in
  the running app. I did not boot `next dev` and drive a real 403 (that requires a
  live Postgres with an expiring trial account plus an authenticated session).
  The unit-level evidence is strong — the stub is a real `Response` object built
  from the exact body shape read out of route.ts:97, and the guards were watched
  failing against the pre-fix helper — but "a human completed the flow in the
  running app" has **not** happened for this fix. The orchestrator's Review Gate
  should exercise it live or name this explicitly.
- This task does not fix the pre-existing failures listed under Open Questions.
- No change to any other interview outcome: the 401 logged-out branch, the
  network-unreachable/offline-fallback branch, the 409 stale-draft branch, the
  status/loading transitions and the success path are all untouched.
