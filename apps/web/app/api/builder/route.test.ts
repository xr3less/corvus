// Tests for GET /api/builder?runId= (V1-7).
//
// Hermetic fake-pool shape tests plus a live Postgres path that warns LOUDLY and
// skips when Postgres is unreachable (L-009) — never a silent skip.

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { __resetPool, __setPool, TEST_DATABASE_URL } from '../../../lib/db/pool';
import type { SessionReader } from '../../../lib/interview/session-bind';
import { GET, __resetSessionReader, __setSessionReader } from './route';

const RUN_ID = '22222222-3333-4444-8555-666666666666';

const SIGNED_IN: SessionReader = {
  getSession: async () => ({ accountId: 'acct-1', discordId: 'disc-1' }),
};
const SIGNED_OUT: SessionReader = {
  getSession: async () => null,
};

afterEach(() => {
  __resetSessionReader();
});

interface SeededRun {
  id: string;
  phase: string;
  detail: unknown;
  accountId: string;
  deleted?: boolean;
}

function fakeDb(rows: SeededRun[]): Pool & { queries: string[] } {
  const queries: string[] = [];
  const pool = {
    queries,
    query: async (text: string, params: unknown[] = []) => {
      queries.push(text);
      return {
        rows: rows
          .filter((row) => row.id === params[0] && row.deleted !== true)
          .map((row) => ({
            id: row.id,
            phase: row.phase,
            detail: row.detail,
            account_id: row.accountId,
          })),
      };
    },
  } as unknown as Pool & { queries: string[] };
  return pool;
}

function failingDb(): Pool {
  return {
    query: async () => {
      throw new Error('connection reset');
    },
  } as unknown as Pool;
}

