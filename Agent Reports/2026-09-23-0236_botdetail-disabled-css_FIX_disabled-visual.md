# Task Report: botdetail-disabled-css

## Status
SUCCESS

## Files Touched
- MODIFIED: `apps/web/app/dashboard/bots/[id]/page.module.css` (+16 lines, 0 deletions — one new rule block plus its comment, inserted between `.ghostAction:active` and `.primaryAction`)

Nothing else was created, modified, or deleted in the repo. `git diff --stat` for the file is exactly `16 insertions(+)`. No markup, copy, logic, test, manifest, lockfile, or config file was touched.

## Dependencies Added
None. No install run, no manifest edit.

---

## What the defect was, and what closed it

The batch reviewer's finding was correct and reproduced exactly. The header's
`Continue interview · Coming soon` button was honestly disabled in the a11y tree
(`disabled aria-disabled="true" title="Coming soon"`) but the `.ghostAction` class carried
only `:hover` (`:127`) and `:active` (`:132`) rules and **no `:disabled` rule anywhere in
the file** — so a disabled button rendered pixel-identical to an enabled one.

The added rule:

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

Deliberate choices, each with its reason:

- **`opacity: 0.5` is the "not available" signal**, not a colour swap. A colour swap would
  have to invent values this palette does not already use; dimming is the one restrained
  move that reads as inactive without adding a new visual language. It also inherits
  correctly for any future disabled ghost — including `<a>`-based ones, which have no
  `:disabled` and stay unaffected.
- **`cursor: not-allowed`** is the repo's own idiom — `components/ui/Button.module.css:55`,
  `components/ui/Input.module.css:57`, and `app/gallery/page.module.css:403` all use it.
- **The hover lift is neutralised, not prevented.** `:hover` *does* match on a disabled
  button, so the existing `.ghostAction:hover` rule (higher specificity than the base rule)
  still painted its `#141417` background and `0.3` border whenever the pointer passed over a
  disabled control — a "come and click me" signal on a dead control. `:disabled:hover`
  (0,2,1) out-specifies `:hover` (0,2,0) and pins the colours back to the resting values, so
  the disabled control does not light up. I chose this over rewriting the existing `:hover`
  rule to `:hover:not(:disabled)` specifically to keep the **enabled** path byte-identical —
  `:not()` adds a pseudo-class to the specificity, and editing that selector is a change to
  the live styling. The existing `:hover` rule is untouched.
- **The hover colours are restated literally** (`transparent` + `rgb(255 255 255 / 0.15)`)
  rather than with `revert` / `initial`, because this repo targets Next.js 16 with no
  browser-support polyfilling, and restating the resting values is unambiguous.
- **`transform: none`** covers the theoretical `:active` scale — `:active` cannot fire on a
  disabled button in practice, so this is belt-and-braces, not an observed bug.
- **One rule, five call sites — the class was fixed, not the symptom.** `ghostAction` on this
  page is used by 9 elements, **5 of which can render disabled**:
  `Open` (`:1019` `inviteLoading`), `Continue interview` (`:1032`, always),
  `Run scan` (`:1205`, `scan.status === 'scanning'`),
  `Simulate join` (`:1249`, `simulating`),
  `Save as draft` (`:1257`, `savingDraft || stitchBrief(...).length === 0`).
  Before this edit all five looked pressable while disabled. All five are now covered by the
  one rule. Fixing only the Continue-interview call site would have left the same lie on four
  in-flight buttons (LESSONS §1.2).

## Verification — the guard was broken, and watched to fail

Per this repo's rule that a guard is not a guard until you have broken the thing it guards
(`LESSONS.md` §1.8), I did not settle for reading the CSS back.

**Instrument.** A throwaway probe outside the repo (`%TEMP%/ghostaction-probe`, since
removed — confirmed gone) carrying the real `page.module.css` verbatim, plus markup copied
verbatim from `page.tsx:1015-1037` and `:1255-1262`: the disabled Continue-interview button,
the enabled `Open` button, and a re-render of the in-flight `Save as draft`. Measured with
`getComputedStyle` in a real Chrome engine, **not** jsdom.

