// Site-engine bridge A4: welcome handler unit tests (fakes only — no login, no
// network). Covers placeholder expansion incl. literal backslash-n, the raid
// boundary (10 quiet, 11 suppressed), auto-role failure still greeting,
// missing channel logging plus return, malformed config fallback, farewell on
// member remove, and the key-scoring of resolveWelcomeText.

import { describe, expect, it, vi } from 'vitest';
import type { Client, GuildMember } from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import { buildWelcomeModule, resolveWelcomeText } from './handler.js';
import type { WelcomeLogger } from './handler.js';

interface FakeChannel {
  id: string;
  sent: unknown[];
  send(payload: unknown): Promise<unknown>;
}

function makeChannel(id: string): FakeChannel {
  const channel: FakeChannel = {
    id,
    sent: [],
    send: async (payload: unknown): Promise<unknown> => {
      channel.sent.push(payload);
      return { id: 'msg-1' };
    },
  };
  return channel;
}

interface FakeMemberOptions {
  autoRoleFails?: boolean;
  sendFails?: boolean;
}

function makeMember(opts: FakeMemberOptions = {}): {
  member: GuildMember;
  welcomeChannel: FakeChannel;
  rolesAdd: ReturnType<typeof vi.fn>;
} {
  const welcomeChannel = makeChannel('welcome-chan');
  const rolesAdd = vi.fn(async (): Promise<unknown> => {
    if (opts.autoRoleFails) {
      throw new Error('role boom');
    }
    return {};
  });
  const channelMap = new Map<string, unknown>([['welcome-chan', welcomeChannel]]);
  if (opts.sendFails) {
    const failing = makeChannel('welcome-chan');
    failing.send = async (): Promise<unknown> => {
      throw new Error('send boom');
    };
    channelMap.set('welcome-chan', failing);
  }
  const member = {
    id: 'user-7',
    guild: {
      id: 'guild-1',
      name: 'Test Guild',
      memberCount: 42,
      channels: { cache: channelMap },
    },
    roles: { add: rolesAdd },
    displayAvatarURL: (): string => 'https://example.invalid/avatar.png',
  } as unknown as GuildMember;
  return { member, welcomeChannel, rolesAdd };
}

function makeEmptyGuildMember(): {
  member: GuildMember;
} {
  const member = {
    id: 'user-9',
    guild: {
      id: 'guild-1',
      name: 'Test Guild',
      memberCount: 3,
      channels: { cache: new Map<string, unknown>() },
    },
    roles: { add: vi.fn(async () => ({})) },
    displayAvatarURL: (): string => 'https://example.invalid/avatar.png',
  } as unknown as GuildMember;
  return { member };
}

function makeLogger(): WelcomeLogger & { infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  return {
    infos,
    errors,
    info: (record): void => {
      infos.push(record.event);
    },
    error: (record): void => {
      errors.push(record.event);
    },
  };
}

function makeConfig(params: Record<string, unknown>): RuntimeConfigRow {
  return {
    botId: 'bot-1',
    guildId: 'guild-1',
    kind: 'welcome',
    params,
    specVersion: 1,
  };
}

function startedModule(
  params: Record<string, unknown>,
  opts: { now?: () => number } = {},
): {
  add: (member: GuildMember) => Promise<void>;
  remove: (member: GuildMember) => Promise<void>;
  logger: WelcomeLogger & { infos: string[]; errors: string[] };
} {
  const logger = makeLogger();
  const module = buildWelcomeModule({ logger, now: opts.now });
  const fakeClient = { channels: { cache: new Map<string, unknown>() } } as unknown as Client;
  module.start?.(fakeClient, makeConfig(params));
  const addEvent = module.events.find((event) => event.name === 'GuildMemberAdd');
  const removeEvent = module.events.find((event) => event.name === 'GuildMemberRemove');
  if (!addEvent || addEvent.name !== 'GuildMemberAdd') {
    throw new Error('GuildMemberAdd event missing');
  }
  if (!removeEvent || removeEvent.name !== 'GuildMemberRemove') {
    throw new Error('GuildMemberRemove event missing');
  }
  return {
    add: (target: GuildMember): Promise<void> => addEvent.execute(target),
    remove: (target: GuildMember): Promise<void> => removeEvent.execute(target),
    logger,
  };
}

