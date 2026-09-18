// Tests for POST /api/chat (V1-7i).
//
// The persona stream lane is mocked: this suite proves the auth/validation
// status shapes and the exact SSE framing the browser reader consumes. No test
// here hits the network or a provider.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const { chatStreamMock } = vi.hoisted(() => ({ chatStreamMock: vi.fn() }));

vi.mock('@/lib/ai/stream', () => ({ chatStream: chatStreamMock }));

import { USD_PER_CREDIT } from '@/lib/ai/cost';
import { __resetPool } from '@/lib/db/pool';
import {
  POST,
  __resetSessionReader,
  __setPool,
  __setSessionReader,
  validateChatBody,
  type ChatSession,
} from './route';

const SESSION: ChatSession = { accountId: 'acct-1', discordId: 'disc-1' };
const KEY_ENVS = ['WIRO_API_KEY', 'OPENROUTER_API_KEY'] as const;
const BOT = '11111111-2222-4333-8444-555555555555';

const savedKeys: Record<string, string | undefined> = {};

function actAs(session: ChatSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

function chatRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readFrames(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice('data:'.length).trim()) as Record<string, unknown>);
}

interface SpendCall {
  text: string;
  params: unknown[];
}

// Minimal pool stub: records the ai_spend INSERT so the suite can assert the
// exact column values without a database, and can be made to fail to prove the
// ledger write never breaks an in-flight stream.
function stubPool(options: { fail?: boolean } = {}): { pool: Pool; calls: SpendCall[] } {
  const calls: SpendCall[] = [];
  const pool = {
    query: (text: string, params: unknown[]): Promise<{ rows: unknown[] }> => {
      calls.push({ text, params });
      if (options.fail) {
        return Promise.reject(new Error('db down'));
      }
      return Promise.resolve({ rows: [{ id: 'spend-1' }] });
    },
  };
  return { pool: pool as unknown as Pool, calls };
}

let defaultSpend: ReturnType<typeof stubPool>;

beforeEach(() => {
  for (const name of KEY_ENVS) {
    savedKeys[name] = process.env[name];
    delete process.env[name];
  }
  chatStreamMock.mockReset();
  defaultSpend = stubPool();
  __setPool(defaultSpend.pool);
});

afterEach(() => {
  __resetSessionReader();
  for (const name of KEY_ENVS) {
    if (savedKeys[name] === undefined) delete process.env[name];
    else process.env[name] = savedKeys[name];
  }
});

describe('chat body validation (pure)', () => {
  it('accepts a message alone and trims it, with no botId', () => {
    expect(validateChatBody({ message: '  hi  ' })).toEqual({
      ok: true,
      value: { botId: null, message: 'hi', history: [] },
    });
  });

  it('accepts an optional uuid botId', () => {
    expect(validateChatBody({ botId: BOT, message: 'hello' })).toEqual({
      ok: true,
      value: { botId: BOT, message: 'hello', history: [] },
    });
  });

  it('accepts a bounded history tail and trims each turn', () => {
    expect(
      validateChatBody({
        message: 'and then?',
        history: [
          { role: 'user', content: '  first  ' },
          { role: 'assistant', content: 'done' },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        botId: null,
        message: 'and then?',
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'done' },
        ],
      },
    });
  });

  it('rejects a malformed history with 422', () => {
    const bad = [
      { history: 'nope' },
      { history: [{ role: 'system', content: 'x' }] },
      { history: [{ role: 'user', content: '' }] },
      { history: [{ role: 'user', content: 'x'.repeat(2001) }] },
      { history: [{ role: 'user' }] },
      { history: new Array(21).fill({ role: 'user', content: 'x' }) },
    ];
    for (const history of bad) {
      const result = validateChatBody({ message: 'hi', ...history });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    }
  });

  it('rejects an empty, whitespace-only, or oversize message with 422', () => {
    for (const message of ['', '   ', 'x'.repeat(2001)]) {
      const result = validateChatBody({ message });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    }
  });

  it('rejects a malformed botId with 422 and non-object bodies too', () => {
    expect(validateChatBody({ botId: 'nope', message: 'hi' })).toEqual({
      ok: false,
      status: 422,
      error: 'botId must be a uuid',
    });
    for (const body of [null, [], 'x', 7]) {
      expect(validateChatBody(body)).toEqual({
        ok: false,
        status: 422,
        error: 'body must be an object',
      });
    }
  });
});

