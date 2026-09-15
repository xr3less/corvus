import { readFileSync } from 'node:fs';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { guildInstalls } from './guilds.js';

// No-DB contract tests: the Drizzle table must agree with SPEC section 4 and
// with drizzle/0005_guilds.sql column-for-column. No live database required.
const sqlText = readFileSync(new URL('../../drizzle/0005_guilds.sql', import.meta.url), 'utf8');

describe('guild_installs contract', () => {
  it('maps to the guild_installs table', () => {
    expect(getTableName(guildInstalls)).toBe('guild_installs');
  });

  it('declares the SPEC columns with exact DB names', () => {
    const columns = getTableColumns(guildInstalls);
    const dbNames = Object.values(columns)
      .map((c) => c.name)
      .sort();
    expect(dbNames).toEqual(['bot_id', 'guild_id', 'id', 'joined_at', 'preflight']);
  });

  it('marks install keys NOT NULL and preflight nullable', () => {
    const columns = getTableColumns(guildInstalls);
    expect(columns.botId.notNull).toBe(true);
    expect(columns.guildId.notNull).toBe(true);
    expect(columns.joinedAt.notNull).toBe(true);
    expect(columns.preflight.notNull).toBe(false);
  });

  it('migration carries the UNIQUE + FK cascade + defaults + index', () => {
    expect(sqlText).toContain('CONSTRAINT "guild_installs_bot_guild_unique"');
    expect(sqlText).toContain('UNIQUE("bot_id", "guild_id")');
    expect(sqlText).toContain('REFERENCES "bots" ("id") ON DELETE CASCADE');
    expect(sqlText).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sqlText).toContain('"joined_at" timestamptz NOT NULL DEFAULT now()');
    expect(sqlText).toContain('"preflight" jsonb');
    expect(sqlText).toContain('CREATE INDEX IF NOT EXISTS "guild_installs_bot_id_idx"');
    expect(sqlText).toContain('--> statement-breakpoint');
  });
});
