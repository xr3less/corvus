-- V1-6 gallery: templates (forward-only; never edit 0001/0002/0003).
-- Must match apps/gateway/src/db/v13.ts column-for-column (SPEC section 4).
-- TABLE ONLY: row content lives in src/db/seed-templates.ts and is applied
-- via `npm run seed` (INSERT ... ON CONFLICT (slug) DO UPDATE), so content
-- iterates migration-free — no row data in SQL, ever.

CREATE TABLE IF NOT EXISTS "templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_spec" jsonb NOT NULL,
  "semver" text NOT NULL DEFAULT '1.0.0',
  "perms_needed" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "forks" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_category_idx" ON "templates" ("category");