function getRun(runId: string | null): Request {
  const url =
    runId === null ? 'http://localhost/api/builder' : `http://localhost/api/builder?runId=${runId}`;
  return new Request(url);
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('GET /api/builder', () => {
  it('returns 401 first when there is no session', async () => {
    __setPool(fakeDb([]));
    __setSessionReader(SIGNED_OUT);
    const res = await GET(getRun(RUN_ID));
    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
  });

  it('answers the same 404 shape for a missing, malformed, or unknown run id', async () => {
    __setPool(fakeDb([]));
    __setSessionReader(SIGNED_IN);

    const missing = await GET(getRun(null));
    const malformed = await GET(getRun('not-a-run'));
    const unknown = await GET(getRun(randomUUID()));

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    const shape = { error: 'run not found' };
    expect(await readBody(missing)).toEqual(shape);
    expect(await readBody(malformed)).toEqual(shape);
    expect(await readBody(unknown)).toEqual(shape);
  });

  it('returns 404 - never 403 - for a run whose bot belongs to someone else', async () => {
    __setPool(fakeDb([{ id: RUN_ID, phase: 'generating', detail: {}, accountId: 'acct-other' }]));
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(await readBody(res)).toEqual({ error: 'run not found' });
  });

  it('returns 404 for a run whose bot has been soft-deleted', async () => {
    const pool = fakeDb([
      { id: RUN_ID, phase: 'live', detail: {}, accountId: 'acct-1', deleted: true },
    ]);
    __setPool(pool);
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'run not found' });
    // The JOIN must exclude soft-deleted bots exactly as the worker does.
    expect(pool.queries[0]).toContain('b.deleted_at IS NULL');
  });

  it('fails fast with an honest 500 when DATABASE_URL is unset, never the test DB', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    __setSessionReader(SIGNED_IN);

    try {
      const res = await GET(getRun(RUN_ID));

      expect(res.status).toBe(500);
      expect(await readBody(res)).toEqual({ error: 'database not configured' });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  });

  it('passes the run phase and real live detail through for an owned run', async () => {
    // The worker's real live detail (builder-runs.ts): {version, model,
    // stub:false}. The round trip must not drop version or model.
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'live',
          detail: { version: 3, model: 'glm/5-2', stub: false },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body).toMatchObject({
      runId: RUN_ID,
      phase: 'live',
      detail: { version: 3, model: 'glm/5-2', stub: false },
    });
    const detail = body.detail as { version?: unknown; model?: unknown };
    expect(typeof detail.version).toBe('number');
    expect(typeof detail.model).toBe('string');
  });

  it('passes through only version/model/stub for a live run, dropping extra detail keys', async () => {
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'live',
          detail: {
            version: 4,
            model: 'glm/5-2',
            stub: true,
            rawPreview: 'secret provider text',
            _builder: { internal: true },
          },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail).toEqual({ version: 4, model: 'glm/5-2', stub: true });
    const detail = body.detail as Record<string, unknown>;
    expect('rawPreview' in detail).toBe(false);
    expect('_builder' in detail).toBe(false);
  });

  it('strips rawPreview and _builder from a failed run while keeping error/step/attempts', async () => {
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'failed',
          detail: {
            error: 'builder crashed',
            step: 'generate',
            attempts: 3,
            rawPreview: 'raw model output',
            _builder: { provenance: 'internal' },
          },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail).toEqual({ error: 'builder crashed', step: 'generate', attempts: 3 });
    const detail = body.detail as Record<string, unknown>;
    expect('rawPreview' in detail).toBe(false);
    expect('_builder' in detail).toBe(false);
    expect(typeof detail.attempts).toBe('number');
  });

  it('drops a non-numeric attempts payload instead of forwarding its internals', async () => {
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'failed',
          detail: {
            error: 'builder crashed',
            attempts: { count: 2, rawPreview: 'raw model output' },
          },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail).toEqual({ error: 'builder crashed' });
  });

  it('forwards the checkpoint slice for an active phase, dropping internals', async () => {
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'generating',
          detail: {
            provider: 'wiro sonnet-5',
            attempt: 2,
            stepStartedAt: '2026-09-25T18:00:00.000Z',
            checkpointBrief: 'abbrev',
            rawPreview: 'raw model output',
            _builder: { internal: true },
          },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.phase).toBe('generating');
    expect(body.detail).toEqual({
      provider: 'wiro sonnet-5',
      attempt: 2,
      stepStartedAt: '2026-09-25T18:00:00.000Z',
      checkpointBrief: 'abbrev',
    });
    const detail = body.detail as Record<string, unknown>;
    expect('rawPreview' in detail).toBe(false);
    expect('_builder' in detail).toBe(false);
  });

  it('drops blank or non-primitive checkpoint values instead of forwarding them', async () => {
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'queued',
          detail: { briefChars: 0, provider: '', attempt: { count: 1 }, rawPreview: 'x' },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail).toEqual({ briefChars: 0 });
  });

  it('forwards no detail at all for an unknown phase', async () => {
    __setPool(
      fakeDb([
        {
          id: RUN_ID,
          phase: 'generating',
          detail: { rawPreview: 'raw model output', _builder: { internal: true } },
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.phase).toBe('generating');
    expect(body.detail).toEqual({});
  });

  it('degrades malformed or missing detail to an empty object', async () => {
    __setPool(
      fakeDb([
        { id: RUN_ID, phase: 'live', detail: 'not-json', accountId: 'acct-1' },
        {
          id: '33333333-4444-4555-8666-777777777777',
          phase: 'live',
          detail: null,
          accountId: 'acct-1',
        },
      ]),
    );
    __setSessionReader(SIGNED_IN);

    const malformed = await GET(getRun(RUN_ID));
    const missing = await GET(getRun('33333333-4444-4555-8666-777777777777'));

    expect(malformed.status).toBe(200);
    expect(missing.status).toBe(200);
    expect((await readBody(malformed)).detail).toEqual({});
    expect((await readBody(missing)).detail).toEqual({});
  });

  it('returns a generic 500 when the poll query fails', async () => {
    __setPool(failingDb());
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not fetch run' });
  });
});

// --- Live PG path: runs when reachable, LOUD skip otherwise ---

// Minimal schema for the live read: the route SELECTs
// `builder_runs r JOIN bots b ON b.id = r.bot_id` (route.ts:93-96), so both
// relations must exist before the 404 path can be exercised. On an empty
// database those tables are absent, the JOIN raises `relation does not exist`,
// and the route answers 500 'could not fetch run' instead of 404.
//
// Column definitions are verbatim from the sibling migrations
// (apps/gateway/drizzle/0001_init.sql, 0007_builder_runs.sql) for the columns
// this route reads.
const REQUIRED_TABLES = ['bots', 'builder_runs'] as const;

const FALLBACK_DDL = [
  // Defensive only: gen_random_uuid() has been Postgres core since v13, so a
  // fresh postgres:17 provides it without this extension.
  'CREATE EXTENSION IF NOT EXISTS pgcrypto',
  `CREATE TABLE IF NOT EXISTS bots (
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
   )`,
  `CREATE TABLE IF NOT EXISTS builder_runs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     bot_id uuid NOT NULL,
     phase text NOT NULL DEFAULT 'queued',
     detail jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
];

// Each statement runs on its own so a concurrent suite creating the same table
// (other test files share this database) cannot roll back the rest of the
// batch. The verification below — not the throw — decides whether the schema is
// usable, so a genuine failure is reported by name instead of surfacing as the
// very 500 these tests exist to distinguish from a 404.
async function ensureSchema(pool: Pool): Promise<void> {
  const sources = [
    '../../../../gateway/drizzle/0001_init.sql',
    '../../../../gateway/drizzle/0007_builder_runs.sql',
  ];
  for (const relative of sources) {
    try {
      const sql = await readFile(new URL(relative, import.meta.url), 'utf8');
      await pool.query(sql);
    } catch {
      // Sibling migration unreadable, or a concurrent suite created it first.
    }
  }
  for (const statement of FALLBACK_DDL) {
    try {
      await pool.query(statement);
    } catch {
      // Concurrent create; the verification below is the arbiter.
    }
  }
  const present = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_tables
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [[...REQUIRED_TABLES]],
  );
  const found = Number(present.rows[0]?.count);
  if (found !== REQUIRED_TABLES.length) {
    throw new Error(
      `[builder route.test] schema not ready: ${found}/${REQUIRED_TABLES.length} of ` +
        `${REQUIRED_TABLES.join(', ')} exist at ${process.env.DATABASE_URL ?? '(DATABASE_URL unset)'}`,
    );
  }
}

describe('live PG path (loud skip when unreachable)', () => {
  const liveUrl = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

  async function reachable(): Promise<boolean> {
    const probe = new Pool({ connectionString: liveUrl, connectionTimeoutMillis: 1500 });
    try {
      await probe.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await probe.end();
    }
  }

  it('answers 404 through the real pool for an unknown run', async () => {
    if (!(await reachable())) {
      console.warn(`[builder route.test] PG unreachable at ${liveUrl} - skipping live test`);
      return;
    }
    const live = new Pool({ connectionString: liveUrl });
    try {
      __setPool(live);
      __setSessionReader(SIGNED_IN);
      await ensureSchema(live);
      const res = await GET(getRun(randomUUID()));
      expect(res.status).toBe(404);
      expect(await readBody(res)).toEqual({ error: 'run not found' });
    } finally {
      await live.end();
    }
  });
});
