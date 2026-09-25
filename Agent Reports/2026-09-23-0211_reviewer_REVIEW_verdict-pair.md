# Task Report: reviewer-verdict-pair

## Status
**PASS** (with three named residuals, none of which reopens the founder-facing symptom).

Independent verdict on the two-sided long-plan fix: **the founder-facing symptom is CLOSED at the
contract level.** A plan turn of 501–2000 chars ending in `Can I start?` survives the page's
`boundedTurn` (page.tsx:81) and the route's `boundedView` + ask-line gate (route.ts:135, 448) and
reaches the judge — proven by tracing the bytes through both bounds with constants extracted from
the real source text, not by trusting either report's summary. A 409 can no longer be produced by
length alone anywhere on the page path.

The one thing this review does **not** claim is live-path evidence: no dev server, real account or
provider was exercised (this review was run under a read-only brief — no key, DB, SSH or prod
contact, per the scope guard). That check remains owed and is named in Known Limitations.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0211_reviewer_REVIEW_verdict-pair.md

No source file, manifest, lockfile or config was created, modified or deleted by this review. No
`git` command that restores from HEAD was run (no stash/checkout --/restore/reset), no commit, no
install. The temp instrumentation was executed through `node --input-type=module -e` with the script
on stdin — it wrote no file, and its mutations were applied **in memory** to derived copies.

## Dependencies Added
- None.

## Assumptions Made
- "The founder-facing symptom is closed" is asserted at the **contract level** (page output → route
  input, byte-traced), not at the HTTP level. The two suites are hermetic by design (SPEC V2/V3: mock
  the lane + pool, never hit a live provider or DB), so no test in the merged tree crosses the page↔
  route boundary. I built the missing bridge as an independent instrument rather than accepting
  either builder's summary.
- Mutation evidence for the byte-trace contract is a **simulation on a re-implementation that I first
  proved body-identical to the shipped source** (see Check 1c). I could not write a mutation test
  file (one-write scope), so this is the honest independent equivalent of LESSONS §8; the builders'
  own in-file mutation runs are cited as second sources, not relied upon.
- `PASS` does not mean "no findings". Three residuals that a later wave should own are recorded under
  Known Limitations and Open Questions; none of them is on the corrected path.

## Open Questions for Orchestrator
1. **The same class survives at route.ts:464** — `reply.slice(0, REPLY_MAX)` is still a HEAD-ONLY
   slice on the user's acceptance. A reply longer than 500 chars whose meaning is at its END
   ("…context… yes, build it") is handed to the judge as its first 500 chars, so the judge cannot see
   the acceptance it is asked to judge. Measured: at 501/900/2000 chars the acceptance does not
   survive. The page does not cause this (it sends up to 2000, page.tsx:156) — the route truncates.
   This is the mirror image of the fixed defect, in the same file, five lines above the fix, and
   neither fix report's "same-class sites" enumeration names it (the route report lists it only under
   *Preserved constants*, not as an enumerated site). Impact is honest, not silent: the verdict
   most likely reads `unclear`, nothing starts, and the assistant asks again. **Recommend one
   follow-up line** — `boundedView(planTurn.content… )`-style kept-ends view for the reply, or raise
   `REPLY_MAX` to match. Not fixed here: it is inside the reviewed contract and out of the review's
   write scope.
2. **Nothing enforces the four duplicated constants.** `2000` / `500` / the `'\n…\n'` marker exist
   as literals in both files (route.ts:113,124,128 / page.tsx:45,49,53), kept in step by comments and
   by tests that hold their **own** copies (page.test.tsx:153-156). Both reports flag this. I verified
   the drift failure mode is now loud rather than silent in both directions (see Check 2c), so it is
   a maintainability debt, not an open defect. A later wave owning `apps/web/lib/` should extract one
   module.
