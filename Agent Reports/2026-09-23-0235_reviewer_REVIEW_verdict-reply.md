# Task Report: reviewer-verdict-reply

## Status

**PASS** — all gates green and the contract is closed at the byte level.

Independent verdict on the one-line-class reply-slice fix: **the founder symptom is CLOSED at the
contract level.** A reply of 501 – 10000 chars whose acceptance sits at its END now reaches the judge
intact, the verdict reads `yes`, and the run starts. The reviewer's own Open Question 1 — the defect
this fix claims to close — is the defect I re-measured and can no longer reproduce: **END-TO-END
BREAKS: 0**, where the pre-fix slice broke at every length above 500.

The one thing this review does **not** claim is live-path evidence. No dev server, real account,
provider, DB or box was contacted (read-only brief: no key, no SSH, no prod). That check remains owed
and is named in Known Limitations.

## Files Touched

- CREATED: Agent Reports/2026-09-23-0235_reviewer_REVIEW_verdict-reply.md

No source file, manifest, lockfile or config was created, modified or deleted by this review. No
`git` command that restores from HEAD was run (no stash / `checkout --` / restore / reset), no commit,
no install. Every mutation I applied was served **in memory** through a `load` hook in a config that
lives **outside the repo** (`%TEMP%\vr-shadow\`), so the shipped files were never written to — proven
by SHA256 + `cmp` after the runs (Check 3d).

## Dependencies Added

- None.

## Assumptions Made

- "Closed" is asserted at the **contract level** (page output → route input → the bytes handed to the
  lane), byte-traced with constants and function bodies **extracted programmatically from the real
  source text**, not transcribed by hand and not taken from the builder's summary. The suites are
  hermetic by design, so no test in the tree crosses the page↔route boundary; I built the bridge
  myself rather than accepting either report's word.
- The mutation harness is an **out-of-repo shadow config**, not a second test file: my write scope is
  one report, so I could not add a mutation test inside the repo. The harness loads the **real**
  `route.test.ts` and the **real** vitest config values, and injects only the mutated route text — so
  the tests that failed are the shipped tests, not copies I wrote.
- `PASS` does not mean "no findings". One same-class site survives by design, the duplicated-constant
  debt is unchanged, and live-path evidence is still owed. All three are recorded below; none of them
  is on the corrected path.

## Open Questions for Orchestrator

1. **The duplicated-constant debt now covers five values, not four.** `500` / `250` / `"\n…\n"` live
   as literals in both `route.ts` (:117, :132, :135) and `route.test.ts` (:212-214), and `2000` /
   `500` / the marker again in `page.tsx` (:45, :49, :53) and `page.test.tsx`. Nothing enforces
   agreement beyond tests that hold their **own** copies. I verified the copies match **today**
   (all three match), so this is maintainability debt, not an open defect. It is the same item the
   previous reviewer raised as Open Question 2, and the builder correctly declined to widen scope.
   The `apps/web/lib/` extraction remains the right later-wave fix and this constant belongs in it.
2. **Live-path evidence is still owed and is still nobody's.** Every test in this wave is hermetic.
   The Phase-3 check — `/dashboard/new` → a plan → a reply over 500 chars whose acceptance is at its
   END → inline progress — has now been owed across two waves. The report that closes this wave must
   **name the human** who ran it (LESSONS §2.4 / §3). A contract-level proof is not a substitute.
3. **The reply bound's drift failure mode is silent in one direction.** If `REPLY_MAX` were ever made
   *tighter* than the page's per-turn bound, a long reply's acceptance would be tail-kept correctly
   but the reply's own substance clipped — loud only in the tests, not at runtime. Belongs to the
   shared-constants extraction above. No action here.

## Public Interface Exposed

Nothing new. Every export is unchanged: `POST`, and the existing test seams (`__setPool`,
`__setSessionReader`, `__resetSessionReader`, `__setBossFactory`, `__resetBossFactory`,
`__setPersonaCaller`, `__resetPersonaCaller`, `BUILDER_QUEUE`, and the `VerdictSession` /
`VerdictSessionReader` / `BuilderBoss` / `PersonaResult` / `PersonaCaller` / `Verdict` types).
`boundedView` stays module-private and `REPLY_TAIL_MAX` is a module-private constant — **no export was
added** (verified by listing every `^export` in the file). Request shape (`{ botId, turns }`) and every
response shape (`{ error }` / `{ verdict, started:false }` / `{ runId, phase:'queued', verdict:'yes',
briefChars }`) are unchanged.

---

## Check 1 — Does it actually work?

Toolchain **detected, not assumed**: npm workspaces (root `package.json`: `"workspaces": ["apps/*",
"packages/*"]`, `package-lock.json` present, no pnpm/yarn/bun lockfile). `apps/web/package.json`
carries `typecheck: tsc --noEmit`, `lint: eslint`, `test: vitest run`; web runtime `next@16.3.4`,
`vitest@5.0.0`, `react@19.2.8`, `typescript@5.9.3`, `prettier@3.9.6`.
Note for the record: the **root** `node_modules/vitest` is 3.2.7 while `apps/web/node_modules/vitest`
is 5.0.0 — all web commands must resolve the workspace-local one (my first mutation-harness attempt
was run with the root binary and misreported the version; corrected below).

| # | Command (as run) | Result |
|---|---|---|
| 1a | `npx vitest run app/api/builder/verdict/route.test.ts` (cwd `apps/web`) | **30 passed / 30**, 0 failed |
| 1b | same, `--reporter=verbose` (names read) | 27 pre-existing + **3 new** under `the reply keeps its END` — matches the report's split exactly |
| 1c | **PRE-FIX baseline run** (builder's out-of-repo `route.ts` **and** `route.test.ts`, served in memory) | **27 passed / 27** — the "27 pre-existing" claim is independently reproduced, not inferred |
| 1d | `npm run typecheck` (repo root) | **exit 0** — all five workspaces (`gateway`, `testbot`, `web`, `ai`, `spec`) |
| 1e | `npx eslint --max-warnings 0` on both touched files (root config) | **exit 0** |
| 1f | `npm run lint` (root, `eslint . --max-warnings 0`) | **exit 0** |
| 1g | `npx prettier --check` on both touched files | **"All matched files use Prettier code style!"** |
| 1h | `npx vitest run` (cwd `apps/web`, full suite) | **58 files, 764 passed, 69 skipped, 0 failed** |
| 1i | `npm run build --workspace @corvus/web` | **exit 0**; "Compiled successfully"; `/api/builder/verdict` ƒ in the route manifest |

Row 1h versus the prior reviewer's pre-task baseline of 761: **exactly +3, with 0 failures** — the
three added tests and nothing else. **The full suite is green**: no pre-existing red exists to
excuse, so no out-of-scope file needed touching and none was touched. Row 1c is the check that makes
the "+3 over 761" arithmetic mean something: I did not take the 761 figure on trust, I re-ran the
pre-fix tree and got 27.

### 1j — The byte trace (the core claim, independently derived)

I extracted the constants and both helper bodies **from the source text programmatically** (string
index search + a brace-matching body extractor — nothing hand-transcribed; backslash escapes were
re-derived from code points because the shell heredoc strips them):

```
ROUTE constants: TURN_MAX 2000 | PLAN_MAX 1000 | REPLY_MAX 500 | PLAN_TAIL_MAX 500
                 REPLY_TAIL_MAX 250 | THREAD_MAX 3000 | THREAD_TAIL_MAX 1000 | BRIEF_MAX 2000
PAGE  constants: VERDICT_TURN_MAX 2000 | VERDICT_TURN_TAIL_MAX 500 | VERDICT_TURNS_MAX 12
marker real chars  route "\n…\n"  codes 10,8230,10  len 3
marker real chars  page  "\n…\n"  codes 10,8230,10  len 3
marker byte-identical route/page: true
ROUTE boundedView body: {if(text.length<=max)returntext;consttail=text.slice(-tailMax);return`${text.slice(0,max-tailMax-ELLIPSIS.length)}${ELLIPSIS}${tail}`;}
PAGE  boundedTurn  body: {if(text.length<=max)returntext;consttail=text.slice(-tailMax);return`${text.slice(0,max-tailMax-TURN_ELLIPSIS.length)}${TURN_ELLIPSIS}${tail}`;}
BODIES IDENTICAL modulo marker name: true
PARITY per-turn bound route/web: 2000 2000 true | turns count 12 true
PRECONDITION tail+marker<max | route-reply true | route-plan true | route-thread true | page true
```

A reply whose END carries the acceptance, traced through `boundedTurn(…,2000,500)` (page) →
`routeAccepts(≤2000)` → `boundedView(…,500,250)` (route) → the real `buildVerdictPrompt` line layout
(read from `packages/ai/src/persona-prompt.ts`) → the same `replyView` extraction the shipped test
uses:

| raw reply | page sends | route accepts | view len | accept ends view | judge saw accept | in-bound byte-identical | **head-only would see** | END TO END |
|---|---|---|---|---|---|---|---|---|
| 13 | 13 | yes | 13 | yes | yes | **yes** | yes | **CLOSED** |
| 250 | 250 | yes | 250 | yes | yes | **yes** | yes | **CLOSED** |
| 500 | 500 | yes | 500 | yes | yes | **yes** | yes | **CLOSED** |
| 501 | 501 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 573 | 573 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 700 | 700 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 900 | 900 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 1500 | 1500 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 2000 | 2000 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 2001 | 2000 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 3000 | 2000 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |
| 10000 | 2000 | yes | 500 | yes | yes | n/a | **no** | **CLOSED** |

**END-TO-END BREAKS: 0.** The `head-only would see` column is the honesty half of this table: at every
length above the bound the pre-fix slice **cannot** contain the acceptance, so the instrument is
demonstrably sensitive to the defect it is being used to declare closed — it is not a trace that
would say "closed" about anything.

Additional invariants, same instrument:
- **Over-bound result is exactly `REPLY_MAX`** for 501 / 573 / 700 / 900 / 1500 / 2000 / 2001 / 3000 /
  10000: `true`. A page-capped turn can never be 422'd by the route.
- **In-bound replies travel byte-identical** (no marker, no padding, no rewrite) at 13 / 250 / 500:
  `true`.
- **The billed reply length never exceeds `REPLY_MAX`** at any length tested: `true`.
- **Billed input did not grow — proven exhaustively, not sampled.** For every reply length 0…4000,
  the kept-ends view length equals the old head-only view length in **100 % of cases** (`VIEW LONGER
  THAN BEFORE: 0`, `VIEW LENGTH DIFFERS: 0`); the bytes differ only above the bound (3500 cases),
  which *is* the fix. So the fix buys the tail by dropping the middle and cannot add a character to
  the prompt.
- **The test's extraction helper is not a false positive.** Reconstructed from source text and applied
  to the real prompt layout, `replyView` returns **exactly** the billed reply view (500 chars,
  acceptance present) — and the plan text contains neither the acceptance string nor the `Reply:`
  label, so a match cannot come from the plan sharing the same prompt.

### 1k — Gate order, read at the line (shipped source, line numbers)

`401` :356 → `403 trial_expired` :366 **before** `await req.json()` :372 → `422 invalid bot id` :379
→ `422 turns` :384 → `500` db-unconfigured/unowned-read :399/:401 → `404 bot not found` :404 →
`403 trial_budget_exceeded` :443 (and honest `500` on an unreadable meter :433) → `409 no_plan_asked`
:456 → model verdict :465 → `recordVerdictSpend` :484 → brief model :504 → `recordVerdictSpend` :513
→ `422 empty_brief` :519 → INSERT row → boss send → `200 {runId, phase:'queued', verdict:'yes',
briefChars}`.

**Matches the reported order exactly**, and the test-pinned positions still back it (trial-clock-
before-body `route.test.ts:277`, no-plan-asked `:374`, budget-before-ask-line `:840`, 404-never-403
`:333`, soft-delete predicate `:351`). Nothing in this fix moved a gate: the two `recordVerdictSpend`
calls and both `checkBudget` shapes are where they were.

## Check 2 — Contract match

### 2a — The whole fix, measured rather than described

Diffing the builder's out-of-repo **pre-fix** baseline against the shipped file yields **exactly two
hunks and nothing else**: the `REPLY_TAIL_MAX = 250` constant (with its comment) and the one call
change `reply.slice(0, REPLY_MAX)` → `boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX)`. `REPLY_MAX`,
`PLAN_MAX`/`PLAN_TAIL_MAX`/`THREAD_MAX`/`THREAD_TAIL_MAX`/`BRIEF_MAX`/`TURN_MAX`, `ELLIPSIS`,
`boundedView` itself, both metering calls, the brief clamp and the whole enqueue path are untouched.
The baseline file is genuinely pre-fix (contains `reply.slice(0, REPLY_MAX)`, contains no
`REPLY_TAIL_MAX`) — I validated the instrument before using it.

### 2b — POST shape and validation agree

Page (`page.tsx:158-162`) sends exactly `{ botId, turns }`; each turn is
`boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX)`. Route `validateTurns` requires an
array ≤ 12, role exactly `'user' | 'assistant'`, non-empty trimmed content ≤ `TURN_MAX`. Page turn
count 12 = route 12 (`P.TURNS_MAX === 12` ⇒ true), and per-turn bound 2000 = 2000. **No drift.**

### 2c — The page side already preserves the reply tail — verified by reading, and it is the SAME code

`page.tsx:156` bounds each turn through `boundedTurn(row.text, VERDICT_TURN_MAX,
VERDICT_TURN_TAIL_MAX)` (2000/500, marker `\n…\n`). I did not take this on trust: I extracted both
helper bodies from source text and they are **identical modulo the marker's identifier name** (shown
in 1j). A page-capped reply keeps its last 500 chars verbatim, so the route's head-only slice was the
only place a long reply's acceptance could be lost. **No page-side follow-up is needed**, and the page
needs no change for this fix.

### 2d — Constants

Route `REPLY_MAX 500 / REPLY_TAIL_MAX 250 / ELLIPSIS` and the test file's own `REPLY_MAX 500 /
REPLY_TAIL 250 / ELLIPSIS` **all match today** (verified by extracting both). The page's `2000 / 500`
and the route's `TURN_MAX 2000` match, and the marker is byte-identical across both files including
its code points. The drift failure mode remains loud in the direction that matters (a route bound
tighter than the page's would clip the reply's substance but fail the tests).

## Check 3 — Code quality

### 3a — Security / secrets
`grep -nEi "api[_-]?key|secret|token|password|bearer|sk-[a-z0-9]{8}|ghp_|postgres://|postgresql://|
BEGIN … PRIVATE KEY"` over both touched files returns **only prose and identifier matches**
(`VERDICT_MAX_TOKENS`, `BRIEF_MAX_TOKENS`, "token discipline" comments, `maxTokens`,
`PERSONA_MAX_OUTPUT_USD_PER_MTOKEN`). No credential value, no connection string, no key read — the
route's header states the lane owns keys and the route touches none. No secret value was read,
printed, copied or transmitted by this review.

