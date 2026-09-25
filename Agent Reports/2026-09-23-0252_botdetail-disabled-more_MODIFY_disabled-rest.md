# Task Report: botdetail-disabled-more-0252

## Status
SUCCESS

## Files Touched
- MODIFIED: `apps/web/app/dashboard/bots/[id]/page.module.css` (+24 lines vs working-tree baseline for this task, 0 deletions — two new rule blocks plus comments; vs HEAD `40 0` because the parent ghost rule is still uncommitted in the same working tree)
- CREATED: `Agent Reports/2026-09-23-0252_botdetail-disabled-more_MODIFY_disabled-rest.md` (this report)

Nothing else was created, modified, or deleted in the repo. No markup, copy, logic, test, manifest, lockfile, or config file was touched.

## Dependencies Added
None. No install run, no manifest edit.

---

## What was done

Added the two remaining `:disabled` rules on the bot-detail page, mirroring the landed `.ghostAction:disabled` idiom (opacity 0.5 dim + `cursor: not-allowed` + hover neutralised + `:disabled:hover` arm):

```css
.primaryAction:disabled,
.primaryAction:disabled:hover {
  background: #fafafa;
  border-color: #fafafa;
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

```css
.textAction:disabled,
.textAction:disabled:hover {
  color: #a1a1aa;
  opacity: 0.5;
  cursor: not-allowed;
}
```

Deliberate choices, each with its reason:

- **Filled button keeps resting bg/border (`#fafafa`).** The task spec is explicit: dimming via opacity is the signal, not a colour swap. Restating the resting values literally (same idiom as the ghost rule restating `transparent` + `0.15`) rather than `revert`/`initial`.
- **Text button pins hover colour to resting `#a1a1aa`.** The enabled `:hover` goes to `#fafafa`; without the `:disabled:hover` arm a disabled Rollback would still light up on hover (measured — see below).
- **`:disabled:hover` arm on both.** Same order-independence reason the reviewer proved for the ghost rule: `:hover` matches disabled buttons, so the arm makes neutralisation robust to rule reordering. Enabled rules untouched (additions-only).
- **`transform: none` on primary only.** Mirrors the ghost rule's belt-and-braces against the `:active` scale; `.textAction` has no `:active` rule, so there is nothing to neutralise.

Disabled-markup census confirmed from source before writing CSS (matches the reviewer report): `styles.primaryAction` has 2 disable sites (`Save version` `:1042` `disabled={publishing}`, `Start build` `:1267` `disabled={startingBuild || ...}`); `styles.textAction` has 1 (`Rollback` `:1050` `disabled={rollingBack}`). Both are honestly disabled on first load per the repo's own suite (`page.test.tsx:1464-1465`), so the footer previously rendered dimmed Save-as-draft beside a fully-pressable-looking Start-build while both were disabled.

## Verification — the guard was broken, and watched to fail

Per `LESSONS.md` §1.8, I did not settle for reading the CSS back.

