# Task Report: review-F8

## Status
SUCCESS

## Reviewer identity and independence
Fresh independent reviewer (Sonnet tier). Did not write the code under review. Ran on the merged
working tree with **no edits to any source file**, no `git` command that restores from HEAD, no
commit, push, deploy, migration or secret access.

- Timestamp: `2026-09-24-0201` (task-specified; review ran 01:44–01:58 local on 2026-09-24)
- Artifact under review: **none — F8 shipped nothing.** The deliverable under review is the
  builder's *refusal and escalation*, plus its claim of scope integrity.
- Builder report reviewed: `Agent Reports/2026-09-24-0201_F8_MODIFY_chat-turkish.md` (exists, 6,900
  bytes, mtime Sep 24 01:5x — verified on disk)

## Verdict
**PASS** — the builder's refusal is correct, its cited evidence is accurate to the line number, and
it left the tree untouched. **Three corrections** follow that materially change what the orchestrator
should do next, and one of them narrows the builder's stated blocker. Read them before re-issuing.

**No Turkish chat copy shipped.** `apps/web/app/api/chat/route.ts` contains **zero** Turkish
characters today (verified by `grep -P`). PASS here means "the escalation was the right call and its
evidence holds", **not** "F8 delivered".

---

## Verification of the scope-integrity claim (trust artifacts, not summaries)

The builder claimed `route.ts` is byte-identical to how it found it. What is independently checkable:

| Check | Command (cwd `apps/web`) | Result |
|---|---|---|
| Hash, start of review | `md5sum app/api/chat/route.ts` | `8831b9dd789666862692561a2a0720f4` |
| Hash, end of review | `md5sum app/api/chat/route.ts` | `8831b9dd789666862692561a2a0720f4` (unchanged) |
| Builder's claimed hash | report §Files Touched | `8831b9dd…` — **MATCH** |
| Turkish residue | `grep -nP "[\x{011F}…]" app/api/chat/route.ts` | **0 hits** — consistent with "no translation applied" |
| Dirty-vs-HEAD diff | `git diff --stat` | 110 / 11 — **belongs to another wave, not F8** |

**F8 did not create the dirty diff, and that matters.** The 110/11 delta is entirely m-23/m-24/m-25
spend-reservation work plus a `buildPersonaPrompt` import — not copy. I matched it to its own
reports on disk (`2026-09-23-0713_chat-spend-m11_FIX_chat-spend.md`,
`2026-09-23-0805_chat-spend-scope_FIX_chat-spend-scope.md`,
`2026-09-23-0810_reviewer_REVIEW_chat-spend-r2.md`). The builder's "pre-existing 110/11 … predates
this task" is **accurate**.

**Limit of this verification, stated plainly:** I can prove the file has no Turkish residue and that
its hash matches the builder's report. I cannot re-derive the *pre-task* hash from the builder's own
session — that instrument is gone. The claim is corroborated, not independently reproduced.

---

## PASS/FAIL per criterion

### Criterion 1 — Real typecheck + lint
| Check | Command | Exit | Verdict |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` (`apps/web`) | **2** | **FAIL — but not F8's** |
| Lint (scope) | `npx eslint app/api/chat/route.ts app/api/chat/route.test.ts --max-warnings 0` | **0** | **PASS** |
| Lint (whole workspace) | `npx eslint . --max-warnings 0` | **1** | **FAIL — not F8's** |

Both failures are in files F8 never touched, and neither names a chat file:

- `scratch-probe2.test.ts(13,27)` and `(31,34)` — an **untracked scratch file** (mtime Sep 24 01:48),
  not a deliverable, not F8's.
- `app/dashboard/page.test.tsx(52,7)` — `'ENGLISH_RESIDUE' is assigned a value but never used`. That
  file is `M` in the working tree under a **peer** Turkish agent (its own comment names the trial
  strings and the task report's Open Questions — a sibling's in-flight edit).

**The builder's claim that the tree is not clean through no fault of F8 is CONFIRMED**, and its own
scope is clean at zero warnings.

### Criterion 2 — Focused vitest
`npx vitest run app/api/chat/route.test.ts` (`apps/web`) → **35 passed / 35**, 1 file, 3.33s.
**Reproduces the builder's number exactly.** PASS.

### Criterion 3 — Grep residue
**3a. No Turkish shipped.** Confirmed (0 hits). PASS — and correct given the refusal.

**3b. Every named anchor is genuinely byte-pinned outside scope — PASS, verified line by line.**

| Builder's claim | Verified on disk |
|---|---|
| `route.test.ts:786` pins `message: TRIAL_ENDED_MESSAGE` | **EXACT** — `toEqual({ error: 'trial_expired', message: TRIAL_ENDED_MESSAGE })` |
| `:866`, `:886` pin the budget sentence | **EXACT** — both `toEqual({ error: 'trial_budget_exceeded', message: 'Your 3-day trial has used its 100 AI credits…' })` |
| `:223` pins `'botId must be a uuid'` | **EXACT** — `toEqual({ ok: false, status: 422, error: 'botId must be a uuid' })` |
| `:229` pins `'body must be an object'` | **EXACT** — `toEqual({ ok: false, status: 422, error: 'body must be an object' })` |
| `:749` is a second literal copy of the message | **EXACT** — `const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — …'` |

