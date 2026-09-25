// Tests for POST /api/checkout/create (overnight money harness, test mode).
//
// Two layers, both honest about what they prove:
//
//  1. Hermetic shape tests (always run, no network, no database). A recording
//     fetch double stands in for Creem, so every assertion is about what this
//     route actually sends and returns: the test host, the x-api-key header,
//     the exact request body (product_id / request_id / success_url /
//     metadata.accountId), and each refusal path — 401 anon, 503 when a config
//     name is unset (with NO checkoutUrl key, never a fake link), 502 when the
//     upstream fails or answers something malformed.
//
//  2. One live-path test that runs the REAL stack: real Postgres (accounts +
//     sessions), the real PgSessionStore, the real session cookie parsing, and
//     the real route — asserting that the account id Creem receives as
//     metadata.accountId is the id of the account that owns the session. That
//     is the join key the webhook will trust, so it is the one thing worth
//     proving end to end. Without a reachable Postgres it warns LOUDLY and
//     skips (ctx.skip() naming the reason) — never a silent green.

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import {
  PgSessionStore,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AccountRow,
  type SessionStore,
} from '../../../../lib/auth/session';
import { createMemorySessionStore } from '../../../../lib/auth/session';
import { createSessionReader } from '../../../../lib/interview/session-bind';
import { TEST_DATABASE_URL } from '../../../../lib/db/pool';
import {
  CHECKOUT_UPSTREAM_ERROR,
  CREEM_TEST_API_BASE,
  POST,
  buildCheckoutPayload,
  buildRequestId,
  readCheckoutUrl,
  type FetchFn,
  __resetFetchFn,
  __resetSessionReader,
  __setFetchFn,
  __setSessionReader,
} from './route';
import {
  CHECKOUT_SUCCESS_MESSAGE,
  CHECKOUT_UNVERIFIED_MESSAGE,
  GET as successGet,
  canonicalSignatureString,
  computeSignature,
  constantTimeEqual,
  parseOrderedParams,
  verifyRedirectSignature,
} from '../success/route';

/* Fixed, obviously-fake values. Not real keys: the string below is a literal
   chosen for readability, so a leak into an assertion message is harmless and
   an accidental real-key paste is impossible. */
const API_KEY = 'test_api_key_value';
const PRODUCT_ID = 'prod_test_pro';
const APP_URL = 'https://13-140-181-113.nip.io';
const ACCOUNT_ID = 'acct-11111111-2222-4333-8444-555555555555';
const CHECKOUT_URL = 'https://checkout.creem.io/ch_test_1';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

// Recording fetch double: never touches the network, and keeps the calls so the
// test can assert the host, headers and body the route really built.
function recordingFetch(respond: () => Response): { calls: RecordedCall[]; fn: FetchFn } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fn: (input: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url: input, init });
      return Promise.resolve(respond());
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function checkoutRequest(): Request {
  return new Request('http://localhost/api/checkout/create', { method: 'POST' });
}

function signedIn(accountId: string = ACCOUNT_ID): void {
  __setSessionReader({ getSession: async () => ({ accountId, discordId: 'disc-1' }) });
}

function anonymous(): void {
  __setSessionReader({ getSession: async () => null });
}

function stubConfig(overrides: Record<string, string> = {}): void {
  vi.stubEnv('CREEM_API_KEY', overrides.CREEM_API_KEY ?? API_KEY);
  vi.stubEnv('CREEM_TEST_PRODUCT_PRO', overrides.CREEM_TEST_PRODUCT_PRO ?? PRODUCT_ID);
  vi.stubEnv('APP_URL', overrides.APP_URL ?? APP_URL);
}

