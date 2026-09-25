// Site-engine bridge A3: dispatcher unit tests (no login, no network).
// Fake interactions only; the clock is injected via the `now` provider.

import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createDispatcher } from './dispatcher.js';
import type { DispatcherLogger } from './dispatcher.js';
import { buildRegistry } from './registry.js';
import type { BotCommand } from './registry.js';

interface FakeInteraction {
  commandName: string;
  userId: string;
  chatInput: boolean;
  replied: boolean;
  deferred: boolean;
  replies: Array<{ kind: 'reply' | 'followUp'; content: unknown }>;
  replyFails: boolean;
  /** e5a1: deferReply tracking + queued defer failures (e.g. 429s). */
  defers: number;
  order: string[];
  deferErrors: unknown[];
  asInteraction(): Interaction;
}

function makeRateLimitError(retryAfterMs = 5): Error {
  const err = new Error('You are being rate limited.') as Error & { retryAfter: number };
  Object.defineProperty(err, 'name', { value: 'RateLimitError' });
  err.retryAfter = retryAfterMs;
  return err;
}

function makeFake(
  options: {
    commandName?: string;
    userId?: string;
    chatInput?: boolean;
    replied?: boolean;
    deferred?: boolean;
    replyFails?: boolean;
    deferErrors?: unknown[];
  } = {},
): FakeInteraction {
  const fake = {
    commandName: options.commandName ?? 'ping',
    userId: options.userId ?? 'user-1',
    chatInput: options.chatInput ?? true,
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
    replies: [],
    replyFails: options.replyFails ?? false,
    defers: 0,
    order: [],
    deferErrors: [...(options.deferErrors ?? [])],
    asInteraction: (): Interaction =>
      ({
        commandName: fake.commandName,
        user: { id: fake.userId },
        // Live getters: real Discord flips deferred after deferReply, and the
        // dispatcher's error-path branch reads interaction.deferred.
        get replied() {
          return fake.replied;
        },
        get deferred() {
          return fake.deferred;
        },
        isChatInputCommand: () => fake.chatInput,
        deferReply: async () => {
          fake.defers += 1;
          fake.order.push('defer');
          const next = fake.deferErrors.shift();
          if (next !== undefined) throw next;
          fake.deferred = true;
        },
        reply: async (payload: unknown) => {
          if (fake.replyFails) {
            throw new Error('reply transport failed');
          }
          fake.replies.push({ kind: 'reply', content: payload });
        },
        followUp: async (payload: unknown) => {
          if (fake.replyFails) {
            throw new Error('followUp transport failed');
          }
          fake.replies.push({ kind: 'followUp', content: payload });
        },
      }) as unknown as Interaction,
  } as FakeInteraction;
  return fake;
}

function makeCommand(options: {
  name?: string;
  cooldownSeconds?: number;
  execute?: (interaction: ChatInputCommandInteraction) => Promise<void>;
}): BotCommand {
  return {
    data: new SlashCommandBuilder().setName(options.name ?? 'ping').setDescription('test command'),
    cooldownSeconds: options.cooldownSeconds,
    execute: options.execute ?? (async () => undefined),
  };
}

function makeLogger(): DispatcherLogger & { infos: unknown[]; errors: unknown[] } {
  const infos: unknown[] = [];
  const errors: unknown[] = [];
  return {
    infos,
    errors,
    info: (record) => {
      infos.push(record);
    },
    error: (record) => {
      errors.push(record);
    },
  };
}