The builder's "measured, not reasoned" negative result is sound: these are `toEqual` on whole bodies,
so any change to the string fails the pin, and the pins live in the file outside scope. **Its core
finding holds.**

**3c. The cross-route byte lock is real — PASS, verified.** The expired sentence is carried by **4
non-test producers** — `builder/start/route.ts:42`, `builder/verdict/route.ts:89`, `chat/route.ts:88`,
`lib/bots.ts:56` — across **16 occurrences in 13 files**. `lib/bots.ts:54-56` states the lock in
source; `builder/verdict/route.ts:121-126` states it again for this exact pair. The builder's
"one exhausted account would read Turkish in chat and English on the dashboard" is **correct and
reproducible**: `app/dashboard/page.tsx:234` and `app/dashboard/bots/page.tsx:182` both render
`TRIAL_EXPIRED_MESSAGE` verbatim.

**3d. `'body must be an object'` is shared vocabulary — PASS, exact.** Five producers verified:
`chat/route.ts:200`, `simulate/route.ts:71`, `spec/publish/route.ts:387`, `spec/rollback/route.ts:129`,
`lib/editor/drafts.ts:58` (plus pins in `publish.test.ts:312`, `rollback.test.ts:443`).

### Criterion 4 — Report exists on disk
**PASS.** `Agent Reports/2026-09-24-0201_F8_MODIFY_chat-turkish.md` exists; filename follows the
required schema; all six required sections present.

---

## Corrections to the builder's reasoning (these change the next action)

### CORRECTION 1 — Reason #1 is overstated, and its own sibling proved the escape hatch
The builder writes that acceptance (1) and (3) are "mutually exclusive" and frames the options as
(a) accept a two-language screen or (b) a cross-route wave. **It never tested the additive path its
own sibling F1 used successfully three reports earlier** — and that understatement is what the
orchestrator would act on.

`2026-09-24-0101_F1_MODIFY_verdict-turkish-gate.md` solved the *identical* scope contradiction in the
*identical* wave: it kept every machine `error` code byte-for-byte, **added** a Turkish `message`
alongside it, edited the test file it needed, escalated the scope contradiction, and the orchestrator's
reviewer **accepted that escalation as correct** (`2026-09-24-0101_reviewer_REVIEW_F1.md`,
escalations §1: "Recommend the orchestrator formally accept the escalation and re-scope criterion 4").

**Where the additive path does and does not work here — measured, not assumed:**

| String | Additive `message` available? | Why |
|---|---|---|
| `'unauthorized'` (`:346`) | **No** — pinned `toEqual({ error: 'unauthorized' })` at `:240` | pin is exact; needs the test file |
| `'AI is not configured yet'` (`:372`) | **No** — pinned at `:253` | same |
| `'body must be JSON'` (`:363`), `'could not check your AI credits'` (`:404`), the nine :169-213 strings | **Yes** — asserted by status only | additive field needs no test change |
| **`:88` and `:105-109` (the two KI-033 sentences)** | **No — the builder is right** | these **already carry** `message` = the English text; there is no second slot to add into |

So the builder's *conclusion* for the two named KI-033 sentences is **correct and its measurement is
accurate**. But its blanket "mutually exclusive" framing should be narrowed: **only the two KI-033
sentences are hard-blocked by the pin.** The rest of the refusal copy is reachable additively, and
F1 shipped exactly that on a sibling file. Note the concrete gap: `chat/route.ts:404` still says
`'could not check your AI credits'` while F1 translated the **same string** at
`builder/verdict/route.ts:139` → `'AI kredisi kontrol edilemedi — sonra tekrar dene.'` Two sibling
routes now disagree on one sentence that is not pinned in chat.

