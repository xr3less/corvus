// Moved from apps/web/lib/ai/ai.test.ts with the router/cost/lanes modules.
// Stub-fetch tests for the provider-agnostic model router: lane order,
// fallback on 5xx/429/network, 4xx visibility with a single extra attempt,
// missing-key and incompatible skips, empty-text failover, secret-free
// errors, cost math, and recordSpend (live PG when reachable, LOUD skip
// otherwise). No network calls: every provider HTTP call goes through an
// injected stub fetch; the real `fetch` is never touched.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractCost, recordSpend, SpendError, toCredits } from './cost.js';
import { ANTHROPIC_BASE_URL, DEEPSEEK_BASE_URL, LANES, OPENROUTER_BASE_URL } from './lanes.js';
import { chat, RouterError } from './router.js';
import type { AttemptRecord, FetchFn } from './router.js';

const ROUTER_ENV_KEYS = [
  'WIRO_API_KEY',
  'OPENROUTER_API_KEY',
  'ZAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'WIRO_BASE_URL',
] as const;

const FAKE_KEYS: Record<string, string> = {
  WIRO_API_KEY: 'test-wiro-key-fake',
  OPENROUTER_API_KEY: 'test-openrouter-key-fake',
  ZAI_API_KEY: 'test-zai-key-fake',
  DEEPSEEK_API_KEY: 'test-deepseek-key-fake',
  ANTHROPIC_API_KEY: 'test-anthropic-key-fake',
};

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ROUTER_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ROUTER_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function setFakeKeys(except: string[] = []): void {
  for (const [key, value] of Object.entries(FAKE_KEYS)) {
    if (!except.includes(key)) {
      process.env[key] = value;
    }
  }
}

type StubStep = { status: number; body: unknown } | { error: Error };

interface SeenRequest {
  url: string;
  init: RequestInit | undefined;
}

