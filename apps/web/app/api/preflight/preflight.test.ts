// Tests for the pre-flight relay routes (V1-4 T-relay).
//
// PgBoss is stubbed for every shape test via the routes' __setBossFactory
// seams. Live PG/boss paths run only when Postgres is reachable, otherwise
// they warn LOUDLY and skip (L-009) — never a hook throw, never silent.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { JobWithMetadata, SendOptions } from 'pg-boss';
import { afterEach, describe, expect, it } from 'vitest';
import { __resetPool, __setPool, TEST_DATABASE_URL } from '../../../lib/db/pool';
import type { SessionReader } from '../../../lib/interview/session-bind';
import {
  CAPABILITY_MAP,
  DEFAULT_CAPABILITIES,
  VALID_CAPABILITIES,
  capabilityBitfield,
  type Capability,
  type PermissionWithWhy,
} from '../../../lib/invite/permissions';
import {
  EXPECTED_COMMANDS,
  POST,
  PREFLIGHT_INTENTS,
  PREFLIGHT_QUEUE,
  __resetBossFactory as resetStartBoss,
  __resetSessionReader as resetStartReader,
  __setBossFactory as setStartBoss,
  __setSessionReader as setStartReader,
  type PreflightBoss as StartBoss,
} from './start/route';
import {
  GET,
  __resetBossFactory as resetStatusBoss,
  __resetSessionReader as resetStatusReader,
  __setBossFactory as setStatusBoss,
  __setSessionReader as setStatusReader,
  type PreflightBoss as StatusBoss,
} from './route';

const BOT = '11111111-2222-4333-8444-555555555555';
const FOREIGN_BOT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GUILD = '123456789012345678';

const SIGNED_IN: SessionReader = {
  getSession: async () => ({ accountId: 'acct-1', discordId: 'disc-1' }),
};
const SIGNED_OUT: SessionReader = {
  getSession: async () => null,
};

afterEach(() => {
  resetStartReader();
  resetStatusReader();
  resetStartBoss();
  resetStatusBoss();
});

// --- Fakes ---

function stubPool(
  rows: { id: string }[],
  config: { deleted?: boolean } = {},
): {
  pool: Pool;
  calls: { text: string; params: unknown[] }[];
} {
  const calls: { text: string; params: unknown[] }[] = [];
  const pool = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      // Model the real predicate: a soft-deleted bot disappears from the result
      // only because the ownership SQL carries AND deleted_at IS NULL.
      if (config.deleted && text.includes('deleted_at IS NULL')) {
        return { rows: [] };
      }
      return { rows };
    },
  } as unknown as Pool;
  return { pool, calls };
}

interface FetchFixture {
  state: string;
  output?: unknown;
}

function stubBoss(config: { send?: string | null | Error; job?: FetchFixture | null }): {
  factory: () => StartBoss;
  record: {
    startCalls: number;
    stopCalls: number;
    createdQueues: string[];
    sent: { name: string; data: unknown; options: unknown }[];
    fetched: { name: string; id: string }[];
  };
} {
  const record = {
    startCalls: 0,
    stopCalls: 0,
    createdQueues: [] as string[],
    sent: [] as { name: string; data: unknown; options: unknown }[],
    fetched: [] as { name: string; id: string }[],
  };
  const factory = (): StartBoss => {
    return {
      start: async () => {
        record.startCalls += 1;
      },
      stop: async () => {
        record.stopCalls += 1;
      },
      createQueue: async (name: string) => {
        record.createdQueues.push(name);
      },
      send: async (name: string, data: object, options?: SendOptions) => {
        record.sent.push({ name, data, options });
        if (config.send instanceof Error) {
          throw config.send;
        }
        if (config.send === undefined) {
          return 'job-1';
        }
        return config.send;
      },
      getJobById: async (name: string, id: string) => {
        record.fetched.push({ name, id });
        if (config.job === null || config.job === undefined) {
          return null;
        }
        return {
          state: config.job.state,
          output: config.job.output ?? {},
        } as unknown as JobWithMetadata | null;
      },
    };
  };
  return { record, factory };
}

function statusBossFor(job: FetchFixture | null): {
  factory: () => StatusBoss;
  record: { startCalls: number; stopCalls: number };
} {
  const record = { startCalls: 0, stopCalls: 0 };
  const factory = (): StatusBoss => ({
    start: async () => {
      record.startCalls += 1;
    },
    stop: async () => {
      record.stopCalls += 1;
    },
    createQueue: async () => {},
    send: async () => 'unused',
    getJobById: async () => {
      if (job === null) {
        return null;
      }
      return { state: job.state, output: job.output ?? {} } as unknown as JobWithMetadata | null;
    },
  });
  return { record, factory };
}

