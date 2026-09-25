# Task Report: dashfix-dashboard-minors-retry

## Status
PARTIAL

Both assigned fixes are implemented and verified on the real path (live app, both states
sequence-proven, guard-break-proven). The task is PARTIAL for one reason only: **three existing
tests in `apps/web/app/dashboard/page.test.tsx` pin the exact behavior this task ordered changed,
and that file is outside my write scope.** All three need assertion updates, not code changes.
Details in "Open Questions for Orchestrator". Nothing else is unresolved.

## Files Touched
- MODIFIED: apps/web/app/dashboard/page.tsx
- CREATED: Agent Reports/2026-09-23-1228_dashfix_FIX_dashboard-minors.md

No other file touched. `apps/web/app/dashboard/page.test.tsx` was **read but not modified** (outside
scope — see Open Questions).

## Dependencies Added
- None. No new dependency, no manifest or lockfile edit, no install run.

## Assumptions Made
- **Preset label → real slug mapping.** The three preset labels are landing-showcase names that do
  NOT exist in the seeded catalog. I mapped each to the real seeded template whose behavior set
  matches the advertised promise, verified behavior-by-behavior against
  `apps/gateway/src/db/seed-templates.ts`:
  | Preset label | Real slug | Why it matches (seed behaviors) |
  |---|---|---|
  | Community Guardian | `mod-shield` | banned words + timeouts + every action logged |
  | AI Support Desk | `ticket-desk` | support panel + private ticket + topic routing |
  | Welcome & Role Picker | `welcome-wagon` | welcomes + rules link + private member DM |
  Labels were NOT changed (they are pinned by `page.test.tsx:306` and mirrored on the landing
  strip `apps/web/app/page.tsx:589,638`). The underlying label/catalog mismatch is a pre-existing
  finding on the landing page, tracked as **M-1** in
  `Agent Reports/2026-09-23-0347_sweep_REVIEW_sweep-synthesis.md:46` — I did not touch it, and the
  fix belongs to the landing strip, not this file.
- **Target route = `/gallery/<slug>` (the E3 detail page), not `?template=<slug>`.**
  `/gallery/<slug>` is the richer target: it previews the template's real behaviors and permissions,
  and carries a "Start in chat" link that already encodes `/dashboard/new?template=<slug>` (verified
  `apps/web/app/gallery/[slug]/page.tsx:305`). Linking straight to the chat page would put a
  template brief into the composer with no preview of what the template actually does. The
  `?template=` contract is therefore still reached — one click further, and only after the person
  sees what they are choosing.
- **Slug safety:** every slug is a literal in this file, and all three were checked against the
  locked 8-template set (`apps/gateway/src/db/seed-templates.test.ts:21-45`). No slug is built from
  user input, so no malformed/unknown slug can be linked.
- The loading shell follows the bots-list idiom (`bots/page.tsx:237-240`): same
  `styles.panel` container and the same "Loading your bots…" copy, inside a labelled `<section>`.
  `role="status"` sits on the `<p>`, not the section, so the section is still exposed as a named
  `region` — matching how the rest of this page labels and queries its panels.

## Open Questions for Orchestrator
**1. Three tests pin the defect and need assertion updates (blocking full green; outside my scope).**

`apps/web/app/dashboard/page.test.tsx` was outside my declared write scope, so I did not modify it.
It currently fails 3 of 22 tests — each failure is the test asserting the exact behavior this task
was ordered to remove:

| Test (line) | Fails because | Needed change |
|---|---|---|
| `renders an honest empty state with a link to create the first bot` (:170) | renders with no injected prop, so the fetch is in flight and the region is now `Loading your bots`, not `No bots yet` | await the settled state (`findByRole`), same as the sibling test at :357 already does |
| `shows the honest expired banner when the trial clock has passed` (:194) | same in-flight cause — asserts the `No bots yet` region synchronously | await the settled state |
| `renders the template strip with three cards and a real gallery link` (:300) | asserts `getAllByRole('button')` has length 3; the cards are now `<a>` elements | assert `getAllByRole('link')`, and assert each `href` — this is the assertion that should have caught the dead buttons in the first place |

Note that two of the three are not really "old behavior" failures — they are the same latent
in-flight assumption in the test that the fix made visible. The test at :357
(`renders an honest empty state when the live list fails, never mock rows`) already awaits and
**passes**, confirming the resolved-empty path is intact.

Recommendation: one small test-only follow-up task (scope = `page.test.tsx` only) to update these
three assertions and add the `href` assertions plus a mid-flight loading assertion. I deliberately
did not touch the file.

