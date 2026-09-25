# Task Report: reviewer-f7n3-0428

## Status

**SUCCESS** — review completed. **VERDICT: PASS** (the claim holds), with two non-blocking
accuracy findings.

The reviewed claim: `apps/web/app/dashboard/new/page.test.tsx` now carries a **LIVE**
(mutation-proven, mounted-state) guard on the `Thinking`/`Thought` copy class, no dead entry
was installed, the suite is green, and all static gates are clean.

**Every load-bearing element of that claim survived my own independent measurement.** I
re-derived it from bytes on disk, not from the report. Specifically:

| Claim element | Verdict | My evidence |
|---|---|---|
| Helper + per-branch lists exist | **CONFIRMED** | `:390-395`, `:73`, `:74-77` (quoted below) |
| `ENGLISH_RESIDUE` itself unexpanded | **CONFIRMED** | 16 entries at `:49-66`; none of `Thinking`/`Thought`/`took` |
| Assertions sit inside existing `it` blocks | **CONFIRMED** | `:469` in the block at `:466`; `:497`/`:524` in the block at `:480` |
| No dead entry installed | **CONFIRMED** | content check + the counter-probe below |
| New entries are LIVE (mutation-proven) | **CONFIRMED** | three isolation probes, each red at its own entry |
| Suite green, gates clean | **CONFIRMED** | 49/49 + tsc/eslint/prettier all exit 0 |

**Verdict on the premise — and this is the strongest part of the author's work:**
`ENGLISH_RESIDUE` is swept only against the **empty** page state, and the row's words exist
only once a turn is mounted. So folding them into that list would have installed entries that
can never fire. I built that dead design myself in an out-of-repo copy and shipped **full
English: 49 passed (49), exit 0.** That is the F12B/F12C dead-entry defect, reproduced on this
exact file. The author's refusal to install those entries was correct, and the fix shape
(mounted-state sweeps) is the right one.

**Two findings, both non-blocking** (detail in Open Questions):

1. **The added negative assertion at `:523` is vacuous** — it can never fire. `took`/`Thinking`
   entries are all live; this one line is not.
2. **The report's prose overstates run B** ("goes red *at the new assertion*"). My reproduction
   of exactly run B goes red at `:522` — a *pre-existing-style direct pin*, not the
   `PARKED_RESIDUE` entry. The author's own P1 probe covers the gap, and I reproduced all three
   entries independently, so the conclusion is right; only the gloss on B is loose.

Neither finding weakens the claim as stated. **PASS.**

---

## Files Touched

- CREATED: `Agent Reports/2026-09-24-0428_reviewer_REVIEW_F7N3.md` (this review — the only write)

**No source file was modified.** Verified by SHA256 before and after all mutation work:

| File | SHA256 before review | SHA256 after review | Result |
|---|---|---|---|
| `apps/web/app/dashboard/new/page.test.tsx` | `7ff29eb2…9294` | `7ff29eb2…9294` | **UNCHANGED** |
| `apps/web/app/dashboard/new/page.tsx` | `39233c7f…a7d8` | `39233c7f…a7d8` | **UNCHANGED** |
| `apps/web/components/ui/thinking-trace.tsx` | `5d60c4b4…c46d` | `5d60c4b4…c46d` | **UNCHANGED** |

All mutation work happened in a **full out-of-repo copy** (`%TEMP%/f7n3-instrument`, robocopy
`/E /XJ`, 34,641 files / 733.5 MB, 0 failures). The copy's three in-scope files were verified
**byte-identical** to the repo's before any probe ran. Reparse-point count inside the copy was
asserted **0** before use and **0** again before the guarded delete (the F12C junction lesson),
and the delete aborted on any link — none existed. Instrument, probe scripts and all temp
output verified gone (`remaining f7n3-* in TEMP: 0`).

Repo git state: `HEAD` still `d9cf8d7`, **0 stashes**, no commits. No
install / push / deploy / migrate / secret-touch. Root `vitest` still a real dir at **3.2.7**,
`apps/web` at **5.0.0**, all six `@vitest/*` present — the F12C repair holds.

## Dependencies Added

None. No install command was run.

## Assumptions Made