### 3b — Scope
- Only **two** files exist under `apps/web/app/api/builder/verdict/` (`route.ts`, `route.test.ts`),
  both untracked/new — matching the builder's declaration exactly.
- `page.tsx` (02:08) and `page.test.tsx` (02:07) **predate** the fix (02:29-02:30), so the page was
  not touched. Cross-checked by mtime against every other modified tracked file under `apps/web`: the
  newest before the fix is 02:08 and the next newest is 01:50 — nothing else moved in the fix window.
- The other dirty entries in `git status` (`chat/route.ts`, `spec/publish`, `spec/rollback`,
  `api/checkout/`, `api/webhooks/`, `components/ui/*`, `lib/chat/thread.ts`, `packages/ai/*`) are the
  **pre-existing earlier waves** — all mtimes 09-20 → 09-22 or 01:34-01:47, none in the fix window.
- No manifest, lockfile, `.env` or config touched; no dependency added, removed or version-changed;
  no install run (`package-lock.json` mtime Sep 20 11:09, days before this wave).
- **No route-to-client bundle leak:** `page.tsx` references `/api/builder/verdict` only as a fetch URL
  string; a grep for any import of the route module across `apps/web` returns nothing.

### 3c — Class enumeration (LESSONS §1.2 — the class, not the call site)
Repo-wide, non-test, the only remaining bound-style head-slice is **`route.ts:517`
`briefRaw.slice(0, BRIEF_MAX).trim()`**. I confirm the exclusion is **sound, not a miss**: the brief is
model **output** distilled into 3-8 requirement lines, the prompt asks for its *beginning*, the clamp
is a contract cap re-applied on the way out, and a kept-ends view would inject the `\n…\n` marker into
**stored data**. The other `.slice(0, N)` hits (`templates/[slug]/fork` 500, `bots/[id]` summary 500,
`landing-islands` hex parse, page's `deriveBotName` 32) are unrelated lengths, not bound truncations
of a judged prompt. `apps/web/app/api/chat/route.ts` (the only other model-facing route) **422s** a
message over its 2000 bound (`route.ts:202-203`) rather than silently slicing it, so it is not a
member of this class.

### 3d — Guard validation: I broke the thing this fix guards and watched the shipped tests fail

A guard is not a guard until the thing it guards has been broken and watched to fail (LESSONS §8). I
ran the **real, unmodified `route.test.ts`** against a **head-only mutated** route — the mutation
applied in memory by an out-of-repo config's `load` hook (the target string occurs exactly **once** in
the source, asserted before the run):

