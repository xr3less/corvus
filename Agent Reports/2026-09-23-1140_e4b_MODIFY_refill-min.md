# Task Report: expansion-e4b-refill-min

## Status
SUCCESS

## Files Touched
- MODIFIED: packages/ai/src/budget.ts
- MODIFIED: packages/ai/src/budget.test.ts
- MODIFIED: apps/web/app/api/webhooks/creem/route.ts
- MODIFIED: apps/web/app/api/webhooks/creem/route.test.ts

## Dependencies Added
- None

## Assumptions Made
- Refill terms truth is $5 / 1,000 credits / 90 days, taken from the terms page promise, the credits route (`REFILL_CREDITS_SQL`, `REFILL_REASON = 'refill'`), and the refill checkout route (`REFILL_CREDITS = 1000`, `REFILL_REASON = 'refill'`, `CREEM_TEST_PRODUCT_REFILL` env). All three agree; no new vocabulary introduced.
- `budget.ts` is DB-free by design (`getSpent` injected), so `refillAllowance` uses a module-level pool seam (`__setRefillPool`, test-only, mirroring the webhook's own `__setPool` seam) rather than importing a pool. Production wiring of that seam is sibling/orchestrator scope — this task only exports the function and seam.
- Refill purchases arrive as `checkout.completed` one-time events carrying the refill product id (same shape as a plan one-time checkout, distinguished by product). The refill product is checked before the tier lookup, so no tier is resolved and no subscription/tier write is authorised for refills.
- The refill ledger row reuses the existing `INSERT_GRANT_SQL` (deterministic `grantRefId(creditKey)` + `ON CONFLICT (ref_id, reason, attempt) DO NOTHING` partial-unique idiom) with `reason = 'refill'`, so the reason namespace separates refill rows from `monthly_grant` rows for the same payment identity — no index or migration change needed.
- Non-payment refill events (e.g. unsettled checkout) record their receipt and stop: 200, no ledger row, no tier move. Lifecycle/refund/dispute paths untouched; dispute-freeze stays out.

## Open Questions for Orchestrator
- Who wires the production refill pool into `budget.ts` (`__setRefillPool`) at app boot, and should `checkBudget` callers in chat/verdict routes pass anything new, or does the module-level seam suffice?
- Confirm the live Creem dashboard has a `CREEM_TEST_PRODUCT_REFILL` product whose id will be set in env; an unset env means refill events fall through to `product_unmapped` (loud 500, no receipt) by design.

## Public Interface Exposed
- `packages/ai/src/budget.ts`: `export const REFILL_REASON = 'refill'`; `export const REFILL_WINDOW_DAYS = 90`; `export const REFILL_CREDITS_SQL` (SUM of `credit_ledger.refill` within 90 days, same shape as the credits route's query); `export async function refillAllowance(accountId: string): Promise<number>` (absence-tolerant: no pool / missing table / unreadable row reads as 0); `export function __setRefillPool(pool) / __resetRefillPool()` (test-only seam). `checkBudget` signature unchanged; allowance is now `MONTHLY_GRANTS[tier] (or explicit override) + refillAllowance(accountId)`.
- `apps/web/app/api/webhooks/creem/route.ts`: `export const REFILL_REASON = 'refill'`; `export const REFILL_CREDITS = 1000`; `export function refillProductId(): string`; `export function isRefillProduct(productId): boolean`.

## Known Limitations
- The 90-day expiry boundary is enforced in SQL (`created_at >= now() - interval '90 days'`), verified by statement-text assertion plus absence-tolerance tests (expired/absent reads as zero); there is no live-Postgres date-boundary test in this task (no live DB exercised — hermetic fakes only). A live-PG refill test (insert aged row, assert excluded) would be the follow-up proof.
- Production wiring of `__setRefillPool` is NOT done here — until wired, `refillAllowance` returns 0 and `checkBudget` behaves exactly as before.
- Ran ONLY the two touched test files plus typecheck on both touched packages per the command budget: `packages/ai/src/budget.test.ts` 39/39 green; `apps/web/app/api/webhooks/creem/route.test.ts` 65/65 green (60 pre-existing + 5 new refill cases); `tsc --noEmit` zero errors on both `packages/ai` and `apps/web`. No full suite, no repo-wide lint.
- No secrets touched, printed, or logged (presence-by-name env reads only, unchanged convention).