- **No web research needed, stated explicitly per RESEARCH FIRST.** This task is guard
  verification against bytes on disk: no library version, model name, API surface, or pricing
  fact is in play, so no live source was cited. Every fact below is a byte I read out of this
  repo or a command's own exit code.
- **`apps/web` is the authoritative cwd** for vitest/tsc/eslint/prettier on this file — read
  from `apps/web/package.json` (`"test": "vitest run"`, `"typecheck": "tsc --noEmit"`) and
  `vitest.config.mjs`, not assumed.
- **The "dead entry" defect class is F12C's**: an entry in a residue list that is only ever
  swept against a render that structurally cannot contain its string, so reverting the source
  to English ships green. I reproduced that class rather than taking the definition on trust.
- **`ENGLISH_RESIDUE` "unchanged" cannot be proven by git diff on this file**, because `HEAD`'s
  copy is a 464-line version with no residue list at all (the file was rewritten wholesale by
  earlier waves; current is 1988 lines). I therefore verified the claim three other ways:
  current content (16 entries, none of the three words), the behavioural probe that the
  page-level channel is live, and corroboration from the two whitelisted reports written
  *before* this task (F7N2 and F12C both describe the list without those words). Stated plainly
  rather than papered over.

## Verification

### 1. Structural checks — my own eyes, file:line

Helper and its `extra` seam (`page.test.tsx:390-395`):

```ts
function expectNoEnglishResidue(extra: [string, string][] = []) {
  const body = document.body.textContent ?? '';
  for (const [what, english] of [...ENGLISH_RESIDUE, ...extra]) {
    expect(body, `${what} still English: ${english}`).not.toContain(english);
  }
}
```

Per-branch lists (`:73-77`):

```ts
const THINKING_RESIDUE: [string, string][] = [['thinking label', 'Thinking']];
const PARKED_RESIDUE: [string, string][] = [
  ['thought label', 'Thought'],
  ['elapsed suffix', 'took'],
];
```

- **`ENGLISH_RESIDUE` at `:49-66` — exactly 16 entries; a grep for `Thinking|Thought|took`
  inside that block returns exit 1 (no match).** The dead entry was **not** installed.
- Three call sites, all inside **existing** `it` blocks — no new `it` block:
  `:469 expectNoEnglishResidue()` in the block opened at `:466`;
  `:497 expectNoEnglishResidue(THINKING_RESIDUE)` and
  `:524 expectNoEnglishResidue(PARKED_RESIDUE)` in the block opened at `:480`.
- Counts reconcile exactly: **43 `it(` + 2 `it.each` blocks (`:766` = 3 cases, `:876` = 3 cases)
  = 49 tests**, matching the runner banner. `294 expect(`. **No `.only` / `.skip` / `.todo`**
  (grep exit 1).
- Byte source is `thinking-trace.tsx:79` / `:84` — unchanged at `5d60c4b4…c46d`, so the Turkish
  literals under guard are the shipped ones.
- `page.tsx` contains **no** `Thinking`/`Thought`/`took` (grep exit 1), and the thread `<ul>` at
  `page.tsx:471-472` is gated on `messages.length > 0` — confirming the row's words can only
  exist once a turn is mounted. `chat-thread.tsx:25`/`:46` reach `ThinkingTrace` per branch.

### 2. Gates on the real tree — true exit codes, never through a pipe

| Gate (cwd `apps/web`) | Result | Exit |
|---|---|---|
| `npx vitest run app/dashboard/new/page.test.tsx` | `RUN v5.0.0`, `Test Files 1 passed (1)`, **`Tests 49 passed (49)`** | **0** |
| `npx tsc --noEmit` | 0 output lines | **0** |
| `npx eslint app/dashboard/new/page.test.tsx --max-warnings 0` | no output | **0** |
| `npx prettier --check app/dashboard/new/page.test.tsx` | "All matched files use Prettier code style!" | **0** |

**Instruments validated, not trusted** (a green can also mean "the file was never inspected"):
- `eslint --format json` → exactly **1** result, that file's path, `messages: 0`,
  `suppressedMessages: 0` — really linted, nothing suppressed.
- `tsc --noEmit --listFiles` → the touched file appears in the program (grep count 1).

### 3. Mutation proof — my own instrument, seven independent runs