function makeStubFetch(steps: StubStep[]): { fetchFn: FetchFn; requests: SeenRequest[] } {
  const requests: SeenRequest[] = [];
  const fetchFn: FetchFn = (input, init) => {
    const step = steps[requests.length];
    requests.push({ url: input, init });
    if (!step) {
      throw new Error(`stub-fetch exhausted after ${steps.length} call(s) — retry loop?`);
    }
    if ('error' in step) {
      return Promise.reject(step.error);
    }
    return Promise.resolve(
      new Response(JSON.stringify(step.body), {
        status: step.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return { fetchFn, requests };
}

function okBody(text: string, cost?: number): unknown {
  return {
    choices: [{ message: { content: text } }],
    usage: cost === undefined ? {} : { cost },
  };
}

function readJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  const raw = init?.body;
  if (typeof raw !== 'string') {
    throw new Error('stub request missing JSON body');
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

function readHeaders(init: RequestInit | undefined): Record<string, string> {
  const headers = init?.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('stub request missing object headers');
  }
  return headers as Record<string, string>;
}

describe('lane table (locked order)', () => {
  it('orders builder across wiro, openrouter, zai, deepseek, then anthropic', () => {
    expect(LANES.builder.map((route) => route.label)).toEqual([
      'wiro-glm-5-2',
      'wiro-grok-4-1-fast',
      'wiro-sonnet-5',
      'openrouter-glm-5.3-flash',
      'zai-glm-5.3-flash',
      'deepseek-chat',
      'anthropic-sonnet-direct',
    ]);
  });

  it('orders persona grok first, then glm, then the openrouter fallback', () => {
    expect(LANES.persona.map((route) => route.label)).toEqual([
      'wiro-grok-4-1-fast',
      'wiro-glm-5-2',
      'openrouter-glm-5.3-flash',
    ]);
  });

  it('pins base URLs, key envs, and the inert anthropic route', () => {
    expect(LANES.builder[0].baseURL).toBe('https://llm.wiro.ai/v1');
    expect(LANES.builder[0].keyEnv).toBe('WIRO_API_KEY');
    expect(LANES.builder[0].model).toBe('glm/5-2');
    expect(LANES.builder[1].model).toBe('xai/grok-4-1-fast');
    expect(LANES.builder[3].baseURL).toBe(OPENROUTER_BASE_URL);
    expect(LANES.builder[3].model).toBe('z-ai/glm-5.3-flash');
    expect(LANES.builder[3].keyEnv).toBe('OPENROUTER_API_KEY');
    expect(LANES.builder[4].keyEnv).toBe('ZAI_API_KEY');
    expect(LANES.builder[5].baseURL).toBe(DEEPSEEK_BASE_URL);
    expect(LANES.builder[5].keyEnv).toBe('DEEPSEEK_API_KEY');
    const anthropic = LANES.builder[6];
    expect(anthropic.baseURL).toBe(ANTHROPIC_BASE_URL);
    expect(anthropic.keyEnv).toBe('ANTHROPIC_API_KEY');
    expect(anthropic.compatible).toBe(false);
  });
});

describe('chat routing', () => {
  it('sends the first healthy lane route with metered cost', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([{ status: 200, body: okBody('hi', 0.02) }]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.text).toBe('hi');
    expect(result.model).toBe('glm/5-2');
    expect(result.lane).toBe('builder');
    expect(result.providerCostUsd).toBe(0.02);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ label: 'wiro-glm-5-2', ok: true });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://llm.wiro.ai/v1/chat/completions');
    expect(readHeaders(requests[0].init).Authorization).toBe('Bearer test-wiro-key-fake');
    const body = readJsonBody(requests[0].init);
    expect(body).toMatchObject({
      model: 'glm/5-2',
      temperature: 0,
      max_tokens: 6000,
    });
    /* Probed live 2026-09-15: wiro glm/5-2 returns HTTP 400
       unsupported_capability for reasoning_effort:'low', and HTTP 200 without
       it, so the builder glm route must NOT send the flag. */
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('takes the persona lane first route with reasoning effort', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([{ status: 200, body: okBody('yo') }]);
    const result = await chat({
      lane: 'persona',
      messages: [{ role: 'user', content: 'yo' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.model).toBe('xai/grok-4-1-fast');
    expect(result.providerCostUsd).toBeNull();
    /* D-114: the trace needs streamed reasoning, which grok only emits with
       the flag (probed live 2026-09-13). */
    expect(readJsonBody(requests[0].init)).toMatchObject({ reasoning_effort: 'low' });
  });

  it('falls through 5xx to the next lane', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      { status: 500, body: { error: 'boom' } },
      { status: 200, body: okBody('recovered') },
    ]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.text).toBe('recovered');
    expect(result.model).toBe('xai/grok-4-1-fast');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({ label: 'wiro-glm-5-2', ok: false, status: 500 });
    expect(result.attempts[1]).toMatchObject({ label: 'wiro-grok-4-1-fast', ok: true });
  });

  it('falls through 429 to the next lane', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      { status: 429, body: { error: 'slow down' } },
      { status: 200, body: okBody('after-limit') },
    ]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.text).toBe('after-limit');
    expect(result.attempts[0]).toMatchObject({ ok: false, status: 429 });
  });

  it('falls through network errors and timeouts', async () => {
    setFakeKeys();
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    const { fetchFn } = makeStubFetch([
      { error: new TypeError('fetch failed') },
      { error: timeout },
      { status: 200, body: okBody('steady') },
    ]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.text).toBe('steady');
    expect(result.attempts.map((attempt) => attempt.error)).toEqual([
      'network',
      'timeout',
      undefined,
    ]);
  });

  it('records 4xx, tries one more route, then throws (no infinite retry)', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([
      { status: 403, body: { error: 'bad key' } },
      { status: 403, body: { error: 'bad key' } },
    ]);
    const failure = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    }).then(
      () => {
        throw new Error('chat should have thrown');
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RouterError);
    const routerError = failure as RouterError;
    expect(routerError.code).toBe('all_lanes_failed');
    expect(routerError.attempts).toHaveLength(2);
    expect(routerError.attempts[0]).toMatchObject({ ok: false, status: 403, error: 'http-4xx' });
    // Exactly two provider calls: the 4xx route plus one more, then throw.
    expect(requests).toHaveLength(2);
  });

  it('throws a bounded all_lanes_failed when every route 500s', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
    ]);
    await expect(
      chat({
        lane: 'persona',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 6000,
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: 'all_lanes_failed' });
    expect(requests).toHaveLength(3);
  });

  it('skips routes with missing keys and keeps going', async () => {
    setFakeKeys(['WIRO_API_KEY']);
    const { fetchFn } = makeStubFetch([{ status: 200, body: okBody('via-openrouter', 0.01) }]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.model).toBe('z-ai/glm-5.3-flash');
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts.slice(0, 3).map((attempt) => attempt.skipped)).toEqual([
      'no-key',
      'no-key',
      'no-key',
    ]);
    expect(result.attempts[3]).toMatchObject({ label: 'openrouter-glm-5.3-flash', ok: true });
  });

  it('skips the incompatible anthropic route and reports exhaustion', async () => {
    setFakeKeys(['WIRO_API_KEY', 'OPENROUTER_API_KEY', 'ZAI_API_KEY', 'DEEPSEEK_API_KEY']);
    const { fetchFn, requests } = makeStubFetch([]);
    const failure = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    }).then(
      () => {
        throw new Error('chat should have thrown');
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RouterError);
    const attempts: AttemptRecord[] = (failure as RouterError).attempts;
    expect(attempts).toHaveLength(7);
    expect(attempts[6]).toMatchObject({
      label: 'anthropic-sonnet-direct',
      skipped: 'incompatible',
    });
    expect(requests).toHaveLength(0);
  });

  it('treats empty text as failure and moves on', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      { status: 200, body: okBody('   ') },
      { status: 200, body: okBody('real') },
    ]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.text).toBe('real');
    expect(result.attempts[0]).toMatchObject({ ok: false, error: 'empty-text' });
  });

  it('treats malformed JSON as failure and moves on', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([{ status: 200, body: okBody('late') }]);
    let calls = 0;
    const flaky: FetchFn = (input, init) => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(new Response('not-json{', { status: 200 }));
      }
      return fetchFn(input, init);
    };
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn: flaky,
    });
    expect(result.text).toBe('late');
    expect(result.attempts[0]).toMatchObject({ ok: false, error: 'bad-json' });
  });

  it('carries attempts on the error with zero secret material', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
    ]);
    const failure = await chat({
      lane: 'persona',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    }).then(
      () => {
        throw new Error('chat should have thrown');
      },
      (error: unknown) => error,
    );
    const routerError = failure as RouterError;
    const serialized = JSON.stringify({
      message: String(routerError),
      attempts: routerError.attempts,
    });
    for (const secret of Object.values(FAKE_KEYS)) {
      expect(serialized).not.toContain(secret);
    }
    expect(routerError.attempts).toHaveLength(3);
  });

  it('honors the WIRO_BASE_URL override', async () => {
    setFakeKeys();
    process.env.WIRO_BASE_URL = 'https://stub.local:9/llm/';
    const { fetchFn, requests } = makeStubFetch([{ status: 200, body: okBody('stubbed') }]);
    const result = await chat({
      lane: 'builder',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 6000,
      fetchFn,
    });
    expect(result.text).toBe('stubbed');
    expect(requests[0].url).toBe('https://stub.local:9/llm/chat/completions');
  });
});

