// Tests for POST /api/spec/publish (V1-3 T-publish, locked contract).
//
// Pure Red/validation logic always runs. Every Postgres-backed path probes the
// database first and, when it is unreachable, warns LOUDLY and skips via
// ctx.skip() naming the missing variable (L-008/L-009) — never a hook throw,
// never silent. Bring the test container up at TEST_DATABASE_URL to run them.

import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool, __setPool } from '../../../../lib/db/pool';
import {
  POST,
  RUNTIME_KINDS,
  __resetSessionReader,
  __resetTranslator,
  __setSessionReader,
  __setTranslator,
  defaultTranslateProdSpec,
  validatePublishBody,
  type EditorSession,
} from './route';
import { detectRedFailing, latestPreflightEnvelope } from '../../../../lib/spec/preflight';

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
  console.warn(`[publish.test] LOUD SKIP: ${skipReason}. Start the test container, then re-run.`);
}

// Inline fallback DDL matching the sibling migrations verbatim. audit_events
// is NOT in any migration yet (Docs/06 §2 defines it; no SQL file owns it), so
// the test creates it here — Flag: a migration must land before prod use.
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
);
-- bot_runtime_config mirrors apps/gateway/drizzle/0012_bot_runtime_config.sql
-- verbatim (the publish hook writes it; ensurePg also tries the real file
-- first — this copy covers an unreadable sibling tree).
CREATE TABLE IF NOT EXISTS bot_runtime_config (
  bot_id uuid NOT NULL,
  guild_id text,
  kind text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  spec_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bot_runtime_config_kind_check"
    CHECK ("kind" IN ('welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status', 'tickets', 'reaction-roles')),
  CONSTRAINT "bot_runtime_config_bot_guild_kind_unique"
    UNIQUE NULLS NOT DISTINCT ("bot_id", "guild_id", "kind")
);
-- E1 widening applied to databases created from this fallback before 0013 lands:
-- the standalone CREATE TABLE above pins the 6-kind CHECK on first creation, so
-- re-assert the 8-kind fence here (idempotent on fresh trees where 0013 runs).
ALTER TABLE IF EXISTS bot_runtime_config DROP CONSTRAINT IF EXISTS "bot_runtime_config_kind_check";
ALTER TABLE IF EXISTS bot_runtime_config ADD CONSTRAINT "bot_runtime_config_kind_check"
  CHECK ("kind" IN ('welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status', 'tickets', 'reaction-roles'));`;

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
    '../../../../../gateway/drizzle/0012_bot_runtime_config.sql',
    '../../../../../gateway/drizzle/0013_runtime_kinds_tickets.sql',
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
  const tag = `publish-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function mintVersion(
  botId: string,
  version: number,
  discordId: string,
  state = 'draft',
  spec: unknown = { version: 1, behaviors: [{ v: version }] },
): Promise<string> {
  const active = pool as Pool;
  const row = await active.query<{ id: string }>(
    `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id`,
    [botId, version, JSON.stringify(spec), `v${version}`, `owner:${discordId}`, state],
  );
  return row.rows[0].id;
}

async function setDraft(botId: string, specId: string): Promise<void> {
  const active = pool as Pool;
  await active.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
    specId,
    botId,
  ]);
}