**Recommended re-issue:** split as the builder recommends (b) *for the two KI-033 sentences only*,
and authorise the additive Turkish `message` sweep separately under the F1 precedent — with
`route.test.ts` explicitly in scope from the start, which removes the contradiction that blocked
both F1 and F8.

### CORRECTION 2 — "No canonical Turkish wording exists anywhere in the tree" is imprecise
The builder states zero matches for Turkish trial phrasings. There **is** a Turkish rendering of the
expired situation already shipping at `app/page.tsx:46`:

> `'Deneme süren bittiğinde botların duraklar ve olduğu gibi kalır — hiçbir şey silinmez.'`

That is the landing FAQ's voice, not a byte-canonical API string, and it is not the sentence the
banner carries — so the builder's *practical* conclusion (a canonical wording must still be locked)
survives. But a byte-lock wave should start from this precedent rather than commissioning wording from
nothing. Overstating "nothing exists" risks a second, third Turkish wording for one situation, which
is the exact drift the KI-033 lock exists to prevent.

### CORRECTION 3 — the budget-sentence census does not reproduce
The builder reports "16 occurrences of the expired sentence and **10** of the budget sentence". The
first is **exact** (16 occurrences / 13 files — verified). The second I could not reproduce:

- raw literal `'has used its 100 AI credits'` → **7** occurrences in **5** files
- `TRIAL_BUDGET_MESSAGE` identifier → **2** (declaration + one use), i.e. a maximum of **9** by any
  counting basis I can construct.

A discrepancy of 1–3. It does not change the conclusion — the sentence *is* cross-route locked
(producers at `chat/route.ts:107`, `builder/verdict/route.ts:97`, plus `:112`, with pins at
`chat/route.test.ts:866/:886`, `verdict/route.test.ts:987`, `lib/chat/thread.test.ts:120/:125`) — but
a count that does not reproduce is exactly the kind of number a later reader trusts without
re-checking. Flagged so the locked-wave task brief uses a verified figure.

---

## Harness finding — CONFIRMED and worse than reported

The builder reported the full suite at 11 failed / 950 passed / 64 files and called the instrument
unreliable. **I confirm the conclusion and can strengthen it. The suite is non-deterministic:**

| Run | Command (cwd `apps/web`) | Result |
|---|---|---|
| 1 | `npm test` (→ `vitest run`) | **15 failed / 950 passed, 6 failed of 65 files** |
| 2 | `npx vitest run` (full output captured) | **9 failed / 956 passed, 5 failed of 65 files** |

Different failure counts on an unchanged tree, minutes apart. Contributing causes, each traced:

- **Untracked scratch files pollute the run.** `scratch-probe.test.ts` (mtime 01:46) and
  `scratch-probe2.test.ts` (mtime 01:48) sit at `apps/web/` root and are picked up as suites.
  `scratch-probe.test.ts` fails with a Next invariant error; `scratch-probe2.test.ts` is why `tsc`
  exits 2. Neither is a deliverable. **They should be deleted by their author** — they are currently
  making four gates red for everyone.
- **Peer Turkish edits break their own suites.** `components/ui/chat-thread.test.tsx` fails (2 of 3)
  because the component now renders `'Tekrar dene'` while the test still asserts `'Retry'` — a peer
  file, `M` in the working tree.
- `app/dashboard/bots/[id]/page.test.tsx` (4 failed) and others are peer surfaces mid-edit.

**So acceptance criterion (3) "tests green" is currently unprovable by the full suite for any task in
this wave — the builder is right.** The **isolated chat suite at 35/35** is the trustworthy instrument,
and it is green.

**Instrument note (my own, LESSONS §1).** My first background attempt used
`npx vitest run --reporter=basic`, which **failed to start** — vitest 5 does not ship a `basic`
reporter, and the error surfaced as a startup failure, not as a test result. I did not read that as a
suite outcome. Re-ran with the project's own `npm test` / bare `npx vitest run`. Recorded because a
reporter typo could easily have been misread as "the suite is broken".

---

## Independent verification beyond the builder's own evidence

- **Census re-derived from disk**, not from the report: expired sentence 16/13 files, budget sentence
  7 literal (+2 identifier) — see Correction 3.
