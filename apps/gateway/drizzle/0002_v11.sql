-- V1-1 connect: accounts + sessions + spec_versions (forward-only; never edit 0001).
-- Must match apps/gateway/src/db/v11.ts column-for-column (SPEC section 4).

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "discord_id" text NOT NULL,
  "email" text,
  "creem_id" text,
  "credits" numeric NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "accounts_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts" ("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_account_id_idx" ON "sessions" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spec_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bot_id" uuid NOT NULL REFERENCES "bots" ("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "spec" jsonb NOT NULL,
  "diff_summary" text NOT NULL DEFAULT '',
  "author" text NOT NULL,
  "state" text NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spec_versions_bot_id_version_unique" UNIQUE ("bot_id", "version")
);
