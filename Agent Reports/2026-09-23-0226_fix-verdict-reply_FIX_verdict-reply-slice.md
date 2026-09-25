# Task Report: fix-verdict-reply

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/builder/verdict/route.ts
- MODIFIED: apps/web/app/api/builder/verdict/route.test.ts

No other file was created, modified or deleted. `apps/web/app/dashboard/new/page.tsx` was read
read-only (see the enumeration note under Assumptions) and is untouched. No `git` command that
restores from HEAD was run (no stash / checkout -- / restore / reset), no commit, no install, no
manifest, lockfile or config change. The only incidental filesystem writes were
`apps/web/tsconfig.tsbuildinfo` (gitignored, untracked — produced by the required `npm run typecheck`)
and `.next/` output, which predates my task.

## Dependencies Added
- None. The fix reuses the `boundedView` helper already in the file; no import was added or removed.

## What changed (the whole fix, two hunks)

1. **`REPLY_TAIL_MAX = 250`** (route.ts:132) — the reply's tail proportion, half of `REPLY_MAX`,
   chosen to mirror the plan's own head/tail split (500/1000 kept over 1000).
2. **route.ts:471** — `reply.slice(0, REPLY_MAX)` → `boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX)`.

Nothing else. `REPLY_MAX` itself, `PLAN_MAX`/`THREAD_MAX`/`BRIEF_MAX`/`TURN_MAX`, the `ELLIPSIS`
marker, the gate order (401 → 403-trial → 422 → 404 → 403-budget → 409 → model), both
`recordVerdictSpend` calls, the brief clamp and the whole enqueue path are byte-identical to before.
`boundedView` is unchanged, so an in-bound reply still short-circuits to the raw string and the
over-bound result is still exactly `REPLY_MAX` characters — **the billed prompt cannot grow by a
character.**

## Assumptions Made
- **The hidden input is the defect, not the prompt.** Traced to the actual consumer:
  `buildVerdictPrompt(planText, userReply)` embeds the reply between the `Reply:` and
  `Answer with EXACTLY ...` labels in `@corvus/ai`'s persona prompt. Before the fix, only the
  reply's first 500 chars ever reached that slot, so a longer reply's acceptance was invisible to the
  judge — the mirror image of the plan-turn defect, five lines above the plan fix, in the same file.
- **`REPLY_TAIL_MAX = 250` over "raise REPLY_MAX".** Raising the bound to match the plan's 1000 would
  grow every verdict call's billed input; the kept-ends view buys the tail by dropping the middle at
  no billing cost, and it is the same mechanism, constant shape and helper the plan turn already
  uses. It is half of `REPLY_MAX`, so the head still carries the reply's substance while the tail
  carries the decision.
- **I enumerated the class rather than fixing only the reported site (LESSONS §1.2).** Grepped all of
  `apps/web` for `.slice(0, <BOUND>_MAX)` and for `boundedView`/`boundedTurn`. Result: the reply was
  the **last** head-only capped view in the verdict path. One other site remains and is **excluded
  with a reason, not missed**: `route.ts:517` `briefRaw.slice(0, BRIEF_MAX).trim()` — the brief is
  model OUTPUT, not user input; the judge is asked for its *beginning* (3-8 requirement lines), the
  clamp is a contract cap re-applied on the way out, and a kept-ends view there would corrupt the
  stored brief with a `…` marker. The other `.slice(0, N)` hits in `apps/web` (`landing-islands.tsx`
  hex parsing, `bots/[id]/page.tsx` summary, templates routes) are unrelated lengths, not bound
  truncations of a judged prompt.
- **The page side is already correct for the reply** (verified by reading, not assumed from a
  report): `page.tsx:156` bounds each turn through `boundedTurn(row.text, VERDICT_TURN_MAX,
  VERDICT_TURN_TAIL_MAX)` (2000/500, marker `\n…\n`). Its head 500 drops the *middle* of a long
  reply and keeps the last 500 verbatim, so a `reply.slice(0, 500)` at the route was the only place a
  long reply's acceptance could be lost. The route-side fix closes the class end to end; **no
  page-side follow-up is needed for the reply**.
