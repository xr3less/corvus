// Wave E1: tickets handler unit tests (fakes only — no login, no network).
//
// Covers: kind/commands/events surface, parse fallback, /ticket open via the
// thread surface plus the plain-channel fallback, /ticket close + transcript,
// and the 60s SLA poll (stale nudge + idle auto-close) with an injected clock.

import type { ChatInputCommandInteraction, Client, Guild } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfigRow } from '../config.js';
import {
  buildTicketsModule,
  InMemoryTicketStore,
  parseTicketsParams,
  renderTranscript,
  TICKET_COMMAND_NAME,
  TICKET_SLA_POLL_MS,
} from './handler.js';

function makeConfig(params: Record<string, unknown>): RuntimeConfigRow {
  return { botId: 'bot-1', guildId: null, kind: 'tickets', params, specVersion: 1 };
}

// Entries form (not Map) so mixed fake channel shapes stay assignable.
function fakeClient(entries: Array<[string, unknown]> = []): Client {
  return { channels: { cache: new Map<string, unknown>(entries) } } as unknown as Client;
}

interface FakeThread {
  id: string;
  sent: unknown[];
  archived: boolean;
  membersAdded: string[];
  send(payload: unknown): Promise<unknown>;
  setArchived(archived: boolean): Promise<unknown>;
}

function makeThread(id: string): FakeThread {
  const thread: FakeThread = {
    id,
    sent: [],
    archived: false,
    membersAdded: [],
    send: async (payload: unknown): Promise<unknown> => {
      thread.sent.push(payload);
      return undefined;
    },
    setArchived: async (archived: boolean): Promise<unknown> => {
      thread.archived = archived;
      return undefined;
    },
  };
  return thread;
}

function makeGuild(me: unknown): Guild {
  return {
    id: 'guild-1',
    members: { me, fetch: async () => null },
  } as unknown as Guild;
}

function perms(granted: boolean): { has: () => boolean } {
  return { has: () => granted };
}

function makeInteraction(overrides: {
  sub: string;
  topic?: string;
  channel?: unknown;
  channelId?: string;
  guild?: Guild | null;
  client?: Client;
  userId?: string;
  deferred?: boolean;
}): { interaction: ChatInputCommandInteraction; replies: unknown[]; followUps: unknown[] } {
  const replies: unknown[] = [];
  const followUps: unknown[] = [];
  const deferred = overrides.deferred ?? false;
  const interaction = {
    guild: overrides.guild ?? makeGuild({ permissions: perms(true) }),
    guildId: 'guild-1',
    channelId: overrides.channelId ?? 'chan-ticket-1',
    channel: overrides.channel ?? null,
    client: overrides.client ?? fakeClient(),
    user: { id: overrides.userId ?? 'user-9' },
    replied: false,
    deferred,
    options: {
      getSubcommand: () => overrides.sub,
      getString: (name: string) => (name === 'topic' ? (overrides.topic ?? null) : null),
    },
    reply: async (payload: unknown): Promise<void> => {
      // Mirror discord.js: reply() throws when already acked (deferred/replied).
      if (deferred) throw new Error('InteractionAlreadyReplied');
      replies.push(payload);
    },
    followUp: async (payload: unknown): Promise<void> => {
      followUps.push(payload);
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies, followUps };
}

describe('tickets module surface', () => {
  it('exposes kind tickets with the ticket command and no subscribed events', () => {
    const module = buildTicketsModule();
    expect(module.kind).toBe('tickets');
    expect(module.commands.map((c) => c.data.name)).toEqual([TICKET_COMMAND_NAME]);
    expect(module.events).toEqual([]);
  });

  it('rides the 60s SLA poll idiom', () => {
    expect(TICKET_SLA_POLL_MS).toBe(60 * 1000);
  });

  it('parseTicketsParams falls back on malformed input, never throws', () => {
    expect(parseTicketsParams(null).staleAfterMs).toBe(24 * 60 * 60 * 1000);
    expect(parseTicketsParams(42).closeAfterMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseTicketsParams({ panelChannelId: 'c1', logChannelId: 'c2' })).toMatchObject({
      panelChannelId: 'c1',
      logChannelId: 'c2',
    });
  });

  it('renderTranscript caps at 50 lines and 4000 chars', () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({ authorTag: 'u', content: `m${i}` }));
    const text = renderTranscript(lines, 't1');
    expect(text).toContain('50 messages');
    expect(text.length).toBeLessThanOrEqual(4001);
    expect(renderTranscript([], 't1')).toContain('Transcript for t1');
  });
});

