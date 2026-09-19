-- KI-033 trial clock: accounts.trial_ends_at (forward-only; never edit 0001-0009).
-- The 3-day trial end timestamp. NULL means "no clock" and is read as NOT expired
-- (fail-open) by isTrialExpired in apps/web/lib/auth/session.ts — the boundary is
-- deliberate: a row that somehow missed the backfill must never be locked out.
--
-- GRANDFATHERING RULE (locked by the KI-033 SPEC, ruling 2): every account that
-- already exists when this migration runs gets a FRESH 3 days from deploy time
-- (now() + interval '3 days'), NOT 3 days from its original created_at. The intent
-- is generous and simple: no account that was mid-trial on deploy day is cut short
-- by the deploy itself. created_at stays a pure signup stamp and is never rewritten.
--
-- Forward-only: new rows get their clock from the INSERT in
-- upsertAccountByDiscordId (apps/web/lib/auth/session.ts), not from a column
-- DEFAULT — a DEFAULT would silently re-arm the trial on every future row and
-- make the ON CONFLICT branch's "never extend" guarantee depend on the column
-- definition rather than on the statement that owns it.

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;
--> statement-breakpoint
UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;
--> statement-breakpoint
