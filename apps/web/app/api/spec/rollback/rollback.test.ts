// Tests for POST /api/spec/rollback (V1-3 T-rollback, locked contract).
//
// Pure validation always runs. Every Postgres-backed path probes first and,
// when unreachable, warns LOUDLY and skips via ctx.skip() naming the missing
// variable (L-008/L-009) — never a hook throw, never silent.

import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool, __setPool } from '../../../../lib/db/pool';
import {
  POST,
  __resetSessionReader,
  __setSessionReader,
  validateRollbackBody,
  type EditorSession,
} from './route';

const TEST_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';
const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'connection failed' };
  } finally {
    await pool.end().catch(() => {});
  }
}

const probe = await probeDatabase();
const skipReason =
  `Postgres unreachable at ${connectionString} ` +
  `(${process.env.DATABASE_URL ? 'DATABASE_URL' : 'default TEST_DATABASE_URL'}): ${probe.reason}`;
if (!probe.ok) {
  console.warn(`[rollback.test] LOUD SKIP: ${skipReason}. Start the test container, then re-run.`);
}

// Mirrors publish.test.ts / the sibling migrations. audit_events has no
// migration on disk yet (Docs/06 §2 defines it) — Flag: add one before prod.
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
);
CREATE TABLE IF NOT EXISTS guild_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  preflight jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, guild_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid,
  bot_id uuid,
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);`;

let pool: Pool | null = null;
let owner: EditorSession;
let intruder: EditorSession;
let pgReady = false;

async function ensurePg(): Promise<void> {
  if (pgReady) {
    return;
  }
  pool = new Pool({ connectionString });
  __setPool(pool);
  const sources = [
    '../../../../../gateway/drizzle/0001_init.sql',
    '../../../../../gateway/drizzle/0002_v11.sql',
    '../../../../../gateway/drizzle/0005_guilds.sql',
  ];
  for (const relative of sources) {
    try {
      const sql = await readFile(new URL(relative, import.meta.url), 'utf8');
      await pool.query(sql);
    } catch {
      // Sibling migration unreadable — the fallback DDL below covers it.
    }
  }
  await pool.query(FALLBACK_DDL);
  const tag = `rollback-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  owner = await makeAccount(`${tag}-owner`);
  intruder = await makeAccount(`${tag}-intruder`);
  pgReady = true;
}

async function makeAccount(discordId: string): Promise<EditorSession> {
  const active = pool as Pool;
  const row = await active.query<{ id: string }>(
    'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
    [discordId],
  );
  return { accountId: row.rows[0].id, discordId };
}

async function createBot(accountId: string, name: string): Promise<string> {
  const active = pool as Pool;
  const row = await active.query<{ id: string }>(
    `INSERT INTO bots (account_id, name, token_cipher, status)
     VALUES ($1, $2, '\\x'::bytea, 'draft')
     RETURNING id`,
    [accountId, name],
  );
  return row.rows[0].id;
}

async function mintVersion(botId: string, version: number, discordId: string): Promise<string> {
  const active = pool as Pool;
  const row = await active.query<{ id: string }>(
    `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'draft')
     RETURNING id`,
    [
      botId,
      version,
      JSON.stringify({ version: 1, behaviors: [{ v: version }] }),
      `v${version}`,
      `owner:${discordId}`,
    ],
  );
  return row.rows[0].id;
}

async function setProd(botId: string, specId: string): Promise<void> {
  const active = pool as Pool;
  await active.query('UPDATE bots SET prod_spec_id = $1, updated_at = now() WHERE id = $2', [
    specId,
    botId,
  ]);
}

