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
  __resetTranslator,
  __setSessionReader,
  __setTranslator,
  validateRollbackBody,
  type EditorSession,
} from './route';
// The real publish route, so the divergence regression test below reproduces
// the actual sequence (publish writes the newer rows the old rollback failed to
// replace) instead of hand-seeding the table it is meant to distrust.
import {
  POST as publishPOST,
  __setSessionReader as __setPublishSessionReader,
  defaultTranslateProdSpec,
} from '../publish/route';

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
-- bot_runtime_config is declared here with the fence this tree actually ships
-- (8 kinds), then re-asserted by the DROP/ADD pair at the end. It is not a
-- verbatim copy of any one migration on purpose:
--   * 0012_bot_runtime_config.sql:28-29 pins 6 kinds; 0013_runtime_kinds_tickets
--     .sql:12-14 widens it to 8. A copy of 0012 alone would stand an 8-kind tree
--     up behind a 6-kind fence whenever the sibling migration tree is unreadable
--     (the exact case this fallback exists for).
--   * CREATE TABLE IF NOT EXISTS is a no-op on the long-lived CI database, so
--     the re-assert is what guarantees the fence on both a fresh fallback and a
--     table created by an earlier run (idempotent either way, mirroring 0013).
-- A 6-kind fence here fails the tickets/reaction-roles cases below; expectKindSet
-- is the pin that names it.
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
-- 0013_runtime_kinds_tickets.sql:12-14 inline: a bot_runtime_config created by an
-- earlier version of this fallback keeps whatever fence it was born with, so the
-- constraint is dropped and re-added rather than assumed.
ALTER TABLE IF EXISTS bot_runtime_config DROP CONSTRAINT IF EXISTS "bot_runtime_config_kind_check";
ALTER TABLE IF EXISTS bot_runtime_config ADD CONSTRAINT "bot_runtime_config_kind_check"
  CHECK ("kind" IN ('welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status', 'tickets', 'reaction-roles'));`;

let pool: Pool | null = null;
let owner: EditorSession;
let intruder: EditorSession;
let pgReady = false;
let pgSource: { applied: string[]; unreadable: string[] } | null = null;

// The sibling migrations this suite stands its database up from, in order.
// Module-level and named so "ensurePg includes 0013" is itself assertable
// (MIGRATION_SOURCES below) rather than something a reader must spot by eye —
// the widening file is the one entry whose absence is silent, because the
// fallback DDL re-asserts the same fence and would mask it.
const MIGRATION_SOURCES = [
  '../../../../../gateway/drizzle/0001_init.sql',
  '../../../../../gateway/drizzle/0002_v11.sql',
  '../../../../../gateway/drizzle/0005_guilds.sql',
  '../../../../../gateway/drizzle/0012_bot_runtime_config.sql',
  // The 8-kind widening (tickets + reaction-roles). Without it this database is
  // fenced at the 6 kinds 0012 declared — 0012_bot_runtime_config.sql:28-29 —
  // and the two E1 kinds below are tested against a schema the product does not
  // ship.
  '../../../../../gateway/drizzle/0013_runtime_kinds_tickets.sql',
] as const;

// The one source file whose whole job is the widening, pinned separately from
// MIGRATION_SOURCES so the assertion names it.
const WIDENING_MIGRATION = '../../../../../gateway/drizzle/0013_runtime_kinds_tickets.sql';

async function ensurePg(): Promise<void> {
  if (pgReady) {
    return;
  }
  pool = new Pool({ connectionString });
  __setPool(pool);
  const applied: string[] = [];
  for (const relative of MIGRATION_SOURCES) {
    try {
      const sql = await readFile(new URL(relative, import.meta.url), 'utf8');
      await pool.query(sql);
      applied.push(relative);
    } catch {
      // Sibling migration unreadable — the fallback DDL below covers it.
    }
  }
  await pool.query(FALLBACK_DDL);
  // Both halves must contend with the same database, so record the dialect of
  // the pool the route will write through. Reported in the fence test's failure
  // message, where the applied/unreadable split is how a bare "new row for
  // relation violates check constraint" becomes a diagnosable claim.
  pgSource = {
    applied,
    unreadable: [...MIGRATION_SOURCES].sort().filter((s) => !applied.includes(s)),
  };
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

async function mintVersion(
  botId: string,
  version: number,
  discordId: string,
  spec: unknown = { version: 1, behaviors: [{ v: version }] },
): Promise<string> {
  const active = pool as Pool;
  const row = await active.query<{ id: string }>(
    `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'draft')
     RETURNING id`,
    [botId, version, JSON.stringify(spec), `v${version}`, `owner:${discordId}`],
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

// Only the runtime-row tests need the draft pointer: they drive the real
// publish route, which publishes the current draft when no version is named.
async function setDraft(botId: string, specId: string): Promise<void> {
  const active = pool as Pool;
  await active.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
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

// The publish route keeps its OWN module-level session reader, so a test that
// drives both routes must arm both.
function publishActAs(session: EditorSession | null): void {
  __setPublishSessionReader({ getSession: async () => session });
}

function publishRequest(body: unknown): Request {
  return new Request('http://localhost/api/spec/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- Boot-row reader ---------------------------------------------------------
// Same SELECT shape as BOOT_CONFIG_SQL in
// apps/gateway/src/runtime/boot-modules.ts:21-23 — the exact query the gateway
// runs on ready. Copied, not imported (that module pulls in discord.js), so the
// assertions below read the runtime state the way the live bot actually does.

interface BootRow {
  botId: string;
  guildId: string | null;
  kind: string;
  params: { items?: { sourceKind?: string; title?: string }[]; count?: number };
  specVersion: number;
}

const BOOT_CONFIG_SELECT =
  'SELECT bot_id AS "botId", guild_id AS "guildId", kind, params, spec_version AS "specVersion" ' +
  'FROM bot_runtime_config WHERE bot_id = $1 ORDER BY kind';

// --- The 8-kind truth ---------------------------------------------------------
// The closed vocabulary this suite now pins, in the order the four independent
// on-disk sources declare it (alphabetical sort is applied at the assert site):
//   * apps/gateway/src/runtime/config.ts:11-20  RUNTIME_KINDS (the type leaf)
//   * apps/gateway/src/db/schema.ts:111-114     botRuntimeConfig catalog CHECK
//   * apps/gateway/drizzle/0013_runtime_kinds_tickets.sql:14  widen 6 -> 8
//   * apps/web/app/api/spec/publish/route.ts:66-76  the route-side mirror
// The first six are what 0012 declared; the last two are the E1 widening. The
// route under test reuses publish's translator rather than copying it
// (rollback/route.ts:35-47), so this list is the exact set that can reach its
// INSERT — every member below is reachable from a real spec entry, and the two
// E1 members are the ones this suite previously could not carry.
const RUNTIME_KINDS_8 = [
  'welcome',
  'moderation',
  'xp',
  'giveaway',
  'connector',
  'status',
  'tickets',
  'reaction-roles',
] as const;

// Reads the fence off the live constraint and compares it to the 8-kind truth
// above — the set AND its size, since a fence that admits the right members but
// keeps admitting a ninth would pass a subset check.
//
// Honest bound: this asserts the SET, not the SQL text that produced it, so a
// fence widened by some route other than the shipped migration still passes.
// What it cannot pass is the 6-kind DDL this suite used to build — that is the
// drift it exists to catch, and the failure message says so rather than leaving
// a bare Postgres constraint error to be decoded.
async function expectKindSet(expected: readonly string[]): Promise<void> {
  const found = await (pool as Pool).query<{ def: string | null }>(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'bot_runtime_config_kind_check'",
  );
  // Postgres renders the CHECK as kind = ANY (ARRAY['welcome'::text, ...]).
  // Quoted literals only: the ::text casts and the CHECK(...) wrapper are
  // deliberately not matched, so the read cannot pick up a token it did not
  // mean to treat as a kind.
  const kinds = [...(found.rows[0]?.def ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const sorted = [...kinds].sort();
  const wanted = [...expected].sort();
  const context =
    `fence=${found.rows[0]?.def ?? '<missing>'}; expected=${JSON.stringify(wanted)}; ` +
    `actual=${JSON.stringify(sorted)}; applied=${JSON.stringify(pgSource?.applied ?? [])}; ` +
    `unreadable=${JSON.stringify(pgSource?.unreadable ?? [])}`;
  expect(
    sorted,
    `bot_runtime_config_kind_check is not the 8-kind fence. A 6-kind fence here is ` +
      `0012's pre-0013 DDL and means the widening never reached this database — the two E1 ` +
      `kinds (tickets, reaction-roles) cannot be stored. ${context}`,
  ).toEqual(wanted);
  expect(
    kinds.length,
    `bot_runtime_config_kind_check admits ${kinds.length} kinds, expected ${wanted.length}. ${context}`,
  ).toBe(wanted.length);
}

