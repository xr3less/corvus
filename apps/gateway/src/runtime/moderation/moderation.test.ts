// Site-engine bridge A5: moderation unit tests (fakes only, no Discord login).
//
// Covers: automod guards, content-before-cooldown ordering, first-hit-wins,
// link cooldown, spam-ring warn-once, ladder gaps (in ladder.test.ts), the
// over-limit timeout fallback, missing-perms skip, the 60s tempban poll with
// an injected clock, and command denial as ephemeral.

import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Client, Message } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  bigramSimilarity,
  checkContent,
  checkMessage,
  CooldownTracker,
  LINK_COOLDOWN_MS,
  SpamRing,
} from './automod.js';
import type { AutomodMessageView, AutomodParams } from './automod.js';
import type { FeatureModule } from '../registry.js';
import { buildModerationModule } from './index.js';
import type { ModerationLogger } from './index.js';
import { nextPunishment } from './ladder.js';
import {
  InMemoryTempbanStorage,
  pollTempbans,
  startTempbanPoll,
  TEMPBAN_POLL_MS,
} from './tempban.js';

// ---------------------------------------------------------------------------
// Shared fakes
// ---------------------------------------------------------------------------

function baseView(overrides: Partial<AutomodMessageView> = {}): AutomodMessageView {
  return {
    authorBot: false,
    authorSystem: false,
    inGuild: true,
    authorHasManageMessages: false,
    authorId: 'user-1',
    authorRoleIds: [],
    text: 'hello there',
    hasAttachment: false,
    ...overrides,
  };
}

function baseParams(overrides: Partial<AutomodParams> = {}): AutomodParams {
  return {
    badWords: ['spamword'],
    protectedRoleIds: [],
    alertOnly: false,
    ...overrides,
  };
}

interface FakeLogger extends ModerationLogger {
  infos: Array<{ event: string; guildId?: string; userId?: string }>;
  errors: Array<{ event: string; guildId?: string; userId?: string; reason?: string }>;
}

function makeLogger(): FakeLogger {
  const logger: FakeLogger = {
    infos: [],
    errors: [],
    info(record) {
      logger.infos.push(record);
    },
    error(record) {
      logger.errors.push(record);
    },
  };
  return logger;
}

function permSet(granted: boolean): { has: (_flag: bigint) => boolean } {
  return { has: () => granted };
}

interface FakeMember {
  id: string;
  guild: FakeGuild;
  timeoutCalls: Array<{ ms: number; reason?: string }>;
  banCalls: Array<{ reason?: string }>;
  dms: string[];
  permissions: { has: (_flag: bigint) => boolean };
  roles: { cache: Map<string, unknown> };
  timeout: (ms: number, reason?: string) => Promise<unknown>;
  ban: (opts?: { reason?: string }) => Promise<unknown>;
  send: (text: string) => Promise<unknown>;
  failTimeout: boolean;
}

interface FakeGuild {
  id: string;
  members: {
    me: FakeMember | null;
    fetch: (userId: string) => Promise<FakeMember>;
  };
}

interface FakeChannel {
  sends: unknown[];
  bulkDeletes: Array<{ n: number; filterOld: boolean }>;
  send: (payload: unknown) => Promise<unknown>;
  bulkDelete: (n: number, filterOld: boolean) => Promise<unknown>;
}

function makeChannel(): FakeChannel {
  const channel: FakeChannel = {
    sends: [],
    bulkDeletes: [],
    send: async (payload: unknown) => {
      channel.sends.push(payload);
      return undefined;
    },
    bulkDelete: async (n: number, filterOld: boolean) => {
      channel.bulkDeletes.push({ n, filterOld });
      return undefined;
    },
  };
  return channel;
}

