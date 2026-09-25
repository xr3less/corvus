import { sql } from 'drizzle-orm';
import {
  check,
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

// ---------------------------------------------------------------------------
// Site-engine bridge A2 (0012) — bot_runtime_config. Drizzle is the TYPE
// CATALOG only (06_data_model.md §1); runtime stays a raw `pg` Pool and
// migrations stay hand-written SQL, so this definition must match
// drizzle/0012_bot_runtime_config.sql column-for-column (KI-025 convention).
// ---------------------------------------------------------------------------

// Durable home for translator output: one row per (bot, guild-or-global, kind).
// - `guild_id` NULL means bot-global default; per-guild rows override it at
//   read time. The unique constraint is NULLS NOT DISTINCT so two NULL
//   guild_ids count as equal: re-publishing a bot-global row upserts
//   (ON CONFLICT (bot_id, guild_id, kind)) instead of duplicating. Nullable
//   on purpose, matching the SPEC.
// - `kind` is the closed vocabulary (welcome | moderation | xp | giveaway |
//   connector | status | tickets | reaction-roles), rejected at write time — unlike accounts.tier or
//   credit_ledger.reason (0008/0011 convention), where invalid values are
//   neutralized at read time, because an unknown behavior kind must never
//   reach the runtime path silently: the translator degrades Yellow on skip
//   (SPEC §1) and the CHECK is the second fence.
// - `params` is the per-kind DATA payload (never code — TRIGGER-SANDBOX-1);
//   defaults to an empty object so a writer may omit it.
// - `spec_version` records which published spec_version produced the row.
// - No FK on bot_id: prod_spec pointers are opaque and a config row must
//   outlive whatever it points at (same reasoning as credit_ledger.ref_id).
// - No seed rows: trial JSON state is NOT migrated (trial guild re-earns it).
export const botRuntimeConfig = pgTable(
  'bot_runtime_config',
  {
    botId: uuid('bot_id').notNull(),
    guildId: text('guild_id'),
    kind: text('kind').notNull(),
    params: jsonb('params').$type<unknown>().notNull().default({}),
    specVersion: integer('spec_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      'bot_runtime_config_kind_check',
      sql`${t.kind} IN ('welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status', 'tickets', 'reaction-roles')`,
    ),
    unique('bot_runtime_config_bot_guild_kind_unique')
      .on(t.botId, t.guildId, t.kind)
      .nullsNotDistinct(),
    index('bot_runtime_config_bot_id_idx').on(t.botId),
  ],
);

export type BotRuntimeConfig = typeof botRuntimeConfig.$inferSelect;
export type NewBotRuntimeConfig = typeof botRuntimeConfig.$inferInsert;