| Step | Action | Result |
|---|---|---|
| a | Serve `reply.slice(0, REPLY_MAX)` in place of `boundedView(reply, …)`; run the shipped 30-test suite | **2 failed \| 28 passed** — exactly the 2 new over-bound tests |
| b | Read the failure text | `AssertionError: expected { verdict: 'unclear', started: false } to match object { phase: 'queued', verdict: 'yes' }` — **the founder's exact symptom**: the acceptance is invisible, the verdict degrades to `unclear`, nothing starts |
| c | The second failure | `expected 'xxxx…' to contain '\n…\n'` — the head-only view has no marker and no tail |
| d | Verify the shipped files were never written to | `sha256sum` + `cmp` vs the pre-run out-of-repo copies: **byte-identical** (route.ts `942233938763ee7758b09ee0b695306bfce295f64eab9453d80f545dab26c6df`, test `81ebe1cf78…`), mtimes unchanged (02:30:09 / 02:29:40) |
| e | Cross-check the +/- two-sides reading | The in-bound test correctly **still passes** under the mutation (head-only *is* identity when the reply already fits) — the honest signature of this defect, and it confirms the instrument discriminates rather than failing blanket |

No `git` restore/stash/checkout/reset at any point; no file inside the repo was written by the
harness.

### 3e — Trust artifacts, not summaries
```
12801 Sep 23 02:31  Agent Reports/2026-09-23-0226_fix-verdict-reply_FIX_verdict-reply-slice.md
22816 Sep 23 02:30  apps/web/app/api/builder/verdict/route.ts
34668 Sep 23 02:29  apps/web/app/api/builder/verdict/route.test.ts
```
The report exists at the claimed path. Both source mtimes **postdate** the reviewed wave's page work
(02:07-02:08) and **predate** every command in this review (02:32+). The route's SHA256
`942233938763ee7758b09ee0b695306bfce295f64eab9453d80f545dab26c6df` **matches the hash the builder
claimed** — the claimed bytes are genuinely on disk. The builder's two out-of-repo baselines were
themselves validated: the pre-fix copy is authentically pre-fix and reproduces 27/27; the postfix
`route.ts` is byte-identical to shipped. The postfix `route.test.ts` copy differs from shipped at
exactly **one added assertion** (`view.endsWith(reply.slice(-REPLY_TAIL))`, line 635) — that copy
predates the builder's documented test-strengthening step, and the shipped file is the strictly
newer, stronger version. Not a discrepancy; recorded because I found it.