describe('cost math', () => {
  it('converts USD to credits at $0.005 each', () => {
    expect(toCredits(0.05)).toBe(10);
    expect(toCredits(0)).toBe(0);
    expect(toCredits(0.02)).toBe(4);
  });

  it('extracts provider-reported totals and nulls everything else', () => {
    expect(extractCost({ usage: { cost: 1.5 } })).toBe(1.5);
    expect(extractCost({ usage: { cost: 1.5, totalcost: 2 } })).toBe(1.5);
    expect(extractCost({ usage: { totalcost: 2 } })).toBe(2);
    expect(extractCost({ totalcost: 3 })).toBe(3);
    expect(extractCost({ usage: {} })).toBeNull();
    expect(extractCost({})).toBeNull();
    expect(extractCost(null)).toBeNull();
    expect(extractCost('cost')).toBeNull();
    expect(extractCost({ usage: { cost: '1.5' } })).toBeNull();
    expect(extractCost({ usage: { cost: Number.NaN } })).toBeNull();
    expect(extractCost({ usage: { cost: Number.POSITIVE_INFINITY } })).toBeNull();
    expect(extractCost({ usage: null, totalcost: Number.NaN })).toBeNull();
  });
});

describe('recordSpend validation (no PG)', () => {
  const explodingPool = {
    query: (): Promise<never> => Promise.reject(new Error('pool must not be called')),
  };

  it('rejects empty account, model, reason, and bad costs without touching the pool', async () => {
    await expect(
      recordSpend(explodingPool, { accountId: '  ', model: 'm', usdCost: 1, reason: 'r' }),
    ).rejects.toThrow(SpendError);
    await expect(
      recordSpend(explodingPool, { accountId: 'a', model: '', usdCost: 1, reason: 'r' }),
    ).rejects.toThrow(SpendError);
    await expect(
      recordSpend(explodingPool, { accountId: 'a', model: 'm', usdCost: 1, reason: '' }),
    ).rejects.toThrow(SpendError);
    await expect(
      recordSpend(explodingPool, { accountId: 'a', model: 'm', usdCost: -1, reason: 'r' }),
    ).rejects.toThrow(SpendError);
    await expect(
      recordSpend(explodingPool, { accountId: 'a', model: 'm', usdCost: Number.NaN, reason: 'r' }),
    ).rejects.toThrow(SpendError);
    await expect(
      recordSpend(explodingPool, {
        accountId: 'a',
        model: 'm',
        usdCost: Number.POSITIVE_INFINITY,
        reason: 'r',
      }),
    ).rejects.toThrow(SpendError);
  });

  it('inserts usd_cost + derived credits and returns the id', async () => {
    const seen: Array<{ text: string; params: unknown[] }> = [];
    const pool = {
      query: (text: string, params: unknown[]) => {
        seen.push({ text, params });
        return Promise.resolve({ rows: [{ id: 'spend-1' }] });
      },
    };
    const id = await recordSpend(pool, {
      accountId: 'account-1',
      model: 'wiro-glm-5-2',
      usdCost: 0.02,
      reason: 'builder-run',
      refId: 'ref-1',
    });
    expect(id).toBe('spend-1');
    expect(seen).toHaveLength(1);
    expect(seen[0].text).toContain('INSERT INTO ai_spend');
    expect(seen[0].params).toEqual(['account-1', 'wiro-glm-5-2', 0.02, 4, 'builder-run', 'ref-1']);
  });

  it('stores null credits for a null cost', async () => {
    const seen: Array<{ text: string; params: unknown[] }> = [];
    const pool = {
      query: (text: string, params: unknown[]) => {
        seen.push({ text, params });
        return Promise.resolve({ rows: [{ id: 'spend-2' }] });
      },
    };
    await recordSpend(pool, { accountId: 'a', model: 'm', usdCost: null, reason: 'r' });
    expect(seen[0].params).toEqual(['a', 'm', null, null, 'r', null]);
  });

  it('throws when the database returns no id', async () => {
    const pool = { query: () => Promise.resolve({ rows: [] }) };
    await expect(
      recordSpend(pool, { accountId: 'a', model: 'm', usdCost: 1, reason: 'r' }),
    ).rejects.toThrow(SpendError);
  });
});

