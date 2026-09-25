# Task Report: fix-f7t3-0428 (botdetail-tighten)

## Status
**SUCCESS — delivered by verification, with the brief's premise corrected. No edit was made,
because the deliverable the brief asks for is already present in the file and I proved it is
load-bearing. Writing the requested edit would have been wrong: `:1838` is not an assertion.**

Real completion time: **2026-09-24 08:26** (local). Report filename uses the orchestrator's
prescribed stamp `2026-09-24-0428` as instructed.

### Premise correction (read this first)
The brief states that `apps/web/app/dashboard/bots/[id]/page.test.tsx:1838` holds "one vacuous
assertion" whose "reasoning-frame tightening" is owed. Two independent measurements contradict
that, and both matter downstream:

1. **Line 1838 is not an assertion.** It is now
   `sse.push(frame({ t: 'reasoning', text: 'Weighing the options' }));` — a stream push.
2. **The file was written at `04:39:00`** — *after* both the 0422 orchestrator verdict
   (`Agent Reports/…0422_orchestrator_REVIEW_fixwave-verdict.md`, mtime 04:24:15) that the brief
   was derived from, and after the brief's own `0428` stamp. A peer applied the F1 remediation
   in that window. Its comment at `:1834-1837` cites the finding by name:
   `/* A reasoning frame is what puts the parked trace in the DOM at done … (F7T2 review, finding F1). */`

So the F7T2 reviewer's **F1 is already resolved**, and the page-level done-label assertion the
brief wants to exist **already exists** — at `:1847`, paired with a negative at `:1846`. My work
was therefore to *verify and prove* that, not to duplicate it. I changed no byte.

## Files Touched
- **None.** `apps/web/app/dashboard/bots/[id]/page.test.tsx` is byte-identical to how I found it.
  - md5 before: `54869de8e9dfcb55450911cf1f5a8ca9`
  - md5 after:  `54869de8e9dfcb55450911cf1f5a8ca9`
  - mtime before and after: `2026-09-24 04:39:00.040773300 +0300` (unmoved — the strongest
    available proof that no write occurred, stronger than a hash match alone).
- CREATED: `Agent Reports/2026-09-24-0428_f7t3_FIX_botdetail-tighten.md` (this report).
- No `git` write verb was run (no add/commit/stash/checkout/restore/reset). `git` was read-only.
- HEAD unchanged throughout: `d9cf8d77c162b06ca9f312fa59a850b6d60f5c56`.

### The assertions that actually carry the requirement
| Line | Kind | Literal | Role |
|---|---|---|---|
| 1846 | `queryByRole(...).toBeNull()` | `Düşünüyor` | the thinking label must be **gone** at done |
| **1847** | `getByRole(...).toBeTruthy()` | **`Düşündü`** | **the Turkish done label must be the one that replaced it** |

Byte-exactness, measured programmatically (never retyped), source = `thinking-trace.tsx:79`:

```
SRC  done     label = "Düşündü"    U+0044 U+00FC U+015F U+00FC U+006E U+0064 U+00FC   44 c3 bc c5 9f c3 bc 6e 64 c3 bc
TEST :1847   value  = "Düşündü"    U+0044 U+00FC U+015F U+00FC U+006E U+0064 U+00FC   44 c3 bc c5 9f c3 bc 6e 64 c3 bc
BYTE_EQUAL_done: true
```

NFC-composed, confirmed by measurement: `ü` = `U+00FC` (not `u`+`U+0308`), `ş` = `U+015F`.
Positive done-label assertions in the file: **1**, at `:1847`.

## Dependencies Added
None. No install command run; no manifest or lockfile touched.

## Assumptions Made
- **No web research needed, stated per the research gate.** This is a copy/guard fix pinned to
  bytes already on disk. No library version, model name, API surface, or pricing is involved.
  The only authorities are `thinking-trace.tsx` / `chat-thread.tsx` / the test file, all read from
  disk. Nothing here can have changed since training in any way a search could inform.
- **I read "the :1838 assertion" as a reference to the deliverable's intent, not its line
  number.** The intent — *a done-label assertion that fails if the label regresses to English* —
  is what I verified. I did **not** retarget a nearby assertion merely to make the brief's line
  number true; that would be editing to match a stale citation. Flagged as an Open Question.
- **`node_modules/next/dist/docs/` is absent** in this workspace, so the AGENTS.md-mandated Next
  guide could not be read. Noted rather than skipped silently. This task writes no Next code —
  it is a Vitest assertion in a test file — so no Next API surface is involved.
- **`apps/web/node_modules/vitest` is a real directory (5.0.0)**, not a junction; the root store
  repair recorded in the 0422 verdict holds.