3. **The locked refusal copy is duplicated too.** `TRIAL_BUDGET_MESSAGE`, the paid template and
   `onTrial`/`budgetRefusalMessage` are copied byte-for-byte from `apps/web/app/api/chat/route.ts`
   (verified identical — Check 3c). No compile-time link, so a chat-side copy edit silently makes the
   two files tell one exhausted account two different sentences. Same follow-up wave as item 2.

## Public Interface Exposed
Nothing new. `POST` and the existing test seams (`__setPool`, `__setSessionReader`,
`__resetSessionReader`, `__setBossFactory`, `__resetBossFactory`, `__setPersonaCaller`,
`__resetPersonaCaller`, `BUILDER_QUEUE`) are unchanged; `boundedView` (route) and `boundedTurn`
(page) are module-private. The web app's route manifest gained `/api/builder/verdict` as a dynamic
function (confirmed in the production build output), `/dashboard/new` as static.

---

## Check 1 — Does it actually work?

Toolchain **detected, not assumed**: npm workspaces (root `package.json`: `"workspaces": ["apps/*",
"packages/*"]`); `apps/web/package.json` carries `typecheck: tsc --noEmit`, `lint: eslint`,
`test: vitest run`; web runtime is `next@16.3.4`, `vitest@5.0.0`, `react@19.2.8`.

| # | Command (as run) | Result |
|---|---|---|
| 1a | `npx vitest run app/api/builder/verdict/route.test.ts app/dashboard/new/page.test.tsx` (cwd `apps/web`) | **2 files, 64 passed / 64**, 0 failed |
| 1b | same two suites separately (`--reporter=verbose` for names) | route **27/27**, page **37/37** — matches both reports exactly |
| 1c | `npm run typecheck` (repo root) | **exit 0**, all five workspaces (`gateway`, `testbot`, `web`, `ai`, `spec`) |
| 1d | `npx eslint --max-warnings 0` on the four files (root config) | **exit 0** |
| 1e | `npx prettier --check` on the four files | **"All matched files use Prettier code style!"** |
| 1f | `npx vitest run` (cwd `apps/web`, full suite) | **58 files, 761 passed, 69 skipped, 0 failed** |
| 1g | `npm run lint` (root, `eslint . --max-warnings 0`) | **exit 0** |
| 1h | `npm run build --workspace @corvus/web` | **exit 0**; `/api/builder/verdict` ƒ and `/dashboard/new` ○ in the route manifest |

I ran the focused suites **both together and separately** because both reports claim a combined
"64 passed" — a number that needs the merged tree to mean anything (LESSONS §7). It holds.

### 1i — The byte trace (the core claim, independently derived)

I extracted the constants and both helper bodies **from the source text programmatically** (string
offsets + a brace-matching extractor — nothing hand-transcribed), then asserted my re-implementation
is body-identical to the file before using it:

```
ROUTE  TURN_MAX/PLAN_MAX/PLAN_TAIL_MAX = 2000 1000 500 | marker len 3 codes a,2026,a
PAGE   TURN_MAX/TAIL_MAX              = 2000 500      | marker len 3 codes a,2026,a
CONSTANT PARITY: per-turn true | tail true | marker byte-identical true
PRECONDITION tail+marker<max: route true | page true
INSTRUMENT CHECK route body matches source: true
INSTRUMENT CHECK page  body matches source: true
page body === route body modulo marker identifier: true
```

Both bodies collapse to the same expression — the *only* difference is the identifier name:
`if(text.length<=max)returntext;consttail=text.slice(-tailMax);return`${text.slice(0,max-tailMax-M.length)}${M}${tail}`;`
So "the page mirrors the route" is byte-true, not rhetorical.

A plan whose END carries the ask line, traced through `boundedTurn(…,2000,500)` (page) then
`routeAccepts(≤2000)` + `boundedView(…,1000,500).includes('Can I start?')` (route):

