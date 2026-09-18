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
  GET,
  LIST_BOTS_SQL,
  __resetSessionReader,
  __setSessionReader,
  type ListSession,
} from './route';

const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

const OWNER: ListSession = { accountId: 'acct-owner', discordId: 'disc-owner' };

const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = '66666666-7777-4888-8999-000000000000';

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
  pgReady = true;
}

async function makeAccount(discordId: string): Promise<string> {
  const active = livePool as Pool;
  const row = await active.query<{ id: string }>(
    'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
    [discordId],
  );
  return row.rows[0].id;
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

function listRequest(): Request {
  return new Request('http://localhost/api/bots');
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
