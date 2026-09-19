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
import { DatabaseNotConfiguredError, __resetPool } from '@/lib/db/pool';
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

// KI-033: the allowance gate reads the month's spend before the model call, so
// a pool stub now answers TWO statements. `spent` is what the SUM returns (a
// Postgres numeric comes back as a string, which the route must parse);
// `failSpent` rejects that read to prove the route refuses rather than
// silently treating an unreadable meter as zero. `insertError` fails only the
// ledger write, so the post-stream billing path can be exercised with a gate
// that still reads successfully.
function stubPool(
  options: {
    fail?: boolean;
    spent?: number | string;
    failSpent?: boolean;
    insertError?: Error;
  } = {},
): {
  pool: Pool;
  calls: SpendCall[];
} {
  const calls: SpendCall[] = [];
  const pool = {
    query: (text: string, params: unknown[]): Promise<{ rows: unknown[] }> => {
      calls.push({ text, params });
      if (text.includes('SUM(credits)')) {
        if (options.failSpent) {
          return Promise.reject(new Error('db down'));
        }
        return Promise.resolve({ rows: [{ spent: options.spent ?? '0' }] });
      }
      if (options.insertError) {
        return Promise.reject(options.insertError);
      }
      if (options.fail) {
        return Promise.reject(new Error('db down'));
      }
      return Promise.resolve({ rows: [{ id: 'spend-1' }] });
    },
  };
  return { pool: pool as unknown as Pool, calls };
}

