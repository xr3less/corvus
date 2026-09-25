# Task Report: reviewer-dashfix-wave

## Status
**PASS**

Both claimed fixes are real on disk, both are proven on the real path (not just in tests), all
three preset slugs resolve against the catalog source of truth, and the full web suite is green.
Two observations are recorded below as non-blocking (neither is a defect in this wave).

## Files Touched
- CREATED: Agent Reports/2026-09-23-1305_reviewer_REVIEW_dashfix-wave.md

No source file was modified. This task was read-only by scope. All commands were read-only
(`vitest run`, `tsc --noEmit`, `eslint`, `prettier --check`, `git show`/`git diff`/`git status`,
`curl` GETs, browser navigation). No git command that restores from HEAD was run; no commit was made.

## Dependencies Added
- None. Not applicable (review task).

## Assumptions Made
- **The three preset labels are the landing showcase's labels, not the catalog's names.** I verified
  this rather than assuming: `Community Guardian` / `AI Support Desk` / `Welcome & Role Picker` appear
  as `styles.tTitle` headings at `apps/web/app/page.tsx:543,592,641`. So the dashboard strip mirrors
  the landing strip, and the label→"Mod Shield" contradiction is the pre-existing M-1 finding, not a
  new one introduced here. (See Open Question 1.)
- **`app/terms/*` was NOT touched by this wave.** Verified by mtime, not by report claim:
  `terms/page.tsx` = 12:55:41 and `terms/page.test.tsx` = 12:59:35, both *after* this wave's last
  write (`dashboard/page.test.tsx` = 12:54:09). The terms work belongs to the sibling `landfix` wave
  (`Agent Reports/2026-09-23-1245_landfix2_FIX_terms-test.md`, EXISTS on disk, 13:01). I confirmed I
  did not need the terms files for this review, and they were not touched by the dashfix wave.
- **`?template=<slug>` is a real, wired contract.** The "Start in chat" link carrying
  `/dashboard/new?template=<slug>` exists at `apps/web/app/gallery/[slug]/page.tsx:305`, so routing
  the cards to the gallery detail page (rather than straight to chat) still reaches the chat contract
  one click later. That is a defensible, richer choice, not a dead end.

## Open Questions for Orchestrator

**1. The cards' labels contradict the pages they open — a product/copy decision, still open.**
The dashboard strip shows `Community Guardian` and links `/gallery/mod-shield`, whose catalog name is
`Mod Shield` (`seed-templates.ts:90`). Same class for the other two: `AI Support Desk` → `Ticket Desk`
(`:133`), `Welcome & Role Picker` → `Welcome Wagon` (`:49`). The slug mapping is behaviorally right,
and the labels are correct as mirrors of the landing strip — the two sets of names simply disagree.
This is the pre-existing M-1 finding, and the dashboard fix has now made it *visible within one click*
(same screen flow: click card → destination says a different name). One shared set of names is the
honest end state; that is your call, and the fix belongs on the landing strip and in this file's
`TEMPLATES` together.

**2. Credits card still reads `—` on bot-less accounts (unchanged, as instructed).** With
`hasBots === false`, `creditsValue` short-circuits to `—` at `apps/web/app/dashboard/page.tsx:184-185`
even when `/api/credits` answers. The prior inspection raised this as OQ2. It is explicitly
out-of-scope for this wave per the ordering, and the behavior is unchanged and honest (never a
fabricated 0) — flagged only so the product decision stays visible.

**3. No fetch timeout on the bots read (pre-existing, not a regression).** See Known Limitations.

## Public Interface Exposed
No exported signature changed. `DashboardPage` still takes `{ bots?: MockBot[]; trialExpired?: boolean }`
(`apps/web/app/dashboard/page.tsx:347-359`); props-injecting tests are unaffected.

Behavior changes now live on the dashboard home surface:
- Template preset cards changed element type from `<button type="button">` to `<a href>` — navigation
  targets `/gallery/mod-shield`, `/gallery/ticket-desk`, `/gallery/welcome-wagon`.
- New labelled region `Loading your bots` (with `role="status"` on the inner paragraph) replaces the
  empty state while the bots read is in flight; `No bots yet` renders only once the read settles.

---

# Review: dashboard-home fix wave

**Verdict: PASS** — the wave's two claims hold, verified on the real path with a validated instrument
and a guard-break proof, with the tests genuinely pinning the fixed behavior.

## 1. DOES IT WORK