describe('createDispatcher', () => {
  it('ignores non-chat-input interactions without touching the registry', async () => {
    const execute = vi.fn(async () => undefined);
    const dispatcher = createDispatcher(
      buildRegistry([{ kind: 'status', commands: [makeCommand({ execute })], events: [] }]),
    );
    const fake = makeFake({ chatInput: false });
    await dispatcher.handleInteraction(fake.asInteraction());
    expect(execute).not.toHaveBeenCalled();
    expect(fake.replies).toHaveLength(0);
  });

  it('logs a missing command and returns without replying', async () => {
    const logger = makeLogger();
    const dispatcher = createDispatcher(buildRegistry([]), { logger });
    const fake = makeFake({ commandName: 'nope' });
    await dispatcher.handleInteraction(fake.asInteraction());
    expect(fake.replies).toHaveLength(0);
    expect(logger.infos).toHaveLength(1);
    expect(logger.infos[0]).toMatchObject({ event: 'dispatcher-unknown-command' });
  });

  it('denies the second call within the cooldown window (deterministic now)', async () => {
    let at = 1_000_000;
    const execute = vi.fn(async () => undefined);
    const dispatcher = createDispatcher(
      buildRegistry([
        { kind: 'status', commands: [makeCommand({ cooldownSeconds: 60, execute })], events: [] },
      ]),
      { now: () => at },
    );
    const first = makeFake();
    await dispatcher.handleInteraction(first.asInteraction());
    expect(execute).toHaveBeenCalledTimes(1);

    const second = makeFake();
    await dispatcher.handleInteraction(second.asInteraction());
    expect(execute).toHaveBeenCalledTimes(1);
    expect(second.replies).toHaveLength(1);
    expect(second.replies[0]?.kind).toBe('reply');

    at += 61_000;
    const third = makeFake();
    await dispatcher.handleInteraction(third.asInteraction());
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('m-31: a throwing command does not consume the cooldown window', async () => {
    let at = 1_000_000;
    let calls = 0;
    const dispatcher = createDispatcher(
      buildRegistry([
        {
          kind: 'status',
          commands: [
            makeCommand({
              cooldownSeconds: 60,
              execute: async () => {
                calls += 1;
                if (calls === 1) throw new Error('first boom');
              },
            }),
          ],
          events: [],
        },
      ]),
      { now: () => at },
    );
    // First call throws: no error reply asserted here, but the window must stay
    // open — the immediate retry 1s later must execute, not be denied.
    await dispatcher.handleInteraction(makeFake().asInteraction());
    expect(calls).toBe(1);
    at += 1_000;
    await dispatcher.handleInteraction(makeFake().asInteraction());
    expect(calls).toBe(2);
    // And the successful second call stamps the window: a third call 1s later
    // is denied without executing.
    at += 1_000;
    const denied = makeFake();
    await dispatcher.handleInteraction(denied.asInteraction());
    expect(calls).toBe(2);
    expect(denied.replies).toHaveLength(1);
  });

  it('applies no cooldown when cooldownSeconds is unset', async () => {
    const execute = vi.fn(async () => undefined);
    const dispatcher = createDispatcher(
      buildRegistry([{ kind: 'status', commands: [makeCommand({ execute })], events: [] }]),
    );
    await dispatcher.handleInteraction(makeFake().asInteraction());
    await dispatcher.handleInteraction(makeFake().asInteraction());
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('replies ephemerally via followUp when execute throws after the defer (post-e5a1)', async () => {
    const logger = makeLogger();
    const dispatcher = createDispatcher(
      buildRegistry([
        {
          kind: 'status',
          commands: [
            makeCommand({
              execute: async () => {
                throw new Error('boom');
              },
            }),
          ],
          events: [],
        },
      ]),
      { logger },
    );
    const fake = makeFake();
    await dispatcher.handleInteraction(fake.asInteraction());
    expect(fake.replies).toHaveLength(1);
    // e5a1 defers before execute, so execute's throw lands on a deferred
    // interaction and the honest error goes out as followUp, not reply.
    expect(fake.replies[0]?.kind).toBe('followUp');
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toMatchObject({ event: 'dispatcher-command-error' });
  });

  it('uses followUp when execute throws after the interaction was replied to', async () => {
    const dispatcher = createDispatcher(
      buildRegistry([
        {
          kind: 'status',
          commands: [
            makeCommand({
              execute: async () => {
                throw new Error('late boom');
              },
            }),
          ],
          events: [],
        },
      ]),
    );
    const fake = makeFake({ replied: true });
    await dispatcher.handleInteraction(fake.asInteraction());
    expect(fake.replies).toHaveLength(1);
    expect(fake.replies[0]?.kind).toBe('followUp');
  });

  it('never throws when the error reply itself fails', async () => {
    const dispatcher = createDispatcher(
      buildRegistry([
        {
          kind: 'status',
          commands: [
            makeCommand({
              execute: async () => {
                throw new Error('boom');
              },
            }),
          ],
          events: [],
        },
      ]),
    );
    const fake = makeFake({ replyFails: true });
    await expect(dispatcher.handleInteraction(fake.asInteraction())).resolves.toBeUndefined();
  });

  // e5a1 defer-first + 429 backoff (mocked interaction clock, no live Discord).

  it('defers before execute: a slow handler completes with no 10062 path', async () => {
    const order: string[] = [];
    const dispatcher = createDispatcher(
      buildRegistry([
        {
          kind: 'status',
          commands: [
            makeCommand({
              execute: async () => {
                // Stand-in for a handler slower than Discord's ~3s ack window:
                // ordering (defer first) is what avoids 10062, not a real timer.
                order.push('execute');
              },
            }),
          ],
          events: [],
        },
      ]),
      { sleep: async () => undefined },
    );
    const fake = makeFake();
    const innerExecute = fake.order;
    await dispatcher.handleInteraction(fake.asInteraction());
    expect(fake.defers).toBe(1);
    expect(innerExecute).toEqual(['defer']);
    expect(order).toEqual(['execute']);
    // No error-path reply: the slow handler succeeded on the deferred token.
    expect(fake.replies).toHaveLength(0);
    expect(fake.deferred).toBe(true);
  });

  it('backs off on 429 with retry-after and completes', async () => {
    const sleeps: number[] = [];
    const execute = vi.fn(async () => undefined);
    const dispatcher = createDispatcher(
      buildRegistry([{ kind: 'status', commands: [makeCommand({ execute })], events: [] }]),
      { sleep: async (ms: number) => void sleeps.push(ms) },
    );
    // First deferReply hits a 429 with retry-after 5ms; retry succeeds.
    const fake = makeFake({ deferErrors: [makeRateLimitError(5)] });
    await dispatcher.handleInteraction(fake.asInteraction());
    expect(fake.defers).toBe(2);
    expect(sleeps).toEqual([5]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fake.replies).toHaveLength(0);
  });

  it('exhausted 429 retries produce the honest error reply, never a crash', async () => {
    const logger = makeLogger();
    const execute = vi.fn(async () => undefined);
    const dispatcher = createDispatcher(
      buildRegistry([{ kind: 'status', commands: [makeCommand({ execute })], events: [] }]),
      { logger, maxRateLimitRetries: 1, sleep: async () => undefined },
    );
    const fake = makeFake({
      deferErrors: [makeRateLimitError(1), makeRateLimitError(1)],
    });
    await expect(dispatcher.handleInteraction(fake.asInteraction())).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(fake.replies).toHaveLength(1);
    expect(fake.replies[0]?.kind).toBe('reply');
    expect(String((fake.replies[0]?.content as { content?: unknown })?.content)).toMatch(
      /rate-limit/i,
    );
    expect(logger.errors).toContainEqual(
      expect.objectContaining({ event: 'dispatcher-ack-error' }),
    );
  });

  it('e5a1r: execute 429 is never retried — handler side effects run at most once', async () => {
    const logger = makeLogger();
    const execute = vi.fn(async () => {
      throw makeRateLimitError(5);
    });
    const dispatcher = createDispatcher(
      buildRegistry([{ kind: 'status', commands: [makeCommand({ execute })], events: [] }]),
      { logger, sleep: async () => undefined },
    );
    // Ack succeeds first try (no deferErrors), then execute itself hits a 429.
    // Narrowed retry must NOT re-run execute: exactly one call, honest
    // rate-limit error reply via followUp (deferred), no throw.
    const fake = makeFake();
    await expect(dispatcher.handleInteraction(fake.asInteraction())).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fake.defers).toBe(1);
    expect(fake.replies).toHaveLength(1);
    expect(fake.replies[0]?.kind).toBe('followUp');
    expect(String((fake.replies[0]?.content as { content?: unknown })?.content)).toMatch(
      /rate-limit/i,
    );
    expect(logger.errors).toContainEqual(
      expect.objectContaining({ event: 'dispatcher-command-error' }),
    );
  });
});
