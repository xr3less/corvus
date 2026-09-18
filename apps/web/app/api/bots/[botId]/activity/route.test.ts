// Tests for GET /api/bots/[botId]/activity (V1-7 unified Logs feed).
//
// Pure text/limit/merge logic and request-shape checks always run (no
// database). Postgres-backed paths probe first and, when unreachable, warn
// LOUDLY and skip via ctx.skip() naming the reason (L-008/L-009) — never a
// hook throw, never silent. Bring the container up at TEST_DATABASE_URL to
// run them.

import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool, __setPool } from '../../../../../lib/db/pool';
import {
  GET,
  __resetSessionReader,
  __setSessionReader,
  buildPublishText,
  buildRollbackText,
  buildSpendText,
  formatCredits,
  humanizeReason,
  mergeActivity,
  parseActivityLimit,
  type ActivityItem,
  type EditorSession,
} from './route';

const TEST_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';
const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

const BOT = '11111111-2222-4333-8444-555555555555';
const OWNER: EditorSession = { accountId: 'acct-owner', discordId: 'disc-owner' };
const INTRUDER: EditorSession = { accountId: 'acct-intruder', discordId: 'disc-intruder' };

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
  console.warn(
    `[activity.route.test] LOUD SKIP: ${skipReason}. Start the test container, then re-run.`,
  );
}

// Inline fallback DDL matching the sibling migrations verbatim (0001_init,
// 0003_v12, 0006_audit_events) plus 0008/0009 parity (accounts.tier,
// ai_spend.attempt). Read first; this only covers an unreadable
// migration.
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
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid,
  bot_id uuid,
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  model text NOT NULL,
  usd_cost numeric,
  credits numeric,
  reason text NOT NULL,
  ref_id uuid,
  attempt integer,
  created_at timestamptz NOT NULL DEFAULT now()
);`;

let pool: Pool | null = null;
let pgReady = false;

async function ensurePg(): Promise<void> {
  if (pgReady) {
    return;
  }
  pool = new Pool({ connectionString });
  __setPool(pool);
  const sources = [
    '../../../../../../gateway/drizzle/0001_init.sql',
    '../../../../../../gateway/drizzle/0003_v12.sql',
    '../../../../../../gateway/drizzle/0006_audit_events.sql',
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
  // Self-heal for the cross-workspace shared-DB path: real migrations may have
  // applied (fallback no-op) on an older tree lacking 0008/0009, or vice versa.
  // Best-effort — loud warn, never fail the hook on repair DDL.
  try {
    await pool.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'trial'`,
    );
  } catch (error) {
    console.warn(
      `[activity.route.test] self-heal accounts.tier failed: ${(error as Error).message}`,
    );
  }
  try {
    await pool.query('ALTER TABLE ai_spend ADD COLUMN IF NOT EXISTS attempt integer');
  } catch (error) {
    console.warn(
      `[activity.route.test] self-heal ai_spend.attempt failed: ${(error as Error).message}`,
    );
  }
  pgReady = true;
}

async function makeAccount(discordId: string): Promise<string> {
  const active = pool as Pool;
  const row = await active.query<{ id: string }>(
    'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
    [discordId],
  );
  return row.rows[0].id;
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

async function insertAudit(
  accountId: string,
  botId: string,
  action: 'publish' | 'rollback',
  version: number,
  createdAt: string,
): Promise<void> {
  const active = pool as Pool;
  await active.query(
    `INSERT INTO audit_events (account_id, bot_id, actor, action, detail, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [accountId, botId, `owner:${accountId}`, action, JSON.stringify({ version }), createdAt],
  );
}

async function insertSpend(
  accountId: string,
  refId: string | null,
  reason: string,
  credits: string | null,
  createdAt: string,
): Promise<void> {
  const active = pool as Pool;
  await active.query(
    `INSERT INTO ai_spend (account_id, model, usd_cost, credits, reason, ref_id, created_at)
     VALUES ($1, 'test-model', NULL, $2, $3, $4, $5)`,
    [accountId, credits, reason, refId, createdAt],
  );
}

// --- Request/harness helpers ------------------------------------------------

function actAs(session: EditorSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

function activityRequest(botId: string, query = ''): Request {
  return new Request(`http://localhost/api/bots/${botId}/activity${query}`);
}

function contextFor(botId: string): { params: Promise<{ botId: string }> } {
  return { params: Promise.resolve({ botId }) };
}

async function readItems(res: Response): Promise<ActivityItem[]> {
  const body = (await res.json()) as { items: ActivityItem[] };
  return body.items;
}

interface RecordedQuery {
  text: string;
  params: unknown[];
}

interface FakePool {
  pool: Pool;
  calls: RecordedQuery[];
}

function makeFakePool(
  handler: (text: string, params: unknown[]) => { rowCount: number; rows: unknown[] },
): FakePool {
  const calls: RecordedQuery[] = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return handler(text, params);
    },
  } as unknown as Pool;
  return { pool: fake, calls };
}