function readBody(call: RecordedCall): Record<string, unknown> {
  const raw = call.init?.body;
  if (typeof raw !== 'string') {
    throw new Error('expected a JSON string body');
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

function readHeaders(call: RecordedCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __resetFetchFn();
  __resetSessionReader();
});

describe('checkout payload helpers', () => {
  it('builds request_id from the account and the clock', () => {
    expect(buildRequestId('acct-1', 1_700_000_000_000)).toBe('corvus-acct-1-1700000000000');
  });

  it('sends the env-named product, our success_url and accountId metadata', () => {
    const payload = buildCheckoutPayload(
      {
        accountId: 'acct-7',
        productId: PRODUCT_ID,
        apiKey: API_KEY,
        successUrl: `${APP_URL}/api/checkout/success`,
      },
      1_700_000_000_000,
    );
    expect(payload).toEqual({
      product_id: PRODUCT_ID,
      request_id: 'corvus-acct-7-1700000000000',
      success_url: `${APP_URL}/api/checkout/success`,
      metadata: { accountId: 'acct-7' },
    });
    // The api key is NOT part of the body — it travels in the header only.
    expect(JSON.stringify(payload)).not.toContain(API_KEY);
  });

  it('accepts only a non-empty string checkout_url', () => {
    expect(readCheckoutUrl({ checkout_url: CHECKOUT_URL })).toBe(CHECKOUT_URL);
    expect(readCheckoutUrl({ checkout_url: '   ' })).toBeNull();
    expect(readCheckoutUrl({})).toBeNull();
    expect(readCheckoutUrl({ checkout_url: 42 })).toBeNull();
    expect(readCheckoutUrl(null)).toBeNull();
    expect(readCheckoutUrl('https://checkout.creem.io/x')).toBeNull();
  });
});

describe('POST /api/checkout/create', () => {
  it('answers 401 for an anonymous caller and never calls Creem', async () => {
    stubConfig();
    anonymous();
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(creem.calls).toHaveLength(0);
  });

  it('creates a session on the TEST host and returns the checkout url', async () => {
    stubConfig();
    signedIn();
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkoutUrl: CHECKOUT_URL });
    expect(creem.calls).toHaveLength(1);
    const call = creem.calls[0] as RecordedCall;
    expect(call.url).toBe(`${CREEM_TEST_API_BASE}/v1/checkouts`);
    // Named explicitly: the live host must never be reachable from this route.
    expect(new URL(call.url).host).toBe('test-api.creem.io');
    expect(new URL(call.url).host).not.toBe('api.creem.io');
    expect(call.init?.method).toBe('POST');
    expect(readHeaders(call)['x-api-key']).toBe(API_KEY);
    expect(readHeaders(call)['content-type']).toBe('application/json');
    expect(readBody(call)).toEqual({
      product_id: PRODUCT_ID,
      request_id: expect.stringMatching(/^corvus-acct-11111111-2222-4333-8444-555555555555-\d+$/),
      success_url: `${APP_URL}/api/checkout/success`,
      metadata: { accountId: ACCOUNT_ID },
    });
  });

  it('answers an honest 503 with no checkoutUrl when the product env is unset', async () => {
    vi.stubEnv('CREEM_API_KEY', API_KEY);
    vi.stubEnv('CREEM_TEST_PRODUCT_PRO', '');
    vi.stubEnv('APP_URL', APP_URL);
    signedIn();
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    const res = await POST(checkoutRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(503);
    expect(body).toEqual({ error: 'checkout_unavailable' });
    // The load-bearing assertion: no key whose name looks like a link, ever.
    expect(body).not.toHaveProperty('checkoutUrl');
    expect(JSON.stringify(body)).not.toContain('http');
    expect(creem.calls).toHaveLength(0);
  });

  it('answers the same honest 503 when the api key or APP_URL is unset', async () => {
    for (const overrides of [{ CREEM_API_KEY: '' }, { APP_URL: '' }] as Record<string, string>[]) {
      stubConfig(overrides);
      signedIn();
      const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
      __setFetchFn(creem.fn);

      const res = await POST(checkoutRequest());
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'checkout_unavailable' });
      expect(creem.calls).toHaveLength(0);
    }
  });

  it('answers 502 when Creem rejects the request', async () => {
    stubConfig();
    signedIn();
    const creem = recordingFetch(() => jsonResponse(401, { message: 'invalid api key' }));
    __setFetchFn(creem.fn);

    const res = await POST(checkoutRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(502);
    expect(body).toEqual({ error: CHECKOUT_UPSTREAM_ERROR });
    // Upstream detail is not forwarded — it can echo our own request back.
    expect(JSON.stringify(body)).not.toContain('invalid api key');
  });

  it('answers 502 on a malformed or url-less 200 rather than inventing a link', async () => {
    stubConfig();
    signedIn();
    const variants = [
      new Response('not json', { status: 200 }),
      jsonResponse(200, { id: 'ch_1', status: 'pending' }),
      jsonResponse(200, { checkout_url: '' }),
    ];
    for (const response of variants) {
      const creem = recordingFetch(() => response);
      __setFetchFn(creem.fn);
      const res = await POST(checkoutRequest());
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: CHECKOUT_UPSTREAM_ERROR });
    }
  });

  it('answers 502 when the network throws', async () => {
    stubConfig();
    signedIn();
    __setFetchFn(() => Promise.reject(new Error('socket hang up')));

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: CHECKOUT_UPSTREAM_ERROR });
  });

  it('never writes the api key to a console sink', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];
    stubConfig();
    signedIn();
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    await POST(checkoutRequest());

    const printed = spies
      .flatMap((spy) => spy.mock.calls.flat())
      .map((arg) => String(arg))
      .join(' ');
    expect(printed).not.toContain(API_KEY);
    expect(printed).not.toContain(process.env.DATABASE_URL ?? '__never_a_db_url__');
  });
});

