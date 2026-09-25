-- Overnight money-harness wave: billing foundation — credit_ledger +
-- subscriptions + webhook_receipts (forward-only; never edit 0001-0010).
-- Must match apps/gateway/src/db/v11.ts column-for-column (KI-025 convention).
--
-- ⚠️  NEVER RE-RUN 0010's UPDATE (it RE-ARMS the trial).
-- 0010_accounts_trial_ends.sql ends with:
--   UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days'
--    WHERE "trial_ends_at" IS NULL;
-- That statement was correct exactly once (grandfathering on deploy day). Any
-- account whose clock is NULL — one deliberately cleared, or one that arrived
-- by hand — gets a brand-new 3-day trial if the file is run again. This file
-- therefore issues NO UPDATE against "accounts" and NO backfill of any kind:
-- it only ADDS tables, so running it twice is a no-op.
--
-- Re-run safety: every table and index below is IF NOT EXISTS, so a second run
-- is idempotent (0008/0009 pattern) — unlike 0010, whose UPDATE is not.
--
-- Idempotency model (mirrors 0009 / KI-026): the partial unique index on
-- (ref_id, reason, attempt) covers only rows where BOTH ref_id and attempt are
-- NOT NULL. Manual grant/refill rows (no attempt, no uuid ref) sit OUTSIDE it
-- by construction. Creem/webhook rows are deliberately placed INSIDE it: the
-- webhook writes a DETERMINISTIC ref_id (derived from the payment identity)
-- with attempt = 1, precisely so the index covers them. That index — not
-- application logic — is the exactly-once mechanism: a second delivery of the
-- same payment loses the ON CONFLICT race instead of granting a second month,
-- which a check-then-act "have I granted this yet?" read cannot survive. (An
-- earlier draft of this comment claimed Creem rows were untouched by the
-- index; that reading was wrong and would have left exactly-once unenforced.)
-- Row-level replay protection for the webhook lives in
-- "webhook_receipts"."event_id" (PK): Creem ids are text ("evt_…"/"sub_…") and
-- cannot be stored in a uuid column, so a replayed event is a no-op at the
-- receipt, before any ledger write happens.
--
-- No CHECK constraints on reason/tier/status, same convention as 0008: invalid
-- values are neutralized at read time rather than rejected at write time.

CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts" ("id") ON DELETE CASCADE,
  "ref_id" uuid,
  "reason" text NOT NULL,
  "attempt" integer,
  "amount_cr" numeric NOT NULL,
  "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_account_created_idx" ON "credit_ledger" ("account_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_ref_reason_attempt_uidx" ON "credit_ledger" ("ref_id", "reason", "attempt") WHERE "ref_id" IS NOT NULL AND "attempt" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "account_id" uuid PRIMARY KEY REFERENCES "accounts" ("id") ON DELETE CASCADE,
  "tier" text NOT NULL DEFAULT 'trial',
  "creem_subscription_id" text,
  "status" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_creem_subscription_id_uidx" ON "subscriptions" ("creem_subscription_id") WHERE "creem_subscription_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_receipts" (
  "event_id" text PRIMARY KEY,
  "type" text NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "payload_hash" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_receipts_received_at_idx" ON "webhook_receipts" ("received_at");
