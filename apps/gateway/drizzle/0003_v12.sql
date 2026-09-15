-- V1-2 durable: oauth_states + interview_progress + ai_spend (forward-only; never edit 0001/0002).
-- Must match apps/gateway/src/db/v12.ts column-for-column (SPEC section 4 + ADDENDUM 2026-09-09).
-- interview_progress is keyed by interview (bot) id per the orchestrator-locked correction
-- (SPEC names shapes not keys): one account may hold concurrent interviews, and the row
-- carries no FK so progress writes never couple to the bot row lifecycle.

CREATE TABLE IF NOT EXISTS "oauth_states" (
  "state" text PRIMARY KEY,
  "code_verifier" text NOT NULL,
  "return_to" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_expires_at_idx" ON "oauth_states" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_progress" (
  "interview_id" uuid PRIMARY KEY,
  "payload" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_progress_expires_at_idx" ON "interview_progress" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts" ("id") ON DELETE CASCADE,
  "model" text NOT NULL,
  "usd_cost" numeric,
  "credits" numeric,
  "reason" text NOT NULL,
  "ref_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_spend_account_created_idx" ON "ai_spend" ("account_id", "created_at");