function postStart(body: unknown): Request {
  return new Request('http://localhost/api/preflight/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getStatus(jobId: string | null): Request {
  const url =
    jobId === null
      ? 'http://localhost/api/preflight'
      : `http://localhost/api/preflight?jobId=${jobId}`;
  return new Request(url);
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function expectedRequired(caps: Capability[]): PermissionWithWhy[] {
  const seen = new Map<string, string>();
  for (const cap of caps) {
    for (const entry of CAPABILITY_MAP[cap]) {
      if (!seen.has(entry.perm)) {
        seen.set(entry.perm, entry.why);
      }
    }
  }
  return [...seen].map(([perm, why]) => ({ perm, why }));
}

// --- POST /api/preflight/start ---

describe('POST /api/preflight/start', () => {
  it('returns 401 first when there is no session, without touching pool or boss', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_OUT);

    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: ['welcome'] }));

    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
    expect(owned.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 404 for a malformed bot id without querying ownership', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    setStartBoss(stubBoss({}).factory);
    setStartReader(SIGNED_IN);

    const res = await POST(
      postStart({ botId: 'not-a-bot-id', guildId: GUILD, capabilities: ['welcome'] }),
    );

    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'bot not found' });
    expect(owned.calls).toHaveLength(0);
  });

  it('returns 404 - never 403 - for a bot owned by someone else', async () => {
    const owned = stubPool([]);
    __setPool(owned.pool);
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(
      postStart({ botId: FOREIGN_BOT, guildId: GUILD, capabilities: ['welcome'] }),
    );

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(await readBody(res)).toEqual({ error: 'bot not found' });
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 404 - never enqueues - for a soft-deleted bot', async () => {
    const owned = stubPool([{ id: BOT }], { deleted: true });
    __setPool(owned.pool);
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: ['welcome'] }));

    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'bot not found' });
    expect(boss.record.startCalls).toBe(0);
    expect(boss.record.sent).toHaveLength(0);
    // The ownership read must carry the same soft-delete predicate the worker
    // uses, or a deleted bot could still be enqueued (builder-start parity).
    const ownership = owned.calls.find((call) => call.text.includes('FROM bots'));
    expect(ownership?.text).toContain('deleted_at IS NULL');
  });

  it('binds the ownership read to the session account id', async () => {
    const owned = stubPool([]);
    __setPool(owned.pool);
    setStartBoss(stubBoss({}).factory);
    setStartReader(SIGNED_IN);

    await POST(postStart({ botId: FOREIGN_BOT, guildId: GUILD, capabilities: ['welcome'] }));

    expect(owned.calls).toHaveLength(1);
    expect(owned.calls[0].text).toContain('account_id');
    expect(owned.calls[0].params).toEqual([FOREIGN_BOT, 'acct-1']);
  });

  it('returns 422 for guild ids outside the snowflake shape', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    setStartBoss(stubBoss({}).factory);
    setStartReader(SIGNED_IN);

    for (const guildId of ['abc', '123', '1'.repeat(16), '1'.repeat(21), '12345678901234567a']) {
      const res = await POST(postStart({ botId: BOT, guildId, capabilities: ['welcome'] }));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({ error: 'invalid guild id' });
    }
  });

  it('returns 422 with the valid list for an empty or unknown capability set', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    setStartBoss(stubBoss({}).factory);
    setStartReader(SIGNED_IN);

    for (const capabilities of [[], ['welcome', 'root'], ['root'], 'welcome']) {
      const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities }));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({
        error: 'unknown capability',
        valid: [...VALID_CAPABILITIES],
      });
    }
  });

  it('derives capabilities from the spec (DEFAULT fallback) when omitted', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, guildId: GUILD }));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ jobId: 'job-1' });
    const derived: Capability[] = [...DEFAULT_CAPABILITIES];
    expect(boss.record.sent).toHaveLength(1);
    expect(boss.record.sent[0].data).toMatchObject({
      required: expectedRequired(derived),
      bitfield: capabilityBitfield(derived).toString(),
      expectedCommands: EXPECTED_COMMANDS,
    });
  });

  it('enqueues the mapper-derived payload with the locked queue, key, and retry options', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const caps: Capability[] = ['welcome', 'moderation'];
    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: caps }));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ jobId: 'job-1' });
    expect(boss.record.startCalls).toBe(1);
    expect(boss.record.stopCalls).toBe(1);
    expect(boss.record.createdQueues).toEqual([PREFLIGHT_QUEUE]);
    expect(boss.record.sent).toHaveLength(1);
    const sent = boss.record.sent[0];
    expect(sent.name).toBe(PREFLIGHT_QUEUE);
    expect(sent.name).toBe('preflight');
    const required = expectedRequired(caps);
    expect(sent.data).toEqual({
      botId: BOT,
      guildId: GUILD,
      required,
      bitfield: capabilityBitfield(caps).toString(),
      intents: PREFLIGHT_INTENTS,
      expectedCommands: EXPECTED_COMMANDS,
    });
    expect(PREFLIGHT_INTENTS).toEqual([
      'Guilds',
      'GuildMembers',
      'GuildMessages',
      'MessageContent',
      'GuildMessageReactions',
    ]);
    expect(sent.options).toEqual({
      singletonKey: `${BOT}:${GUILD}`,
      retryLimit: 3,
      retryDelay: 30,
      expireInSeconds: 3600,
      deleteAfterSeconds: 604800,
    });
  });

  it('derives required from the requested capabilities, not a fixed set', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const caps: Capability[] = ['logging'];
    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: caps }));

    expect(res.status).toBe(200);
    const sent = boss.record.sent[0];
    expect(sent.data).toMatchObject({
      required: expectedRequired(caps),
      bitfield: capabilityBitfield(caps).toString(),
      expectedCommands: EXPECTED_COMMANDS,
    });
  });

  it('returns a generic 500 and still stops the boss when send throws', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    const boss = stubBoss({ send: new Error('pg exploded') });
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: ['welcome'] }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not start scan' });
    expect(boss.record.stopCalls).toBe(1);
  });

  it('returns a generic 500 when queue creation throws', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    setStartBoss(() => ({
      start: async () => {},
      stop: async () => {},
      createQueue: async () => {
        throw new Error('Queue preflight does not exist');
      },
      send: async () => 'unused',
      getJobById: async () => null,
    }));
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: ['welcome'] }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not start scan' });
  });

  it('returns a generic 500 when send resolves to null', async () => {
    const owned = stubPool([{ id: BOT }]);
    __setPool(owned.pool);
    const boss = stubBoss({ send: null });
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: ['welcome'] }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not start scan' });
    expect(boss.record.stopCalls).toBe(1);
  });

  it('fails fast with an honest 500 when DATABASE_URL is unset, never the test DB', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    const boss = stubBoss({});
    setStartBoss(boss.factory);
    setStartReader(SIGNED_IN);

    try {
      const res = await POST(postStart({ botId: BOT, guildId: GUILD, capabilities: ['welcome'] }));

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
});

