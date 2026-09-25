# Task Report: local-bringup-dashboard-new

Timestamp: 2026-09-23-2328 (system clock, TST)

## Status
PARTIAL

Local stack is UP and every layer is proven live — **except the `/dashboard/new` auto-start, which fails with a real defect (HTTP 500) on the founder's exact path.** The build chain itself is proven working end to end through the detail page. Detail below; founder test path at the end.

## Files Touched
- CREATED: `Agent Reports/2026-09-23_local-bringup_dashboard-new.md`
- MODIFIED (runtime artifact only, gitignored, not source): `apps/gateway/dist/**` — rebuilt from current source via the repo's own `npm run build --workspace @corvus/gateway`. No source file edited.
- Backup of the previous `dist` taken OUTSIDE the repo first: `C:\Users\xr3less\AppData\Local\Temp\gateway-dist-backup-20260923` (292 files).
- DELETED: none. No git command restoring from HEAD was run. No commit, no push, no deploy, no migration.

## Processes Started
| Process | PID | Port | State | Started |
|---|---|---|---|---|
| Web dev server (`next dev --port 3000 --hostname 127.0.0.1`) | 10836 | 3000 | **REUSED** (pre-existing, not restarted) | 2026-09-22 18:14 |
| Gateway + builder worker (`node ./dist/start.js`) | **28324** | none (no HTTP listener) | **RUNNING** (fresh, from rebuilt dist) | 2026-09-23 23:21 |
| Postgres `corvus-dev-pg` | docker | 5432 | pre-existing, up | — |

**One destructive action taken, deliberately and narrowly:** the previous gateway PID **6004** was stopped. It had been started **2026-09-22 18:13** from a `dist` built **2026-09-21 23:32** — ~2 days behind the current source (missing the existence-before-billable-work guard `m-28`, the sync-commands worker, the sweeper, `__setRefillPool`). It was a stale local worker, not a sibling the task needed; a current build was the only way to test the current code. Old `dist` preserved outside the repo (above).

Gate before boot: `npm run typecheck --workspace @corvus/gateway` clean, then `npm run build --workspace @corvus/gateway` clean, and the rebuilt `dist` diffed byte-for-byte against an independent fresh compile (`diff -rq` → only `.map` differences).

## URLs
- Web: **http://127.0.0.1:3000** — root `200`, `/dashboard/new` `200` (26,691 bytes, contains the hero `What will your bot do today` + hint `say yes when the plan looks right`; zero occurrences of the deleted `Build this bot` — the current wave page is served).
- Dashboard (authed): **http://127.0.0.1:3000/dashboard**
- New-bot page: **http://127.0.0.1:3000/dashboard/new**
- Bot detail (working build entry): **http://127.0.0.1:3000/dashboard/bots/05a0cf98-a6b6-433e-bd4d-59a1a32110a3**
- Gateway: **no HTTP port at all** — it is a pure worker process (PID 28324) that talks only to Postgres and the model provider. There is nothing to open in a browser; port 6004 answers `000` (nothing listening), and that is correct, not a failure. Its health is read from its log, not a URL.

**Warning — `localhost:3119` is dead.** `apps/web/.env.local` sets `APP_URL=http://localhost:3119`, but nothing listens there. `POST /api/auth/dev-login` therefore 307-redirects to `http://localhost:3119/dashboard`. The `corvus_session` cookie IS set correctly (the browser commits it before following the redirect), so login works — **do not follow that redirect.** Use `http://127.0.0.1:3000` in the address bar. This is the same `.env` mismatch reported 2026-09-22 and still unfixed; it is one line in a file outside my write scope.

## Logs
- Gateway stdout: `C:\Users\xr3less\AppData\Local\Temp\corvus-gateway-20260923.log`
  ```
  {"level":"info","event":"gateway-started","botId":"system"}
  {"level":"info","event":"worker-started","botId":"system"}
  {"level":"info","event":"builder-worker-started","botId":"system"}
  {"level":"info","event":"sync-commands-worker-started","botId":"system"}
  {"level":"info","event":"boot-bots-started","botId":"system","reason":"started=0 failed=0"}
  {"level":"info","event":"sweeper-started","botId":"system"}
  {"level":"info","event":"sweeper-tick","botId":"system","reason":"slept=0 woken=0"}   (repeating)
  ```
  stderr: **0 bytes**. The `preflight-boss-error` lines the old process logged are gone in the new build.
