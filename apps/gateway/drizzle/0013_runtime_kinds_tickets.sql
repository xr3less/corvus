-- Wave E1: widen bot_runtime_config kind CHECK 6→8 (forward-only; never edit 0001-0012).
-- Adds 'tickets' + 'reaction-roles' to the closed kind vocabulary alongside the
-- existing six (welcome, moderation, xp, giveaway, connector, status). Mirrors
-- RUNTIME_KINDS in apps/gateway/src/runtime/config.ts and the botRuntimeConfig
-- catalog block in apps/gateway/src/db/schema.ts (KI-025 convention).
--
-- No seed rows, no backfills, no UPDATE of any kind: existing rows are
-- unaffected (their kind values remain members of the widened set), so running
-- this file only relaxes the fence. Re-running is a no-op in effect
-- (DROP IF EXISTS + ADD is idempotent).
--> statement-breakpoint
ALTER TABLE IF EXISTS "bot_runtime_config" DROP CONSTRAINT IF EXISTS "bot_runtime_config_kind_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "bot_runtime_config" ADD CONSTRAINT "bot_runtime_config_kind_check" CHECK ("kind" IN ('welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status', 'tickets', 'reaction-roles'));