**The break.** I generated a paired stylesheet with only the new rule block stripped
(stripped span verified byte-for-byte to be the added rule and nothing else) and loaded both
variants in the same browser:

| Measurement | Rule stripped (the defect) | Rule present (the fix) |
|---|---|---|
| `opacity` (disabled) | `1` | `0.5` |
| `cursor` (disabled) | `pointer` | `not-allowed` |
| `opacity` / `cursor` (enabled `Open`) | `1` / `pointer` | `1` / `pointer` — **unchanged** |
| `:hover` lift while disabled | **applies** | neutralised (real pointer hover; `matches(':hover')` → `true`, background stays `rgba(0,0,0,0)`, border stays `0.15`) |
| disabled vs enabled | pixel-identical | visibly distinct |

Screenshots of both variants were captured and compared: with the rule stripped all three
buttons render identically; with the rule present the two disabled buttons are visibly dimmed
and the enabled `Open` is at full brightness. This is the reproduction and the proof in one
instrument — the same CSS yields the bug when the rule is removed and the fix when it is kept.

**Note on instrument fidelity.** The probe is the real stylesheet in a real browser, but it is
**not** the running Next app — it does not exercise CSS-module class hashing or the app's own
stylesheet ordering. See Known Limitations.

## Gates — exact commands, real results

| Gate | Command | Result |
|---|---|---|
| Prettier (touched file) | `npx prettier --check --ignore-unknown "apps/web/app/dashboard/bots/[id]/page.module.css"` | **exit 0** — clean at baseline too, so the edit introduced no new violation |
| Prettier (whole web workspace) | `npx prettier --check --ignore-unknown .` (in `apps/web`) | **exit 0** |
| ESLint on the touched file | `npx eslint "apps/web/app/dashboard/bots/[id]/page.module.css"` | **Does not apply to CSS.** → `0:0 warning File ignored because no matching configuration was supplied`, exit 0. Confirmed structurally: `npx eslint --print-config <file>` returns `undefined`, and there is no stylelint in the repo (no config, no dependency). No CSS lint can run, so the "zero warnings where applicable" criterion is satisfied by there being no applicable linter — stated plainly rather than silently skipped. |
| Typecheck | `npx tsc --noEmit` (in `apps/web`) | **exit 0** |
| Focused suite | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` | **54/54 passed**, 1 file |
| Same suite + neighbours | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx" app/dashboard/bots/page.test.tsx app/dashboard/page.test.tsx` | **98/98 passed**, 3 files |

No test file was edited. No test asserts on CSS content for this surface (checked: the only
`readFileSync`-on-CSS tests in the workspace are `app/dashboard/new/page.test.tsx:1265` and
`app/pryzm/page.test.tsx:13`, both for other files), so no locked test needed touching.

## Assumptions Made

- **`opacity: 0.5` is the right strength.** The task specified "reduced opacity" without a
  value. 0.5 is clearly distinct at a glance yet leaves the label legible; the enabled state
  is unchanged at 1.
- **The repo's `:disabled` idiom is `cursor: not-allowed` plus a muted appearance**
  (`components/ui/Button.module.css:51-56`, `components/ui/Input.module.css:54-58`). Both live
  in `components/ui/` and are token-based (`var(--color-border)` etc.), so I adopted the
  *idiom* (`not-allowed` + muted) but not the *tokens* — this stylesheet is a hardcoded-hex
  surface (`#fafafa`, `#141417`, `#16161b`, `rgb(255 255 255 / …)`) and mixing token-based
  values into it would be the visual-language break, not the fix.
- **The disabled Continue-interview button being un-clickable is correct and unchanged.** I
  only made it *look* disabled. Its `onClick`-less, `aria-disabled` markup is exactly as the
  previous task left it.
- **No `.design-src/` exists in this repo** (verified: the directory is absent), so the
  "match the source design file" comparison reduces to matching the sibling idiom in the same
  stylesheet and the repo's own disabled controls.

## Open Questions for Orchestrator

