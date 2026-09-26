# Task Report: wave1b2b-rail-only

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/components/ui/dashboard-rail.tsx
- MODIFIED: apps/web/components/ui/dashboard-rail.test.tsx

## Dependencies Added

- None. No new runtime dependency; no manifest touched; no install run.

## Assumptions Made

- `apps/web/lib/conversations/client.ts` consumed read-only (`listConversations`, `deleteConversation`, plus `HISTORY_UNAVAILABLE_NOTICE` forwarded by the thread helpers — the rail holds no literal copy of the notice or any Turkish string beyond the five allowed). Wire shape is the client's camelCase `{ id, botId, title, updatedAt }` per the landed client + route GET handler (`Response.json({ conversations })` over `readListItem` rows).
- Thread helpers consumed, never reimplemented: `ensureConversationForBot(null)` for "Yeni sohbet başlat" (account-level — the rail names no bot), `rehydrateThread(id)` to verify an opened row still exists, `deleteConversation` for delete. `persistThreadTurns` is deliberately NOT called — the rail holds no thread rows; rehydrated rows are discarded because thread rendering belongs to the page wiring (Wave 4 owns page.tsx).
- The rail owns no thread surface: open marks `activeConversationId` and verifies existence only; there is no `?conversation=` (or any) URL contract — grep over apps/web confirms no conversation query-param reader exists, so none was invented. Page.tsx integration stays Wave 4's.
- Existing six-link nav list, hrefs, pathname-only active rule, logout, Upgrade, and all frozen copy untouched — the conversations section is a separate `<section aria-label="Sohbetler">` using divs (never list/link roles) so the pinned six-link tests keep passing.
- Client-component convention: file was already `'use client'`; the added list effect follows the AbortController-free `active`-flag + seq-guard idiom used by the dashboard home/bots pages and the Next server/client-components guide in `node_modules/next/dist/docs/` (`05-server-and-client-components.md` — rail needs state/event handlers, so Client Component stays correct). No search-param read added (would suspend the rail out of first HTML).

## Open Questions for Orchestrator

- `apps/web/app/gallery/[slug]/page.test.tsx` — "never fetches a malformed slug — honest unavailable, no leak" now fails with exactly one `fetch` call to `/api/conversations` (the rail's mount list, rendered by the real `DashboardRail` on that page). Pre-existing assertion `expect(fetchStub).not.toHaveBeenCalled()` assumed the rail never fetched. Options: (a) that suite stubs the conversations path / asserts template-URL-scoped no-fetch, or (b) orchestrator accepts the rail fetch as intended and updates the assertion. Rail side is correct per this task's contract (list on mount); leaving that suite red is NOT a rail defect. Gallery list suite (`app/gallery/page.test.tsx`) and both dashboard suites pass unmodified (50/50).
- None otherwise. No scope expansion was needed; no frozen file touched.

## Public Interface Exposed

```ts
export function DashboardRail();
// + internal conversation section (no new exports):
// mount: GET /api/conversations (newest-first) -> rows | honest empty/degraded
// "Yeni sohbet başlat" -> ensureConversationForBot(null) -> active + server-ordered refresh
// "Sohbet aç"         -> rehydrateThread(id) verify -> aria-current="true" on the row's button
// "Sohbeti sil"       -> first click arms (aria-expanded), second click DELETEs; row removed only on { ok: true }
// down-path notice    -> role="status" with HISTORY_UNAVAILABLE_NOTICE, byte-identical via the helpers
```

Fail-closed throughout: list failure → `Eski sohbet yok` + the single allowed notice, never a crash, never fake entries; failed delete keeps the row; failed open keeps the previous selection. No new user-facing strings; allowed set only (`Sohbetler`, `Yeni sohbet başlat`, `Eski sohbet yok`, `Sohbeti sil`, `Sohbet aç`, down-path notice) — asserted by a whole-text sweep test.

## Known Limitations

- Untracked-row titles fall back to the row's `updatedAt` (server data); untitled rows never invent copy.
- In-flight states reuse no new copy: open/delete buttons disable via `busyId`, new-chat via `creating`; delete confirm is the row's own armed button (no modal, no extra string).
- Verified: `npm run typecheck --workspace @corvus/web` exit 0; `npx eslint <both files> --max-warnings 0` exit 0; `npx vitest run components/ui/dashboard-rail.test.tsx` 17/17 green in apps/web (11 pre-existing + 6 new: empty-state copy sweep, list+open, two-step delete, down-list, failed-delete, new-chat POST-shape); neighbors layout + dashboard-home + gallery-list 50/50 green. No `any`, no non-null assertion, no secrets, no git restore commands.