## Open Questions for Orchestrator
1. **The brief's line citation is stale.** Should `:1846`/`:1847` be recorded as the owners of
   this requirement in the plan, and the `:1838` citation retired? The verdict already marks F7T2
   **CLOSED** with F1 as "optional tightening only" — that is now out of date: F1 is fixed and
   proven fixed (below).
2. **Optional, out of my scope — the class-level residue sweep in this file does not name the
   trace labels.** `page.test.tsx` uses `RETIRED_COPY` (29 terms, `:62-92`) + `FORBIDDEN`, **not**
   `ENGLISH_RESIDUE` (that symbol lives in six sibling files). Neither list contains
   `Thinking`/`Thought`, so the *source-scan* half of this class is not covered here. Adding them
   would also require touching the size assertion at `:695` (`expect(RETIRED_COPY.length).toBe(29)`)
   — a two-site change outside my declared scope, so I escalated instead of expanding. Low value:
   `components/ui/chat-thread.test.tsx:32` already carries `'Thought'` in its `ENGLISH_RESIDUE`,
   and the direct assertions at `:1846`/`:1847` now cover the rendered label load-bearingly. This
   is the same non-blocking note the 0422 verdict records for the sibling `new/page.test.tsx`.
3. **Peer activity during my window.** `apps/web/app/dashboard/new/page.test.tsx` was written at
   `08:17:34`, inside my run. I did not touch it and my in-scope file was hash-stable across every
   measurement, but a whole-repo gate taken now would measure a moving target.

## Public Interface Exposed
None. No production file, prop, export, or endpoint touched — by me or by the peer whose work I
verified. The accessible-name contract these assertions pin is unchanged: `ThinkingTrace` renders
the header label with the elapsed span **`aria-hidden="true"`** (`thinking-trace.tsx:83`), so the
button's accessible name is the label alone and the positive matcher is exact-name, not a prefix
match. That is why a regression to `Thought` fails rather than passing on a substring.

## Known Limitations
- **Proof is at mounted-DOM / accessibility-tree level** (jsdom via `@testing-library/react`) on
  the real chain `BotDetailPage → ChatAssistantRow → ThinkingTrace`, with only `next/navigation`
  mocked and the SSE `fetch` stubbed. **No browser was launched**, so "a human completed the flow
  in the running app" is **not** claimed here — that belongs to the wave closeout. Appropriate for
  an assertion-strength proof, not a substitute for one.
- **Whole-repo green is not claimed**, for the moving-tree reason in Open Question 3. I verified
  the focused suite, its two F7 sibling suites, and the three static gates.
- **I verified; I did not author.** The tightening under test was written by a peer at 04:39. My
  contribution is the mutation proof that it works and the correction that it was already there.

## Verification

### Toolchain detected, not assumed
From `apps/web/package.json` + `vitest.config.mjs`: npm workspaces; runner **vitest 5.0.0**;
TS **5.9.3** strict; ESLint **9.39.5** flat config; Prettier **3.9.6**; `typecheck: tsc --noEmit`.
All commands run from `apps/web`. Every exit code is the tool's **true** exit code (output
redirected to a file, `$LASTEXITCODE`/`$?` read immediately), never a pipe's tail.

### (1) Gates on the settled repo tree

| Command (cwd `apps/web`) | Exit | Output |
|---|---|---|
| `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` | **0** | 1 file · **59 passed (59)** — matches the expected 59 |
| `npx tsc --noEmit` | **0** | **0 bytes** — clean |
| `npx eslint "app/dashboard/bots/[id]/page.test.tsx" --max-warnings 0` | **0** | **0 bytes** — clean, zero warnings |
| `npx prettier --check "app/dashboard/bots/[id]/page.test.tsx"` | **0** | `All matched files use Prettier code style!` |

Re-run at the end of the task against the settled tree: **59 passed (59)**, exit 0.

### (2) Instrument validated before any mutation was believed
The temp harness is a **full copy outside the repo** (robocopy `/E /XD node_modules .next .vitest`,
then `node_modules` copied separately with **`/XJ` to exclude junctions**, `@corvus/spec` + `@corvus/ai`
wired as **real directory copies**, copied `.vite` caches deleted). Per the 0422 harness rule:

```
pre-use reparse assertion: 31773 entries, REPARSE POINTS = 0  → safe to delete through
```

**Validation run on the unmodified copy: 59 passed (59), exit 0** — the harness measures the real
thing, not a stale cache.

### (3) Mutation proof — the decisive table
Every row re-copied the baseline first, so no mutation compounded. Each mutation asserted its own
occurrence count (must be exactly 1) before writing.

