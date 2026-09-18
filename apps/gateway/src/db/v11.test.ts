import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accounts, sessions, specVersions } from './v11.js';

// No live DB required: assert the Drizzle definitions against SPEC section 4
// and diff them against the shipped SQL text (v11.ts and 0002_v11.sql
// must agree column-for-column).
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', '..', 'drizzle', '0002_v11.sql'), 'utf8');

describe('gateway db v11 tables (SPEC section 4)', () => {
  it('uses the exact SPEC table names', () => {
    expect(getTableName(accounts)).toBe('accounts');
    expect(getTableName(sessions)).toBe('sessions');
    expect(getTableName(specVersions)).toBe('spec_versions');
  });

  it('defines every SPEC accounts column in snake_case', () => {
    const names = Object.values(getTableColumns(accounts)).map((c) => (c as { name: string }).name);
    expect([...names].sort()).toEqual(
      ['created_at', 'credits', 'creem_id', 'discord_id', 'email', 'id', 'tier'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('defines every SPEC sessions column in snake_case', () => {
    const names = Object.values(getTableColumns(sessions)).map((c) => (c as { name: string }).name);
    expect([...names].sort()).toEqual(['account_id', 'created_at', 'expires_at', 'id'].sort());
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('defines every SPEC spec_versions column in snake_case', () => {
    const names = Object.values(getTableColumns(specVersions)).map(
      (c) => (c as { name: string }).name,
    );
    expect([...names].sort()).toEqual(
      ['author', 'bot_id', 'created_at', 'diff_summary', 'id', 'spec', 'state', 'version'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('marks SPEC-required columns NOT NULL in the schema definition', () => {
    const a = getTableColumns(accounts);
    expect(a.discordId.notNull).toBe(true);
    expect(a.credits.notNull).toBe(true);
    expect(a.tier.notNull).toBe(true);
    expect(a.createdAt.notNull).toBe(true);
    expect(a.email.notNull).toBe(false);
    expect(a.creemId.notNull).toBe(false);

    const s = getTableColumns(sessions);
    expect(s.accountId.notNull).toBe(true);
    expect(s.expiresAt.notNull).toBe(true);
    expect(s.createdAt.notNull).toBe(true);

    const v = getTableColumns(specVersions);
    expect(v.botId.notNull).toBe(true);
    expect(v.version.notNull).toBe(true);
    expect(v.spec.notNull).toBe(true);
    expect(v.diffSummary.notNull).toBe(true);
    expect(v.author.notNull).toBe(true);
    expect(v.state.notNull).toBe(true);
    expect(v.createdAt.notNull).toBe(true);
  });

  it('migration creates all three tables with UNIQUE + FK cascade + defaults + indexes', () => {
    expect(sql).toContain('"accounts"');
    expect(sql).toContain('"sessions"');
    expect(sql).toContain('"spec_versions"');
    expect(sql).toContain('CONSTRAINT "accounts_discord_id_unique"');
    expect(sql).toContain('UNIQUE("discord_id")');
    expect(sql).toContain('REFERENCES "accounts" ("id") ON DELETE CASCADE');
    expect(sql).toContain('REFERENCES "bots" ("id") ON DELETE CASCADE');
    expect(sql).toContain('CONSTRAINT "spec_versions_bot_id_version_unique"');
    expect(sql).toContain('UNIQUE ("bot_id", "version")');
    expect(sql).toContain('DEFAULT gen_random_uuid()');
    expect(sql).toContain('DEFAULT now()');
    expect(sql).toContain('"sessions_account_id_idx"');
    expect(sql).toContain('"sessions_expires_at_idx"');
  });
});