afterEach(() => {
  __resetSessionReader();
});

afterAll(async () => {
  __resetSessionReader();
  await pool?.end().catch(() => {});
});

// --- Pure logic (no database) ----------------------------------------------

describe('formatCredits (pure)', () => {
  it('strips trailing zeros from stored numeric strings', () => {
    expect(formatCredits('1.100')).toBe('1.1');
    expect(formatCredits('2.000')).toBe('2');
    expect(formatCredits('0.0002')).toBe('0.0002');
    expect(formatCredits('100')).toBe('100');
  });

  it('accepts numbers and rejects missing or garbage values', () => {
    expect(formatCredits(1.1)).toBe('1.1');
    expect(formatCredits(0)).toBe('0');
    expect(formatCredits(null)).toBeNull();
    expect(formatCredits(undefined)).toBeNull();
    expect(formatCredits('')).toBeNull();
    expect(formatCredits('not-a-number')).toBeNull();
  });
});

describe('text building (pure)', () => {
  it('maps known run reasons and humanizes the rest from the stored string', () => {
    expect(humanizeReason('builder-run')).toBe('Builder run');
    expect(humanizeReason('persona-run')).toBe('Persona run');
    expect(humanizeReason('router-test')).toBe('Router Test');
    expect(humanizeReason('')).toBe('AI run');
  });

  it('renders spend text with credit math from stored columns', () => {
    expect(buildSpendText('builder-run', '1.100')).toBe('Builder run · 1.1 credits');
    expect(buildSpendText('builder-run', 2)).toBe('Builder run · 2 credits');
    // No stored cost (provider reported none) — never invent a zero.
    expect(buildSpendText('builder-run', null)).toBe('Builder run');
  });

  it('renders publish/rollback text from the stored version', () => {
    expect(buildPublishText(12)).toBe('Published v12');
    expect(buildPublishText('7')).toBe('Published v7');
    expect(buildPublishText(null)).toBe('Published');
    expect(buildRollbackText(7)).toBe('Rolled back to v7');
    expect(buildRollbackText(null)).toBe('Rolled back');
  });
});

describe('parseActivityLimit (pure)', () => {
  it('defaults to 20 when absent or blank', () => {
    expect(parseActivityLimit(null)).toEqual({ ok: true, value: 20 });
    expect(parseActivityLimit('')).toEqual({ ok: true, value: 20 });
  });

  it('passes through in-range integers', () => {
    expect(parseActivityLimit('17')).toEqual({ ok: true, value: 17 });
    expect(parseActivityLimit('100')).toEqual({ ok: true, value: 100 });
  });

  it('clamps out-of-range integers to the 1..100 band', () => {
    expect(parseActivityLimit('250')).toEqual({ ok: true, value: 100 });
    expect(parseActivityLimit('0')).toEqual({ ok: true, value: 1 });
    expect(parseActivityLimit('-3')).toEqual({ ok: true, value: 1 });
  });

  it('rejects non-integer values with 422', () => {
    for (const raw of ['abc', '1.5', '1e2', '5px']) {
      expect(parseActivityLimit(raw)).toEqual({
        ok: false,
        status: 422,
        error: 'limit must be an integer between 1 and 100',
      });
    }
  });
});

