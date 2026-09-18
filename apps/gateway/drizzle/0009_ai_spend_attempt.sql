-- KI-026 ledger unique backstop: nullable attempt + partial unique index (forward-only; never edit 0001-0008).
-- Must match apps/gateway/src/db/v12.ts (aiSpend.attempt) — nullable so every
-- existing INSERT without `attempt` keeps working (chat spend rows carry NULL).
-- Partial index covers only builder ledger rows (ref_id + attempt NOT NULL);
-- chat rows (attempt NULL) are untouched by construction.
ALTER TABLE "ai_spend" ADD COLUMN IF NOT EXISTS "attempt" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_spend_ref_reason_attempt_uidx" ON "ai_spend" ("ref_id", "reason", "attempt") WHERE "ref_id" IS NOT NULL AND "attempt" IS NOT NULL;