1. **A sibling of this defect exists in the bots LIST page, and it is NOT in my scope.**
   `apps/web/app/dashboard/bots/page.module.css:396/418/423` defines a
   *separate* `.ghostAction` (the list page keeps its own sheet; `bots/page.tsx:22` imports
   `../page.module.css` as `shared` and `./page.module.css` as `styles`) with the same
   `:hover` + `:active` and **no `:disabled` rule**. I enumerated every `styles.ghostAction`
   site on that page and, unlike the detail page, **none of them can currently be disabled**
   (`bots/page.tsx` has no `disabled=` at all; its one `ghostAction` is the "Clear search"
   button, `:191-200`, always enabled). So this is a **latent** instance of the same class —
   not a live user-visible defect today, but the next author who disables a list-page ghost
   will silently reproduce exactly this bug. One-line fix in a file outside my scope.
   **Recommend a small follow-up task** rather than folding it in here.
2. **The other honestly-disabled control in the app has no CSS treatment either.**
   `dashboard/page.tsx:234-242` and the rail render `Upgrade · Coming soon` with the identical
   `disabled aria-disabled="true" title="Coming soon"` marker, and
   `app/dashboard/page.module.css:3-28` / `components/ui/dashboard-rail.module.css:157-182`
   are both `.upgrade` with `:hover` + `:active` and **no `:disabled` rule**. Same class of
   unfinished edit, two more files, out of my scope. Worth deciding once whether the app wants
   a shared disabled-ghost idiom rather than three independent patches.

## Public Interface Exposed

None. CSS-module class names are internal to the stylesheet; no exported symbol, no component
prop, no API surface, no markup changed. `.ghostAction` keeps its name and all existing
declarations; the only addition is a new `:disabled` / `:disabled:hover` rule applying to it.

## Known Limitations

- **The running app was not exercised.** Per `LESSONS.md` §2.4, "done" means a human completed
  the flow in the running app. The gates are green and the CSS is verified in a real browser
  engine, but **both are still claims at the app level, not the app**. Everything measured
  above used the real stylesheet in a real browser with verbatim markup — it did **not** go
  through the Next dev server, so CSS-module class hashing and the app's real stylesheet
  ordering were not exercised. A human/browser pass over `/dashboard/bots/<id>` is still owed
  before this is called done, and is the strongest remaining evidence gap. (The batch reviewer
  flagged the same gap for all 9 fixes in the parent wave; this edit does not close it.)
- **The probe measured three of the five affected call sites.** `Open` and `Continue
  interview` were rendered; `Save as draft` stood in for the three in-flight variants. All
  five share the one `ghostAction` class and the rule keys purely off `:disabled`, so the
  mechanism is identical — but I measured three, not five.
- **No automated regression test guards this.** There is no CSS assertion for this surface and
  no stylelint in the repo, so a future author could delete this rule and nothing would go red.
  Adding one would mean touching a test file, which was outside my scope. Named rather than
  silently left. **A guard is cheap and already precedented here:** two tests in this repo
  assert on stylesheet *text* — `app/pryzm/page.test.tsx:12-15` (`readFileSync` on
  `pryzm.module.css`, with the comment *"File-text read (not the CSS-module class map) for the
  style assertions"*) and `app/dashboard/new/page.test.tsx:1265` (`readFileSync` on
  `chat-thread.module.css`, asserting `toContain` / `not.toContain` / `toMatch(/outline:\s*none/)`).
  The existing idiom would cover this in a few lines: read `page.module.css`, assert it contains
  a `:disabled` rule for `ghostAction`, and assert the enabled `:hover` rule is still present.
  **Recommend folding that into the follow-up task in Open Question 1** rather than leaving a
  rule whose removal no gate would catch.
- **`opacity: 0.5` composites the whole control**, so the 1px border dims along with the
  label. That is intended (the whole control reads as inactive) but it is a deliberate choice,
  not an accident of the property.
- **The a11y-tree behaviour is untouched by this task** — the button was already `disabled` +
  `aria-disabled="true"` + `title="Coming soon"`; this edit changes pixels and cursor only.
- Report slug used as given in the task (`0236`); the real clock at the end of the work read
  `2026-09-23-0240`.
