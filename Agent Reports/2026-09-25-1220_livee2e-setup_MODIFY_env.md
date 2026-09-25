# Task Report: livee2e-setup-20260925-1220

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/.env.local (git-ignored per .gitignore:7 `.env.*`; verified via git check-ignore before and after)
- (side-effect reverted, not a scope touch: `git checkout -- apps/web/next-env.d.ts` to undo a dev-server auto-rewrite of the routes-d.ts import path; tree is clean)

## Dependencies Added
- none (no installs run)

## Assumptions Made
- Env target is `apps/web/.env.local` (the file the dev server actually reads; boot log confirms `Environments: .env.local`). No root `.env` created — the app does not read one.
- Kept the pre-existing `WIRO_API_KEY` value byte-identical (combined key:secret shape, len 97). Provenance: 2026-09-21 line combining the two parts of `wiroai.txt`. Left untouched what live runs already proved; no provider calls made to re-validate the shape.
- `APP_URL=http://localhost:3000` (was stale `localhost:3119`, a dead port per three prior bring-up reports). dev-login now 307-redirects to `http://localhost:3000/dashboard`.
- Removed a duplicated second `WIRO_API_KEY` line (malformed `wiro ai key=:...` shape, len 77); the surviving line is the first, byte-identical.
- 0010's grandfathering UPDATE was safe to run here: pre-check showed 0 NULL-clock accounts and both existing accounts already carried clocks; post-check confirms both clocks unchanged (no re-arm).
- No `ENCRYPTION_KEY` set: both consumers (gateway crypto.ts, web token route) fail lazily at first encrypt/decrypt, never at boot. Dev server is healthy without it.

## Open Questions for Orchestrator
- `ENCRYPTION_KEY` is unset. Fine for boot/health and the builder/chat lanes, but the bot token-save path (`POST /api/bots/[botId]/token`) will fail until a 32-byte key is installed. Set one before the gate exercises token save, or confirm the gate skips it.
- There is NO `/api/health` or `/healthz` route in this repo (RUNBOOK confirms web healthcheck uses `/`). Health below is evidenced via `/`, dev-login, and `/api/templates` instead.
- `.env.local` now holds 7 vars; `.env.example` lists more (CREEM_*, OPENROUTER/ZAI/DEEPSEEK/ANTHROPIC keys, POSTGRES_*, TAG, GHCR_OWNER). None are read at boot on the dev path (Creem/fallbacks fail honestly when unset). Confirm the gate needs no more than the 7.

## Public Interface Exposed
- Env var names present in `apps/web/.env.local`: DATABASE_URL, APP_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, WIRO_API_KEY (len 97), WIRO_BASE_URL, CORVUS_DEV_LOGIN. Lengths only; no values recorded.
- Dev server: Next.js 16.3.4 (Turbopack), `npm run dev` in `apps/web`, listening `http://localhost:3000`, `Ready in 4.5s`. Process left running (background, log `/tmp/corvus-dev.log`).
- Health evidence: `GET /` 200 (~0.8s); `POST /api/auth/dev-login` 307 to `http://localhost:3000/dashboard`; `GET /api/templates` 200 (`{"templates":[]}`).
- DB: `corvus-dev-pg` reachable at `localhost:5432`, database `corvus_dev`. `migrate.mjs --check` clean: all 13 files journaled (0001_init through 0013_runtime_kinds_tickets).

## Known Limitations
- Table count is 17 public tables, not 16: the 16 data tables match recon exactly; the 17th is the `schema_migrations` journal table itself (journal rows 0 before, 13 after — tables were created out-of-band earlier, unjournaled; this run journaled them forward-only with zero data movement: 48 sessions and both account rows preserved).
- `bot_runtime_config` kind CHECK is now the widened 8-value set (tickets + reaction-roles included); zero config rows exist, so nothing to backfill.
- Pre-existing second account `567299775607734282` and `dev-founder` both `tier=trial` with intact clocks.
- This task made no provider calls, printed no secret value, committed nothing; `git status` is clean and the env file is ignored.
