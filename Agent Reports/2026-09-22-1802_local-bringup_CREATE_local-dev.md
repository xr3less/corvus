# Task Report: local-bringup-2026-09-22-1802

## Status
SUCCESS

Every acceptance leg was machine-checked (HTTP status, process row, or DB count in hand — no theory greens). Full end-to-end proof: dev-login cookie -> chat 200 with real model prose -> builder start -> poll `queued -> generating -> live` with `stub:false`, model `glm/5-2`, on the pre-existing dev bot.

## Files Touched
- CREATED: Agent Reports/2026-09-22-1802_local-bringup_CREATE_local-dev.md
- MODIFIED: none (zero source edits)
- DELETED: none

## Dependencies Added
- none (node_modules already present in root, apps/web, apps/gateway; no installs run)

## Assumptions Made
- Docker Desktop was stopped at task start (daemon unreachable, `com.docker.service` not startable via service manager). I launched Docker Desktop.app locally to reach the pre-existing `corvus-dev-pg` container. This is a local-only bring-up action; no production system involved.
- The gateway worker was started with the app's own `DATABASE_URL` from `apps/web/.env.local` (read-only use of the value; no secret is reproduced anywhere in this report). Gateway env otherwise inherited from the shell.
- Both servers run detached and survive this task's end: web via `nohup npm run dev`, gateway via background `node ./dist/start.js`. Logs at `/tmp/corvus-web.log` and `/tmp/corvus-gateway.log`. They die on reboot/sleep — restart one-liners are in Known Limitations (no secret values included).

## Open Questions for Orchestrator
1. `APP_URL=http://localhost:3119` in `apps/web/.env.local` does not match the running dev server (`http://127.0.0.1:3000`). Effect observed: `POST /api/auth/dev-login` 307-redirects to the dead `localhost:3119/dashboard` (cookie is still set correctly, so login works — the founder just must not follow the redirect). One-line env fix; needs your call since `.env` files are outside my write scope.
2. `ENCRYPTION_KEY` is UNSET in `apps/web/.env.local` and absent from the gateway worker env (verified count 0). Chat + builder are proven working without it; token/invite paths that need AES-256-GCM will fail. Needs your call on where the dev value should live.
3. `WIRO_API_KEY` appears TWICE in `apps/web/.env.local` (line 16 and line 21, different lengths, both non-empty). Live model calls succeed, so at least one is valid — but the duplicate should be cleaned up by whoever owns that file (not me).
4. No UI button anywhere triggers dev-login (grep over `apps/web` `*.tsx/*.ts`, excluding the route itself and build output: zero hits). The founder path below uses a one-line browser-console POST. If you want a click-only login, that is a product change for a follow-up task.

## Public Interface Exposed
- No new interface (bring-up only, no code written).
- Verified live local surfaces: `GET /` 200, `GET /dashboard/new` 200, `GET /dashboard` 200 (authed), `GET /dashboard/bots` 200 (authed), `GET /dashboard/bots/05a0cf98-a6b6-433e-bd4d-59a1a32110a3` 200 (authed), `GET /api/auth/dev-login` 405 (route live, POST-only), `POST /api/auth/dev-login` 307 + session cookie, `GET /api/bots` 401 anon / 200 authed, `POST /api/chat` 200 SSE, `POST /api/builder/start` -> `{"runId","phase":"queued"}`, `GET /api/builder?runId=` -> `queued -> generating -> live`.

## Known Limitations
- This report covers LOCAL only (`corvus-dev-pg` / `corvus_dev`, `127.0.0.1:3000`). Production box, Contabo, GHCR, live keys untouched. `git status` shows no new modifications from this task (175 modified-tracked + 22 untracked are pre-existing KI-036 wave state; the only new file is this report).
- Servers are ephemeral (die on reboot/sleep). Restart one-liners, DB first: (a) launch Docker Desktop and wait for `corvus-dev-pg` healthy; (b) web: `cd apps/web` then `npm run dev -- --port 3000 --hostname 127.0.0.1`; (c) gateway worker: `cd apps/gateway` then `node ./dist/start.js` with `DATABASE_URL` set to the same value as in `apps/web/.env.local` (dist build already exists and was verified present). Verify afterwards: port 3000 answers, gateway log shows `builder-worker-started`.
- Stale-server trap guarded: web was freshly started by this task (log `Ready`, port OPEN re-verified after start); gateway log shows `gateway-started`, `worker-started`, `builder-worker-started`, `boot-bots-started started=0 failed=0`.
- AI key presence (lengths only, never values): `WIRO_API_KEY` set (two non-empty entries, see Q3); `WIRO_BASE_URL` set; `OPENROUTER/ZAI/DEEPSEEK/ANTHROPIC_API_KEY` UNSET; `DISCORD_CLIENT_ID/SECRET` set (lengths confirmed, values never read). If the AI key were missing, chat and builds would fail honestly (route 500s / `budget_exceeded` deadletter) — that state was NOT observed; both lanes answered live.
- Chat metering note: the test chat reply ended `done` with `credits:0, note:usage-unavailable` — the honest fallback path, recorded not hidden.
- The builder proof run minted `spec_versions` version 3 on the pre-existing dev bot (`Test bot Zorba`, id recorded above) — one extra draft version row on a throwaway dev bot, dev DB only.

