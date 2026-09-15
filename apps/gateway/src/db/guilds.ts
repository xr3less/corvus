import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { bots } from './schema.js';

// Guild installs — SPEC section 4 (V1-4), verbatim.
// - One row per bot-per-guild; upserted by T-worker after each pre-flight scan
//   (INSERT … ON CONFLICT (bot_id, guild_id) DO UPDATE preflight only).
// - `preflight` holds the latest scan envelope { scannedAt, rows, summary };
//   NULL until the first scan runs (no scan yet on install).
// - UNIQUE(bot_id, guild_id): a bot is installed in a guild at most once.
// - ON DELETE CASCADE: deleting a bot wipes its install rows.
// - Index on bot_id serves per-bot install lookup.
export const guildInstalls = pgTable(
  'guild_installs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
    guildId: text('guild_id').notNull(),
    preflight: jsonb('preflight').$type<unknown>(),
    joinedAt: timestamp('joined_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('guild_installs_bot_guild_unique').on(t.botId, t.guildId),
    index('guild_installs_bot_id_idx').on(t.botId),
  ],
);

export type GuildInstall = typeof guildInstalls.$inferSelect;
export type NewGuildInstall = typeof guildInstalls.$inferInsert;
