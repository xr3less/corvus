// Tests for GET /api/bots (KI-010 live list).
//
// Fake-pool shape tests always run (no database): auth-first, honest empty
// list, own-rows-only predicate, and a 500 when the query fails (never a fake
// 200). The Postgres path probes first and, when unreachable, warns LOUDLY and
// skips via ctx.skip() naming the reason (L-008/L-009) — never silent.

import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool, __setPool, TEST_DATABASE_URL } from '../../../lib/db/pool';
import {
  LIVE_BOT_COUNT_SQL,
  MINT_ACCOUNT_SQL,
  TRIAL_BOT_LIMIT_MESSAGE,
  TRIAL_EXPIRED_MESSAGE,
  mintGate,
  mintRefusal,
  type MintAccountRow,
} from '../../../lib/bots';
import {
  GET,
  LIST_BOTS_SQL,
  MINT_BOT_SQL,
  POST,
  __resetSessionReader,
  __setSessionReader,
  type ListSession,
} from './route';

const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

const OWNER: ListSession = { accountId: 'acct-owner', discordId: 'disc-owner' };

const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = '66666666-7777-4888-8999-000000000000';

/* Clocks are literals relative to the run, never `new Date()` comparisons in
   assertions: an hour of margin on either side means the test cannot flake on
   a slow machine. */
const NOW_PLUS_HOUR = new Date(Date.now() + 3_600_000).toISOString();
const NOW_MINUS_HOUR = new Date(Date.now() - 3_600_000).toISOString();

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const probe = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await probe.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'connection failed' };
  } finally {
    await probe.end().catch(() => {});
  }
}

const probe = await probeDatabase();
const skipReason =
  `Postgres unreachable at ${connectionString} ` +
  `(${process.env.DATABASE_URL ? 'DATABASE_URL' : 'default TEST_DATABASE_URL'}): ${probe.reason}`;
if (!probe.ok) {
  console.warn(
    `[bots.route.test] LOUD SKIP: ${skipReason}. Start the test container, then re-run.`,
  );
}

// Inline fallback DDL matching the sibling migration (0001_init) verbatim for
// the columns this route reads. Read first; this only covers an unreadable
// migration.
const FALLBACK_DDL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  email text,
  creem_id text,
  credits numeric NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  name text NOT NULL,
  token_cipher bytea NOT NULL,
  prod_spec_id uuid,
  draft_spec_id uuid,
  status text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

let livePool: Pool | null = null;
let pgReady = false;

async function ensurePg(): Promise<void> {
  if (pgReady) {
    return;
  }
  livePool = new Pool({ connectionString });
  __setPool(livePool);
  try {
    const sql = await readFile(
      new URL('../../../../gateway/drizzle/0001_init.sql', import.meta.url),
      'utf8',
    );
    await livePool.query(sql);
  } catch {
    // Sibling migration unreadable — the fallback DDL below covers it.
  }
  await livePool.query(FALLBACK_DDL);
  // Self-heal for the cross-workspace shared-DB path: real migrations may have
  // applied on an older tree lacking 0010, or vice versa. Best-effort — loud
  // warn, never fail the hook on repair DDL.
  try {
    await livePool.query(TRIAL_COLUMN_DDL);
  } catch (error) {
    console.warn(
      `[bots.route.test] self-heal accounts.trial_ends_at failed: ${(error as Error).message}`,
    );
  }
  pgReady = true;
}

/* The KI-033 clock is set explicitly per row: `null` means "no clock at all"
   (the fail-open case) and is therefore distinct from omitting the argument,
   which floors the row 1 hour in the past (an expired account). Defaults to a
   clock 1 hour out so every pre-existing caller mints as a still-running
   trial — the accounts those tests assert against were never about the clock. */
async function makeAccount(
  discordId: string,
  trialEndsAt: string | null = NOW_PLUS_HOUR,
): Promise<string> {
  const active = livePool as Pool;
  const row = await active.query<{ id: string }>(
    `INSERT INTO accounts (discord_id, trial_ends_at) VALUES ($1, $2::timestamptz) RETURNING id`,
    [discordId, trialEndsAt],
  );
  return row.rows[0].id;
}

async function setTrialClock(accountId: string, trialEndsAt: string | null): Promise<void> {
  await (livePool as Pool).query(
    'UPDATE accounts SET trial_ends_at = $2::timestamptz WHERE id = $1',
    [accountId, trialEndsAt],
  );
}

