# Task Report: reviewer-dashhome-2014

## Status
PASS

The dash-home claim is verified on all points attributable to this task. One deviation from the claimed numbers, fully attributed below: dashboard-scoped suite runs **153/154** on this tree (not 154/154) — the single failure is in `app/dashboard/bots/[id]/page.test.tsx` (attachment-count test), a file with a 1019-line sibling-wave diff that contains zero references to the dashboard home surface and fails identically in isolation. It is a moving-tree artifact, not a dash-home regression.

## Files Touched
- CREATED: Agent Reports/2026-09-23-2041_reviewer_REVIEW_dashhome.md
- MODIFIED: nothing. Read-only review + test runs + SSR byte checks against the already-running dev server on 127.0.0.1:3000. No git restore/stash/checkout/reset, no commit/push, no secrets touched.

## Dependencies Added
- None.

## Assumptions Made
- HEAD `it(`-count (22) plus sibling-wave additions (2) plus this task's addition (1) = 25 is accepted as the provenance split; only the arithmetic (22 → 25, with exactly 3 new `it(` blocks in the diff, one of which is unambiguously the page-wide test) was machine-checked, not the 24-at-session-start intermediate.
- The pre-existing dev server on 127.0.0.1:3000 (PID 10836, serving `C:\Users\xr3less\Desktop\corvus\apps\web`) is a legitimate real-path instrument; my own `next dev` on :3105 was abandoned once the existing server was discovered, and its process killed.
- SSR byte counts are the strongest available form of the loading-shell claim and subsume the hand-released `deferred<T>()` test's timing gap, per the task report's own Known Limitations.

## Open Questions for Orchestrator
- **Full-suite / dashboard-scoped green must be taken on the merged, quiesced tree, not this one.** Evidence: dashboard-scoped run shows 153/154 with the failure in `bots/[id]` (fails in isolation too); that file plus 4 siblings carry 1019 added lines vs HEAD from concurrent waves; `bots/[id]` has zero references to `DashboardPage`/dash-home. A scoped green on this tree is not achievable while sibling waves are writing it (LESSONS §7).
- **OQ2 wording drift (non-blocking):** the task report's OQ2 states the Credits card short-circuits to `—` when `hasBots === false`. The code on disk shows no such gate: `creditsValue` (`page.tsx:188-192`) is independent of `hasBots` (`…` mid-flight → live balance → `0 of 0 credits` fallback), and the `100 of 100 credits` test renders bot-less and passes. Either OQ2 describes pre-wave behavior or a different surface (possibly the rail). Recommend correcting OQ2 at integration rather than changing code — the tested behavior is the honest one.
- **Credits-card bot-less visibility remains founder-deferred and unchanged by this task** — confirmed: no visibility logic for the Credits card appears in either file's diff beyond the three pinned states.

## Public Interface Exposed
No production signature changed. `DashboardPage` props unchanged (`{ bots?: MockBot[]; trialExpired?: boolean }`, `page.tsx:351-363`). Verified in place: `TEMPLATES` (`page.tsx:21-25`) labels byte-match `seed-templates.ts` names; cards are anchors; `botsLoading` guard (`:97`) consumed at `:282`; credits states (`:188-192` + `formatCredits` `:47-51`).

## Known Limitations
- **No browser click-through performed by this reviewer.** Real-path evidence is SSR-byte-level (curl): `/dashboard` first paint and `/gallery/mod-shield` HTTP 200 with the honest `Loading template…` shell. The DOM-level click-through (`templateCard` ×3 as `<A>`, navigation to the detail page) is taken from the task report's evidence, corroborated by the SSR href bytes I independently fetched. No browser automation was run.
- **Mutation probes not re-run** per task instructions (do NOT re-mutate prod); adequacy assessed by code read of the new test, which is sufficient: exact-length button assertion plus exact-set href assertion necessarily fail on any added/removed/placeholder control.
- **ESLint instrument check partial:** `eslint --max-warnings 0` on both touched files exits 0, but my `--format json` per-file count parse produced no output (parse fallback path), so per-file 0/0 counts are inherited from the task report, not independently re-captured.
- **Seeded-DB gallery content unproven on this box** (inherited): local catalog DB unseeded, so detail-page behavior content past the loading shell was not exercised here either.

