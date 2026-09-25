// Unit tests for games: XP formula, cooldown gate, Fisher-Yates draw.
// Fakes only — no network, no token, no discord.js gateway connection.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENCY_PER_LEVEL, LEVEL_K, XP_CAP } from '../config.js';
import type { Message } from 'discord.js';
import {
  drawWinners,
  fetchEntrantIds,
  findDue,
  MAX_REACTION_PAGES,
  REACTION_PAGE_SIZE,
} from './giveaway.js';
import type { GiveawayStore } from './giveaway.js';
import { awardXp, computeExperience, computeLevel, loadStore, saveStore, tryAward } from './xp.js';
import type { XpStore } from './xp.js';
import { resetCooldowns } from './xp.js';

describe('computeLevel', () => {
  it('maps 0 XP to level 0', () => {
    expect(computeLevel(0)).toBe(0);
  });

  it('maps 1 XP to level 0 (0.42 * 1 floors to 0)', () => {
    expect(computeLevel(1)).toBe(0);
  });

  it('maps 100 XP to level 4', () => {
    expect(computeLevel(100)).toBe(Math.floor(LEVEL_K * 10));
    expect(computeLevel(100)).toBe(4);
  });

  it('maps 10000 XP to level 42', () => {
    expect(computeLevel(10000)).toBe(42);
  });

  it('clamps at the 1e9 cap instead of growing past it', () => {
    expect(computeLevel(XP_CAP)).toBe(Math.floor(LEVEL_K * Math.sqrt(XP_CAP)));
    expect(computeLevel(XP_CAP * 50)).toBe(computeLevel(XP_CAP));
  });

  it('treats negative XP as 0 and inverts via computeExperience', () => {
    expect(computeLevel(-5)).toBe(0);
    const level = 7;
    // floor() on both sides loses up to 1 XP, so the exact inverse can sit
    // one below; +1 XP always reaches the level. See computeExperience.
    expect(computeLevel(computeExperience(level))).toBeLessThanOrEqual(level);
    expect(computeLevel(computeExperience(level) + 1)).toBeGreaterThanOrEqual(level);
    expect(computeLevel(computeExperience(level + 1) + 1)).toBeGreaterThanOrEqual(level + 1);
  });
});

describe('awardXp', () => {
  it('pays level * 42 currency on level-up', () => {
    const store: XpStore = {};
    // Award one MORE than the exact threshold: floor() on both sides can
    // leave computeExperience(L) one XP below level L.
    const need = computeExperience(2) + 1;
    const result = awardXp(store, 'g', 'm', need);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
    expect(result.reward).toBe(2 * CURRENCY_PER_LEVEL);
    expect(store['g']?.['m']?.balance).toBe(2 * CURRENCY_PER_LEVEL);
  });

  it('never exceeds the 1e9 XP cap', () => {
    const store: XpStore = { g: { m: { xp: XP_CAP - 1, balance: 0 } } };
    const result = awardXp(store, 'g', 'm', 100);
    expect(result.xp).toBe(XP_CAP);
  });
});

describe('cooldown gate', () => {
  it('blocks a second award inside 30s and leaves the store untouched', () => {
    resetCooldowns();
    const store: XpStore = {};
    const first = tryAward(store, 'g', 'cool-user', 1, 1_000_000);
    expect(first.awarded).toBe(true);
    expect(store['g']?.['cool-user']?.xp).toBe(1);
    const second = tryAward(store, 'g', 'cool-user', 1, 1_000_000 + 29_999);
    expect(second.awarded).toBe(false);
    expect(store['g']?.['cool-user']?.xp).toBe(1);
  });

  it('allows an award after the 30s window and per user independently', () => {
    resetCooldowns();
    const store: XpStore = {};
    expect(tryAward(store, 'g', 'u-a', 1, 2_000_000).awarded).toBe(true);
    expect(tryAward(store, 'g', 'u-b', 1, 2_000_000).awarded).toBe(true);
    expect(tryAward(store, 'g', 'u-a', 1, 2_000_000 + 30_000).awarded).toBe(true);
    expect(store['g']?.['u-a']?.xp).toBe(2);
  });
});

describe('drawWinners (partial Fisher-Yates)', () => {
  const entrants = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('draws unique winners that are a subset of entrants', () => {
    const winners = drawWinners(entrants, 3);
    expect(winners).toHaveLength(3);
    expect(new Set(winners).size).toBe(3);
    for (const w of winners) expect(entrants).toContain(w);
  });

  it('excludes prior winners (reroll picks fresh ids)', () => {
    const prior = new Set<string>(['a', 'b', 'c']);
    const winners = drawWinners(entrants, 3, prior);
    expect(winners).toHaveLength(3);
    for (const w of winners) expect(prior.has(w)).toBe(false);
    expect(new Set(winners).size).toBe(3);
  });

  it('caps at the pool size and returns empty for zero winners', () => {
    expect(drawWinners(['x', 'y'], 5)).toHaveLength(2);
    expect(drawWinners(entrants, 0)).toHaveLength(0);
    expect(drawWinners(entrants, 2, new Set(entrants))).toHaveLength(0);
  });

  it('is deterministic with a fixed random source', () => {
    const zeros = drawWinners(entrants, 3, new Set(), () => 0);
    expect(zeros).toEqual(['a', 'b', 'c']);
  });
});

describe('findDue', () => {
  it('returns only un-ended rows with ends <= now', () => {
    const store: GiveawayStore = {
      m1: {
        messageId: 'm1',
        guildId: 'g',
        channelId: 'c',
        title: 'past',
        winners: 1,
        ends: 100,
        ended: false,
        winnerIds: [],
      },
      m2: {
        messageId: 'm2',
        guildId: 'g',
        channelId: 'c',
        title: 'future',
        winners: 1,
        ends: 9_999_999,
        ended: false,
        winnerIds: [],
      },
      m3: {
        messageId: 'm3',
        guildId: 'g',
        channelId: 'c',
        title: 'done',
        winners: 1,
        ends: 100,
        ended: true,
        winnerIds: ['w'],
      },
    };
    expect(findDue(store, 500).map((r) => r.messageId)).toEqual(['m1']);
  });
});

