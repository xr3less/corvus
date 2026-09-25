# Task Report: F13-landing-turkish

## Status

SUCCESS

The task's own acceptance criteria are all met: the landing page ships in Turkish, its honesty
guards are preserved and re-proved by mutation, and the two in-scope files are green on
typecheck / lint / prettier / their own suite. One **cross-suite break in a file outside this
task's write scope** exists and is escalated below (Open Question 1); it is a two-literal test
edit, and it does not affect the shipped page.

## Files Touched

- MODIFIED: apps/web/app/page.tsx
- MODIFIED: apps/web/app/page.test.tsx

Nothing else was created, modified, or deleted. No manifest, lockfile, or env file was touched; no
install, git restore/stash/checkout/reset/commit/push, deploy, migration, or secret access was run.
`apps/web/app/landing-islands.tsx`, `apps/web/app/layout.tsx`, `apps/web/app/landing.module.css`,
`apps/web/eslint.config.mjs`, `apps/web/app/privacy/page.test.tsx` and `Docs/DECISIONS.md` were
**read** as context and are byte-unchanged.

## Dependencies Added

None. No new import was needed; the only import added to the test file is `node:fs` + `node:path`,
both already used by sibling suites in this repo (`readFileSync` on the page source, the idiom
documented at `app/dashboard/bots/[id]/page-disabled-guard.test.tsx:12`).

## Assumptions Made

- **D-004 ("English-only product language") was not treated as blocking, because this task's
  acceptance criteria are explicit and the Turkish wave is already live.** `Docs/DECISIONS.md:118-134`
  locks `Product language is English-only (no Turkish)` with `Superseded by: none`, but the F-series
  wave (F1/F2/F3, 2026-09-24) has already shipped Turkish UI — `apps/web/app/dashboard/new/page.tsx`
  and `packages/ai/src/persona-prompt.ts:38-45` both state that the owner writes Turkish — and the
  sibling F2 report records the same conflict in its own Assumptions. I followed the wave and the
  task, and escalated the stale decision record instead of editing docs outside my scope.
- **Plan names, prices and credit figures were left byte-identical.** `Starter`, `Corvus Pro`,
  `Corvus Studio`, `$0`, `$10`, `$29`, `2.000 AI kredisi` / `6.000 AI kredisi`, `~1.800 kurulum`,
  `6.000 AI kredisi`, `12 ay`, `8 başlangıç şablonu` — content unchanged, only the surrounding
  language. The same holds for the shared literals `Corvus`, `BOT`, use-case names
  (`moderation`, `logging`, `xp`, `giveaway`, `tickets`, `status`), template names
  (`Mod Shield`, `Ticket Desk`, `Welcome Wagon`), `X (Twitter)`, `MEE6`, `Dyno`, and the
  `corvus.ai/studio/sentinel-prime` URL.
- **The honesty qualifiers were translated, never moved or dropped.** `(planned)` → `(planlı)`
  (14 occurrences, same count), `Planned:` → `Planlı:` (13, same count), total planned-mentions
  31 → 31. The qualifier always stays attached to its claim (e.g. the `Hep açık. Hep hatırlar.`
  heading keeps its `(planlı)`), and the KI-033 split is preserved: the **enforced** trial
  (1 bot / 100 credits / 3 days) carries no `Planlı:`, while the still-planned prices/limits keep
  theirs.
- **`apps/web/app/landing-islands.tsx` needed no change.** Verified by grep: it holds no
  user-facing string (only code identifiers), so neither the FAQ accordion, the mobile drawer, the
  anchor smooth-scroll nor the reveal-on-scroll behaviour was touched by translating the page.
- **Turkish labels were written in proper sentence case rather than relying on CSS uppercasing.**
  `landing.module.css` applies `text-transform: uppercase` at `:964` (`.panelLabel`) and `:1874`
  (`.footerHeading`); Turkish dotted/dotless `i` behaves differently under uppercasing, so the
  labels are correct in the source text and the CSS transform is a presentation detail.
- **`app/page.test.tsx` gained a source-level guard idiom already used in this repo.** Two of the
  thirteen tests read `app/page.tsx` as text (via `readFileSync`) to assert invariants that only
  exist in the source — the nav-anchor set and the qualifier counts — following the existing
  precedent at `app/dashboard/bots/[id]/page-disabled-guard.test.tsx:12`.

## Open Questions for Orchestrator

1. **A file outside this task's write scope breaks because of this translation.**
   `apps/web/app/privacy/page.test.tsx:7,101-111` renders the **landing page** and asserts the
   footer legal links are named exactly `Privacy Policy` / `Terms of Service`; those footer CTAs are
   in this task's named scope ("hero, FAQ, CTAs"), so they are now `Gizlilik Politikası` /
   `Kullanım Şartları` and that test fails (`1 failed | 4 passed`). Its own comment explains the
   guard lives there precisely because `app/page.test.tsx` is outside *that* author's scope. The
   fix is a two-string edit in that file. **Recommendation: a small follow-up task** — I did not
   touch it (`SCOPE GUARD: STOP if other file needed`), and I did not leave the CTAs in English,
   because English CTAs on an otherwise-Turkish page is the defect the task exists to remove.
