# Task Report: dash-home-presets-loading

## Status
SUCCESS

All three deliverables are live on disk and verified on the real path. Two of the three (`<a href>` preset cards, loading shell) were **already landed in the working tree by sibling waves** before this task opened; I verified them against the catalog source of truth and the running app rather than rewriting them, and made **one additive change** — closing the one genuine gap I found: the "no dead controls" guarantee was pinned only *inside* the Templates region, so a dead control anywhere else on the page would have shipped unnoticed. That class is now pinned page-wide and proven by three break-it probes.

## Files Touched
- MODIFIED: apps/web/app/dashboard/page.test.tsx — one new test added (`leaves no dead clickable control anywhere on home, not just in Templates`); nothing else in the file changed. The labels-balance Prettier reflow (line 151) is byte-intact.
- CREATED: Agent Reports/2026-09-23-2014_dash-home_MODIFY_presets-loading.md
- READ (not modified): apps/web/app/dashboard/page.tsx, apps/gateway/src/db/seed-templates.ts, apps/web/app/dashboard/bots/page.tsx, apps/web/app/dashboard/page.module.css, apps/web/components/ui/builder-progress.tsx, apps/web/app/dashboard/layout.tsx, apps/web/components/ui/dashboard-rail.tsx

**`page.tsx` was NOT modified by me — proved by mtime, not by claim.** Its mtime is `2026-09-23 18:00:55`, before this session began (my first read was ~20:14). Both required fixes and every preserved hunk are sibling-wave content that I verified in place, exactly as the task's "preserve byte-for-byte" scope required. My probe files were throwaway copies (`probe-deadbtn.tsx` / `probe-deadbtn.test.tsx`), deleted after use; `git status` shows no leftover.

## Dependencies Added
- None. No manifest or lockfile edit, no install run. `node_modules` present at root and `apps/web` (checked, not installed).

## OSS-FIRST RESEARCH (the 15-minute scan, named and cited)

Scanned OSS dashboard loading/empty-state patterns before touching code. Three named sources, and what I actually took from each:

