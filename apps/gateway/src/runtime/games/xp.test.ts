// Site-engine bridge A6: XP unit tests (fakes only, no Discord login).
//
// Covers: the level curve including the 1e9 cap, the 30s cooldown gate
// (second award blocked, allowed after), the booster amount of 2, the
// level * 42 bonus, level-role nearest-at-or-below plus null-when-same,
// and leaderboard ordering.

import type { ChatInputCommandInteraction, GuildMember, Message } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  applyLevelRoles,
  awardXp,
  buildXpModule,
  CURRENCY_PER_LEVEL,
  InMemoryXpStore,
  levelFor,
  LEVEL_K,
  resolveLevelRoleIds,
  tryAwardXp,
  xpForLevel,
  XP_CAP,
  XP_COOLDOWN_MS,
  XpCooldowns,
} from './xp.js';

describe('levelFor', () => {
  it('maps 0 XP to level 0', () => {
    expect(levelFor(0)).toBe(0);
  });

  it('maps 1 XP to level 0', () => {
    expect(levelFor(1)).toBe(0);
  });

  it('maps 100 XP to level 4', () => {
    expect(levelFor(100)).toBe(Math.floor(LEVEL_K * 10));
    expect(levelFor(100)).toBe(4);
  });

  it('maps 10000 XP to level 42', () => {
    expect(levelFor(10000)).toBe(42);
  });

  it('clamps at the 1e9 cap instead of growing past it', () => {
    expect(levelFor(XP_CAP)).toBe(Math.floor(LEVEL_K * Math.sqrt(XP_CAP)));
    expect(levelFor(XP_CAP * 50)).toBe(levelFor(XP_CAP));
  });

  it('treats negative XP as 0 and inverts via xpForLevel', () => {
    expect(levelFor(-5)).toBe(0);
    const level = 7;
    expect(levelFor(xpForLevel(level))).toBeLessThanOrEqual(level);
    expect(levelFor(xpForLevel(level) + 1)).toBeGreaterThanOrEqual(level);
  });
});

describe('awardXp', () => {
  it('pays level * 42 currency on level-up', () => {
    const store = new InMemoryXpStore();
    const need = xpForLevel(2) + 1;
    const result = awardXp(store, 'g', 'm', need);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
    expect(result.reward).toBe(2 * CURRENCY_PER_LEVEL);
    expect(store.get('g', 'm')?.balance).toBe(2 * CURRENCY_PER_LEVEL);
  });

  it('caps stored XP at 1e9', () => {
    const store = new InMemoryXpStore();
    const result = awardXp(store, 'g', 'm', XP_CAP * 50);
    expect(result.xp).toBe(XP_CAP);
    expect(store.get('g', 'm')?.xp).toBe(XP_CAP);
  });
});

describe('tryAwardXp cooldown', () => {
  it('blocks the second award inside 30s and allows it after', () => {
    const store = new InMemoryXpStore();
    const cooldowns = new XpCooldowns();
    const first = tryAwardXp(store, cooldowns, 'g', 'm', 1, 1_000);
    expect(first.awarded).toBe(true);
    const blocked = tryAwardXp(store, cooldowns, 'g', 'm', 1, 1_000 + XP_COOLDOWN_MS - 1);
    expect(blocked.awarded).toBe(false);
    expect(store.get('g', 'm')?.xp).toBe(1);
    const allowed = tryAwardXp(store, cooldowns, 'g', 'm', 1, 1_000 + XP_COOLDOWN_MS);
    expect(allowed.awarded).toBe(true);
    expect(store.get('g', 'm')?.xp).toBe(2);
  });
});

function fakeMessage(
  opts: {
    userId?: string;
    guildId?: string;
    bot?: boolean;
    booster?: boolean;
  } = {},
): Message {
  const member = {
    premiumSinceTimestamp: opts.booster === true ? Date.now() : null,
    roles: {
      cache: new Map<string, unknown>(),
      set: async (): Promise<unknown> => undefined,
    },
  };
  return {
    author: { bot: opts.bot ?? false, id: opts.userId ?? 'user-1' },
    guild: { id: opts.guildId ?? 'guild-1' },
    member,
  } as unknown as Message;
}