- Web dev server: `C:\Users\xr3less\AppData\Local\Temp\corvus-web.log`
- No secret value appears in either log, in this report, or in any captured output. `DATABASE_URL` / keys were read by name and used; never printed.

## Evidence the stack is genuinely live (not just "booted")

1. **Worker polls Postgres.** `pg_stat_activity` shows 5 `pgboss` backends from the new PID; their `state_change` advances every ~3-5s and their `query` text cycles over `job_common`/`version`/`queue` maintenance SQL. A hung process would show frozen timestamps.
2. **Worker consumes builder jobs — zero-cost liveness probe.** I sent one job with a valid shape naming a **nonexistent** run. It was claimed in **1s**, executed, and settled `failed / {"error":"run_gone"}`. `ai_spend` gained **zero** rows (newest spend row still 09-22 15:30). This proves the queue→worker→DB path executes without spending a credit.
3. **Session + chat lane live.** `POST /api/auth/dev-login` → 307 + cookie; authed `GET /api/bots` → 200; `GET /api/session/trial` → `{"trialExpired":false}`. Real chat turn returned real model prose (`"I help you describe, build, and manage Discord bots without writing any code."`).
4. **Full build chain live.** `POST /api/builder/start` → `{"runId":"ba98b7af-2c78-42b7-b012-e1f93e3cd737","phase":"queued"}` → polled `generating` → **`live`** with `{"version":4,"model":"glm/5-2","stub":false}`. Row written, spend row written (`burn:builder`, 0.15544 credits).

## BLOCKER — the `/dashboard/new` auto-start fails live (HTTP 500)

**Symptom the founder will see:** on `/dashboard/new`, the chat works perfectly. When the assistant posts its plan ending `Can I start?` and the founder replies `yes`, a red line appears — `Could not start the build. Try again.` — and **no build ever starts, on any retry.**

**Root cause (isolated, not guessed).** The provider rejects a **system-only** `messages` array:

```
POST https://llm.wiro.ai/v1/chat/completions   {messages:[{role:"system",...}]}
→ HTTP 400 {"error":{"message":"messages must contain at least one user message.","type":"invalid_request_error","param":"messages","code":"invalid_messages"}}
```
Adding one `user` message to the identical request → **HTTP 200**.

`apps/web/app/api/builder/verdict/route.ts` sends exactly the rejected shape at **two** call sites — both wrap the whole prompt in a single `system` turn:
- line **434–445** — the verdict call (`buildVerdictPrompt(...)`)
- line **473–476** — the brief call (`buildBriefPrompt(threadText)`)

Both are inside `try { } catch {` blocks whose catch returns `500 {"error":"could not judge reply"}` (route.ts:448-452 and :478+). Live proof: `POST /api/builder/verdict` with a proper plan turn + `yes` → **500 `{"error":"could not judge reply"}`** in 98ms (fails at the provider, not in our code). Isolated probes, same key:

