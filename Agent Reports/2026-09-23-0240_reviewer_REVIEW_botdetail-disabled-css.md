# Task Report: reviewer-botdetail-disabled-css

## Status
PASS (with two named follow-ups — neither blocks this task)

## Scope of this review
Reviewed task `botdetail-disabled-css`: one CSS-only change adding a
`.ghostAction:disabled` / `.ghostAction:disabled:hover` rule to
`apps/web/app/dashboard/bots/[id]/page.module.css`.

Verdict rationale: the change does exactly what it claims, the enabled path is
provably unchanged, all gates reproduce green, and I independently reproduced
both the defect and the fix in a real browser engine. Two follow-ups are named
below (one is a second live instance of the same defect class in the same file,
which the author's report did **not** cover); neither is a defect in this diff.

---

## Verification evidence (trust artifacts, not summaries)

### 1. The rule exists, and the diff is additions-only — three independent confirmations

| Check | Command | Result |
|---|---|---|
| numstat | `git diff --numstat -- <file>` | `16  0` — 16 insertions, **0 deletions** |
| hunk header | `git diff -U0 -- <file>` | single hunk `@@ -135,0 +136,16 @@` — pure insertion point, no removed context |
| body scan | `git diff -- <file> \| grep '^-'` (excl. `---`) | **0** deletion lines |

The new rule is present at lines 143-149, exactly as reported:

```css
.ghostAction:disabled,
.ghostAction:disabled:hover {
  background: transparent;
  border-color: rgb(255 255 255 / 0.15);
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

`grep -n ghostAction` on the stylesheet returns exactly 5 hits: base (:105),
`:hover` (:127), `:active` (:132), and the two new selectors (:143, :144). No
other `:disabled` rule exists in the file.

### 2. The enabled path is byte-identical — proven by reconstruction, not by reading

This is the strongest single piece of evidence in this review. I took the real
file, removed **only** the 16 added lines, and compared the result to the
committed baseline:

- `git show HEAD:<file>` (HEAD = `d8dcafa`, the baseline) → 7941 chars
- real file minus the added span → **7941 chars, and `stripped === head` → `true`**

The stripped reconstruction is **byte-for-byte identical to HEAD**. That means
the added span is provably the *only* difference between the baseline and the
current file — the enabled `.ghostAction` rules are untouched, and nothing else
in the file moved. (One nuance for the record: a naive `replace(addedBlock, '')`
leaves one extra blank line and does *not* equal HEAD; the exact span is
`block + '\n'`. I state this because it is exactly the kind of one-character
instrument error that would have produced a false FAIL, and I validated the
instrument before trusting it.)

### 3. Real-browser reproduction of the defect AND the fix (paired instrument)

I built a throwaway probe **outside the repo** (`%TEMP%/ghostprobe`, since
deleted — confirmed gone), carrying the real stylesheet verbatim and markup
copied verbatim from `page.tsx` (disabled Continue-interview, enabled `Open`,
in-flight `Save as draft`, plus `Simulate join` / `Run scan`). Measured with
`getComputedStyle` in a real Chrome engine (Playwright), **not** jsdom, with a
**real pointer** for the hover tests (`locator.hover()`, then checking
`el.matches(':hover')`).

**Paired comparison, rule stripped vs. rule present (same markup, same engine):**

| Measurement | Rule STRIPPED (the defect) | Rule PRESENT (the fix) |
|---|---|---|
| `opacity` (disabled) | `1` | **`0.5`** |
| `cursor` (disabled) | `pointer` | **`not-allowed`** |
| `opacity` / `cursor` (enabled `Open`) | `1` / `pointer` | `1` / `pointer` — **unchanged** |
| disabled hover: `matches(':hover')` | `true` | `true` |
| disabled hover: `background` | `rgb(20, 20, 23)` — **lift applied** | `rgba(0, 0, 0, 0)` — **neutralised** |
| disabled hover: `border` | `rgba(255,255,255,0.3)` — **lift applied** | `rgba(255,255,255,0.15)` — **neutralised** |
| enabled hover (`Open`) | `rgb(20, 20, 23)` lift | `rgb(20, 20, 23)` lift — **unchanged** |

This confirms two things the report claimed and that matter:

1. **`:hover` really does match on a disabled button** (measured `matches(':hover') === true`, background actually computed to the lifted `rgb(20,20,23)`). The bug the author described was real, not hypothetical.
2. **The enabled hover lift still works** — the enabled path is not just unchanged in source, it is unchanged in computed behaviour.

Screenshots of both variants were captured; with the rule stripped all buttons
render identically, with the rule present the disabled ones are visibly dimmed.
Visually confirmed on the real surface colour (`#16161b`).

### 4. The specificity reasoning — verified, and the mechanism pinned precisely

The report claims `:disabled:hover` (0,2,1) out-specifies `:hover` (0,2,0).
Two notes, both verified by experiment rather than by arithmetic:

- **Terminology:** the report writes the specificity as `(0,2,1)` vs `(0,2,0)`.
  In the usual `(a,b,c)` = (id, class/attr/pseudo-class, type) notation these are
  `(0,2,0)` and `(0,1,0)` respectively — the report's *relative ordering is
  correct* and the conclusion holds; only the shorthand labels are off by one
  column. Cosmetic, no behavioural consequence.
- **Is the `:disabled:hover` arm load-bearing?** I isolated it with four variants
  in the same engine:

| Variant (position of the disabled rule vs `.ghostAction:hover`) | Hover lift after real hover? | Mechanism |
|---|---|---|
| `:disabled` + `:disabled:hover`, placed AFTER `:hover` (the shipped form) | neutralised ✔ | `:disabled:hover` higher specificity |
| `:disabled` only, placed AFTER `:hover` | neutralised ✔ | specificity tie, later source order wins |
| `:disabled` + `:disabled:hover`, placed BEFORE `:hover` | neutralised ✔ | higher specificity, order-independent |
| `:disabled` only, placed BEFORE `:hover` | **lift RETURNS ✘** | tie, later source order (`:hover`) wins |

**Conclusion:** the `:disabled:hover` arm is genuinely load-bearing for
robustness — it makes the neutralisation **order-independent**. The shipped form
survives all four orderings *because of* that arm; the bare form would silently
break the moment someone moved the rule above `.ghostAction:hover`. The author
chose the more robust form, and their stated reason (specificity) is the correct
explanation for *that* arm. Accurate.

### 5. Gates — reproduced by me, with the project's real commands

Toolchain detected from `package.json` (npm workspaces; `apps/web` scripts
`typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check`,
`test: vitest run`; root `lint: eslint . --max-warnings 0`).

| Gate | Command | My result |
|---|---|---|
| Focused suite | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` (in `apps/web`) | **54/54 passed**, 1 file, exit 0 |
| Neighbour suite | + `bots/page.test.tsx`, `dashboard/page.test.tsx` | **98/98 passed**, 3 files, exit 0 — matches the report |
| Typecheck | `npx tsc --noEmit` (in `apps/web`) | exit 0, no output |
| Prettier (touched file) | `npx prettier --check --ignore-unknown <file>` (root) | exit 0 — "All matched files use Prettier code style!" |
| Prettier (web workspace) | `npx prettier --check --ignore-unknown .` (in `apps/web`) | exit 0 |
| Root lint gate | `npx eslint . --max-warnings 0` (root) | exit 0 |

**ESLint does not lint CSS — verified structurally, not assumed.** Three
confirmations: running `npx eslint <file>.css` returns *"File ignored because no
matching configuration was supplied"* (exit 0); `npx eslint --print-config
<file>.css` returns `undefined` rather than a config object; and
`eslint.config.mjs` contains **no** CSS reference (no `css` entry). I also
confirmed there is **no stylelint** in the repo — no config file at root or in
`apps/web`, and no `stylelint` key in any `package.json`. So the "linter clean"
criterion is satisfied by there being no applicable CSS linter, which the report
stated plainly rather than silently skipping. Judgment: honest, and the claim
reproduces exactly as written.

### 6. Scope check — no other repo file is attributable to this task

`git diff --stat` for the file: `16 insertions(+)`, one file. I then checked the
other CSS files touched in the same working tree, to be sure none of them were
this task leaking outside its scope:

- `landing.module.css` — `+align-items: flex-start` inside a `@media` block
- `dashboard-rail.module.css` — `+min-height: 0`
- `chat-thread.module.css` — a `composerNoRing` focus-ring opt-out block

None of the three contain a `:disabled` rule, and none is related to the
disabled-ghost defect. Scanning **every** CSS diff in the working tree for
`+.*:disabled`, the only file that adds one is
`apps/web/app/dashboard/bots/[id]/page.module.css`. The other three belong to
other agents' work in this wave (the composer one cites an explicit founder
order in its own comment). **Scope is clean.**

I also verified the two gating call sites in `page.tsx` are as the report
describes: `Continue interview` carries `disabled aria-disabled="true"
title="Coming soon"` (:1031-1033) and `Open` carries `disabled={inviteLoading}`
(:1019). Nothing in `page.tsx` was modified by this task (the file's own diff
belongs to the previously-reviewed `fix-botdetail-draft`).

### 7. Whitelisted reports exist on disk

- `Agent Reports/2026-09-23-0236_botdetail-disabled-css_FIX_disabled-visual.md` — 12961 bytes, present
- `Agent Reports/2026-09-23-0131_fix-botdetail-draft_FIX_botdetail-draft-wipe.md` — 6425 bytes, present

Both read in full. The CSS report's specific factual claims that I spot-checked
all hold: the cited idiom line numbers are exact
(`components/ui/Button.module.css:51-56` → `.button:disabled` with
`cursor: not-allowed`; `Input.module.css:54-58`; `gallery/page.module.css:403`),
and **`.design-src/` does indeed not exist** in this repo (confirmed — so the
design-comparison criterion reduces to matching sibling idiom, as the report
said).

### 8. The guard was broken and watched to fail

Per `LESSONS.md` §1.8, I did not accept "the rule is present" as evidence. The
paired probe **is** the break: the same markup, same engine, CSS differing only
by the added span, and the measured values flip exactly as the task requires
(`1`→`0.5`, `pointer`→`not-allowed`, lift→no lift) while the enabled control
never moves. I also pre-validated the instrument before trusting it (the blank-line
catch in §2 above), and confirmed the stripped variant was byte-identical to HEAD
rather than merely "close enough".

---

## Follow-up 1 (NEW — not in the author's report): a second live instance of this defect class in the SAME file

The author's Open Question 1 correctly identified a *latent* sibling in the bots
**list** page (no disabled call sites today). **But there is a second, live,
user-visible instance in `page.tsx` that the report does not mention**, because
the author scoped their census to `.ghostAction` alone.

`page.tsx` disables controls across **three** classes, not one:

| Class | Disabled call sites | Has `:disabled` CSS? |
|---|---|---|
| `styles.ghostAction` | 5 | **yes** — this task's fix |
| `styles.primaryAction` | **2** (`Save version` :1042, `Start build` :1267) | **no** |
| `styles.textAction` | **1** (`Rollback` :1050) | **no** |

Measured in the same real-browser probe, on the shipped stylesheet (new rule
included): a disabled `.primaryAction` computes `opacity: 1`, `cursor: pointer`,
`background: rgb(250,250,250)` — **identical to the enabled one**.

Crucially, this is **not theoretical**, and I did not have to reason about
reachability to show it — **the repo's own test suite proves both buttons are
disabled on first load**:

```
page.test.tsx:1461  const saveButton  = ... 'Save as draft'
page.test.tsx:1462  const startButton = ... 'Start build'
page.test.tsx:1464  expect(saveButton.disabled).toBe(true);
page.test.tsx:1465  expect(startButton.disabled).toBe(true);
/* Empty thread + empty composer: nothing to save or build from. */
```

So on first load the footer row renders **`Save as draft` (correctly dimmed, this
fix) sitting immediately next to `Start build` (undimmed, fully pressable-looking)**
— while *both* are genuinely disabled. The same applies in-flight: `Save version`
(`disabled={publishing}`) and `Rollback` (`disabled={rollingBack}`) also carry no
disabled styling. A screenshot of that adjacent pair was captured.

This is precisely the class the task set out to close ("a disabled control must
not look pressable"), and the fix is one rule block per class in the same
stylesheet the author already owns. It is **out of this task's scope** (the task
was `.ghostAction`), so it does not fail this review — but it means the user-visible
inconsistency on `/dashboard/bots/<id>` is **only partly** fixed, and the report's
framing ("one class, five call sites — the class was fixed") is accurate about
`ghostAction` while understating the page-level picture. Recommend a follow-up.

## Follow-up 2 (confirmed): no regression guard, and the author already named it

The author's Known Limitations flags that nothing would go red if this rule were
deleted. **Confirmed** — there is no stylelint, and no test reads this file (I
searched: `grep page.module.css` over the bots tests returns nothing; repo-wide
there are 3 tests that read CSS *text*: `dashboard/new/page.test.tsx:1265`,
`pryzm/page.test.tsx:12`, `components/ui/builder-progress.test.tsx:161`). The
existing `readFileSync`-on-CSS idiom the author cites is real and would cover
this in a few lines. Their recommendation to fold a guard into the follow-up task
is sound.

---

## Dependencies Added
None. No install run, no manifest or lockfile touched by this task.

## Assumptions Made (of this reviewer)
- I treated `opacity: 0.5` as an accepted design choice, not a defect — the task
  said "reduced opacity" without a value, and 0.5 is clearly distinct while
  keeping the label legible. Visible in the captured screenshot.
- I treated "the disabled Continue-interview button is un-clickable" as correct
  and out of scope — it matches the honesty decision locked by the previously
  reviewed `fix-botdetail-draft` task.
- I did not require a `.design-src/` comparison, since no such directory exists
  in this repo (verified). The sibling-idiom comparison stands in its place.

## Open Questions for Orchestrator
- **Confirm the primaryAction/textAction gap is intended as a separate task.**
  It is one rule block per class in the same stylesheet, and it closes the
  remaining half of the same class of lie on this page. My recommendation: yes,
  a small follow-up — and fold the regression guard (Follow-up 2) into it.
- **The running app was still not exercised end-to-end by this review either.**
  I used the real stylesheet in a real browser engine with verbatim markup, but
  not the Next dev server, so CSS-module class hashing and real stylesheet
  ordering are still unexercised — same gap the author named. Worth one browser
  pass over `/dashboard/bots/<id>` before the wave is called done.

## Public Interface Exposed
None. CSS-module class names are stylesheet-internal; no exported symbol, no
component prop, no API surface, no markup change. `.ghostAction` keeps its name
and every one of its existing declarations; the only change is the added
`:disabled` / `:disabled:hover` rule.

## Known Limitations
- **Not exercised through the running Next app** (see Open Questions). The
  strongest remaining evidence gap, and it is the same gap the author named.
- I measured the rule's effect on the real stylesheet and verbatim markup, but
  not through `page.tsx`'s own render path — jsdom does not compute CSS-module
  styles, so the component tests cannot cover this, which is exactly why the
  guard in Follow-up 2 matters.
- Follow-up 1 was established from the stylesheet plus the repo's own test
  assertions on `disabled`; I did not render the full page component in a
  browser to photograph the real `/dashboard/bots/<id>` footer. The probe used
  the real classes and real stylesheet in the correct adjacency.
- I created no file inside the repo except this report. My probe lived in
  `%TEMP%` and has been deleted (confirmed gone); two screenshots that Playwright
  initially wrote to the repo root were removed, and `.playwright-mcp/`
  (git-ignored, pre-existing directory) holds the review captures. The touched
  stylesheet is still `16 0` — untouched by me.
