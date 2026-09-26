-- Wave 3: builder-run checkpoint markers (forward-only; never edit earlier migrations).
--
-- The checkpoint payload itself lives in builder_runs.detail jsonb under additive
-- keys (briefChars, attempt, stepStartedAt, lastGoodPhase, checkpointBrief, error,
-- provider); see apps/web/lib/builder/checkpoints.ts, the SOLE OWNER of that
-- shape. This file adds two nullable helper columns so the resume route can order
-- candidates and cap retries without scanning jsonb: `attempt` mirrors the jsonb
-- attempt counter for a cheap resume ceiling, and `checkpoint_at` marks when the
-- last checkpoint snapshot was written. The jsonb keys remain the source of truth;
-- these columns are lookup aids only.
--
-- No backfill, no UPDATE of any kind: existing rows keep NULLs and every reader
-- tolerates missing keys, so this applies without a rewrite lock on builder_runs.
--> statement-breakpoint
ALTER TABLE IF EXISTS "builder_runs" ADD COLUMN IF NOT EXISTS "attempt" integer;
--> statement-breakpoint
ALTER TABLE IF EXISTS "builder_runs" ADD COLUMN IF NOT EXISTS "checkpoint_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "builder_runs_checkpoint_idx" ON "builder_runs" ("bot_id", "checkpoint_at");