describe('chat request shape without a stream', () => {
  it('returns 401 when unauthenticated, before validation', async () => {
    __resetSessionReader();
    const res = await POST(chatRequest({ message: '' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns 422 for a bad body with a valid session', async () => {
    actAs(SESSION);
    const res = await POST(chatRequest({ message: '' }));
    expect(res.status).toBe(422);
  });

  it('answers a plain 500 when no persona route has a key', async () => {
    actAs(SESSION);
    const res = await POST(chatRequest({ message: 'hi' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'AI is not configured yet' });
    expect(chatStreamMock).not.toHaveBeenCalled();
  });
});

describe('SSE framing (mocked persona lane)', () => {
  it('re-emits reasoning/content/done verbatim as data frames', async () => {
    process.env.WIRO_API_KEY = 'test-key';
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'reasoning', text: 'weighing it' };
        yield { t: 'content', text: 'Hello ' };
        yield { t: 'content', text: 'world' };
        yield { t: 'done', credits: 0.075 };
      })(),
    );
    actAs(SESSION);

    const res = await POST(chatRequest({ botId: BOT, message: '  hi  ' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    expect(await readFrames(res)).toEqual([
      { t: 'reasoning', text: 'weighing it' },
      { t: 'content', text: 'Hello ' },
      { t: 'content', text: 'world' },
      { t: 'done', credits: 0.075 },
    ]);
    expect(chatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'persona',
        messages: [{ role: 'user', content: 'hi' }],
        signal: expect.anything(),
      }),
    );
  });

  it('forwards the history tail ahead of the new message', async () => {
    process.env.WIRO_API_KEY = 'test-key';
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'ok' };
        yield { t: 'done', credits: 0.05 };
      })(),
    );
    actAs(SESSION);

    const res = await POST(
      chatRequest({
        message: 'and then?',
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'done' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(chatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'persona',
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'done' },
          { role: 'user', content: 'and then?' },
        ],
      }),
    );
  });

  it('turns a mid-stream throw into a final error frame, keeping prior content', async () => {
    process.env.WIRO_API_KEY = 'test-key';
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Partial' };
        throw new Error('provider died');
      })(),
    );
    actAs(SESSION);

    const res = await POST(chatRequest({ message: 'hi' }));
    expect(res.status).toBe(200);
    expect(await readFrames(res)).toEqual([
      { t: 'content', text: 'Partial' },
      { t: 'error', message: 'The reply stopped unexpectedly.' },
    ]);
    // No done frame -> no metered turn -> no ledger write.
    expect(defaultSpend.calls).toHaveLength(0);
  });
});

describe('ai_spend persistence (mocked persona lane)', () => {
  beforeEach(() => {
    process.env.WIRO_API_KEY = 'test-key';
  });

  it('records a NULL usd_cost/credits row when the provider reported no usage', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0, note: 'usage-unavailable' };
      })(),
    );
    actAs(SESSION);
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));
    expect(res.status).toBe(200);
    await readFrames(res);

    expect(spend.calls).toHaveLength(1);
    expect(spend.calls[0].text).toContain('INSERT INTO ai_spend');
    // account_id, model, usd_cost, credits, reason, ref_id — NULL, never 0.
    expect(spend.calls[0].params).toEqual(['acct-1', 'persona', null, null, 'persona-run', BOT]);
  });

  it('records provider-reported cost and derived credits on a metered done', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0.075 };
      })(),
    );
    actAs(SESSION);
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));
    await readFrames(res);

    const params = spend.calls[0].params;
    expect(params[0]).toBe('acct-1');
    expect(params[1]).toBe('persona');
    expect(params[2] as number).toBeCloseTo(0.075 * USD_PER_CREDIT, 12);
    expect(params[3] as number).toBeCloseTo(0.075, 12);
    expect(params[4]).toBe('persona-run');
    expect(params[5]).toBe(BOT);
  });

  it('leaves ref_id NULL when the turn carries no botId', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0.05 };
      })(),
    );
    actAs(SESSION);
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ message: 'hi' }));
    await readFrames(res);
    expect(spend.calls[0].params[5]).toBeNull();
  });

  it('does not break an in-flight stream when the spend write fails', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0.075 };
      })(),
    );
    actAs(SESSION);
    const spend = stubPool({ fail: true });
    __setPool(spend.pool);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await POST(chatRequest({ message: 'hi' }));
    expect(res.status).toBe(200);
    expect(await readFrames(res)).toEqual([
      { t: 'content', text: 'Hello' },
      { t: 'done', credits: 0.075 },
    ]);
    expect(spend.calls).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('names the real cause when the ledger fails because the database is not configured', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0.075 };
      })(),
    );
    actAs(SESSION);
    // Real unconfigured-pool path: unset DATABASE_URL and drop the cached pool
    // so getPool() hands back the stand-in whose query rejects with
    // DatabaseNotConfiguredError.
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetPool();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await POST(chatRequest({ message: 'hi' }));
      // The reply still streams: the ledger write is post-stream by design and
      // must never break the client. Only the server log is made honest.
      expect(res.status).toBe(200);
      expect(await readFrames(res)).toEqual([
        { t: 'content', text: 'Hello' },
        { t: 'done', credits: 0.075 },
      ]);
      expect(logged).toHaveBeenCalledWith(
        'chat: cannot record ai_spend - database not configured',
        expect.anything(),
      );
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
      __resetPool();
      logged.mockRestore();
    }
  });

  it('writes nothing when unauthenticated', async () => {
    __resetSessionReader();
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ message: 'hi' }));
    expect(res.status).toBe(401);
    expect(spend.calls).toHaveLength(0);
  });
});