**2. Credit card behavior is unchanged, per the explicit out-of-scope instruction.**
`apps/web/app/dashboard/page.tsx:164-168` still reads `—` for bot-less accounts even when
`/api/credits` has data. The inspection report raised this as OQ2
(`2026-09-23-1255_inspect-dashboard_REVIEW_dashboard.md:18`). It remains a product question for you.

## Public Interface Exposed
- No exported signature changed. `DashboardPage` props (`bots?`, `trialExpired?`) are unchanged, so
  props-injecting tests are unaffected.
- Component behavior changes:
  - Template cards changed element type from `<button type="button">` to `<a href>` — three new
    navigation targets `/gallery/mod-shield`, `/gallery/ticket-desk`, `/gallery/welcome-wagon`.
    Each is now reachable by role `link` and by keyboard tab, and each resolves to a real page.
  - New labelled region `Loading your bots` (`role="status"` on the inner paragraph) replaces the
    empty state while the bots fetch is in flight. `No bots yet` renders only once the read settles.

## Verification Performed
All commands run in `C:\Users\xr3less\Desktop\corvus`.

- **Typecheck** — `npm run typecheck` in `apps/web` (`tsc --noEmit`): clean, exit 0.
- **Lint** — `npx eslint apps/web/app/dashboard/page.tsx --max-warnings 0`: clean, exit 0 (root
  ESLint config, unmodified).
- **Format** — `npx prettier --check app/dashboard/page.tsx`: clean.
- **Full web suite** — `npx vitest run`: **881 passed, 3 failed**, the 3 being the scope-blocked
  tests above. 61 of 62 files pass. No collateral damage anywhere else.
- **Real path, live app (not just tests).** Dev server already running on `127.0.0.1:3000`;
  `/dashboard` returns 200. Verified in a real browser:
  - All three cards render as `<a>` with `cursor: pointer`, `text-decoration: none`,
    `color: rgb(250,250,250)`, `min-height: 96px`, `padding: 18px`, `border-radius: 12px`,
    `background: rgb(11,11,13)` — **identical box and type styling to the buttons they replaced**, so
    the visual card is unchanged. Verified against the global Tailwind preflight anchor reset
    (`text-decoration: inherit`) rather than assumed.
  - All three detail routes return **HTTP 200**: `/gallery/mod-shield`, `/gallery/ticket-desk`,
    `/gallery/welcome-wagon`.
  - Loading gate, observed under Slow-3G throttling with a DOM mutation recorder installed before
    app boot: rendered sequence is **`LOADING` → `NO_BOTS_YET`**. The "No bots yet" flash is gone.
  - Credits card still reads `—` and Servers still reads `—` on a bot-less account — unchanged and
    honest (no fabricated 0).
- **Guard-break proof (the test the fix is worth).** I broke the guard
  (`const botsLoading = false;`), reloaded, and the recorder produced **`NO_BOTS_YET` as the first
  and only state** — the flash returned, exactly as predicted. Restored the guard and re-ran:
  sequence back to `LOADING → NO_BOTS_YET`, then re-confirmed typecheck + lint + prettier all clean
  on the restored file. The guard is proven by watching the thing it guards fail, not by assertion.
- **Live-DB caveat (instrument validated, not assumed).** `/api/templates/<slug>` returns 404 and
  `/api/templates` returns `{"templates":[]}` on this local box. I checked whether that was a bad
  slug or an empty database before trusting it: the list endpoint is empty, so this is an
  **unseeded local DB**, not a slug defect. The three slugs were independently confirmed against the
  locked set in `seed-templates.test.ts:21-45`. The `/gallery/<slug>` routes returning 200 confirms
  the web tier accepts all three; the detail pages will populate against a seeded database.

## Known Limitations
- The 3 scope-blocked test assertions are NOT updated (Open Question 1). Until a test-only follow-up
  lands, `npm test` in `apps/web` is red on those 3, and any CI gate on the web suite will fail.
- Did not verify the three detail pages render populated content, because the local catalog DB is
  unseeded (see caveat above). Confirmed: route resolves, slug is valid, and the page's own honest
  "Template unavailable — try again." path handles the unseeded case rather than crashing.
- The preset **labels** still do not match the catalog **names** (`mod-shield` renders as "Mod
  Shield", not "Community Guardian"). This is the pre-existing M-1 landing mismatch, unchanged and
  out of this task's scope. Flagging it because the dashboard strip now shows a name that the detail
  page it opens will contradict — the honest end state is one shared set of names, and that decision
  is yours.
- Credits card `—`-for-bot-less behavior left exactly as-is per the explicit out-of-scope
  instruction, even though the inspection report flagged it as an open question.
- No production, box, GHCR, or live-key contact. No secret value was read, printed, or transmitted.
  No git restore/stash/checkout/reset, and no commit was made.
