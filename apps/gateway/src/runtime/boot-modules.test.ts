// Site-engine bridge wiring tests: boot-modules composition + attach.
// No network, no discord login, no secrets — a local fake client records
// on/off calls and is cast to Client at the boundary.

import type { Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { attachBotModules, composeBotModules } from './boot-modules.js';

type Handler = (...args: never[]) => void;

interface RecordedCall {
  method: 'on' | 'off';
  event: string;
  handler: Handler;
}

interface FakeClient {
  calls: RecordedCall[];
  asClient(): Client;
}

function makeFakeClient(): FakeClient {
  const calls: RecordedCall[] = [];
  const client = {
    on(event: string, handler: Handler): unknown {
      calls.push({ method: 'on' as const, event, handler });
      return client;
    },
    off(event: string, handler: Handler): unknown {
      calls.push({ method: 'off' as const, event, handler });
      return client;
    },
  };
  return {
    calls,
    asClient(): Client {
      return client as unknown as Client;
    },
  };
}

describe('composeBotModules', () => {
  it('returns modules in kind order', () => {
    expect(composeBotModules().map((module) => module.kind)).toEqual([
      'welcome',
      'moderation',
      'xp',
      'giveaway',
      'connector',
      'tickets',
      'reaction-roles',
    ]);
  });

  it('returns a fresh array on every call', () => {
    const first = composeBotModules();
    const second = composeBotModules();
    expect(first).not.toBe(second);
    expect(first.map((module) => module.kind)).toEqual(second.map((module) => module.kind));
    for (const [index, module] of first.entries()) {
      expect(module).not.toBe(second[index]);
    }
  });
});

describe('attachBotModules', () => {
  it('registers exactly one InteractionCreate listener and stop removes it', () => {
    const fake = makeFakeClient();
    const stop = attachBotModules(fake.asClient(), []);

    const added = fake.calls.filter(
      (call) => call.method === 'on' && call.event === 'interactionCreate',
    );
    expect(added).toHaveLength(1);

    stop();

    const removed = fake.calls.filter(
      (call) => call.method === 'off' && call.event === 'interactionCreate',
    );
    expect(removed).toHaveLength(1);
    expect(removed[0]?.handler).toBe(added[0]?.handler);
  });
});