Mutations were applied to the **out-of-repo copy only**. The copy's baseline and final control
were both **49 passed / exit 0**. The runner was pinned explicitly
(`node ./node_modules/vitest/vitest.mjs`, banner **`RUN v5.0.0`**) rather than via bare `npx`, to
avoid the wrong-major trap the author and F12C both documented.

| # | Mutation (in the copy) | Guard under test | Result | Exit |
|---|---|---|---|---|
| B | done-branch **label** only → `Thought` | (see Finding 2) | 1 failed \| 48 passed, fails at **`:522`** | **1** |
| **P-parked** | done-branch label only, `:522` pin neutralized | **the `Thought` entry alone** | 1 failed \| 48 passed, `thought label still English: Thought`, helper `:393` | **1** |
| **P-thinking** | thinking label only, `:494` pin neutralized | **the `Thinking` entry alone** | 1 failed \| 48 passed, `thinking label still English: Thinking`, helper `:393` | **1** |
| **P-suffix** | elapsed suffix only → `· took Ns` | **the `took` entry alone** | 1 failed \| 48 passed, `elapsed suffix still English: took`, call site `:524` | **1** |
| **P-premise** | dead design (entries folded into `ENGLISH_RESIDUE`, mounted sweeps removed) + **FULL English** + all `Düşün*` pins neutralized | the page-level channel | **49 passed** — **English ships green** | **0** |
| P-hero | hero title → English | the retained page-level channel | 3 failed \| 46 passed, `hero title still English: …` at `:469` | **1** |
| P-negpin | thinking label → English, `:494` pin **and** `THINKING_RESIDUE` sweep neutralized | the added negative pin `:523` | **49 passed** — `:523` cannot fire | **0** |
| C | copy restored from repo (control) | — | **49 passed** | **0** |

**All three new entries are independently load-bearing** (P-parked, P-thinking, P-suffix) — none
is decoration. Line numbers in the first three probes are shifted by one because each probe
deletes the sibling pin line above; the reported call site is the `expectNoEnglishResidue(...)`
line in each case.

**P-premise is the decisive premise check and it CONFIRMS the author:** with the entries in the
page-level list and the mounted sweeps removed, a **fully English** component ships with a
**completely green suite**. The entries would have been dead — the exact F12B/F12C class. The
author's PROBE 4 is corroborated independently.

**P-hero confirms the retained 16 entries are not themselves dead**: the page-level sweep does
fire on a real page-owned string when it goes English.

### 4. Repo integrity

- The three in-scope repo files are hash-identical before and after all work (table above).
  `page.test.tsx` mtime is `08:17:34`, which predates my session — untouched by me.
