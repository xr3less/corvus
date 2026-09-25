# Task Report: inspect-docs-ci-2

## Status
ISSUES (docs drift after E1–E6 + migrate-wave0; one CI-structural gap; no product code touched)

## Files Touched
- CREATED: Agent Reports/2026-09-23-1240_inspect-docs-ci_REVIEW_docs.md

## Dependencies Added
- None

## Assumptions Made
- E1–E6 = expansion waves per `Agent Reports/2026-09-23-0850_orchestrator_SPEC_expansion.md`; on-disk state is the merged working tree (many files `??` uncommitted).
- No commands run >90s; greps + reads only; no secret values printed.

## Findings

| # | Area | Claim (doc) | Code reality | Verdict |
|---|------|-------------|--------------|---------|
| 1 | `Docs/06_data_model.md:202` (Migrations §5) | "applied 0001 → 0012; No migration-runner script; deploy runs `psql -f` per file by hand; `deploy.yml` does NOT run migrations; CI has no migrate step; No `migrate()` call" | Runner EXISTS: `apps/gateway/scripts/migrate.mjs` (journaled, checksum tripwire). CI **does** migrate: `ci.yml:37-38` `node apps/gateway/scripts/migrate.mjs`. `0013_runtime_kinds_tickets.sql` exists on disk. | STALE — §5 needs rewrite (range 0001→0013, runner + CI step, keep 0010 non-idempotent warning) |
| 2 | `Docs/10_deployment.md:22` (How it ships) | "no runner script; RUNBOOK §7.2 step 5: one `psql` file per command, never a glob loop; no `drizzle-kit migrate`, no runner script" | Same runner as #1; migrate-wave0 reviewer (`...0735...migrate-wave0`) confirms runner+journal+CI+RUNBOOK landed. | STALE — same rewrite as #1; "never glob loop" language now contradicts the runner design |
| 3 | `Docs/10_deployment.md:22` tail | "`deploy.yml` … has never been run — so no GHCR push has ever come from CI" (approx line) | PLAN records live box deploys/rebuilds (box-redeploy-003 SUCCESS, D-136 live URL). Deploy has run. | STALE — reword to "CI never pushes (build-only); GHCR pushes only via manual deploy.yml" |
| 4 | Kind lists 6-vs-8 | `PLAN.md:195` "her şablon 6-kind çevirmene"; `apps/web/app/api/spec/rollback/route.ts:18` comment names ~6 kinds; `rollback.test.ts:115-116` FALLBACK_DDL CHECK lists 6 kinds; `rollback.test.ts:132-137` ensurePg sources omit 0013 | Code is 8: `config.ts:11-20` RUNTIME_KINDS 8-tuple, `schema.ts:111-114` catalog 8, `0013` widen CHECK 8, `publish/route.ts:66-78` mirror 8, `builder-prompt.ts:19` 8 | DRIFT — update PLAN line to 8-kind; widen rollback FALLBACK_DDL + ensurePg sources to include 0013 (test-only, low risk but real) |
| 5 | `Docs/09_auth_and_billing.md:31` | "the only checkout route on disk creates Pro sessions … no refill route exists yet" | `apps/web/app/api/checkout/refill/route.ts` EXISTS (REFILL $5 = 1000cr/90d, `CREEM_TEST_PRODUCT_REFILL`) | STALE — §3 row + `07` surface map need a refill row |
| 6 | `Docs/09_auth_and_billing.md:32` | "gateway-side bot sleep is deferred (KI-035 — no file on disk yet, expired bots keep Discord state…)" | `apps/gateway/src/runtime/sweeper.ts` EXISTS (+ test, + `gateway.ts:169-245,499-501` wiring: sleep/wake interval driver, `trial_ends_at` → `sleeping`) | STALE (or KI-035 closed-unrecorded) — verify sweeper is the KI-035 close, then update §2/§3 |
| 7 | Env checklist | `.env.example:24-27` lists PRO + STUDIO product ids only | Refill route reads `CREEM_TEST_PRODUCT_REFILL` (`refill/route.ts:163`), not listed in `.env.example` | GAP — add `CREEM_TEST_PRODUCT_REFILL=` (names-only, empty value). Note: line-2 "CI fails…" promise is already documented-unenforced (`10:33`), so checklist-only |
| 8 | CI structural gap (biggest) | CI migrates "over empty CI DB" via runner | `git ls-files` tracks only `0001–0010`; `0011/0012/0013` are `??` untracked → **CI checkout never contains them** → CI DB lacks credit_ledger/subscriptions/webhook_receipts/bot_runtime_config while E1–E6 code+tests assume them | BLOCKER-adjacent — commit (or at minimum `git add -N`) the three migration files or CI tests a schema the product doesn't ship. Untracked `deploy-commands.ts` has the same invisibility |
| 9 | `start.test.ts` mock gap | CI runs full `npm test` | E1 reviewer (`...1155...e1.md:31`): merged-tree `src/start.test.ts` fails at collection — `vi.mock('discord.js')` lacks `SlashCommandBuilder`, reached via untracked `deploy-commands.ts:15` → `moderation/index.ts:586`. Events/Partials ARE now mocked (`start.test.ts:99-109`); Builder missing is the remaining hole | CI HEALTH — fix owns to whichever wave owns `deploy-commands.ts` (add `SlashCommandBuilder` passthrough via `importOriginal`), not E1. Until then full-suite CI is red on the merged tree |
| 10 | ci.yml vs deploy.yml gates drift | deploy.yml header: "Same gate order as ci.yml… Keep these steps in sync" | ci.yml gates include `Migrate` step; deploy.yml gates do NOT (Install → Build spec/ai → Typecheck…) | DRIFT — add the same migrate step to deploy.yml gates or correct the header |
| 11 | 07 surface map | `07:53-54,114-115` checkout/webhook "working tree, unmerged 2026-09-20" | Still true (0011 unmerged, test-mode), but refill route + sweeper + tickets/reaction-roles handlers + 0013 have NO rows | MINOR — add rows in the same tasks that own those surfaces (per 07's own rule) |
| 12 | Consistent (no action) | SPEC_VERSION=1; trial 1 bot / 100cr / 3-day; Pro 2000 / Studio 6000 / refill $5=1000 | `packages/spec/src/index.ts:5` =1; `session.ts:102` TRIAL_GRANT 100; `bots.ts:50,187` TRIAL_DEAL + CREDITS_TOTAL 100; `02:31-34`, `08:74`, `09:32` match | CLEAN |

SECURITY: production box / Contabo / GHCR / live keys untouched; no package.json/lockfile/.env edits; no git restore/commit; no secret values printed (lengths/presence only).

## Open Questions for Orchestrator
1. Is the E4 sweeper (`sweeper.ts` + gateway wiring) the KI-035 close? If yes, mark KI-035 Resolved and update `09:32`.
2. Who owns `deploy-commands.ts` (untracked) + the `start.test.ts` SlashCommandBuilder mock fix — E-waves or a micro-task?
3. Commit wave for `0011/0012/0013` (+ `deploy-commands.ts`): until committed, CI validates a schema without them (#8). Recommend committing migrations before any further "CI green" claims.
4. Refill route + `CREEM_TEST_PRODUCT_REFILL`: intended product surface (document + checklist it) or experiment (remove)?
