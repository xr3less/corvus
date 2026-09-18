import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './v11.js';

// Durable OAuth state — SPEC section 4 (V1-2), verbatim.
// - Replaces the single-process memory state store (KI-002): one row per
//   minted `state`, consumed exactly once via an atomic single-use
//   DELETE ... WHERE state=$1 AND expires_at>now() RETURNING ....
// - `code_verifier` is NOT NULL for the future PKCE bind; in V1-2 it carries
//   an unguessable random placeholder (never sent anywhere) because the
//   Discord code exchange is not PKCE-bound yet.
// - `return_to` is the post-login redirect target; NULL means the default.
// - TTL 10 minutes from mint; the expiry index serves the sweep
//   (DELETE WHERE expires_at<now()).
export const oauthStates = pgTable(
  'oauth_states',
  {
    state: text('state').primaryKey(),
    codeVerifier: text('code_verifier').notNull(),
    returnTo: text('return_to'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (t) => [index('oauth_states_expires_at_idx').on(t.expiresAt)],
);

export type OAuthState = typeof oauthStates.$inferSelect;
export type NewOAuthState = typeof oauthStates.$inferInsert;

// Durable interview progress — SPEC section 4 (V1-2) with the
// orchestrator-locked key correction: keyed by interview (bot) id, NOT by
// account id, so two concurrent interviews for one account never clobber
// each other. No FK to bots: the row is written per answered step and the
// bot row lifecycle must never block on (or be blocked by) progress writes.
// - `payload` is `{ answers: RecordedAnswer[] }` (opaque entries, V1-1 shape).
// - Upserted per answered step with a rolling ~24h expiry; deleted on
//   done-mint and on interview reset. Stale rows are inert: the done path
//   keeps its UNIQUE(bot_id, version) backstop regardless.
// - Index on expires_at serves the expiry sweep.
export const interviewProgress = pgTable(
  'interview_progress',
  {
    interviewId: uuid('interview_id').primaryKey(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (t) => [index('interview_progress_expires_at_idx').on(t.expiresAt)],
);

export type InterviewProgress = typeof interviewProgress.$inferSelect;
export type NewInterviewProgress = typeof interviewProgress.$inferInsert;

// Append-only AI spend ledger — SPEC section 4 ADDENDUM 2026-09-09.
// - Written by T-router on every billable call: provider-reported `totalcost`
//   (NEVER the fixed per-run table — D-032), plus the model id.
// - NULL cost means the provider reported none — never silently zero it;
//   readers treat NULL as unknown, not free.
// - `ref_id` links back to the artifact the spend produced (nullable, no FK
//   — spend rows must survive whatever they point at).
// - ON DELETE CASCADE: deleting an account wipes its spend history.
// - Index on (account_id, created_at) serves the K1/K3 readers' median-over-
//   30-builds aggregation.
// - `attempt` is the run-global billable attempt number (KI-026, nullable, no
//   default — chat rows carry NULL). The partial unique index on
//   (ref_id, reason, attempt) WHERE both are NOT NULL makes a double-billed
//   attempt an idempotent no-op instead of a second charge.
export const aiSpend = pgTable(
  'ai_spend',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    usdCost: numeric('usd_cost'),
    credits: numeric('credits'),
    reason: text('reason').notNull(),
    refId: uuid('ref_id'),
    attempt: integer('attempt'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ai_spend_account_created_idx').on(t.accountId, t.createdAt)],
);

export type AiSpend = typeof aiSpend.$inferSelect;
export type NewAiSpend = typeof aiSpend.$inferInsert;
