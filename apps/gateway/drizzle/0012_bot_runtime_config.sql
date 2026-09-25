-- Site-engine bridge A2: bot_runtime_config (forward-only; never edit 0001-0011).
-- Durable home for translator output: one row per (bot, guild-or-global, kind).
-- Must match apps/gateway/src/db/schema.ts (botRuntimeConfig) column-for-column
-- (KI-025 convention).
--
-- guild_id NULL means bot-global default; per-guild rows override it at read
-- time. The UNIQUE NULLS NOT DISTINCT constraint treats two NULL guild_ids as
-- equal, so re-publishing a bot-global row upserts instead of duplicating. A
-- plain UNIQUE would NOT conflict on NULL = NULL and would allow duplicate
-- globals. ON CONFLICT (bot_id, guild_id, kind) infers this index as arbiter
-- (column-list inference matches any unique index covering exactly those
-- columns, NULLS NOT DISTINCT included, on Postgres 15+).
--
-- No seed rows: trial JSON state is NOT migrated (trial guild re-earns it).
-- No rollback migration (forward-only convention).
--
-- Re-run safety: CREATE TABLE / CREATE INDEX are IF NOT EXISTS, so a second
-- run is a no-op (0008/0009/0011 pattern).

CREATE TABLE IF NOT EXISTS "bot_runtime_config" (
  "bot_id" uuid NOT NULL,
  "guild_id" text,
  "kind" text NOT NULL,
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "spec_version" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bot_runtime_config_kind_check"
    CHECK ("kind" IN ('welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status')),
  CONSTRAINT "bot_runtime_config_bot_guild_kind_unique"
    UNIQUE NULLS NOT DISTINCT ("bot_id", "guild_id", "kind")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_runtime_config_bot_id_idx" ON "bot_runtime_config" ("bot_id");