// --- GET /api/preflight ---

describe('GET /api/preflight', () => {
  it('returns 401 first when there is no session', async () => {
    const boss = statusBossFor({ state: 'active' });
    setStatusBoss(boss.factory);
    setStatusReader(SIGNED_OUT);

    const res = await GET(getStatus(randomUUID()));

    expect(res.status).toBe(401);
    expect(boss.record.startCalls).toBe(0);
  });

  it('answers the same 404 shape for a missing, malformed, or unknown job id', async () => {
    const boss = statusBossFor(null);
    setStatusBoss(boss.factory);
    setStatusReader(SIGNED_IN);

    const missing = await GET(getStatus(null));
    const malformed = await GET(getStatus('not-a-job'));
    const unknown = await GET(getStatus(randomUUID()));

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    const shape = { error: 'scan not found' };
    expect(await readBody(missing)).toEqual(shape);
    expect(await readBody(malformed)).toEqual(shape);
    expect(await readBody(unknown)).toEqual(shape);
  });

  it('passes live states through with their exact pg-boss strings', async () => {
    setStatusReader(SIGNED_IN);

    for (const state of ['created', 'retry', 'active']) {
      const boss = statusBossFor({ state });
      setStatusBoss(boss.factory);
      const res = await GET(getStatus(randomUUID()));
      expect(res.status).toBe(200);
      expect(await readBody(res)).toEqual({ state });
      expect(boss.record.stopCalls).toBe(1);
    }
  });

  it('maps completed to done with the worker result passed through', async () => {
    const output = {
      scannedAt: '2026-09-09T16:00:00.000Z',
      rows: [{ tone: 'green', check: 'installed', detail: 'bot is installed' }],
      summary: { red: 0, yellow: 0, green: 1 },
    };
    const boss = statusBossFor({ state: 'completed', output });
    setStatusBoss(boss.factory);
    setStatusReader(SIGNED_IN);

    const res = await GET(getStatus(randomUUID()));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ state: 'done', preflight: output });
    expect(boss.record.stopCalls).toBe(1);
  });

  it('maps failed to a generic error with no job internals', async () => {
    const boss = statusBossFor({ state: 'failed', output: { detail: 'login_failed' } });
    setStatusBoss(boss.factory);
    setStatusReader(SIGNED_IN);

    const res = await GET(getStatus(randomUUID()));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body).toEqual({ state: 'failed', error: 'scan failed' });
    expect(body).not.toHaveProperty('output');
    expect(boss.record.stopCalls).toBe(1);
  });

  it('maps a missing queue to 404, never 500 (verified live: getJobById throws)', async () => {
    setStatusBoss(() => ({
      start: async () => {},
      stop: async () => {},
      createQueue: async () => {},
      send: async () => 'unused',
      getJobById: async () => {
        throw new Error('Queue preflight does not exist');
      },
    }));
    setStatusReader(SIGNED_IN);

    const res = await GET(getStatus(randomUUID()));

    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'scan not found' });
  });

  it('maps any other fetch failure to a generic 500', async () => {
    setStatusBoss(() => ({
      start: async () => {},
      stop: async () => {},
      createQueue: async () => {},
      send: async () => 'unused',
      getJobById: async () => {
        throw new Error('connection reset');
      },
    }));
    setStatusReader(SIGNED_IN);

    const res = await GET(getStatus(randomUUID()));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not fetch scan' });
  });

  it('fails fast with an honest 500 when DATABASE_URL is unset, never the test DB', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    resetStatusBoss();
    setStatusReader(SIGNED_IN);

    try {
      const res = await GET(getStatus(randomUUID()));

      expect(res.status).toBe(500);
      expect(await readBody(res)).toEqual({ error: 'database not configured' });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  });
});