| raw plan | page sends | page keeps ask | route 422? | route accepts | gate sees ask | END TO END |
|---|---|---|---|---|---|---|
| 400 | 400 | yes | no | yes | yes | **CLOSED** |
| 500 | 500 | yes | no | yes | yes | **CLOSED** |
| 501 | 501 | yes | no | yes | yes | **CLOSED** |
| 1000 | 1000 | yes | no | yes | yes | **CLOSED** |
| 1500 | 1500 | yes | no | yes | yes | **CLOSED** |
| 2000 | 2000 | yes | no | yes | yes | **CLOSED** |
| 2001 | 2000 | yes | no | yes | yes | **CLOSED** |
| 3000 | 2000 | yes | no | yes | yes | **CLOSED** |
| 10000 | 2000 | yes | no | yes | yes | **CLOSED** |

**END-TO-END BREAKS: 0.** Additional invariants, same instrument:
- Over-bound results are **exactly** `max` (page 2000 / route view 1000 at L = 2001, 3000, 99999), so
  a page-capped turn can never be 422'd by the route and the billed plan view cannot grow — the
  "not one character more" claim in both reports is confirmed at the boundary, not just asserted.
- An in-bound turn travels **byte-identical** (no marker, no padding): `true`.
- The gate is not a blanket pass: an ask line buried in the dropped middle of a 1227-char turn is
  still refused (`true`), matching route.test.ts:407-426.
- The route gates on the **same view it bills**: route.ts:448 and route.ts:463 pass identical
  arguments to `boundedView`, so "what the gate reads" and "what the judge sees" cannot diverge.

### 1j — Mutation / pre-fix simulation (does the fix carry the load, and would my instrument notice?)

Applied in memory to the derived helpers (no file written, no git):

| variant | 501 | 1500 | 2000 | 2100 | 3000 | 6000 |
|---|---|---|---|---|---|---|
| **SHIPPED** | ok | ok | ok | ok | ok | ok |
| route `boundedView` → head-only | ok | **BREAK** | **BREAK** | **BREAK** | **BREAK** | **BREAK** |
| `TURN_MAX` reverted to 500 | **BREAK** | **BREAK** | **BREAK** | **BREAK** | **BREAK** | **BREAK** |
| pre-fix (both head-only, 500) | **BREAK** | **BREAK** | **BREAK** | **BREAK** | **BREAK** | **BREAK** |
| page `boundedTurn` → head-only at 2000 | ok | ok | ok | **BREAK** | **BREAK** | **BREAK** |

The instrument reproduces the pre-fix failure and localizes each mutation — i.e. it is sensitive to
the defect it is being used to declare closed (LESSONS §1, §8). The last row is an important honesty
note: a page-side re-break is **invisible below the page bound** (head-only equals identity at
L ≤ 2000), so the page suite's 3000-char test (page.test.tsx:623-640) — not its 501/1500/2000 cases
(page.test.tsx:606-621) — is the test actually defending the page's kept-ends behaviour. The page
suite has it; the coverage is sufficient, and it is worth knowing which assertion is load-bearing.

### 1k — Gate order, read at the line

`401` route.ts:348-350 → `403 trial_expired` **before** `await req.json()` (:356-361 vs :365) →
`422 invalid bot id` :371-373 / `422 turns` :375-378 → `404 bot not found` :396-398 →
budget `403 trial_budget_exceeded` :428-438 (and an honest `500 could not check your AI credits`
:420-427 on an unreadable meter) → `409 no_plan_asked` :446-450 → model :458-476 →
`200 {verdict, started:false}` :483 / `422 empty_brief` :511-513 /
`200 {runId, phase:'queued', verdict:'yes', briefChars}` :561-564.

**Matches the reported order exactly.** Test-pinned positions: trial-clock-before-body
(route.test.ts:232), no-plan-asked (route.test.ts:329), budget-before-ask-line (route.test.ts:708 —
the decisive one, since it distinguishes the two orderings), 404-never-403 (route.test.ts:288),
soft-delete predicate (route.test.ts:306). The **404-before-403-budget** relative position is
verified by code reading only (route.ts:396-398 early-returns before :409); no test has a request
that is both unowned and over-allowance. Low risk — it is a linear early return — but it is
code-verified, not mutation-pinned, and I am labelling it as such rather than calling it proven.

