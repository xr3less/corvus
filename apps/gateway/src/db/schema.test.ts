import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { bots, userRecords } from './schema.js';

// No live DB required: assert the Drizzle definitions against SPEC section 4
// and diff them against the shipped SQL text (schema.ts and 0001_init.sql
// must agree column-for-column).
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', '..', 'drizzle', '0001_init.sql'), 'utf8');

describe('gateway db schema (SPEC section 4)', () => {
  it('uses the exact SPEC table names', () => {
    expect(getTableName(bots)).toBe('bots');
    expect(getTableName(userRecords)).toBe('user_records');
  });

  it('defines every SPEC bots column in snake_case', () => {
    const names = Object.values(getTableColumns(bots)).map((c) => (c as { name: string }).name);
    expect([...names].sort()).toEqual(
      [
        'account_id',
        'created_at',
        'deleted_at',
        'draft_spec_id',
        'id',
        'name',
        'prod_spec_id',
        'status',
        'token_cipher',
        'updated_at',
      ].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('defines every SPEC user_records column in snake_case', () => {
    const names = Object.values(getTableColumns(userRecords)).map(
      (c) => (c as { name: string }).name,
    );
    expect([...names].sort()).toEqual(
      ['balance', 'bot_id', 'guild_id', 'id', 'member_id', 'updated_at', 'warnings', 'xp'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('marks SPEC-required columns NOT NULL in the schema definition', () => {
    const b = getTableColumns(bots);
    expect(b.accountId.notNull).toBe(true);
    expect(b.name.notNull).toBe(true);
    expect(b.tokenCipher.notNull).toBe(true);
    expect(b.status.notNull).toBe(true);
    expect(b.createdAt.notNull).toBe(true);
    expect(b.updatedAt.notNull).toBe(true);
    expect(b.prodSpecId.notNull).toBe(false);
    expect(b.draftSpecId.notNull).toBe(false);
    expect(b.deletedAt.notNull).toBe(false);

    const u = getTableColumns(userRecords);
    expect(u.botId.notNull).toBe(true);
    expect(u.guildId.notNull).toBe(true);
    expect(u.memberId.notNull).toBe(true);
    expect(u.xp.notNull).toBe(true);
    expect(u.warnings.notNull).toBe(true);
    expect(u.balance.notNull).toBe(true);
    expect(u.updatedAt.notNull).toBe(true);
  });

  it('migration creates both tables with UNIQUE + FK + defaults + indexes', () => {
    expect(sql).toContain('"bots"');
    expect(sql).toContain('"user_records"');
    expect(sql).toContain('"token_cipher" bytea NOT NULL');
    expect(sql).toContain('REFERENCES "bots" ("id")');
    expect(sql).toContain('CONSTRAINT "user_records_bot_guild_member_unique"');
    expect(sql).toContain('UNIQUE ("bot_id", "guild_id", "member_id")');
    expect(sql).toContain('DEFAULT gen_random_uuid()');
    expect(sql).toContain('DEFAULT now()');
    expect(sql).toContain("DEFAULT '[]'::jsonb");
    expect(sql).toContain('"bots_account_id_idx"');
    expect(sql).toContain('"user_records_bot_id_idx"');
  });
});
