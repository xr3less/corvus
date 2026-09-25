# Task Report: expansion-e3b-gallery-detail

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/gallery/[slug]/page.tsx
- CREATED: apps/web/app/gallery/[slug]/page.test.tsx
- MODIFIED: apps/web/app/dashboard/new/page.tsx

## Dependencies Added
None. No new dependency needed; work reuses the existing GET /api/templates/[slug], POST fork route, DashboardRail, gallery CSS module, and forkErrorMessage helper.

## Assumptions Made
- `source_spec` is opaque to the web tier (SPEC_VERSION 1): the detail page previews only `{ title, detail }` behavior entries and the `server_pack` string, falling back to honest "not listed" lines for anything else. Verified against `apps/gateway/src/db/seed-templates.ts` (TemplateBehavior shape) and the template read routes.
- Dynamic-route + searchParams idioms were taken from the bundled Next.js docs on disk (`node_modules/next/dist/docs/.../dynamic-routes.md`, `use-search-params.md`, `use-params.md`) against installed Next.js 16.3.4 — no web research needed (per AGENTS.md, repo-bundled docs are the source of truth). Client-component slug read uses `useParams`; both pages wrap the `useSearchParams` consumer in `<Suspense>` per the documented prerendering behavior.
- `useSearchParams()` is nullable without a router context (verified in `navigation.js`: returns `null` when SearchParamsContext is absent). The new-bot page guards `params === null` so the legacy `page.test.tsx` suite (no next/navigation mock) still renders with an empty composer.
- `gallery/page.tsx` copy changes are a sibling agent's scope — not touched, not read beyond what the SPEC cited.
- No live-Discord or live-Creem verification: staging-only, local suites.

## Open Questions for Orchestrator
- None. Scope stayed inside the three listed files; no cross-file change needed.

## Public Interface Exposed
- Route `GET /gallery/[slug]` (client page `TemplateDetailPage`): loading shell → `GET /api/templates/<slug>` → behavior preview list, capabilities tags, perms why-lines (`perm — why`), fork count `N forks`, `Start in chat` link (`/dashboard/new?template=<slug>`), fork button → `POST /api/templates/<slug>/fork` → Forked + `Open your bot` + `Add to Discord (shared test app)` + `Customize with AI` (all `/dashboard/bots/<botId>` handoff per fork/route.ts:62-66). Honest `Template unavailable — try again.` on 404/malformed/fetch-fail; malformed slugs never fetch.
- `GET /dashboard/new?template=<slug>` (modified `NewBotPage`, now Suspense-wrapped `NewBotPageInner`): on mount reads the param, validates `^[a-z0-9-]{1,64}$`, fetches the existing detail endpoint once, and statically fills the composer with `Build a bot like <Name>: <capabilities…>` (empty composer only — never overwrites user text; never sends; verdict/min-trial paths untouched).
- Colocated suite `apps/web/app/gallery/[slug]/page.test.tsx`: 11 tests (loading shell, preview-before-fork with no fork POST, capabilities + why-lines, Start-in-chat link, 404, malformed-slug no-fetch, opaque source_spec fallback, fork handoff trio, 401 logged-out, 500 text, in-flight disable).

## Known Limitations
- Detail page reuses the gallery list CSS module (`../page.module.css`) — no new stylesheet; visual match to a `.design-src` file was not in scope (none exists for this route).
- The `Customize with AI` link points at `/dashboard/bots/<botId>` (the overview/composer), which is what the fork handoff documents; the spec-patch handoff body itself (`{ botId, baseVersion, ... }`) is posted from that page, unchanged by this task.
- Template-in-chat seeding has no dedicated test file of its own (would require a next/navigation mock the legacy `new/page.test.tsx` lacks, plus mocking the chat SSE hook); it is covered by the `Start in chat` href assertion plus manual-equivalent fetch logic identical to the detail page's. Recommend a follow-up test-only task if the reviewer wants it pinned.
- Break-the-guard proof: the malformed-slug test (`BAD SLUG!!` → unavailable, zero fetch calls) and the opaque-`source_spec` test serve as the guard-break cases for this wave; run, not just asserted, in the suite above.
