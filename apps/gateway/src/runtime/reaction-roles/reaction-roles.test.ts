// Wave E1: reaction-roles handler unit tests (fakes only — no login, no network).
//
// Covers: kind/commands/events surface (MessageReactionAdd only, NO removal
// event), emojiKeyOf + planRoleGrant pure helpers, parse fallback, /role post
// picker seeding, /role remove, and the MessageReactionAdd grant path with
// exclusivity, limits, and partial-reaction fetch.

import type { ChatInputCommandInteraction, Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfigRow } from '../config.js';
import {
  buildReactionRolesModule,
  emojiKeyOf,
  parseReactionRolesParams,
  planRoleGrant,
  ROLE_COMMAND_NAME,
} from './handler.js';

function makeConfig(params: Record<string, unknown>): RuntimeConfigRow {
  return { botId: 'bot-1', guildId: null, kind: 'reaction-roles', params, specVersion: 1 };
}

function perms(granted: boolean): { has: () => boolean } {
  return { has: () => granted };
}

function makeGuild(meFlags: boolean): {
  id: string;
  members: { me: unknown; fetch: (id: string) => Promise<unknown> };
  lastFetched: string[];
} {
  const lastFetched: string[] = [];
  return {
    id: 'guild-1',
    members: {
      me: { permissions: perms(meFlags) },
      fetch: async (id: string) => {
        lastFetched.push(id);
        return null;
      },
    },
    lastFetched,
  };
}

describe('reaction-roles module surface', () => {
  it('exposes kind reaction-roles with /role and exactly one event', () => {
    const module = buildReactionRolesModule();
    expect(module.kind).toBe('reaction-roles');
    expect(module.commands.map((c) => c.data.name)).toEqual([ROLE_COMMAND_NAME]);
    // NO MessageReactionRemove: removal ships as /role remove.
    expect(module.events.map((e) => e.name)).toEqual(['MessageReactionAdd']);
  });

  it('parseReactionRolesParams falls back on malformed input, never throws', () => {
    expect(parseReactionRolesParams(null).groups).toEqual([]);
    expect(parseReactionRolesParams(42).groups).toEqual([]);
    const parsed = parseReactionRolesParams({
      groups: [{ emojiToRole: { '👍': 'role-1' }, exclusive: true, maxPerMember: 1 }],
      logChannelId: 'log-1',
    });
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.exclusive).toBe(true);
  });

  it('emojiKeyOf prefers custom id, falls back to unicode name, null on empty', () => {
    expect(emojiKeyOf({ emoji: { id: 'eid', name: 'custom' } } as never)).toBe('eid');
    expect(emojiKeyOf({ emoji: { id: null, name: '👍' } } as never)).toBe('👍');
    expect(emojiKeyOf({ emoji: {} } as never)).toBeNull();
  });

  it('planRoleGrant drops exclusives, caps maxPerMember, null when held', () => {
    const group = {
      messageId: '',
      emojiToRole: { a: 'r1', b: 'r2' },
      exclusive: true,
      maxPerMember: 0,
    };
    expect(planRoleGrant(['r1'], group, 'r1')).toBeNull();
    expect(planRoleGrant(['r1'], group, 'r2')).toEqual({ add: ['r2'], remove: ['r1'] });
    const capped = {
      messageId: '',
      emojiToRole: { a: 'r1', b: 'r2', c: 'r3' },
      exclusive: false,
      maxPerMember: 1,
    };
    expect(planRoleGrant(['r1'], capped, 'r2')).toBeNull();
    expect(planRoleGrant([], capped, 'r2')).toEqual({ add: ['r2'], remove: [] });
  });
});