| # | Mutation (temp copy only) | Result | Exit | Meaning |
|---|---|---|---|---|
| **A** | `thinking-trace.tsx` done label → English **`Thought`** | **1 failed / 58 passed** | **1** | **The brief's requirement holds.** Failure: `Unable to find role="button" and name "Düşündü"` — i.e. assertion **`:1847`**. The done-label assertion genuinely fails on an English regression. |
| **B** | done label → thinking label `Düşünüyor` (**the exact F1 break**) | **1 failed / 58 passed** | **1** | **F7T2 F1 is fixed.** Failure: `expected <button …> to be null` — assertion **`:1846`**. The reviewer's own experiment ("changing the done branch from `'Düşündü'` to `'Düşünüyor'` … suite stayed 59/59 green") now **fails**. |
| **C** | thinking label → English `Thinking` | **3 failed / 56 passed** | 1 | Sanity: the three positive thinking sites (`:1716`, `:1795`, `:1830`) trip. **Reproduces F7T2's documented baseline exactly**, confirming my instrument matches theirs. |
| **D** | remove the `:1838` push **+** English label | 1 failed / 58 passed | 1 | Deliberately uninformative — see F. |
| **E** | **reconstruct the pre-04:39 F7T2 shape** (no push, no `:1847` assertion) **+ English label** | **59 passed (59)** | **0** | **The discriminator.** The old state *was* vacuous; the current state is not. This is what proves my instrument can tell the two apart, so A/B/F are not false positives. |
| **F** | remove **only** the `:1838` push, labels left **correct/Turkish** | **1 failed / 58 passed** | 1 | `:1838`'s reasoning frame is **genuinely load-bearing**: without it no trace mounts at `done` (`chat-thread.tsx:48` renders `ThinkingTrace` only when `message.reasoning` is truthy), so `:1847` cannot find the button. |

**Why E is the load-bearing control and D is not:** D's failure is caused by removing the push (no
trace mounts, so `:1847` fails regardless of the label) — it cannot distinguish a label regression
from a missing trace. E is the honest control: it shows the *pre-04:39* shape passing 59/59 with a
wrong label, which is precisely the vacuity F7T2's review proved. A/B/F all keep the trace mounted,
so their failures can only come from the label. Harness restored to baseline afterward and
re-verified at **59 passed (59), exit 0**.

### (4) Class coverage — the sibling F7 suites also catch it
Under mutation A (English done label), the F7 suites independently go red:
```
npx vitest run components/ui/thinking-trace.test.tsx components/ui/chat-thread.test.tsx
→ Test Files 2 failed (2) · Tests 3 failed | 8 passed (11) · exit 1
× parks itself collapsed as Düşündü with the measured duration
× the chevron toggles the trace open and closed
× renders the answer, parked trace, and Turkish spent line when done
```
This matches the F7T2 reviewer's F1 evidence (`3 failed / 8 passed` across those two suites) — so
the class is covered twice over: producer-side by F7, and page-level by `:1846`/`:1847` now
load-bearingly. LESSONS §2's "enumerate consumers, not just the producer" is satisfied.

Every done-label site repo-wide, enumerated (not just the one that surfaced):
`bots/[id]/page.test.tsx:1847` · `new/page.test.tsx:522` · `chat-thread.test.tsx:81` ·
`thinking-trace.test.tsx:51,68`; producer `thinking-trace.tsx:79`. No sibling shares the old
vacuous shape.

### (5) Scope hygiene
- **Repo source untouched, proven two ways:** md5 identical before/after for the test file
  (`54869de8…`), `thinking-trace.tsx` (`911d7f71…`), `chat-thread.tsx` (`5116797b…`); **and** the
  test file's mtime is still the peer's `04:39:00.040773300` — unmoved by any of my runs.
- `git status` for my scope shows only the peer's pre-existing ` M` on the test file. No new
  untracked file in `apps/web` from me. HEAD still `d9cf8d7`. No manifest, lockfile, `.env`, or
  secret touched.
- **Disclosed side effect, benign:** my `npx tsc --noEmit` refreshed `apps/web/tsconfig.tsbuildinfo`
  (08:21:07). It is **gitignored** (`.gitignore:5: *.tsbuildinfo`), untracked, and produces no
  git-visible change. No action needed; recorded so it is not mistaken for an unexplained write.
- **Temp artifacts deleted and verified gone:** pre-delete reparse assertion found 0 links, then
  harness, baseline copies, mutation scripts and all logs were removed — `remaining count: 0`.
  Nothing was deleted through a junction ancestry.
- No secrets, no credentials.

### (6) What this means for the wave record
The 0422 verdict marks F7T2 **CLOSED** with *"F1: :1838 still vacuous — done-label covered by F7
suites; optional tightening only."* The first half of that parenthetical is no longer accurate:
a peer closed F1 at 04:39, and mutation B (+ control E) proves it closed. The recommendation is to
record F1 as **resolved** rather than optional-open, and to retire the `:1838` citation in favour
of `:1846`/`:1847`.
