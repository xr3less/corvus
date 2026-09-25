# Task Report: boption-shellpin

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/layout.module.css
- MODIFIED: apps/web/components/ui/dashboard-rail.module.css

## Dependencies Added
- None.

## Assumptions Made
- `100vh` line kept above `100dvh` as the intended fallback order (older browsers ignore the unknown `dvh` unit and keep `100vh`).
- No Next.js breaking-change risk: this task is pure CSS Modules (no TSX, no routing/API change). Checked the repo's Next.js guide per `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/index.md`, `01-app/01-getting-started/11-css.md` (CSS Modules still a supported styling path, no deprecation notice affecting `.module.css` usage), and `01-app/02-guides/css-in-js.md` (deprecation warnings there apply only to CSS-in-JS libraries in Server Components, not to CSS Modules — not applicable here).
- Read-only contract check performed on `apps/web/app/dashboard/new/page.module.css` (NOT edited, T3 owns it): `.newScroll` is `flex:1; min-height:0; overflow-y:auto` (the only scroller) and `.newAiBar` is `flex:none` (+ `position:relative; z-index:1`, unchanged). Contract C6 holds from this side.

## Open Questions for Orchestrator
- None.

## Public Interface Exposed
- None (CSS-only change; no JS/TS exports, no API, no props).

## Known Limitations
- No JS test exists for this task (per SPEC). Pin behavior must be confirmed visually by a human/browser (click-path below).
- On viewports <= 900px the shell stacks to a column while the height cap still applies; content regions may feel tighter on short mobile screens — expected per SPEC, reviewer should confirm it is acceptable.

## Diff Summary
- `layout.module.css` `.shell`: `min-height: 100vh` replaced with `height: 100vh; height: 100dvh; overflow: hidden`. No other rule in the file changed; the `@media (max-width: 900px)` column-stack block is intact.
- `dashboard-rail.module.css` `.rail`: added only `min-height: 0`. No position rule added.
- Verified: no `sticky`, `fixed`, `position`, or `min-height: 100vh` string remains in either touched file (case-insensitive grep, zero matches). No file outside scope touched (`git status --porcelain` shows only these two paths modified).

## Verification
- `npm run typecheck` (repo root, fans out to all workspaces incl. `@corvus/web` `tsc --noEmit`): green, exit 0.
- `npm run lint` from `apps/web` (`eslint .`): green, exit 0. (Note: passing the two CSS filenames directly to eslint fails with "no files matching" because the flat config only lints JS/TS — ran the project's real `lint` script instead.)
- `npx prettier --check app/dashboard/layout.module.css components/ui/dashboard-rail.module.css` from `apps/web`: "All matched files use Prettier code style", exit 0.

## Manual Click-Path for Reviewer (visual pin confirmation)
- Page URL: `/dashboard/new` at desktop width (> 900px, e.g. 1440x900).
- Scroll action: send a long thread (or paste enough messages) so the thread overflows the viewport; scroll the thread region with the mouse wheel / trackpad while watching the window scrollbar.
- Expected result:
  - Pinned composer: the bottom composer bar (`.newAiBar` — message input + send) never moves; only the thread area above it (`.newScroll`) scrolls. The browser window/page itself must show NO outer scrollbar.
  - Pinned rail: the left rail (nav + credits foot at the bottom) stays fixed in place during thread scrolling; the credits foot remains visible without scrolling the page.
  - Small-screen check (optional): resize to <= 900px width; shell stacks to a column (rail on top) and the height cap still applies — confirm nothing overlaps and the composer stays reachable.