async function setTier(accountId: string, tier: string): Promise<void> {
  await (livePool as Pool).query('UPDATE accounts SET tier = $2 WHERE id = $1', [accountId, tier]);
}

async function liveBotCount(accountId: string): Promise<number> {
  const counted = await (livePool as Pool).query<{ count: number }>(LIVE_BOT_COUNT_SQL, [
    accountId,
  ]);
  return counted.rows[0].count;
}

async function createBot(
  accountId: string,
  name: string,
  status: string,
  createdAt: string | null = null,
): Promise<string> {
  const active = livePool as Pool;
  const row = await active.query<{ id: string }>(
    `INSERT INTO bots (account_id, name, token_cipher, status, created_at)
     VALUES ($1, $2, '\\x'::bytea, $3, COALESCE($4::timestamptz, now()))
     RETURNING id`,
    [accountId, name, status, createdAt],
  );
  return row.rows[0].id;
}

/* The 0010 migration adds the column; this is the fallback-DDL equivalent for
   a database where the sibling file could not be applied. Runs after the
   fallback so an older shared DB is repaired in place. */
const TRIAL_COLUMN_DDL = 'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz';

// --- Harness helpers --------------------------------------------------------

function actAs(session: ListSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

interface RecordedQuery {
  text: string;
  params: unknown[];
}

function makeFakePool(
  handler: (text: string, params: unknown[]) => { rowCount: number; rows: unknown[] },
): { pool: Pool; calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return handler(text, params);
    },
  } as unknown as Pool;
  return { pool: fake, calls };
}

/* Models the three reads a gated mint makes, dispatched by SQL text — a
   sequential-response fake would silently mis-answer the moment the route's
   query order changed, which is exactly the regression these tests exist to
   catch. */
function makeGatePool(input: {
  account: MintAccountRow | null;
  liveBots: number;
  mintId: string;
  failOn?: string;
}): { pool: Pool; calls: RecordedQuery[] } {
  return makeFakePool((text) => {
    if (input.failOn === 'all' || input.failOn === text) {
      throw new Error('connection refused');
    }
    if (text === MINT_ACCOUNT_SQL) {
      return input.account === null
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [input.account] };
    }
    if (text === LIVE_BOT_COUNT_SQL) {
      return { rowCount: 1, rows: [{ count: input.liveBots }] };
    }
    if (text === MINT_BOT_SQL) {
      return { rowCount: 1, rows: [{ id: input.mintId }] };
    }
    throw new Error(`unexpected query in gated mint: ${text}`);
  });
}

function listRequest(): Request {
  return new Request('http://localhost/api/bots');
}

function mintRequest(body: unknown): Request {
  return new Request('http://localhost/api/bots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  __resetSessionReader();
});

afterAll(async () => {
  __resetSessionReader();
  await livePool?.end().catch(() => {});
});

// --- Fake-pool shape (no database) -----------------------------------------