| messages shape | result |
|---|---|
| `[system]` (the verdict route's shape) | **FAIL** — 2 routes, both `http-400` |
| `[system, user]` (chat + builder shapes) | **OK** — model `glm/5-2` / `xai/grok-4-1-fast` |

The route's own gate order is correct and was verified working: unauth → **401**, missing ask line → **409 `{"error":"no_plan_asked"}`** (no model call). The failure is strictly the model call.

**This is a false-negative gap, not just a bug.** The route's 19/19 tests are green because they **stub the persona lane** (`__setPersonaCaller`, route.test.ts:186-191) — the stub never contacts the provider, so the shape that the provider rejects is never exercised. The 2026-09-22 aibuild review marked this exact path honestly: *"NOT exercised and honestly marked: the interactive browser flow… No browser automation exists in this harness, and live POSTs were deliberately avoided."* So no prior gate could have caught it. This is `LESSONS.md` §2.4: green tests coexisting with a route answering 500.

**The builder worker is NOT affected.** Its call is `[system, user]` (builder-runs.ts:637-649, `buildBuilderPrompt()` + the brief as the user turn) — a shape proven to work above. So the defect is confined to the two verdict-route call sites.

**Note on the key:** `WIRO_API_KEY` is present twice in `.env.local` (97-char and 77-char, different values). The **97-char** one is valid; the 77-char one returns `http-401` (invalid). Note that the web dev server reaches the provider via `.env.local` (Next loads it), while a bare `node` process in this shell inherits the 97-char key from **user-scope env** — same value, two sources. Also `WIRO_BASE_URL` is absent from user/machine scope and comes only from `.env.local`, so a bare node process silently uses the package default (which happens to be identical, `https://llm.wiro.ai/v1`). Neither is the cause of the 500.

## Secondary observations (not blocking)
- `public.schema_migrations` does not exist and migration `0013` (which widens `bot_runtime_config.kind` from 6 to 8 values, adding `tickets` + `reaction-roles`) is unapplied. The stale CHECK currently rejects those two kinds. Roadmap: admin later than local dev, and no earlier local bug depends on it — the runtime `RUNTIME_KINDS` list and schema both carry all 8. Flagged, not touched (no migrations against real data).
- `bot_runtime_config` has 0 rows and both dev bots are `draft`, so `boot-bots-started started=0 failed=0` is correct, not a silent failure.
- `builder_runs` uses `phase`/`detail` (not `status`); 4 rows now (3 prior + this task's run, ending `live`).
- The 97-char key entry and the 77-char duplicate in `.env.local` should be reconciled by whoever owns that file. `ENCRYPTION_KEY` remains unset (token/invite paths will fail; chat and builds do not need it).

## Test Entry Point — founder flow (all on `http://127.0.0.1:3000`)

Everything below is verified working except step 5b, which fails as described above.

1. Open **http://127.0.0.1:3000**
2. Press `F12` → `Console` tab → paste and run: `await fetch('/api/auth/dev-login',{method:'POST'})` → close with `F12`. (Ignore the redirect error text; the cookie is set. There is no login button.)
3. Go to **http://127.0.0.1:3000/dashboard/new**
4. Describe a bot in chat, e.g. *"welcome new members and post the server rules"*. Replies stream inline. Answer its questions until it posts a plan ending **`Can I start?`**
5. Reply **`yes`**.
   - **Expected (works):** an inline **Build progress** block appears and steps through `Queued → Generating → … → Live`.
   - **Actual today:** red text **`Could not start the build. Try again.`** — nothing starts. This is the blocker above.
6. **Working path for the same outcome now:** open **http://127.0.0.1:3000/dashboard/bots** → click the bot → chat in its thread → press **`Start build`**. This route (`POST /api/builder/start`, `[system,user]` shape) is proven live: it produced `queued → generating → live`, v4, `glm/5-2`, `stub:false` during this task. Inline progress renders the same way.
7. Honest-failure recognition: if a key were missing/expired, chat answers with an error string and a started build ends `failed` — never a fake success.

**Do not** use `localhost:3119` anywhere; it is dead.

## Open Questions for Orchestrator
1. **Fix decision (recommended):** the provider contract requires ≥1 `user` message. The minimal, honest fix is at the two verdict-route call sites — move the prompt into a `user` turn (or append the reply/thread as the `user` message). The prompt builders (`buildVerdictPrompt`, `buildBriefPrompt`) live in `packages/ai` and are pinned by parity tests, so the fix should be shape-only at the call site, not a prompt rewrite. This needs a coding sub-agent + a fresh reviewer, and the reviewer must exercise the **live** provider path (a stubbed lane cannot ever catch this class).
2. **Class, not instance (`LESSONS.md` §2):** the same system-only shape would break any future route that calls a lane with no user turn. Worth a guard — e.g. the router asserting ≥1 non-system message, or a single-shape helper — so the class cannot recur silently.
3. **Harness gap:** route tests stub the lane, so provider-shape errors are structurally invisible to them. An integration test against the real provider (even one cheap call) or a router-level shape assertion would have caught this. Harness fix, not prompt wording (`LESSONS.md` §1 & Principle 8).
4. `APP_URL` still points at dead port 3119 in `.env.local`. One-line fix, file outside my write scope.
5. `WIRO_API_KEY` duplicated in `.env.local` (97-char valid, 77-char invalid). Which entry is canonical?
6. Should `0013` be applied to local dev? Not needed for the chat/build path; needed the moment `tickets`/`reaction-roles` publishing is tested.