**Toolchain detected from the real manifests, not assumed.** Root `package.json` declares npm
workspaces `apps/*` + `packages/*`. `apps/web` scripts: `typecheck` = `tsc --noEmit`, `test` =
`vitest run`, `lint` = `eslint .`, `format` = `prettier --check`. Linter is the root flat
`eslint.config.mjs` (ESLint 9). `node_modules` present at both root and `apps/web` — no install needed,
no install run, no manifest touched.

| Check | Exact command | Exit | Result |
|---|---|---|---|
| Dashboard scoped tests | `npx vitest run app/dashboard/page.test.tsx` (in `apps/web`) | 0 | **23 passed / 23**, 1 file |
| Full web suite | `npx vitest run` (in `apps/web`) | 0 | **885 passed / 885**, 62 of 62 files |
| Typecheck | `npm run typecheck --workspace @corvus/web` | 0 | zero errors |
| Lint (touched files) | `npx eslint app/dashboard/page.tsx app/dashboard/page.test.tsx --max-warnings 0` | 0 | zero errors, zero warnings |
| Format (touched files) | `npx prettier --check app/dashboard/page.tsx app/dashboard/page.test.tsx` | 0 | "All matched files use Prettier code style!" |

**Instrument validated before I trusted it.** `eslint` exiting 0 on a file it never opened is
indistinguishable from a clean file, so I re-ran it with `--format json` and confirmed it really
processed both: `files linted: 2`, each `errors: 0 warnings: 0`.

**Artifacts really exist on disk (trust artifacts, not summaries).** All three named reports are
present under `Agent Reports/`: `2026-09-23-1228_dashfix_FIX_dashboard-minors.md` (12:50),
`2026-09-23-1245_dashfix2_FIX_dashboard-tests.md` (12:57), `2026-09-23-1255_inspect-dashboard_REVIEW_dashboard.md`.
The claimed source changes are really on disk — I read both files rather than trusting the reports.

**The fix is genuinely new, not a no-op — proven against HEAD.** `git show HEAD:` on the file shows
the *old* dead control at line 255 (`<button key={name} type="button" className={styles.templateCard}>`)
and **no** `botsLoading` symbol anywhere. Both defects the wave claims to fix were real at HEAD, and
both are gone in the working tree.

**Test-suite drift is resolved.** The `dashfix2` report (12:57) recorded `884 passed / 1 failed`, the
one failure being an out-of-scope terms copy drift. My run at 13:05 is **885/885, 62/62 files** — the
sibling `landfix` wave landed the paired terms-test update in between (terms test mtime 12:59:35,
sibling report 13:01). Re-verified, not assumed.

**No tests are silently disabled.** No `.skip`/`.todo`/`.only`/`xit`/`xdescribe` anywhere in either
touched file; `it(` count is 23, matching the 23 reported passing. I also ran the new test alone with
`-t` and confirmed it executes and passes (22 siblings skipped *by the filter*, which is the filter
working, not a skip marker).

## 2. DOES IT MATCH

### 2a. The three preset links resolve to real slugs — verified against the catalog source of truth
Verified against `apps/gateway/src/db/seed-templates.ts` (the in-code array `seed.ts` inserts into the
`templates` table, which `/api/templates/[slug]` selects from — `apps/web/app/api/templates/[slug]/route.ts:22`),
**not from memory**:

| Card label | `href` | slug in `seed-templates.ts` | catalog `name` |
|---|---|---|---|
| Community Guardian | `/gallery/mod-shield` | line 89 | Mod Shield |
| AI Support Desk | `/gallery/ticket-desk` | line 132 | Ticket Desk |
| Welcome & Role Picker | `/gallery/welcome-wagon` | line 48 | Welcome Wagon |

All three are in the SPEC-locked 8-template set (`seed-templates.test.ts:21-45`). All three slugs are
string literals in `page.tsx:24-28` — none is built from user input, so no malformed slug can be linked.

**The behavior-matching claim was checked, not taken on faith.** I read each seed's `sourceSpec.behaviors`:
`mod-shield` = banned-word filter + timeouts + every action logged; `ticket-desk` = support panel +
private per-user ticket channels + topic routing + transcripts; `welcome-wagon` = greeting + rules link
+ private member DM. Each advertised promise is genuinely delivered by the template it links to.