// NOTE: fake members hold NO permissions by default — an author with granted
// perms would trip the ManageMessages-holder never-fire guard. Only the bot
// member (guild.members.me, built by makeGuild) gets perms: true.
function makeMember(
  guild: FakeGuild,
  id: string,
  opts: { perms?: boolean; roles?: string[] } = {},
): FakeMember {
  const member: FakeMember = {
    id,
    guild,
    timeoutCalls: [],
    banCalls: [],
    dms: [],
    permissions: permSet(opts.perms ?? false),
    roles: { cache: new Map((opts.roles ?? []).map((r) => [r, {}] as [string, unknown])) },
    failTimeout: false,
    timeout: async (ms: number, reason?: string) => {
      if (member.failTimeout) throw new Error('hierarchy');
      member.timeoutCalls.push({ ms, reason });
      return undefined;
    },
    ban: async (bOpts?: { reason?: string }) => {
      member.banCalls.push({ reason: bOpts?.reason });
      return undefined;
    },
    send: async (text: string) => {
      member.dms.push(text);
      return undefined;
    },
  };
  return member;
}

function makeGuild(id: string, botPerms = true): FakeGuild {
  const guild: FakeGuild = {
    id: 'guild-1',
    members: {
      me: null,
      fetch: async (userId: string) => makeMember(guild, userId),
    },
  };
  guild.id = id;
  guild.members.me = makeMember(guild, 'bot-1', { perms: botPerms });
  return guild;
}

interface FakeMessage {
  deletes: number;
  asMessage: () => Message;
}

function makeMessage(opts: {
  text?: string;
  authorId?: string;
  bot?: boolean;
  system?: boolean;
  inGuild?: boolean;
  manageMessages?: boolean;
  roles?: string[];
  attachment?: boolean;
  guild?: FakeGuild;
  member?: FakeMember | null;
  channel?: FakeChannel;
}): FakeMessage & { channel: FakeChannel } {
  const guild = opts.guild ?? makeGuild('guild-1');
  const channel = opts.channel ?? makeChannel();
  const member =
    opts.member !== undefined
      ? opts.member
      : makeMember(guild, opts.authorId ?? 'user-1', {
          perms: opts.manageMessages ?? false,
          roles: opts.roles ?? [],
        });
  // ManageMessages holders are modelled via the member permissions flag.
  if (opts.manageMessages === true && member) {
    member.permissions = permSet(true);
  }
  const counter = { deletes: 0 };
  const holder: FakeMessage & { channel: FakeChannel } = {
    channel,
    get deletes() {
      return counter.deletes;
    },
    asMessage: () =>
      ({
        author: {
          id: opts.authorId ?? 'user-1',
          bot: opts.bot ?? false,
          system: opts.system ?? false,
        },
        guild: opts.inGuild === false ? null : guild,
        member: opts.inGuild === false ? null : member,
        content: opts.text ?? 'hello there',
        attachments: { size: opts.attachment === true ? 1 : 0 },
        channel,
        inGuild: () => opts.inGuild !== false,
        delete: async () => {
          counter.deletes += 1;
          return undefined;
        },
      }) as unknown as Message,
  };
  // For the holder-exempt guard the view reads message.member permissions;
  // emulate exemption by granting ManageMessages on the member when asked.
  if (opts.manageMessages === true && member) {
    member.permissions = permSet(true);
  }
  return holder;
}

interface FakeInteraction {
  replies: unknown[];
  asInteraction: () => ChatInputCommandInteraction;
}

function makeCommandInteraction(opts: {
  invokerManage?: boolean;
  guild?: FakeGuild | null;
  targetId?: string;
  reason?: string | null;
  minutes?: number;
}): FakeInteraction {
  const replies: unknown[] = [];
  const holder: FakeInteraction = {
    replies,
    asInteraction: () =>
      ({
        memberPermissions: permSet(opts.invokerManage ?? false),
        guild: opts.guild === undefined ? makeGuild('guild-1') : opts.guild,
        options: {
          getUser: (...args: unknown[]) => {
            void args;
            return { id: opts.targetId ?? 'target-1' };
          },
          getString: (...args: unknown[]) => {
            void args;
            return opts.reason ?? null;
          },
          getInteger: (...args: unknown[]) => {
            void args;
            return opts.minutes ?? 10;
          },
        },
        reply: async (payload: unknown) => {
          replies.push(payload);
          return undefined;
        },
      }) as unknown as ChatInputCommandInteraction,
  };
  return holder;
}

