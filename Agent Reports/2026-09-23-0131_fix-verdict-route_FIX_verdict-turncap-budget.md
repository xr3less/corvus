# Task Report: fix-verdict-route

## Status
SUCCESS (with one escalated out-of-scope item — see Open Questions)

## Files Touched
- MODIFIED: apps/web/app/api/builder/verdict/route.ts
- MODIFIED: apps/web/app/api/builder/verdict/route.test.ts

No other file was created, modified or deleted. `apps/web/app/dashboard/new/page.tsx`,
`packages/ai/src/budget.ts` and `apps/web/app/api/chat/route.ts` were read-only context and are
untouched by this task (both `chat/route.ts` and `page.tsx` show pre-existing changes in
`git status` from an earlier wave — not from me).

## Dependencies Added
- None. `checkBudget`, `isPlanTier` and `toCredits` were already exported from the existing
  `@corvus/ai` dependency (verified in `packages/ai/dist/{index,budget,cost}.d.ts`, the built
  artifact this package resolves through). No manifest, lockfile or version was touched.

## Defect A — 500-char per-turn cap truncated the plan's ask line

**Cause.** `TURN_MAX = 500` (route.ts:63 pre-fix) both rejected long turns with 422 and bounded
the plan text the judge and the ask-line check could see. A plan turn is a normal chat turn and
`POST /api/chat` accepts 2000-char history turns, so a 501-2000-char plan was ordinary chat state
that this route could not process.

**Fix (two parts, both inside the locked contract):**

1. `TURN_MAX` raised 500 -> 2000, matching `POST /api/chat`'s `MESSAGE_MAX`. The body bound is now
   shape validation, not a token control — it can no longer refuse a plan the chat route stored.
2. New `boundedView(text, max, tailMax)` helper (route.ts:135) replaces the head-only
   `.slice(0, MAX)` at all three sites. It returns the text unchanged when it already fits, and
   otherwise keeps BOTH ends, dropping the middle behind a `…` marker. The result is exactly `max`
   characters, so **the billed prompt did not grow by a single character**.

   - ask-line check (route.ts:448): `boundedView(planTurn.content, PLAN_MAX, PLAN_TAIL_MAX)`
   - verdict prompt plan arg (route.ts:463): same view
   - brief thread (route.ts:489): `boundedView(thread, THREAD_MAX, THREAD_TAIL_MAX)`

   This is what makes the ask-line check see the plan's END, as the fix direction required. It was
   chosen over a tail-only window because a tail slice would drop the plan's *substance* while the
   judge is asked to judge the reply "against THIS plan only" — and because the thread text has
   the same defect in the same shape (the confirmed plan ends the thread), so one helper fixes the
   whole class rather than the one call site that surfaced it (LESSONS §1.2).

**Preserved:** `ASK_LINE` string unchanged; `PLAN_MAX`/`REPLY_MAX`/`THREAD_MAX` unchanged; brief
`1..2000` clamp unchanged (still `.slice(0, BRIEF_MAX).trim()` -> 422 `empty_brief`); gate order
unchanged.

## Defect B — no monthly-allowance gate on the two billable persona calls

**Cause.** The route ran `buildVerdictPrompt` and `buildBriefPrompt` through the persona lane with
no budget check anywhere in the file, while the parity reference (`apps/web/app/api/chat/route.ts`)
gates every persona turn. Both calls were metered *after* the fact via `recordVerdictSpend`, so an
exhausted account was billed for verdicts it had no allowance for.

**Fix.** A `checkBudget` pre-check before the first billable call, positioned with the other
pre-model gates — after the 404 ownership read, before the 409 ask-line gate:

- `estimatedCredits: VERDICT_CALL_CREDITS` — new constant, `toCredits(((VERDICT_MAX_TOKENS +
  BRIEF_MAX_TOKENS) / 1e6) * 4.4)`, i.e. it pre-authorizes BOTH calls in one check so a `yes`
  brief can never spend past an allowance the verdict alone fit inside. 4.4 is the persona lane's
  most expensive output price (wiro `glm/5-2`, `lanes.ts`); the file states no credit count of its
  own, USD->credits goes through the shared meter. Value: 1.1264 credits.
- `tier: isPlanTier(session.tier) ? session.tier : undefined` — the same pre-gate both current
  callers use, so the guard's prototype-key path (`budget.ts:90`) cannot be reached. Unknown/absent
  tier falls back to the guard's own trial default.
- Refusal: `403 { error: 'trial_budget_exceeded', message: budgetRefusalMessage(...) }`.
- Read failure: honest `500 'could not check your AI credits'` (mirrors chat), never a fabricated
  refusal and never a fake allow.