const FALLBACK_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

let pgPool: Pool | null = null;
let pgSkipped = '';

beforeAll(async () => {
  const fromEnv = process.env.DATABASE_URL;
  const url = fromEnv && fromEnv.trim() !== '' ? fromEnv : FALLBACK_DATABASE_URL;
  const candidate = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await candidate.query('SELECT 1');
  } catch (error) {
    pgSkipped = `ai.test: SKIP — no Postgres reachable (set DATABASE_URL to run). Cause: ${
      (error as Error).message
    }`;
    await candidate.end().catch(() => undefined);
    return;
  }
  const table = await candidate.query(`SELECT to_regclass('public.ai_spend') AS name`);
  if ((table.rows[0] as { name: string | null }).name === null) {
    pgSkipped =
      'ai.test: SKIP — ai_spend table absent (owned by T-durable migration 0003_v12.sql).';
    await candidate.end().catch(() => undefined);
    return;
  }
  pgPool = candidate;
}, 30_000);

afterAll(async () => {
  await pgPool?.end().catch(() => undefined);
  pgPool = null;
});

describe('recordSpend on live PG', () => {
  it('round-trips ai_spend rows (or loud-skips without a database)', async () => {
    if (pgSkipped || !pgPool) {
      console.warn(pgSkipped || 'ai.test: SKIP — no database; set DATABASE_URL to run PG tests.');
      return;
    }
    const pool: Pool = pgPool;
    const account = await pool.query('INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id', [
      `router-test-${randomUUID()}`,
    ]);
    const accountId = (account.rows[0] as { id: string }).id;
    try {
      const spendId = await recordSpend(pool, {
        accountId,
        model: 'wiro-glm-5-2',
        usdCost: 0.02,
        reason: 'router-test',
        refId: randomUUID(),
      });
      expect(typeof spendId).toBe('string');
      const back = await pool.query(
        'SELECT usd_cost, credits, model, reason FROM ai_spend WHERE id = $1',
        [spendId],
      );
      expect(back.rows[0].model).toBe('wiro-glm-5-2');
      expect(Number(back.rows[0].usd_cost)).toBeCloseTo(0.02, 10);
      expect(Number(back.rows[0].credits)).toBeCloseTo(4, 10);
      const nullId = await recordSpend(pool, {
        accountId,
        model: 'wiro-glm-5-2',
        usdCost: null,
        reason: 'router-test-null',
      });
      const nullBack = await pool.query('SELECT usd_cost, credits FROM ai_spend WHERE id = $1', [
        nullId,
      ]);
      expect(nullBack.rows[0].usd_cost).toBeNull();
      expect(nullBack.rows[0].credits).toBeNull();
    } finally {
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
  });
});