## Check 2 — Contract match

### 2a — POST shape and validation agree
Page (page.tsx:150-162) sends exactly `{ botId, turns }`; `turns` = rows up to the judged user row,
`.slice(-12)`, empty rows filtered, each row `{ role, content }`. Route `validateTurns`
(route.ts:251-276) requires an array ≤ 12 (`TURNS_MAX` :103), role exactly `'user' | 'assistant'`,
`content` a non-empty string ≤ `TURN_MAX`. **No drift.** Page-side parity of the turn count is
12 = route's 12 (verified: `turns-count parity page/route: 12 12 true`).

### 2b — 409 behaviour
Route answers `409 { error: 'no_plan_asked' }` (route.ts:449). Page treats `response.status === 409`
as a silent return (page.tsx:164-168) — no alert, no run, no link. Matches, and pinned by
page.test.tsx:590-600. Every other non-OK status surfaces the server's own sentence via
`readRefusalMessage` (page.tsx:61-67, 169-179), pinned for the trial-gate case at
page.test.tsx:979/1003 — so a *gate* refusal is never confused with the deliberate 409 silence.

### 2c — Constants
`page 2000/500/marker` vs `route TURN_MAX 2000 / PLAN_TAIL_MAX 500 / ELLIPSIS` — identical,
including the marker's code points (`a,2026,a` both sides). Drift failure mode checked in both
directions: a page value **tighter** than the route re-opens silence-of-nothing-starts only above the
page bound (caught by page.test.tsx:623), and a page value **looser** than the route produces a
loud 422 whose message the page renders (page.tsx:169-179) rather than a silent 409.

## Check 3 — Code quality

