// Tests for POST /api/builder/start (V1-7).
//
// The pool and pg-boss client are stubbed through the routes' seams, so every
// shape test is hermetic. Live Postgres paths run only when Postgres is
// reachable; otherwise they warn LOUDLY and skip (L-009) — never a hook throw,
// never a silent skip.

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { SendOptions } from 'pg-boss';
import { afterEach, describe, expect, it } from 'vitest';
import { __resetPool, __setPool, TEST_DATABASE_URL } from '../../../../lib/db/pool';
import type { SessionReader } from '../../../../lib/interview/session-bind';
import {
  POST,
  BUILDER_QUEUE,
  __resetBossFactory,
  __resetSessionReader as resetStartReader,
  __setBossFactory,
  __setSessionReader as setStartReader,
  type BuilderBoss,
} from './route';
import {
  GET,
  __resetSessionReader as resetGetReader,
  __setSessionReader as setGetReader,
} from '../route';

const BOT = '11111111-2222-4333-8444-555555555555';
const FOREIGN_BOT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const BRIEF = 'a welcome bot with two behaviors';

const SIGNED_IN: SessionReader = {
  getSession: async () => ({ accountId: 'acct-1', discordId: 'disc-1' }),
};
const SIGNED_OUT: SessionReader = {
  getSession: async () => null,
};

afterEach(() => {
  resetStartReader();
  resetGetReader();
  __resetBossFactory();
});

// --- Fakes ---

interface RunRow {
  id: string;
  botId: string;
  phase: string;
  detail: unknown;
}