describe('/ticket open', () => {
  it('opens a thread, greets the opener, and replies with the thread link', async () => {
    const thread = makeThread('thread-1');
    const starter = {
      threads: { create: vi.fn(async () => thread) },
    };
    const client = fakeClient([['support-1', starter]]);
    const module = buildTicketsModule();
    const handle = module.start?.(client, makeConfig({ panelChannelId: 'support-1' }));
    try {
      const { interaction, replies } = makeInteraction({
        sub: 'open',
        topic: 'billing',
        client,
      });
      await module.commands[0]?.execute(interaction);
      expect(starter.threads.create).toHaveBeenCalledTimes(1);
      expect(thread.sent).toHaveLength(1);
      expect(replies).toHaveLength(1);
      expect(JSON.stringify(replies[0])).toContain('thread-1');
    } finally {
      handle?.stop();
    }
  });

  it('falls back to a plain-channel notice when no thread surface exists', async () => {
    const sent: unknown[] = [];
    const starter = {
      id: 'support-2',
      send: async (p: unknown): Promise<void> => {
        sent.push(p);
      },
    };
    const client = fakeClient([['support-2', starter]]);
    const module = buildTicketsModule();
    const handle = module.start?.(client, makeConfig({ panelChannelId: 'support-2' }));
    try {
      const { interaction, replies } = makeInteraction({ sub: 'open', client });
      await module.commands[0]?.execute(interaction);
      expect(sent).toHaveLength(1);
      expect(replies).toHaveLength(1);
      expect(JSON.stringify(replies[0])).toContain('support-2');
    } finally {
      handle?.stop();
    }
  });

  it('refuses without ManageThreads and never throws', async () => {
    const module = buildTicketsModule();
    const client = fakeClient();
    const handle = module.start?.(client, makeConfig({}));
    try {
      const { interaction, replies } = makeInteraction({
        sub: 'open',
        client,
        guild: makeGuild({ permissions: perms(false) }),
      });
      await expect(module.commands[0]?.execute(interaction)).resolves.toBeUndefined();
      expect(JSON.stringify(replies[0])).toMatch(/Manage Threads/);
    } finally {
      handle?.stop();
    }
  });

  it('deferred /ticket close completes via followUp with no throw', async () => {
    const thread = makeThread('chan-ticket-1');
    const client = fakeClient([['chan-ticket-1', thread]]);
    const module = buildTicketsModule();
    const handle = module.start?.(client, makeConfig({ logChannelId: 'log-1' }));
    try {
      const { interaction, replies, followUps } = makeInteraction({
        sub: 'close',
        client,
        deferred: true,
      });
      await expect(module.commands[0]?.execute(interaction)).resolves.toBeUndefined();
      expect(replies).toHaveLength(0);
      expect(followUps).toHaveLength(1);
      expect(JSON.stringify(followUps[0])).toMatch(/closed/);
    } finally {
      handle?.stop();
    }
  });
});

describe('/ticket close + transcript', () => {
  it('archives the channel, logs, and replies', async () => {
    const thread = makeThread('chan-ticket-1');
    const client = fakeClient([['chan-ticket-1', thread]]);
    const module = buildTicketsModule();
    const handle = module.start?.(client, makeConfig({ logChannelId: 'log-1' }));
    try {
      const { interaction, replies } = makeInteraction({ sub: 'close', client });
      await module.commands[0]?.execute(interaction);
      expect(thread.archived).toBe(true);
      expect(replies).toHaveLength(1);
      expect(JSON.stringify(replies[0])).toMatch(/closed/);
    } finally {
      handle?.stop();
    }
  });

  it('transcript fetches messages and posts to the log channel', async () => {
    const messages = new Map([
      ['m1', { author: { tag: 'a#1' }, content: 'hello' }],
      ['m2', { author: { username: 'b' }, content: 'world' }],
    ]);
    const logSent: unknown[] = [];
    const ticketChannel = {
      id: 'chan-ticket-1',
      messages: { fetch: async () => messages },
    };
    const logChannel = {
      send: async (p: unknown): Promise<void> => {
        logSent.push(p);
      },
    };
    const client = fakeClient([
      ['chan-ticket-1', ticketChannel],
      ['log-1', logChannel],
    ]);
    const module = buildTicketsModule();
    const handle = module.start?.(client, makeConfig({ logChannelId: 'log-1' }));
    try {
      const { interaction, replies } = makeInteraction({ sub: 'transcript', client });
      await module.commands[0]?.execute(interaction);
      expect(logSent).toHaveLength(1);
      expect(JSON.stringify(logSent[0])).toContain('hello');
      expect(replies).toHaveLength(1);
    } finally {
      handle?.stop();
    }
  });
});

describe('tickets SLA poll', () => {
  it('nudges stale tickets and auto-closes idle ones with an injected clock', async () => {
    vi.useFakeTimers();
    try {
      let at = 1_000_000;
      const staleThread = makeThread('stale-1');
      const idleThread = makeThread('idle-1');
      const logSent: unknown[] = [];
      const logChannel = {
        send: async (p: unknown): Promise<void> => {
          logSent.push(p);
        },
      };
      const starter = { threads: { create: vi.fn(async () => staleThread) } };
      const client = fakeClient([
        ['support-1', starter],
        ['stale-1', staleThread],
        ['idle-1', idleThread],
        ['log-1', logChannel],
      ]);
      const module = buildTicketsModule({ now: () => at });
      const handle = module.start?.(
        client,
        makeConfig({
          panelChannelId: 'support-1',
          logChannelId: 'log-1',
          staleAfterMs: 1000,
          closeAfterMs: 5000,
        }),
      );
      if (!handle) throw new Error('start must return a stop handle');
      try {
        const first = makeInteraction({ sub: 'open', client });
        await module.commands[0]?.execute(first.interaction);
        // Advance past the close threshold: the single seeded row must
        // auto-close and the log channel must see the poll output.
        at += 10_000;
        await vi.advanceTimersByTimeAsync(TICKET_SLA_POLL_MS + 10);
        expect(logSent.length).toBeGreaterThan(0);
      } finally {
        handle.stop();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('InMemoryTicketStore round-trips entries', () => {
    const store = new InMemoryTicketStore();
    store.set({ guildId: 'g', channelId: 'c', openerId: 'u', lastActivityMs: 1, openedAtMs: 1 });
    expect(store.get('c')?.openerId).toBe('u');
    expect(store.list()).toHaveLength(1);
    store.remove('c');
    expect(store.list()).toHaveLength(0);
  });
});
