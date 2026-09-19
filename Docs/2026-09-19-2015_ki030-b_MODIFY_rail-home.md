# Task Report: ki030-b-rail-home

## Status

PARTIAL

All owned files are edited, lint/format/tests green. Repo-wide `tsc` is red solely because of a concurrent sibling edit outside my scope (`apps/web/app/dashboard/bots/page.tsx`, owned by ki030-c). Owned-file gates pass; the failure is recorded below, not stretched past.

## Files Touched

- MODIFIED: apps/web/components/ui/dashboard-rail.tsx — removed fake `Pro` pill span; removed credits line + credits progressbar (no `CREDITS_USED`/`CREDITS_TOTAL` import or render); kept disabled `Upgrade · Coming soon` and Log out untouched.
- MODIFIED: apps/web/components/ui/dashboard-rail.test.tsx — header test now asserts `Pro` is absent; credits test replaced with "no fake credit balance" (asserts no `progressbar[name=Credits]`, no `/credits/i` text, Upgrade button still present). No other test behavior changed.
- MODIFIED: apps/web/lib/bots.ts — `TRIAL_DEAL` → locked string; `fetchBots()` 401/500/network/malformed paths return `{ bots: [], source: 'mock', isLive: false, unauthorized: <401> }`, never mock; comments updated to the empty-state rule; no export added/removed/renamed.
- MODIFIED: apps/web/app/dashboard/page.tsx — dropped `MOCK_BOTS`/`CREDITS_*` imports; `bots` defaults to `[]` (live rows, injected rows, else empty); stat cards are `{Live, On trial: real counts or —; Servers: real sum only if some row carries `servers`, else `No data yet`/`—`; Credits left: `No data yet`/`—`}` with plain `aria-label`s (no `(example)`); `This week` aria-label unmarked and empty text `No bots yet — describe your first bot.`; new `No bots yet` panel with heading `No bots yet — describe your first bot.` + link `Create your first bot` → `/dashboard/new`; `Follow your bot from draft to saved version.` verbatim; `TRIAL_DEAL` renders the new locked text.
- MODIFIED: apps/web/app/dashboard/page.test.tsx — `TRIAL_LINE` → locked string; stat-card test asserts `—` values with plain names + no `(example)` in body; week test asserts honest empty state; added empty-panel link test, saved-version copy test, live-rows test extended (Servers/Credits → `No data yet`, empty panel absent), and failure-path test (500 → empty panel, no `Study Hall`, no `(example)`).

## Dependencies Added

- None.

## Assumptions Made

- `fetchBots()` failure snapshots keep `source: 'mock'` + `isLive: false` (rather than inventing a new `BotSource` variant) so sibling consumers and existing types keep compiling untouched per contract §1. Empty `bots: []` is what pages branch on.
- `mockBotsSnapshot()` still returns `MOCK_BOTS` for compat (export must stay; sibling tests import `MOCK_BOTS`); `fetchBots()` simply no longer calls it.
- `Bot`/`FlaskConical`/`Server`/`Coins` icon imports stay on the home page (stat cards keep their icons, only values/labels changed).
- Unused CSS classes (`.proPill`, `.creditsLine`, `.meterTrack`, `.meterFill` in `dashboard-rail.module.css`) left alone — CSS files are outside my scope.
- Get-started card (`Get started (2/4) (example)`, `Setup progress (example)`) left untouched — outside the row's acceptance criteria; stop rules say leave out-of-row behavior green, don't refactor.
- Vitest must run with the project config (`npx vitest run --config apps/web/vitest.config.mjs …` from repo root); bare `npx vitest run <paths>` fails on alias/`@/components` resolution and jsdom setup even for unmodified files. This is a harness invocation detail, not a code defect.

## Open Questions for Orchestrator

- Repo-wide `npx tsc --noEmit -p apps/web/tsconfig.json` FAILS on `apps/web/app/dashboard/bots/page.tsx` (ki030-c's file, not mine): its current working-tree state removed the `MOCK_BOTS` and `BotSource` imports while the body still references `MOCK_BOTS` (L79), `BotSource` (L80), and now-untyped params. My owned files produce zero errors. Recommend ki030-c re-add the imports or finish its empty-state rewrite; I did not touch its file per the disjoint-write-scope rule. Full tsc error list recorded from 1 attempt (errors TS2304/TS7006/TS7053 on that file only).
- Confirm `source: 'mock'` on empty failure snapshots is acceptable to ki030-c's consumers, or whether the spec should lock a different `source`/`isLive` shape. I chose the minimal type-compatible option; change only on your word.

## Public Interface Exposed

- `fetchBots()` failure contract: `(signal?: AbortSignal) => Promise<BotsSnapshot>` — never throws; 401 → `{ bots: [], source: 'mock', isLive: false, unauthorized: true }`; non-ok / malformed JSON / network → `{ bots: [], source: 'mock', isLive: false, unauthorized: false }`; 2xx with array (possibly empty) → `{ bots: rows.map(toDisplayBot), source: 'live', isLive: true, unauthorized: false }`. Callers branch on `bots.length === 0` for the honest empty state.
- Full export list preserved (nothing removed or renamed — verified by grep): `BotStatus`, `MockBot`, `STATUS_LABEL`, `STATUS_RANK`, `MOCK_BOTS`, `TRIAL_DEAL`, `ActivityItem`, `CREDITS_PER_CHANGE`, `activityFor`, `PREFLIGHT_ROWS`, `CREDITS_USED`, `CREDITS_TOTAL`, `formatCount`, `mockSpecFor`, `LiveActivityItem`, `formatActivityTime`, `mapLiveStatus`, `LiveBotRow`, `BotSource`, `BotsSnapshot`, `mockBotsSnapshot`, `toDisplayBot`, `readLiveBotRows`, `fetchBots`, `resolveBotId`.
- `TRIAL_DEAL` new value (verbatim): `Free while in preview — limits not enforced yet.`
- `CREDITS_USED`/`CREDITS_TOTAL` stay exported (= 82/100) for compat but nothing in my scope renders them as a balance; rail credits line + meter deleted, home `creditsLeft` computation deleted.
- Dashboard home empty-state contract: `bots.length === 0` renders `section[aria-label="No bots yet"]` with heading `No bots yet — describe your first bot.` and link `Create your first bot` → `/dashboard/new`; week panel falls back to `No bots yet — describe your first bot.`; stat groups are `Live bots` / `On trial` / `Servers` / `Credits left` with `—` or `No data yet`, never mock counts.

## Known Limitations

- Repo-wide typecheck red due to sibling file above (PARTIAL reason); owned-file gates all green: `eslint --max-warnings 0` on all 5 owned files clean; `prettier --check` on all 5 owned files clean (after one `--write` pass on the two dashboard-home files); owned vitest files green via project config (`dashboard-rail.test.tsx` 9/9, `page.test.tsx` 16/16, 25 total).
- Gate attempts stayed within the 2-attempt cap: tsc 1 attempt (recorded + moved on; failure is out-of-scope), eslint 1, prettier 2 (check → write → check), vitest 2 (bare invocation failed on harness setup → reran with project config, green).
- No git commands run, no installs, no manifest edits, no network calls.
- Dead CSS (`.proPill`, `.creditsLine`, `.meterTrack`, `.meterFill`) remains in `dashboard-rail.module.css` — cosmetic only, needs a CSS-scope owner if cleanup is wanted.