describe('MessageCreate awards', () => {
  it('awards 1 XP normally and 2 for boosters, ignoring bots', async () => {
    const store = new InMemoryXpStore();
    const module = buildXpModule({ store, cooldowns: new XpCooldowns(), now: () => 5_000 });
    const event = module.events.find((entry) => entry.name === 'MessageCreate');
    if (event === undefined || event.name !== 'MessageCreate') {
      throw new Error('xp module is missing its MessageCreate event');
    }
    await event.execute(fakeMessage({ userId: 'plain' }));
    await event.execute(fakeMessage({ userId: 'boost', booster: true }));
    await event.execute(fakeMessage({ userId: 'bot', bot: true }));
    expect(store.get('guild-1', 'plain')?.xp).toBe(1);
    expect(store.get('guild-1', 'boost')?.xp).toBe(2);
    expect(store.get('guild-1', 'bot')).toBeUndefined();
  });
});

describe('resolveLevelRoleIds', () => {
  const entries = [
    { roleId: 'role-5', level: 5 },
    { roleId: 'role-10', level: 10 },
  ];

  it('picks the nearest level at or below the current level', () => {
    expect(resolveLevelRoleIds([], entries, 7)).toEqual(['role-5']);
    expect(resolveLevelRoleIds([], entries, 12)).toEqual(['role-10']);
  });

  it('returns null when no level is eligible', () => {
    expect(resolveLevelRoleIds([], entries, 3)).toBeNull();
    expect(resolveLevelRoleIds([], [], 99)).toBeNull();
  });

  it('returns null when the set already matches', () => {
    expect(resolveLevelRoleIds(['role-5'], entries, 7)).toBeNull();
  });

  it('swaps a stale managed role for the new nearest one', () => {
    expect(resolveLevelRoleIds(['other', 'role-5'], entries, 12)).toEqual(['other', 'role-10']);
  });
});

function fakeMember(roleIds: string[]): { member: GuildMember; setCalls: string[][] } {
  const setCalls: string[][] = [];
  const member = {
    roles: {
      cache: new Map(roleIds.map((id) => [id, { id }])),
      set: async (ids: string[]): Promise<unknown> => {
        setCalls.push(ids);
        return undefined;
      },
    },
  } as unknown as GuildMember;
  return { member, setCalls };
}

describe('applyLevelRoles', () => {
  const entries = [
    { roleId: 'role-5', level: 5 },
    { roleId: 'role-10', level: 10 },
  ];

  it('calls roles.set when the set differs', async () => {
    const { member, setCalls } = fakeMember([]);
    expect(await applyLevelRoles(member, 7, entries)).toBe(true);
    expect(setCalls).toEqual([['role-5']]);
  });

  it('skips roles.set when the set already matches', async () => {
    const { member, setCalls } = fakeMember(['role-5']);
    expect(await applyLevelRoles(member, 7, entries)).toBe(false);
    expect(setCalls).toEqual([]);
  });
});

interface CapturedReply {
  content?: string;
  embeds?: unknown[];
}

function fakeCommandInteraction(
  guildId: string | null,
  onReply: (payload: CapturedReply) => void,
): ChatInputCommandInteraction {
  return {
    guildId,
    user: { id: 'caller', username: 'caller' },
    options: { getUser: (): null => null },
    reply: async (payload: CapturedReply): Promise<void> => {
      onReply(payload);
    },
  } as unknown as ChatInputCommandInteraction;
}

function embedDescription(embed: unknown): string {
  const record = embed as { data?: { description?: unknown } };
  return typeof record.data?.description === 'string' ? record.data.description : '';
}

describe('leaderboard', () => {
  it('lists the top members ordered by XP descending', async () => {
    const store = new InMemoryXpStore();
    store.set('g', 'low', { xp: 10, balance: 0 });
    store.set('g', 'high', { xp: 900, balance: 0 });
    store.set('g', 'mid', { xp: 100, balance: 0 });
    const module = buildXpModule({ store });
    const command = module.commands.find((entry) => entry.data.name === 'leaderboard');
    if (command === undefined) throw new Error('xp module is missing /leaderboard');
    let captured: CapturedReply = {};
    await command.execute(fakeCommandInteraction('g', (payload) => (captured = payload)));
    const lines = embedDescription(captured.embeds?.[0]).split('\n');
    expect(lines[0]).toContain('high');
    expect(lines[1]).toContain('mid');
    expect(lines[2]).toContain('low');
  });

  it('answers empty guilds with a no-XP line', async () => {
    const module = buildXpModule({ store: new InMemoryXpStore() });
    const command = module.commands.find((entry) => entry.data.name === 'leaderboard');
    if (command === undefined) throw new Error('xp module is missing /leaderboard');
    let captured: CapturedReply = {};
    await command.execute(fakeCommandInteraction('g', (payload) => (captured = payload)));
    expect(captured.content).toBe('No XP recorded in this server yet.');
  });
});