- `git status --short` on the scope shows the same pre-existing modified set, plus `page.module.css`
  / `page.tsx` / `thinking-trace.tsx` whose mtimes predate this task (the upstream F7 waves').
- No stray `*.orig` / `*.probe` / `*.bak` / `*.rej` anywhere in the repo. The only `f7n3` path in
  the repo is the author's own report file.
- No secrets or hardcoded credentials in the touched file — grep for `sk-|api[_-]?key|secret|password|bearer |token`
  returns only two unrelated prose comments mentioning "ask-line" and "ask-line-less" (no value).

## Open Questions for Orchestrator

### 1. NON-BLOCKING — the added negative assertion at `:523` is vacuous (guards nothing)

`expect(thread.textContent).not.toContain('Düşünüyor');` at `:523` (added by this task) **can
never fire**. Probe P-negpin: with the thinking label reverted to English **and** both of its
real guards (`:494` and the `THINKING_RESIDUE` sweep) neutralized, the suite stays
**49 passed, exit 0** — so `:523` did not and cannot catch it.

Why, verified by reading the test: `submitCreation` is called **once** in that `it` (at `:491`),
and the page maps `messages` one-to-one. When the first turn reaches `done` the assistant row is
*parked*; no thinking row is mounted, so `thread.textContent` cannot contain `Düşünüyor` at that
point whatever the source says. The assertion is true for a structural reason, not because the
copy is Turkish.

It is the **F12B/F12C dead-entry class, sitting one line below the fix whose whole purpose is to
prevent that class** — the same class the author invokes to reject the bare `Thinking`/`Thought`
entries. Impact is hygiene, not behaviour: it is inside a live assertion region, the entry it
accompanies (`PARKED_RESIDUE`) is genuinely live (P-parked), and it inflates `expect(` without
adding protection. **Recommendation (orchestrator's call):** either drop `:523`, or make it
load-bearing by asserting the negative on a render where a thinking row exists — i.e. after
`submitCreation` for a *second* turn while the first row is parked. Until one of those happens,
the report's Public Interface Exposed counts it among the guards and it is not one.

### 2. NON-BLOCKING — report accuracy: run B does not isolate the new entry

The report says run B "goes red **at the new assertion**" and calls it "the strongest possible
form" of the proof. My reproduction of exactly that mutation (done-branch label only) goes red
at **`:522`** — consistent with the report's own table, but `:522` is the *direct* pin, not the
`PARKED_RESIDUE` entry at `:524`. So run B, on its own, does not demonstrate that the new
`Thought` entry works; only the author's P1 probe (which neutralizes the `Düşün*` pins) does.
The author *does* include P1 and explicitly says the entries were each proven "one at a time",
so the conclusion is sound and I reproduced it three times over. **The finding is about the
prose, not the work** — worth a one-line correction so a future reader does not cite B as proof
of the entry.

### 3. Carried forward, unchanged, unowned (not this task's scope)

- The reviewer F3 English census at `lib/chat/thread.ts:52,137,148` and
  `use-chat-stream.ts:30,120`.
- D-004 (`Docs/DECISIONS.md`, English-only) contradicting the shipped Turkish wave.
- The author's INFO item on the out-of-repo `npx vitest` wrong-major trap is **real and worth
  folding into the standing instrument recipe** — I avoided it by pinning the CLI path, and the
  workspace's own banner independently reads `v5.0.0`.

## Public Interface Exposed

No production interface changed — test-internal only, and **I changed nothing**:

- `expectNoEnglishResidue(extra: [string, string][] = [])` — sweep helper at `:390-395`.
- `THINKING_RESIDUE` (1 entry) at `:73`; `PARKED_RESIDUE` (2 entries) at `:74-77`.
- `ENGLISH_RESIDUE` — 16 entries at `:49-66`, verified free of the three row words.
- Call sites `:469` / `:497` / `:524`; assertions added at `:522` (`toContain('Düşündü')`) and
  `:523` (`not.toContain('Düşünüyor')`).

## Known Limitations

- **No browser drive.** I did not start the app or complete the flow in a real browser; the
  evidence is the suite, the static gates, and DOM-level failure dumps from the probes on the
  real component path (`NewBotPage` → `ChatAssistantRow` → `ThinkingTrace`) through jsdom. Per
  LESSONS §2.4 that is weaker than a human completing the flow in the running app. For a
  guard-pin change it is the appropriate instrument, and it is disclosed rather than dressed up.
- **The `ENGLISH_RESIDUE` "unchanged" sub-claim is corroborated, not diff-proven** — see
  Assumptions Made. `HEAD`'s copy of this file predates the whole Turkish wave, so git cannot
  speak to it.
- **No pre-edit snapshot was recoverable.** I searched for the author's stated pre-edit hash
  `a95151c0…` among the repo, the index, `HEAD`, the transform caches, and every
  `%TEMP%/*backup*/page.test.tsx` from prior waves — **no copy matches**. So the report's
  before→after hash pair is taken as the author's record, not independently reproduced. What I
  *did* establish independently is that the **final** state is correct on its own terms, which is
  what the claim is about.
- **Verification ran against an actively-written working tree** (other agents write during this
  session). My files were hash-pinned across the whole task; my greens describe my bytes. A
  peer's concurrent change elsewhere is not covered.
- **`took` is a substring sweep on the whole body.** I confirmed no `took` exists anywhere in the
  render path today (grep exit 1), so the author's disclosed risk is real but currently latent —
  a future legitimate use of the word "took" in a rendered string on this page would trip it.
- **The probes are my own instrument, not the author's.** They reproduce the author's P1/P3 and
  PROBE 4 conclusions by independent construction; where we differ (run B's failure site) I
  report the difference rather than reconciling it silently.
