-- V1-3 audit trail: audit_events (forward-only; never edit 0001-0005).
-- Must match apps/gateway/src/db/audit-events.ts column-for-column
-- (06_data_model.md section 2).
-- Append-only: rows are INSERTed by the V1-3b publish/rollback routes and are
-- never updated or deleted. account_id / bot_id are nullable for system events
-- and carry no FK, so an audit row outlives the account/bot it describes.

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid,
  "bot_id" uuid,
  "actor" text NOT NULL,
  "action" text NOT NULL,
  "detail" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_bot_id_idx" ON "audit_events" ("bot_id");