**Instrument.** Throwaway probe outside the repo (`%TEMP%/disabled-more-probe/`, never inside the repo) carrying `stripped.css` (new span removed) and `full.css` (as shipped), plus markup copied verbatim from `page.tsx:1038-1053` and `:1263-1270` (disabled + enabled primary, disabled + enabled text). Measured with `getComputedStyle` in real Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`, headless + CDP) with **real pointer hover** (`Input.dispatchMouseEvent`, then `el.matches(':hover')`), not jsdom. Same idiom as the parent task.

**Stripped-span validation (instrument checked before trusting it).** Node script cut exactly the two added blocks (comment + rule, trailing newline included) and asserted: full − stripped = 826 chars = sum of both spans; stripped contains `ghostAction:disabled` but no `primaryAction:disabled`/`textAction:disabled`. Stripped-minus-ghost vs `git show HEAD` differs by exactly the 1 blank line the parent task's own insertion left (reviewer §2 documented this artifact) — pre-existing, not mine. `git diff` deletion-line count is `0`.

**Paired results, same markup, same engine:**

| Measurement | Stripped (defect) | Full (fix) |
|---|---|---|
| `opacity` disabled primary | `1` | **`0.5`** |
| `cursor` disabled primary | `pointer` | **`not-allowed`** |
| disabled primary bg/border | `rgb(250,250,250)` | `rgb(250,250,250)` — resting, unchanged |
| disabled primary real hover (`matches(':hover')=true`) | bg **lifts to `rgb(212,212,216)`** | bg stays `rgb(250,250,250)`, border stays `rgb(250,250,250)` — **neutralised** |
| `opacity` disabled text | `1` | **`0.5`** |
| `cursor` disabled text | `pointer` | **`not-allowed`** |
| disabled text colour | `rgb(161,161,170)` | `rgb(161,161,170)` — resting, unchanged |
| disabled text real hover (`matches(':hover')=true`) | colour **lifts to `rgb(250,250,250)`** | colour stays `rgb(161,161,170)` — **neutralised** |
| enabled primary/text (opacity, cursor, bg, colour, incl. hover) | `1` / `pointer` / resting | `1` / `pointer` / resting — **unchanged** |

Raw values saved at `%TEMP%/disabled-more-probe/probe-results.json` (`full.css` + `stripped.css` alongside). This is the reproduction and the proof in one instrument — the same CSS yields the bug when the span is removed and the fix when it is kept, while the enabled path never moves.

**Note on instrument fidelity.** Same caveat as the parent task: real stylesheet in a real browser engine, but not the running Next app — CSS-module class hashing and the app's real stylesheet ordering are not exercised.

## Gates — exact commands, real results

| Gate | Command (cwd noted) | Result |
|---|---|---|
| Focused suite | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` in `apps/web` | **54/54 passed**, 1 file |
| Same suite + neighbours | + `bots/page.test.tsx`, `dashboard/page.test.tsx` in `apps/web` | **98/98 passed**, 3 files |
| Typecheck | `npx tsc --noEmit` in `apps/web` | **exit 0**, no output |
| Prettier (touched file) | `npx prettier --check --ignore-unknown "app/dashboard/bots/[id]/page.module.css"` in `apps/web` | **exit 0** |
| Prettier (whole web workspace) | `npx prettier --check --ignore-unknown .` in `apps/web` | **exit 0** |
| ESLint on the touched file | `npx eslint "apps/web/app/dashboard/bots/[id]/page.module.css"` (repo root) | **Does not apply to CSS** — `0:0 warning File ignored because no matching configuration was supplied`, exit 0; `npx eslint --print-config <file>` returns `undefined`; no stylelint config or dependency anywhere in the repo. Stated plainly, not silently skipped. |
| Additions-only | `git diff --numstat` + `grep -c '^-[^-]'` on the file | `40 0` vs HEAD (16 ghost + 24 this task), **0 deletion lines**; enabled rules untouched |

One environment note: running vitest from the repo root fails to resolve `@/lib/bots` (wrong cwd — the alias resolves from `apps/web`). From `apps/web` per the task spec, all suites pass. No test file was edited; no test asserts on CSS content for this surface.

## Assumptions Made
- **`opacity: 0.5` is the right strength for both classes.** Task-specified value, same signal as the ghost rule; clearly distinct at a glance, label stays legible.
- **Resting-value restatement is preferable to `:not(:disabled)` narrowing.** Editing the existing `:hover` selectors would change the live enabled path's specificity; pinning colours in the new `:disabled:hover` arm keeps the enabled path byte-identical (verified by reconstruction + computed values).
- **Disabled Rollback/Save-version/Start-build being un-clickable is correct and unchanged.** This task changes pixels and cursor only, exactly as the parent task did for ghost.
- **No `.design-src/` comparison.** The parent task verified the directory is absent repo-wide; the sibling-idiom comparison (ghost rule + repo `not-allowed` idiom) stands in its place.

## Open Questions for Orchestrator
None blocking. Two named non-blockers:
1. The regression-guard gap from the parent review (Follow-up 2) still stands and now covers three rules instead of one — no test reads this stylesheet, no stylelint exists. The precedented `readFileSync`-on-CSS idiom (`dashboard/new/page.test.tsx:1265`, `pryzm/page.test.tsx:12`) would cover all three `:disabled` selectors plus the enabled `:hover` rules in a few lines. Recommend folding into whichever follow-up owns test changes (this task could not touch tests per scope).
2. The bots LIST sheet and Upgrade/rail controls named in the parent report are untouched per this task's scope guard (verified: no other repo file modified).

## Public Interface Exposed
None. CSS-module class names are internal; no exported symbol, component prop, API surface, or markup changed. `.primaryAction` and `.textAction` keep their names and all existing declarations; the only addition is one `:disabled` / `:disabled:hover` rule per class.

## Known Limitations
- **Not exercised through the running Next app.** Real stylesheet + real engine + verbatim markup, but not the Next dev server — CSS-module hashing and real stylesheet ordering unexercised. A human/browser pass over `/dashboard/bots/<id>` (first load: dimmed Save-as-draft beside dimmed Start-build; in-flight: publishing/rollingBack states) is still the strongest remaining evidence, same gap as the parent task.
- **`opacity: 0.5` composites the whole control**, border included. Intended (whole control reads inactive), same deliberate choice as the ghost rule.
- **Probe measured resting + real-hover computed values, not pixels.** No screenshots captured this time; the computed-value flips (`1`→`0.5`, `pointer`→`not-allowed`, lift→pinned) are the same signals the parent task confirmed visually.
- Report slug used as given in the task (`0252`); the real clock at diff-check time read `2026-09-23-0301`.
