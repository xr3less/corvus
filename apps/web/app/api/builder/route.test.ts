// Tests for GET /api/builder?runId= (V1-7).
//
// Hermetic fake-pool shape tests plus a live Postgres path that warns LOUDLY and
// skips when Postgres is unreachable (L-009) — never a silent skip.

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { __setPool, TEST_DATABASE_URL } from '../../../lib/db/pool';
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
}

function fakeDb(rows: SeededRun[]): Pool {
  return {
    query: async (_text: string, params: unknown[] = []) => ({
      rows: rows
        .filter((row) => row.id === params[0])
        .map((row) => ({
          id: row.id,
          phase: row.phase,
          detail: row.detail,
          account_id: row.accountId,
        })),
    }),
  } as unknown as Pool;
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

  it('passes the run phase and detail through for an owned run', async () => {
    __setPool(
      fakeDb([{ id: RUN_ID, phase: 'syncing', detail: { stub: true }, accountId: 'acct-1' }]),
    );
    __setSessionReader(SIGNED_IN);

    const res = await GET(getRun(RUN_ID));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({
      runId: RUN_ID,
      phase: 'syncing',
      detail: { stub: true },
    });
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
      const res = await GET(getRun(randomUUID()));
      expect(res.status).toBe(404);
      expect(await readBody(res)).toEqual({ error: 'run not found' });
    } finally {
      await live.end();
    }
  });
});