describe('/role post + remove', () => {
  function postInteraction(
    channel: unknown,
    guild: unknown,
    deferred = false,
  ): {
    interaction: ChatInputCommandInteraction;
    replies: unknown[];
    followUps: unknown[];
  } {
    const replies: unknown[] = [];
    const followUps: unknown[] = [];
    const interaction = {
      guild,
      guildId: 'guild-1',
      channel,
      client: { channels: { cache: new Map() } } as unknown as Client,
      user: { id: 'mod-1' },
      memberPermissions: perms(true),
      replied: false,
      deferred,
      options: {
        getSubcommand: () => 'post',
        getUser: () => null,
        getRole: () => null,
      },
      reply: async (p: unknown) => {
        // Mirror discord.js: reply() throws when already acked (deferred/replied).
        if (deferred) throw new Error('InteractionAlreadyReplied');
        replies.push(p);
      },
      followUp: async (p: unknown) => {
        followUps.push(p);
      },
    } as unknown as ChatInputCommandInteraction;
    return { interaction, replies, followUps };
  }

  it('posts the picker, seeds emojis, and replies with the message link', async () => {
    const reacted: string[] = [];
    const channel = {
      send: async () => ({ id: 'picker-1', react: async (e: string) => reacted.push(e) }),
    };
    const guild = makeGuild(true);
    const module = buildReactionRolesModule();
    module.start?.(
      null as never,
      makeConfig({ groups: [{ emojiToRole: { '👍': 'r1', '🎨': 'r2' } }] }),
    );
    const { interaction, replies } = postInteraction(channel, guild);
    await module.commands[0]?.execute(interaction);
    expect(reacted).toEqual(expect.arrayContaining(['👍', '🎨']));
    expect(JSON.stringify(replies[0])).toContain('picker-1');
  });

  it('refuses /role post without ManageRoles, never throws', async () => {
    const channel = { send: async () => ({ id: 'x', react: async () => undefined }) };
    const guild = makeGuild(true);
    const module = buildReactionRolesModule();
    module.start?.(null as never, makeConfig({}));
    const replies: unknown[] = [];
    const interaction = {
      guild,
      guildId: 'guild-1',
      channel,
      client: { channels: { cache: new Map() } } as unknown as Client,
      user: { id: 'u' },
      memberPermissions: perms(false),
      replied: false,
      deferred: false,
      options: { getSubcommand: () => 'post', getUser: () => null, getRole: () => null },
      reply: async (p: unknown) => {
        replies.push(p);
      },
      followUp: async (p: unknown) => {
        replies.push(p);
      },
    } as unknown as ChatInputCommandInteraction;
    await expect(module.commands[0]?.execute(interaction)).resolves.toBeUndefined();
    expect(JSON.stringify(replies[0])).toMatch(/Manage Roles/);
  });

  it('removes a role via /role remove', async () => {
    const removed: string[] = [];
    const target = { id: 'user-7' };
    const role = { id: 'r9' };
    const guild = {
      id: 'guild-1',
      members: {
        me: { permissions: perms(true) },
        fetch: async () => ({ roles: { remove: async (id: string) => removed.push(id) } }),
      },
    };
    const replies: unknown[] = [];
    const followUps: unknown[] = [];
    const interaction = {
      guild,
      guildId: 'guild-1',
      channel: null,
      client: { channels: { cache: new Map() } } as unknown as Client,
      user: { id: 'mod-1' },
      memberPermissions: perms(true),
      replied: false,
      deferred: false,
      options: {
        getSubcommand: () => 'remove',
        getUser: () => target,
        getRole: () => role,
      },
      reply: async (p: unknown) => {
        replies.push(p);
      },
      followUp: async (p: unknown) => {
        followUps.push(p);
      },
    } as unknown as ChatInputCommandInteraction;
    const module = buildReactionRolesModule();
    module.start?.(null as never, makeConfig({}));
    await module.commands[0]?.execute(interaction);
    expect(removed).toEqual(['r9']);
    expect(JSON.stringify(replies[0])).toContain('r9');
  });

  it('deferred /role post completes via followUp with no throw', async () => {
    const reacted: string[] = [];
    const channel = {
      send: async () => ({ id: 'picker-9', react: async (e: string) => reacted.push(e) }),
    };
    const guild = makeGuild(true);
    const module = buildReactionRolesModule();
    module.start?.(null as never, makeConfig({ groups: [{ emojiToRole: { '👍': 'r1' } }] }));
    const { interaction, replies, followUps } = postInteraction(channel, guild, true);
    await expect(module.commands[0]?.execute(interaction)).resolves.toBeUndefined();
    expect(replies).toHaveLength(0);
    expect(followUps).toHaveLength(1);
    expect(JSON.stringify(followUps[0])).toContain('picker-9');
  });
});