function actAs(session: EditorSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

function publishRequest(body: unknown): Request {
  return new Request('http://localhost/api/spec/publish', {
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

describe('preflight Red detection (pure)', () => {
  it('names every distinct Red check and ignores Green/Yellow', () => {
    const envelope = {
      scannedAt: '2026-09-09T16:00:00.000Z',
      rows: [
        { severity: 'Green', check: 'installed', detail: 'ok', fix: '' },
        { severity: 'Red', check: 'role-hierarchy', detail: 'below managed', fix: 'move up' },
        { severity: 'Yellow', check: 'intents', detail: 'retry', fix: 'retry' },
        { severity: 'Red', check: 'role-hierarchy', detail: 'dup', fix: 'move up' },
        { severity: 'Red', check: 'missing-permissions', detail: 'x', fix: 're-invite' },
      ],
    };
    expect(detectRedFailing([envelope])).toEqual(['role-hierarchy', 'missing-permissions']);
  });

  it('returns empty for all-clear scans and for no scans at all', () => {
    expect(detectRedFailing([])).toEqual([]);
    expect(detectRedFailing([{ rows: [{ severity: 'Green', check: 'installed' }] }])).toEqual([]);
  });

  it('recognises the on-disk V1-4 worker tone spelling as Red too', () => {
    // apps/gateway/src/preflight/worker.ts stores { tone } (lowercase) — the
    // seam that would otherwise let a Red scan slip through.
    expect(detectRedFailing([{ rows: [{ tone: 'red', check: 'installed' }] }])).toEqual([
      'installed',
    ]);
    expect(detectRedFailing([{ rows: [{ severity: 'red', check: 'installed' }] }])).toEqual([
      'installed',
    ]);
  });

  it('ignores malformed rows without throwing', () => {
    expect(detectRedFailing([null, 42, {}, { rows: 'nope' }])).toEqual([]);
    expect(detectRedFailing([{ rows: [{ severity: 'Red' }] }])).toEqual(['unknown']);
  });

  it('picks the most recently scanned envelope for the audit snapshot', () => {
    const older = { scannedAt: '2026-09-08T00:00:00.000Z', rows: [], summary: {} };
    const newer = { scannedAt: '2026-09-09T00:00:00.000Z', rows: [], summary: {} };
    expect(latestPreflightEnvelope([older, newer])).toBe(newer);
    expect(latestPreflightEnvelope([])).toBeNull();
    expect(latestPreflightEnvelope([older])).toBe(older);
  });
});

describe('publish body validation (pure)', () => {
  const BOT = '11111111-2222-4333-8444-555555555555';

  it('accepts a botId with no version (defaults to the draft)', () => {
    expect(validatePublishBody({ botId: BOT })).toEqual({
      ok: true,
      value: { botId: BOT, version: null },
    });
    expect(validatePublishBody({ botId: BOT, version: null })).toEqual({
      ok: true,
      value: { botId: BOT, version: null },
    });
  });

  it('accepts a positive integer version', () => {
    expect(validatePublishBody({ botId: BOT, version: 3 })).toEqual({
      ok: true,
      value: { botId: BOT, version: 3 },
    });
  });

  it('maps a malformed botId to 404 and a bad version to 422', () => {
    expect(validatePublishBody({ botId: 'nope' })).toEqual({
      ok: false,
      status: 404,
      error: 'not found',
    });
    for (const version of [0, -1, 1.5, '1', {}]) {
      expect(validatePublishBody({ botId: BOT, version })).toEqual({
        ok: false,
        status: 422,
        error: 'version must be a positive integer',
      });
    }
  });

  it('rejects non-object bodies with 422', () => {
    for (const body of [null, [], 'x', 7]) {
      expect(validatePublishBody(body)).toEqual({
        ok: false,
        status: 422,
        error: 'body must be an object',
      });
    }
  });
});

describe('publish request shape without a database', () => {
  afterEach(() => {
    __resetSessionReader();
  });

  it('returns 401 when unauthenticated, before any validation', async () => {
    __resetSessionReader();
    const res = await POST(publishRequest({ botId: 'not-a-uuid' }));
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'unauthorized' });
  });

  it('returns 404/422 for malformed input with a valid session but no database', async () => {
    actAs({ accountId: 'acct', discordId: 'disc' });
    const bad = await POST(publishRequest({ botId: 'not-a-uuid' }));
    expect(bad.status).toBe(404);
    const badVersion = await POST(
      publishRequest({ botId: '11111111-2222-4333-8444-555555555555', version: 0 }),
    );
    expect(badVersion.status).toBe(422);
  });

  // KI-021 slice: a valid request whose first read hits the stand-in pool must
  // name the real cause, never the generic publish failure. Env is deleted +
  // the pool reset so the real unconfigured-pool path runs.
  it('returns the canonical honest 500 when the database is not configured', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetPool();
    try {
      actAs({ accountId: 'acct', discordId: 'disc' });
      const res = await POST(publishRequest({ botId: '11111111-2222-4333-8444-555555555555' }));
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

describe('publish against Postgres (loud skip when unreachable)', () => {
  it('publishes the current draft, appends the audit note, and is unscanned', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'Happy');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    await setDraft(botId, v1);

    const scans = await (pool as Pool).query('SELECT id FROM guild_installs WHERE bot_id = $1', [
      botId,
    ]);
    expect(scans.rowCount).toBe(0);

    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1, state: 'published', runtimeRows: 0 });

    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v1);

    const audit = await (pool as Pool).query<{
      actor: string;
      action: string;
      detail: { version: number; preflight: unknown };
    }>('SELECT actor, action, detail FROM audit_events WHERE bot_id = $1', [botId]);
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor).toBe(`owner:${owner.discordId}`);
    expect(audit.rows[0].action).toBe('publish');
    expect(audit.rows[0].detail).toEqual({ version: 1, preflight: 'unscanned' });

    // spec_versions are never mutated by a publish.
    const version = await (pool as Pool).query<{ state: string; spec: unknown }>(
      'SELECT state, spec FROM spec_versions WHERE id = $1',
      [v1],
    );
    expect(version.rows[0].state).toBe('draft');
    expect(version.rows[0].spec).toEqual({ version: 1, behaviors: [{ v: 1 }] });
  });

  it('refuses a Red scan with 409, names the failing checks, and does not move', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'Red');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    await setDraft(botId, v1);
    await (pool as Pool).query(
      'INSERT INTO guild_installs (bot_id, guild_id, preflight) VALUES ($1, $2, $3::jsonb)',
      [
        botId,
        '100000000000000001',
        JSON.stringify({
          scannedAt: '2026-09-09T16:00:00.000Z',
          rows: [
            { severity: 'Green', check: 'installed', detail: 'ok', fix: '' },
            { severity: 'Red', check: 'role-hierarchy', detail: 'below managed', fix: 'move up' },
          ],
          summary: { red: 1, yellow: 0, green: 1 },
        }),
      ],
    );
    // A different guild is fully green — the worst guild still wins.
    await (pool as Pool).query(
      'INSERT INTO guild_installs (bot_id, guild_id, preflight) VALUES ($1, $2, $3::jsonb)',
      [
        botId,
        '100000000000000002',
        JSON.stringify({
          scannedAt: '2026-09-09T16:05:00.000Z',
          rows: [{ severity: 'Green', check: 'installed', detail: 'ok', fix: '' }],
          summary: { red: 0, yellow: 0, green: 1 },
        }),
      ],
    );

    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({
      error: 'preflight red',
      reason: 'preflight-red',
      failing: ['role-hierarchy'],
    });

    const bot = await (pool as Pool).query<{ prod_spec_id: string | null }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBeNull();
    const audit = await (pool as Pool).query('SELECT id FROM audit_events WHERE bot_id = $1', [
      botId,
    ]);
    expect(audit.rowCount).toBe(0);
  });

  it('publishes a specific existing version when one is named', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'Named');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setDraft(botId, v2);

    const res = await POST(publishRequest({ botId, version: 1 }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1, state: 'published', runtimeRows: 0 });
    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v1);
  });

  it('returns 404 - never 403 - for a bot owned by someone else', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const botId = await createBot(owner.accountId, 'Foreign');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    await setDraft(botId, v1);

    actAs(intruder);
    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('returns 404 with no-draft when nothing was ever minted', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'NoDraft');
    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ error: 'no draft yet' });
  });

  it('serializes two racing publishes of different versions to one 200 and one stale-draft 409', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'Racy');
    const v1 = await mintVersion(botId, 1, owner.discordId);
    const v2 = await mintVersion(botId, 2, owner.discordId);
    await setDraft(botId, v2);

    // The two requests must race two DIFFERENT versions. Republishing the SAME
    // version is not a conflict: a request that reads the pointer after the
    // first commit sees expected === current and legitimately returns 200, so a
    // same-version race can yield [200, 200]. A real conflict needs both
    // requests to read prod_spec_id = NULL before either guarded UPDATE
    // commits, so the loser's WHERE clause stops matching and it is answered
    // 409 stale-draft.
    //
    // A bare Promise.all does not actually overlap them in this harness:
    // measured against the live database, the loser's pointer read landed ~7ms
    // AFTER the winner's COMMIT, so both saw a fresh pointer. Hold each request
    // at its transaction boundary until BOTH have read the pointer.
    // `pool.connect()` called with no arguments is the route's transaction
    // checkout; `pool.query`'s internal `this.connect(cb)` passes a callback and
    // is deliberately left untouched. This creates the genuine overlap the
    // guarded UPDATE exists to serialize, without changing route code.
    const db = pool as Pool;
    const realConnect = db.connect.bind(db) as unknown as (...args: unknown[]) => unknown;
    let arrived = 0;
    let openGate: () => void = () => {};
    const bothRead = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    (db as unknown as Record<string, unknown>).connect = (...args: unknown[]) => {
      if (args.length > 0) {
        return realConnect(...args);
      }
      arrived += 1;
      if (arrived >= 2) {
        openGate();
      }
      return bothRead.then(() => realConnect());
    };

    const [a, b] = await (async (): Promise<[Response, Response]> => {
      try {
        return await Promise.all([
          POST(publishRequest({ botId, version: 1 })),
          POST(publishRequest({ botId, version: 2 })),
        ]);
      } finally {
        delete (db as unknown as Record<string, unknown>).connect;
      }
    })();

    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const winner = a.status === 200 ? a : b;
    const loser = a.status === 409 ? a : b;
    const winnerBody = await readJson(winner);
    expect(winnerBody.state).toBe('published');
    expect([1, 2]).toContain(winnerBody.version);
    expect(await readJson(loser)).toMatchObject({ reason: 'stale-draft' });

    // Exactly one pointer move, to the winner's version, and one audit row.
    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(winnerBody.version === 1 ? v1 : v2);

    const audit = await (pool as Pool).query(
      "SELECT id FROM audit_events WHERE bot_id = $1 AND action = 'publish'",
      [botId],
    );
    expect(audit.rowCount).toBe(1);
  });
});

