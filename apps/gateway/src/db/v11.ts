import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bots } from './schema.js';

// Accounts table — SPEC section 4 (V1-1), verbatim.
// - One row per Discord user (upserted by T-oauth on callback, keyed by
//   discord_id); bots.account_id points at accounts.id.
// - `credits` is a ledger balance in app units (numeric, never float).
// - `creem_id` is the Creem customer id; NULL until billing (Phase 4).
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  email: text('email'),
  creemId: text('creem_id'),
  credits: numeric('credits').default('0').notNull(),
  // Plan tier for the monthly grant (KI-025); 'trial' default keeps old INSERTs working.
  tier: text('tier').default('trial').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

// Server-side sessions — SPEC section 4 (V1-1), verbatim.
// - Session id is the opaque value behind the `corvus_session` cookie;
//   no tokens are stored in V1-1 (bot TOKEN fields stay NULL).
// - Rolling 30-day expiry is app-enforced by T-oauth (touch expires_at
//   when >50% of TTL is consumed); rows are deleted on logout.
// - ON DELETE CASCADE: deleting an account wipes its sessions.
// - Index on expires_at serves the expiry sweep; index on account_id
//   serves per-account session lookup/revocation.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sessions_account_id_idx').on(t.accountId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Versioned draft specs — SPEC section 4 (V1-1), verbatim.
// - Minted by T-interview on interview completion (version=1, state=draft);
//   bots.draft_spec_id points at the minted row.
// - `spec` is the createDraft-shaped envelope (answers recorded as opaque
//   behaviors entries); `state` is app-enforced (draft in V1-1).
// - UNIQUE(bot_id, version): versions are a per-bot sequence, never global.
// - ON DELETE CASCADE: deleting a bot wipes its spec history.
export const specVersions = pgTable(
  'spec_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    spec: jsonb('spec').$type<unknown>().notNull(),
    diffSummary: text('diff_summary').default('').notNull(),
    author: text('author').notNull(),
    state: text('state').default('draft').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('spec_versions_bot_id_version_unique').on(t.botId, t.version)],
);

export type SpecVersion = typeof specVersions.$inferSelect;
export type NewSpecVersion = typeof specVersions.$inferInsert;

// ---------------------------------------------------------------------------
// Billing foundation (0011) — credit_ledger + subscriptions +
// webhook_receipts. Drizzle is the TYPE CATALOG only (06_data_model.md §1);
// runtime stays a raw `pg` Pool and migrations stay hand-written SQL, so these
// definitions must match drizzle/0011_credit_ledger_subscriptions.sql
// column-for-column (KI-025 convention, enforced by 0011-billing.test.ts).
// ---------------------------------------------------------------------------

// Append-only credit ledger — the money meter. Never UPDATEd, never DELETEd.
// - `amount_cr` is SIGNED in credits (numeric, never float): positive for a
//   grant/refill/sale, negative for a burn. No default — every writer states
//   the sign explicitly; a silent 0 would be a lie about a money movement.
// - `reason` is the closed vocabulary (trial_grant | monthly_grant | refill |
//   burn:builder | burn:persona | sale:template | fee), app-enforced — no CHECK
//   constraint, same convention as accounts.tier (0008).
// - `ref_id` links back to what produced the row (run id / message batch /
//   order); nullable, and deliberately WITHOUT an FK so a ledger row survives
//   whatever it points at — money history must outlive its subject.
// - `attempt` is the run-global billable attempt number (KI-026 shape); NULL
//   for grants, refills and webhook-driven rows.
// - `meta` carries the opaque provider payload (Creem event bits, model id);
//   defaults to an empty object so a writer may omit it.
// - ON DELETE CASCADE: deleting an account wipes its money history (same
//   convention as ai_spend).
// - The partial unique index on (ref_id, reason, attempt) WHERE both are NOT
//   NULL makes a double-counted attempt an idempotent no-op instead of a
//   second credit movement (0009 mirror).
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    refId: uuid('ref_id'),
    reason: text('reason').notNull(),
    attempt: integer('attempt'),
    amountCr: numeric('amount_cr').notNull(),
    meta: jsonb('meta').$type<unknown>().notNull().default({}),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('credit_ledger_account_created_idx').on(t.accountId, t.createdAt),
    uniqueIndex('credit_ledger_ref_reason_attempt_uidx')
      .on(t.refId, t.reason, t.attempt)
      .where(sql`${t.refId} IS NOT NULL AND ${t.attempt} IS NOT NULL`),
  ],
);

export type CreditLedger = typeof creditLedger.$inferSelect;
export type NewCreditLedger = typeof creditLedger.$inferInsert;

// One subscription row per account, keyed by account_id (06_model §3:
// accounts 1—1 subscriptions). Written ONLY by the Creem webhook path.
// - `tier` mirrors the plan the provider last confirmed (trial | pro | studio),
//   default 'trial' so a row created before a plan is known is not a claim of
//   payment. accounts.tier stays the reader-facing column; this one records
//   what the provider said.
// - `creem_subscription_id` is nullable until a subscription event arrives.
// - `status` is the provider vocabulary (trialing | active | past_due | paused
//   | canceled), app-enforced, no CHECK (0008 convention).
// - The partial unique index on creem_subscription_id keeps one Creem
//   subscription from being attached to two accounts.
// - ON DELETE CASCADE: deleting an account deletes its subscription row.
export const subscriptions = pgTable(
  'subscriptions',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tier: text('tier').default('trial').notNull(),
    creemSubscriptionId: text('creem_subscription_id'),
    status: text('status').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('subscriptions_creem_subscription_id_uidx')
      .on(t.creemSubscriptionId)
      .where(sql`${t.creemSubscriptionId} IS NOT NULL`),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

// Replay ledger for provider webhooks. The row is INSERTed FIRST, before any
// ledger or tier write: a duplicate event_id is a primary-key conflict, so a
// provider retry becomes a no-op instead of a double credit.
// - `event_id` is the provider's event id, TEXT on purpose — Creem ids are
//   strings ("evt_…"), not uuid, and the PK is the replay guard.
// - `payload_hash` is the hash of the raw request body as received (never the
//   re-serialized JSON — byte order is what was signed); it is what lets a
//   later audit prove which bytes this decision was made on.
// - `type` is the provider event type as delivered.
// - INBOUND, so deliberately NO FK to accounts: a receipt must be recordable
//   even when the event names no account we know.
// - `received_at` is our clock, not the provider's.
export const webhookReceipts = pgTable(
  'webhook_receipts',
  {
    eventId: text('event_id').primaryKey(),
    type: text('type').notNull(),
    receivedAt: timestamp('received_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    payloadHash: text('payload_hash').notNull(),
  },
  (t) => [index('webhook_receipts_received_at_idx').on(t.receivedAt)],
);

export type WebhookReceipt = typeof webhookReceipts.$inferSelect;
export type NewWebhookReceipt = typeof webhookReceipts.$inferInsert;
