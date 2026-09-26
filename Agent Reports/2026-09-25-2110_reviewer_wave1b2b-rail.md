# Review: reviewer-wave1b2b-rail

## Verdict

PASS

The rail task is per-contract on all four evidence sections. One downstream suite
(`apps/web/app/gallery/[slug]/page.test.tsx`, "never fetches a malformed slug") now fails
because the real rail correctly fetches on mount — adjudicated below as real-but-out-of-scope,
NOT a rail defect, NOT a gate failure for this task. Fix is routed to the owning wave; this
review edits nothing (read-only reviewer).

## 1. Works (exact commands, exact exits)

- `npm run typecheck --workspace @corvus/web` (repo root): exit 0, clean.
- `npx eslint apps/web/components/ui/dashboard-rail.tsx apps/web/components/ui/dashboard-rail.test.tsx --max-warnings 0` (repo root): exit 0, zero warnings.
- `npx vitest run components/ui/dashboard-rail.test.tsx` inside `apps/web`: **17/17 passed**
  (11 pre-existing + 6 new: empty-state copy sweep, list+open, two-step delete, down-list,
  failed-delete, new-chat POST-shape).
- Files on disk (OS clock 2026-09-25-2110):
  `apps/web/components/ui/dashboard-rail.tsx` (10171 bytes),
  `apps/web/components/ui/dashboard-rail.test.tsx` (19373 bytes).
- `git status --short` for the two rail paths shows exactly `M` on those two files and nothing
  else — write scope is disjoint and clean.
- Toolchain note (reproducible): invoking vitest from the **repo root** fails to resolve the
  `@/` alias (`Cannot find package '@/lib/conversations/client'`); the SPEC §5 toolchain
  (workspace-scoped vitest inside `apps/web`) is the correct invocation and is green. Not a
  code defect — recorded so nobody chases it.

## 2. Contracts (all hold, verified by reading the code, not the report)

- **Lists newest-first on mount:** `useEffect(..., [])` calls `listConversations()` (GET
  `/api/conversations`) once; rows render in server order and the route orders
  `ORDER BY updated_at DESC` (`apps/web/app/api/conversations/route.ts:56`). No local
  re-sort anywhere in the rail — newest-first is the server's, never a local guess. New-chat
  also re-fetches after POST so server order wins there too.
- **Open on click via rehydrateThread:** `handleOpen` awaits `rehydrateThread(id)`; on
  `{ok:true}` sets `activeConversationId` (row button gets `aria-current="true"`), on failure
  shows the honest notice and keeps the previous selection. Rehydrated rows are discarded —
  no thread surface, no URL contract invented (Wave 4 owns `page.tsx`).
- **Two-step delete:** first click arms `confirmDeleteId` (`aria-expanded="true"`, no fetch —
  asserted in-test); second click DELETEs; the row is filtered out of local state ONLY inside
  the `removed.ok` branch. Failed delete keeps the row.
- **Create via ensureConversationForBot(null):** `handleNewChat` calls
  `ensureConversationForBot(null)` → `chatBotId(null)` → `null` → POST `/api/conversations`
  `{botId: null}` (account-level, rail names no bot — POST body shape asserted byte-exact in
  the new-chat test). Marks active, refreshes list.
- **Fail-closed:** list failure → `setConversations([])` + `setListNotice(result.notice)` →
  renders `Eski sohbet yok` plus one `role="status"` notice, never a crash, never fake rows.
  In-flight renders no claim (`listLoaded` gate). Failed open/delete keep prior state.
- **Copy freeze:** the rail file holds NO literal copy of the down-path notice (it flows in via
  `result.notice` from the helpers — grep confirms zero literal occurrences in
  `dashboard-rail.tsx`); the five Turkish strings appear only in their allowed slots. The
  whole-text sweep test strips the five allowed strings and asserts empty remainder. No frozen
  string altered: six-link nav, hrefs, pathname-only active rule, logout, Upgrade, Geist
  wrapper all untouched (pre-existing tests 11/11 still green).