1. **shadcn/ui — `Skeleton` + `Empty` primitives** (<https://ui.shadcn.com/docs/components/base/skeleton>, <https://ui.shadcn.com/docs/components/base/empty>). The dominant OSS idiom: a skeleton *shapes* the incoming content (three cards → three card-shaped placeholders), and an empty state is a composed pair of *claim + next action* (`EmptyTitle` "No data" + `EmptyContent` with a real button), never a bare "Nothing here". **Taken:** our shell occupies the same `.panel` box the resolved content occupies, and the empty state pairs its claim with the `/dashboard/new` link. **Deliberately not taken:** their static grey-bar skeletons. We cannot know the row count before the read, so bars would be a guess — a guess that contradicts what arrives is exactly the lie to avoid.
2. **NN/g, "Skeleton Screens 101"** (<https://www.nngroup.com/articles/skeleton-screens/>). The finding that matters here: a **frame-only** skeleton (header/footer, no content shape) is no better than a spinner and makes users assume the page is broken — but skeleton screens are for *full-page* loads, and a spinner is the better choice "on a single module … on a dashboard". **Taken:** this is a *section-level* wait inside an otherwise-rendered dashboard, so an honest labelled status line is the right pattern, not a full-page wireframe — and the section must never claim its content is absent.
3. **"Loading Skeletons That Don't Lie: 5 Patterns for Honest Perceived Performance"** (<https://dev.to/raxxostudios/loading-skeletons-that-dont-lie-5-patterns-for-honest-perceived-performance-283p>). The two rules I applied directly: **"never show a placeholder that contradicts what arrives"**, and the sub-300ms flash rule — *"if your data comes back in 180ms, a skeleton flashes for a tenth of a second and the flash itself reads as a glitch."* Also: a skeleton with no exit is the worst case; the placeholder must resolve into content, empty, or error. **Taken:** the shell's `aria-label` names what is loading (`Loading your bots`) rather than a generic "Loading", because the label is the honest claim about *which* read is pending.

Cross-checked against **Anvil's `useLoadingState`** (<https://github.com/esanmohammad/Anvil/blob/main/packages/dashboard/src/components/common/Skeleton.tsx>): its comment documents the exact bug we fixed — *"a slow yaml or provider env discovery shouldn't strand the user with an empty panel … that's the empty-panel bug we hit before"* — and it deliberately keeps the spinner up rather than flipping to empty. Same principle: only a *settled* read may claim emptiness.

Also read `apps/web/AGENTS.md` (the Next.js caution). The bundled `node_modules/next/dist/docs/` directory it points at **does not exist in this install** (verified: `ls` → "No such file or directory"), so there was no version-specific guide to consult. Next is 16.3.4. My change is test-only and uses no Next API beyond the existing `next/navigation` mock already in the file, so no version-specific surface was touched. Flagged as a Known Limitation.

## Verification (all commands from `C:\Users\xr3less\Desktop\corvus\apps\web`)

**Instrument validated before the numbers were trusted.** `eslint` exiting 0 on files it never opened is indistinguishable from clean files, so every lint run was re-run with `--format json` and the linted-file count and per-file counts confirmed.

| Check | Exact command | Result |
|---|---|---|
| Dashboard suite | `npx vitest run app/dashboard/page.test.tsx` | **25 passed / 25** (was 24; +1 = my new test) |
| All dashboard-scoped tests | `npx vitest run app/dashboard` | **154 passed / 154**, 6 of 6 files |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **0 errors**, exit 0 |
| Lint (touched) | `npx eslint app/dashboard/page.tsx app/dashboard/page.test.tsx --max-warnings 0` | exit 0; instrument-checked: **2 files linted, each 0 errors / 0 warnings** |
| Format (touched) | `npx prettier --check` on same two files | "All matched files use Prettier code style!" |
| No skip markers | `grep -cE "\.skip\|\.only\|\.todo\|xit\(\|xdescribe\("` on the test file | **0** — none |
| Preset hrefs grep-proof | `grep -n "<a \|onClick"` on `page.tsx` | 3 anchors, all `/gallery/<slug>`; exactly **1** `<button>` (the honestly-disabled Upgrade); **zero** `onClick`/`onSubmit`/`onKeyDown` anywhere on the page |

**Toolchain detected from real manifests, not assumed.** Root `package.json` = npm workspaces `apps/*` + `packages/*`. `apps/web` scripts: `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `lint` = `eslint .`. Linter = root flat `eslint.config.mjs` (ESLint 9).

**One transient tool hiccup, resolved and reported rather than buried.** The first `npm run typecheck` returned a bare npm `command failed` wrapper with **no tsc diagnostics**. Running `npx tsc --noEmit` directly gave exit 0, and a retry of `npm run typecheck` also gave exit 0 with zero output. Recorded so the reviewer does not have to rediscover it.

### Real-path proof (running app, `127.0.0.1:3000`)

Not "the tests pass" — the flow was exercised:

- **SSR bytes (first paint, before any client JS):** `'Loading your bots'` × **2**, `'No bots yet'` × **0**. This is the strongest available form of the acceptance criterion: the false-empty claim **cannot** precede the read even on the very first server render.
- **Rendered DOM after hydration:** exactly **3** `templateCard` elements, all `<A>` tags, hrefs `/gallery/mod-shield`, `/gallery/ticket-desk`, `/gallery/welcome-wagon`. Zero `templateCard` buttons.
- **Click-through:** clicking the Mod Shield card navigated to `http://127.0.0.1:3000/gallery/mod-shield` and rendered the page. It shows the honest `Template unavailable — try again.` line — correct for an **unseeded local catalog DB**, not a 404 and not a crash. (Same caveat the prior PASS review recorded; the slug's validity rests on the seed source, verified below.)
- **Catalog slugs verified on disk, not from memory:** `apps/gateway/src/db/seed-templates.ts` — `slug: 'welcome-wagon'` / `name: 'Welcome Wagon'` (:48-49), `slug: 'mod-shield'` / `name: 'Mod Shield'` (:89-90), `slug: 'ticket-desk'` / `name: 'Ticket Desk'` (:132-133). The dashboard `TEMPLATES` labels byte-match these names; `grep` for the three superseded labels (`Community Guardian|AI Support Desk|Welcome & Role Picker`) in `page.tsx` returns **0**.
- **Console:** 4 errors, all expected and benign — `favicon.ico` 404 plus three 401s (`/api/bots`, `/api/credits`, `/api/session/trial`) because this browser carries no session. The 401s are the honest logged-out path settling to `No bots yet`; that is the guard working, not failing.

### Guard-break proof — the new test is not decorative

Three mutation probes, each run one at a time against a **throwaway copy** (`probe-deadbtn.test.tsx`, copied from the real file so `./page` resolves identically), deleted afterwards. The original test file was never written to by a probe.

1. **Dead button injected outside Templates** (into the Pre-flight region): my new test failed — `expected [ <button …>, …(1) ] to have a length of 1 but got 2`.
2. **The decisive probe:** in that *same* mutated tree, **the pre-existing region-scoped Templates test still PASSED** — 1 failed / 24 passed, the single failure being mine. This is the concrete proof that the page-wide assertion adds real coverage rather than restating the region check: a dead control in any other region was previously undetectable.
3. **Placeholder `href`** — replaced a preset's dynamic href with `"#"`: **2** tests failed, each naming the drift — `expected '#' to be '/gallery/mod-shield'` (region test) and `expected [ '#', '#', '#', …(2) ] to deeply equal [ '/dashboard/new', '/gallery', …(3) ]` (my set assertion). The enumerated-hrefs half bites, and it catches a *removed* destination as well as a changed one.

## Assumptions Made
- **Catalog is the name truth.** Verified against `seed-templates.ts` source on disk, not memory, and not from the sibling reports' claims.
- **The "no dead controls" criterion is page-wide, not region-wide.** The acceptance criterion says "no dead `<button>` without onClick/href (grep-proven)" without scoping it to Templates; I read that as the whole surface and pinned it that way. A control's deadness is a property of the control, not of the region it happens to sit in.
- **Settling the bots read before enumerating anchors is correct, not a workaround.** The in-flight shell owns no link and the empty state owns `/dashboard/new`, so the anchor set is only determinate once the read resolves; the test awaits `findByRole('region', { name: 'No bots yet' })` first. Asserting a set that legitimately varies by state would be the flaky choice.
- **The dashboard rail is out of scope.** The rail (`components/ui/dashboard-rail.tsx`, rendered by `layout.tsx`) contributes a second `Upgrade · Coming soon` button and a `Log out` button to the live page. My test renders `DashboardPage` alone and therefore asserts exactly **1** button; that is the correct boundary, not a miscount. Verified by locating the second button's source rather than by assuming.
- **No timeout on the bots read is pre-existing and unchanged** — recorded by the prior PASS review, out of scope here.

## Open Questions for Orchestrator
**None blocking.** Two observations for integration, both pre-existing and deliberately not touched:

1. **Full web suite is currently red and flaky — the cause is sibling waves writing the tree mid-run, not this task.** Across five consecutive full-suite runs I saw **886 / 891 / 894 / 896 / 907** total tests and a *different* failing file each time (`app/api/chat/route.test.ts`, then `app/api/spec/rollback/rollback.test.ts`, then `app/page.test.tsx`) — plus one vitest worker crash (`exit code 3221226505`). Direct evidence of the cause: `apps/web/app/page.tsx` mtime advanced to **20:30:24 while my suite run was in progress** (I checked at 20:30:36), and the on-disk test-file count is **63** while the suite reported **62**. Each of the three failing files is `M` vs HEAD and none references the dashboard (`grep -c dashboard` → 0 in the chat test; the rollback test's single hit is a comment). **`app/api/chat/route.test.ts` passes 35/35 in isolation, twice.** So: a full-suite green on this tree is not achievable while N agents are writing it — it must be run on the merged, quiesced tree at the wave boundary (LESSONS §7: N agents reporting green describes N trees, not the one that ships). My scoped evidence is solid: **154/154 dashboard-scoped, 25/25 on the target file.**
2. **The credits-card bot-less visibility question (OQ2 from the inspection) remains FOUNDER-DEFERRED and I did not change it**, per the task's explicit instruction. Current behavior: `hasBots === false` short-circuits the Credits card to `—` even when `/api/credits` answers. Unchanged, still honest (never a fabricated 0).

## Public Interface Exposed
No exported signature changed. `DashboardPage` still takes `{ bots?: MockBot[]; trialExpired?: boolean }` (`page.tsx:351-363`). The only change is one added test in `page.test.tsx`; no production module was modified by this task.

Confirmed in place (verified, not newly written):
- Template cards are `<a href="/gallery/<slug>">` with catalog names `Mod Shield` / `Ticket Desk` / `Welcome Wagon`; zero dead buttons in the strip.
- Loading shell: `botsLoading = injectedBots === undefined && liveBots === null` (`:97`), consumed at `:282` as `botsLoading ? <Loading your bots> : hasBots ? null : <No bots yet>`. An injected prop is settled by construction, so props-injecting tests keep their synchronous empty state.
- Credits card states unchanged: mid-flight `…`; resolved-empty/unread `0 of 0 credits`; real numbers when `/api/credits` answers; strict finite-number parse gate (any other shape falls to the 0 fallback — never a fabricated nonzero).

## Known Limitations
- **Populated gallery detail content is not proven on this box.** The local catalog DB is unseeded, so `/gallery/<slug>` renders its honest unavailable path. Proven: the route resolves, the slug is a real catalog slug, and the page handles the unseeded case without crashing. Not proven: that a seeded DB renders the template's behaviors.
- **The mid-flight test uses a hand-released `deferred<T>()` stub, not a real slow network.** It cannot detect a fetch resolving faster than the shell paints. The SSR byte evidence (`Loading` ×2 / `No bots yet` ×0 on first paint) is the independent half that covers exactly that gap.
- **`node_modules/next/dist/docs/` does not exist in this install**, so the `AGENTS.md` caution could not be honoured against a version-specific guide. Next 16.3.4; the change is test-only and touches no Next API beyond the file's existing mock.
- **A hard-reload timing sequence was not re-recorded** in this task; the SSR-bytes check and the DOM inspection cover the same claim at least as strongly, and the prior PASS review's `LOADING → NO_BOTS_YET` recorder run remains valid since the guard code is unchanged (mtime 18:00:55, pre-session).
- **No production, box, GHCR, or live-key contact.** No secret value read, printed, or transmitted. No `git stash`/`checkout`/`restore`/`reset`, no commit, no manifest/env edit, no install. All HTTP contact was to `127.0.0.1:3000`.
