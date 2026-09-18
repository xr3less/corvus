import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
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