describe('MessageReactionAdd grant path', () => {
  it('grants the mapped role after partial fetch, logs the grant', async () => {
    const added: string[] = [];
    const logSent: unknown[] = [];
    const member = {
      roles: {
        cache: new Map(),
        add: async (id: string) => added.push(id),
        remove: async () => undefined,
      },
    };
    const guild = {
      id: 'guild-1',
      members: { me: { permissions: perms(true) }, fetch: async () => member },
    };
    const client = {
      channels: { cache: new Map([['log-1', { send: async (p: unknown) => logSent.push(p) }]]) },
    } as unknown as Client;
    const reaction = {
      emoji: { id: null, name: '👍' },
      partial: true,
      fetch: vi.fn(),
      message: { id: 'picker-1', guild },
    } as unknown as import('discord.js').MessageReaction;
    const full = {
      emoji: { id: null, name: '👍' },
      message: { id: 'picker-1', guild },
    };
    (reaction as unknown as { fetch: unknown }).fetch = async () => full;
    const user = { id: 'user-3', bot: false } as never;

    const module = buildReactionRolesModule();
    module.start?.(
      client,
      makeConfig({
        groups: [{ messageId: 'picker-1', emojiToRole: { '👍': 'role-1' } }],
        logChannelId: 'log-1',
      }),
    );
    const handler = module.events[0]?.execute as unknown as (
      r: unknown,
      u: unknown,
    ) => Promise<void>;
    await handler(reaction, user);
    expect(added).toEqual(['role-1']);
    expect(JSON.stringify(logSent[0])).toContain('role-1');
  });

  it('ignores bots, untracked messages, and unmapped emoji', async () => {
    const added: string[] = [];
    const member = {
      roles: {
        cache: new Map(),
        add: async (id: string) => added.push(id),
        remove: async () => undefined,
      },
    };
    const guild = {
      id: 'guild-1',
      members: { me: { permissions: perms(true) }, fetch: async () => member },
    };
    const module = buildReactionRolesModule();
    module.start?.(
      null as never,
      makeConfig({ groups: [{ messageId: 'p1', emojiToRole: { a: 'r1' } }] }),
    );
    const handler = module.events[0]?.execute as unknown as (
      r: unknown,
      u: unknown,
    ) => Promise<void>;
    await handler(
      { emoji: { name: 'a' }, message: { id: 'other', guild } },
      { id: 'u', bot: false },
    );
    await handler(
      { emoji: { name: 'zzz' }, message: { id: 'p1', guild } },
      { id: 'u', bot: false },
    );
    await handler({ emoji: { name: 'a' }, message: { id: 'p1', guild } }, { id: 'bot', bot: true });
    expect(added).toEqual([]);
  });

  it('skips the grant when the group limit denies it, never throws', async () => {
    const added: string[] = [];
    const member = {
      roles: {
        cache: new Map([['r1', {}]]),
        add: async (id: string) => added.push(id),
        remove: async () => undefined,
      },
    };
    const guild = {
      id: 'guild-1',
      members: { me: { permissions: perms(true) }, fetch: async () => member },
    };
    const module = buildReactionRolesModule();
    module.start?.(
      null as never,
      makeConfig({
        groups: [{ messageId: 'p1', emojiToRole: { a: 'r1', b: 'r2' }, maxPerMember: 1 }],
      }),
    );
    const handler = module.events[0]?.execute as unknown as (
      r: unknown,
      u: unknown,
    ) => Promise<void>;
    await expect(
      handler({ emoji: { name: 'b' }, message: { id: 'p1', guild } }, { id: 'u', bot: false }),
    ).resolves.toBeUndefined();
    expect(added).toEqual([]);
  });
});
