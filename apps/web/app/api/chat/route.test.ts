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
import { buildPersonaPrompt } from '@corvus/ai';
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

// An abort that has already fired: the client hung up before the stream wrote
// anything, so `req.signal` is aborted by the time the route's stream `start()`
// reads it (route.ts:469). Same body shape as `chatRequest`, so the only
// difference a test sees is the dead signal.
function abortedChatRequest(body: unknown): Request {
  const controller = new AbortController();
  controller.abort();
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
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
    failReserveOnly?: boolean;
  } = {},
): {
  pool: Pool;
  calls: SpendCall[];
} {
  const calls: SpendCall[] = [];
  let insertsSeen = 0;
  const pool = {
    query: (text: string, params: unknown[]): Promise<{ rows: unknown[] }> => {
      calls.push({ text, params });
      if (text.includes('SUM(credits)')) {
        if (options.failSpent) {
          return Promise.reject(new Error('db down'));
        }
        return Promise.resolve({ rows: [{ spent: options.spent ?? '0' }] });
      }
      if (text.includes('INSERT INTO ai_spend')) {
        insertsSeen += 1;
        if (options.failReserveOnly && insertsSeen === 1) {
          return Promise.reject(new Error('reserve down'));
        }
      }
      if (options.insertError && text.includes('INSERT INTO ai_spend')) {
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

// The reserve true-up: a metered turn keeps exactly one ledger row by turning
// its hold into the actual cost with one UPDATE (usd_cost, credits, id).
function spendUpdates(calls: SpendCall[]): SpendCall[] {
  return calls.filter((call) => call.text.startsWith('UPDATE ai_spend'));
}

// Worst-case reservation one turn holds: one worst-case persona call per route
// on the lane (3 routes x the single-call estimate), mirrored from the route so
// the tests pin the failover headroom instead of a magic number.
const RESERVE_CREDITS = 3 * ((1024 / 1_000_000) * (4.4 / USD_PER_CREDIT));

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
        messages: [
          { role: 'system', content: buildPersonaPrompt() },
          { role: 'user', content: 'hi' },
        ],
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
          { role: 'system', content: buildPersonaPrompt() },
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'done' },
          { role: 'user', content: 'and then?' },
        ],
      }),
    );
  });

  it('prepends the locked persona system prompt ahead of history plus message', async () => {
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
    await readFrames(res);

    const messages = chatStreamMock.mock.calls[0][0].messages;
    // New contract: the locked persona system prompt leads — history + message
    // follow unchanged. Fails if the system-message prepend is ever removed.
    expect(messages).toEqual([
      { role: 'system', content: buildPersonaPrompt() },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'and then?' },
    ]);
    expect(messages[0]).toEqual({ role: 'system', content: buildPersonaPrompt() });
  });

  it('writes an estimated spend row on a mid-stream throw (same shape as success)', async () => {
    process.env.WIRO_API_KEY = 'test-key';
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Partial' };
        throw new Error('provider died');
      })(),
    );
    actAs(SESSION);
    const spend = stubPool({ failReserveOnly: true });
    __setPool(spend.pool);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(chatRequest({ message: 'hi' }));
      expect(res.status).toBe(200);
      expect(await readFrames(res)).toEqual([
        { t: 'content', text: 'Partial' },
        { t: 'error', message: 'The reply stopped unexpectedly.' },
      ]);
      // The hold could not land, so the error path writes one estimated row —
      // NULL usd_cost/credits (usage-unavailable shape), same model/reason.
      // Two INSERT attempts are recorded (the rejected hold + the landed
      // fallback); the second is the row that counts.
      const inserts = spendInserts(spend.calls);
      expect(inserts).toHaveLength(2);
      expect(inserts[1].params).toEqual([
        'acct-1',
        'persona',
        null,
        null,
        'persona-run',
        null,
        null,
      ]);
      // m-25: the mid-stream cause is logged server-side, not swallowed.
      expect(logged).toHaveBeenCalledWith(
        'chat: persona stream failed mid-turn',
        expect.any(Error),
      );
    } finally {
      logged.mockRestore();
    }
  });

  it('keeps the reserve hold as the estimated row when it lands before the throw', async () => {
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
    // M-11: the default pool answers the hold, so no second write is needed —
    // exactly one row (the kept estimate), no true-up.
    expect(spendInserts(defaultSpend.calls)).toHaveLength(1);
    expect(spendUpdates(defaultSpend.calls)).toHaveLength(0);
  });

  // --- M-11 abort path pins (contract lock, not a defect fix) -------------
  //
  // These two tests pin what the route does TODAY when a turn dies without a
  // `done` frame. They lock the CURRENT contract deliberately; neither one
  // asserts that the current behavior is the RIGHT behavior.
  //
  // M-11's open product question: a turn that ends this way still burned real
  // provider tokens, and the row written here is an ESTIMATE (see the notes on
  // each test). Whether an aborted turn should WARN the account or be BACKFILLED
  // to the provider's real usage is a product call that is DEFERRED — not
  // decided by this file. So the spend logic in route.ts is untouched and no
  // assertion here should be "fixed" to match a future decision without that
  // decision being made first.
  //
  // Both tests force the reserve hold to FAIL (`failReserveOnly`), which is what
  // makes them reach the abort fallback branch (route.ts:460,
  // `else if (reservationId === null)`) instead of the hold-kept path the test
  // above already covers. Without that, the hold lands, the fallback branch
  // never runs, and these tests would pass even if the fallback write were
  // deleted — verified by guard-break (see the task report).
  it('writes an estimated spend row when the stream starts on an aborted request', async () => {
    process.env.WIRO_API_KEY = 'test-key';
    // The abort lands before the stream opens, so the lane yields nothing at
    // all — no content frame, no done frame, no error frame. This is the
    // bare-minimum aborted turn.
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        // no events
      })(),
    );
    actAs(SESSION);
    const spend = stubPool({ failReserveOnly: true });
    __setPool(spend.pool);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(abortedChatRequest({ message: 'hi' }));

      // The route still answers 200 + an empty stream: the disconnect is not the
      // route's error to report, and the client has already hung up.
      expect(res.status).toBe(200);
      expect(await readFrames(res)).toEqual([]);

      // M-11: the turn is NOT dropped from the ledger. Two INSERT attempts are
      // recorded — the rejected hold, then the landed fallback; the fallback is
      // the row that counts. Deliberately a length-2 assertion: if the abort
      // fallback write is ever removed, only the rejected hold remains and this
      // fails — that is what makes this a lock instead of a restatement.
      const inserts = spendInserts(spend.calls);
      expect(inserts).toHaveLength(2);
      const row = inserts[1];
      expect(row.text).toContain('INSERT INTO ai_spend');
      // The abort fallback writes the reserved worst case, NOT the provider's
      // real usage: route.ts:469-472 turns an aborted signal into
      // credits = the full failover-aware reserve, so the ledger holds an
      // ESTIMATE for a turn whose true cost is unknown (and may be $0 if the
      // provider never billed). account_id, model, usd_cost, credits, reason,
      // ref_id, attempt.
      expect(row.params[0]).toBe('acct-1');
      expect(row.params[1]).toBe('persona');
      expect(row.params[2] as number).toBeCloseTo(RESERVE_CREDITS * USD_PER_CREDIT, 12);
      expect(row.params[3] as number).toBeCloseTo(RESERVE_CREDITS, 12);
      expect(row.params[4]).toBe('persona-run');
      expect(row.params[6]).toBeNull();

      // No `done` frame ever arrived, so there is no actual cost to true up to.
      expect(spendUpdates(spend.calls)).toHaveLength(0);

      // The failed hold is logged, never swallowed silently.
      expect(logged).toHaveBeenCalledWith('chat: failed to reserve ai_spend', expect.any(Error));

      // CONTRACT NOTE (M-11) — the reason this pin exists: the monthly allowance
      // SUM (route.ts:134-136) adds the rows that exist. An abort that wrote NO
      // row would make the account's metered month read LOW, letting a
      // repeatedly aborted client spend past its grant. The row above is what
      // prevents that hole; the residual risk is the mirror image — an estimate
      // that is too HIGH for a turn the provider never billed, which is the
      // deferred warn-vs-backfill call. Do not delete this test to "simplify"
      // the file.
    } finally {
      logged.mockRestore();
    }
  });

  it('writes exactly one estimated row when the provider throws mid-stream despite the abort', async () => {
    process.env.WIRO_API_KEY = 'test-key';
    // Content already reached the wire before the provider died, so the abort
    // is racing a turn that had real cost — the case where dropping the row
    // would be most obviously wrong.
    chatStreamMock.mockImplementation(() =>
      (async function* () {
        yield { t: 'content', text: 'Partial' };
        throw new Error('provider died');
      })(),
    );
    actAs(SESSION);
    // Same reason as the test above: the hold must fail so the turn actually
    // enters the abort fallback branch with `done === null`.
    const spend = stubPool({ failReserveOnly: true });
    __setPool(spend.pool);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(abortedChatRequest({ message: 'hi' }));
      expect(res.status).toBe(200);
      // The mid-stream throw is converted to an error frame exactly as it is on
      // a live request (m-25); the abort does not swallow the cause.
      expect(await readFrames(res)).toEqual([
        { t: 'content', text: 'Partial' },
        { t: 'error', message: 'The reply stopped unexpectedly.' },
      ]);
      // m-25: the cause is logged, never silently lost.
      expect(logged).toHaveBeenCalledWith(
        'chat: persona stream failed mid-turn',
        expect.any(Error),
      );

      // M-11: still exactly one counted row — the fallback write is one INSERT,
      // and the throw does not add a second (two attempts total: the rejected
      // hold + the landed fallback).
      const inserts = spendInserts(spend.calls);
      expect(inserts).toHaveLength(2);
      // The abort check wins over the throw branch, so the row carries the
      // reserve estimate. This is the assertion that separates the two: the
      // NON-aborted throw path writes the NULL usage-unavailable row (usd_cost
      // and credits both null), so a regression that dropped the
      // `req.signal.aborted` check would flip params[2] to null and fail here
      // (verified by guard-break).
      expect(inserts[1].params[2] as number).toBeCloseTo(RESERVE_CREDITS * USD_PER_CREDIT, 12);
      expect(inserts[1].params[3] as number).toBeCloseTo(RESERVE_CREDITS, 12);
      expect(spendUpdates(spend.calls)).toHaveLength(0);
    } finally {
      logged.mockRestore();
    }
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
    // account_id, model, usd_cost, credits, reason, ref_id, attempt — the
    // usage-unavailable true-up NULLs the hold, never zeroes it.
    expect(inserts[0].params[0]).toBe('acct-1');
    expect(inserts[0].params[4]).toBe('persona-run');
    expect(inserts[0].params[5]).toBe(BOT);
    const updates = spendUpdates(spend.calls);
    expect(updates).toHaveLength(1);
    expect(updates[0].params).toEqual([null, null, 'spend-1']);
  });

  it('records provider-reported cost via reserve true-up: one row, zero extra inserts', async () => {
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

    // The hold is the only INSERT (the reservation), trued up to the actual
    // cost with one UPDATE — the turn stays at exactly one ledger row.
    const inserts = spendInserts(spend.calls);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].text).toContain('INSERT INTO ai_spend');
    // account_id, model, usd_cost, credits, reason, ref_id, attempt — the hold
    // carries the failover-aware reserve estimate.
    expect(inserts[0].params[0]).toBe('acct-1');
    expect(inserts[0].params[1]).toBe('persona');
    expect(inserts[0].params[2] as number).toBeCloseTo(RESERVE_CREDITS * USD_PER_CREDIT, 12);
    expect(inserts[0].params[3] as number).toBeCloseTo(RESERVE_CREDITS, 12);
    expect(inserts[0].params[4]).toBe('persona-run');
    expect(inserts[0].params[5]).toBe(BOT);
    expect(inserts[0].params[6]).toBeNull();

    const updates = spendUpdates(spend.calls);
    expect(updates).toHaveLength(1);
    expect(updates[0].params[0] as number).toBeCloseTo(0.075 * USD_PER_CREDIT, 12);
    expect(updates[0].params[1] as number).toBeCloseTo(0.075, 12);
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
    // The hold fails first (one logged reserve error), then the metered turn
    // falls back to the direct post-stream write — two INSERT attempts, one
    // true-up-free ledger row, stream never broken.
    expect(spendInserts(spend.calls)).toHaveLength(2);
    expect(spendUpdates(spend.calls)).toHaveLength(0);
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
    // The failover-aware reserve is 3 worst-case calls (~2.70336 credits), so
    // 99.99 leaves no headroom (99.99 + 2.70336 = 102.69336 > 100) — blocked
    // by over two credits. The stub returns the SUM as a STRING because
    // Postgres hands a numeric back that way; a route that skipped the parse
    // would read NaN.
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

  it('reserves the failover headroom before the model call, counting one route per attempt', async () => {
    actAs(ACTIVE);
    // 98.5 + single-call estimate (0.90112) = 99.40112 would PASS a one-call
    // check, but the failover-aware reserve (2.70336) projects 101.20336 and
    // must refuse: the gate keeps the grant literal even when two extra routes
    // might answer.
    const spend = stubPool({ spent: '98.5' });
    __setPool(spend.pool);

    const res = await POST(chatRequest({ message: 'hi' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'trial_budget_exceeded',
      message: 'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.',
    });
    expect(chatStreamMock).not.toHaveBeenCalled();
    expect(spendInserts(spend.calls)).toHaveLength(0);
  });

  it('reserves the turn before streaming so a concurrent turn reads the hold', async () => {
    actAs(ACTIVE);
    const spend = stubPool();
    __setPool(spend.pool);

    const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));
    expect(res.status).toBe(200);
    await readFrames(res);

    // The reserve INSERT (failover-aware estimate) lands before the true-up
    // UPDATE: a second turn admitted between them reads the hold in its SUM.
    const reserveIdx = spend.calls.findIndex((call) => call.text.includes('INSERT INTO ai_spend'));
    const trueUpIdx = spend.calls.findIndex((call) => call.text.startsWith('UPDATE ai_spend'));
    expect(reserveIdx).toBeGreaterThanOrEqual(0);
    expect(trueUpIdx).toBeGreaterThan(reserveIdx);
    const gateReadIdx = spend.calls.findIndex((call) => call.text.includes('SUM(credits)'));
    expect(gateReadIdx).toBeGreaterThanOrEqual(0);
    expect(reserveIdx).toBeGreaterThan(gateReadIdx);
    expect(chatStreamMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a direct post-stream write when the reserve cannot land', async () => {
    actAs(ACTIVE);
    const spend = stubPool({ failReserveOnly: true });
    __setPool(spend.pool);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(chatRequest({ botId: BOT, message: 'hi' }));
      expect(res.status).toBe(200);
      expect(await readFrames(res)).toEqual([
        { t: 'content', text: 'Hello' },
        { t: 'done', credits: 0.075 },
      ]);
      // The hold failed (logged, never thrown into the stream), so the metered
      // turn is recorded with the direct post-stream write instead — the first
      // INSERT rejects, the second lands, and no true-up UPDATE runs.
      expect(spendInserts(spend.calls)).toHaveLength(2);
      expect(spendUpdates(spend.calls)).toHaveLength(0);
      const retry = spendInserts(spend.calls)[1];
      expect(retry.params[2] as number).toBeCloseTo(0.075 * USD_PER_CREDIT, 12);
      expect(retry.params[3] as number).toBeCloseTo(0.075, 12);
      expect(logged).toHaveBeenCalledWith('chat: failed to reserve ai_spend', expect.any(Error));
    } finally {
      logged.mockRestore();
    }
  });

  it('allows a call landing exactly on the allowance', async () => {
    actAs(ACTIVE);
    // 97.29664 + 2.70336 = 100.0 lands exactly on the grant, so the boundary
    // case is stated precisely: spent + reserve == allowance is allowed, while
    // 97.31 (97.31 + 2.70336 = 100.01336 > 100) is not.
    const spend = stubPool({ spent: '97.29664' });
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