## Environment facts (machine-checked)
- Dev DB: container `corvus-dev-pg` (`postgres:17-bookworm`, Up), host `localhost:5432`, database `corvus_dev`, **16 tables** in `public` (count via read-only query through the app's own `DATABASE_URL`: `TABLE_COUNT=16`; names: accounts, ai_spend, audit_events, bot_runtime_config, bots, builder_runs, credit_ledger, guild_installs, interview_progress, oauth_states, sessions, spec_versions, subscriptions, templates, user_records, webhook_receipts). Note: container env names the superuser `postgres` while the app URL uses its own user — both reach the same `corvus_dev` DB; no config was changed.
- Web: `next dev` on `127.0.0.1:3000`, Next.js 16.3.4 (Turbopack), env source `.env.local`, `Ready` in log, `WEB3000: OPEN`, root `/` 200, `/dashboard/new` 200, dev-login GET 405 (guard inactive in dev, route live).
- Dev-login: `POST /api/auth/dev-login` -> 307 + `corvus_session` cookie (presence confirmed, value never copied). Guard file `apps/web/app/api/auth/dev-login/route.ts` requires `CORVUS_DEV_LOGIN=1` and non-production — `.env.local` has it set to `1` (verified). Authed `GET /api/bots` 200 returned the dev bot; anon 401.
- Worker: gateway `dist/start.js` running (PID observed), real repo path (`npm start` -> `dist/start.js`, dist verified present), log shows preflight + builder workers started. Queue proof: fresh run `queued -> generating -> live` over ~30s of 10s polls, `detail.version:3, model:glm/5-2, stub:false`. `pgboss.job` builder row `completed`; `builder_runs` phase `live`. No wedged queue.
- Gateway env names present (names only): `DATABASE_URL`, `WIRO_API_KEY` (inherited — this is why the live model lanes work). `ENCRYPTION_KEY` absent (see Q2).

## Founder test path
Do these in order, in the browser. Use exactly `http://127.0.0.1:3000` everywhere (not `localhost:3119` — that address is dead; see Q1).

1. Open `http://127.0.0.1:3000` in the browser. You will see the landing page.
2. Press `F12` (opens developer tools), click the `Console` tab.
3. Paste this line, press Enter: `await fetch('/api/auth/dev-login',{method:'POST'})` — then close developer tools with `F12`. (There is no login button; this one line is the login. Ignore any red text.)
4. In the address bar type `http://127.0.0.1:3000/dashboard` and press Enter. You are logged in — no Discord needed.
5. Click `New bot` (or type `http://127.0.0.1:3000/dashboard/new`). Chat a little: describe a bot, e.g. "welcome new members and post server rules". Replies stream inline.
6. Press the `Build this bot` button. A `Build progress` section appears ON THE SAME PAGE and steps through the phases live (Queued -> Generating -> ... -> Live). It also keeps a `Follow the build` link — you do not need it; the progress is inline.
7. Now open any bot: `Dashboard -> Bots`, click a bot (or type `http://127.0.0.1:3000/dashboard/bots/05a0cf98-a6b6-433e-bd4d-59a1a32110a3`). Chat in its thread, then press `Save as draft` or `Start build` — same deal: the whole conversation (not just the typing box) is used, the buttons enable as soon as there is thread text even with an empty box, and `Build progress` renders inline with the `Follow the build` link.
8. If the AI key were missing, this is what honest failure looks like (NOT seen today, recorded so you recognise it): chat answers with an error instead of prose, and a started build ends in `failed` instead of `live` — never a fake success. If you see that, tell the team "AI key missing" and stop; nothing is broken, the key just needs supplying.
