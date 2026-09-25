# Task Report: local-verify-dashboard-new

Timestamp: 2026-09-23-2331 (system clock, TST)

## Status
SUCCESS (verification complete — the one blocker is independently re-proven, not new)

Verified claims from `2026-09-23_local-bringup_dashboard-new.md`: `/dashboard/new` serves HTTP 200 locally; the verdict route exists with its gates intact; the builder worker queue is present; the stale port-6004 reference is correct as "nothing listening". The auto-start defect the bring-up reported is real and reproduces on the founder's exact path. No code was changed; no git restore; no secrets.

## Files Touched
- CREATED: `Agent Reports/2026-09-23_local-verify_dashboard-new.md` (this report)
- MODIFIED: none. No source file edited, no git command run, no install, no migration.

## Dependencies Added
- none

## Verification Evidence (all local HTTP, exact codes)

### 1. `/dashboard/new` serves 200
```
GET  http://127.0.0.1:3000/dashboard/new          -> 200, 26,691 bytes, no redirect
GET  http://127.0.0.1:3000/dashboard/new (authed) -> 200, 26,691 bytes
GET  http://127.0.0.1:3000/                       -> 200
```
Body contains the current wave hero `What will your bot do today?` and the hint `say yes when the plan looks right` — i.e. the live page, not a stale bundle. There is **no auth redirect**: unauthenticated `/dashboard` is also `200` (no middleware exists in `apps/web`), so "login redirects to /login" was not applicable — there is no `/login` or `/auth` login page at all (`/login` → 404, `/auth` → 404; only `/auth/error` exists). Login is solely via `POST /api/auth/dev-login`.

### 2. Verdict route present, gates intact — exercised live
`apps/web/app/api/builder/verdict/route.ts` exists (20,852 bytes, mtime 2026-09-23 02:56). Gate chain probed with a real dev session cookie:

| probe | HTTP | body |
|---|---|---|
| unauth POST | **401** | `{"error":"unauthorized"}` |
| authed, fabricated botId | **404** | `{"error":"bot not found"}` |
| authed, real botId, no `Can I start?` in last assistant turn | **409** | `{"error":"no_plan_asked"}` (verified no model call) |
| authed, real botId, plan ending `Can I start?` + user `yes` | **500** | `{"error":"could not judge reply"}` in 133 ms |

The 500 is **reproduced independently** on the founder's exact path (assistant plan + `yes`). It fails at the provider call, exactly as the bring-up isolated: the route sends a single `system` message (route.ts:434–445 verdict, :473–476 brief) and the provider rejects a system-only array. The failure lands in the `try/catch` before `recordVerdictSpend`, so **the probe cost zero credits** — newest `ai_spend` row is still `2026-09-23 20:26:50Z` (the bring-up's own builder run), 36 rows total, unchanged across all my probes.

The route's 30 `it(...)` tests in `route.test.ts` stub the persona lane via `__setPersonaCaller` (route.test.ts:186–191, 223), so the provider-rejected shape is structurally invisible to them — the bring-up's false-negative explanation checks out.

### 3. Builder worker queue present
`BUILDER_QUEUE = 'builder'` in `apps/gateway/src/db/builder-runs.ts:72` and in the running `dist` (`apps/gateway/dist/db/builder-runs.js:59`). Live registration confirmed in Postgres:
```
select name from pgboss.queue;  ->  builder, __pgboss__send-it, preflight, sync-commands
```
Worker call shape is `[system, user]` (builder-runs.ts:637–649) — the shape proven to work — so the defect is confined to the two verdict-route call sites.

### 4. Stack liveness at verification time
- Gateway PID **28324** alive (node.exe, 101 MB) — started 2026-09-23 23:21 from the rebuilt dist. Log `C:\Users\xr3less\AppData\Local\Temp\corvus-gateway-20260923.log` shows exactly one each of `gateway-started`, `worker-started`, `builder-worker-started`, `sync-commands-worker-started`, `boot-bots-started`, `sweeper-started`, plus 9 advancing `sweeper-tick` lines. stderr 0 bytes.
- Web dev server PID **10836** alive (node.exe, 810 MB) — reused, untouched.
- Port **6004** → curl `000` (nothing listening). This is **correct**, not a failure: the gateway is a pure worker with no HTTP listener. The "stale port-6004 reference" in the bring-up is accurate.
- Postgres `corvus-dev-pg` up on 5432; database `corvus_dev` (the name is `corvus_dev`, not `corvus`). Last `builder_runs` row `ba98b7af-2c78-42b7-b012-e1f93e3cd737` phase `live` — the bring-up's working build chain.

## Assumptions Made
- The provider rejection itself was not re-probed (that needs the API key and a direct provider call, outside "local HTTP checks only"); I verified the **symptom and the route-side facts**, and the root-cause isolation stands as the bring-up reported it.

## Open Questions for Orchestrator
- none new. The bring-up's six open questions stand unchanged (fix decision for the two call sites; class guard; harness integration test; `APP_URL` 3119; duplicated `WIRO_API_KEY`; migration 0013).

## Public Interface Exposed
- `GET /dashboard/new` → 200 (public, no auth gate).
- `POST /api/builder/verdict` → 401 / 404 / 409 / **500 (broken model call)** on the auto-start path.
- `POST /api/builder/start` → working build entry (proven live in bring-up: `queued → generating → live`).
- pg-boss queue `builder` consumed by the gateway worker.

## Known Limitations
- No browser automation: page checks are HTTP + HTML inspection, not a rendered click-through. The chat stream itself was not re-driven in a browser in this task (the bring-up exercised it).
- Only the local dev stack (127.0.0.1:3000) was checked; nothing was tested against a deployed environment.

## Founder Test Steps (verified path)
Verified by HTTP: the working entry is the **bot detail page**, not `/dashboard/new`.

1. Open **http://127.0.0.1:3000** in the address bar (never `localhost:3119` — nothing listens there).
2. Press `F12` → `Console` → run: `await fetch('/api/auth/dev-login',{method:'POST'})` → close DevTools. The `corvus_session` cookie is set correctly. **Ignore** any red error about a redirect to `localhost:3119`; do not follow it. (There is no login page: `/login` and `/auth` both 404.)
3. Go to **http://127.0.0.1:3000/dashboard/bots** — the dev bot `Test bot Zorba: welcomes new mem` (id `05a0cf98-a6b6-433e-bd4d-59a1a32110a3`) is listed.
4. Click the bot → press **`Start build`**. An inline **Build progress** block appears and steps `Queued → Generating → … → Live`; the address bar gains `?runId=…` (e.g. the proven run `ba98b7af-2c78-42b7-b012-e1f93e3cd737`).
5. **Success looks like:** progress reaches **Live**, the detail page shows a new version (`v4`, `glm/5-2`, `stub:false` for the proven run); DB evidence is a `builder_runs` row with `phase = live`.
6. **What NOT to click / not to expect:**
   - On `/dashboard/new`, replying `yes` to a plan ending `Can I start?` shows red `Could not start the build. Try again.` and starts nothing — that path is broken (the 500 above).
   - Do not click **`Go live`** — Discord go-live is not wired yet (the new-bot page itself says *"Going live on Discord isn't wired yet."*).
   - Do not use `localhost:3119` anywhere.
