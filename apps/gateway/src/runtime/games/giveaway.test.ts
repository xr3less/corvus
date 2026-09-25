// Site-engine bridge A6: giveaway unit tests (fakes only, no Discord login).
//
// Covers: the partial Fisher-Yates draw (bots excluded by the caller,
// prior winners excluded), end-only-when-running and reroll-only-when-ended
// guards, and the 60s expiry poll with an injected clock.

import type { ChatInputCommandInteraction, Client, Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  buildGiveawayModule,
  drawWinners,
  fetchEntrantIds,
  findDue,
  InMemoryGiveawayStore,
  MAX_REACTION_PAGES,
  POLL_MS,
  pollGiveaways,
  REACTION_PAGE_SIZE,
} from './giveaway.js';
import type { GiveawayRow } from './giveaway.js';

describe('drawWinners', () => {
  it('draws unique winners from the pool', () => {
    const winners = drawWinners(['a', 'b', 'c', 'd'], 2, new Set(), () => 0);
    expect(winners).toEqual(['a', 'b']);
  });

  it('excludes bots (caller-filtered) and prior winners', () => {
    // Bots never reach the draw: fetchEntrantIds filters user.bot upstream.
    const entrants = ['human-1', 'human-2', 'human-3'];
    const fresh = drawWinners(entrants, 2, new Set(['human-1']), () => 0);
    expect(fresh).toEqual(['human-2', 'human-3']);
  });

  it('caps the draw at the pool size', () => {
    expect(drawWinners(['a'], 5, new Set(), () => 0)).toEqual(['a']);
    expect(drawWinners([], 1, new Set(), () => 0)).toEqual([]);
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

    const entrants = await fetchEntrantIds(message, '🎉');

    expect(entrants).toHaveLength(137);
    expect(new Set(entrants)).toEqual(new Set(ids));
    // Two pages: an uncursored first call, then one resuming from page 1's max.
    expect(afters).toEqual([undefined, ids[99]]);
  });

  it('draws winners from the complete entrant set, not just the first 100', async () => {
    // The regression: a bare fetch({}) returns the first 100 and entrant #137
    // can never win. With pagination the whole set is in the pool.
    const ids = paddedIds(137);
    const message = fakeMessageWithReactants(ids);
    const entrants = await fetchEntrantIds(message, '🎉');
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
    expect(await fetchEntrantIds(message, '🎉')).toHaveLength(30);
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
    expect(await fetchEntrantIds(message, '🎉')).toEqual([]);
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

    const entrants = await fetchEntrantIds(message, '🎉');

    expect(entrants).toHaveLength(100);
    expect(new Set(entrants)).toEqual(new Set(ids));
    expect(entrants).not.toContain('900001');
  });

  it('returns no entrants when the message has no reaction', async () => {
    const message = {
      reactions: { cache: new Map() },
    } as unknown as Message;
    expect(await fetchEntrantIds(message, '🎉')).toEqual([]);
  });
});

describe('findDue', () => {
  const running: GiveawayRow = {
    messageId: 'm1',
    guildId: 'g',
    channelId: 'c',
    title: 'prize',
    winners: 1,
    ends: 1_000,
    ended: false,
    winnerIds: [],
  };

  it('returns running rows whose end time has passed', () => {
    expect(findDue([running], 1_000)).toEqual([running]);
    expect(findDue([running], 999)).toEqual([]);
    expect(findDue([{ ...running, ended: true }], 2_000)).toEqual([]);
  });
});

function expiredRow(overrides: Partial<GiveawayRow> = {}): GiveawayRow {
  return {
    messageId: 'msg-1',
    guildId: 'guild-1',
    channelId: 'chan-1',
    title: 'Test prize',
    winners: 1,
    ends: 1_000,
    ended: false,
    winnerIds: [],
    ...overrides,
  };
}

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

function fakePollClient(message: Message): Client {
  return {
    guilds: {
      fetch: async (): Promise<unknown> => ({
        channels: {
          fetch: async (): Promise<unknown> => ({
            isTextBased: (): boolean => true,
            isDMBased: (): boolean => false,
            messages: { fetch: async (): Promise<unknown> => message },
          }),
        },
      }),
    },
  } as unknown as Client;
}

