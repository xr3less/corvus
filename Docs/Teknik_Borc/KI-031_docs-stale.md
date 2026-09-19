# KI-031 — Docs-stale cluster (would mis-teach the next agent)

## Status: OPEN (P0 docs)

Filed 2026-09-19. Full audit: `Agent Reports/2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md`.

**Rule while this is open:** if a numbered doc below and this file disagree, **do not implement the numbered sentence**. True the doc in the same task as the code change, or true it in a dedicated docs wave.

Each listed file now has a `> **DRIFT (2026-09-19)**` banner at the top pointing here.

---

## File-by-file

### `08_core_pipeline.md` — the worst lie

- **§1 glance** still: user words → Discord.js codegen → sandbox lint/auto-fix → live bot.
- **Truth (D-012):** builder writes a versioned behavior-spec JSON (`parseSpec`). No executable codegen. Sandbox not built (Stage 2 body already says OPEN). Gateway stores `prod_spec`; it does **not** interpret it at runtime.
- Live model: wiro `glm/5-2` (D-026), not Flash-as-primary.

### `06_data_model.md`

- Documents `credit_ledger` and `subscriptions` as schema. **Tables do not exist.** §3 later admits ledger does not exist (self-contradiction).
- Omits `accounts.tier` (0008) and `ai_spend.attempt` + partial unique (0009, SQL-only — not in Drizzle `pgTable`).
- Claims FKs on `bots.account_id` / spec pointers — `schema.ts` has none.
- Header claims `created_at/updated_at/deleted_at` on every table — not true.
- Drizzle is a type catalog + a few boot queries. Runtime is raw `pg` Pool. No `drizzle-kit migrate` in CI/deploy. Hand-written SQL in `apps/gateway/drizzle/`.

### `07_folder_structure_and_standards.md`

- `public/clone-pryzm/` KEPT — **deleted** (KI-011 Resolved D-126). Glob = 0 files.
- `lib/bots.ts` “mock until binding” — live-first `fetchBots()` + mock fallback.
- BuilderProgress “dashboard wiring open KI-014” — Resolved D-130.
- Missing from map: `drizzle/0008`, `0009`, `tier-resolver.ts`, POST `/api/bots`.
- Mapped `infra/compose/docker-compose.yml` is actually `compose.yml`. Uptime Kuma not in compose.
- `start.ts` described as preflight-only — also boots builder worker + supervisor + tier resolver.
- Broken markdown table cells at L28 / L81.

### `02_strategy.md` L3

- “K2/K3 + Scale caps still to sign” — LOCKED D-032 / D-033.

### `04_design_language.md` L3

- Lead = `/pryzm` (D-061). Production `/` is the Antigravity port (D-120). `/pryzm` is parked, unlinked, unguarded.

### `05_architecture.md`

- “Gateway reads recipes, not code” overstates — recipes stored, not interpreted yet.
- Diagram: Hetzner CX33 + GLM 5.3 Flash via OpenRouter + Creem webhooks + Kuma watches `/healthz`. Hosting row is Contabo interim (closer). No `/healthz` in code. Compose Postgres is `postgres:17-alpine`, CI `postgres:17`, doc says `17.11-bookworm`. Host publishes `5432:5432`.

### `09_auth_and_billing.md`

- Auth + cookie sessions: **built** (true).
- Creem webhooks, ledger, nightly reconciler, dashboard export/delete, DPA: **not built**. Privacy/terms still claim Creem bills and `support@corvus.ai` (KI-016).

### `10_deployment.md`

- Eval gate as merge-block — `packages/ai/src/eval/spec-eval.test.ts` is an offline stub; live model-quality eval out of scope. `ci.yml` has no eval job, no GHCR push.
- “Uptime Kuma on-box now” — not in compose.
- Nightly `pg_dump` NOW — `pg-backup` service exists, **unscheduled**.
- Dual-key `ENCRYPTION_KEY` rotation — not implemented.
- “CI fails on unlisted vars” — `.env.example` comment; no such check. `ENCRYPTION_KEY` used in code and absent from the example (KI-032).
- “Preflight worker ships export-only… no worker runs in prod until then” — `start.ts` boots preflight **and** builder worker. Comment in that file exists _because_ it used to be export-only.

### Banners / living files (partially trued 2026-09-19)

- `00_START_HERE.md` Status now has 2026-09-18/19 lines. Numbered 01–10 table still says DRAFT.
- `PLAN.md` banner and KI-025 “next” / IP-first “pending push” / V1-7 “wiring open” were amended 2026-09-19. L117 still says Dockerfiles run-proven (false — KI-029).
- `PROJECT_STATUS.md` current banner is the audit. At-a-glance Building/Deployed rows amended.

### Decision / lesson log defects

- `DECISIONS.md`: D-128 heading has **empty body**; the 2026-09-15 builder-real-model write-up is spliced under D-129 (after the 2026-09-16 motor-hardening body).
- `LESSONS.md`: L-021 heading missing. Untitled 2026-09-15 pre-commit body sits after L-022.

---

## Close when

A dedicated docs-true wave edits each file above so a fresh agent can follow it, and this row is marked Resolved with the decision/date. Stamping a banner is **not** closing KI-031.