// --- Live PG/boss paths: run when reachable, LOUD skip otherwise ---

// Minimal schema for the live ownership read: POST /api/preflight/start runs
// `SELECT id FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS
// NULL` (start/route.ts:123-126) before enqueueing, so `bots` alone decides
// whether the 404 path is reachable. On an empty database the relation is
// absent, the read throws, and the route answers 500 'could not start scan'
// instead of 404 'bot not found'.
//
// Columns are verbatim from the sibling migration
// (apps/gateway/drizzle/0001_init.sql) for the columns this route reads.
const REQUIRED_TABLES = ['bots'] as const;

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
];

// Each statement runs on its own so a concurrent suite creating the same table
// (other test files share this database) cannot roll back the rest of the
// batch. The verification below — not the throw — decides whether the schema is
// usable, so a genuine failure is reported by name instead of surfacing as the
// very 500 these tests exist to distinguish from a 404.
async function ensureSchema(pool: Pool): Promise<void> {
  try {
    const sql = await readFile(
      new URL('../../../../gateway/drizzle/0001_init.sql', import.meta.url),
      'utf8',
    );
    await pool.query(sql);
  } catch {
    // Sibling migration unreadable, or a concurrent suite created it first.
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
      `[preflight.test] schema not ready: ${found}/${REQUIRED_TABLES.length} of ` +
        `${REQUIRED_TABLES.join(', ')} exist at ${process.env.DATABASE_URL ?? '(DATABASE_URL unset)'}`,
    );
  }
}

describe('live PG/boss paths (loud skip when unreachable)', () => {
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
      console.warn(`[preflight.test] PG unreachable at ${liveUrl} - skipping live ownership test`);
      return;
    }
    // Live Postgres parses UUID columns: the session must carry a realistic
    // UUID account id (verified: 'acct-1' throws invalid-input-syntax live).
    const liveIdentity: SessionReader = {
      getSession: async () => ({ accountId: randomUUID(), discordId: 'live-disc' }),
    };
    const live = new Pool({ connectionString: liveUrl });
    try {
      __setPool(live);
      setStartReader(liveIdentity);
      resetStartBoss();
      await ensureSchema(live);
      const res = await POST(
        postStart({ botId: randomUUID(), guildId: GUILD, capabilities: ['welcome'] }),
      );
      expect(res.status).toBe(404);
      expect(await readBody(res)).toEqual({ error: 'bot not found' });
    } finally {
      await live.end();
    }
  });

  it('answers 404 through the real boss for an unknown job', async () => {
    if (!(await reachable())) {
      console.warn(`[preflight.test] PG unreachable at ${liveUrl} - skipping live boss test`);
      return;
    }
    // The route no longer silently falls back to TEST_DATABASE_URL, so a live
    // run that opted into the fixture URL passes it explicitly for the duration.
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = liveUrl;
    resetStatusBoss();
    setStatusReader(SIGNED_IN);
    try {
      const res = await GET(getStatus(randomUUID()));
      expect(res.status).toBe(404);
      expect(await readBody(res)).toEqual({ error: 'scan not found' });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
