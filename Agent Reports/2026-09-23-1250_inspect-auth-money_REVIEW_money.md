# Task Report: inspect-auth-money-4

## Status
ISSUES (one, pre-flagged and confirmed; all money-path logic itself CLEAN)

## Files Touched
- CREATED: Agent Reports/2026-09-23-1250_inspect-auth-money_REVIEW_money.md (this file)
- READ (no modifications): apps/web/lib/auth/session.ts, packages/ai/src/budget.ts, apps/web/app/api/credits/route.ts, apps/web/app/api/webhooks/creem/route.ts, .env.example, .github/workflows/ci.yml, apps/web/lib/bots.ts (mintGate, supporting), apps/web/app/terms/page.tsx (sold terms), apps/web/app/page.tsx (sold copy, via grep)

## Findings

| # | Area | Verdict | Detail |
|---|------|---------|--------|
| 1 | Trial grant INSERT-only (`session.ts` L196-231) | CLEAN | `trial_ends_at = now() + 3 days` set on INSERT only; ON CONFLICT branch touches email only. `trial_grant` 100-credit row gated on `xmax = '0'` (INSERT marker), so re-login grants nothing. No ref_id/attempt: sits outside the `(ref_id, reason, attempt)` partial unique index by construction. Grant failure never breaks signup (caught; 42P01 swallowed for sibling suites without the ledger table). Memory double mints no clock/grant by documented design (test-only). |
| 2 | Budget refill consistency (`budget.ts` vs `credits/route.ts`) | CLEAN | Same vocabulary everywhere: `REFILL_REASON = 'refill'`, 90-day window, `readRefillCredits` positive-only, absence-tolerant zero. `checkBudget` allowance = tier base + `refillAllowance`; credits route allowance = `MONTHLY_GRANTS[tier] + refills`. Trial base 100 in both. `trial_grant` rows cannot inflate allowance (refill read filters `reason = 'refill'`) — no double-grant between the signup grant and the monthly allowance. |
| 3 | Webhook refill handling (`webhooks/creem/route.ts` L405-421, L661-685) | CLEAN | Refill checked before tier resolution; refill path writes no subscription row, no tier move, no customer rebind. Only the collected-payment event (`creditKey !== null`) writes the ledger row (`REFILL_REASON`, 1000 credits), reusing the deterministic `ref_id` + `ON CONFLICT DO NOTHING` exactly-once idiom; reason namespaces it away from plan grants. Matches the $5/1,000/90-day terms promise and the credits-route read. Pre-existing note (not new): `attempt = 1` deviates from 0011's "grants carry no attempt" convention — already flagged as an open question in the task report, not re-litigated here. |
| 4 | Env completeness: `CREEM_TEST_PRODUCT_REFILL` | ISSUE (confirmed, pre-flagged) | Code reads it in two places: webhook `refillProductId()` (L405-408) and `checkout/refill` route. `.env.example` lists only `CREEM_TEST_PRODUCT_PRO` / `CREEM_TEST_PRODUCT_STUDIO` (L24-27) — **REFILL entry absent, confirmed**. `ci.yml` sets no `CREEM_*` env at all (only `DATABASE_URL`); tests stub via `vi.stubEnv` so CI passes regardless. Fix (orchestrator-owned, manifests out of my scope): add `CREEM_TEST_PRODUCT_REFILL=` + comment to `.env.example`. Behavior without it is safe by design (loud `product_unmapped` 500, no receipt, Creem retries). |
| 5 | Sold vs enforced trial terms | CLEAN (all three match) | 3-day: sold ("Free 3-day trial", terms "3 days of full Pro access") vs enforced (`now() + 3 days` INSERT-only, never extended, `isTrialExpired` gates) — match. 1-bot: sold ("1 bot") vs enforced (`mintGate`: `liveBotCount >= 1` refuses `trial_bot_limit`, paid bypass, expired checked first) — match. 100-credits: sold ("100 AI credits") vs enforced (100 `trial_grant` INSERT-only + `MONTHLY_GRANTS.trial = 100` budget gate) — match. |

## Dependencies Added
- None.

## Assumptions Made
- Static reads + grep only per task brief; no tests, typecheck, or lint run.
- No secret values printed, copied, or transmitted (presence-by-name only, per SECURITY).
- Production box / Contabo / GHCR / live keys untouched and out of scope.

## Open Questions for Orchestrator
1. Add `CREEM_TEST_PRODUCT_REFILL=` to `.env.example` (manifest-owned fix for finding #4)? Suggested comment mirrors the PRO/STUDIO lines: dashboard test-mode product id for the $5/1,000-credit refill pack; unset means refill purchases refuse loud.
2. Confirm `attempt = 1` deviation from 0011 convention stays as-is (pre-existing open question from the webhook task report; this audit takes no position beyond noting the ledger/reads are consistent with it).

## Public Interface Exposed
- N/A (read-only review; no code added or changed).

## Known Limitations
- Did not run any gates (typecheck/lint/tests) or boot the app; verdict is static-consistency only.
- Did not audit `checkout/create` (PRO-only product read) or `checkout/refill` beyond env-name confirmation — outside the listed scope.
- Sold-copy check covered landing (`page.tsx`), pricing (`pryzm/page.tsx`), and terms; did not sweep every surface for trial claims.