// --- Publish-hook runtime-row sync -------------------------------------------
// The web package must not import gateway internals, so the boot reader's
// row validation (validateRuntimeConfigRow in
// apps/gateway/src/runtime/config.ts:39-83) is mirrored here column-for-column
// instead of imported. If that contract changes, this mirror must change too.

interface BootRow {
  botId: unknown;
  guildId: unknown;
  kind: unknown;
  params: unknown;
  specVersion: unknown;
}

function assertValidBootRow(row: BootRow): void {
  expect(typeof row.botId).toBe('string');
  expect((row.botId as string).length).toBeGreaterThan(0);
  expect(row.guildId === null || typeof row.guildId === 'string').toBe(true);
  expect((RUNTIME_KINDS as readonly string[]).includes(row.kind as string)).toBe(true);
  expect(typeof row.params).toBe('object');
  expect(row.params).not.toBeNull();
  expect(Array.isArray(row.params)).toBe(false);
  expect(Number.isInteger(row.specVersion)).toBe(true);
  expect((row.specVersion as number) >= 1).toBe(true);
}

// Same SELECT shape as BOOT_CONFIG_SQL in
// apps/gateway/src/runtime/boot-modules.ts:21-23 (copied, not imported —
// that module pulls in discord.js).
const BOOT_CONFIG_SELECT =
  'SELECT bot_id AS "botId", guild_id AS "guildId", kind, params, spec_version AS "specVersion" ' +
  'FROM bot_runtime_config WHERE bot_id = $1 ORDER BY kind';