- The test file holds its own copies of `REPLY_MAX` / `REPLY_TAIL` / the marker, the same pattern the
  page suite uses (page.test.tsx:153-156) — held locally so a route-side constant drift fails a test
  loudly rather than being silently followed. This is the known duplication debt the reviewer already
  recorded as Open Question 2; not addressed here (out of scope).

## Open Questions for Orchestrator
1. **The reviewer's Open Question 2 debt now also covers a fifth constant.**
   `REPLY_TAIL_MAX = 250` joins `2000`/`1000`/`500`/`'\n…\n'` as a value that exists as a literal in
   more than one file (route.ts:132 here, and the page's own bound in page.tsx). Nothing enforces
   the agreement beyond tests holding their own copies. Not new-in-kind, and not a defect — the
   extraction to `apps/web/lib/` is still the right later-wave fix, and this constant belongs in it.
2. **Still owed from the reviewed wave and unchanged by this task: live-path evidence.** Every test
   here is hermetic by design (no live provider, no live DB, no dev server). The Phase-3 check
   — `/dashboard/new`, a plan over 500 chars, a *reply* over 500 chars with the acceptance at its
   end, yes, inline progress — has not been run by anyone. The correct next step is a human running
   that flow in the running app; nothing in this task substitutes for it (LESSONS §2.4/§3).
3. **The reply bound's own drift failure mode is silent in one direction.** If the route's
   `REPLY_MAX` were ever made *tighter* than the page's per-turn bound, a long reply's acceptance
   would be tail-kept correctly but the reply's own substance clipped — loud only in the tests, not
   at runtime. Flagged for whoever owns the shared-constants extraction; no action here.

## Public Interface Exposed
Nothing new. `POST` and every existing test seam (`__setPool`, `__setSessionReader`,
`__resetSessionReader`, `__setBossFactory`, `__resetBossFactory`, `__setPersonaCaller`,
`__resetPersonaCaller`, `BUILDER_QUEUE`) are unchanged. `boundedView` stays module-private and
`REPLY_TAIL_MAX` is a module-private constant — no export was added. Request and response shapes
(`{ botId, turns }` in; `{ error }` / `{ verdict, started:false }` / `{ runId, phase:'queued',
verdict:'yes', briefChars }` out) are unchanged.

## Verification (evidence, not self-report)

Toolchain detected from `apps/web/package.json`, not assumed: npm workspaces, `typecheck: tsc
--noEmit`, `lint: eslint`, `test: vitest run`; `next@16.3.4`, `vitest@5.0.0`.

| # | Command (as run) | Result |
|---|---|---|
| 1 | `npx vitest run app/api/builder/verdict/route.test.ts` (cwd `apps/web`) | **30 passed / 30** (27 pre-existing + 3 new), 0 failed |
| 2 | `npm run typecheck` (repo root) | **exit 0** — all five workspaces (`gateway`, `testbot`, `web`, `ai`, `spec`) |
| 3 | `npx eslint --max-warnings 0` on both touched files (root config) | **exit 0**, 0 warnings |
| 4 | `npx prettier --check` on both touched files | **"All matched files use Prettier code style!"** |
| 5 | `npx vitest run` (cwd `apps/web`, full suite) | **58 files, 764 passed, 69 skipped, 0 failed** |

Row 5 versus the reviewer's pre-task baseline of 761 passed: exactly +3, the three tests added here —
so no pre-existing test was broken and nothing outside my scope moved. (The reviewer's 761 figure is
from Check 1f of `2026-09-23-0211_reviewer_REVIEW_verdict-pair.md`.)

### Guard validation — the new tests are load-bearing (LESSONS §8)

A guard is not a guard until the thing it guards has been broken and watched to fail. Applied and
reverted **twice** to catch a helper mistake (see below), never via git:

| Step | Action | Result |
|---|---|---|
| a | `boundedView(reply, …)` → `reply.slice(0, REPLY_MAX)` (the pre-fix line), run suite | **2 failed | 28 passed** — exactly the 2 new over-bound tests; the in-bound test correctly still passes (head-only *is* identity when the reply already fits, which is the honest signature of this defect) |
| b | Read the failure text | First test: `expected { verdict: 'unclear', started: false } to match object { phase: 'queued', verdict: 'yes' }` — **the exact symptom the reviewer measured**: the acceptance is invisible, the verdict degrades to `unclear`, nothing starts |
| c | Restore the fix, `sha256sum` + `cmp` against the post-fix copy kept OUTSIDE the repo | `942233938763ee7758b09ee0b695306bfce295f64eab9453d80f545dab26c6df`, `cmp` exit 0 — **byte-identical** |
| d | After strengthening the test helper, re-applied the mutation and re-ran | Same **2 failed | 28 passed** — the mutation is still caught by the strengthened assertions, not only by the original weak ones |
| e | Restore again, `sha256sum` + `cmp` | Same hash, `cmp` exit 0 |

Why step (d) exists: my first helper extracted the prompt block between `Reply:` and
`Answer with EXACTLY` **including** the two newlines `Array.prototype.join('\n')` contributes, and one
of my first-draft fixtures was only 450 chars — under the bound, so it proved nothing. Both were
caught by running the suite (`2 failed`), not by reading it: the length assertion reported `502` where
`500` was expected, which is exactly the join's two newlines. The helper now strips one newline per
side and the fixture is 573 chars with the acceptance starting at index 560. The mutation run in (d)
is the confirmation that the corrected instrument is still sensitive to the defect.

No `git` restore/stash/checkout/reset was used at any point. Both baseline copies live outside the
repo, at
`%TEMP%\verdict-reply-baseline\` (pre-fix) and `%TEMP%\verdict-reply-postfix\` (post-fix) — the latter
is what the `cmp` in steps (c) and (e) compared against.

### New tests (3, in a new `the reply keeps its END` describe)

1. **A 573-char reply whose acceptance starts past `REPLY_MAX` is judged `yes` and starts the run.**
   Uses a stub judge that approves only when the acceptance is visible in the reply it was handed —
   so the verdict itself is the assertion, not just the prompt text. Asserts `verdict:'yes'`,
   `phase:'queued'`, a real `runId`, **1 `builder_runs` row**, **1 job sent**, 2 lane calls (verdict +
   brief), and the acceptance present in the reply the judge read.
2. **The over-bound view is exactly `REPLY_MAX` chars, acceptance kept at the end.** Asserts the view
   length is `500`, carries the marker, ends with the reply's own last `REPLY_TAIL` chars verbatim,
   and ends with the acceptance — i.e. the tail is bought by dropping the middle, and the billed
   input did not grow.
3. **An in-bound reply travels byte-identical.** A 500-char reply (exactly at the bound) is asserted
   `toBe` the raw string with no marker — a view that fits is never rewritten, so an ordinary reply
   is billed exactly as written.

The prompt bytes are read by slicing between the `Reply:` and `Answer with EXACTLY` labels and
trimming the one join newline per side, so a match cannot be a false positive from the plan text
(which is in the same prompt).

### Secrets / scope
No secret, credential, token, connection string or live key was read, printed, copied or transmitted.
The diff contains no credential values; the route reads no key (the lane owns keys). No manifest,
lockfile or config was touched; no dependency was added, removed or version-changed; no install was
run.

## Known Limitations
- **No live-path evidence.** All tests are hermetic by design (mocked pool, boss and persona lane per
  the SPEC). The real flow — a person writing a long justification that ends in "yes, go ahead" and
  watching the build start — has not been exercised. See Open Question 2; a human still owes it and
  the report that closes this wave must name them.
- **The fix is verified at the prompt boundary, not at a provider boundary.** "The judge sees the
  acceptance" is proven by asserting the bytes handed to `personaCaller`. Whether any specific model
  then returns `yes` for a given long reply is a model-behaviour question my stub deliberately
  simplifies — the stub's rule (acceptance visible → yes) is the contract the prompt states, not a
  measurement of a real model.
- **`REPLY_MAX` still truncates a reply that is long enough for its head-side substance to matter.**
  The view keeps the head 250 minus the 3-char marker and the tail 250; a reply whose *reasoning*
  past char 247 is load-bearing would lose it. That is the intended trade against an unbounded billed
  prompt, and it matches how the plan turn and the thread already behave — but it is a real trade,
  not a free win.
- **The duplicated-constants debt (Open Question 1) is unchanged.** Five values now live as literals
  in more than one file with nothing but tests keeping them in step.
- No production system, box, SSH, GHCR, Contabo, live key or `.env` was contacted; no git commit,
  push or restoring command was run.