// ---------------------------------------------------------------------------
// Automod: never-fire guards
// ---------------------------------------------------------------------------

describe('automod never-fire guards', () => {
  const state = () => ({
    cooldown: new CooldownTracker(LINK_COOLDOWN_MS),
    ring: new SpamRing(),
  });

  it.each([
    ['author-bot', 'author-bot', baseView({ authorBot: true, text: 'spamword' })],
    ['author-system', 'author-system', baseView({ authorSystem: true, text: 'spamword' })],
    ['dm', 'dm', baseView({ inGuild: false, text: 'spamword' })],
    [
      'manage-messages-holder',
      'manage-messages-holder',
      baseView({ authorHasManageMessages: true, text: 'spamword' }),
    ],
    ['protected-id', 'protected', baseView({ authorId: 'vip-1', text: 'spamword' })],
    ['protected-role', 'protected', baseView({ authorRoleIds: ['mod-role'], text: 'spamword' })],
    ['alert-only', 'alert-only', baseView({ text: 'spamword' })],
  ])('ignore on %s', (label, reason, view) => {
    void label;
    const params =
      reason === 'protected'
        ? view.authorId === 'vip-1'
          ? baseParams({ protectedRoleIds: ['vip-1'] })
          : baseParams({ protectedRoleIds: ['mod-role'] })
        : baseParams(reason === 'alert-only' ? { alertOnly: true } : {});
    expect(checkMessage(view, params, state(), 1000)).toEqual({ verdict: 'ignore', reason });
  });
});

// ---------------------------------------------------------------------------
// Automod: content before cooldown, first-hit-wins
// ---------------------------------------------------------------------------