## Verification table

| # | Claim | Check performed | Result |
|---|---|---|---|
| 1 | Preset cards are `<a href=/gallery/<slug>>` | Read `page.tsx:339-343`; `grep -n "<a \|<button\|onClick\|onSubmit\|onKeyDown"` | PASS — 3 preset anchors with `/gallery/<slug>`, exactly 1 `<button>` (disabled Upgrade `:319`), zero handler attributes page-wide |
| 2 | Slugs/labels byte-match catalog | Compared `page.tsx:21-25` vs `seed-templates.ts` `:48-49` welcome-wagon/Welcome Wagon, `:89-90` mod-shield/Mod Shield, `:132-133` ticket-desk/Ticket Desk | PASS — exact match, all three |
| 3 | Old labels gone | `grep "Community Guardian\|AI Support Desk\|Welcome & Role Picker" page.tsx` | PASS — exit 1, zero hits |
| 4 | Loading shell + guard | Read `:81-97`, `:282-295`; fetched `/dashboard` SSR bytes from 127.0.0.1:3000 | PASS — guard `injectedBots === undefined && liveBots === null`; SSR `Loading your bots` ×2, `No bots yet` ×0 |
| 5 | SSR preset hrefs + credits mid-flight | Same SSR bytes: `/gallery/<slug>` ×1 each, `/gallery` ×2 (strip link), `…` present, `0 of 0` absent pre-hydration | PASS |
| 6 | Gallery detail route resolves | `curl /gallery/mod-shield` → HTTP 200; route source `[slug]/page.tsx:231-241` shows honest unavailable path for unseeded DB | PASS (route resolves, no crash; seeded content out of scope) |
| 7 | Target suite 25/25 | `npx vitest run app/dashboard/page.test.tsx` | PASS — 25 passed / 25 |
| 8 | Test count + no-skip | `grep -c "it("` = 25; skip/only/todo grep = 0 | PASS |
| 9 | Dashboard-scoped 154/154 | `npx vitest run app/dashboard` → 153/154; isolated rerun of `bots/[id]` still 1 failed; file has 0 refs to dash-home, 1019-line sibling diff | DEVIATION (documented, unrelated — see Status) |
| 10 | `page.tsx` pre-session, test +1 | `stat` mtime `2026-09-23 18:00:55` (session opened ~20:14); diff vs HEAD shows exactly 3 new `it(` blocks, one being the page-wide test | PASS — 22 + 2 sibling + 1 task = 25 arithmetic holds |
| 11 | New test is page-wide, mutation-adequate by read | Read `page.test.tsx:402-442`: exact-length button assertion (1, disabled Upgrade w/ title) + exact sorted href set of 5 | PASS — any out-of-Templates dead control breaks the length/set assertions while the Templates-region test stays green; no prod re-mutation performed |
| 12 | `tsc` clean | `npm run typecheck` (`tsc --noEmit`) | PASS — exit 0, zero errors |
| 13 | `eslint` clean (touched files) | `npx eslint app/dashboard/page.tsx app/dashboard/page.test.tsx --max-warnings 0` | PASS — exit 0 (per-file counts inherited, see Limitations) |
| 14 | `prettier` clean (touched files) | `npx prettier --check` on both files | PASS — "All matched files use Prettier code style!" |
| 15 | Credits states intact | Read `:105-143`, `:188-192`; tests `:134-183` pin `…` → `0 of 0` → live `100 of 100` | PASS — strict finite-number parse gate, never a fabricated nonzero |
