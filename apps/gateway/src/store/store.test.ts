import { describe, expect, it } from 'vitest';
import { createStore } from './index.js';

interface RecordedCall {
  text: string;
  params?: unknown[];
}

function makeFakePool(rows: Array<{ xp: number }>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      calls.push({ text, params });
      return Promise.resolve({ rows: rows as T[] });
    },
  };
}

describe('store', () => {
  it('recordXp targets user_records with ON CONFLICT (bot_id, guild_id, member_id)', async () => {
    const pool = makeFakePool([{ xp: 10 }]);
    const store = createStore({ pool });
    await store.recordXp({ botId: 'b1', guildId: 'g1', memberId: 'm1', delta: 10 });
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].text).toContain('user_records');
    expect(pool.calls[0].text).toContain('ON CONFLICT (bot_id, guild_id, member_id)');
  });

  it('binds parameters instead of interpolating ids/deltas into SQL', async () => {
    const pool = makeFakePool([{ xp: 3 }]);
    const store = createStore({ pool });
    await store.recordXp({
      botId: 'bot-UNIQUE-1',
      guildId: 'guild-UNIQUE-2',
      memberId: 'mem-UNIQUE-3',
      delta: 3,
    });
    const { text, params } = pool.calls[0];
    expect(text).not.toContain('bot-UNIQUE-1');
    expect(text).not.toContain('guild-UNIQUE-2');
    expect(text).not.toContain('mem-UNIQUE-3');
    expect(params).toEqual(['bot-UNIQUE-1', 'guild-UNIQUE-2', 'mem-UNIQUE-3', 3]);
  });

  it('recordXp returns the new balance', async () => {
    const pool = makeFakePool([{ xp: 42 }]);
    const store = createStore({ pool });
    await expect(
      store.recordXp({ botId: 'b1', guildId: 'g1', memberId: 'm1', delta: 5 }),
    ).resolves.toBe(42);
  });

  it('getXp returns 0 on empty', async () => {
    const pool = makeFakePool([]);
    const store = createStore({ pool });
    await expect(store.getXp({ botId: 'b1', guildId: 'g1', memberId: 'm1' })).resolves.toBe(0);
  });

  it('flush resolves', async () => {
    const pool = makeFakePool([]);
    const store = createStore({ pool });
    await expect(store.flush()).resolves.toBeUndefined();
  });

  it('awaits the write before returning (no fire-and-forget)', async () => {
    let resolveQuery!: (value: { rows: Array<{ xp: number }> }) => void;
    const gate = new Promise<{ rows: Array<{ xp: number }> }>((resolve) => {
      resolveQuery = resolve;
    });
    const calls: RecordedCall[] = [];
    const pool = {
      calls,
      query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
        calls.push({ text, params });
        return gate as Promise<{ rows: T[] }>;
      },
    };
    const store = createStore({ pool });
    let settled = false;
    const pending = store
      .recordXp({ botId: 'b1', guildId: 'g1', memberId: 'm1', delta: 5 })
      .then((xp) => {
        settled = true;
        return xp;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    expect(calls).toHaveLength(1);
    resolveQuery({ rows: [{ xp: 5 }] });
    await expect(pending).resolves.toBe(5);
  });
});
