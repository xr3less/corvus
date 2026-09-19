# KI-033 — Trial 3-day / 1-bot / sleep not enforced

## Status: RESOLVED 2026-09-19 night (option A, founder-ordered)

Wave: ki033-a (clock: `0010_accounts_trial_ends.sql` + `isTrialExpired` + session plumbing) → ki033-b (mint cap 3 entry points) → ki033-c (chat + builder-start gates) → ki033-d (honest copy) → ki033-e (tier live + banners wired via `GET /api/session/trial`). Reviews: wave PARTIAL (gaps named), e SUCCESS. Reports: `Docs/2026-09-19-2211_*_ki033-*.md` + `Docs/2026-09-19-2300_reviewer_REVIEW_ki033-wave.md` + `Docs/2026-09-19-2310_ki033-e_MODIFY_trial-signal.md` + `Docs/2026-09-19-2315_reviewer_REVIEW_ki033-e.md`.

Residuals: 34 DB-backed assertions UNVERIFIED here (loud skips — need TEST_DATABASE_URL machine). Gateway pause deferred to KI-035 (expired keeps Discord state; copy says "paused").

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