2. **`Docs/DECISIONS.md` D-004 is now factually stale.** It still reads English-only with
   `Superseded by: none` while the product ships Turkish on `/`, `/dashboard/new` (F2) and the
   persona lane (F3). The decision record should either be superseded or scoped to "code, prompts
   and identifiers stay English; user-facing copy is Turkish". This is a docs change outside my
   scope; the F2 report asks for the same amendment.
3. **`apps/web/app/layout.tsx:19` still declares `<html lang="en">`.** The landing page now serves
   Turkish content under an `en` language declaration. That is a real accessibility/SEO defect, but
   `layout.tsx` is shared by every route and outside my scope, so changing it here would have been a
   silent scope expansion. It should be part of the language wave's own task.
4. **Shared components remain English on this page.** The landing page renders `LandingEffects`
   and nothing else shared, so the landing surface is fully Turkish — but the same wave left
   `components/ui/ai-chat-input.tsx` and `components/ui/chat-thread.tsx` English (recorded in the F2
   report, Open Question 1), and app-wide surfaces (`/demo`, `/gallery`) are being translated by
   sibling agents right now. A single owner for "which shared component holds which language" is
   still missing.

## Public Interface Exposed

- No exported API changed. `export const metadata` keeps its shape; only the `title` and
  `description` values are now Turkish:
  `'Corvus - Discord botunu sade sözlerle kur'` / the Turkish one-line description.
- `export const NAV_LINKS` keeps its shape and its five entries; labels are Turkish, hrefs are
  byte-identical (`#bento`, `#how-it-works`, `#templates`, `#pricing`, `#faq`) and every href still
  resolves to an `id` present in the same file.
- `export default function HomePage()` — unchanged signature, unchanged component tree, unchanged
  `data-testid` hooks (`faq-item` ×5, etc.). No new prop, no new export, no new route.
- Test-only surface: `ENGLISH_RESIDUE` (the pre-translation English list, 32 entries) is a
  page-local constant in `app/page.test.tsx`; it is not exported.

## Known Limitations

- **This task translates the landing page only.** `/privacy`, `/terms`, `/demo`, `/gallery`,
  `/dashboard/*` and the shared chat components are not translated by it — several are being done
  concurrently by sibling agents, which is why the merged-suite numbers below look red.
- **The `/privacy` suite stays red until Open Question 1 is actioned.** Nothing in the shipped page
  is affected.
- **Two honesty claims on the page are still qualified rather than delivered** (`(planlı)` /
  `Planlı:`): they were qualified in English and are qualified in Turkish, which is correct — this
  translation did not change what the product promises, only the language it says it in.
- **The full-suite run is not a clean measurement of this task**, because a sibling wave is editing
  the dashboard/gallery surface in the same working tree at the same time (see Verification).
  The two in-scope files are measured in isolation and are green.

## Verification

### Acceptance criteria

| #   | Criterion                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hero, FAQ, CTAs and the pricing section are Turkish                        | Rendered-HTML sweep of the served page on `:3000`: `RESIDUE hits: (none)` across 28 pre-translation English strings; hero H1 `Özel AI Discord botlarını haftalar değil, dakikalar içinde kur`; 13/13 in `app/page.test.tsx`; screenshots `%TEMP%/f13-serve/f13-hero-atomic.png` and `f13-faq-open.png`                                                |
| 2   | Honesty guards preserved: planned qualifiers, anchor uniqueness, inert spans | `(planned)`→`(planlı)` 14→14, `Planned:`→`Planlı:` 13→13 (proved against the pre-change backup); nav `hrefs` length 5 with `new Set(hrefs).size === 5` and every target an existing `id`; community entries still `SPAN` with no external `http(s)` anchor on the page — all three asserted by their own tests and all ten breaks caught (table below) |
| 3   | Tests green incl. the full page suite; typecheck + lint clean               | `app/page.test.tsx` **13 passed (13)**; `tsc --noEmit` → **0 errors from either file**; `eslint app/page.tsx app/page.test.tsx --max-warnings 0` → exit 0; `prettier --check` → clean                                                                                                                          |
| —   | Prices / plan names / credit numbers UNCHANGED                              | `Starter`, `Corvus Pro`, `Corvus Studio`, `$0`, `$10`, `$29`, `2.000 AI kredisi`, `6.000 AI kredisi`, `~1.800 kurulum`, `12 ay`, `8 başlangıç şablonu` all PRESENT in the rendered text, byte-identical, and a mutation of `$10`→`$12` fails the suite                                                                                            |

### Guard verification (LESSONS.md §1 — each guard broken and watched to fail)

Ten behaviour breaks applied one at a time to a copy of the final files; **all ten were caught**:

