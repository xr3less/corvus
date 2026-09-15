-- V1-4 preflight: guild_installs (forward-only; never edit 0001-0004).
-- Must match apps/gateway/src/db/guilds.ts column-for-column (SPEC section 4).

CREATE TABLE IF NOT EXISTS "guild_installs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bot_id" uuid NOT NULL REFERENCES "bots" ("id") ON DELETE CASCADE,
  "guild_id" text NOT NULL,
  "preflight" jsonb,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "guild_installs_bot_guild_unique" UNIQUE("bot_id", "guild_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guild_installs_bot_id_idx" ON "guild_installs" ("bot_id");