describe('GET /api/bots against a fake pool', () => {
  it('returns 401 before any query when there is no session', async () => {
    const { pool, calls } = makeFakePool(() => ({ rowCount: 0, rows: [] }));
    __setPool(pool);
    __resetSessionReader();

    const res = await GET(listRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(calls).toHaveLength(0);
  });

  it('answers an empty account with 200 [] — an honest empty state, never a 404', async () => {
    const { pool, calls } = makeFakePool(() => ({ rowCount: 0, rows: [] }));
    __setPool(pool);
    actAs(OWNER);

    const res = await GET(listRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe(LIST_BOTS_SQL);
    expect(calls[0].params).toEqual([OWNER.accountId]);
  });

  it('returns only the queried account rows — foreign rows never appear', async () => {
    const seeded = [
      { id: UUID_A, name: 'Mine', status: 'live', accountId: OWNER.accountId },
      { id: UUID_B, name: 'Theirs', status: 'live', accountId: 'acct-other' },
    ];
    /* The fake models the DB predicate: rows are filtered by account_id = $1. */
    const { pool } = makeFakePool((_text, params) => {
      const rows = seeded
        .filter((row) => row.accountId === params[0])
        .map((row) => ({ id: row.id, name: row.name, status: row.status }));
      return { rowCount: rows.length, rows };
    });
    __setPool(pool);

    actAs(OWNER);
    expect(await (await GET(listRequest())).json()).toEqual([
      { id: UUID_A, name: 'Mine', status: 'live' },
    ]);

    actAs({ accountId: 'acct-other', discordId: 'disc-other' });
    expect(await (await GET(listRequest())).json()).toEqual([
      { id: UUID_B, name: 'Theirs', status: 'live' },
    ]);

    /* A signed-in account owning nothing gets an honest empty list, never a borrow. */
    actAs({ accountId: 'acct-nobody', discordId: 'disc-nobody' });
    expect(await (await GET(listRequest())).json()).toEqual([]);
  });

  it('lists the account rows as { id, name, status } and scopes the query to the caller', async () => {
    const rows = [
      { id: UUID_A, name: 'Study Hall', status: 'live' },
      { id: UUID_B, name: 'Draft Arena', status: 'draft' },
    ];
    const { pool, calls } = makeFakePool(() => ({ rowCount: rows.length, rows }));
    __setPool(pool);
    actAs(OWNER);

    const res = await GET(listRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    // Ownership lives in the predicate, not in a post-filter: foreign rows are
    // structurally out of reach, and deleted bots never surface.
    expect(calls[0].text).toContain('account_id = $1');
    expect(calls[0].text).toContain('deleted_at IS NULL');
    expect(calls[0].text).toContain('ORDER BY created_at DESC');
    expect(calls[0].params).toEqual([OWNER.accountId]);
  });

  it('returns 500 — not a fake 200 — when the query fails', async () => {
    const { pool } = makeFakePool(() => {
      throw new Error('connection refused');
    });
    __setPool(pool);
    actAs(OWNER);

    const res = await GET(listRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'could not load bots' });
  });
});

// --- POST /api/bots against a fake pool (no database) ------------------------

describe('POST /api/bots against a fake pool', () => {
  it('returns 401 before any query when there is no session', async () => {
    const { pool, calls } = makeFakePool(() => ({ rowCount: 1, rows: [] }));
    __setPool(pool);
    __resetSessionReader();

    const res = await POST(mintRequest({ botName: 'Study Hall' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(calls).toHaveLength(0);
  });

  it('answers 422 for bad names — empty, over-32, and non-string', async () => {
    const { pool, calls } = makeFakePool(() => ({ rowCount: 1, rows: [{ id: UUID_A }] }));
    __setPool(pool);
    actAs(OWNER);

    for (const bad of ['', '   ', 42, null, undefined, {}, []]) {
      const res = await POST(mintRequest({ botName: bad }));
      expect(res.status).toBe(422);
    }
    const long = await POST(mintRequest({ botName: 'x'.repeat(33) }));
    expect(long.status).toBe(422);
    const badJson = await POST(
      new Request('http://localhost/api/bots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      }),
    );
    expect(badJson.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it('mints one draft bot and answers 200 { botId } when the trial is running and no bot exists', async () => {
    const { pool, calls } = makeGatePool({
      account: { tier: 'trial', trial_ends_at: NOW_PLUS_HOUR },
      liveBots: 0,
      mintId: UUID_A,
    });
    __setPool(pool);
    actAs(OWNER);

    const res = await POST(mintRequest({ botName: 'Study Hall' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ botId: UUID_A });
    // Account read, bot count, then the INSERT — in that order, nothing else.
    expect(calls.map((call) => call.text)).toEqual([
      MINT_ACCOUNT_SQL,
      LIVE_BOT_COUNT_SQL,
      MINT_BOT_SQL,
    ]);
    expect(calls[0].params).toEqual([OWNER.accountId]);
    expect(calls[1].params).toEqual([OWNER.accountId]);
    expect(calls[2].params).toEqual([OWNER.accountId, 'Study Hall']);
    expect(calls[2].text).toContain("'draft'");
  });

  it('refuses a second bot on a running trial with 403 trial_bot_limit and no INSERT', async () => {
    const { pool, calls } = makeGatePool({
      account: { tier: 'trial', trial_ends_at: NOW_PLUS_HOUR },
      liveBots: 1,
      mintId: UUID_A,
    });
    __setPool(pool);
    actAs(OWNER);

    const res = await POST(mintRequest({ botName: 'Second Bot' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'trial_bot_limit',
      message: TRIAL_BOT_LIMIT_MESSAGE,
    });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.text)).not.toContain(MINT_BOT_SQL);
  });

  it('refuses an expired clock with 403 trial_expired whatever the bot count, no INSERT', async () => {
    for (const liveBots of [0, 3]) {
      const { pool, calls } = makeGatePool({
        account: { tier: 'trial', trial_ends_at: NOW_MINUS_HOUR },
        liveBots,
        mintId: UUID_A,
      });
      __setPool(pool);
      actAs(OWNER);

      const res = await POST(mintRequest({ botName: 'Too Late' }));

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'trial_expired',
        message: TRIAL_EXPIRED_MESSAGE,
      });
      // The count is never even read once the clock has passed — the refusal
      // does not depend on it.
      expect(calls.map((call) => call.text)).toEqual([MINT_ACCOUNT_SQL]);
    }
  });

  it('fails open on a NULL clock — a grandfathered account mints its first bot', async () => {
    const { pool, calls } = makeGatePool({
      account: { tier: 'trial', trial_ends_at: null },
      liveBots: 0,
      mintId: UUID_A,
    });
    __setPool(pool);
    actAs(OWNER);

    const res = await POST(mintRequest({ botName: 'Grandfathered' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ botId: UUID_A });
    expect(calls.map((call) => call.text)).toContain(MINT_BOT_SQL);
  });

  it('lets a paid tier bypass both gates — expired clock, bots already exist, no count read', async () => {
    for (const tier of ['pro', 'studio', 'scale']) {
      const { pool, calls } = makeGatePool({
        account: { tier, trial_ends_at: NOW_MINUS_HOUR },
        liveBots: 4,
        mintId: UUID_A,
      });
      __setPool(pool);
      actAs(OWNER);

      const res = await POST(mintRequest({ botName: `${tier} bot` }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ botId: UUID_A });
      // A paid tier needs neither the clock nor the count to decide.
      expect(calls.map((call) => call.text)).toEqual([MINT_ACCOUNT_SQL, MINT_BOT_SQL]);
    }
  });

  it('treats an unknown or absent tier as trial — the free path fails closed', async () => {
    for (const tier of ['legacy-premium', null]) {
      const { pool } = makeGatePool({
        account: { tier, trial_ends_at: NOW_PLUS_HOUR },
        liveBots: 2,
        mintId: UUID_A,
      });
      __setPool(pool);
      actAs(OWNER);

      const res = await POST(mintRequest({ botName: 'Unknown Tier' }));

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'trial_bot_limit',
        message: TRIAL_BOT_LIMIT_MESSAGE,
      });
    }
  });

  it('treats a missing account row as trial with no bots — the mint is not blocked by a read gap', async () => {
    // The session resolved but the account row is gone (deleted mid-session).
    // An absent row means the tier is UNKNOWN, so the careful reading applies:
    // treat it as trial (the count is therefore read) and let the INSERT
    // decide — the database's own foreign key is the authority on whether that
    // account exists, never a hand-rolled 403.
    const { pool, calls } = makeGatePool({ account: null, liveBots: 0, mintId: UUID_A });
    __setPool(pool);
    actAs(OWNER);

    const res = await POST(mintRequest({ botName: 'Orphan' }));

    expect(res.status).toBe(200);
    expect(calls.map((call) => call.text)).toEqual([
      MINT_ACCOUNT_SQL,
      LIVE_BOT_COUNT_SQL,
      MINT_BOT_SQL,
    ]);
  });

  it('returns 500 — not a fake 200 — when the mint query fails', async () => {
    const { pool } = makeGatePool({
      account: { tier: 'trial', trial_ends_at: NOW_PLUS_HOUR },
      liveBots: 0,
      mintId: UUID_A,
      failOn: MINT_BOT_SQL,
    });
    __setPool(pool);
    actAs(OWNER);

    const res = await POST(mintRequest({ botName: 'Study Hall' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'could not mint bot' });
  });

  it('returns 500 — never a silent allow — when the account read itself fails', async () => {
    const { pool } = makeGatePool({ account: null, liveBots: 0, mintId: UUID_A, failOn: 'all' });
    __setPool(pool);
    actAs(OWNER);

    const res = await POST(mintRequest({ botName: 'Study Hall' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'could not mint bot' });
  });
});

// --- The gate's own decision table (no database, no route) -------------------

describe('mintGate (KI-033 decision table)', () => {
  const trial = (trial_ends_at: string | null): MintAccountRow => ({
    tier: 'trial',
    trial_ends_at,
  });

  it('refuses an expired clock before it ever considers the bot count', () => {
    const gate = mintGate(trial(NOW_MINUS_HOUR), 0);
    expect(gate.expired).toBe(TRIAL_EXPIRED_MESSAGE);
    expect(gate.botLimit).toBeNull();
    expect(mintRefusal(gate)).toEqual({
      code: 'trial_expired',
      message: TRIAL_EXPIRED_MESSAGE,
    });
  });

  it('refuses the second bot only while the clock is still running', () => {
    const gate = mintGate(trial(NOW_PLUS_HOUR), 1);
    expect(gate.expired).toBeNull();
    expect(gate.botLimit).toBe(TRIAL_BOT_LIMIT_MESSAGE);
    expect(mintRefusal(gate)).toEqual({
      code: 'trial_bot_limit',
      message: TRIAL_BOT_LIMIT_MESSAGE,
    });
  });

  it('allows the first bot of a running trial', () => {
    expect(mintRefusal(mintGate(trial(NOW_PLUS_HOUR), 0))).toBeNull();
  });

  it('fails open on a null or absent clock', () => {
    expect(mintRefusal(mintGate(trial(null), 0))).toBeNull();
    expect(mintRefusal(mintGate({ tier: 'trial' }, 0))).toBeNull();
  });

  it('bypasses both gates for every paid tier', () => {
    for (const tier of ['pro', 'studio', 'scale']) {
      expect(mintRefusal(mintGate({ tier, trial_ends_at: NOW_MINUS_HOUR }, 9))).toBeNull();
    }
  });

  it('treats null and unknown tiers as trial', () => {
    expect(mintRefusal(mintGate({ tier: null, trial_ends_at: NOW_MINUS_HOUR }, 0))).toEqual({
      code: 'trial_expired',
      message: TRIAL_EXPIRED_MESSAGE,
    });
    expect(mintRefusal(mintGate({ tier: 'mystery', trial_ends_at: NOW_PLUS_HOUR }, 1))).toEqual({
      code: 'trial_bot_limit',
      message: TRIAL_BOT_LIMIT_MESSAGE,
    });
  });
});

// --- Missing DATABASE_URL maps honestly (KI-021) ----------------------------

describe('GET /api/bots with DATABASE_URL absent', () => {
  it('answers the canonical database-not-configured 500, never a misleading one', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    actAs(OWNER);
    try {
      const res = await GET(listRequest());

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'database not configured' });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  });
});

// --- Postgres-backed (loud skip when unreachable) ---------------------------

describe('GET /api/bots against Postgres (loud skip when unreachable)', () => {
  it('returns only the caller own bots, newest first, excluding deleted', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = await makeAccount(`${tag}-owner`);
    const intruderId = await makeAccount(`${tag}-intruder`);

    const older = await createBot(ownerId, 'Older', 'live', '2026-09-10T10:00:00.000Z');
    const newer = await createBot(ownerId, 'Newer', 'draft', '2026-09-12T10:00:00.000Z');
    await createBot(intruderId, 'Foreign', 'live', '2026-09-13T10:00:00.000Z');
    const deleted = await createBot(ownerId, 'Deleted', 'live', '2026-09-14T10:00:00.000Z');
    await (livePool as Pool).query('UPDATE bots SET deleted_at = now() WHERE id = $1', [deleted]);

    actAs({ accountId: ownerId, discordId: `${tag}-owner` });
    const res = await GET(listRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; status: string }[];
    expect(body.map((row) => row.id)).toEqual([newer, older]);
    expect(body.map((row) => row.name)).toEqual(['Newer', 'Older']);
  });

  it('answers an account with no bots with 200 []', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = await makeAccount(`${tag}-empty`);

    actAs({ accountId: ownerId, discordId: `${tag}-empty` });
    const res = await GET(listRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

// --- POST /api/bots against Postgres (loud skip when unreachable) -------------

describe('POST /api/bots against Postgres (loud skip when unreachable)', () => {
  it('mints a draft row scoped to the caller — a foreign account cannot see it', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-mint-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = await makeAccount(`${tag}-owner`);
    const intruderId = await makeAccount(`${tag}-intruder`);

    actAs({ accountId: ownerId, discordId: `${tag}-owner` });
    const mintRes = await POST(mintRequest({ botName: 'Fresh Mint' }));
    expect(mintRes.status).toBe(200);
    const mintBody = (await mintRes.json()) as { botId: string };
    expect(typeof mintBody.botId).toBe('string');
    expect(mintBody.botId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const active = livePool as Pool;
    const stored = await active.query<{ account_id: string; name: string; status: string }>(
      'SELECT account_id, name, status FROM bots WHERE id = $1',
      [mintBody.botId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].account_id).toBe(ownerId);
    expect(stored.rows[0].name).toBe('Fresh Mint');
    expect(stored.rows[0].status).toBe('draft');

    actAs({ accountId: intruderId, discordId: `${tag}-intruder` });
    const foreign = await GET(listRequest());
    expect(foreign.status).toBe(200);
    expect(await foreign.json()).toEqual([]);
  });

  it('blocks the second bot once the cap counts a REAL live row (no INSERT)', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-cap-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await makeAccount(`${tag}-owner`);

    actAs({ accountId, discordId: `${tag}-owner` });
    const first = await POST(mintRequest({ botName: 'Only One' }));
    expect(first.status).toBe(200);

    const second = await POST(mintRequest({ botName: 'One Too Many' }));
    expect(second.status).toBe(403);
    expect(await second.json()).toEqual({
      error: 'trial_bot_limit',
      message: TRIAL_BOT_LIMIT_MESSAGE,
    });
    expect(await liveBotCount(accountId)).toBe(1);

    // A soft-deleted bot frees the slot: the count is live rows only, so the
    // cap is a cap on bots in service, never a lifetime tally.
    const firstId = ((await first.json()) as { botId: string }).botId;
    await (livePool as Pool).query('UPDATE bots SET deleted_at = now() WHERE id = $1', [firstId]);
    const afterDelete = await POST(mintRequest({ botName: 'Replacement' }));
    expect(afterDelete.status).toBe(200);
  });

  it('blocks an expired account whatever its bot count, and writes nothing', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-expired-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await makeAccount(`${tag}-owner`, NOW_MINUS_HOUR);

    actAs({ accountId, discordId: `${tag}-owner` });
    const res = await POST(mintRequest({ botName: 'Paused Account' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'trial_expired',
      message: TRIAL_EXPIRED_MESSAGE,
    });
    expect(await liveBotCount(accountId)).toBe(0);
  });

  it('mints for a paid tier even with an expired clock and bots already in place', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-paid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await makeAccount(`${tag}-owner`, NOW_MINUS_HOUR);
    await createBot(accountId, 'Existing', 'live');
    await setTier(accountId, 'pro');

    actAs({ accountId, discordId: `${tag}-owner` });
    const res = await POST(mintRequest({ botName: 'Paid Bot' }));

    expect(res.status).toBe(200);
    expect(await liveBotCount(accountId)).toBe(2);
  });

  it('mints for a grandfathered NULL clock — the fail-open rule on real SQL NULL', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-nullclock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await makeAccount(`${tag}-owner`, null);

    actAs({ accountId, discordId: `${tag}-owner` });
    const res = await POST(mintRequest({ botName: 'Grandfathered' }));

    expect(res.status).toBe(200);
    expect(await liveBotCount(accountId)).toBe(1);
  });

  it('refuses once the clock has passed, even for an account that was minting a moment earlier', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `bots-flip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await makeAccount(`${tag}-owner`);

    actAs({ accountId, discordId: `${tag}-owner` });
    // First bot mints on a running trial.
    expect((await POST(mintRequest({ botName: 'Before' }))).status).toBe(200);

    // The SAME account, same session, clock moved into the past by the only
    // thing that can move it (an UPDATE) — the gate reads the column per
    // request, so expiry takes effect without a re-login.
    await setTrialClock(accountId, NOW_MINUS_HOUR);
    const after = await POST(mintRequest({ botName: 'After' }));

    expect(after.status).toBe(403);
    expect(await after.json()).toEqual({
      error: 'trial_expired',
      message: TRIAL_EXPIRED_MESSAGE,
    });
    expect(await liveBotCount(accountId)).toBe(1);
  });
});