| Break applied                                                      | Result                            |
| ------------------------------------------------------------------ | --------------------------------- |
| Hero H1 back to English                                            | 2 failed                          |
| `(planlı)` removed from the always-on heading                      | 2 failed                          |
| A nav `href` duplicated under two labels                           | 1 failed                          |
| A community footer entry turned from `span` into an anchor         | 2 failed                          |
| A `Planlı:` prefix removed                                         | 2 failed                          |
| `$10` mutated to `$12`                                             | 1 failed                          |
| The enforced trial line relabelled `Planlı:` (enforced→planned)    | 1 failed                          |
| The credits FAQ wrongly given a `Planlı:` label                    | 2 failed                          |
| A template CTA reverted to English                                 | 2 failed                          |
| The footer community entry reverted to English                     | 3 failed                          |

After mutation testing, both files were restored and proved **byte-identical** (`cmp -s`) to the
verified final copies. Backups live outside the repo at `%TEMP%/f13-backup/` per LESSONS §6 — no git
command touched the working tree at any point.

One measurement of my own was invalid and was caught by validating the instrument: a `$10`→`$12`
mutation that silently failed to apply, so the suite passed and *looked* like a guard gap. Printing
whether the regex applied showed `false`; redone with a literal split/join, the guard failed as
designed.

### Real-path verification (LESSONS.md §2.4 — the page ran, in a browser)

The instrument was validated **before** its readings were trusted: the served HTML on
`http://127.0.0.1:3000/` contained the new Turkish strings and none of the old English ones
(HTTP 200, 119292 bytes), so the server was demonstrably serving this edit and not a cached build.

- **The rendered Turkish page is complete.** 6679 characters of rendered text; zero English residue;
  every locked figure present; `(planlı)` ×14 and `Planlı:` ×13 in the *rendered* text, matching the
  source counts; document `<title>` is `Corvus - Discord botunu sade sözlerle kur`.
- **No layout break from the longer Turkish strings.** `horizontalOverflow: false`,
  `documentScrollWidth` 914 vs `innerWidth` 929. The single element reading as offscreen
  (`DIV [-37,951]`) is decorative and was **not** measured before the change, so it is not
  attributed to this task either way.
- **The FAQ accordion works, and this closes the one open question from my earlier run.** In a
  single atomic browser call: initial state `["true","false","false","false","false"]` with
  `aria-expanded` mirrored; a programmatic click on item 2 gave
  `["false","true","false","false","false"]`; after a reload, a **real trusted click** on item 2 gave
  the same, with `aria-expanded` `["false","true","false","false","false"]`. The earlier
  non-toggling reading is now explained as an instrument fault, not a defect: the hit-test at that
  moment returned `elementFromPoint → null` with `isButtonOrInside: false`, i.e. the click never
  reached the button — the shared browser was being driven concurrently by a sibling agent and the
  page had been scrolled away. A jsdom probe (real `fireEvent.click` on the same button, run before
  the file was restored) independently gave the same result, and `landing-islands.tsx:266-283` shows
  the handler is not gated by the lenis await, so no copy string I changed is read by that wiring.

### Merged-tree suite — read with care (LESSONS §7: N green trees ≠ the merged tree)

`npx vitest run` in `apps/web` on the merged, **uncommitted** tree: `Test Files 6 failed | 59 passed
(65)`, `Tests 60 failed | 922 passed (982)`. **One of those 60 is attributable to this task** — the
`/privacy` guard, Open Question 1. The other 59 are a concurrent sibling wave, which the failures
themselves prove:

| Failing file                          | Count | Whose change it is (evidence)                                                                                                        |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `app/dashboard/bots/[id]/page.test.tsx` | 56  | `page.tsx:1043 error TS2304: Cannot find name 'CREDITS_PER_CHANGE'` — the file is `M` (uncommitted) with a sibling's mid-edit          |
| `app/dashboard/bots/page.test.tsx`      | 1   | `expected '3 günlük deneme süren bitti — botları…' to contain 'Your 3-day trial ended — …'` — the page is Turkish, its test is English |
| `app/dashboard/new/page.test.tsx`       | 1   | `Unable to find an element with the text: /This reply used 1.1 credits/` — sibling copy now Turkish                                    |
| `app/gallery/page.test.tsx`             | 1   | `expected 'Ücretsiz 3 günlük deneme — 1 bot, 100…' to contain 'trial_bot_limit'` — sibling copy now Turkish                            |
| `lib/demo/f16-fp-probe.test.ts`         | 1   | `Cannot find module …/f16-fp-probe.test.ts` — an untracked sibling scratch probe, module-resolution error                             |
| `app/privacy/page.test.tsx`             | 1   | **This task** (Open Question 1)                                                                                                      |

None of those five sibling files imports the landing page; only `app/privacy/page.test.tsx` does
(`import HomePage from '../page'`), which is exactly why it is the one that belongs to me. My two
files in isolation: **13 passed (13)**, typecheck 0 errors, lint clean, prettier clean.
