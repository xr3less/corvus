# Task Report: review-e4-money

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-1155_reviewer_REVIEW_e4.md (this report)
- MODIFIED: none (read-only review)
- DELETED: none

## Dependencies Added
None.

## Evidence (merged tree, run by reviewer — not taken from slice reports)

Artifacts confirmed on disk: `apps/web/app/api/credits/route.ts`,
`apps/web/app/dashboard/page.tsx`, `packages/ai/src/budget.ts`,
`apps/web/app/api/webhooks/creem/route.ts`,
`apps/web/app/api/checkout/refill/route.ts`,
`apps/web/lib/auth/session.ts`, `apps/gateway/src/runtime/sweeper.ts`,
`apps/gateway/src/runtime/sweeper.test.ts`, `apps/gateway/src/gateway.ts`.

Toolchain detected from workspace package.json scripts (npm workspaces,
vitest, `tsc --noEmit`, `eslint --max-warnings 0`): npm 11.12.1, node v24.15.0.

- `npm run typecheck --workspace @corvus/ai` — clean, 0 errors.
- `npm run typecheck --workspace @corvus/web` — clean, 0 errors.
- `npm run typecheck --workspace @corvus/gateway` — clean, 0 errors.
- `eslint --max-warnings 0` on all 8 E4 source/test files — clean.
- `packages/ai/src/budget.test.ts` — 39/39 green.
- `apps/web/app/api/webhooks/creem/route.test.ts` — 65/65 green.
- `apps/gateway/src/runtime/sweeper.test.ts` — 23/23 green;
  `src/gateway.test.ts` — 32/32 green.
- Scoped web regression (dashboard page, checkout/create, session-db, auth,
  session-bind) — 5 files, 109/109 green. The E4c-flagged risk (upsert
  `RETURNING` + `xmax` breaking the session-db SQL-shape assertion) did NOT
  materialize.
- Secret scan (literal key patterns, `console.log` of env) over the webhook,
  credits, and refill routes — no hits. Env values read by name only.
- Webhook write surface: only `webhook_receipts`, `credit_ledger`,
  `subscriptions`, `accounts.tier`/`accounts.creem_id`. No `bots` write
  anywhere in the file. Trial-grant write is gated on `row.xmax === '0'`
  (INSERT path only); the ON CONFLICT branch writes nothing.

## Interface-match verdict

1. **E4c refill row shape vs E4b `refillAllowance` SUM — MATCH.**
   Writer (`route.ts` webhook refill branch): `reason = 'refill'`,
   `amount_cr = 1000`, deterministic `grantRefId(creditKey)`, `attempt = 1`,
   same `INSERT_GRANT_SQL` + partial-unique exactly-once idiom. Reader
   (`budget.ts` `REFILL_CREDITS_SQL`): `SUM(amount_cr)` filtered on
   `reason = 'refill'` and `created_at >= now() - interval '90 days'`.
   E4a's `REFILL_CREDITS_SQL` is textually the same query. Terms
   ($5 / 1,000 / 90-day) agree in all three slices plus E4c's route
   constants. `trial_grant` (100 cr, no ref_id/attempt) and `monthly_grant`
   rows are reason-filtered out of the refill SUM — no interference.
   Same-payment collision across plan/refill namespaces is impossible: the
   unique index covers `(ref_id, reason, attempt)` and the reasons differ.
   Note: the webhook keys refills on the **product id**
   (`isRefillProduct`), not on E4c's `metadata.kind = 'refill'` hint — the
   hint is unused but harmless; the product-id contract is what binds the
   purchase end to end.
2. **`checkBudget` callers vs new `accountId` requirement — MATCH.**
   `chat/route.ts`, `verdict/route.ts`, and gateway `builder-runs.ts` all
   pass a real `accountId`; all three workspaces typecheck.
3. **E4d `attachSweeper` seam vs E6-owned `start.ts` — SEAM READY, BOOT CALL
   ABSENT (expected, E6 scope).** `Gateway.attachSweeper(handle: { stop() })`
   exists; `startSweeper(pool, target, logger, opts)` returns
   `{ stop, sweepNow }`, which satisfies the seam. `start.ts` contains no
   `startSweeper`/`sweeper` reference — the boot call is still pending.

## Instant-FAIL checks (all clear)
No webhook write to `bots`. No trial_grant on the non-INSERT path. No refill
double-count path (receipt PK gate + deterministic ref_id + `ON CONFLICT DO
NOTHING` + payment-event-only credit ownership). No secrets, no production
contact (no SSH, no box env, no Contabo, no GHCR, no installs, no git
restore/commit commands run).

## Open Questions for Orchestrator
- OQ1 (pre-flagged, confirmed): `CREEM_TEST_PRODUCT_REFILL` is absent from
  `.env.example` (only PRO/STUDIO listed) and from `.github/workflows/ci.yml`
  env. Until set, refill events fall through to `product_unmapped` (loud 500,
  no receipt) by design.
- OQ2 (pre-flagged, confirmed): nothing wires `__setRefillPool` at app boot,
  so `refillAllowance` returns 0 in production and `checkBudget` enforces the
  pre-refill allowance while `/api/credits` already displays the widened one.
  Display and gate disagree until the pool is wired.
- OQ3 (pre-flagged, confirmed): `startSweeper` boot call pending in E6-owned
  `start.ts`; the sweeper module + `attachSweeper` seam are ready.
- OQ4 (new, merged-tree integration — NOT an E4 defect, NOT an E4 FAIL):
  `apps/gateway/src/start.test.ts` fails to load on the merged tree
  (`[vitest] No "SlashCommandBuilder" export is defined on the "discord.js"
  mock`, via untracked non-E4 files `runtime/moderation/`,
  `runtime/feature-modules.ts`, `deploy-commands.ts` through a modified
  `start.test.ts` E4d never touched). E4's own gateway tests
  (sweeper 23/23 + gateway 32/32) pass, but the "full gateway suite green"
  acceptance criterion is NOT met on the merged tree because of this
  cross-wave breakage. Owner of those files should fix the mock.
- OQ5 (minor, pre-flagged by E4c): refill route documents Pro-only but does
  not code-gate by tier — any signed-in tier can buy. Needs a product
  decision only if the terms require gating.

## Public Interface Exposed
No new interfaces from this review. Verified existing: `GET /api/credits`;
`POST /api/checkout/refill`; `refillAllowance(accountId)` /
`__setRefillPool`; webhook `refillProductId()` / `isRefillProduct()`;
`writeTrialGrant` + `INSERT_TRIAL_GRANT_SQL`; `startSweeper` /
`attachSweeper` / `decideSweep` / `reconcileSweep`.

## Known Limitations
- No live-Postgres date-boundary test for the 90-day refill expiry (SQL-text
  assertion + absence-tolerance tests only); no live-Discord run of
  sleep/wake; no human-flow run in a live app (hermetic gates only).
- E4c ships no persistent test file for the refill route or the trial-grant
  write (temporary live-DB proofs were removed after passing); coverage rests
  on adjacent suites (109/109) plus the reviewer's re-runs.
- Review ran scoped suites only (per task orders) — no full monorepo suite.
- Production box, Contabo, GHCR, and live keys were never touched. No secret
  value appears in code, logs, or this report (presence checked by
  defined-only/length-only).
