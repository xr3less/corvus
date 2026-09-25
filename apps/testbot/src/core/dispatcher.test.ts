// Unit tests for the InteractionCreate dispatcher.
// Fakes only — no network, no token, no discord.js gateway connection.

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createDispatcher } from './dispatcher.js';
import type { LogFn } from './dispatcher.js';
import type { BotCommand } from './registry.js';

interface SeenLog {
  level: string;
  event: string;
}

function makeLog(): { logFn: LogFn; seen: SeenLog[] } {
  const seen: SeenLog[] = [];
  const logFn: LogFn = (level, event) => {
    seen.push({ level, event });
  };
  return { logFn, seen };
}

function makeChatInteraction(
  opts: {
    commandName?: string;
    replied?: boolean;
    deferred?: boolean;
    failReply?: boolean;
  } = {},
) {
  const repliedWith: unknown[] = [];
  const followedUpWith: unknown[] = [];
  const reply = vi.fn((payload: unknown): Promise<void> => {
    repliedWith.push(payload);
    return opts.failReply ? Promise.reject(new Error('reply boom')) : Promise.resolve();
  });
  const followUp = vi.fn((payload: unknown): Promise<void> => {
    followedUpWith.push(payload);
    return Promise.resolve();
  });
  const interaction = {
    isChatInputCommand: (): boolean => true,
    commandName: opts.commandName ?? 'ping',
    replied: opts.replied ?? false,
    deferred: opts.deferred ?? false,
    reply,
    followUp,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, reply, followUp, repliedWith, followedUpWith };
}

function makeCommand(
  opts: {
    name?: string;
    guards?: BotCommand['guards'];
    execute?: BotCommand['execute'];
  } = {},
): BotCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(opts.name ?? 'ping')
      .setDescription('Trial ping command'),
    guards: opts.guards,
    execute:
      opts.execute ??
      (async (): Promise<void> => {
        // default no-op execute
      }),
  };
}

describe('createDispatcher', () => {
  it('ignores interactions that are not chat-input commands', async () => {
    const { logFn } = makeLog();
    const execute = vi.fn(async (): Promise<void> => undefined);
    const dispatch = createDispatcher([makeCommand({ execute })], logFn);
    const other = {
      isChatInputCommand: (): boolean => false,
    } as unknown as Interaction;
    await expect(dispatch(other)).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it('logs and returns for an unknown command without throwing', async () => {
    const { logFn, seen } = makeLog();
    const dispatch = createDispatcher([makeCommand()], logFn);
    const { interaction, reply, followUp } = makeChatInteraction({ commandName: 'nope' });
    await expect(dispatch(interaction)).resolves.toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
    expect(followUp).not.toHaveBeenCalled();
    expect(seen).toEqual([{ level: 'info', event: 'bot-unknown-command' }]);
  });

  it('replies ephemerally with the deny reason and skips execute when a guard denies', async () => {
    const { logFn } = makeLog();
    const execute = vi.fn(async (): Promise<void> => undefined);
    const dispatch = createDispatcher(
      [makeCommand({ execute, guards: [async () => 'Not for you.'] })],
      logFn,
    );
    const { interaction, reply, repliedWith } = makeChatInteraction();
    await expect(dispatch(interaction)).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(repliedWith[0]).toMatchObject({
      content: 'Not for you.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('first guard deny wins and later guards never run', async () => {
    const { logFn } = makeLog();
    const second = vi.fn(async (): Promise<string | null> => null);
    const execute = vi.fn(async (): Promise<void> => undefined);
    const dispatch = createDispatcher(
      [makeCommand({ execute, guards: [async () => 'First says no.', second] })],
      logFn,
    );
    const { interaction } = makeChatInteraction();
    await expect(dispatch(interaction)).resolves.toBeUndefined();
    expect(second).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('replies ephemerally on a fresh interaction when execute throws', async () => {
    const { logFn, seen } = makeLog();
    const execute = vi.fn(async (): Promise<void> => {
      throw new Error('kaboom');
    });
    const dispatch = createDispatcher([makeCommand({ execute })], logFn);
    const { interaction, reply, followUp, repliedWith } = makeChatInteraction();
    await expect(dispatch(interaction)).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(followUp).not.toHaveBeenCalled();
    expect(repliedWith[0]).toMatchObject({
      content: 'There was an error while executing this command.',
      flags: MessageFlags.Ephemeral,
    });
    expect(seen).toEqual([{ level: 'error', event: 'bot-command-error' }]);
  });

  it('uses followUp when execute throws on an already-deferred interaction', async () => {
    const { logFn } = makeLog();
    const execute = vi.fn(async (): Promise<void> => {
      throw new Error('kaboom');
    });
    const dispatch = createDispatcher([makeCommand({ execute })], logFn);
    const { interaction, reply, followUp, followedUpWith } = makeChatInteraction({
      deferred: true,
    });
    await expect(dispatch(interaction)).resolves.toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
    expect(followUp).toHaveBeenCalledTimes(1);
    expect(followedUpWith[0]).toMatchObject({
      content: 'There was an error while executing this command.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('swallows a throw from the error reply itself and still resolves', async () => {
    const { logFn } = makeLog();
    const execute = vi.fn(async (): Promise<void> => {
      throw new Error('kaboom');
    });
    const dispatch = createDispatcher([makeCommand({ execute })], logFn);
    const { interaction } = makeChatInteraction({ failReply: true });
    await expect(dispatch(interaction)).resolves.toBeUndefined();
  });
});