- **Helpers consumed, never reimplemented:** only `listConversations`, `deleteConversation`
  (client) and `ensureConversationForBot`, `rehydrateThread` (thread) are imported;
  `persistThreadTurns` is deliberately not called (rail holds no thread rows). `chatBotId`
  coercion (`thread.ts:165`) confirms `null` passes through as account-level.

## 3. Downstream-break adjudication (gallery [slug] malformed-slug test)

- **Reproduced by this reviewer** with the workspace-scoped command
  (`npx vitest run "app/gallery/[slug]/page.test.tsx"` in `apps/web`): **10/11 pass**; the
  single failure is `never fetches a malformed slug — honest unavailable, no leak`
  (`page.test.tsx:144`), with exactly one recorded call: `GET /api/conversations` — the real
  `DashboardRail`'s mount list (the page renders `<DashboardRail />` at `page.tsx:225`;
  the page's own slug guard at `page.tsx:140-144` correctly skips the template fetch, so the
  page logic is innocent).
- **Adjudication (M-9 pattern: real-but-out-of-scope):** the rail's mount fetch IS the Wave 1
  pack contract ("Rail lists/opens/deletes conversations" + builder's per-task "list on
  mount"), and the SPEC copy/behavior contracts all hold (§2 above). The stale assumption is
  in the gallery suite — `expect(fetchStub).not.toHaveBeenCalled()` was written when the rail
  never fetched. A component that correctly fetches on mount cannot satisfy a blanket
  never-fetch assertion on a page that renders it. Rail side correct; gallery assertion stale.
- **Concrete file-level fix for the owning wave (NOT applied by this review):** in
  `apps/web/app/gallery/[slug]/page.test.tsx`, scope the "never fetches" assertion to
  template URLs — e.g. replace the blanket assertion with
  `expect(fetchStub.mock.calls.filter((c) => String(c[0]).startsWith('/api/templates/'))).toHaveLength(0)`
  (optionally stubbing `/api/conversations` to `Response.json({ conversations: [] })` so the
  rail settles healthy). The test's intent — malformed slug never touches the template API,
  no slug leak — is fully preserved. Route this to the wave that owns
  `apps/web/app/gallery/[slug]/page.tsx` + its test (pre-existing gallery/template surface,
  outside Wave 1 scope); wave1b2b must NOT touch it (disjoint write-scopes, Hard Rule 14).

## 4. Quality

- No `any` in either rail file (grep for `\bany\b`: zero matches); no non-null assertions;
  no secrets or credentials; no new dependencies (imports are existing: `next/navigation`,
  `next/font/google`, `lucide-react`, landed client/thread helpers, CSS module); no manifest
  touched.
- Client-component conventions per `node_modules/next/dist/docs/` (hoisted at repo root):
  `'use client'` retained (state + event handlers require it), no `useSearchParams` read
  (would suspend the rail out of first HTML — the pathname-only active rule is kept), mount
  effect uses the active-flag + seq-guard idiom matching the dashboard pages.
- No out-of-scope writes: diff stat is exactly the two rail files
  (+166/−~ in `dashboard-rail.tsx`, +236/−~ in `dashboard-rail.test.tsx`).
- No git restore commands run by this reviewer; read-only throughout.

## Wave-4 handoff

- The rail exposes no new exports and no URL contract: open = `activeConversationId` state +
  existence verification only. Wave 4 (`page.tsx` integration) owns rendering rehydrated rows
  and any selection/thread wiring.
- The rail's mount GET `/api/conversations` is now load-bearing behavior — any Wave 4 (or
  gallery-owning wave) test that renders the real `DashboardRail` must stub the conversations
  path or scope its fetch assertions to its own URLs (see §3 fix recipe, which generalizes).
- The gallery `[slug]` malformed-slug suite is red until its owning wave applies the §3 fix;
  that red is pre-existing relative to Wave 4's integration work and must not be attributed
  to the rail.
