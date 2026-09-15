-- V1-7 builder runs: async builder-run progress (forward-only; never edit 0001-0006).
-- Must match apps/gateway/src/db/builder-runs.ts column-for-column.
-- keyed by its own id, no FK by design (same convention as interview_progress):
-- a run row must not couple to the bot row's lifecycle.
-- `phase` is the honest state machine (queued|generating|syncing|live|failed)
-- the progress UI polls; `detail` defaults to an empty JSON object.

CREATE TABLE IF NOT EXISTS "builder_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bot_id" uuid NOT NULL,
  "phase" text NOT NULL DEFAULT 'queued',
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "builder_runs_bot_id_idx" ON "builder_runs" ("bot_id");