describe('pollGiveaways with injected clock', () => {
  it('expires due rows and edits the message with winners', async () => {
    const message = fakeMessageWithReactants(['winner-1', 'winner-2']);
    const edit = vi.spyOn(message, 'edit');
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow());
    await pollGiveaways(fakePollClient(message), store, { emoji: '🎉', now: () => 2_000 });
    const row = store.get('msg-1');
    expect(row?.ended).toBe(true);
    expect(row?.winnerIds).toHaveLength(1);
    expect(edit).toHaveBeenCalledOnce();
  });

  it('leaves not-yet-due rows untouched', async () => {
    const message = fakeMessageWithReactants(['winner-1']);
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow({ messageId: 'msg-2', ends: 9_999 }));
    store.get('msg-2');
    const target = store.get('msg-2');
    if (target === undefined) throw new Error('store failed to persist the row');
    await pollGiveaways(fakePollClient(message), store, { emoji: '🎉', now: () => 2_000 });
    expect(store.get('msg-2')?.ended).toBe(false);
  });

  it('uses the 60s poll interval', () => {
    expect(POLL_MS).toBe(60_000);
  });

  it('expires a 137-entrant giveaway after paging the whole reaction list', async () => {
    // End-to-end on the real poll path (no direct fetchEntrantIds call): the
    // fetch-call cursors are the deterministic proof that the draw pool was the
    // full 137, not the first page of 100 — a bare fetch would show 1 call.
    const ids = paddedIds(137);
    const afters: (string | undefined)[] = [];
    const message = fakeMessageWithReactants(
      ids,
      pagedUsersFetcher(ids, (a) => afters.push(a)),
    );
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow({ winners: 20 }));
    await pollGiveaways(fakePollClient(message), store, { emoji: '🎉', now: () => 2_000 });
    const row = store.get('msg-1');
    expect(row?.ended).toBe(true);
    expect(afters).toEqual([undefined, ids[99]]);
    expect(row?.winnerIds).toHaveLength(20);
    for (const id of row?.winnerIds ?? []) {
      expect(ids).toContain(id);
    }
  });
});

interface CapturedReply {
  content?: string;
  flags?: unknown;
}

function fakeSubcommandInteraction(opts: {
  sub: string;
  guildId?: string | null;
  manageGuild?: boolean;
  messageId?: string;
  client?: Client;
  onReply: (payload: CapturedReply) => void;
}): ChatInputCommandInteraction {
  return {
    guildId: opts.guildId === undefined ? 'guild-1' : opts.guildId,
    guild: opts.guildId === null ? null : ({ id: 'guild-1' } as unknown),
    client: opts.client ?? ({} as Client),
    memberPermissions: {
      has: (): boolean => opts.manageGuild ?? false,
    },
    options: {
      getSubcommand: (): string => opts.sub,
      getString: (name: string): string => {
        if (name === 'message-id') return opts.messageId ?? 'msg-1';
        return 'x';
      },
      getInteger: (name: string): number => (name === 'winners' ? 1 : 2),
    },
    channel: null,
    reply: async (payload: CapturedReply): Promise<void> => {
      opts.onReply(payload);
    },
  } as unknown as ChatInputCommandInteraction;
}

function giveawayCommandOf(store: InMemoryGiveawayStore) {
  const module = buildGiveawayModule({ store });
  const command = module.commands.find((entry) => entry.data.name === 'giveaway');
  if (command === undefined) throw new Error('giveaway module is missing /giveaway');
  return command;
}

async function replyOf(
  store: InMemoryGiveawayStore,
  opts: {
    sub: string;
    manageGuild?: boolean;
    messageId?: string;
  },
): Promise<CapturedReply> {
  const command = giveawayCommandOf(store);
  let captured: CapturedReply = {};
  await command.execute(
    fakeSubcommandInteraction({ ...opts, onReply: (payload) => (captured = payload) }),
  );
  return captured;
}

describe('/giveaway end and reroll guards', () => {
  it('denies callers without ManageGuild as ephemeral', async () => {
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow({ ended: true }));
    const reply = await replyOf(store, { sub: 'reroll', manageGuild: false });
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.content).toContain('Manage Server');
  });

  it('end rejects an already-ended giveaway', async () => {
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow({ ended: true, winnerIds: ['w1'] }));
    const reply = await replyOf(store, { sub: 'end', manageGuild: true });
    expect(reply.content).toContain('already ended');
  });

  it('reroll rejects a still-running giveaway', async () => {
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow({ ended: false }));
    const reply = await replyOf(store, { sub: 'reroll', manageGuild: true });
    expect(reply.content).toContain('not ended yet');
  });

  it('reroll skips prior winners when picking fresh ones', async () => {
    const message = fakeMessageWithReactants(['old-winner', 'fresh-1', 'fresh-2']);
    const edit = vi.spyOn(message, 'edit');
    const store = new InMemoryGiveawayStore();
    store.set(expiredRow({ ended: true, winnerIds: ['old-winner'], winners: 1 }));
    const command = giveawayCommandOf(store);
    let captured: CapturedReply = {};
    await command.execute(
      fakeSubcommandInteraction({
        sub: 'reroll',
        manageGuild: true,
        client: fakePollClient(message),
        onReply: (payload) => (captured = payload),
      }),
    );
    expect(captured.content).toBe('Giveaway rerolled.');
    expect(edit).toHaveBeenCalledOnce();
    // History is kept (prior winners stay in the record), but the fresh pick
    // excludes them: the new tail entry must be a fresh entrant.
    const ids = store.get('msg-1')?.winnerIds ?? [];
    expect(ids[0]).toBe('old-winner');
    expect(ids[ids.length - 1]).not.toBe('old-winner');
  });
});