- **Pin semantics established by reading the assertions**, not by trusting the claim: every one of the
  five named pins is a whole-body `toEqual`, and I enumerated all twelve `toEqual` sites
  (`:160,167,182,220,226,240,253,357,725,786,863,884`) to establish exactly which strings are reachable
  additively and which are not (Correction 1's table).
- **The two-language screen is live, not hypothetical**: `app/dashboard/page.tsx:234` and
  `app/dashboard/bots/page.tsx:182` render the English locked sentence while the surrounding headings
  are Turkish (`Ana sayfa`, `Başlangıç (2/4)`). Verified by reading the files.
- **The sibling-precedent check** — reading F1's builder report *and* F1's reviewer report — is what
  produced Correction 1, and it is evidence neither the builder nor the orchestrator had.

## What the builder got right, recorded so it is not lost
- The refusal was the correct call: shipping a chat-only translation would have produced one exhausted
  account reading Turkish in the composer and English on the dashboard banner — verified reproducible.
- It did **not** silently overwrite a stated byte-level SPEC lock, and it did not expand scope.
- It escalated rather than shipping a partial translation of the nine status-only strings, which would
  have left the chat API speaking two languages. Defensible editorial judgment.

## Dependencies Added
None. No manifest, package, lockfile or install touched.

## Assumptions Made
- "Verify fix F8" is read as "verify the builder's refusal, its evidence, and its scope integrity",
  since F8 shipped no artifact. There is no diff to review.
- "Zero warnings" is checked with the root gate (`eslint . --max-warnings 0`) as well as the workspace
  script, because `apps/web`'s own `lint` script is bare `eslint .` with no ceiling.
- The three `2026-09-24-0201_*` reports are one wave's contract despite the shared timestamp, so F1's
  decision is admissible as sibling precedent.

## Open Questions for Orchestrator
1. **Accept the escalation?** F1's identical escalation was accepted; consistency says accept this one
   too. But accept it on the **narrowed** ground (Correction 1): the two KI-033 sentences are genuinely
   blocked; the rest of the refusal copy is not.
2. **Authorise the additive sweep** for the unpinned refusal strings under the F1 precedent, with
   `route.test.ts` in scope from the outset — closing the `'could not check your AI credits'`
   divergence between chat and verdict.
3. **Delete the scratch probes.** `apps/web/scratch-probe.test.ts` and `scratch-probe2.test.ts` are
   untracked, non-deliverable, and currently break both `tsc` and the full suite for every agent.
   Their author should remove them; a reviewer will not (no delete outside declared scope).
4. **Full-suite green cannot be certified this wave.** Any remaining task's criterion (3) should name
   the isolated suite it is measured against, or wait for the peer edits to land.

## Public Interface Exposed
None — nothing shipped, so the chat route's HTTP contract is unchanged: no export, signature, status
code, `error` code, SQL or ledger write was altered.

## Known Limitations
1. I did not re-run the builder's temporary Turkish application (a deliberate sabotage-and-restore of
   someone else's working tree — a forbidden write for a reviewer). Its 35/35 → 34/35 → 4-failures
   sequence is **corroborated by the pin semantics I read**, not independently reproduced.
2. The pre-task hash of `route.ts` is asserted by the builder and consistent with the file's zero
   Turkish residue, but the pre-task instrument no longer exists to re-derive it.
3. I could not test the additive-`message` path end-to-end without editing a file, which this review
   forbids. Correction 1 is an argument from the pins' exact-equality semantics plus F1's landed
   precedent — strong, but it is a reading, not a run.
4. The full-suite figures are a moving target; the two runs above are what I measured, not a stable
   baseline.

---

## Report metadata
| Field | Value |
|---|---|
| Reviewer | fresh independent reviewer (Sonnet tier), clean context |
| Tree | working tree as of 2026-09-24 01:58 local; heavily dirty under peer waves |
| Toolchain detected | npm workspaces; `apps/web`: `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`; Vitest 5.0.0, ESLint 9.39.5, TS 5.9.3, Next 16.3.4 |
| Files read | `app/api/chat/route.ts`, `app/api/chat/route.test.ts`, `app/api/builder/verdict/route.ts`, `app/api/builder/start/route.ts`, `lib/bots.ts`, `lib/chat/thread.ts`, `app/dashboard/page.tsx`, `app/dashboard/bots/page.tsx`, `components/ui/chat-thread.tsx`, `app/page.tsx`, scratch probes; reports F1, F4, F8, reviewer-REVIEW-F1 |
| Commands run | `npx tsc --noEmit`; `npx eslint … --max-warnings 0`; `npx vitest run <file>`; `npm test`; `npx vitest run`; `md5sum`; `git status`/`git diff`/`git log` (read-only) |
| Files written | this report only |
| Git operations | read-only; no restore, no commit, no push |