**Real-path route resolution (live dev server on 127.0.0.1:3000).** `/dashboard` 200;
`/gallery/mod-shield` 200; `/gallery/ticket-desk` 200; `/gallery/welcome-wagon` 200. Rendered SSR HTML
carries exactly one anchor each for `href="/gallery/mod-shield"`, `"/gallery/ticket-desk"`,
`"/gallery/welcome-wagon"`, plus the strip's own `"/gallery"` — and **zero** `templateCard` buttons.

**Honest caveat on what that 200 does and does not prove.** The web tier accepts all three slugs. The
local catalog DB is **unseeded** — I confirmed the *instrument* rather than assuming: `/api/templates`
returns `{"templates":[]}`, i.e. the list endpoint is empty, so this is an empty DB, not a bad slug.
The detail pages therefore render their honest "Template unavailable — try again." path
(`gallery/[slug]/page.tsx:233`) instead of populated content. That is the correct behavior for an
unseeded catalog; populated content against a seeded DB is not proven here (see Known Limitations).

### 2b. Loading shell shows mid-flight; "No bots yet" only on resolved-empty
The guard is `const botsLoading = injectedBots === undefined && liveBots === null;`
(`page.tsx:100`), consumed at `:278` where the render is
`botsLoading ? <Loading shell> : hasBots ? null : <No bots yet>` (`:278-291`). An injected prop is
settled by construction, so the shell can only appear on the live path — props-injecting tests keep
their synchronous empty state.

**Verified on the real running app, with the instrument proven before I read its output.** I installed
a DOM-mutation recorder via a pre-document init script (so it observes from before app boot), then
navigated the real `/dashboard`:
- Rendered sequence: **`LOADING → NO_BOTS_YET`**. Final state `NO_BOTS_YET`. The mid-fetch flash is gone.
- Corroborated by the SSR bytes: `Loading your bots` × 2, `No bots yet` × **0**. The initial server
  render is the shell, so the empty claim cannot precede the read even on first paint.
- **The instrument discriminates** (a probe that matches everywhere proves nothing): on
  `/dashboard/bots` the same probe finds `Loading your bots` × 1, and on `/gallery` it finds
  `No bots yet` × 0 and `Loading your bots` × 0. The strings are page-specific, not global boilerplate.

**The guard-break proof in the `dashfix` report is corroborated by my own live run.** The report
records breaking the guard (`botsLoading = false`) and observing `NO_BOTS_YET` as the first and only
state. My independent live run *with the guard intact* produced `LOADING → NO_BOTS_YET` — the
sequence the report predicted, and the restored file is the one I tested (mtime 12:48:45, unchanged
since). The guard is proven by watching the thing it guards fail, as it should be.

**The resolved-empty path is intact on the real path.** With the box's APIs answering 401 (no session,
verified by `curl`: `/api/bots` and `/api/credits` both `{"error":"unauthorized"}`), `fetchBots`
returns an empty list and the page settles to `No bots yet` rather than hanging on the shell. Empty is
still reachable — the fix gated it, did not remove it.

### 2c. Credits card still honest on bot-less accounts (no fabricated 0)
`creditsValue` is `—` when `!hasBots` (`page.tsx:184-185`), and only otherwise does it show
`liveCredits` or `No data yet`. Confirmed in the live SSR HTML: the Credits card renders `—` —
matching the report's claim exactly, with no fabricated `0` on a bot-less account. The card still
reads; it is not hidden or blank.

## 3. QUALITY

- **No dead clickable controls remain on dashboard home.** Every interactive element on the surface
  now does something: three preset cards → real `/gallery/<slug>` links; "See all templates" →
  `/gallery`; "Create your first bot" → `/dashboard/new`; the Workspace `Upgrade` button is
  `disabled` + `aria-disabled="true"` with `title="Coming soon"` — an honestly disabled control, not a
  dead one. `BuilderProgress` contributes no controls. Nothing clickable is inert.
- **No dead control can silently return.** `page.test.tsx:365` asserts
  `queryAllByRole('button')` has length **0** inside the Templates region, and each card is asserted by
  role `link` + `name` + `href`. The href assertion is the one that would have caught the original
  dead buttons.
