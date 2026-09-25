// Hermetic tests for the temp-ban scheduler (apps/testbot/src/moderation/tempbans.ts).
//
// No network, no token, no discord.js gateway connection. File round-trips
// run against os.tmpdir() (never apps/testbot/data); the poll tick is tested
// with a stub client shaped like the two members it uses
// (guilds.fetch -> guild.members.unban).

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import {
  extractDue,
  loadDue,
  loadEntries,
  pollTempbans,
  removeTempban,
  saveEntries,
  scheduleTempban,
  startTempbanPoll,
  TEMPBAN_POLL_MS,
} from './tempbans.js';
import type { TempbanEntry } from './tempbans.js';

function freshPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'testbot-tempbans-')), 'tempbans.json');
}

const ENTRY_A: TempbanEntry = {
  guildId: 'g1',
  userId: 'u1',
  unbanAt: new Date(Date.now() + 86_400_000).toISOString(),
  reason: 'Trial automod: invite (strike 5, ban 1d)',
};

describe('extractDue', () => {
  it('returns rows with unbanAt at or before now', () => {
    const now = Date.now();
    const due: TempbanEntry = { ...ENTRY_A, unbanAt: new Date(now).toISOString() };
    const past: TempbanEntry = {
      ...ENTRY_A,
      userId: 'u2',
      unbanAt: new Date(now - 1000).toISOString(),
    };
    const future: TempbanEntry = {
      ...ENTRY_A,
      userId: 'u3',
      unbanAt: new Date(now + 60_000).toISOString(),
    };
    const out = extractDue([due, past, future], now);
    expect(out.map((e) => e.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('never fires rows with unparseable dates', () => {
    const bad: TempbanEntry = { ...ENTRY_A, unbanAt: 'not-a-date' };
    expect(extractDue([bad])).toEqual([]);
  });
});

describe('scheduleTempban + removeTempban round-trip', () => {
  it('persists and reloads one entry', () => {
    const path = freshPath();
    scheduleTempban(ENTRY_A, path);
    expect(loadEntries(path)).toEqual([ENTRY_A]);
  });

  it('dedupes by guildId+userId: re-scheduling replaces the existing row', () => {
    const path = freshPath();
    scheduleTempban(ENTRY_A, path);
    const updated: TempbanEntry = {
      ...ENTRY_A,
      unbanAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    };
    scheduleTempban(updated, path);
    const rows = loadEntries(path);
    expect(rows).toHaveLength(1);
    expect(rows[0].unbanAt).toBe(updated.unbanAt);
  });

  it('keeps rows for other users/guilds', () => {
    const path = freshPath();
    scheduleTempban(ENTRY_A, path);
    scheduleTempban({ ...ENTRY_A, userId: 'u2' }, path);
    expect(loadEntries(path)).toHaveLength(2);
  });

  it('removeTempban drops only the matching row', () => {
    const path = freshPath();
    scheduleTempban(ENTRY_A, path);
    scheduleTempban({ ...ENTRY_A, userId: 'u2' }, path);
    removeTempban('g1', 'u1', path);
    expect(loadEntries(path).map((e) => e.userId)).toEqual(['u2']);
  });

  it('missing file loads as empty; loadDue filters file rows', () => {
    const path = freshPath();
    expect(loadEntries(path)).toEqual([]);
    scheduleTempban({ ...ENTRY_A, unbanAt: new Date(Date.now() - 1000).toISOString() }, path);
    scheduleTempban(
      { ...ENTRY_A, userId: 'u9', unbanAt: new Date(Date.now() + 60_000).toISOString() },
      path,
    );
    expect(loadDue(Date.now(), path).map((e) => e.userId)).toEqual(['u1']);
  });

  it('corrupt file loads as empty instead of throwing', () => {
    const path = freshPath();
    writeFileSync(path, '{not json', 'utf8');
    expect(loadEntries(path)).toEqual([]);
  });
});

describe('saveEntries failure tolerance', () => {
  it('a disk failure never throws (unwritable dir)', () => {
    // A path under a regular file cannot be created as a directory.
    const blocker = freshPath();
    writeFileSync(blocker, 'x', 'utf8');
    const nested = join(blocker, 'nested', 'tempbans.json');
    expect(() => saveEntries([ENTRY_A], nested)).not.toThrow();
    expect(() => scheduleTempban(ENTRY_A, nested)).not.toThrow();
  });
});

describe('pollTempbans', () => {
  function stubClient(hooks: { unbanned: string[]; guildMissing?: boolean }): Client {
    const members = {
      unban: vi.fn(async (userId: string) => {
        hooks.unbanned.push(userId);
      }),
    };
    const guilds = {
      fetch: vi.fn(async () => {
        if (hooks.guildMissing === true) throw new Error('Unknown Guild');
        return { members };
      }),
    };
    return { guilds } as unknown as Client;
  }

  it('unbans due rows and removes them from the file', async () => {
    const path = freshPath();
    scheduleTempban({ ...ENTRY_A, unbanAt: new Date(Date.now() - 1000).toISOString() }, path);
    const hooks = { unbanned: [] as string[] };
    await pollTempbans(stubClient(hooks), Date.now(), path);
    expect(hooks.unbanned).toEqual(['u1']);
    expect(loadEntries(path)).toEqual([]);
  });

  it('leaves future rows alone', async () => {
    const path = freshPath();
    scheduleTempban(ENTRY_A, path);
    const hooks = { unbanned: [] as string[] };
    await pollTempbans(stubClient(hooks), Date.now(), path);
    expect(hooks.unbanned).toEqual([]);
    expect(loadEntries(path)).toHaveLength(1);
  });

  it('keeps the row when the guild fetch fails (retry next tick)', async () => {
    const path = freshPath();
    scheduleTempban({ ...ENTRY_A, unbanAt: new Date(Date.now() - 1000).toISOString() }, path);
    const hooks = { unbanned: [] as string[], guildMissing: true };
    await pollTempbans(stubClient(hooks), Date.now(), path);
    expect(hooks.unbanned).toEqual([]);
    expect(loadEntries(path)).toHaveLength(1);
  });
});

describe('startTempbanPoll', () => {
  it('returns a stop() handle and uses the 60s default', () => {
    const client = { guilds: { fetch: vi.fn() } } as unknown as Client;
    expect(TEMPBAN_POLL_MS).toBe(60_000);
    const handle = startTempbanPoll(client, 1_000_000);
    expect(typeof handle.stop).toBe('function');
    handle.stop();
  });
});
