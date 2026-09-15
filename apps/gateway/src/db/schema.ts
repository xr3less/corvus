import {
  customType,
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

// Drizzle has no built-in bytea column, so map it explicitly. The SQL text
// emitted is `bytea`, matching drizzle/0001_init.sql and SPEC section 4.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// Bots table — SPEC section 4 + 06_data_model.md section 2, verbatim.
// - `name` length (<=32, Discord limit) is app-enforced, not a DB CHECK.
// - `status` is one of draft|staging|live|sleeping|quarantined (app-enforced).
// - `prod_spec_id` / `draft_spec_id` are opaque pointers into packages/spec;
//   no FK is declared here (spec versions live outside Postgres in V1-8).
export const bots = pgTable(
  'bots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    tokenCipher: bytea('token_cipher').notNull(),
    prodSpecId: uuid('prod_spec_id'),
    draftSpecId: uuid('draft_spec_id'),
    status: text('status').notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('bots_account_id_idx').on(t.accountId)],
);

export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;

// Per-member persistent state — survives restarts. Every mutation is written
// transactionally by the store layer (no write-behind cache in V1-8).
export const userRecords = pgTable(
  'user_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id),
    guildId: text('guild_id').notNull(),
    memberId: text('member_id').notNull(),
    xp: integer('xp').default(0).notNull(),
    warnings: jsonb('warnings').$type<unknown[]>().default([]).notNull(),
    balance: numeric('balance').default('0').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('user_records_bot_guild_member_unique').on(t.botId, t.guildId, t.memberId),
    index('user_records_bot_id_idx').on(t.botId),
  ],
);

export type UserRecord = typeof userRecords.$inferSelect;
export type NewUserRecord = typeof userRecords.$inferInsert;