- **The tests genuinely pin the behavior — I broke each one and watched it fail.** Three mutation
  probes, each run one at a time against a throwaway copy
  (`app/dashboard/probe-mutation.test.tsx`, copied from the real file so `./page` resolves
  identically, deleted afterwards). The original was never written to — verified by mtime (still
  12:54:09) after all probes finished, and re-run 23/23 green:
  1. **Wrong href** — changed the expectation to `/gallery/MUTATION-PROBE`:
     `AssertionError: expected '/gallery/mod-shield' to be '/gallery/MUTATION-PROBE'`, 1 failed.
     The href assertion bites, and it *names* the drift — precisely the assertion that would have
     caught the original dead buttons.
  2. **Absence assertion** — flipped the mid-flight `queryByRole('region', {name:'No bots yet'})` check
     from `toBeNull()` to `toBeTruthy()`: `AssertionError: expected null to be truthy`, 1 failed.
     This proves the line is **non-vacuous**: the empty region genuinely is *not* in the DOM while the
     read is in flight. (`queryByRole` returning null never throws, so without this probe the original
     line would be self-satisfying and could pass over a regression.)
  3. **Shell assertion** — renamed the expected region to `MUTATION-PROBE`:
     `TestingLibraryElementError: Unable to find role="region" and name "MUTATION-PROBE"`, 1 failed.
     The shell assertion really does find the shell in the render path, not just in a stub.
  Note on what these probes do and do not show: all three test **the test file's** ability to detect
  drift, which is exactly the property at issue (stale assertions pinning removed behavior was the
  original defect). The corresponding source-side proof — the guard itself failing when broken — is
  the `dashfix` report's guard-break run, corroborated by my own live `LOADING → NO_BOTS_YET` sequence
  in §2b.
- **No secrets.** The wave's diff contains no secret-shaped strings, no `.env` read, no credential.
  `git status` on manifests/env: `package-lock.json` and the untracked `apps/testbot/*` files are both
  **mtime 2026-09-20**, i.e. three days old and unrelated to this wave's writes (all 2026-09-23).
- **No manifest/env edits by this wave.** `apps/web/package.json` unmodified; no `.env` touched; no
  install run.
- **No production contact.** No SSH, no Contabo, no GHCR, no live keys. All HTTP contact was to
  `127.0.0.1:3000` (local dev server). No secret value was read, printed, or transmitted.
- **No debug leftovers.** No `console.log` / `debugger` added in the diff.
- **No i18n violation.** The project has no i18n infrastructure (no `next-intl`/`react-intl`/
  `useTranslation`); all user-facing strings are English literals throughout, consistent with the rest
  of the surface. Not a finding.
- **Comments are honest and load-bearing.** The header comment at `page.tsx:14-23` accurately
  describes the mapping and explicitly warns that a made-up slug would 404. The `liveBots` comment
  (`:80-83`) states the guard's reason. Both match the code as written.

## Known Limitations
- **Populated gallery detail content is not proven on this box** — the local catalog DB is unseeded
  (`/api/templates` → `{"templates":[]}`, instrument-checked). Proven: the route resolves 200, the slug
  is a real catalog slug, and the page's honest unavailable path handles the unseeded case without
  crashing. Not proven: that a seeded DB renders the template's behaviors and permissions.
- **No fetch timeout on the bots read (`page.tsx:85-96`) — pre-existing pattern, not a regression
  introduced here.** `fetchBots` is called with only an abort signal on unmount; a connection that
  never settles would hold the loading shell indefinitely. I checked whether this was newly introduced:
  the sibling `bots/page.tsx` (the idiom this fix explicitly mirrors) also has **no** timeout, so the
  mirrored pattern is consistent. It is unchanged behavior in kind — before this wave the page showed a
  *false* "No bots yet" over a hung fetch; now it shows an honest "Loading" over the same hang. Worth a
  follow-up across the dashboard surface, but it is not this wave's defect and not a blocker.
- **Behavioral probes ran against the production module as it ships** (`page.tsx`) on the real path;
  the three mutation probes ran against a throwaway copy `app/dashboard/probe-mutation.test.tsx`,
  which was deleted after the probes. No leftover file: `git status --short -- apps/web/app/dashboard/`
  shows the same 11 modified files and 2 untracked paths as before my session, with no
  `probe-mutation.test.tsx`. The original test file was never modified by me — verified by mtime
  (12:54:09, before my session) after all probes completed, and re-run green at 23/23.
- **The mid-flight test uses a hand-released `deferred<T>()` stub, not a real slow network.** That is
  the standard instrument for this class of state and the repo already uses it
  (`bots/[id]/page.test.tsx:61-67`). It cannot detect a real fetch that resolves faster than the shell
  paints — the live Slow-network half is covered by the `dashfix` report, and my own live run covers
  the sequence on the real path. Together they cover it; this test alone does not.
- **Scope of the label/catalog name mismatch is a product decision** (Open Question 1), deliberately
  left open rather than resolved here.
