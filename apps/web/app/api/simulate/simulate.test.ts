import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool } from '../../../lib/db/pool';
import {
  POST as postSimulate,
  __resetSessionReader,
  __setPool,
  __setSessionReader,
  type SimulateSession,
} from './route';

const TEST_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';
const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  } finally {
    await pool.end().catch(() => {});
  }
}

const probe = await probeDatabase();
if (!probe.ok) {
  console.warn(
    `[simulate.test] LOUD SKIP: Postgres test database unreachable at ${connectionString}. ` +
      `Reason: ${probe.reason}. Start the orchestrator-owned test container, then re-run.`,
  );
}

// Inline fallback DDL matching the sibling migrations verbatim (0001 bots
// columns + 0002 accounts/spec_versions). Runs only when the migration files
// are unreadable; every statement is IF NOT EXISTS so it is a no-op once the
// siblings land.
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
);
CREATE TABLE IF NOT EXISTS spec_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  version int NOT NULL,
  spec jsonb NOT NULL,
  diff_summary text NOT NULL DEFAULT '',
  author text NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, version)
);`;

let migrationSource = 'none (database unreachable)';

async function ensureSchema(pool: Pool): Promise<void> {
  const sources = [
    '../../../../gateway/drizzle/0001_init.sql',
    '../../../../gateway/drizzle/0002_v11.sql',
  ];
  let applied = 0;
  for (const relative of sources) {
    try {
      const sql = await readFile(new URL(relative, import.meta.url), 'utf8');
      await pool.query(sql);
      applied += 1;
    } catch {
      // Sibling migration not readable yet — fallback path below.
    }
  }
  migrationSource =
    applied === sources.length
      ? '0001_init.sql + 0002_v11.sql (sibling migrations)'
      : `inline-fallback (${applied}/${sources.length} sibling files applied)`;
  await pool.query(FALLBACK_DDL);
  console.info(`[simulate.test] schema ready via ${migrationSource}`);
}

const BOT_ID = '11111111-1111-1111-1111-111111111111';
const FOREIGN_BOT_ID = '22222222-2222-2222-2222-222222222222';

const GREETER_BEHAVIORS = [
  { title: 'Welcome greeter', text: 'welcome new members to the server' },
  { title: 'Farewell', text: 'say goodbye when members leave' },
];

const owner: SimulateSession = {
  accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  discordId: 'owner-1',
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function simBody(botId: unknown, event: unknown): Record<string, unknown> {
  return { botId, event };
}

function goodEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'message', text: 'welcome everyone', ...overrides };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function actAs(session: SimulateSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

// A pool whose query always throws: injected for every test that must return
// BEFORE any database work (401/404-shape/422). If the route ever queries
// first, the test fails loudly instead of silently passing.
function noQueryPool(): Pool {
  return {
    query: async (): Promise<never> => {
      throw new Error('route touched the database before finishing input validation');
    },
  } as unknown as Pool;
}

interface StubOptions {
  owned: boolean;
  draftSpecId?: string | null;
  versionRow?: { version: number; spec: unknown } | null;
}

interface RecordedCall {
  text: string;
  params: unknown[];
}

function stubPool(options: StubOptions): { pool: Pool; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const pool = {
    query: async (
      text: string,
      params: unknown[],
    ): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> => {
      calls.push({ text, params });
      if (text.indexOf('FROM bots') !== -1) {
        if (!options.owned) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ draft_spec_id: options.draftSpecId ?? null }] };
      }
      if (text.indexOf('FROM spec_versions') !== -1) {
        if (options.versionRow === undefined || options.versionRow === null) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [options.versionRow] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  } as unknown as Pool;
  return { pool, calls };
}

describe('simulate route without a session', () => {
  beforeEach(() => {
    __resetSessionReader();
    __setPool(noQueryPool());
  });

  afterAll(() => {
    __resetSessionReader();
  });

  it('returns 401 for a well-formed body when unauthenticated', async () => {
    const res = await postSimulate(postRequest(simBody(BOT_ID, goodEvent())));
    expect(res.status).toBe(401);
    expect(await readJson(res)).toMatchObject({ error: 'unauthorized' });
  });

  it('returns 401 even for a garbage body - session is checked first', async () => {
    const res = await postSimulate(
      new Request('http://localhost/api/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('simulate route with malformed botIds', () => {
  beforeEach(() => {
    actAs(owner);
    // Malformed ids return before any query: the throwing pool proves it.
    __setPool(noQueryPool());
  });

  afterAll(() => {
    __resetSessionReader();
  });

  it('returns 404 for missing, malformed, and non-string botIds', async () => {
    const badBodies: unknown[] = [
      simBody('not-a-uuid', goodEvent()),
      simBody('', goodEvent()),
      simBody(42, goodEvent()),
      simBody(null, goodEvent()),
      { event: goodEvent() },
      simBody(`${BOT_ID}-extra`, goodEvent()),
    ];
    for (const body of badBodies) {
      const res = await postSimulate(postRequest(body));
      expect(res.status).toBe(404);
      expect(await readJson(res)).toMatchObject({ error: 'not found' });
    }
  });
});

describe('simulate route ownership', () => {
  afterAll(() => {
    __resetSessionReader();
  });

  beforeEach(() => {
    actAs(owner);
  });

  it('returns 404 for a foreign botId and scopes the lookup by account', async () => {
    const { pool, calls } = stubPool({ owned: false });
    __setPool(pool);
    const res = await postSimulate(postRequest(simBody(FOREIGN_BOT_ID, goodEvent())));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ error: 'not found' });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('account_id');
    expect(calls[0].params).toEqual([FOREIGN_BOT_ID, owner.accountId]);
  });
});

describe('simulate route event validation', () => {
  beforeEach(() => {
    actAs(owner);
    // Invalid events return before any query: the throwing pool proves it.
    __setPool(noQueryPool());
  });

  afterAll(() => {
    __resetSessionReader();
  });

  it('returns 422 for missing, non-object, and mistyped events', async () => {
    const badBodies: unknown[] = [
      { botId: BOT_ID },
      simBody(BOT_ID, null),
      simBody(BOT_ID, 'message'),
      simBody(BOT_ID, [goodEvent()]),
      simBody(BOT_ID, { text: 'hello' }),
      simBody(BOT_ID, goodEvent({ kind: 'typing' })),
      simBody(BOT_ID, goodEvent({ kind: '' })),
      simBody(BOT_ID, goodEvent({ kind: 42 })),
    ];
    for (const body of badBodies) {
      const res = await postSimulate(postRequest(body));
      expect(res.status).toBe(422);
      expect(typeof (await readJson(res)).error).toBe('string');
    }
  });

  it('returns 422 when message or slash events lack usable text', async () => {
    const badEvents: unknown[] = [
      { kind: 'message' },
      { kind: 'message', text: '' },
      { kind: 'message', text: '   ' },
      { kind: 'message', text: 'x'.repeat(501) },
      { kind: 'message', text: 42 },
      { kind: 'slash' },
      { kind: 'slash', text: '' },
      { kind: 'slash', text: '   ' },
      { kind: 'slash', text: 'x'.repeat(501) },
    ];
    for (const event of badEvents) {
      const res = await postSimulate(postRequest(simBody(BOT_ID, event)));
      expect(res.status).toBe(422);
    }
  });

  it('returns 422 when user or channel tags are empty, over-long, or mistyped', async () => {
    const badEvents: unknown[] = [
      goodEvent({ user: '' }),
      goodEvent({ user: '   ' }),
      goodEvent({ user: 'u'.repeat(101) }),
      goodEvent({ user: 42 }),
      goodEvent({ channel: '' }),
      goodEvent({ channel: 'c'.repeat(101) }),
      goodEvent({ channel: { id: '1' } }),
    ];
    for (const event of badEvents) {
      const res = await postSimulate(postRequest(simBody(BOT_ID, event)));
      expect(res.status).toBe(422);
    }
  });

  it('returns 422 for a non-JSON body after a valid session', async () => {
    const res = await postSimulate(
      new Request('http://localhost/api/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe('simulate route draft loading', () => {
  afterAll(() => {
    __resetSessionReader();
  });

  beforeEach(() => {
    actAs(owner);
  });

  it('returns 404 no-draft when the bot never minted one', async () => {
    const { pool } = stubPool({ owned: true, draftSpecId: null });
    __setPool(pool);
    const res = await postSimulate(postRequest(simBody(BOT_ID, goodEvent())));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ error: 'no draft yet' });
  });

  it('returns 500 when the draft pointer dangles', async () => {
    const { pool } = stubPool({
      owned: true,
      draftSpecId: '33333333-3333-3333-3333-333333333333',
      versionRow: null,
    });
    __setPool(pool);
    const res = await postSimulate(postRequest(simBody(BOT_ID, goodEvent())));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toMatchObject({ error: 'could not run simulation' });
  });

  it('returns 500 without leaking details when the stored spec is invalid', async () => {
    const { pool } = stubPool({
      owned: true,
      draftSpecId: '33333333-3333-3333-3333-333333333333',
      versionRow: { version: 2, spec: { nope: true } },
    });
    __setPool(pool);
    const res = await postSimulate(postRequest(simBody(BOT_ID, goodEvent())));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toMatchObject({ error: 'could not run simulation' });
  });
});

describe('simulate route happy path', () => {
  afterAll(() => {
    __resetSessionReader();
  });

  beforeEach(() => {
    actAs(owner);
  });

  it('echoes the draft version and the fired entries for a message event', async () => {
    const { pool } = stubPool({
      owned: true,
      draftSpecId: '33333333-3333-3333-3333-333333333333',
      versionRow: { version: 7, spec: { version: 1, behaviors: GREETER_BEHAVIORS } },
    });
    __setPool(pool);
    const res = await postSimulate(postRequest(simBody(BOT_ID, goodEvent())));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.version).toBe(7);
    expect(body.fired).toEqual([
      { behaviorIndex: 0, title: 'Welcome greeter', reason: 'matched: welcome', score: 1 },
    ]);
  });

  it('accepts join events without text and fires the welcome entry', async () => {
    const { pool } = stubPool({
      owned: true,
      draftSpecId: '33333333-3333-3333-3333-333333333333',
      versionRow: { version: 1, spec: { version: 1, behaviors: GREETER_BEHAVIORS } },
    });
    __setPool(pool);
    const res = await postSimulate(postRequest(simBody(BOT_ID, { kind: 'join' })));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.version).toBe(1);
    const fired = body.fired as Array<{ behaviorIndex: number }>;
    expect(fired.some((entry) => entry.behaviorIndex === 0)).toBe(true);
  });

  it('fires the command entry for a slash event with user and channel tags', async () => {
    const behaviors = [{ title: 'Help command', text: 'list all bot commands with help' }];
    const { pool } = stubPool({
      owned: true,
      draftSpecId: '33333333-3333-3333-3333-333333333333',
      versionRow: { version: 1, spec: { version: 1, behaviors } },
    });
    __setPool(pool);
    const res = await postSimulate(
      postRequest(
        simBody(BOT_ID, { kind: 'slash', text: '/help', user: 'Ada', channel: 'general' }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.fired).toEqual([
      { behaviorIndex: 0, title: 'Help command', reason: 'matched: command, help', score: 2 },
    ]);
  });
});

describe('simulate route static safety proof', () => {
  it('route file has no write statements, Discord imports, or env reads', async () => {
    // NOTE: import.meta.url is http://localhost:3000/... under this jsdom
    // setup (probed 2026-09-09), so URL-relative reads do not reach disk.
    // Resolve from the workspace cwd instead; both canonical invocations
    // (npx vitest from apps/web, npm run test --workspace @corvus/web) run
    // with cwd = apps/web, with a repo-root fallback.
    const candidates = [
      path.join(process.cwd(), 'app/api/simulate/route.ts'),
      path.join(process.cwd(), 'apps/web/app/api/simulate/route.ts'),
    ];
    let source: string | null = null;
    for (const candidate of candidates) {
      try {
        source = await readFile(candidate, 'utf8');
        break;
      } catch {
        // Try the next candidate.
      }
    }
    expect(source).not.toBeNull();
    const text = source as string;
    for (const banned of ['INSERT', 'UPDATE', 'DELETE', 'BEGIN']) {
      expect(text.indexOf(banned)).toBe(-1);
    }
    expect(text.indexOf('discord.js')).toBe(-1);
    expect(text.indexOf("from 'discord")).toBe(-1);
    expect(text.indexOf('from "discord')).toBe(-1);
    expect(text.indexOf('process.env')).toBe(-1);
  });
});

// KI-021 slice: the stand-in pool rejects every query with
// DatabaseNotConfiguredError; the route must name that honestly instead of the
// generic simulation failure. Env is deleted + the pool reset so the real
// unconfigured-pool path runs.
describe('simulate route fails honestly when the database is not configured', () => {
  let savedUrl: string | undefined;

  beforeEach(() => {
    savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetPool();
    actAs(owner);
  });

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    __resetPool();
    __resetSessionReader();
  });

  it('returns the canonical honest 500, never a misleading one', async () => {
    const res = await postSimulate(postRequest(simBody(BOT_ID, goodEvent())));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'database not configured' });
  });
});

(probe.ok ? describe : describe.skip)('simulate route with Postgres', () => {
  let pool: Pool;
  let liveOwner: SimulateSession;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    __setPool(pool);
    await ensureSchema(pool);
    const tag = `simulate-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerRow = await pool.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [`${tag}-owner`],
    );
    liveOwner = { accountId: ownerRow.rows[0].id, discordId: `${tag}-owner` };
  }, 30000);

  afterAll(async () => {
    __resetSessionReader();
    await pool?.end().catch(() => {});
  });

  beforeEach(() => {
    actAs(liveOwner);
  });

  async function createBot(): Promise<string> {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO bots (account_id, name, token_cipher, status)
       VALUES ($1, $2, '\\x'::bytea, 'draft')
       RETURNING id`,
      [liveOwner.accountId, 'Sim Hall'],
    );
    return row.rows[0].id;
  }

  async function mintDraft(botId: string, version: number): Promise<void> {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'draft')
       RETURNING id`,
      [
        botId,
        version,
        JSON.stringify({ version: 1, behaviors: GREETER_BEHAVIORS }),
        'seed',
        `owner:${liveOwner.discordId}`,
      ],
    );
    await pool.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
      row.rows[0].id,
      botId,
    ]);
  }

  it('returns 404 no-draft for a live bot that never minted one', async () => {
    const botId = await createBot();
    const res = await postSimulate(postRequest(simBody(botId, goodEvent())));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ error: 'no draft yet' });
  });

  it('returns the draft version and fired entries for a live minted draft', async () => {
    const botId = await createBot();
    await mintDraft(botId, 1);
    const res = await postSimulate(postRequest(simBody(botId, goodEvent())));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.version).toBe(1);
    expect(body.fired).toEqual([
      { behaviorIndex: 0, title: 'Welcome greeter', reason: 'matched: welcome', score: 1 },
    ]);
  });
});