## Check 4 — Residual risks the reports do not claim

- The builder's own step (d) — re-running the mutation after strengthening the test helper — is
  **reproducible**: my independent mutation run (3d) failed both new over-bound tests, so the
  strengthened assertions are load-bearing, not decorative.
- The `briefRaw.slice(0, BRIEF_MAX)` clamp (:517) is reached only on the `yes` path and only after
  two metered lane calls; its head-only shape is a deliberate contract cap on model output (3c), not
  an unenumerated member of the reply class.
- The fix's error path cannot hide a degradation: a reply whose acceptance lands in the dropped
  middle (roughly chars 250-500 of a >500-char reply, if the person writes the decision in the
  middle) still reads `unclear` and starts nothing — honest and visible, unchanged in kind from the
  pre-existing behaviour, and now strictly rarer.
- The route's test file holding its own constant copies is **load-bearing in the right direction**:
  a route-side drift fails a test loudly instead of being silently followed. Confirmed the copies
  match today.

## Known Limitations

- **No live-path evidence — owed, and it is the one thing this PASS does not cover.** No dev server,
  authenticated account, live provider, DB, SSH, box, GHCR or production system was contacted; the
  brief was read-only and I had no key. The Phase-3 flow — `/dashboard/new` → a plan → a **reply over
  500 chars whose acceptance is at its END** → the build starts → inline progress renders — has **not
  been exercised by anyone across two waves**. The human who runs it must be **named in the report
  that closes this wave**; nothing in this review substitutes for it (LESSONS §2.4 / §3). What is
  proven here is that the bytes reach the lane intact; whether a real model then answers `yes` for a
  given long reply is a model-behaviour question the hermetic stub deliberately simplifies.
