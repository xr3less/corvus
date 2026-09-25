# KI-031 — Docs-stale cluster (would mis-teach the next agent)

## Status: RESOLVED 2026-09-20 (docs-true wave: 02/04/05/06/07/08/09/10 bodies trued + reviewed SUCCESS, banners removed, D-128 body restored; closeout `Agent Reports/2026-09-20-0922_orchestrator_NOTE_ki031-closeout.md`)

Filed 2026-09-19. Full audit: `Agent Reports/2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md`.

**Rule while this is open:** if a numbered doc below and this file disagree, **do not implement the numbered sentence**. True the doc in the same task as the code change, or true it in a dedicated docs wave.

Each listed file had a `> **DRIFT (2026-09-19)**` banner at the top pointing here — all removed 2026-09-20 when the legs were trued.

---

## File-by-file

### `08_core_pipeline.md` — the worst lie (TRUED 2026-09-20, review SUCCESS)

- Was: **§1 glance** user words → Discord.js codegen → sandbox lint/auto-fix → live bot.
- Now: builder writes a versioned behavior-spec JSON (`parseSpec`). No executable codegen. Sandbox OPEN. Gateway stores `prod_spec`; it does **not** interpret it at runtime.
- Live model: wiro `glm/5-2` (D-026), not Flash-as-primary.

### `06_data_model.md` (TRUED 2026-09-20, review SUCCESS)

- Was: documents `credit_ledger` and `subscriptions` as schema while tables did not exist; §3 admitted the ledger does not exist (self-contradiction).
- Now: `credit_ledger` + `subscriptions` + `webhook_receipts` marked working-tree-unmerged (0011); `accounts.tier` (0008) and `ai_spend.attempt` + partial unique (0009, SQL-only) added; false FK and every-table-timestamps claims fixed; §5 rewritten to hand-SQL truth.
- Drizzle is a type catalog + a few boot queries. Runtime is raw `pg` Pool. No `drizzle-kit migrate` in CI/deploy. Hand-written SQL in `apps/gateway/drizzle/`.

### `07_folder_structure_and_standards.md` (TRUED 2026-09-20, review SUCCESS)

- `public/clone-pryzm/` — **deleted** (KI-011 Resolved D-126). Glob = 0 files.
- `lib/bots.ts` — live-first `fetchBots()` + honest empty state.
- BuilderProgress dashboard wiring — Resolved D-130.
- Map now includes: `drizzle/0008`, `0009`, `0010`, `0011`, `tier-resolver.ts`, POST `/api/bots`, `app/api/checkout/`, `app/api/webhooks/creem/`.
- `infra/compose/compose.yml` (name fixed). Uptime Kuma not in compose.
- `start.ts` boots preflight + builder worker + supervisor + tier resolver.
- Broken markdown table cells at L28 / L81 — repaired.

### `02_strategy.md` L3 (TRUED 2026-09-20, review SUCCESS)

- Was: “K2/K3 + Scale caps still to sign” — LOCKED D-032 / D-033.

### `04_design_language.md` L3

- Lead = `/pryzm` (D-061). Production `/` is the Antigravity port (D-120). `/pryzm` is parked, unlinked, guarded (`notFound()` in production, 404s on direct URLs).
- **Resolved 2026-09-20 — this leg is closed.** The doc was trued over two reviewed passes: 11 findings independently CONFIRMED against source, and the one refuted claim (the 700-weight count) corrected to the verified **7 in `*.css` + 2 outside it**, each with line cites. The final light review returned SUCCESS, and the leg no longer mis-teaches — motion four-list, sky `--color-accent` cascade, planned-vs-enforced (lede vs `Starter`) distinction, and guarded `/pryzm` are all stated as built. Evidence: `Agent Reports/2026-09-20-0128_reviewer_REVIEW_docs04fix.md`.

### `05_architecture.md` (TRUED 2026-09-20, review SUCCESS)

- Recipes stored, not interpreted yet. Hosting: Contabo interim (not Hetzner CX33). Model: wiro glm/5-2 live. Creem webhooks built test-mode. No Kuma, no `/healthz`. Postgres: doc claim vs `postgres:17-alpine` (compose) vs `postgres:17` (CI) — all three now stated exactly. `5432:5432` publish removed from repo (box closed on recreate); `:3000` still live.

### `09_auth_and_billing.md` (TRUED 2026-09-20, review SUCCESS)

- Auth + cookie sessions: **built** (kept, verified).
- Now: Creem webhooks built test-mode, ledger built working-tree (0011), trial enforcement D-145 live (403 `trial_expired`, gateway pause deferred KI-035). Still absent, stated honestly: nightly reconciler, dashboard export/delete, DPA. Privacy/terms copy: states what the legal routes actually say (KI-016 context; legal copy itself untouched).

### `10_deployment.md` (TRUED 2026-09-20, review SUCCESS)

- Eval gate as merge-block — FALSE: `packages/ai/src/eval/spec-eval.test.ts` is an offline stub; `ci.yml` has no eval job, no GHCR push.
- “Uptime Kuma on-box now” — FALSE: not in compose.
- Nightly `pg_dump` NOW — FALSE: `pg-backup` service exists, **unscheduled** (manual pre-deploy snapshot is current practice, RUNBOOK §7.2).
- Dual-key `ENCRYPTION_KEY` rotation — FALSE: not implemented (single-key, `crypto.ts`).
- `.env.example` now HAS the key shape (KI-032) but still no enforcing check: both stated.
- Preflight “export-only, no worker in prod” — FALSE: `start.ts` boots preflight **and** builder worker (+ supervisor, tier resolver). `deploy.yml` is manual-only, never ran.

### Banners / living files (trued 2026-09-20)

- All 8 numbered legs (02/04/05/06/07/08/09/10) trued + reviewed SUCCESS; their DRIFT banners removed. `00_START_HERE.md` table flips DRAFT → TRUED for those 8. `PLAN.md` KI-031 wave ticked DONE; `PROJECT_STATUS.md` banner below.

### Decision / lesson log defects (FIXED 2026-09-20)

- `DECISIONS.md`: D-128 body restored under its own heading (it sat under D-129 since 2026-09-15); DRIFT banner removed. D-129 untouched.
- `LESSONS.md`: L-021 heading already present (`Docs/LESSONS.md:309`) — KI-031's "heading missing" claim was stale. Only numeric order is off (L-022 precedes L-021); left as-is, harmless.

---

## Close when

A dedicated docs-true wave edited each file above so a fresh agent can follow it — DONE 2026-09-20, all legs reviewed SUCCESS. This file is now the closed record; the open rule above no longer applies.