describe('mergeActivity (pure)', () => {
  it('orders publish/rollback/spend newest-first across both streams', () => {
    const items = mergeActivity(
      [
        { action: 'publish', version: '1', created_at: '2026-09-10T10:00:00.000Z' },
        { action: 'rollback', version: '1', created_at: '2026-09-12T10:00:00.000Z' },
        { action: 'publish', version: '2', created_at: '2026-09-11T10:00:00.000Z' },
      ],
      [{ reason: 'builder-run', credits: '1.100', created_at: '2026-09-13T10:00:00.000Z' }],
    );

    expect(items.map((item) => item.kind)).toEqual(['spend', 'rollback', 'publish', 'publish']);
    expect(items[0].text).toBe('Builder run · 1.1 credits');
    expect(items[0].credits).toBe(1.1);
    expect(items[1].text).toBe('Rolled back to v1');
    expect(items[2].text).toBe('Published v2');
    expect(items[3].text).toBe('Published v1');
  });

  it('omits credits when the stored cost is null', () => {
    const items = mergeActivity(
      [],
      [{ reason: 'builder-run', credits: null, created_at: '2026-09-13T10:00:00.000Z' }],
    );
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Builder run');
    expect('credits' in items[0]).toBe(false);
  });

  it('returns an empty list for an empty feed', () => {
    expect(mergeActivity([], [])).toEqual([]);
  });
});

// --- Request shape without a database --------------------------------------