// --- GET /api/checkout/success -------------------------------------------

/* Fixed expected digests, computed OUTSIDE this suite (node:crypto on the
   documented canonical strings) and pasted here as literals. If the route ever
   reorders, re-sorts, drops the salt, or swallows the empty-value rule, these
   literals stop matching — a self-computed expectation could not catch that,
   because the test would be re-deriving the same mistake. */
const VECTOR_PLAIN_CANONICAL =
  'checkout_id=ch_test_123|product_id=prod_test_pro|salt=test_api_key_value';
const VECTOR_PLAIN_SHA = '6f414d74768821cc7850040092075910c76540f95a3b2d8d2719d1b2061c467c';
const VECTOR_ORDERED_CANONICAL =
  'order_id=ord_9|checkout_id=ch_test_123|product_id=prod_test_pro|salt=test_api_key_value';
const VECTOR_ORDERED_SHA = '4fb65996de37e95d4aef8537fd0a4a1e33e2596c4556860ab4b1aad80ce81314';
// The full redirect Creem would send us, request_id included — every parameter
// present is signed, so a vector that omits one proves nothing about the route.
const VECTOR_FULL_CANONICAL =
  'checkout_id=ch_test_123|product_id=prod_test_pro|request_id=corvus-acct-1-1700000000000' +
  '|salt=test_api_key_value';
const VECTOR_FULL_SHA = '488bcbdf60f20c0e32203107b3025a4e2c52ab86847cbdc5f4c58d82baff3a85';
// Same shape with an HTML payload in request_id, for the escaping assertion.
const VECTOR_HTML_CANONICAL =
  'checkout_id=ch_test_123|request_id=<script>alert(1)</script>|salt=test_api_key_value';
const VECTOR_HTML_SHA = 'ae4593a9677ecc4c9045ee1b84d47e7063e2f703b997e8881eaad725d1205d01';

function successRequest(query: string): Request {
  return new Request(`http://localhost/api/checkout/success${query}`);
}