### 3a — Security / secrets
`grep -nEi "api[_-]?key|secret|token|password|bearer|sk-[a-z0-9]|ghp_|postgres://|postgresql://"` over
all four files returns **only prose and identifier matches** (`VERDICT_MAX_TOKENS`, "token
discipline" comments, "ask line" text). No credential value, no connection string, no key read: the
route's header comment states the lane owns keys, and the route itself touches none. No secret value
was printed, copied or transmitted by this review.

### 3b — Scope
Both builders declared two files each. Verified against the tree:
- `apps/web/app/api/builder/verdict/route.ts` + `route.test.ts` are **untracked/new** (SPEC V2 CREATE);
  `apps/web/app/dashboard/new/page.tsx` + `page.test.tsx` are modified — those are the only two files
  either report claims, and `git status` shows no third file attributable to them.
- The neighbouring modifications seen in `git status` (`page.module.css`, `chat/route.ts`,
  `components/ui/*`, `lib/chat/thread.ts`, `lib/ai/stream.test.ts`, `packages/ai/*`) are the
  **pre-existing V3/KI-030 wave**, not these two tasks. Evidence: the diff hunks in
  `lib/chat/thread.ts` mention `BRIEF_MAX_CHARS`/builder-brief clamping (different feature), and the
  only `page.module.css` hunk is the V3 SPEC's `padding-bottom: env(safe-area-inset-bottom)`
  (page.module.css:107) — the exact line SPEC V3 ordered, i.e. earlier-wave work, not these tasks.
  Both reports' attribution claim is **verified true**.
- The page does **not** import the route (`grep` finds only the fetch URL string), so no
  route-to-client bundle leak — the assumption both reports give for re-implementing the helper
  client-side holds.

### 3c — Locked copy: noted as duplicated, and *not* reworded
Verified mechanically, byte-for-byte against `apps/web/app/api/chat/route.ts`:

```
TRIAL_BUDGET sentence byte-identical to chat: true
  both: "Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted."
PAID template identical: true  | "This month's ${allowance} AI credits are used up. Nothing is deleted."
TRIAL_ENDED identical: true    | "Your 3-day trial ended — your bots are paused. Nothing is deleted."
```

Both branches are genuine copies of chat's copy (chat route.ts:105-109), the paid branch takes the
meter's resolved allowance, and the refusal code `trial_budget_exceeded` matches chat's (:342-344).
(My first extraction attempt mis-parsed the template literal and reported a false mismatch; the
corrected extractor above is the one to trust, and it is why the claim is stated with the raw string
shown.) The duplication is real debt — recorded in Open Question 3 — but no text was reworded, which
is what the brief asked me to check.

### 3d — Artifacts really exist (trust artifacts, not summaries)
```
9150 Sep 22 19:45  Agent Reports/2026-09-22-1939_orchestrator_SPEC_aibuild-verdict.md
13474 Sep 23 01:55 Agent Reports/2026-09-23-0131_fix-verdict-route_FIX_verdict-turncap-budget.md
9794  Sep 23 02:10 Agent Reports/2026-09-23-0157_fix-verdict-page_FIX_verdict-page-slice.md
```
All three present at the claimed paths. Source mtimes confirm when each landed (route.ts 01:52,
page.tsx 02:08, page.test.tsx 02:07) — consistent with the reports' own timestamps, and all
**predating** this review's production build at 02:18, which left every mtime unchanged and
`next-env.d.ts` clean (build side effect checked explicitly).

## Check 4 — Remaining contract-level risks the reports do not claim

- `VERDICT_CALL_CREDITS` is confirmed real: `USD_PER_CREDIT 0.005 → 1.1264 credits`, and both test
  boundaries hold arithmetically (`99.99 + 1.1264 > 100` blocks, `98.87 + 1.1264 ≤ 100` allows) —
  the route report's "1.1264" is accurate, not remembered.
- The tier predicate sets are **consistent**, so there is no user-visible gap between the trial
  clock and the allowance gate: `isPaidTier` = {pro, studio, scale} (`apps/web/lib/bots.ts:83-87`)
  and `PlanTier` = {trial, pro, studio, scale} (`packages/ai/src/budget.ts:14`), so any tier that
  bypasses the expired-trial 403 also resolves a real paid allowance rather than falling back to the
  trial default.
- The route's **error path cannot self-inflict a 3rd loop**: every refusal the new budget gate can
  emit (403 with the chat sentence, `mapped.status`, or 500) is rendered by the page as an alert via
  `readRefusalMessage`, so a self-inflicted loop degrades into a visible, honest error rather than an
  invisible spin. That is acceptable defence-in-depth, not a defect.
- The thread view (`boundedView(thread, 3000, 1000)`, route.ts:489) is a **deliberate** behaviour
  change from head-only at THREAD_MAX 3000, not a regression: head drops 3000 → 1997 chars in
  exchange for keeping the confirmed plan that ends the thread. Billed length is unchanged (≤ 3000).

## Known Limitations
- **No live-path evidence.** The brief-relevant Phase-3 check — dev server → `/dashboard/new` → a
  plan over 500 chars → yes → inline progress — was **not** run: this review had no permission to
  start a server, authenticate, or reach a provider/DB. The claim above is contract-level. A human
  still owes the flow, and the report that closes this task must name them (LESSONS §2.4/§3).
- **No cross-file integration test exists** in the merged tree. Page and route are tested
  hermetically and independently; nothing in CI would fail if the two sides drifted in a way that is
  loud at runtime but untested at the boundary. The reviewer's instrument (Check 1i) bridges it once,
  by hand.
- **route.ts:464 residual** (Open Question 1) — the reply, not the plan, is still head-sliced for the
  judge. Reachable by a normal user writing a long justification before "yes".
- **Duplicated constants and copy** (Open Questions 2-3) with no compile-time link; tests pin them
  today, nothing enforces them tomorrow.
- **404-before-403-budget is code-verified, not test-pinned** (Check 1k).
- No live provider, DB, SSH, box, GHCR or production system was contacted; no secret was read,
  printed or transmitted.