- `recordVerdictSpend` is unchanged and still runs on both allowed calls.

**Copy is byte-identical to chat, not a paraphrase.** `TRIAL_BUDGET_MESSAGE` is the chat route's
trial-branch sentence verbatim (`'Your 3-day trial has used its 100 AI credits for this month.
Nothing is deleted.'`), and the paid branch reproduces chat's template
(`` `This month's ${allowance} AI credits are used up. Nothing is deleted.` ``) with the allowance
the meter actually resolved, so a paying account is never told its trial ended.

## Assumptions Made
- **`TRIAL_BUDGET_MESSAGE` and `budgetRefusalMessage`/`onTrial` are deliberately duplicated as
  string literals, not imported from chat's route module.** Both the chat helpers and the locked
  sentence are module-private in `apps/web/app/api/chat/route.ts`; importing a route module into
  another route would create a route-to-route dependency and pull chat's SSE machinery into the
  verdict bundle. Extracting them to a shared lib is the right end state but is outside this
  task's two-file scope (it would need a new file plus a chat/route.ts edit). Flagged below.
- `PLAN_TAIL_MAX = 500` / `THREAD_TAIL_MAX = 1000`: the plan turn's last 500 chars cover 2-4
  bullets plus the ask line (a 234-char realistic plan measures well inside it); the thread's last
  1000 chars cover the plan and the reply that confirms it. Both are inside the existing
  `PLAN_MAX`/`THREAD_MAX` totals, so the billed size is unchanged.
- The turns *count* bound (12) was left alone — the task scoped the defect to the per-turn cap.
- `VERDICT_CALL_CREDITS` sums both token caps rather than the verdict cap alone; this is the
  conservative direction (a stricter gate), so it cannot widen spend.

## Open Questions for Orchestrator
1. **ESCALATION — page-side head-slice still truncates the plan turn before it is sent.**
   `apps/web/app/dashboard/new/page.tsx:128` still maps every row through
   `row.text.slice(0, VERDICT_TURN_MAX)` with `VERDICT_TURN_MAX = 500` (page.tsx:41). For a plan
   turn longer than 500 chars the page sends an ask-line-less 500-char head, so **the UI path
   still gets a 409 and "yes" still starts nothing silently**. This task forbade touching that file
   and instructed escalation instead, so I did not edit it. Measured on the wire:

   | plan turn | page sends | ask line survives page slice |
   |---|---|---|
   | 400 | 400 | yes |
   | 500 | 500 | yes |
   | 501 | 500 | **no** |
   | 1500 | 500 | **no** |
   | 2000 | 500 | **no** |

   The server fix is a strict widening and is complete on its own: a direct caller sending the
   full turn now passes validation and reaches the judge (the route-level defect A is closed). The
   remaining break is entirely page-side and needs a one-line change (`slice(0, VERDICT_TURN_MAX)`
   -> keep the head-or-tail, or raise the page constant to 2000 to match the route). Verify the
   page constant against the route on whichever wave owns that file. **This route alone does not
   make the founder-facing symptom go away.**
2. **Shared-copy extraction.** The budget refusal sentence now exists in two files. If a later
   wave owns `apps/web/lib/`, the four locked strings (`TRIAL_ENDED_MESSAGE`, `TRIAL_BUDGET_MESSAGE`,
   the paid template, and the 500 code) are the natural contents of one shared module. Not done
   here — out of scope.
3. `budget.ts:90` (prototype-key path) was left untouched as instructed; it is unreachable through
   this route because of the `isPlanTier` pre-gate.

## Public Interface Exposed
No new exports. `POST` and the existing test seams (`__setPool`, `__setSessionReader`,
`__resetSessionReader`, `__setBossFactory`, `__resetBossFactory`, `__setPersonaCaller`,
`__resetPersonaCaller`, `BUILDER_QUEUE`) are unchanged.

Gate order, verified by line and by test:

`401 unauthorized` (route.ts:349) -> `403 trial_expired` before body (:359) -> `422 invalid bot id`
(:372) / `422 turns` (:377) -> `404 bot not found` (:397) -> `500` allowance-read failure (:426) ->
`403 trial_budget_exceeded` + locked message (:436) -> `409 no_plan_asked` (:449) -> model ->
`200 { verdict, started:false }` (:483) / `200 { runId, phase:'queued', verdict:'yes', briefChars }`
(:563) / `422 empty_brief` (:512).

Response shapes for the yes-path job are untouched: `singletonKey=runId`, `retryLimit 3`,
`retryDelay 30`, `expireInSeconds 3600`, `deleteAfterSeconds 604800`, and 2 `ai_spend` rows.

## Verification (evidence, not self-report)