describe('fetchEntrantIds pagination (the 100-entrant cap)', () => {
  it('walks past the first page and returns every entrant (137 = 100 + 37)', async () => {
    const ids = paddedIds(137);
    const afters: (string | undefined)[] = [];
    const message = fakeMessageWithReactants(
      ids,
      pagedUsersFetcher(ids, (a) => afters.push(a)),
    );

    const entrants = await fetchEntrantIds(message);

    expect(entrants).toHaveLength(137);
    expect(new Set(entrants)).toEqual(new Set(ids));
    // Two pages: an uncursored first call, then one resuming from page 1's max.
    expect(afters).toEqual([undefined, ids[99]]);
  });

  it('draws winners from the complete entrant set, not just the first 100', async () => {
    // The regression: a bare fetch() returns the first 100 and entrant #137
    // can never win. With pagination the whole set is in the pool.
    const ids = paddedIds(137);
    const message = fakeMessageWithReactants(ids);
    const entrants = await fetchEntrantIds(message);
    if (entrants === null) throw new Error('reaction users were not readable');
    expect(entrants).toHaveLength(137);

    // random() = 0.999 takes the last element of each swap range: the 5th pick
    // lands on the final pool entry — an entrant a 100-cap draw could not reach.
    const winners = drawWinners(entrants, 5, new Set(), () => 0.999);
    expect(winners).toHaveLength(5);
    expect(winners).toContain(ids[136]);
  });

  it('stops on a short page without a further request', async () => {
    const ids = paddedIds(30);
    let calls = 0;
    const message = fakeMessageWithReactants(ids, async (options) => {
      calls += 1;
      return pagedUsersFetcher(ids)(options);
    });
    expect(await fetchEntrantIds(message)).toHaveLength(30);
    expect(calls).toBe(1);
  });

  it('stops at the page cap when the API never short-pages', async () => {
    // Misbehaving API: ignores `after`, always returns a full page where every
    // id compares below the cursor, so the walk cannot advance. Without the cap
    // this is an unbounded loop; it must stop at MAX_REACTION_PAGES.
    const ids = paddedIds(REACTION_PAGE_SIZE);
    let calls = 0;
    const message = fakeMessageWithReactants(ids, async () => {
      calls += 1;
      return new Map(ids.map((id) => [id, { id, bot: true }]));
    });
    expect(await fetchEntrantIds(message)).toEqual([]);
    expect(calls).toBe(MAX_REACTION_PAGES);
  });

  it('keeps bot filtering and dedup across the page boundary', async () => {
    const ids = paddedIds(100);
    let calls = 0;
    const message = fakeMessageWithReactants(ids, async (options) => {
      calls += 1;
      if (calls === 1) return pagedUsersFetcher(ids)(options);
      // Page 2: a bot and a duplicate of an id already collected on page 1.
      return new Map([
        ['900001', { id: '900001', bot: true }],
        [ids[0] ?? '', { id: ids[0] ?? '', bot: false }],
      ]);
    });

    const entrants = await fetchEntrantIds(message);

    expect(entrants).toHaveLength(100);
    expect(new Set(entrants)).toEqual(new Set(ids));
    expect(entrants).not.toContain('900001');
  });

  it('returns no entrants when the message has no reaction', async () => {
    const message = {
      reactions: { cache: new Map() },
    } as unknown as Message;
    expect(await fetchEntrantIds(message)).toEqual([]);
  });
});

/**
 * Contract-faithful fake of ReactionUserManager.fetch: honours `limit` and the
 * exclusive `after` cursor (ascending id order, like the Discord endpoint) and
 * yields a Map keyed by id. Records each `after` it was called with so tests can
 * assert the walk actually paged.
 */
function pagedUsersFetcher(
  ids: readonly string[],
  onFetch?: (after: string | undefined) => void,
): (options?: { limit?: number; after?: string }) => Promise<Map<string, unknown>> {
  const sorted = [...ids].sort();
  return async (options = {}): Promise<Map<string, unknown>> => {
    const { limit = 100, after } = options;
    onFetch?.(after);
    const start = after === undefined ? 0 : sorted.findIndex((id) => id > after);
    const page = start === -1 ? [] : sorted.slice(start, start + limit);
    return new Map(page.map((id) => [id, { id, bot: false }]));
  };
}

function fakeMessageWithReactants(
  ids: readonly string[],
  fetchUsers?: (options?: { limit?: number; after?: string }) => Promise<Map<string, unknown>>,
): Message {
  const users = { fetch: fetchUsers ?? pagedUsersFetcher(ids) };
  return {
    id: 'msg-1',
    reactions: { cache: new Map([['🎉', { users }]]) },
    edit: async (): Promise<unknown> => undefined,
  } as unknown as Message;
}

/** Ids that sort like real snowflakes, so the `after` cursor is meaningful. */
function paddedIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(i).padStart(6, '0'));
}

describe('games store round-trip', () => {
  it('saveStore/loadStore survive a tmp+rename cycle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'testbot-games-'));
    try {
      const path = join(dir, 'games.json');
      saveStore({ g: { m: { xp: 12, balance: 84 } } }, path);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
        g: { m: { xp: 12, balance: 84 } },
      });
      expect(loadStore(path)).toEqual({ g: { m: { xp: 12, balance: 84 } } });
      expect(loadStore(join(dir, 'missing.json'))).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