function fakeDb(config: { owned?: boolean; failInsert?: boolean; deleted?: boolean } = {}): {
  pool: Pool;
  runs: Map<string, RunRow>;
  calls: { text: string; params: unknown[] }[];
} {
  const runs = new Map<string, RunRow>();
  const calls: { text: string; params: unknown[] }[] = [];
  const pool = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      if (text.includes('INSERT INTO builder_runs')) {
        if (config.failInsert) throw new Error('insert failed');
        const id = randomUUID();
        runs.set(id, { id, botId: String(params[0]), phase: 'queued', detail: {} });
        return { rows: [{ id }] };
      }
      if (text.includes('UPDATE builder_runs')) {
        const row = runs.get(String(params[0]));
        if (row) {
          row.phase = 'failed';
          row.detail = JSON.parse(String(params[1]));
        }
        return { rows: [] };
      }
      if (text.includes('JOIN bots')) {
        const row = runs.get(String(params[0]));
        return {
          rows: row
            ? [{ id: row.id, phase: row.phase, detail: row.detail, account_id: 'acct-1' }]
            : [],
        };
      }
      if (text.includes('FROM bots')) {
        // Models the real predicate: a soft-deleted bot is not owned any more.
        const missing = config.owned === false || config.deleted === true;
        return { rows: missing ? [] : [{ id: String(params[0]) }] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  } as unknown as Pool;
  return { pool, runs, calls };
}

function stubBoss(config: { send?: string | null | Error } = {}): {
  factory: () => BuilderBoss;
  record: {
    startCalls: number;
    stopCalls: number;
    created: string[];
    sent: { name: string; data: unknown; options: unknown }[];
  };
} {
  const record = {
    startCalls: 0,
    stopCalls: 0,
    created: [] as string[],
    sent: [] as { name: string; data: unknown; options: unknown }[],
  };
  const factory = (): BuilderBoss => ({
    start: async () => {
      record.startCalls += 1;
    },
    stop: async () => {
      record.stopCalls += 1;
    },
    createQueue: async (name: string) => {
      record.created.push(name);
    },
    send: async (name: string, data: object, options?: SendOptions) => {
      record.sent.push({ name, data, options });
      if (config.send instanceof Error) throw config.send;
      if (config.send === undefined) return 'job-1';
      return config.send;
    },
  });
  return { record, factory };
}

function postStart(body: unknown): Request {
  return new Request('http://localhost/api/builder/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRun(runId: string | null): Request {
  const url =
    runId === null ? 'http://localhost/api/builder' : `http://localhost/api/builder?runId=${runId}`;
  return new Request(url);
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// --- POST /api/builder/start ---

describe('POST /api/builder/start', () => {
  it('returns 401 first when there is no session, without touching pool or boss', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_OUT);

    const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 422 for a missing or malformed botId, without touching pool or boss', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    for (const body of [{}, { botId: 'not-a-bot-id' }, { botId: 42 }, { botId: null }]) {
      const res = await POST(postStart(body));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({ error: 'invalid bot id' });
    }
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 422 for a missing, empty, or oversized brief, without touching pool or boss', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    for (const body of [
      { botId: BOT },
      { botId: BOT, brief: '' },
      { botId: BOT, brief: '   ' },
      { botId: BOT, brief: 42 },
      { botId: BOT, brief: 'x'.repeat(2001) },
    ]) {
      const res = await POST(postStart(body));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({ error: 'invalid brief' });
    }
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 404 - never 403 - for a bot owned by someone else', async () => {
    const db = fakeDb({ owned: false });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: FOREIGN_BOT, brief: BRIEF }));

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(await readBody(res)).toEqual({ error: 'bot not found' });
    expect(db.runs.size).toBe(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 404 - never enqueues or bills - for a soft-deleted bot', async () => {
    const db = fakeDb({ deleted: true });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'bot not found' });
    expect(db.runs.size).toBe(0);
    expect(boss.record.startCalls).toBe(0);
    // The ownership read must carry the same soft-delete predicate the worker
    // uses, or a deleted bot could still be enqueued and billed.
    const ownership = db.calls.find((call) => call.text.includes('FROM bots'));
    expect(ownership?.text).toContain('deleted_at IS NULL');
  });

  it('fails fast with an honest 500 when DATABASE_URL is unset, never the test DB', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    try {
      const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

      expect(res.status).toBe(500);
      expect(await readBody(res)).toEqual({ error: 'database not configured' });
      expect(boss.record.startCalls).toBe(0);
      expect(boss.record.sent).toHaveLength(0);
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  });

  it('creates a queued run and enqueues it with the locked queue, singleton key and retry options', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.phase).toBe('queued');
    expect(typeof body.runId).toBe('string');
    const runId = String(body.runId);
    expect(db.runs.get(runId)).toMatchObject({ botId: BOT, phase: 'queued' });
    expect(boss.record.startCalls).toBe(1);
    expect(boss.record.stopCalls).toBe(1);
    expect(boss.record.created).toEqual([BUILDER_QUEUE]);
    expect(BUILDER_QUEUE).toBe('builder');
    expect(boss.record.sent).toHaveLength(1);
    const sent = boss.record.sent[0];
    expect(sent.name).toBe(BUILDER_QUEUE);
    expect(sent.data).toEqual({ runId, botId: BOT, brief: BRIEF });
    expect(sent.options).toEqual({
      singletonKey: runId,
      retryLimit: 3,
      retryDelay: 30,
      expireInSeconds: 3600,
      deleteAfterSeconds: 604800,
    });
  });

  it('start -> poll: the same row advances queued -> generating -> live', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    setStartReader(SIGNED_IN);
    setGetReader(SIGNED_IN);

    const started = await POST(postStart({ botId: BOT, brief: BRIEF }));
    const runId = String((await readBody(started)).runId);

    const queued = await GET(getRun(runId));
    expect(queued.status).toBe(200);
    expect(await readBody(queued)).toMatchObject({ runId, phase: 'queued' });

    const row = db.runs.get(runId);
    expect(row).toBeDefined();
    if (!row) return;
    row.phase = 'generating';
    const generating = await GET(getRun(runId));
    expect(await readBody(generating)).toMatchObject({ runId, phase: 'generating' });

    row.phase = 'live';
    // The real worker writes this shape (builder-runs.ts): {version, model,
    // stub:false}. Asserting the real contract here catches a round-trip that
    // drops version or model.
    row.detail = { version: 3, model: 'glm/5-2', stub: false };
    const live = await GET(getRun(runId));
    const liveBody = await readBody(live);
    expect(liveBody).toMatchObject({
      runId,
      phase: 'live',
      detail: { version: 3, model: 'glm/5-2', stub: false },
    });
    const liveDetail = liveBody.detail as { version?: unknown; model?: unknown };
    expect(typeof liveDetail.version).toBe('number');
    expect(typeof liveDetail.model).toBe('string');
  });

  it('returns a generic 500 without starting the boss when the run insert fails', async () => {
    const db = fakeDb({ failInsert: true });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not start build' });
    expect(boss.record.startCalls).toBe(0);
  });

  it('marks the run failed and returns a generic 500 when send throws', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss({ send: new Error('pg exploded') });
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not start build' });
    expect(boss.record.stopCalls).toBe(1);
    const run = [...db.runs.values()][0];
    expect(run?.phase).toBe('failed');
    expect(run?.detail).toEqual({ error: 'enqueue_failed' });
  });

  it('marks the run failed and returns a generic 500 when send resolves to null', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss({ send: null });
    __setBossFactory(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, brief: BRIEF }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not start build' });
    const run = [...db.runs.values()][0];
    expect(run?.phase).toBe('failed');
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

  it('answers 404 through the real pool for an unowned bot', async () => {
    if (!(await reachable())) {
      console.warn(`[builder start route.test] PG unreachable at ${liveUrl} - skipping live test`);
      return;
    }
    const live = new Pool({ connectionString: liveUrl });
    const liveIdentity: SessionReader = {
      getSession: async () => ({ accountId: randomUUID(), discordId: 'live-disc' }),
    };
    try {
      __setPool(live);
      setStartReader(liveIdentity);
      __resetBossFactory();
      const res = await POST(postStart({ botId: randomUUID(), brief: BRIEF }));
      expect(res.status).toBe(404);
      expect(await readBody(res)).toEqual({ error: 'bot not found' });
    } finally {
      await live.end();
    }
  });
});