async function insertAudit(
  accountId: string,
  botId: string,
  action: 'publish' | 'rollback',
  version: number,
  discordId: string,
): Promise<void> {
  const active = pool as Pool;
  await active.query(
    `INSERT INTO audit_events (account_id, bot_id, actor, action, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      accountId,
      botId,
      `owner:${discordId}`,
      action,
      JSON.stringify({ version, preflight: 'unscanned' }),
    ],
  );
}

function actAs(session: EditorSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

function rollbackRequest(body: unknown): Request {
  return new Request('http://localhost/api/spec/rollback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

afterAll(async () => {
  __resetSessionReader();
  await pool?.end().catch(() => {});
});

// --- Pure logic (no database) ----------------------------------------------

describe('rollback body validation (pure)', () => {
  const BOT = '11111111-2222-4333-8444-555555555555';

  it('accepts a botId and positive integer version', () => {
    expect(validateRollbackBody({ botId: BOT, version: 2 })).toEqual({
      ok: true,
      value: { botId: BOT, version: 2 },
    });
  });

  it('maps a malformed botId to 404 and a missing/bad version to 422', () => {
    expect(validateRollbackBody({ botId: 'nope', version: 1 })).toEqual({
      ok: false,
      status: 404,
      error: 'not found',
    });
    for (const version of [undefined, null, 0, -3, 2.5, '2', {}]) {
      expect(validateRollbackBody({ botId: BOT, version })).toEqual({
        ok: false,
        status: 422,
        error: 'version must be a positive integer',
      });
    }
  });

  it('rejects non-object bodies with 422', () => {
    for (const body of [null, [], 'x', 7]) {
      expect(validateRollbackBody(body)).toEqual({
        ok: false,
        status: 422,
        error: 'body must be an object',
      });
    }
  });
});

describe('rollback request shape without a database', () => {
  afterEach(() => {
    __resetSessionReader();
  });

  it('returns 401 when unauthenticated', async () => {
    __resetSessionReader();
    const res = await POST(rollbackRequest({ botId: 'not-a-uuid', version: 1 }));
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'unauthorized' });
  });

  it('returns 404/422 for malformed input with a valid session but no database', async () => {
    actAs({ accountId: 'acct', discordId: 'disc' });
    const bad = await POST(rollbackRequest({ botId: 'not-a-uuid', version: 1 }));
    expect(bad.status).toBe(404);
    const badVersion = await POST(
      rollbackRequest({ botId: '11111111-2222-4333-8444-555555555555', version: '1' }),
    );
    expect(badVersion.status).toBe(422);
  });

  // KI-021 slice: a valid request whose first read hits the stand-in pool must
  // name the real cause, never the generic rollback failure. Env is deleted +
  // the pool reset so the real unconfigured-pool path runs.
  it('returns the canonical honest 500 when the database is not configured', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetPool();
    try {
      actAs({ accountId: 'acct', discordId: 'disc' });
      const res = await POST(
        rollbackRequest({ botId: '11111111-2222-4333-8444-555555555555', version: 1 }),
      );
      expect(res.status).toBe(500);
      expect(await readJson(res)).toEqual({ error: 'database not configured' });
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
      __resetPool();
    }
  });
});

// --- Postgres-backed --------------------------------------------------------

describe('rollback against Postgres (loud skip when unreachable)', () => {
  it('rolls back to an older previously-published version and audits the move', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'Older');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setProd(botId, v2);
    await insertAudit(owner.accountId, botId, 'publish', 1, owner.discordId);
    await insertAudit(owner.accountId, botId, 'publish', 2, owner.discordId);

    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1 });

    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v1);

    const audit = await (pool as Pool).query<{
      actor: string;
      action: string;
      detail: { version: number; preflight: unknown };
    }>("SELECT actor, action, detail FROM audit_events WHERE bot_id = $1 AND action = 'rollback'", [
      botId,
    ]);
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor).toBe(`owner:${owner.discordId}`);
    expect(audit.rows[0].detail).toEqual({ version: 1, preflight: 'unscanned' });

    // The target row itself is untouched.
    const row = await (pool as Pool).query<{ state: string; spec: unknown }>(
      'SELECT state, spec FROM spec_versions WHERE id = $1',
      [v1],
    );
    expect(row.rows[0].state).toBe('draft');
    expect(row.rows[0].spec).toEqual({ version: 1, behaviors: [{ v: 1 }] });
  });

  it('returns 404 when the target version was never published', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'Unpublished');
    await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setProd(botId, v2);
    await insertAudit(owner.accountId, botId, 'publish', 2, owner.discordId);

    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a version that is not older than production', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'NotOlder');
    await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setProd(botId, v2);
    await insertAudit(owner.accountId, botId, 'publish', 1, owner.discordId);
    await insertAudit(owner.accountId, botId, 'publish', 2, owner.discordId);

    const res = await POST(rollbackRequest({ botId, version: 2 }));
    expect(res.status).toBe(404);
  });

  it('returns 404 - never 403 - for a bot owned by someone else', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const botId = await createBot(owner.accountId, 'ForeignRollback');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setProd(botId, v2);
    await insertAudit(owner.accountId, botId, 'publish', 1, owner.discordId);
    void v1;

    actAs(intruder);
    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('returns 404 when nothing has ever been published', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'NoProd');
    await mintVersion(botId, 1, owner.discordId);

    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(404);
  });

  it('allows rollback with a Red scan (recovery is never blocked)', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RollbackRed');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setProd(botId, v2);
    await insertAudit(owner.accountId, botId, 'publish', 1, owner.discordId);
    await insertAudit(owner.accountId, botId, 'publish', 2, owner.discordId);
    const redEnvelope = {
      scannedAt: '2026-09-09T16:00:00.000Z',
      rows: [{ severity: 'Red', check: 'missing-permissions', detail: 'x', fix: 're-invite' }],
      summary: { red: 1, yellow: 0, green: 0 },
    };
    await (pool as Pool).query(
      'INSERT INTO guild_installs (bot_id, guild_id, preflight) VALUES ($1, $2, $3::jsonb)',
      [botId, '200000000000000001', JSON.stringify(redEnvelope)],
    );

    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1 });

    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v1);

    const audit = await (pool as Pool).query<{
      action: string;
      detail: { version: number; preflight: unknown };
    }>("SELECT action, detail FROM audit_events WHERE bot_id = $1 AND action = 'rollback'", [
      botId,
    ]);
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].detail).toEqual({ version: 1, preflight: redEnvelope });
  });
});