describe('activity request shape without a database', () => {
  it('returns 401 when unauthenticated, before any validation', async () => {
    __resetSessionReader();
    const res = await GET(activityRequest('not-a-uuid'), contextFor('not-a-uuid'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('maps a malformed botId to 404 (no existence leak)', async () => {
    actAs(OWNER);
    const res = await GET(activityRequest('not-a-uuid'), contextFor('not-a-uuid'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('rejects a malformed limit with 422 before touching the pool', async () => {
    actAs(OWNER);
    const res = await GET(activityRequest(BOT, '?limit=abc'), contextFor(BOT));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'limit must be an integer between 1 and 100',
    });
  });
});

// --- Fake-pool behaviour (no live database) --------------------------------

describe('activity route against a fake pool', () => {
  it('returns 404 - never 403 - for an unknown or foreign bot', async () => {
    const { pool: fake, calls } = makeFakePool(() => ({ rowCount: 0, rows: [] }));
    __setPool(fake);
    actAs(INTRUDER);

    const res = await GET(activityRequest(BOT), contextFor(BOT));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    // Only the ownership probe ran; neither feed query leaked.
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('FROM bots');
    expect(calls[0].params).toEqual([BOT, INTRUDER.accountId]);
  });

  it('returns an empty feed as { items: [] }', async () => {
    const { pool: fake } = makeFakePool((text) =>
      text.includes('FROM bots')
        ? { rowCount: 1, rows: [{ '?column?': 1 }] }
        : { rowCount: 0, rows: [] },
    );
    __setPool(fake);
    actAs(OWNER);

    const res = await GET(activityRequest(BOT), contextFor(BOT));
    expect(res.status).toBe(200);
    expect(await readItems(res)).toEqual([]);
  });

  it('clamps ?limit before it reaches either feed query and scopes spend by ref_id', async () => {
    const { pool: fake, calls } = makeFakePool((text) =>
      text.includes('FROM bots')
        ? { rowCount: 1, rows: [{ '?column?': 1 }] }
        : { rowCount: 0, rows: [] },
    );
    __setPool(fake);
    actAs(OWNER);

    const res = await GET(activityRequest(BOT, '?limit=250'), contextFor(BOT));
    expect(res.status).toBe(200);

    const auditCall = calls.find((call) => call.text.includes('audit_events'));
    const spendCall = calls.find((call) => call.text.includes('ai_spend'));
    expect(auditCall?.params).toEqual([BOT, OWNER.accountId, 100]);
    // Spend is account-scoped and tied to this bot only via ref_id.
    expect(spendCall?.params).toEqual([OWNER.accountId, BOT, 100]);

    const zero = await GET(activityRequest(BOT, '?limit=0'), contextFor(BOT));
    expect(zero.status).toBe(200);
  });

  it('merges audit and spend rows newest-first with plain-English text', async () => {
    const { pool: fake } = makeFakePool((text) => {
      if (text.includes('FROM bots')) {
        return { rowCount: 1, rows: [{ '?column?': 1 }] };
      }
      if (text.includes('audit_events')) {
        return {
          rowCount: 2,
          rows: [
            { action: 'publish', version: '12', created_at: '2026-09-12T10:00:00.000Z' },
            { action: 'rollback', version: '11', created_at: '2026-09-11T10:00:00.000Z' },
          ],
        };
      }
      return {
        rowCount: 1,
        rows: [{ reason: 'builder-run', credits: '1.100', created_at: '2026-09-13T10:00:00.000Z' }],
      };
    });
    __setPool(fake);
    actAs(OWNER);

    const res = await GET(activityRequest(BOT), contextFor(BOT));
    expect(res.status).toBe(200);
    const items = await readItems(res);
    expect(items.map((item) => item.kind)).toEqual(['spend', 'publish', 'rollback']);
    expect(items[0]).toMatchObject({
      kind: 'spend',
      text: 'Builder run · 1.1 credits',
      credits: 1.1,
    });
    expect(items[1].text).toBe('Published v12');
    expect(items[2].text).toBe('Rolled back to v11');
  });
});

// --- Missing DATABASE_URL maps honestly (KI-021) ----------------------------

describe('activity with DATABASE_URL absent', () => {
  it('answers the canonical database-not-configured 500, never a misleading one', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    actAs(OWNER);
    try {
      const res = await GET(activityRequest(BOT), contextFor(BOT));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'database not configured' });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  });
});

// --- Postgres-backed --------------------------------------------------------

describe('activity against Postgres (loud skip when unreachable)', () => {
  it('returns publish/rollback/spend newest-first and never another bot spend', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `activity-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = await makeAccount(`${tag}-owner`);
    const botId = await createBot(ownerId, 'Feed');
    const otherBotId = await createBot(ownerId, 'Other');

    await insertAudit(ownerId, botId, 'publish', 1, '2026-09-10T10:00:00.000Z');
    await insertAudit(ownerId, botId, 'rollback', 1, '2026-09-11T10:00:00.000Z');
    await insertAudit(ownerId, botId, 'publish', 2, '2026-09-12T10:00:00.000Z');
    await insertSpend(ownerId, botId, 'builder-run', '1.100', '2026-09-13T10:00:00.000Z');
    // Foreign rows that must never surface on this bot's feed.
    await insertSpend(ownerId, otherBotId, 'builder-run', '9.000', '2026-09-13T11:00:00.000Z');
    await insertSpend(ownerId, null, 'builder-run', '8.000', '2026-09-13T12:00:00.000Z');

    actAs({ accountId: ownerId, discordId: `${tag}-owner` });
    const res = await GET(activityRequest(botId), contextFor(botId));
    expect(res.status).toBe(200);

    const items = await readItems(res);
    expect(items.map((item) => item.kind)).toEqual(['spend', 'publish', 'rollback', 'publish']);
    expect(items[0]).toMatchObject({ text: 'Builder run · 1.1 credits', credits: 1.1 });
    expect(items[1].text).toBe('Published v2');
    expect(items[2].text).toBe('Rolled back to v1');
    expect(items[3].text).toBe('Published v1');
  });

  it('returns 404 - never 403 - for a bot owned by someone else', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `activity-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = await makeAccount(`${tag}-owner`);
    const intruderId = await makeAccount(`${tag}-intruder`);
    const botId = await createBot(ownerId, 'Foreign');

    actAs({ accountId: intruderId, discordId: `${tag}-intruder` });
    const res = await GET(activityRequest(botId), contextFor(botId));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('returns an empty feed when the bot has no events', async (ctx) => {
    if (!probe.ok) {
      ctx.skip(skipReason);
      return;
    }
    await ensurePg();
    const tag = `activity-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = await makeAccount(`${tag}-owner`);
    const botId = await createBot(ownerId, 'Quiet');

    actAs({ accountId: ownerId, discordId: `${tag}-owner` });
    const res = await GET(activityRequest(botId), contextFor(botId));
    expect(res.status).toBe(200);
    expect(await readItems(res)).toEqual([]);
  });
});