describe('automod ordering and first-hit-wins', () => {
  it('checks content before cooldown: fresh link is a hit with cooldown inactive', () => {
    const state = { cooldown: new CooldownTracker(LINK_COOLDOWN_MS), ring: new SpamRing() };
    const verdict = checkMessage(
      baseView({ text: 'see https://example.com/x' }),
      baseParams(),
      state,
      1000,
    );
    expect(verdict).toEqual({ verdict: 'hit', hit: 'link', cooldownActive: false });
  });

  it('bad-words wins over invite/link even when the link cooldown is armed', () => {
    const state = { cooldown: new CooldownTracker(LINK_COOLDOWN_MS), ring: new SpamRing() };
    // Arm the link cooldown first.
    checkMessage(baseView({ text: 'see https://example.com/x' }), baseParams(), state, 1000);
    // A bad-word message classifies as bad-words (never consults the cooldown).
    const verdict = checkMessage(
      baseView({ text: 'spamword plus https://example.com/x' }),
      baseParams(),
      state,
      2000,
    );
    expect(verdict).toEqual({ verdict: 'hit', hit: 'bad-words', cooldownActive: false });
  });

  it('first-hit-wins: bad-words > invite > link > attachment', () => {
    expect(checkContent('spamword join discord.gg/abc', ['spamword'])).toBe('bad-words');
    expect(checkContent('join discord.gg/abc https://example.com', ['spamword'])).toBe('invite');
    expect(checkContent('see https://example.com', ['spamword'])).toBe('link');
    expect(checkContent('plain text', ['spamword'], { hasAttachment: true })).toBe('attachment');
    expect(checkContent('plain text', ['spamword'])).toBeNull();
  });

  it('word boundaries keep class from matching a listed ass', () => {
    expect(checkContent('that class is great', ['ass'])).toBeNull();
    expect(checkContent('you ass', ['ass'])).toBe('bad-words');
  });

  it('m-35: the bad-words RegExp is compiled once per config, not per message', async () => {
    const { getBadWordsRe } = await import('./automod.js');
    const words = ['spamword', 'banned'];
    const first = getBadWordsRe(words);
    // A fresh array with the same words hits the cache: identical instance.
    expect(getBadWordsRe(['spamword', 'banned'])).toBe(first);
    expect(getBadWordsRe(['  spamword ', 'banned'])).toBe(first);
    // A different list compiles a different instance, still correct.
    const other = getBadWordsRe(['other']);
    expect(other).not.toBe(first);
    expect(checkContent('you spamword', words)).toBe('bad-words');
    expect(checkContent('clean text', words)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Automod: link/attachment cooldown + spam ring
// ---------------------------------------------------------------------------

describe('automod link cooldown', () => {
  it('second link inside 10s reports cooldown active; after 10s it clears', () => {
    const state = { cooldown: new CooldownTracker(LINK_COOLDOWN_MS), ring: new SpamRing() };
    const params = baseParams();
    expect(checkMessage(baseView({ text: 'https://a.example' }), params, state, 0)).toEqual({
      verdict: 'hit',
      hit: 'link',
      cooldownActive: false,
    });
    expect(checkMessage(baseView({ text: 'https://b.example' }), params, state, 9999)).toEqual({
      verdict: 'hit',
      hit: 'link',
      cooldownActive: true,
    });
    expect(checkMessage(baseView({ text: 'https://c.example' }), params, state, 10_000)).toEqual({
      verdict: 'hit',
      hit: 'link',
      cooldownActive: false,
    });
  });

  it('cooldown is per-user', () => {
    const state = { cooldown: new CooldownTracker(LINK_COOLDOWN_MS), ring: new SpamRing() };
    const params = baseParams();
    checkMessage(baseView({ authorId: 'u-a', text: 'https://a.example' }), params, state, 0);
    expect(
      checkMessage(baseView({ authorId: 'u-b', text: 'https://b.example' }), params, state, 1),
    ).toEqual({ verdict: 'hit', hit: 'link', cooldownActive: false });
  });
});

describe('automod spam ring', () => {
  const spamText = 'hello world this is a repeated raid message';

  it('warns exactly once per full similar ring (bulkDelete ask)', () => {
    const state = { cooldown: new CooldownTracker(LINK_COOLDOWN_MS), ring: new SpamRing() };
    const params = baseParams();
    let spamVerdicts = 0;
    for (let i = 0; i < 10; i += 1) {
      const v = checkMessage(baseView({ text: spamText }), params, state, i * 1000);
      if (v.verdict === 'spam') spamVerdicts += 1;
    }
    expect(spamVerdicts).toBe(1);
    // Warn-once: the 11th similar message stays quiet.
    const again = checkMessage(baseView({ text: spamText }), params, state, 10_000);
    expect(again.verdict).toBe('ignore');
  });

  it('dissimilar texts never complete a ring', () => {
    const state = { cooldown: new CooldownTracker(LINK_COOLDOWN_MS), ring: new SpamRing() };
    const params = baseParams();
    for (let i = 0; i < 10; i += 1) {
      const v = checkMessage(
        baseView({ text: `entirely unique message number ${i} zebra` }),
        params,
        state,
        i * 1000,
      );
      expect(v.verdict).toBe('ignore');
    }
  });

  it('bigram similarity is 1 for identical texts, low for unrelated ones', () => {
    expect(bigramSimilarity('hello world foo', 'hello world foo')).toBe(1);
    expect(bigramSimilarity('hello world foo bar', 'completely different zebra qux')).toBeLessThan(
      0.85,
    );
  });
});

// ---------------------------------------------------------------------------
// Module: MessageCreate wiring (delete + strike + ladder)
// ---------------------------------------------------------------------------

describe('moderation module MessageCreate', () => {
  // The module reads its params in start() (same pattern as the welcome
  // handler). Tests must start it with a badWords config or every message
  // is clean-ignored. Returns a stop() that halts the tempban poll.
  function startMod(mod: FeatureModule, params: Record<string, unknown>): () => void {
    const handle = mod.start?.({} as Client, {
      botId: 'bot-1',
      guildId: null,
      kind: 'moderation',
      params,
      specVersion: 1,
    });
    return () => {
      try {
        handle?.stop();
      } catch {
        // Ignore stop failures in tests.
      }
    };
  }

  function onMessageCreateOf(mod: FeatureModule): (message: Message) => Promise<void> {
    const handler = mod.events.find((e) => e.name === 'MessageCreate');
    if (!handler || handler.name !== 'MessageCreate') throw new Error('missing handler');
    return handler.execute;
  }

  it('bad-word message is deleted, strikes once, mutes 5m, DMs and records', async () => {
    const logger = makeLogger();
    const mod = buildModerationModule({ logger });
    const stop = startMod(mod, { badWords: ['spamword'] });
    try {
      const onCreate = onMessageCreateOf(mod);
      const guild = makeGuild('guild-1');
      const member = makeMember(guild, 'user-1');
      const fake = makeMessage({ text: 'oh spamword here', guild, member });
      await onCreate(fake.asMessage());
      expect(fake.deletes).toBe(1);
      expect(member.timeoutCalls).toEqual([
        { ms: 5 * 60_000, reason: expect.stringContaining('strike 1') as string },
      ]);
      expect(member.dms).toHaveLength(1);
      expect(logger.infos.some((r) => r.event === 'moderation-action')).toBe(true);
    } finally {
      stop();
    }
  });

  it('second strike escalates to mute 30m', async () => {
    const mod = buildModerationModule({ logger: makeLogger() });
    const stop = startMod(mod, { badWords: ['spamword'] });
    try {
      const onCreate = onMessageCreateOf(mod);
      const guild = makeGuild('guild-1');
      const member = makeMember(guild, 'user-1');
      await onCreate(makeMessage({ text: 'spamword one', guild, member }).asMessage());
      await onCreate(makeMessage({ text: 'spamword two', guild, member }).asMessage());
      expect(member.timeoutCalls[1]?.ms).toBe(30 * 60_000);
    } finally {
      stop();
    }
  });

  it('spam ring triggers warn plus bulkDelete ask exactly once', async () => {
    const mod = buildModerationModule({ logger: makeLogger() });
    const stop = startMod(mod, { badWords: ['spamword'] });
    try {
      const onCreate = onMessageCreateOf(mod);
      const guild = makeGuild('guild-1');
      const channel = makeChannel();
      const text = 'hello world this is a repeated raid message';
      for (let i = 0; i < 11; i += 1) {
        const member = makeMember(guild, 'spammer');
        await onCreate(
          makeMessage({ text, authorId: 'spammer', guild, member, channel }).asMessage(),
        );
      }
      expect(channel.bulkDeletes).toEqual([{ n: 10, filterOld: true }]);
      expect(channel.sends).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it('missing own perms: action skipped, logged, DM still sent, never throws', async () => {
    const logger = makeLogger();
    const mod = buildModerationModule({ logger });
    const stop = startMod(mod, { badWords: ['spamword'] });
    try {
      const onCreate = onMessageCreateOf(mod);
      const guild = makeGuild('guild-1', false);
      const member = makeMember(guild, 'user-1');
      await expect(
        onCreate(makeMessage({ text: 'spamword hi', guild, member }).asMessage()),
      ).resolves.toBeUndefined();
      expect(member.timeoutCalls).toHaveLength(0);
      expect(logger.errors.some((r) => r.event === 'moderation-missing-perms')).toBe(true);
      expect(member.dms).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it('timeout failure is logged, never thrown', async () => {
    const logger = makeLogger();
    const mod = buildModerationModule({ logger });
    const stop = startMod(mod, { badWords: ['spamword'] });
    try {
      const onCreate = onMessageCreateOf(mod);
      const guild = makeGuild('guild-1');
      const member = makeMember(guild, 'user-1');
      member.failTimeout = true;
      await expect(
        onCreate(makeMessage({ text: 'spamword hi', guild, member }).asMessage()),
      ).resolves.toBeUndefined();
      expect(logger.errors.some((r) => r.event === 'moderation-timeout-failed')).toBe(true);
      expect(member.dms).toHaveLength(1);
    } finally {
      stop();
    }
  });
});

// ---------------------------------------------------------------------------
// Module: /warn and /timeout commands
// ---------------------------------------------------------------------------

describe('moderation commands', () => {
  function commandsOf(logger: FakeLogger) {
    const mod = buildModerationModule({ logger });
    const warn = mod.commands.find((c) => c.data.name === 'warn');
    const timeout = mod.commands.find((c) => c.data.name === 'timeout');
    if (!warn || !timeout) throw new Error('commands missing');
    return { warn, timeout };
  }

  it('denied without ManageMessages: ephemeral reply, no strike', async () => {
    const logger = makeLogger();
    const { warn, timeout } = commandsOf(logger);
    const fakeWarn = makeCommandInteraction({ invokerManage: false });
    await warn.execute(fakeWarn.asInteraction());
    expect(fakeWarn.replies).toHaveLength(1);
    const payload = fakeWarn.replies[0] as { flags?: unknown };
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    const fakeTimeout = makeCommandInteraction({ invokerManage: false, minutes: 10 });
    await timeout.execute(fakeTimeout.asInteraction());
    expect(fakeTimeout.replies).toHaveLength(1);
    expect((fakeTimeout.replies[0] as { flags?: unknown }).flags).toBe(MessageFlags.Ephemeral);
  });

  it('/warn strikes and applies the ladder (mute 5m on strike 1)', async () => {
    const logger = makeLogger();
    const { warn } = commandsOf(logger);
    const guild = makeGuild('guild-1');
    const target = makeMember(guild, 'target-1');
    guild.members.fetch = async () => target;
    const fake = makeCommandInteraction({ invokerManage: true, guild, minutes: 10 });
    await warn.execute(fake.asInteraction());
    expect(target.timeoutCalls[0]?.ms).toBe(5 * 60_000);
    expect(target.dms).toHaveLength(1);
    expect(fake.replies).toHaveLength(1);
  });

  it('/timeout over the 28d limit: fallback logged, ephemeral reply, no timeout call', async () => {
    const logger = makeLogger();
    const { timeout } = commandsOf(logger);
    const guild = makeGuild('guild-1');
    const target = makeMember(guild, 'target-1');
    guild.members.fetch = async () => target;
    const fake = makeCommandInteraction({ invokerManage: true, guild, minutes: 99999 });
    await timeout.execute(fake.asInteraction());
    expect(target.timeoutCalls).toHaveLength(0);
    expect(logger.errors.some((r) => r.event === 'moderation-timeout-fallback')).toBe(true);
    expect((fake.replies[0] as { flags?: unknown }).flags).toBe(MessageFlags.Ephemeral);
  });

  it('/timeout applies a valid duration and DMs', async () => {
    const logger = makeLogger();
    const { timeout } = commandsOf(logger);
    const guild = makeGuild('guild-1');
    const target = makeMember(guild, 'target-1');
    guild.members.fetch = async () => target;
    const fake = makeCommandInteraction({ invokerManage: true, guild, minutes: 60 });
    await timeout.execute(fake.asInteraction());
    expect(target.timeoutCalls).toEqual([
      { ms: 60 * 60_000, reason: expect.stringContaining('Manual timeout') as string },
    ]);
    expect(target.dms).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ladder spot-checks through the module boundary + tempban poll
// ---------------------------------------------------------------------------

describe('ladder gap tolerance (module boundary)', () => {
  it('strike 4 folds to the 3-strike rung; 12+ folds to permaban', () => {
    expect(nextPunishment(4)?.strikes).toBe(3);
    expect(nextPunishment(10)?.strikes).toBe(9);
    expect(nextPunishment(12)?.durationMs).toBeNull();
  });
});

describe('tempban poll', () => {
  function fakeClient(guilds: Map<string, { unbanCalls: string[] }>): Client {
    return {
      guilds: {
        fetch: async (id: string) => {
          const g = guilds.get(id);
          if (!g) throw new Error('unknown guild');
          return {
            members: {
              unban: async (userId: string) => {
                g.unbanCalls.push(userId);
                return undefined;
              },
            },
          };
        },
      },
    } as unknown as Client;
  }

  it('unbans due rows with the injected clock and drops them', async () => {
    const storage = new InMemoryTempbanStorage();
    await storage.add({ guildId: 'g1', userId: 'u1', unbanAtMs: 5000, reason: 'temp' });
    await storage.add({ guildId: 'g1', userId: 'u2', unbanAtMs: 99999, reason: 'later' });
    const guilds = new Map([['g1', { unbanCalls: [] as string[] }]]);
    await pollTempbans(fakeClient(guilds), storage, { now: () => 10_000 });
    expect(guilds.get('g1')?.unbanCalls).toEqual(['u1']);
    expect(await storage.list()).toHaveLength(1);
  });

  it('guild fetch failure keeps the row for the next tick', async () => {
    const storage = new InMemoryTempbanStorage();
    await storage.add({ guildId: 'gone', userId: 'u1', unbanAtMs: 100, reason: 'temp' });
    const logger = makeLogger();
    await pollTempbans(fakeClient(new Map()), storage, {
      logger,
      now: () => 10_000,
    });
    expect(await storage.list()).toHaveLength(1);
    expect(logger.errors.some((r) => r.event === 'moderation-tempban-guild-error')).toBe(true);
  });

  it('unban throw still drops the row (no infinite retry)', async () => {
    const storage = new InMemoryTempbanStorage();
    await storage.add({ guildId: 'g1', userId: 'u9', unbanAtMs: 100, reason: 'temp' });
    const client = {
      guilds: {
        fetch: async () => ({
          members: {
            unban: async () => {
              throw new Error('already unbanned');
            },
          },
        }),
      },
    } as unknown as Client;
    const logger = makeLogger();
    await pollTempbans(client, storage, { logger, now: () => 10_000 });
    expect(await storage.list()).toHaveLength(0);
    expect(logger.errors.some((r) => r.event === 'moderation-tempban-unban-error')).toBe(true);
  });

  it('startTempbanPoll ticks every 60s and stop() halts it', async () => {
    expect(TEMPBAN_POLL_MS).toBe(60_000);
    vi.useFakeTimers();
    try {
      const storage = new InMemoryTempbanStorage();
      await storage.add({ guildId: 'g1', userId: 'u1', unbanAtMs: 1000, reason: 'temp' });
      const guilds = new Map([['g1', { unbanCalls: [] as string[] }]]);
      const logger = makeLogger();
      const poll = startTempbanPoll(fakeClient(guilds), storage, { logger, now: () => 5000 });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(guilds.get('g1')?.unbanCalls).toEqual(['u1']);
      poll.stop();
      await storage.add({ guildId: 'g1', userId: 'u2', unbanAtMs: 1000, reason: 'temp' });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(guilds.get('g1')?.unbanCalls).toEqual(['u1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('module start() wires the poll and returns stop', () => {
    vi.useFakeTimers();
    try {
      const mod = buildModerationModule({ logger: makeLogger() });
      const handle = mod.start?.({} as Client, null);
      expect(handle).toBeDefined();
      expect(typeof handle?.stop).toBe('function');
      handle?.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
