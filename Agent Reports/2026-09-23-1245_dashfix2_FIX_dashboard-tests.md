# Task Report: dashfix2-test-assertions

## Status
SUCCESS

All three stale assertions are updated, the new href assertion is proven to bite, and the file is
frozen at 23/23 green across 4 consecutive runs. The full web suite is **884 passed / 1 failed** —
the 3 original failures are gone, and the 1 remaining failure is a **pre-existing, out-of-scope
regression in `app/terms/page.test.tsx`** proven independent of this task (evidence below; this is
the one criterion I could not satisfy as literally written, so it is documented rather than papered
over).

## Files Touched
- CREATED: Agent Reports/2026-09-23-1245_dashfix2_FIX_dashboard-tests.md
- MODIFIED: apps/web/app/dashboard/page.test.tsx

No other file touched. **`apps/web/app/dashboard/page.tsx` was NOT modified** (test-only task —
verified below). The source fix is still frozen.

## Dependencies Added
- None. No new dependency, no manifest or lockfile edit, no install run.

## Assumptions Made
- **The mid-flight assertion was cheap, so I did not invoke the Known-Limitations escape hatch.** The
  task allowed skipping item 3 if the existing mocks made it awkward. They did not: the file's own
  default `fetch` stub (`vi.fn(() => Promise.reject(new Error(...)))`) is *already* a pending
  promise, and a pending-because-rejected promise is still pending. So the in-flight state is
  observable with no contortion. I added a hand-released `deferred<T>()` fetch (copied verbatim from
  the repo's existing helper at `apps/web/app/dashboard/bots/[id]/page.test.tsx:61-67`) instead, only
  because it additionally lets the test assert the **transition** — the shell must *yield* to the
  empty state, not hang there. A rejected-but-unsettled stub would have proven the loading half but
  not the transition, and a loading screen that never resolves would pass that weaker version.
- **The strip now has 4 links, not 3.** The preset cards became links, and the strip already owned a
  "See all templates" link. I asserted `toHaveLength(presets.length + 1)` and said why in the comment,
  rather than a bare `4` — a magic number there would silently absorb a fourth preset card being
  added or a preset going missing. The per-preset `getByRole('link', { name })` + href assertions are
  what actually pin the three cards; the length check is the set-size guard.
- **I did not rename the labels** to match the catalog (the known M-1 mismatch). The dashfix report
  records the labels as deliberately unchanged and pinned by this file; renaming them here would be a
  product/copy decision outside this task, so the test still pins the shipped labels.
- **The href assertion checks `getAttribute('href')`**, matching the file's existing style for the
  sibling "See all templates" and "Create your first bot" links, rather than `toHaveAttribute` (the
  file does not use jest-dom matchers anywhere).

## Open Questions for Orchestrator

**1. A pre-existing test regression is now the only thing keeping the web suite red.**
Not caused by this task, not in my scope, but it blocks a clean suite and someone must own it.

- **Failing test:** `app/terms/page.test.tsx:59` — `expect(text).toContain('3 days of full Pro access')`
- **Cause:** `apps/web/app/terms/page.tsx:89`, which is modified but **uncommitted** by another agent
  in this wave, changed the rendered copy to `3 days of Pro features, limited to one bot and 100 AI
  credits, no card required.` The test file itself is **unmodified** (`git status --short --
  apps/web/app/terms/page.test.tsx` is empty, i.e. it sits at HEAD).
- **Proof this task did not cause it (three independent lines of evidence):**
  1. **Isolated run.** `npx vitest run app/terms/page.test.tsx` — my dashboard file is never loaded —
     reproduces the identical single failure, 1 failed / 3 passed.
  2. **No import path.** `page.test.tsx` here imports only `./page` plus testing-library/vitest;
     nothing from `app/terms`. A source-level link is not possible.
  3. **Baseline corroboration.** Before I made any edit, `page.tsx` already carried an uncommitted
     mtime of `2026-09-23 12:48:45` — *earlier* than my first save at `12:54:09`. Against a HEAD
     baseline the terms suite was green; it is red against the wave's working tree. That is a drift
     introduced by the wave, not a pre-existing-before-the-wave failure — I state it precisely rather
     than as "pre-existing" alone.
- **Note.** Effectively a UI copy change landed without its paired test update — the same class of
  defect as this task. The fix is a one-line assertion (or the copy reverted); it is not mine to make,
  as `app/terms/*` is outside my declared file scope.
- Recommendation: one small test-only follow-up scoped to `app/terms/page.test.tsx`, exactly parallel
  to this one.

**2. The dashfix report's M-1 label/catalog mismatch is now pinned on both sides.**
`page.test.tsx` pins the labels (`Community Guardian` → `/gallery/mod-shield`) and the seeded catalog
renders `Mod Shield`. The dashboard strip therefore links a card whose name the destination page will
contradict. Unchanged from the dashfix report's Known Limitations — flagging only that this test now
locks the mismatch in place, so a future rename needs this file updated in the same change.

## Public Interface Exposed
- No production interface touched (test file only). `DashboardPage` props (`bots?`, `trialExpired?`)
  are unchanged and untouched.
- One local test helper added, file-scoped, not exported: `deferred<T>()` at
  `apps/web/app/dashboard/page.test.tsx:65-73`, mirroring the helper of the same name in
  `apps/web/app/dashboard/bots/[id]/page.test.tsx:61-67`.
- Assertions now pinned by this file (the contract a future change must keep):
  - Template strip → 3 preset links + 1 "See all templates" link, with hrefs
    `/gallery/mod-shield`, `/gallery/ticket-desk`, `/gallery/welcome-wagon`, `/gallery`, and
    **zero buttons** inside the `Templates` region.
  - Empty state → `No bots yet` region is reachable only after the bots read settles.
  - In flight → `Loading your bots` region present, `No bots yet` absent.

## Verification Performed
All commands run in `C:\Users\xr3less\Desktop\corvus`. Toolchain detected from the real
`package.json` files, not assumed: web workspace scripts are `typecheck` = `tsc --noEmit`,
`test` = `vitest run`; linter is the root flat `eslint.config.mjs` (ESLint 9).

- **Baseline captured first** (`npx vitest run app/dashboard/page.test.tsx`): exactly the 3 named
  failures — `:172` empty state, `:199` expired banner, `:304` template strip. 19 passed / 3 failed.
  The instrument was validated before I acted on it: the failure output shows the rendered cards are
  `<a href="/gallery/mod-shield">` etc., i.e. the assertion was indeed pinning the removed behavior.
- **Touched file:** `npx vitest run app/dashboard/page.test.tsx` → **23 passed / 23** (22 prior + 1
  new). Repeated **4×** back to back: 23/23 every time. No flake.
- **Full web suite:** `npx vitest run` → **884 passed / 1 failed, 61 of 62 files pass** (885 total =
  884 before + 1 new test). All 3 original failures resolved; the 1 remaining is the terms drift above.
- **Typecheck:** `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) → exit 0, zero errors.
- **Lint:** `npx eslint app/dashboard/page.test.tsx --max-warnings 0` → exit 0, zero warnings (root
  config, unmodified).
- **Format:** `npx prettier --check app/dashboard/page.test.tsx` → "All matched files use Prettier
  code style!".
- **PROD SOURCE UNCHANGED — verified, stated as required.** `apps/web/app/dashboard/page.tsx` mtime is
  `2026-09-23 12:48:45`, i.e. **before** my first edit at `12:54:09`; my only write in this task was
  `page.test.tsx`. `git diff --cached --stat -- apps/web/app/dashboard/page.tsx` is empty (no staged
  change). The 93-insertion diff this file carries against HEAD belongs to the **frozen dashfix change
  from the prior task**, not to me. Stated plainly: this task modified exactly one file, and it was the
  test file.
- **Mutation probes — the assertions were broken on purpose and watched to fail** (the source is
  frozen, so I mutated my own expectations, confirmed the failure, then restored):
  1. Changed the expected href to `/gallery/MUTATION-PROBE` → test failed with
     `expected '/gallery/mod-shield' to be '/gallery/MUTATION-PROBE'` — it names the drift. This is
     precisely the assertion that would have caught the three dead buttons, and it now cannot pass
     over a wrong slug. Restored → green.
  2. Flipped the mid-flight absence check to `toBeTruthy()` → failed, proving the absence assertion is
     **non-vacuous**: `No bots yet` genuinely is not in the DOM while the read is in flight.
     (`queryByRole` returning null never throws, so without this probe the line would have been
     self-satisfying.) Restored → green.
- **No secrets; no manifest/env edits; no installs; no git restore/commit; no production contact.**
  No git command that restores from HEAD was run (no `stash`/`checkout --`/`restore`/`reset`), and no
  commit was made. Read-only `git diff`/`git status`/`ls` were used for evidence only. No `.env`,
  `package.json`, or lockfile touched. No secret value was read, printed, or transmitted. No
  production box, Contabo, GHCR, or live-key contact of any kind.

## Known Limitations
- **The full suite is not 100% green.** 884/885. The single failure is the out-of-scope terms drift,
  proven independent by three separate lines of evidence (Open Question 1). I did not fix it: it is
  outside my declared file scope, and touching it would have been a silent scope expansion.
- The mid-flight test asserts against a hand-controlled stub, not a real slow network. That is the
  standard instrument for this class of state and the repo already uses it elsewhere, but it does mean
  this test cannot detect a real-world fetch that resolves so fast the loading shell never paints. The
  dashfix report covered that half on the real path (Slow-3G throttling + DOM mutation recorder,
  `LOADING → NO_BOTS_YET`, and a guard-break run), so the two together cover it; this test alone does
  not.
- The two converted empty-state assertions now await the settled state and will therefore **not**
  catch a regression that reintroduces a mid-flight empty flash — that is the new test's job, and the
  three are only jointly meaningful. Passing any one of them in isolation should not be read as
  coverage of the guard.
- The `queryAllByRole('button')` length-0 line in the strip test encodes today's design (cards are
  links). If a future preset legitimately needs an in-strip button, that line must be revisited rather
  than deleted — it exists to stop a dead control from shipping again.
- I did not verify anything on the real path (no dev server, no browser): this task is test-only and
  the behavior under test was already live-verified by the dashfix task, which is the evidence of
  record for the app actually working. Consistent with the task's boundaries, I did not repeat it.
