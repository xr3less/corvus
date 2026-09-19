# KI-033 — Trial 3-day / 1-bot / sleep not enforced

## Status: OPEN (P1)

Locked product shape (D-011 / D-034): 3-day full-Pro trial, 1 bot, 100 credits, no card; day 4 pay-or-sleep; 12-month data keep.

## What exists

- `accounts.tier` column, default `trial` (`drizzle/0008_accounts_tier.sql`, KI-025).
- `createAccountsTierResolver(pool)` passed into the builder worker at boot.
- `ai_spend` meter + `attempt` unique backstop (KI-026). Chat **records** spend.

## What does not exist

- Nothing in product `apps/` **writes** `accounts.tier` (tests only).
- No `trial_ends` clock. No 1-bot cap on `POST /api/bots` mint.
- Chat path has no `checkBudget`.
- No sleep-on-expiry job. Landing still promises the 3-day Pro trial (KI-030).

## Close when

Mint and chat observe the locked trial rules, or the landing/docs stop promising them. Do not silently invent a different trial.