describe('welcome handler', () => {
  it('exposes kind welcome with GuildMemberAdd and GuildMemberRemove events only', () => {
    const module = buildWelcomeModule();
    expect(module.kind).toBe('welcome');
    expect(module.commands).toEqual([]);
    expect(module.events.map((event) => event.name).sort()).toEqual([
      'GuildMemberAdd',
      'GuildMemberRemove',
    ]);
  });

  it('expands placeholders and converts literal backslash-n to newlines', async () => {
    const harness = startedModule({ message: 'Hi {member:mention} @ {server} #{count}\\nBye' });
    const { member, welcomeChannel } = makeMember();
    await harness.add(member);
    expect(welcomeChannel.sent).toHaveLength(1);
    const payload = welcomeChannel.sent[0] as { embeds: Array<{ data: { description?: string } }> };
    expect(payload.embeds[0]?.data.description).toBe('Hi <@user-7> @ Test Guild #42\nBye');
  });

  it('stays quiet through 10 joins and suppresses the 11th with a raid log', async () => {
    let at = 1_000_000;
    const harness = startedModule({ message: 'hello {member:mention}' }, { now: () => at });
    for (let i = 0; i < 10; i += 1) {
      const { member, welcomeChannel } = makeMember();
      await harness.add(member);
      expect(welcomeChannel.sent).toHaveLength(1);
    }
    at += 5_000;
    const { member, welcomeChannel } = makeMember();
    await harness.add(member);
    expect(welcomeChannel.sent).toHaveLength(0);
    expect(harness.logger.infos).toContain('welcome-raid-suppressed');
  });

  it('m-32: a join burst in one guild never suppresses a different guild', async () => {
    let at = 1_000_000;
    const logger = makeLogger();
    const module = buildWelcomeModule({ logger, now: () => at });
    const fakeClient = { channels: { cache: new Map<string, unknown>() } } as unknown as Client;
    module.start?.(fakeClient, makeConfig({ message: 'hello {member:mention}' }));
    const addEvent = module.events.find((event) => event.name === 'GuildMemberAdd');
    if (!addEvent || addEvent.name !== 'GuildMemberAdd') {
      throw new Error('GuildMemberAdd event missing');
    }
    const add = (guildId: string): Promise<void> => {
      const channelMap = new Map<string, unknown>([['welcome-chan', makeChannel('welcome-chan')]]);
      const member = {
        id: `user-${guildId}-${at}`,
        guild: {
          id: guildId,
          name: 'Test Guild',
          memberCount: 42,
          channels: { cache: channelMap },
        },
        roles: { add: vi.fn(async () => ({})) },
        displayAvatarURL: (): string => 'https://example.invalid/avatar.png',
      } as unknown as GuildMember;
      return addEvent.execute(member);
    };
    // 11 rapid joins in guild-a trip raid mode there (10 greeted, 11th muted).
    for (let i = 0; i < 11; i += 1) {
      await add('guild-a');
      at += 100;
    }
    expect(logger.infos).toContain('welcome-raid-suppressed');
    // A join in guild-b right after must still greet: per-guild rings.
    const before = (logger.infos as string[]).filter((e) => e === 'welcome-raid-suppressed').length;
    await add('guild-b');
    const after = (logger.infos as string[]).filter((e) => e === 'welcome-raid-suppressed').length;
    expect(after).toBe(before);
  });

  it('still greets when the auto-role assignment fails', async () => {
    const harness = startedModule({ message: 'hello {member:mention}', autoRoleId: 'role-1' });
    const { member, welcomeChannel } = makeMember({ autoRoleFails: true });
    await harness.add(member);
    expect(harness.logger.errors).toContain('welcome-autorole-failed');
    expect(welcomeChannel.sent).toHaveLength(1);
  });

  it('logs welcome-no-channel and returns when no channel resolves', async () => {
    const harness = startedModule({ message: 'hello {member:mention}' });
    const { member } = makeEmptyGuildMember();
    await harness.add(member);
    expect(harness.logger.infos).toContain('welcome-no-channel');
  });

  it('falls back to the default template on malformed config', async () => {
    const logger = makeLogger();
    const module = buildWelcomeModule({ logger });
    const fakeClient = { channels: { cache: new Map<string, unknown>() } } as unknown as Client;
    const malformed = { params: 42 } as unknown as RuntimeConfigRow;
    expect(() => module.start?.(fakeClient, malformed)).not.toThrow();
    expect(() => module.start?.(fakeClient, null)).not.toThrow();
    const addEvent = module.events.find((event) => event.name === 'GuildMemberAdd');
    if (!addEvent || addEvent.name !== 'GuildMemberAdd') {
      throw new Error('GuildMemberAdd event missing');
    }
    const { member, welcomeChannel } = makeMember();
    await addEvent.execute(member);
    expect(welcomeChannel.sent).toHaveLength(1);
  });

  it('sends the farewell template on GuildMemberRemove', async () => {
    const harness = startedModule({
      message: 'hello {member:mention}',
      farewellMessage: 'bye {member:mention}\\nmiss you',
    });
    const { member, welcomeChannel } = makeMember();
    await harness.remove(member);
    expect(welcomeChannel.sent).toHaveLength(1);
    const payload = welcomeChannel.sent[0] as { embeds: Array<{ data: { description?: string } }> };
    expect(payload.embeds[0]?.data.description).toBe('bye <@user-7>\nmiss you');
  });

  it('resolveWelcomeText maps title, name, detail, description, and channel keys', () => {
    expect(resolveWelcomeText({ message: 'direct' })).toBe('direct');
    expect(resolveWelcomeText({ items: [{ title: 'T', detail: 'D' }] })).toBe('T');
    expect(resolveWelcomeText({ items: [{ name: 'N' }] })).toBe('N');
    expect(resolveWelcomeText({ items: [{ detail: 'D' }] })).toBe('D');
    expect(resolveWelcomeText({ items: [{ description: 'S' }] })).toBe('S');
    expect(resolveWelcomeText({ items: [{ channel: 'C' }] })).toBe('C');
    expect(resolveWelcomeText(null)).toBe(
      'Welcome {member:mention} to {server}!\\nYou are member #{count}.',
    );
    expect(resolveWelcomeText(42)).toBe(
      'Welcome {member:mention} to {server}!\\nYou are member #{count}.',
    );
  });
});