async function readBootRows(botId: string): Promise<BootRow[]> {
  const found = await (pool as Pool).query<BootRow>(BOOT_CONFIG_SELECT, [botId]);
  return found.rows;
}

function rollbackRequest(body: unknown): Request {
  return new Request('http://localhost/api/spec/rollback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- Alias direction ----------------------------------------------------------
// The two E1 kinds are reachable from a spec entry only through KIND_ALIASES,
// and that table is case-SENSITIVE while resolveKind is not (publish/
// route.ts:80-82 lowercases the raw kind before the isRuntimeKind test, :185-201
// then consults the map with the lowercased value). So 'Panel' becomes
// 'tickets' but 'panel-update' does not, and a canonical 'tickets' passes
// through untouched.
//
// This is what lets a 6-kind vocabulary fail with a NAME instead of a mystery.
// Drop tickets/reaction-roles from either list and these four entries stop
// resolving: the control pair still resolves because RUNTIME_KINDS_8 is a test
// constant, so the failure reads as "the route stopped mapping panel -> tickets"
// rather than as an opaque row mismatch. It fails before any INSERT, which is
// deliberate — the assertion order in the fence test below is fence first, so
// the drift is named rather than reported as a Postgres constraint violation.
const ALIAS_DIRECTION_CASES = [
  { input: 'panel', expected: 'tickets' },
  { input: 'picker', expected: 'reaction-roles' },
  { input: 'Panel', expected: 'tickets' },
  { input: 'PICKER', expected: 'reaction-roles' },
  { input: 'tickets', expected: 'tickets' },
  { input: 'reaction-roles', expected: 'reaction-roles' },
] as const;

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

// The route's translator is publish's own (rollback/route.ts:35-47 imports it
// rather than copying it), so this is the kind vocabulary the route can hand to
// its INSERT — asserted here, with no database, so the 8-kind drift is caught
// even on a machine where Postgres is unreachable and every case below skips.
describe('rollback carries the 8-kind vocabulary (pure translator)', () => {
  const BOT = '11111111-2222-4333-8444-555555555555';

  it('maps all eight canonical kinds to eight rows', () => {
    const rows = defaultTranslateProdSpec(
      { version: 1, behaviors: RUNTIME_KINDS_8.map((kind) => ({ kind, title: kind })) },
      BOT,
      1,
    );
    expect(rows.map((row) => row.kind).sort()).toEqual([...RUNTIME_KINDS_8].sort());
    expect(rows.length).toBe(RUNTIME_KINDS_8.length);
  });

  it('reaches the two E1 kinds through their aliases, and only through them', () => {
    const rows = defaultTranslateProdSpec(
      { version: 1, behaviors: ALIAS_DIRECTION_CASES.map(({ input }) => ({ kind: input })) },
      BOT,
      1,
    );
    // Same-kind entries coalesce into one row, so the resolved set is what is
    // asserted — every alias above must land on its canonical kind.
    expect(rows.map((row) => row.kind).sort()).toEqual(
      [...new Set(ALIAS_DIRECTION_CASES.map((c) => c.expected))].sort(),
    );
    expect(rows.map((row) => row.kind)).toContain('tickets');
    expect(rows.map((row) => row.kind)).toContain('reaction-roles');
  });

  it('drops an alias-cased kind that is not in the table', () => {
    // The map is consulted with the lowercased value, so a hyphenated alias is
    // NOT folded: 'panel-update' must survive as unknown rather than be read as
    // 'panel' -> tickets. Pins the direction the aliases are matched in.
    const rows = defaultTranslateProdSpec(
      { version: 1, behaviors: [{ kind: 'panel-update' }, { kind: 'picker' }] },
      BOT,
      1,
    );
    expect(rows.map((row) => row.kind)).toEqual(['reaction-roles']);
  });
});

// The FALLBACK_DDL re-asserts the same 8-kind fence the widening migration
// carries, so dropping 0013 from the source list cannot be caught by any test
// that only looks at the constraint — the fallback would silently stand in for
// it. These two pins cover the gap: the source list really names the widening
// file, and that file really declares all eight kinds. No database needed, so
// they hold on a machine where every Postgres case below skips.
describe('the widening migration is a real input, not a masked one', () => {
  it('ensurePg sources name the 0013 widening file', () => {
    expect(MIGRATION_SOURCES).toContain(WIDENING_MIGRATION);
    expect(
      MIGRATION_SOURCES.some((source) => source.includes('0013_runtime_kinds_tickets.sql')),
    ).toBe(true);
  });

  it('0013 widens the CHECK to all eight kinds on disk', async () => {
    const sql = await readFile(new URL(WIDENING_MIGRATION, import.meta.url), 'utf8');
    // The migration's own two statements must be present and must agree with
    // the truth constant: a widening that dropped one kind, or that forgot the
    // DROP, is a fence the fallback DDL would otherwise hide.
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS "bot_runtime_config_kind_check"/);
    const widened = sql.match(
      /ADD CONSTRAINT "bot_runtime_config_kind_check"[\s\S]*?CHECK[\s\S]*?\);/,
    );
    expect(widened, '0013 declares no kind CHECK to compare').not.toBeNull();
    const kinds = [...(widened?.[0] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(kinds).toEqual([...RUNTIME_KINDS_8].sort());
    expect(kinds.length).toBe(RUNTIME_KINDS_8.length);
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

// --- Runtime-row sync (the rollback/publish divergence) ----------------------
// Before this fix rollback moved prod_spec_id and wrote its audit row but never
// touched bot_runtime_config — so the dashboard reported the older version as
// production while the live bot kept attaching the newer spec's modules, because
// the gateway reads them solely from bot_runtime_config (BOOT_CONFIG_SQL,
// apps/gateway/src/runtime/boot-modules.ts:21-23). Each test below fails on the
// pre-fix code.

describe('rollback runtime-row sync against Postgres (loud skip when unreachable)', () => {
  it('replaces the newer spec rows with the target version rows after publish v2 -> rollback v1', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    publishActAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeDivergence');
    // Disjoint kind sets: a stale row cannot hide behind a matching one.
    const v1 = await mintVersion(botId, 1, owner.discordId, {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Old hello' },
        { kind: 'xp', count: 1 },
      ],
    });
    const v2 = await mintVersion(botId, 2, owner.discordId, {
      version: 1,
      behaviors: [
        { kind: 'moderation', title: 'Filter' },
        { kind: 'giveaway', title: 'Giveaway' },
      ],
    });

    // Real publish of v1, then of v2 — the genuine history a rollback reads:
    // no hand-seeded audit row, and the rows under test are written by the
    // publish route's own sync.
    await setDraft(botId, v1);
    const first = await publishPOST(publishRequest({ botId }));
    expect(first.status).toBe(200);
    expect((await readBootRows(botId)).map((row) => row.kind)).toEqual(['welcome', 'xp']);

    await setDraft(botId, v2);
    const published = await publishPOST(publishRequest({ botId }));
    expect(published.status).toBe(200);
    const afterPublish = await readBootRows(botId);
    expect(afterPublish.map((row) => row.kind)).toEqual(['giveaway', 'moderation']);
    for (const row of afterPublish) {
      expect(row.specVersion).toBe(2);
      expect(row.guildId).toBeNull();
    }

    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 1 });

    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v1);

    // The runtime rows the gateway will attach are v1's — not v2's.
    const afterRollback = await readBootRows(botId);
    expect(afterRollback.map((row) => row.kind)).toEqual(['welcome', 'xp']);
    for (const row of afterRollback) {
      expect(row.specVersion).toBe(1);
      expect(row.guildId).toBeNull();
    }
    const welcome = afterRollback.find((row) => row.kind === 'welcome');
    expect(welcome?.params.items?.[0]?.title).toBe('Old hello');
  });

  it('leaves the database exactly as a publish of the target version would', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    publishActAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeParity');
    const v1 = await mintVersion(botId, 1, owner.discordId, {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Parity hello' },
        { kind: 'connector', title: 'weather', intervalSec: 10 },
      ],
    });
    const v2 = await mintVersion(botId, 2, owner.discordId, {
      version: 1,
      behaviors: [{ kind: 'status', detail: 'Alive' }],
    });
    await setDraft(botId, v1);
    await publishPOST(publishRequest({ botId }));
    await setDraft(botId, v2);
    await publishPOST(publishRequest({ botId }));

    const rolled = await POST(rollbackRequest({ botId, version: 1 }));
    expect(rolled.status).toBe(200);
    const afterRollback = await readBootRows(botId);
    expect(afterRollback.length).toBeGreaterThan(0);

    // Independent control: a second bot publishing v1 through the publish route,
    // whose own syncRuntimeRows is the parity source this route mirrors.
    const controlBot = await createBot(owner.accountId, 'RuntimeParityControl');
    const controlV1 = await mintVersion(controlBot, 1, owner.discordId, {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Parity hello' },
        { kind: 'connector', title: 'weather', intervalSec: 10 },
      ],
    });
    await setDraft(controlBot, controlV1);
    const control = await publishPOST(publishRequest({ botId: controlBot }));
    expect(control.status).toBe(200);
    const controlRows = await readBootRows(controlBot);

    // Row-for-row identical apart from the bot id, which necessarily differs:
    // guildId, kind, params and specVersion must all match a real publish of v1.
    const shape = (rows: BootRow[]): Omit<BootRow, 'botId'>[] =>
      rows.map((row) => ({
        guildId: row.guildId,
        kind: row.kind,
        params: row.params,
        specVersion: row.specVersion,
      }));
    expect(shape(afterRollback)).toEqual(shape(controlRows));
  });

  it('drops a kind the rolled-back version never carried', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    publishActAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeRetired');
    const v1 = await mintVersion(botId, 1, owner.discordId, {
      version: 1,
      behaviors: [{ kind: 'welcome', title: 'Only welcome' }],
    });
    const v2 = await mintVersion(botId, 2, owner.discordId, {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Still welcome' },
        { kind: 'giveaway', title: 'New giveaway' },
      ],
    });
    await setDraft(botId, v1);
    await publishPOST(publishRequest({ botId }));
    expect((await readBootRows(botId)).map((row) => row.kind)).toEqual(['welcome']);

    await setDraft(botId, v2);
    await publishPOST(publishRequest({ botId }));
    expect((await readBootRows(botId)).map((row) => row.kind)).toEqual(['giveaway', 'welcome']);

    const res = await POST(rollbackRequest({ botId, version: 1 }));
    expect(res.status).toBe(200);

    // A DELETE-less sync would leave the giveaway row behind and the gateway
    // would keep running a feature v1 never described.
    const rows = await readBootRows(botId);
    expect(rows.map((row) => row.kind)).toEqual(['welcome']);
    expect(rows[0].specVersion).toBe(1);
    void v1;
  });

  // The 8-kind truth against the real database the route writes through. Both
  // halves share one pool: this test reads the fence and the rows, while the
  // route's INSERT is what proves the fence admits them — a fence assertion
  // alone could pass while the write path used a different dialect.
  it('stores and round-trips both E1 kinds through a real rollback', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    publishActAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeEightKind');

    // Fence first, deliberately: when the vocabulary drifts, the migration is
    // named here instead of surfacing as a bare "violates check constraint" on
    // the INSERT below.
    await expectKindSet(RUNTIME_KINDS_8);

    // One of the eight is reachable only through an alias ('panel'), the rest
    // arrive canonical — so both resolution paths are exercised.
    const v1 = await mintVersion(botId, 1, owner.discordId, {
      version: 1,
      behaviors: [
        { kind: 'welcome', title: 'Hello' },
        { kind: 'moderation', title: 'Filter' },
        { kind: 'xp', title: 'Levels' },
        { kind: 'giveaway', title: 'Giveaway' },
        { kind: 'connector', title: 'Weather', intervalSec: 60 },
        { kind: 'status', detail: 'Alive' },
        { kind: 'panel', title: 'Support' },
        { kind: 'reaction-roles', title: 'Roles' },
      ],
    });
    const v2 = await mintVersion(botId, 2, owner.discordId, {
      version: 1,
      behaviors: [{ kind: 'status', detail: 'Alive' }],
    });
    await setDraft(botId, v1);
    const published = await publishPOST(publishRequest({ botId }));
    expect(published.status).toBe(200);

    const afterPublish = await readBootRows(botId);
    expect(afterPublish.map((row) => row.kind).sort()).toEqual([...RUNTIME_KINDS_8].sort());
    for (const row of afterPublish) {
      expect(row.specVersion).toBe(1);
    }
    // The alias resolved to its canonical kind; the source spelling was not
    // written to the table.
    expect(afterPublish.map((row) => row.kind)).not.toContain('panel');

    await setDraft(botId, v2);
    expect((await publishPOST(publishRequest({ botId }))).status).toBe(200);
    const narrowed = await readBootRows(botId);
    expect(narrowed.map((row) => row.kind)).toEqual(['status']);

    // Roll back to v1: both E1 kinds must be re-inserted by the route's own
    // DELETE-then-INSERT, not merely tolerated by the fence.
    const rolled = await POST(rollbackRequest({ botId, version: 1 }));
    expect(rolled.status).toBe(200);
    expect(await readJson(rolled)).toEqual({ version: 1 });

    const restored = await readBootRows(botId);
    expect(restored.map((row) => row.kind).sort()).toEqual([...RUNTIME_KINDS_8].sort());
    for (const row of restored) {
      expect(row.specVersion).toBe(1);
      expect(row.guildId).toBeNull();
    }
    const tickets = restored.find((row) => row.kind === 'tickets');
    expect(tickets?.params.items?.[0]?.title).toBe('Support');
  });

  // Negative pin: the 6-kind fence must reject the two E1 kinds — the assert
  // that proves this suite is testing the widening rather than a fence that
  // admits nine kinds or none.
  //
  // It runs on a DEDICATED TEMP TABLE, never on bot_runtime_config. Narrowing
  // the real constraint would mutate a table that publish.test.ts writes
  // tickets/reaction-roles rows into, and vitest runs the two files in parallel
  // workers against this same database — so a DROP/ADD here would intermittently
  // fail the *other* file's INSERT with a constraint error that has nothing to
  // do with its code. A temp table carries the identical CHECK, so the dialect
  // under test (6 IN-list vs 8) is the same while the blast radius is one session.
  // The statement text is taken from the live constraint rather than retyped, so
  // this pins the fence the database is actually under.
  it('the pre-0013 6-kind fence cannot store the two E1 kinds', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const sixKind = RUNTIME_KINDS_8.slice(0, 6);
    expect(sixKind).toEqual(['welcome', 'moderation', 'xp', 'giveaway', 'connector', 'status']);
    // 0012_bot_runtime_config.sql:28-29 declared exactly these six: the fence this
    // suite carried before the widening, not an invented mutation.
    const sixLiterals = sixKind.map((kind) => `'${kind}'`).join(', ');
    const eightLiterals = RUNTIME_KINDS_8.map((kind) => `'${kind}'`).join(', ');

    const client = await (pool as Pool).connect();
    // A session-scoped TEMP table, so even a hard failure cannot leave it where
    // another test file's worker would see it. No transaction is opened: a
    // constraint violation aborts a transaction, and in a BEGIN/ROLLBACK block
    // the deliberate rejections below would poison every later statement on this
    // pooled connection ("current transaction is aborted") for whichever test
    // got it next. Autocommit keeps each failure local to its own statement.
    const probeTable = 'kind_fence_probe';
    try {
      await client.query(
        `CREATE TEMP TABLE ${probeTable} (kind text NOT NULL,
           CONSTRAINT ${probeTable}_check CHECK (kind IN (${sixLiterals}))
         )`,
      );
      // The regression is real at the database level, both E1 kinds at once.
      for (const kind of ['tickets', 'reaction-roles']) {
        await expect(
          client.query(`INSERT INTO ${probeTable} (kind) VALUES ($1)`, [kind]),
        ).rejects.toThrow(new RegExp(`${probeTable}_check`));
      }
      // And the six that 0012 did declare still pass, so the rejection above is
      // the widening being absent rather than the fence being broken.
      for (const kind of sixKind) {
        await expect(
          client.query(`INSERT INTO ${probeTable} (kind) VALUES ($1)`, [kind]),
        ).resolves.toBeDefined();
      }
      // The widened fence, same shape, admits both — so the pair of assertions
      // is exactly the 6 -> 8 delta and nothing else.
      await client.query(
        `ALTER TABLE ${probeTable} DROP CONSTRAINT ${probeTable}_check,
           ADD CONSTRAINT ${probeTable}_check CHECK (kind IN (${eightLiterals}))`,
      );
      for (const kind of ['tickets', 'reaction-roles']) {
        await expect(
          client.query(`INSERT INTO ${probeTable} (kind) VALUES ($1)`, [kind]),
        ).resolves.toBeDefined();
      }
    } finally {
      await client.query(`DROP TABLE IF EXISTS ${probeTable}`).catch(() => undefined);
      client.release();
    }

    // The real table's fence is untouched by the probe above.
    await expectKindSet(RUNTIME_KINDS_8);
  });

  it('a translator failure unwinds the pointer, the audit row, and the runtime rows', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    actAs(owner);
    publishActAs(owner);
    const botId = await createBot(owner.accountId, 'RuntimeBoom');
    const v1 = await mintVersion(botId, 1, owner.discordId, {
      version: 1,
      behaviors: [{ kind: 'welcome', title: 'Old' }],
    });
    const v2 = await mintVersion(botId, 2, owner.discordId, {
      version: 1,
      behaviors: [{ kind: 'moderation', title: 'New' }],
    });
    await setDraft(botId, v1);
    await publishPOST(publishRequest({ botId }));
    await setDraft(botId, v2);
    await publishPOST(publishRequest({ botId }));
    const before = await readBootRows(botId);
    expect(before.map((row) => row.kind)).toEqual(['moderation']);

    __setTranslator(() => {
      throw new Error('translator boom');
    });
    try {
      const res = await POST(rollbackRequest({ botId, version: 1 }));
      expect(res.status).toBe(500);
      expect(await readJson(res)).toEqual({ error: 'could not roll back' });
    } finally {
      __resetTranslator();
    }

    // Nothing moved: not the pointer, not the audit trail, not the rows.
    const bot = await (pool as Pool).query<{ prod_spec_id: string }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1',
      [botId],
    );
    expect(bot.rows[0].prod_spec_id).toBe(v2);
    const audit = await (pool as Pool).query(
      "SELECT id FROM audit_events WHERE bot_id = $1 AND action = 'rollback'",
      [botId],
    );
    expect(audit.rowCount).toBe(0);
    expect(await readBootRows(botId)).toEqual(before);
    void v1;
  });
});