- **Duplicated-constant debt is unchanged and has grown by one value.** `REPLY_TAIL_MAX = 250` joins
  `2000` / `1000` / `500` / `"\n…\n"` as a literal existing in more than one file, with only tests
  keeping them in step. Extraction to `apps/web/lib/` is the right later-wave fix; this report does
  not claim it is done.
- **The reply is still bounded at 500 chars total.** A reply whose *reasoning* lands past roughly
  char 247 loses it. That is the intended trade against an unbounded billed prompt and it matches how
  the plan turn and the thread already behave — but it is a real trade, not a free win.
- **The `brief` head-only clamp (:517) remains** — deliberately excluded with a stated reason (3c),
  and now the only member of the class.
- **My mutation evidence is a harness, not a committed test.** It lives outside the repo because my
  write scope was one report; a future wave that wants regression protection against re-introducing
  the head-only slice should note the shipped tests already provide it (they fail under the mutation —
  step 3d).
- **Scratch left on disk, outside the repo:** `%TEMP%\vr-shadow\` (two vitest configs + two
  `node_modules` junctions) and `%TEMP%\verdict-reply-review\` (my SHA256 baselines). Neither is
  inside the repo and neither affects any gate. I deliberately did **not** delete the junctions —
  `Remove-Item -Recurse` on a junction is a documented Windows footgun that can delete the *target*
  (the repo's `node_modules`), and that risk is not worth taking to tidy a temp dir. Safe cleanup by
  the founder, if wanted: `cmd /c rmdir "%TEMP%\vr-shadow\node_modules"` (removes the reparse point
  only, never the target), then delete the folder.
- Note on `Agent Reports/` and formatting: `Agent Reports/` is **not** in any format gate — the root
  `format` script names explicit paths and `apps/web`'s runs from `apps/web`. Prettier's default rules
  would reformat these markdown tables, so every report in this directory (including the two I read)
  reports "code style issues" under a bare `prettier --check`. My report is consistent with them and
  is not in a gate; I did not reformat the others.
