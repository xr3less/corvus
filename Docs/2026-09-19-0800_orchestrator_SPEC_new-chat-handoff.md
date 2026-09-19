# Task Report: new-chat-handoff

## Status

SUCCESS (docs only — no product code, no commit, no SSH this pass)

This file is the **single start point for a new chat**. Read it, then `Docs/PROJECT_STATUS.md`, then `Docs/KNOWN_ISSUES.md`. Do not rediscover the overnight deploy by grepping the tree.

## Files Touched

- MODIFIED: `Docs/PROJECT_STATUS.md` (banner + glance + recent)
- MODIFIED: `Docs/KNOWN_ISSUES.md` (KI-018/029/034 amended; 030/031/032/033 still fully Open)
- MODIFIED: `Docs/PLAN.md` (shareable-URL ticked with residuals; last-updated)
- MODIFIED: `Docs/00_START_HERE.md` (Status append + founder open items)
- MODIFIED: `Docs/DECISIONS.md` (D-136 appended)
- MODIFIED: `Docs/LESSONS.md` (L-023, L-024)
- MODIFIED: `Docs/Teknik_Borc/00_INDEX.md` + KI-018 row in `eski-aciklar.md` + KI-029/034 status
- CREATED: this file

## Dependencies Added

None.

## Assumptions Made

- Clock for this stamp is 2026-09-19 morning (session date). Exact wall-clock of the live cert: notBefore Sep 18 20:36:34 2026 GMT.
- Founder asked only for docs fill before opening a new chat. No commit, no push, no box SSH, no KI-030/031/033 coding in this pass.

## Open Questions for Orchestrator

None for this pass. The next chat inherits the ordered list in §Next.

## Public Interface Exposed

N/A (docs).

## Known Limitations

- Numbered docs 01–10 bodies are **not** rewritten (KI-031). Drift banners exist; bodies still lie.
- This report describes the **worktree**, not `origin/master`. HEAD is still `b5c9833`.

---

## Read this first (new chat)

**Product:** Corvus — AI Discord bot builder. Founder is non-engineer; speak Turkish, no jargon dump.

**HEAD on origin:** `b5c9833` — IP-first Caddy + nip.io (D-135). Working tree is **dirty and uncommitted** (Dockerfiles, parked guards, compose-036, deploy.yml caddy, living docs, drift banners). Untracked: `Agent Reports/`, `Docs/Teknik_Borc/`.

**Live URL (do not share with strangers):** `https://13-140-181-113.nip.io/`

- Proven 2026-09-19 night: HTTPS 200, Let's Encrypt CN match, verify 0, login 307 to Discord with byte-exact `redirect_uri=https://13-140-181-113.nip.io/api/auth/callback`.
- Report: `Agent Reports/2026-09-18-2343_box-deploy-001_CREATE_first-deploy.md`
- Clone SHA on box: `b5c9833c2942a458f48a053f9d533328cd040d67`
- Secrets live **only** at `/opt/corvus/.env` (0600 root). Never cat it. Never paste values into chat.

**Honesty lock:** KI-030 is Open. Landing sells trial/Pro/Studio/cancel; rail shows fake Pro + Credits 82/100; `fetchBots` falls back to mock. Publish ≠ live Discord. **Do not put strangers on the URL.**

---

## What is DONE (proven)

| Item                                                                                             | Proof                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Box provisioned (Contabo VPS, Docker, ufw, `/opt/corvus`)                                        | box-deploy-001                                                                       |
| First deploy LIVE over nip.io HTTPS                                                              | curl 200 + openssl verify 0 (independent review)                                     |
| Discord login redirect encodes the exact callback                                                | GET `/api/auth/login` → 307 Location discord.com                                     |
| Caddy Automatic HTTPS (tls-alpn-01 on 443; port 80 = 308→HTTPS)                                  | cert CN = `13-140-181-113.nip.io`                                                    |
| KI-025/026/027 (tier column, ledger unique, new-page mint)                                       | D-134, CI `35382829514` green                                                        |
| IP-first decision (no domain required)                                                           | D-135, commit `b5c9833`                                                              |
| Docs-vs-code audit + Teknik_Borc folder                                                          | `2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md`                             |
| Repo compose no longer publishes postgres 5432                                                   | compose-036, **uncommitted**, live box still exposes it                              |
| Repo Dockerfiles COPY `@corvus/ai` (web+gateway) + `@corvus/spec` dist on gateway runner         | worktree, **uncommitted**, local `docker build` unproven (Docker Desktop was down)   |
| Parked pages `notFound()` in production: `/pryzm`, `/pick`, `/pick/results`, `/demo/stats-bento` | worktree, **uncommitted**, live image not rebuilt. `/demo` left unguarded on purpose |
| deploy.yml + RUNBOOK pull/up include `caddy`                                                     | worktree, **uncommitted**                                                            |

## What is NOT done

