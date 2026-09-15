-- V1-8 foundation: bots + user_records (forward-only; never edit after ship).
-- Must match apps/gateway/src/db/schema.ts column-for-column (SPEC section 4).

CREATE TABLE IF NOT EXISTS "bots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "name" text NOT NULL,
  "token_cipher" bytea NOT NULL,
  "prod_spec_id" uuid,
  "draft_spec_id" uuid,
  "status" text NOT NULL,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bots_account_id_idx" ON "bots" ("account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bot_id" uuid NOT NULL REFERENCES "bots" ("id"),
  "guild_id" text NOT NULL,
  "member_id" text NOT NULL,
  "xp" integer NOT NULL DEFAULT 0,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "balance" numeric NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_records_bot_guild_member_unique"
    UNIQUE ("bot_id", "guild_id", "member_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_records_bot_id_idx" ON "user_records" ("bot_id");