// The ledger writes, isolated from the gate's spend read: an assertion about
// "nothing was recorded" or "exactly one row" must never be satisfied or broken
// by the read that the gate performs on every request.
function spendInserts(calls: SpendCall[]): SpendCall[] {
  return calls.filter((call) => call.text.includes('INSERT INTO ai_spend'));
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
    // No done frame -> no metered turn -> no ledger write (the gate's spend read
    // is not a write, so it must not be counted here).
    expect(spendInserts(defaultSpend.calls)).toHaveLength(0);
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

    const inserts = spendInserts(spend.calls);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].text).toContain('INSERT INTO ai_spend');
    // account_id, model, usd_cost, credits, reason, ref_id, attempt — NULL, never 0.
    expect(inserts[0].params).toEqual(['acct-1', 'persona', null, null, 'persona-run', BOT, null]);
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

    const params = spendInserts(spend.calls)[0].params;
    expect(params[0]).toBe('acct-1');
    expect(params[1]).toBe('persona');
    expect(params[2] as number).toBeCloseTo(0.075 * USD_PER_CREDIT, 12);
    expect(params[3] as number).toBeCloseTo(0.075, 12);
    expect(params[4]).toBe('persona-run');
    expect(params[5]).toBe(BOT);
    expect(params[6]).toBeNull();
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
    expect(spendInserts(spend.calls)[0].params[5]).toBeNull();
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
    expect(spendInserts(spend.calls)).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('names the real cause when the ledger write fails because the database is not configured', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0.075 };
      })(),
    );
    actAs(SESSION);
    // The gate reads the pool BEFORE the stream, so the pool must answer the
    // allowance read (empty month) while the ledger write is the one that hits
    // the real unconfigured path — that is the failure this test is about.
    const spend = stubPool({ insertError: new DatabaseNotConfiguredError() });
    __setPool(spend.pool);
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
      logged.mockRestore();
    }
  });

  it('answers a 500 and never streams when the database is not configured at all', async () => {
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'done', credits: 0.075 };
      })(),
    );
    actAs(SESSION);
    // Real unconfigured-pool path: unset DATABASE_URL and drop the cached pool
    // so getPool() hands back the stand-in whose query rejects with
    // DatabaseNotConfiguredError. KI-033 moved the first pool touch in front of
    // the stream (the allowance read), so an unconfigured process now refuses
    // honestly instead of opening a stream whose ledger write can never land.
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetPool();
    try {
      const res = await POST(chatRequest({ message: 'hi' }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'database not configured' });
      expect(chatStreamMock).not.toHaveBeenCalled();
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
      __resetPool();
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

// --- KI-033 gates (trial clock + monthly allowance) ---

// Byte-level lock from the KI-033 SPEC: the refusal the caller reads for an
// expired trial. Every surface that blocks on expiry carries this exact string.
const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

describe('KI-033 trial and allowance gates', () => {
  const EXPIRED: ChatSession = {
    accountId: 'acct-1',
    discordId: 'disc-1',
    trialEndsAt: new Date(Date.now() - 1),
  };
  const ACTIVE: ChatSession = {
    accountId: 'acct-1',
    discordId: 'disc-1',
    trialEndsAt: new Date(Date.now() + 86_400_000),
  };

  beforeEach(() => {
    // A key is configured for every test in this block, so a passing 200 is
    // always the gate letting the turn through and never the 500 "AI is not
    // configured yet" path standing in for it.
    process.env.WIRO_API_KEY = 'test-key';
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Hello' };
        yield { t: 'done', credits: 0.075 };
      })(),
    );
  });

  it('refuses an expired trial with 403 + the locked message, before any model call', async () => {
    actAs(EXPIRED);
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));

    expect(res.status).toBe(403);
    // A plain JSON body, never SSE: the client must be able to branch on a code.
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'trial_expired', message: TRIAL_ENDED_MESSAGE });
    expect(chatStreamMock).not.toHaveBeenCalled();
    expect(spend.calls).toHaveLength(0);
  });

  it('checks the clock before the body, so a malformed request cannot mask it', async () => {
    actAs(EXPIRED);
    __setPool(stubPool().pool);

    // `message: ''` would be a 422 for a live account. For an expired one the
    // verdict must stay 403 — the account state, not the request, is the answer.
    const res = await POST(chatRequest({ message: '' }));

    expect(res.status).toBe(403);
    expect(chatStreamMock).not.toHaveBeenCalled();
  });

  it('lets an active trial through to the model', async () => {
    actAs(ACTIVE);
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));

    expect(res.status).toBe(200);
    expect(await readFrames(res)).toHaveLength(2);
    expect(chatStreamMock).toHaveBeenCalledTimes(1);
    expect(spendInserts(spend.calls)).toHaveLength(1);
  });

  it('fails open when the session carries no clock at all', async () => {
    // A grandfathered row whose backfill never reached it, or a store with no
    // clock concept: "no clock" is NOT "expired" (KI-033 locked semantics).
    actAs({ accountId: 'acct-1', discordId: 'disc-1' });
    __setPool(stubPool().pool);

    const res = await POST(chatRequest({ message: 'hi' }));

    expect(res.status).toBe(200);
    expect(chatStreamMock).toHaveBeenCalledTimes(1);
  });

  it('fails open when the clock is an explicit null', async () => {
    actAs({ accountId: 'acct-1', discordId: 'disc-1', trialEndsAt: null });
    __setPool(stubPool().pool);

    const res = await POST(chatRequest({ message: 'hi' }));

    expect(res.status).toBe(200);
    expect(chatStreamMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses the clock for a paid tier', async () => {
    // The tiers are not sold yet; the bypass is coded so the gate cannot harden
    // into a wall the day one is. An expired clock on a paid account still runs.
    actAs({ ...EXPIRED, tier: 'pro' });
    __setPool(stubPool().pool);

    const res = await POST(chatRequest({ message: 'hi' }));

    expect(res.status).toBe(200);
    expect(chatStreamMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a turn that would cross the monthly allowance, before the model call', async () => {
    actAs(ACTIVE);
    // The persona estimate is 0.1024 credits, so 99.99 leaves exactly that much
    // headroom (99.99 + 0.1024 = 100.0924 > 100) — blocked by a tenth of a
    // credit. The stub returns the SUM as a STRING because Postgres hands a
    // numeric back that way; a route that skipped the parse would read NaN.
    const spend = stubPool({ spent: '99.99' });
    __setPool(spend.pool);

    const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'trial_budget_exceeded',
      // The trial is still running, so the copy must not claim it ended.
      message: 'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.',
    });
    expect(chatStreamMock).not.toHaveBeenCalled();
    expect(spendInserts(spend.calls)).toHaveLength(0);
  });

  it('allows a call landing exactly on the allowance', async () => {
    actAs(ACTIVE);
    // 99.90 + 0.1024 = 100.0024 would block, so the boundary case is stated
    // precisely: spent + estimate == allowance is allowed, one credit over is not.
    const spend = stubPool({ spent: '99.8976' });
    __setPool(spend.pool);

    const res = await POST(chatRequest({ message: 'hi' }));

    expect(res.status).toBe(200);
    expect(chatStreamMock).toHaveBeenCalledTimes(1);
  });

  it('refuses with a 500 when the allowance read fails, never a model call', async () => {
    actAs(ACTIVE);
    const spend = stubPool({ failSpent: true });
    __setPool(spend.pool);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(chatRequest({ message: 'hi' }));

      // An unreadable meter is a failure to check, not a verdict: the route
      // never reports "exceeded" for something it could not read, and never
      // lets the call through unchecked.
      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(chatStreamMock).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});