Toolchain detected from `apps/web/package.json` (npm workspaces; `typecheck: tsc --noEmit`,
`lint: eslint`, `test: vitest run`).

- **Focused suite:** `npx vitest run app/api/builder/verdict/route.test.ts` from `apps/web` —
  **27 passed / 27** (19 pre-existing + 8 new). All 19 pre-existing tests still pass.
- **Full web suite:** `npx vitest run` from `apps/web` — **58 files, 754 passed, 69 skipped, 0
  failed.** (An earlier run invoked with `--root apps/web` from the repo root reported 2 failures —
  `app/pryzm/page.test.tsx` and `app/dashboard/new/page.test.tsx`. Both are `process.cwd()`
  artifacts of that invocation, not real: they `readFileSync(join(process.cwd(), ...))`, so the
  repo-root cwd resolved the paths one directory too high. Re-run from `apps/web`, both pass.)
- **Root gates:** `npm run typecheck` exit 0; `npm run lint` exit 0 (`--max-warnings 0` across all
  workspaces); `npm run format` exit 0; `prettier --check` on both changed files clean.
- **Mutation checks (a guard is not a guard until it has been broken and watched to fail).** Each
  mutation was applied to a copy, run, and the file restored byte-identical (SHA256 verified equal
  before/after: `e5b1f8ab69c376da1d5c00bbbe57bc0cb4f71053b7167eeb997a9a8587319e44`). No git
  restore/stash/checkout was used; the baseline copy lives outside the repo.
  - **A** `boundedView` -> head-only `slice(0, max)` — the original defect — **3 tests fail**
    (long-plan-turn reaches judge; buried-ask-line still 409; billed-input cap). Proves the
    kept-ends view is load-bearing.
  - **B** budget refusal disabled (`if (!budget.ok)` -> `if (false)`) — **3 tests fail**
    (exhausted-allowance 403; allowance-before-ask-line; paid-allowance sentence). Proves the gate
    is load-bearing.
  - **C** `estimatedCredits: VERDICT_CALL_CREDITS` -> `0` (gate becomes a no-op) — **2 tests fail**.
    Proves the estimate, not just the branch, is load-bearing.

### New tests (8)
1. Accepts a 1500-char plan turn whose END carries the ask line, and asserts the billed plan view
   carries it — no 422, no 409.
2. Still answers 409 when the ask line sits in the dropped MIDDLE of a 1227-char turn (proves the
   gate is not a blanket "anywhere in the turn" pass).
3. Billed input cap: a full 2000-char turn is billed as exactly 1000 chars, ask line still present.
4. Exhausted allowance -> 403 with the chat copy **byte-for-byte**, zero lane calls, zero
   `builder_runs` INSERTs, zero `ai_spend` INSERTs, zero jobs.
5. Allowance is read BEFORE the ask-line gate (a no-ask-line request on an exhausted account still
   gets 403, not 409) — pins the gate position.
6. Boundary: `spent + estimate <= allowance` is allowed (98.87 is in; 99.99 is out).
7. Unreadable meter -> honest 500 `could not check your AI credits`, zero lane calls, cause logged.
8. Paid tier -> names the resolved 2000-credit allowance, never the trial sentence.

`fakeDb` gained a `SUM(credits)` branch (Postgres returns a numeric as a string, exercised with
`'99.99'`) plus `spent`/`failSpent` options, and a new `allowanceReads` filter keeps the read from
ever being counted as a spend write. All existing pool/boss/persona seams preserved.

## Known Limitations
- **The founder-facing symptom is only half-fixed.** The route now accepts and correctly judges a
  long plan turn, but the dashboard page still head-slices the turn to 500 chars before sending,
  so the UI path still 409s on a >500-char plan. Needs the page-side one-liner (Open Question 1).
- The verdict and brief calls are pre-authorized as ONE combined estimate. A `yes` whose brief is
  priced above the verdict's own headroom is refused up front rather than part-way through; that is
  the conservative direction but it means the refusal can land on a request whose verdict call
  alone would have fit.
- The budget gate reads the month's spend once per request, so two concurrent verdicts can both
  pass the same check. Same behaviour as the chat route and the builder worker — no new race
  introduced, and none fixed.
- `boundedView` costs one extra `slice` per call; no measurable effect, no allocation change of
  note (the result is the same length as the old slice).
- No live provider or live DB was exercised — all tests are hermetic by design per the SPEC. The
  reviewer's Phase-3 "real path" check (dev server, `/dashboard/new`, plan -> yes -> inline
  progress) is still owed, and per Open Question 1 it will still fail for plans over 500 chars
  until the page side is fixed.
- No secrets were printed, copied or transmitted; the diff contains no credential values and the
  route reads no key (the lane owns keys).
