-- Wave 1: conversation persistence (server-side threads; chat survives refresh).
--
-- Forward-only; never edit earlier migrations. Additive new tables only — no
-- ALTER of any existing table (in particular builder_runs is untouched), no
-- backfill, no UPDATE of any kind, so this applies without rewrite locks.
--
-- Shape: `conversations` owns one thread (optional bot link, owner account);
-- `conversation_turns` is append-only (INSERT + SELECT only, never UPDATE or
-- DELETE by the app). Readers order turns by (created_at, id) and cap reads
-- at 50 ending at the last user row in the route layer. Soft-deleted bots are
-- excluded at query time (deleted_at IS NULL); no coupling beyond nullable
-- bot_id.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "bot_id" uuid,
  "title" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL,
  "role" text NOT NULL,
  "text" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_account_idx" ON "conversations" ("account_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_bot_idx" ON "conversations" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_turns_order_idx" ON "conversation_turns" ("conversation_id", "created_at", "id");