async function readBootRows(botId: string): Promise<BootRow[]> {
  const found = await (pool as Pool).query<BootRow>(BOOT_CONFIG_SELECT, [botId]);
  return found.rows;
}

describe('publish-hook translator (pure)', () => {
  it('groups canonical kinds and aliases into one row per kind', () => {
    const rows = defaultTranslateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'welcome', title: 'Hello' },
          { kind: 'greeting', title: 'Hi again' },
          { kind: 'xp', count: 5 },
        ],
      },
      'bot-1',
      3,
    );
    expect(rows.map((row) => row.kind)).toEqual(['welcome', 'xp']);
    const welcome = rows[0];
    expect(welcome.specVersion).toBe(3);
    expect(welcome.params['count']).toBe(2);
    expect((welcome.params['items'] as unknown[]).length).toBe(2);
    for (const row of rows) {
      assertValidBootRow({ botId: 'bot-1', guildId: null, ...row });
    }
  });

  it('skips unknown kinds and token-carrying entries without throwing', () => {
    const rows = defaultTranslateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'teleport', title: 'Beam me up' },
          { kind: 'welcome', token: 'abc', title: 'Leak' },
          'not-an-object',
          { kind: 'status', detail: 'Alive' },
        ],
      },
      'bot-1',
      1,
    );
    expect(rows.map((row) => row.kind)).toEqual(['status']);
  });

  it('preserves ticket and reaction-role rows through the mirror (E1 8-kind sync)', () => {
    const rows = defaultTranslateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'panel', title: 'Tickets' },
          { kind: 'picker', title: 'Roles' },
        ],
      },
      'bot-1',
      1,
    );
    expect(rows.map((row) => row.kind)).toEqual(['tickets', 'reaction-roles']);
  });

  it('floors connector poll intervals at 60s', () => {
    const rows = defaultTranslateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'weather', intervalSec: 10 },
          { kind: 'connector', intervalSec: 120 },
        ],
      },
      'bot-1',
      1,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].params['intervalSec']).toBe(60);
  });

  it('throws on a malformed envelope, an empty botId, or a bad specVersion', () => {
    const good = { version: 1, behaviors: [] };
    for (const spec of [null, [], 'x', {}, { version: 1 }, { version: 1, behaviors: 'no' }]) {
      expect(() => defaultTranslateProdSpec(spec, 'bot-1', 1)).toThrow();
    }
    expect(() => defaultTranslateProdSpec(good, '', 1)).toThrow();
    expect(() => defaultTranslateProdSpec(good, 'bot-1', 0)).toThrow();
  });
});

