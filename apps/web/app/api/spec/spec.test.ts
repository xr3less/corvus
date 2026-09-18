import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool } from '../../../lib/db/pool';
import {
  GET as getDraft,
  __resetSessionReader as resetDraftReader,
  __setPool,
  __setSessionReader as setDraftReader,
  type EditorSession,
} from './draft/route';
import {
  POST as postPatch,
  __resetSessionReader as resetPatchReader,
  __setSessionReader as setPatchReader,
} from './patch/route';

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
    `[spec.test] LOUD SKIP: Postgres test database unreachable at ${connectionString}. ` +
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
  console.info(`[spec.test] schema ready via ${migrationSource}`);
}

function getRequest(botId: string | null): Request {
  const url =
    botId === null
      ? 'http://localhost/api/spec/draft'
      : `http://localhost/api/spec/draft?botId=${botId}`;
  return new Request(url, { method: 'GET' });
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/spec/patch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchBody(
  botId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    botId,
    baseVersion: 1,
    behaviors: [{ question: 'purpose', answer: 'study' }],
    summary: 'editor edit',
    ...overrides,
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function actAs(session: EditorSession | null): void {
  const reader = { getSession: async () => session };
  setDraftReader(reader);
  setPatchReader(reader);
}

describe('spec routes without a session', () => {
  beforeEach(() => {
    resetDraftReader();
    resetPatchReader();
  });

  it('draft returns 401 when unauthenticated', async () => {
    const res = await getDraft(getRequest('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('patch returns 401 when unauthenticated', async () => {
    const res = await postPatch(postRequest(patchBody('00000000-0000-0000-0000-000000000000')));
    expect(res.status).toBe(401);
  });
});

// KI-021 slice: with DATABASE_URL unset the shared pool's every read rejects
// with DatabaseNotConfiguredError. Both spec editor reads/writes must report
// that honestly instead of their generic load/save failure. Env is deleted +
// the pool reset so the real unconfigured-pool path runs.
describe('spec routes fail honestly when the database is not configured', () => {
  const BOT = '11111111-2222-4333-8444-555555555555';
  const owner: EditorSession = { accountId: 'acct-1', discordId: 'disc-1' };
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
    resetDraftReader();
    resetPatchReader();
  });

  it('draft returns the canonical honest 500, never a misleading one', async () => {
    const res = await getDraft(getRequest(BOT));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'database not configured' });
  });

  it('patch returns the canonical honest 500, never a misleading one', async () => {
    const res = await postPatch(postRequest(patchBody(BOT)));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'database not configured' });
  });
});