| Item                                                                                                                                                | Status                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit + push the overnight wave                                                                                                                    | Not done. Classifier previously denied orchestrator push; founder used `! git push` last time                                                         |
| Redeploy box from repo (git pull, rebuild images, recreate postgres without 5432)                                                                   | Not done. Live box still has box-local Dockerfile patch + public 5432 + plaintext `:3000`                                                             |
| KI-032 `.env.example` `ENCRYPTION_KEY=`                                                                                                             | **Not written.** Box already has a generated 64-hex key. Example file still missing the name + still says “do not add WIRO__” while WIRO__ are listed |
| KI-030 honesty pass                                                                                                                                 | Not started                                                                                                                                           |
| KI-031 numbered-doc body rewrite (02/04–10)                                                                                                         | Banners only                                                                                                                                          |
| KI-033 trial 3-day / 1-bot / sleep enforcement                                                                                                      | Not started. `accounts.tier` never written in product code                                                                                            |
| KI-018 close                                                                                                                                        | Stay Open until deploy is **reproducible from the committed repo**                                                                                    |
| KI-015 live-PG generate/sync, KI-016 support email + `/dpa`, KI-017 live Discord relogin, KI-019 named lint/format on HEAD, KI-024 live-Discord leg | Still Open                                                                                                                                            |
| Discord Developer Portal redirect URI                                                                                                               | **Founder click** — byte-exact `https://13-140-181-113.nip.io/api/auth/callback`                                                                      |
| Contabo snapshot                                                                                                                                    | **Founder click** — no panel creds in the secret files                                                                                                |
| GitHub `DEPLOY_*` secrets + workflow_dispatch path                                                                                                  | No PAT. Manual SSH was the first deploy                                                                                                               |
| Dual-key ENCRYPTION rotation                                                                                                                        | Docs-only                                                                                                                                             |
| CI assertion that postgres has no published ports                                                                                                   | Escalated from compose-036, not built                                                                                                                 |
| Local Docker daemon                                                                                                                                 | Was down 2026-09-19 morning — do not claim a local image rebuild until it is started and the build is re-run                                          |

## Dirty tree (must not be lost)

Uncommitted / untracked as of this handoff (HEAD `b5c9833`):

- `.github/workflows/deploy.yml` — caddy in pull/up
- `apps/web/Dockerfile`, `apps/gateway/Dockerfile` — KI-029 COPY/build
- `apps/web/app/pryzm/page.tsx`, `pick/page.tsx`, `pick/results/page.tsx`, `demo/stats-bento/page.tsx` — KI-034 guards
- `infra/compose/compose.yml` — postgres ports removed
- `infra/RUNBOOK.md` — caddy in pull/rollback
- Numbered docs 02, 04–10 — DRIFT banners only
- Living: `DECISIONS`, `LESSONS`, `KNOWN_ISSUES`, `PLAN`, `PROJECT_STATUS`, `00_START_HERE`
- Untracked: `Agent Reports/`, `Docs/Teknik_Borc/`

Three overnight coding agents (docker-029, env-032, parked-034) died with `API Error: Connection refused` **after** writing some code. There are **no** `2026-09-19-0040_*` reports. Do not wait for them. env-032 did **not** land `.env.example`.

**While this wave is uncommitted, no sub-agent runs git restore/stash/checkout --/reset** (`LESSONS.md` L-021 class + global `~/.claude/LESSONS.md` § git-restore).

## Secrets contract (do not violate)

- Read secret VALUES only from Desktop files / `/opt/corvus/.env`, and only when writing the box env.
- Never paste password, token, oauth secret, ENCRYPTION_KEY, DATABASE_URL into chat, logs, or reports. Names + shapes only.
- Bot token is FLEET, not in `.env` for login proof.
- Desktop files were used for first deploy; they still exist.

## Next chat — ordered work (do not skip 1)

1. **Commit the dirty wave** (Dockerfiles, parked guards, compose-036, deploy.yml caddy, RUNBOOK, living docs, Teknik_Borc, Agent Reports). Then founder `! git push origin master` if the classifier blocks.
2. **KI-032** — add empty `ENCRYPTION_KEY=` to `.env.example` + reword the WIRO note. Shape only: 64 hex **or** 32-byte base64 (`apps/gateway/src/lib/crypto.ts`).
3. **Redeploy the box** from the new commit: pull, rebuild images from **repo** Dockerfiles, recreate postgres **without** published 5432. Confirm off-box TCP 5432 no longer handshakes. Residual: `web:3000` is still published (RUNBOOK §7.5 debug) — plaintext bypass of Caddy; close later or leave documented.
4. **KI-030 honesty** before any share of the URL.
5. **KI-031** rewrite numbered bodies (08 glance is the worst lie: there is no Discord.js codegen sandbox).
6. **KI-033** only after honesty — or stop promising the trial on the landing.
7. Founder: Discord redirect + Contabo snapshot.

Do **not** start KI-030/031/033 coding before (1)+(2)+(3) unless the founder reorders. A live box that cannot be rebuilt from git is the actual fire.

## Authority / harness (unchanged)

- Speak Turkish to the founder. English to sub-agents.
- Orchestrator does not write production code. Delegate. Reviewer is a fresh agent.
- Feasibility already skipped (D-017) — do not re-open unless founder asks.
- `PLAN.md` + `00_START_HERE.md` stay additive.
- Close rule for `Teknik_Borc/`: leave files; move body under Resolved only when KNOWN_ISSUES is Resolved **and** the lying numbered doc is trued.