describe('publish runtime-row sync against Postgres (loud skip when unreachable)', () => {
  it('writes bot-global rows matching the boot query columns', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeWriter');
    const v1 = await mintVersion(botId, 1, owner.discordId, 'draft', {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Hello', channel: 'general' },
        { kind: 'greeting', title: 'Hi again' },
        { kind: 'xp', count: 5 },
        { kind: 'panel', title: 'Tickets' },
        { kind: 'picker', title: 'Roles' },
      ],
    });
    await setDraft(botId, v1);

    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1, state: 'published', runtimeRows: 4 });

    const rows = await readBootRows(botId);
    expect(rows.length).toBe(4);
    for (const row of rows) {
      assertValidBootRow(row);
      expect(row.guildId).toBeNull();
      expect(row.specVersion).toBe(1);
    }
    const byKind = new Map(rows.map((row) => [row.kind, row]));
    const welcome = byKind.get('welcome') as unknown as {
      params: { items: unknown[]; count: number };
    };
    expect(welcome.params.count).toBe(2);
    expect(welcome.params.items.length).toBe(2);
    const xp = byKind.get('xp') as unknown as { params: { items: unknown[]; count: number } };
    expect(xp.params.count).toBe(1);
    // Canonical kinds, not source aliases, land in the table.
    expect(byKind.has('panel')).toBe(false);
    expect(byKind.has('picker')).toBe(false);
    const tickets = byKind.get('tickets') as unknown as {
      params: { items: unknown[]; count: number };
    };
    expect(tickets.params.count).toBe(1);
    const reactionRoles = byKind.get('reaction-roles') as unknown as {
      params: { items: unknown[]; count: number };
    };
    expect(reactionRoles.params.count).toBe(1);
  });

  it('publishes a spec with zero translatable behaviors and zero rows', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeEmpty');
    const v1 = await mintVersion(botId, 1, owner.discordId, 'draft', {
      version: 1,
      behaviors: [{ kind: 'teleport' }],
    });
    await setDraft(botId, v1);

    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1, state: 'published', runtimeRows: 0 });
    expect(await readBootRows(botId)).toEqual([]);

    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v1);
  });

  it('preserves tickets/reaction-roles rows through the DELETE-then-INSERT sync', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeTickets');
    const v1 = await mintVersion(botId, 1, owner.discordId, 'draft', {
      version: 1,
      behaviors: [
        { kind: 'panel', title: 'Tickets' },
        { kind: 'picker', title: 'Roles' },
        { kind: 'welcome', title: 'Hi' },
      ],
    });
    await setDraft(botId, v1);

    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1, state: 'published', runtimeRows: 3 });
    const rows = await readBootRows(botId);
    expect(rows.map((row) => row.kind).sort()).toEqual(
      ['reaction-roles', 'tickets', 'welcome'].sort(),
    );

    // Re-publish: rows survive the DELETE-then-INSERT resync verbatim.
    const again = await POST(publishRequest({ botId }));
    expect(again.status).toBe(200);
    expect(await readJson(again)).toEqual({ version: 1, state: 'published', runtimeRows: 3 });
    expect(await readBootRows(botId)).toEqual(rows);
  });

  it('re-publishing the same version is idempotent and drops retired kinds', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeIdem');
    const v1 = await mintVersion(botId, 1, owner.discordId, 'draft', {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Hi' },
        { kind: 'xp', count: 1 },
      ],
    });
    const v2 = await mintVersion(botId, 2, owner.discordId, 'draft', {
      version: 1,
      behaviors: [{ kind: 'welcome', title: 'Hi' }],
    });
    await setDraft(botId, v2);

    const first = await POST(publishRequest({ botId, version: 1 }));
    expect(await readJson(first)).toEqual({ version: 1, state: 'published', runtimeRows: 2 });
    const pointed = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(pointed.rows[0].prod_spec_id).toBe(v1);
    const before = await readBootRows(botId);
    expect(before.length).toBe(2);

    const again = await POST(publishRequest({ botId, version: 1 }));
    expect(again.status).toBe(200);
    expect(await readJson(again)).toEqual({ version: 1, state: 'published', runtimeRows: 2 });
    expect(await readBootRows(botId)).toEqual(before);

    const narrowed = await POST(publishRequest({ botId, version: 2 }));
    expect(await readJson(narrowed)).toEqual({ version: 2, state: 'published', runtimeRows: 1 });
    const after = await readBootRows(botId);
    expect(after.map((row) => row.kind)).toEqual(['welcome']);
    expect(after[0].specVersion).toBe(2);
  });

  it('a translator failure rolls back the pointer, the audit row, and the rows', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeBoom');
    const v1 = await mintVersion(botId, 1, owner.discordId, 'draft', {
      version: 1,
      behaviors: [{ kind: 'welcome', title: 'Hi' }],
    });
    await setDraft(botId, v1);

    __setTranslator(() => {
      throw new Error('translator boom');
    });
    try {
      const res = await POST(publishRequest({ botId }));
      expect(res.status).toBe(500);
      expect(await readJson(res)).toEqual({ error: 'could not publish' });
    } finally {
      __resetTranslator();
    }

    const bot = await (pool as Pool).query<{ prod_spec_id: string | null }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBeNull();
    const audit = await (pool as Pool).query('SELECT id FROM audit_events WHERE bot_id = $1', [
      botId,
    ]);
    expect(audit.rowCount).toBe(0);
    expect(await readBootRows(botId)).toEqual([]);
  });

  it('a malformed stored spec fails the publish without moving the pointer', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeBad');
    const v1 = await mintVersion(botId, 1, owner.discordId, 'draft', { bogus: true });
    await setDraft(botId, v1);

    const res = await POST(publishRequest({ botId }));
    expect(res.status).toBe(500);

    const bot = await (pool as Pool).query<{ prod_spec_id: string | null }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBeNull();
  });
});