(probe.ok ? describe : describe.skip)('spec routes with Postgres', () => {
  let pool: Pool;
  let owner: EditorSession;
  let intruder: EditorSession;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    // One shared helper serves both routes (same module singleton), so a
    // single injection covers draft + patch.
    __setPool(pool);
    await ensureSchema(pool);
    const tag = `spec-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerRow = await pool.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [`${tag}-owner`],
    );
    const intruderRow = await pool.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [`${tag}-intruder`],
    );
    owner = { accountId: ownerRow.rows[0].id, discordId: `${tag}-owner` };
    intruder = { accountId: intruderRow.rows[0].id, discordId: `${tag}-intruder` };
  }, 30000);

  afterAll(async () => {
    resetDraftReader();
    resetPatchReader();
    await pool?.end().catch(() => {});
  });

  beforeEach(() => {
    actAs(owner);
  });

  async function createBot(name: string): Promise<string> {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO bots (account_id, name, token_cipher, status)
       VALUES ($1, $2, '\\x'::bytea, 'draft')
       RETURNING id`,
      [owner.accountId, name],
    );
    return row.rows[0].id;
  }

  async function mintVersion(
    botId: string,
    version: number,
    behaviors: unknown[],
    summary: string,
  ): Promise<string> {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'draft')
       RETURNING id`,
      [
        botId,
        version,
        JSON.stringify({ version: 1, behaviors }),
        summary,
        `owner:${owner.discordId}`,
      ],
    );
    await pool.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
      row.rows[0].id,
      botId,
    ]);
    return row.rows[0].id;
  }

  it('returns 404 for missing, malformed, and foreign botIds (never leaks existence)', async () => {
    const botId = await createBot('Arena');
    await mintVersion(botId, 1, [{ a: 1 }], 'seed');

    const missing = await getDraft(getRequest(null));
    expect(missing.status).toBe(404);

    const malformed = await getDraft(getRequest('not-a-uuid'));
    expect(malformed.status).toBe(404);

    const absent = await getDraft(getRequest('00000000-0000-0000-0000-000000000000'));
    expect(absent.status).toBe(404);

    actAs(intruder);
    const foreign = await getDraft(getRequest(botId));
    expect(foreign.status).toBe(404);
  });

  it('returns 404 with no-draft for a bot whose draft was never minted', async () => {
    const botId = await createBot('Fresh');
    const res = await getDraft(getRequest(botId));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ error: 'no draft yet' });
  });

  it('returns the minted v1 shape the editor and the AI chat share', async () => {
    const botId = await createBot('Study Hall');
    const behaviors = [
      { question: 'purpose', answer: 'study' },
      { question: 'channels', answer: '#general' },
    ];
    await mintVersion(botId, 1, behaviors, 'seed');

    const res = await getDraft(getRequest(botId));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.version).toBe(1);
    expect(body.state).toBe('draft');
    expect(body.spec).toEqual({ version: 1, behaviors });
  });

  it('patch returns 404 for malformed and foreign botIds', async () => {
    const botId = await createBot('Arena');
    await mintVersion(botId, 1, [{ a: 1 }], 'seed');

    const malformed = await postPatch(postRequest(patchBody('not-a-uuid')));
    expect(malformed.status).toBe(404);

    const absent = await postPatch(postRequest(patchBody('00000000-0000-0000-0000-000000000000')));
    expect(absent.status).toBe(404);

    actAs(intruder);
    const foreign = await postPatch(postRequest(patchBody(botId)));
    expect(foreign.status).toBe(404);
  });

  it('patch returns 404 with no-draft when nothing was ever minted', async () => {
    const botId = await createBot('Fresh');
    const res = await postPatch(postRequest(patchBody(botId)));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ error: 'no draft yet' });
  });

  it('patch rejects malformed bodies with 422', async () => {
    const botId = await createBot('Arena');
    await mintVersion(botId, 1, [{ a: 1 }], 'seed');

    const badBodies: unknown[] = [
      patchBody(botId, { baseVersion: 0 }),
      patchBody(botId, { baseVersion: 1.5 }),
      patchBody(botId, { baseVersion: '1' }),
      patchBody(botId, { behaviors: 'nope' }),
      patchBody(botId, { behaviors: [] }),
      patchBody(botId, { summary: '' }),
      patchBody(botId, { summary: '   ' }),
      patchBody(botId, { summary: 42 }),
    ];
    for (const body of badBodies) {
      const res = await postPatch(postRequest(body));
      expect(res.status).toBe(422);
    }
    const notJson = await postPatch(
      new Request('http://localhost/api/spec/patch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      }),
    );
    expect(notJson.status).toBe(422);
  });

  it('rejects a stale base with 409 naming the current version', async () => {
    const botId = await createBot('Arena');
    await mintVersion(botId, 1, [{ a: 1 }], 'seed');

    const stale = await postPatch(postRequest(patchBody(botId, { baseVersion: 999 })));
    expect(stale.status).toBe(409);
    expect(await readJson(stale)).toMatchObject({ error: 'stale base', currentVersion: 1 });
  });

  it('patches v1 to v2 and the draft read follows the pointer', async () => {
    const botId = await createBot('Study Hall');
    await mintVersion(botId, 1, [{ question: 'purpose', answer: 'study' }], 'seed');

    const behaviors = [
      { question: 'purpose', answer: 'study' },
      { question: 'channels', answer: '#general' },
    ];
    const res = await postPatch(
      postRequest(patchBody(botId, { behaviors, summary: 'added channels' })),
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ version: 2 });

    const row = await pool.query<{
      version: number;
      author: string;
      state: string;
      diff_summary: string;
      spec: { version: number; behaviors: unknown[] };
    }>(
      'SELECT version, author, state, diff_summary, spec FROM spec_versions WHERE bot_id = $1 AND version = $2',
      [botId, 2],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].version).toBe(2);
    expect(row.rows[0].author).toBe(`owner:${owner.discordId}`);
    expect(row.rows[0].state).toBe('draft');
    expect(row.rows[0].diff_summary).toBe('added channels');
    expect(row.rows[0].spec).toEqual({ version: 1, behaviors });

    const pointer = await pool.query<{ draft_spec_id: string }>(
      'SELECT draft_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    const headId = await pool.query<{ id: string }>(
      'SELECT id FROM spec_versions WHERE bot_id = $1 AND version = $2',
      [botId, 2],
    );
    expect(pointer.rows[0].draft_spec_id).toBe(headId.rows[0].id);

    const draft = await getDraft(getRequest(botId));
    expect(draft.status).toBe(200);
    expect(await readJson(draft)).toMatchObject({ version: 2 });

    const replay = await postPatch(postRequest(patchBody(botId, { baseVersion: 1 })));
    expect(replay.status).toBe(409);
    expect(await readJson(replay)).toMatchObject({ error: 'stale base', currentVersion: 2 });
  });

  it('leaves the old row byte-identical after a patch (history is immutable)', async () => {
    const botId = await createBot('Archive');
    await mintVersion(botId, 1, [{ v: 1 }], 'seed');
    const before = await pool.query<{ spec: unknown }>(
      'SELECT spec FROM spec_versions WHERE bot_id = $1 AND version = $2',
      [botId, 1],
    );
    const snapshot = JSON.stringify(before.rows[0].spec);

    const res = await postPatch(postRequest(patchBody(botId, { behaviors: [{ v: 2 }] })));
    expect(res.status).toBe(200);

    const after = await pool.query<{ spec: unknown; version: number }>(
      'SELECT spec, version FROM spec_versions WHERE bot_id = $1 AND version = $2',
      [botId, 1],
    );
    expect(after.rowCount).toBe(1);
    expect(after.rows[0].version).toBe(1);
    expect(JSON.stringify(after.rows[0].spec)).toBe(snapshot);
  });

  it('trims an over-long summary to 500 chars in the stored row', async () => {
    const botId = await createBot('Verbose');
    await mintVersion(botId, 1, [{ v: 1 }], 'seed');

    const res = await postPatch(
      postRequest(patchBody(botId, { behaviors: [{ v: 2 }], summary: `  ${'s'.repeat(600)}  ` })),
    );
    expect(res.status).toBe(200);
    const row = await pool.query<{ diff_summary: string }>(
      'SELECT diff_summary FROM spec_versions WHERE bot_id = $1 AND version = $2',
      [botId, 2],
    );
    expect(row.rows[0].diff_summary).toHaveLength(500);
  });

  it('resolves a double-patch race to exactly one winner and one 409', async () => {
    const botId = await createBot('Racy');
    await mintVersion(botId, 1, [{ v: 1 }], 'seed');
    const first = await postPatch(postRequest(patchBody(botId, { behaviors: [{ v: 2 }] })));
    expect(first.status).toBe(200);

    const [a, b] = await Promise.all([
      postPatch(postRequest(patchBody(botId, { baseVersion: 2, behaviors: [{ winner: 'a' }] }))),
      postPatch(postRequest(patchBody(botId, { baseVersion: 2, behaviors: [{ winner: 'b' }] }))),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const loser = a.status === 409 ? a : b;
    expect(await readJson(loser)).toMatchObject({ error: 'stale base', currentVersion: 3 });

    const head = await pool.query<{ version: number }>(
      'SELECT MAX(version) AS version FROM spec_versions WHERE bot_id = $1',
      [botId],
    );
    expect(Number(head.rows[0].version)).toBe(3);
  });
});