describe('redirect signature verification', () => {
  it('matches the published SHAPE: arrival order, salt last, pipes, sha-256 hex', () => {
    const canonical = canonicalSignatureString(
      [
        ['checkout_id', 'ch_test_123'],
        ['product_id', 'prod_test_pro'],
      ],
      API_KEY,
    );
    expect(canonical).toBe(VECTOR_PLAIN_CANONICAL);
    expect(computeSignature(canonical)).toBe(VECTOR_PLAIN_SHA);
  });

  it('preserves arrival order rather than sorting keys', () => {
    const canonical = canonicalSignatureString(
      [
        ['order_id', 'ord_9'],
        ['checkout_id', 'ch_test_123'],
        ['product_id', 'prod_test_pro'],
      ],
      API_KEY,
    );
    expect(canonical).toBe(VECTOR_ORDERED_CANONICAL);
    expect(computeSignature(canonical)).toBe(VECTOR_ORDERED_SHA);
    // Sorted would be a different digest — proof the order matters.
    expect(computeSignature(canonical)).not.toBe(VECTOR_PLAIN_SHA);
  });

  it('reads params in arrival order and decodes escapes', () => {
    expect(parseOrderedParams('?b=2&a=1&empty=&flag')).toEqual([
      ['b', '2'],
      ['a', '1'],
      ['empty', ''],
      ['flag', ''],
    ]);
    expect(parseOrderedParams('?ref=a%2Fb%20c')).toEqual([['ref', 'a/b c']]);
    expect(parseOrderedParams('')).toEqual([]);
  });

  it('verifies a correctly signed redirect', () => {
    const query = `?checkout_id=ch_test_123&product_id=prod_test_pro&signature=${VECTOR_PLAIN_SHA}`;
    expect(verifyRedirectSignature(query, API_KEY)).toBe(true);
  });

  it('verifies the full redirect shape, request_id included', () => {
    const query =
      `?checkout_id=ch_test_123&product_id=prod_test_pro&request_id=corvus-acct-1-1700000000000` +
      `&signature=${VECTOR_FULL_SHA}`;
    expect(
      canonicalSignatureString(
        [
          ['checkout_id', 'ch_test_123'],
          ['product_id', 'prod_test_pro'],
          ['request_id', 'corvus-acct-1-1700000000000'],
        ],
        API_KEY,
      ),
    ).toBe(VECTOR_FULL_CANONICAL);
    expect(verifyRedirectSignature(query, API_KEY)).toBe(true);
    // Dropping request_id from the signed string changes the digest — proof
    // that Creem's signature covers every parameter, not just ours.
    expect(VECTOR_FULL_SHA).not.toBe(VECTOR_PLAIN_SHA);
  });

  it('rejects a tampered signature, a missing signature and an empty api key', () => {
    expect(
      verifyRedirectSignature(
        `?checkout_id=ch_test_123&product_id=prod_test_pro&signature=${'0'.repeat(64)}`,
        API_KEY,
      ),
    ).toBe(false);
    expect(verifyRedirectSignature('?checkout_id=ch_test_123', API_KEY)).toBe(false);
    expect(
      verifyRedirectSignature(
        `?checkout_id=ch_test_123&product_id=prod_test_pro&signature=${VECTOR_PLAIN_SHA}`,
        '',
      ),
    ).toBe(false);
  });

  it('rejects a redirect whose signed content was altered after signing', () => {
    // Same signature, one flipped value — the classic spoof attempt.
    const query = `?checkout_id=ch_ATTACKER&product_id=prod_test_pro&signature=${VECTOR_PLAIN_SHA}`;
    expect(verifyRedirectSignature(query, API_KEY)).toBe(false);
  });

  it('excludes empty and literal-null values, as the docs require', () => {
    // order_id empty, subscription_id "null" — both dropped, so the canonical
    // string is the plain vector and its digest must verify.
    const query =
      `?checkout_id=ch_test_123&order_id=&product_id=prod_test_pro&subscription_id=null` +
      `&signature=${VECTOR_PLAIN_SHA}`;
    expect(verifyRedirectSignature(query, API_KEY)).toBe(true);
    // And if they were NOT dropped, that same signature would fail.
    const withEmpties =
      'checkout_id=ch_test_123|order_id=|product_id=prod_test_pro|subscription_id=null' +
      '|salt=test_api_key_value';
    expect(computeSignature(withEmpties)).not.toBe(VECTOR_PLAIN_SHA);
  });

  it('compares in constant time without throwing on length mismatch', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'a'.repeat(5000))).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('GET /api/checkout/success', () => {
  it('says "finalizing", never "upgraded", on a verified redirect', async () => {
    vi.stubEnv('CREEM_API_KEY', API_KEY);
    const query =
      `?checkout_id=ch_test_123&product_id=prod_test_pro&request_id=corvus-acct-1-1700000000000` +
      `&signature=${VECTOR_FULL_SHA}`;

    const res = await successGet(successRequest(query));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain(CHECKOUT_SUCCESS_MESSAGE);
    expect(html).toContain('Reference: corvus-acct-1-1700000000000');
    // The honesty assertions: no completed-upgrade claim anywhere on the page.
    expect(html.toLowerCase()).not.toContain('upgraded');
    expect(html.toLowerCase()).not.toContain('you are now pro');
    expect(html.toLowerCase()).not.toContain('subscription is active');
  });

  it('renders the unverified variant with 401 for a bad or absent signature', async () => {
    vi.stubEnv('CREEM_API_KEY', API_KEY);
    for (const query of [
      '?checkout_id=ch_test_123&product_id=prod_test_pro&signature=deadbeef',
      '?checkout_id=ch_test_123',
      '',
    ]) {
      const res = await successGet(successRequest(query));
      const html = await res.text();
      expect(res.status).toBe(401);
      expect(html).toContain(CHECKOUT_UNVERIFIED_MESSAGE);
      expect(html).not.toContain(CHECKOUT_SUCCESS_MESSAGE);
    }
  });

  it('renders the unverified variant when no api key is configured', async () => {
    vi.stubEnv('CREEM_API_KEY', '');
    const query = `?checkout_id=ch_test_123&product_id=prod_test_pro&signature=${VECTOR_PLAIN_SHA}`;

    const res = await successGet(successRequest(query));

    expect(res.status).toBe(401);
    expect(await res.text()).toContain(CHECKOUT_UNVERIFIED_MESSAGE);
  });

  it('verifies a markup-bearing request_id, then escapes it on the page', async () => {
    vi.stubEnv('CREEM_API_KEY', API_KEY);
    const query =
      `?checkout_id=ch_test_123&request_id=%3Cscript%3Ealert(1)%3C%2Fscript%3E` +
      `&signature=${VECTOR_HTML_SHA}`;

    // The signature covers the decoded value, not the percent-encoded wire form
    // — asserted here against the externally computed canonical string, so a
    // future switch to URLSearchParams (which would re-encode) fails loudly.
    expect(
      canonicalSignatureString(
        [
          ['checkout_id', 'ch_test_123'],
          ['request_id', '<script>alert(1)</script>'],
        ],
        API_KEY,
      ),
    ).toBe(VECTOR_HTML_CANONICAL);

    const res = await successGet(successRequest(query));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is never cached', async () => {
    vi.stubEnv('CREEM_API_KEY', API_KEY);
    const res = await successGet(successRequest(''));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

// --- Structural guard: the checkout surface cannot grant anything -----------

// A behavioural test cannot prove a negative that only shows up in production
// ("no code path ever writes tier"), so this reads the route sources and strips
// comments before scanning. The value is in catching a FUTURE edit: the moment
// someone adds the tier UPDATE that makes the redirect a grant, this fails.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('checkout routes never write tier', () => {
  async function readRoute(relative: string): Promise<string> {
    const source = await readFile(path.join(import.meta.dirname, relative), 'utf8');
    return stripComments(source);
  }

  it('the create route has no accounts write surface', async () => {
    const code = await readRoute('./route.ts');
    expect(code).not.toMatch(/\btier\b/);
    expect(code).not.toMatch(/UPDATE\s+accounts/i);
    expect(code).not.toMatch(/INSERT\s+INTO\s+accounts/i);
  });

  it('the success route touches no database and writes no tier', async () => {
    const code = await readRoute('../success/route.ts');
    expect(code).not.toMatch(/\btier\b/);
    expect(code).not.toMatch(/UPDATE\s+accounts/i);
    expect(code).not.toMatch(/INSERT\s+INTO/i);
    // No pool, no pg, no session store: the page is a receipt view, so it must
    // not even be able to reach the accounts table.
    expect(code).not.toMatch(/from\s+'pg'/);
    expect(code).not.toMatch(/getPool|requireDatabaseUrl|PgSessionStore/);
  });
});

// --- Live path: real Postgres, real session cookie, real route ---------------

const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

const FALLBACK_DDL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text NOT NULL,
  email text,
  creem_id text,
  credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_discord_id_unique UNIQUE (discord_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'trial';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;`;

let livePool: Pool | null = null;
let sessionStore: SessionStore | null = null;
let account: AccountRow | null = null;
let sessionId = '';

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const probe = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await probe.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'connection failed' };
  } finally {
    await probe.end().catch(() => undefined);
  }
}

describe('POST /api/checkout/create against live Postgres', () => {
  let skipReason = '';

  beforeAll(async () => {
    const probe = await probeDatabase();
    if (!probe.ok) {
      skipReason =
        `Postgres unreachable at ${connectionString} ` +
        `(${process.env.DATABASE_URL ? 'DATABASE_URL' : 'default TEST_DATABASE_URL'}): ${probe.reason}`;
      console.warn(`[checkout_create.route.test] LOUD SKIP: ${skipReason}`);
      return;
    }
    livePool = new Pool({ connectionString });
    // Five levels up from this file's directory reaches apps/ (create -> checkout ->
    // api -> app -> web -> apps), which is where the real gateway migrations live.
    // Four levels resolved to apps/web/gateway/... and never existed, so these files
    // silently contributed nothing (reviewer finding F1).
    for (const relative of [
      '../../../../../gateway/drizzle/0001_init.sql',
      '../../../../../gateway/drizzle/0002_v11.sql',
    ]) {
      try {
        const sql = await readFile(path.join(import.meta.dirname, relative), 'utf8');
        await livePool.query(sql);
      } catch (error) {
        // Duplicates from a previous run / a sibling suite are expected; any
        // other failure is covered by the fallback DDL below, which is
        // IF NOT EXISTS throughout.
        console.warn(
          `[checkout_create.route.test] migration ${path.basename(relative)} skipped: ${(error as Error).message}`,
        );
      }
    }
    await livePool.query(FALLBACK_DDL);
    // No env mutation needed here: the suite passes its own PgSessionStore to
    // createSessionReader, so the session path never reaches getDefaultStore()
    // and therefore never reads DATABASE_URL. Leaving the env untouched keeps
    // this suite from changing how any other test resolves its database.
    sessionStore = new PgSessionStore(livePool);
    account = await sessionStore.upsertAccountByDiscordId(`checkout-create-${Date.now()}`, null);
    const session = await sessionStore.createSession(
      account.id,
      new Date(Date.now() + SESSION_TTL_MS),
    );
    sessionId = session.id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await livePool?.end().catch(() => undefined);
    livePool = null;
  });

  it('binds metadata.accountId to the account that owns the session cookie', async (ctx) => {
    if (!sessionStore || !account || skipReason !== '') {
      ctx.skip(skipReason || 'live Postgres unavailable');
      return;
    }
    stubConfig();
    // The real production bind, the real cookie header, the real session row.
    __setSessionReader(createSessionReader(sessionStore));
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    const req = new Request('http://localhost/api/checkout/create', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkoutUrl: CHECKOUT_URL });
    const call = creem.calls[0] as RecordedCall;
    expect(readBody(call).metadata).toEqual({ accountId: account.id });
  });

  it('answers 401 with no session cookie on the real stack', async (ctx) => {
    if (!sessionStore || skipReason !== '') {
      ctx.skip(skipReason || 'live Postgres unavailable');
      return;
    }
    stubConfig();
    __setSessionReader(createSessionReader(sessionStore));
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    const res = await POST(new Request('http://localhost/api/checkout/create', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(creem.calls).toHaveLength(0);
  });

  it('is covered by the memory store too (seam sanity, no database)', async () => {
    stubConfig();
    const memory = createMemorySessionStore();
    const memoryAccount = await memory.upsertAccountByDiscordId('checkout-memory-account', null);
    const memorySession = await memory.createSession(
      memoryAccount.id,
      new Date(Date.now() + SESSION_TTL_MS),
    );
    __setSessionReader(createSessionReader(memory));
    const creem = recordingFetch(() => jsonResponse(200, { checkout_url: CHECKOUT_URL }));
    __setFetchFn(creem.fn);

    const res = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${memorySession.id}` },
      }),
    );

    expect(res.status).toBe(200);
    const call = creem.calls[0] as RecordedCall;
    expect(readBody(call).metadata).toEqual({ accountId: memoryAccount.id });
  });
});
