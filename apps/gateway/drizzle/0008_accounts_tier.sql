-- V1-8 accounts tier: plan tier for the monthly grant (forward-only; never edit 0001-0007).
-- Must match apps/gateway/src/db/v11.ts column-for-column (KI-025).
-- Plain text column, NO CHECK constraint: invalid values are neutralized at read
-- time by isPlanTier -> trial fallback in tier-resolver.ts. DEFAULT 'trial'
-- (NOT NULL) so every existing INSERT without tier keeps working.

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "tier" text NOT NULL DEFAULT 'trial';
--> statement-breakpoint
