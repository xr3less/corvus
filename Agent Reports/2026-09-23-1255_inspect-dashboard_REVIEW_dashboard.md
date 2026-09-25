# Task Report: inspect-dashboard-3

## Status
ISSUES (minor, non-blocking — all required wiring present)

## Files Touched
- CREATED: Agent Reports/2026-09-23-1255_inspect-dashboard_REVIEW_dashboard.md

## Dependencies Added
- None

## Assumptions Made
- E6b = invite-link (`GET /api/invite?botId=`) + token page wiring; E4a = dashboard home credits card from `GET /api/credits`; E5b = red scan rows render scanner `fix` via ErrorCard with retry; E3 = fork-success trio (Open bot / invite URL / Customize with AI). Verified against code as written, not an external spec doc.
- Static reads + greps only per task; no tests/typecheck/lint run.

## Open Questions for Orchestrator
- Are the 3 dead template buttons on dashboard home intentionally inert, or should they link somewhere (gallery / new chat)?
- Should the Credits card stay hidden (`—`) for bot-less accounts even when `/api/credits` returns a balance?

## Public Interface Exposed
- N/A (review only)

## Known Limitations
- Static inspection only; nothing executed. API-route sides (`/api/invite`, `/api/preflight/*`, `/api/credits`, fork route) not reviewed — out of scope.

---

# Review: dashboard + gallery (inspect-dashboard-3)

**Verdict: ISSUES** — two minor UI-honesty items; every required wiring (E6b, E4a, E5b, E3) is present and correct.

## Findings

| # | Area | Check | Result |
|---|---|---|---|
| 1 | Bot detail `runOpen` (`apps/web/app/dashboard/bots/[id]/page.tsx:713-746`) | invite?botId (E6b) | PASS — `GET /api/invite?botId=`, renders install link + permission whys; honest failure lines; copy discloses "shared test app — your own bot install isn't wired yet". |
| 2 | Bot detail `runScan` + `pollScan` (same file:748-793, 406-475) | scan {botId} (E6b) | PASS — `POST /api/preflight/start {botId, guildId}`, 17–20-digit guild validation, poll with 60s timeout, 401/404/connection states all handled; per-bot reset on bot switch (507-526). |
| 3 | Bot detail `toScanRow`/`scanRowTitle` + render (114-165, 1279-1307) with `components/ui/error-card.tsx` | ErrorCard .fix (E5b) | PASS — red rows → ErrorCard with scanner `fix` verbatim + `onRetry=runScan` ("Run scan again"); yellow rows keep fix as secondary line; green plain. Malformed rows shown as-is, never dropped. |
| 4 | Gallery list (388-399) + detail `[slug]` (309-323) | fork-success trio (E3) | PASS in both — "Open your bot" + "Add to Discord (shared test app)" + "Customize with AI" → `/dashboard/bots/[botId]`; fork count +1; 401 logged-out line; non-401 failures via shared `forkErrorMessage`. |
| 5 | Dashboard home credits card (`apps/web/app/dashboard/page.tsx:164-183`) | credits card (E4a) | PASS with question — live `GET /api/credits`, `formatCredits`, `—` when no bots / "No data yet" when unread; never a fabricated 0. But balance is hidden (`—`) for bot-less accounts even if the endpoint has data (see OQ2). |
| 6 | Dashboard home template strip (`page.tsx:301-315`) | button wiring | ISSUE (minor) — 3 starter presets are `<button>` with **no onClick**; code comment admits "no action behind them yet". Clickable-looking dead controls. "See all templates" → `/gallery` works. |
| 7 | Dashboard home bots/credits fetch (`page.tsx:67-80`) | empty/loading states | ISSUE (minor) — no loading guard: `liveBots` null coalesces to `[]`, so the page flashes "No bots yet — describe your first bot" while the fetch is in flight. The bots list page (`bots/page.tsx:237-240`) holds a proper "Loading your bots…" shell — home should match. Credits/This week/Pre-flight empties are honest. |
| 8 | Gallery list + detail, bots list, bot detail tabs, token sub-page, new chat page | empty/loading/error + copy | PASS — distinct loading/error/empty states everywhere else; no mock rows presented as real; trial banner fail-open from `GET /api/session/trial`; logged-out lines with login links; token page presence-only (`saved · N chars`), input cleared after every save (token/page.tsx:148-152). |
| 9 | New chat `?template=` seeding (`new/page.tsx:66-110`) | gallery→chat handoff | PASS — malformed/failed slugs leave composer empty, honest; `Start in chat` link on detail page encodes slug correctly. |
| 10 | Security scope | secrets/prod | CLEAN — no secret values printed, copied, or transmitted; no `.env`/manifest/prod contact; no git restore commands run. |

## Copy honesty spot-check
Honest throughout: "No data yet", "No activity yet", "No scan yet — open a bot to run one", "Going live on Discord isn't wired yet", "Your bot isn't live on Discord yet", shared-test-app invite disclaimer, "Two steps done" static checklist clearly display-only. No issue.
