import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { TEST_DATABASE_URL, __resetPool, __setPool } from '../../../lib/db/pool';
import {
  LIVE_BOT_COUNT_SQL,
  TRIAL_BOT_LIMIT_MESSAGE,
  TRIAL_EXPIRED_MESSAGE,
} from '../../../lib/bots';
import {
  ADMINISTRATOR_BIT,
  CAPABILITY_MAP,
  buildInvite,
  capabilityBitfield,
  isCapability,
  type Capability,
} from '../../../lib/invite/permissions';
import { GET as listTemplates } from './route';
import { GET as getTemplate } from './[slug]/route';
import {
  POST as forkTemplate,
  __resetSessionReader as resetForkReader,
  __setSessionReader as setForkReader,
  type ForkSession,
} from './[slug]/fork/route';

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
    `[templates.test] LOUD SKIP: Postgres test database unreachable at ${connectionString}. ` +
      `Reason: ${probe.reason}. Start the orchestrator-owned test container, then re-run.`,
  );
}

/* The 0010 migration adds the column; this is the fallback-DDL equivalent for
   a database where the sibling file could not be applied. */
const TRIAL_COLUMN_DDL = 'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz';

/* Clocks are literals relative to the run, never date comparisons in
   assertions: an hour of margin on either side cannot flake on a slow machine. */
const NOW_PLUS_HOUR = new Date(Date.now() + 3_600_000).toISOString();
const NOW_MINUS_HOUR = new Date(Date.now() - 3_600_000).toISOString();

// Inline fallback DDL matching the sibling migrations verbatim (0001 bots +
// 0002 accounts/spec_versions) plus the V1-6 templates contract text. Every
// statement is IF NOT EXISTS so it is a no-op once the siblings land.
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
CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]',
  source_spec jsonb NOT NULL,
  semver text NOT NULL DEFAULT '1.0.0',
  perms_needed jsonb NOT NULL DEFAULT '[]',
  forks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
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
  // Self-heal for the cross-workspace shared-DB path (KI-033): the shared test
  // container may already hold `accounts` from an older tree whose migrations
  // stop before 0010, in which case the CREATE TABLE above is a no-op and the
  // trial column would be missing — the fork gate would then fail every
  // assertion on `column "trial_ends_at" does not exist`. Best-effort, mirroring
  // apps/web/app/api/bots/[botId]/activity/route.test.ts: loud warn, never fail
  // the hook on repair DDL.
  try {
    await pool.query(TRIAL_COLUMN_DDL);
  } catch (error) {
    console.warn(
      `[templates.test] self-heal accounts.trial_ends_at failed: ${(error as Error).message}`,
    );
  }
  console.info(`[templates.test] schema ready via ${migrationSource}`);
}

// The 8 locked capability sets from the SPEC (used by the pure
// least-privilege test — no DB needed).
const LOCKED_SETS: Capability[][] = [
  ['welcome'],
  ['moderation', 'logging'],
  ['tickets'],
  ['leveling'],
  ['reaction-roles'],
  ['logging'],
  ['welcome'],
  ['leveling'],
];

function postFork(slug: string, body?: unknown): Request {
  const init: RequestInit =
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };
  return new Request(`http://localhost/api/templates/${slug}/fork`, init);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const session: ForkSession = { accountId: '', discordId: 'tfork-discord-1' };

describe('template routes without session or database', () => {
  it('fork returns 401 when unauthenticated', async () => {
    resetForkReader();
    const res = await forkTemplate(postFork('welcome-wagon', {}), {
      params: Promise.resolve({ slug: 'welcome-wagon' }),
    });
    expect(res.status).toBe(401);
  });

  it('detail returns 404 for a malformed slug without touching the DB', async () => {
    const res = await getTemplate(new Request('http://localhost/api/templates/BAD!!'), {
      params: Promise.resolve({ slug: 'BAD SLUG!!' }),
    });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
  });

  it('fork returns 404 for a malformed slug once authenticated', async () => {
    setForkReader({ getSession: async () => session });
    try {
      const res = await forkTemplate(postFork('BAD SLUG!!', {}), {
        params: Promise.resolve({ slug: 'BAD SLUG!!' }),
      });
      expect(res.status).toBe(404);
    } finally {
      resetForkReader();
    }
  });

  it('fork returns 422 for a bad botName without touching the DB', async () => {
    setForkReader({ getSession: async () => session });
    try {
      const res = await forkTemplate(postFork('tfork-alpha', { botName: '   ' }), {
        params: Promise.resolve({ slug: 'tfork-alpha' }),
      });
      expect(res.status).toBe(422);
    } finally {
      resetForkReader();
    }
  });

  it('all 8 locked capability sets stay least-privilege (no Administrator)', async () => {
    for (const capabilities of LOCKED_SETS) {
      const bits = capabilityBitfield(capabilities);
      expect(bits & ADMINISTRATOR_BIT).toBe(0n);
      const { url } = buildInvite({ clientId: '123456789012345678', capabilities });
      expect(url).toContain('permissions=');
      // Exact bit check on the permission PARAM (not a substring of the URL:
      // the logging set yields permissions=85120, which starts with an 8 but
      // has bit 3 clear — a substring assertion false-fails on it).
      const match = /permissions=(\d+)/.exec(url);
      expect(match).not.toBeNull();
      expect(BigInt(match?.[1] ?? '0') & ADMINISTRATOR_BIT).toBe(0n);
      expect(match?.[1]).not.toBe('8');
    }
  });
});

// --- Missing DATABASE_URL maps honestly (KI-021) ----------------------------

describe('template routes with DATABASE_URL absent', () => {
  async function withNoDatabase(fn: () => Promise<void>): Promise<void> {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    try {
      await fn();
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  }

  it('list answers the canonical database-not-configured 500', async () => {
    await withNoDatabase(async () => {
      const res = await listTemplates();
      expect(res.status).toBe(500);
      expect(await readJson(res)).toEqual({ error: 'database not configured' });
    });
  });

  it('detail answers the canonical database-not-configured 500', async () => {
    await withNoDatabase(async () => {
      const res = await getTemplate(new Request('http://localhost/api/templates/tfork-alpha'), {
        params: Promise.resolve({ slug: 'tfork-alpha' }),
      });
      expect(res.status).toBe(500);
      expect(await readJson(res)).toEqual({ error: 'database not configured' });
    });
  });

  it('fork answers the canonical database-not-configured 500', async () => {
    setForkReader({ getSession: async () => session });
    try {
      await withNoDatabase(async () => {
        const res = await forkTemplate(postFork('tfork-alpha', {}), {
          params: Promise.resolve({ slug: 'tfork-alpha' }),
        });
        expect(res.status).toBe(500);
        expect(await readJson(res)).toEqual({ error: 'database not configured' });
      });
    } finally {
      resetForkReader();
    }
  });
});

(probe.ok ? describe : describe.skip)('template routes with Postgres', () => {
  let pool: Pool;
  const savedClientId = process.env.DISCORD_CLIENT_ID;

  function permsFor(capabilities: Capability[]): { perm: string; why: string }[] {
    const seen = new Map<string, string>();
    for (const capability of capabilities) {
      for (const entry of CAPABILITY_MAP[capability]) {
        if (!seen.has(entry.perm)) {
          seen.set(entry.perm, entry.why);
        }
      }
    }
    return [...seen].map(([perm, why]) => ({ perm, why }));
  }

  async function seedTemplate(input: {
    slug: string;
    name: string;
    category: string;
    capabilities: Capability[];
  }): Promise<void> {
    const perms = permsFor(input.capabilities).slice(0, 2);
    const sourceSpec = { version: 1, behaviors: ['greet newcomers', 'post rules', 'log joins'] };
    await pool.query(
      `INSERT INTO templates (slug, name, category, capabilities, source_spec, semver, perms_needed)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, '1.0.0', $6::jsonb)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, category = EXCLUDED.category,
         capabilities = EXCLUDED.capabilities, source_spec = EXCLUDED.source_spec,
         semver = EXCLUDED.semver, perms_needed = EXCLUDED.perms_needed`,
      [
        input.slug,
        input.name,
        input.category,
        JSON.stringify(input.capabilities),
        JSON.stringify(sourceSpec),
        JSON.stringify(perms),
      ],
    );
  }

  async function forksOf(slug: string): Promise<number> {
    const found = await pool.query<{ forks: number }>(
      'SELECT forks FROM templates WHERE slug = $1',
      [slug],
    );
    return found.rows[0].forks;
  }

  async function liveBotsOf(accountId: string): Promise<number> {
    const counted = await pool.query<{ count: number }>(LIVE_BOT_COUNT_SQL, [accountId]);
    return counted.rows[0].count;
  }

  /* A separate fork account per gate test: the shared `session` account carries
     the file's other assertions, and mutating its clock or tier would reach
     across tests (vitest runs a file's tests in order, in one pool). */
  async function gateAccount(
    discordId: string,
    trialEndsAt: string | null = NOW_PLUS_HOUR,
  ): Promise<string> {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO accounts (discord_id, trial_ends_at) VALUES ($1, $2::timestamptz) RETURNING id`,
      [discordId, trialEndsAt],
    );
    return row.rows[0].id;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await ensureSchema(pool);
    __setPool(pool);
    process.env.DISCORD_CLIENT_ID = '123456789012345678';
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (discord_id, trial_ends_at)
       VALUES ('tfork-discord-1', $1::timestamptz)
       ON CONFLICT (discord_id) DO UPDATE
         SET discord_id = EXCLUDED.discord_id, trial_ends_at = EXCLUDED.trial_ends_at
       RETURNING id`,
      [NOW_PLUS_HOUR],
    );
    session.accountId = account.rows[0].id;
    await seedTemplate({
      slug: 'tfork-alpha',
      name: 'Tfork Alpha',
      category: 'welcome',
      capabilities: ['welcome'],
    });
    await seedTemplate({
      slug: 'tfork-beta',
      name: 'Tfork Beta',
      category: 'moderation',
      capabilities: ['moderation', 'logging'],
    });
    setForkReader({ getSession: async () => session });
  });

  afterAll(async () => {
    process.env.DISCORD_CLIENT_ID = savedClientId;
    resetForkReader();
    if (probe.ok && pool) {
      await pool.query('DELETE FROM bots WHERE account_id = $1', [session.accountId]);
      await pool.query(
        "DELETE FROM bots WHERE account_id IN (SELECT id FROM accounts WHERE discord_id LIKE 'tfork-gate-%')",
      );
      await pool.query("DELETE FROM accounts WHERE discord_id LIKE 'tfork-gate-%'");
      await pool.query("DELETE FROM templates WHERE slug LIKE 'tfork-%'");
      await pool.query('DELETE FROM accounts WHERE discord_id = $1', ['tfork-discord-1']);
      await pool.end().catch(() => {});
    }
  });

  it('lists cards publicly, ordered by slug, without source_spec', async () => {
    const res = await listTemplates();
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const templates = body.templates as Record<string, unknown>[];
    expect(Array.isArray(templates)).toBe(true);
    const slugs = templates.map((t) => t.slug as string);
    expect(slugs).toEqual([...slugs].sort());
    expect(slugs).toContain('tfork-alpha');
    for (const card of templates) {
      expect('source_spec' in card).toBe(false);
      expect(typeof card.slug).toBe('string');
      expect(typeof card.semver).toBe('string');
      expect(typeof card.forks).toBe('number');
    }
  });

  it('detail returns 404 for an unknown slug and the full row when known', async () => {
    const missing = await getTemplate(new Request('http://localhost/api/templates/tfork-nope'), {
      params: Promise.resolve({ slug: 'tfork-nope' }),
    });
    expect(missing.status).toBe(404);

    const found = await getTemplate(new Request('http://localhost/api/templates/tfork-alpha'), {
      params: Promise.resolve({ slug: 'tfork-alpha' }),
    });
    expect(found.status).toBe(200);
    const row = await readJson(found);
    expect(row.slug).toBe('tfork-alpha');
    expect(row.name).toBe('Tfork Alpha');
    const spec = row.source_spec as { version: number; behaviors: unknown[] };
    expect(spec.version).toBe(1);
    expect(spec.behaviors.length).toBe(3);
  });

  it('fork returns 404 for an unknown slug', async () => {
    const res = await forkTemplate(postFork('tfork-nope', {}), {
      params: Promise.resolve({ slug: 'tfork-nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('fork returns 500 with no leakage when DISCORD_CLIENT_ID is missing', async () => {
    delete process.env.DISCORD_CLIENT_ID;
    try {
      const before = await forksOf('tfork-alpha');
      const res = await forkTemplate(postFork('tfork-alpha', {}), {
        params: Promise.resolve({ slug: 'tfork-alpha' }),
      });
      expect(res.status).toBe(500);
      // Checked before the transaction: no bot minted, forks untouched.
      expect(await forksOf('tfork-alpha')).toBe(before);
    } finally {
      process.env.DISCORD_CLIENT_ID = '123456789012345678';
    }
  });

  it('fork happy path mints a draft bot + spec v1 + pointer + forks+1 + inviteUrl', async () => {
    const before = await forksOf('tfork-alpha');
    const res = await forkTemplate(postFork('tfork-alpha', {}), {
      params: Promise.resolve({ slug: 'tfork-alpha' }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.version).toBe(1);
    const botId = body.botId as string;
    const draftSpecId = body.draftSpecId as string;
    expect(typeof botId).toBe('string');
    expect(typeof draftSpecId).toBe('string');

    const inviteUrl = body.inviteUrl as string;
    expect(inviteUrl).toContain('permissions=');
    const inviteMatch = /permissions=(\d+)/.exec(inviteUrl);
    expect(inviteMatch).not.toBeNull();
    expect(BigInt(inviteMatch?.[1] ?? '0') & ADMINISTRATOR_BIT).toBe(0n);
    expect(inviteMatch?.[1]).not.toBe('8');

    const bot = await pool.query<{
      name: string;
      status: string;
      account_id: string;
      draft_spec_id: string | null;
    }>('SELECT name, status, account_id, draft_spec_id FROM bots WHERE id = $1', [botId]);
    expect(bot.rowCount).toBe(1);
    expect(bot.rows[0].name).toBe('Tfork Alpha');
    expect(bot.rows[0].status).toBe('draft');
    expect(bot.rows[0].account_id).toBe(session.accountId);
    expect(bot.rows[0].draft_spec_id).toBe(draftSpecId);

    const spec = await pool.query<{
      version: number;
      state: string;
      author: string;
      diff_summary: string;
      spec: unknown;
    }>('SELECT version, state, author, diff_summary, spec FROM spec_versions WHERE id = $1', [
      draftSpecId,
    ]);
    expect(spec.rowCount).toBe(1);
    expect(spec.rows[0].version).toBe(1);
    expect(spec.rows[0].state).toBe('draft');
    expect(spec.rows[0].author).toBe('owner:tfork-discord-1');
    expect(spec.rows[0].diff_summary).toBe('Forked from tfork-alpha v1.0.0');
    const minted = spec.rows[0].spec as { version: number; behaviors: unknown[] };
    expect(minted.version).toBe(1);
    expect(minted.behaviors.length).toBe(3);

    expect(await forksOf('tfork-alpha')).toBe(before + 1);
  });

  it('fork honors a botName override and bare POSTs use the template name', async () => {
    const named = await forkTemplate(postFork('tfork-beta', { botName: 'My Mod Bot' }), {
      params: Promise.resolve({ slug: 'tfork-beta' }),
    });
    expect(named.status).toBe(200);
    const namedBody = await readJson(named);
    const namedBot = await pool.query<{ name: string }>('SELECT name FROM bots WHERE id = $1', [
      namedBody.botId as string,
    ]);
    expect(namedBot.rows[0].name).toBe('My Mod Bot');

    const bare = await forkTemplate(postFork('tfork-beta'), {
      params: Promise.resolve({ slug: 'tfork-beta' }),
    });
    expect(bare.status).toBe(200);
    const bareBody = await readJson(bare);
    const bareBot = await pool.query<{ name: string }>('SELECT name FROM bots WHERE id = $1', [
      bareBody.botId as string,
    ]);
    expect(bareBot.rows[0].name).toBe('Tfork Beta');
  });

  it('double fork of one template yields two independent drafts', async () => {
    const before = await forksOf('tfork-beta');
    const first = await readJson(
      await forkTemplate(postFork('tfork-beta', { botName: 'Fork One' }), {
        params: Promise.resolve({ slug: 'tfork-beta' }),
      }),
    );
    const second = await readJson(
      await forkTemplate(postFork('tfork-beta', { botName: 'Fork Two' }), {
        params: Promise.resolve({ slug: 'tfork-beta' }),
      }),
    );
    expect(first.botId).not.toBe(second.botId);
    expect(first.draftSpecId).not.toBe(second.draftSpecId);
    const names = await pool.query<{ name: string }>(
      'SELECT name FROM bots WHERE id = $1 OR id = $2 ORDER BY name',
      [first.botId as string, second.botId as string],
    );
    expect(names.rows.map((r) => r.name)).toEqual(['Fork One', 'Fork Two']);
    expect(await forksOf('tfork-beta')).toBe(before + 2);
  });

  it('refuses the second fork on a running trial — 403 trial_bot_limit, forks untouched', async () => {
    const tag = `tfork-gate-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await gateAccount(`${tag}-cap`);
    setForkReader({ getSession: async () => ({ accountId, discordId: `${tag}-cap` }) });
    const before = await forksOf('tfork-alpha');

    const first = await forkTemplate(postFork('tfork-alpha', {}), {
      params: Promise.resolve({ slug: 'tfork-alpha' }),
    });
    expect(first.status).toBe(200);

    const second = await forkTemplate(postFork('tfork-alpha', {}), {
      params: Promise.resolve({ slug: 'tfork-alpha' }),
    });
    expect(second.status).toBe(403);
    expect(await readJson(second)).toEqual({
      error: 'trial_bot_limit',
      message: TRIAL_BOT_LIMIT_MESSAGE,
    });
    // The refusal happens before the transaction: no bot, no spec version and
    // no fork increment.
    expect(await liveBotsOf(accountId)).toBe(1);
    expect(await forksOf('tfork-alpha')).toBe(before + 1);

    setForkReader({ getSession: async () => session });
  });

  it('refuses an expired clock — 403 trial_expired, nothing written', async () => {
    const tag = `tfork-gate-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accountId = await gateAccount(`${tag}-expired`, NOW_MINUS_HOUR);
    setForkReader({ getSession: async () => ({ accountId, discordId: `${tag}-expired` }) });
    const before = await forksOf('tfork-alpha');

    const res = await forkTemplate(postFork('tfork-alpha', {}), {
      params: Promise.resolve({ slug: 'tfork-alpha' }),
    });

    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({
      error: 'trial_expired',
      message: TRIAL_EXPIRED_MESSAGE,
    });
    expect(await liveBotsOf(accountId)).toBe(0);
    expect(await forksOf('tfork-alpha')).toBe(before);

    setForkReader({ getSession: async () => session });
  });

  it('lets a paid tier bypass both gates and fails open on a NULL clock', async () => {
    const tag = `tfork-gate-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const paidId = await gateAccount(`${tag}-paid`, NOW_MINUS_HOUR);
    await pool.query('UPDATE accounts SET tier = $2 WHERE id = $1', [paidId, 'pro']);
    await pool.query(
      `INSERT INTO bots (account_id, name, token_cipher, status)
       VALUES ($1, 'Existing', '\\x'::bytea, 'draft')`,
      [paidId],
    );
    setForkReader({ getSession: async () => ({ accountId: paidId, discordId: `${tag}-paid` }) });
    expect(
      (
        await forkTemplate(postFork('tfork-alpha', {}), {
          params: Promise.resolve({ slug: 'tfork-alpha' }),
        })
      ).status,
    ).toBe(200);
    expect(await liveBotsOf(paidId)).toBe(2);

    const nullClockId = await gateAccount(`${tag}-null`, null);
    setForkReader({
      getSession: async () => ({ accountId: nullClockId, discordId: `${tag}-null` }),
    });
    expect(
      (
        await forkTemplate(postFork('tfork-alpha', {}), {
          params: Promise.resolve({ slug: 'tfork-alpha' }),
        })
      ).status,
    ).toBe(200);

    setForkReader({ getSession: async () => session });
  });

  it('seam: every row perms_needed is a subset of the REAL mapper output', async () => {
    const found = await pool.query<{
      slug: string;
      capabilities: unknown;
      perms_needed: unknown;
    }>(
      `SELECT slug, name, category, capabilities, perms_needed, forks, semver
       FROM templates ORDER BY slug`,
    );
    expect(found.rowCount).toBeGreaterThan(0);
    for (const row of found.rows) {
      const caps = row.capabilities;
      expect(Array.isArray(caps)).toBe(true);
      const capabilities = (caps as unknown[]).filter(
        (c): c is Capability => typeof c === 'string' && isCapability(c),
      );
      expect(capabilities.length).toBeGreaterThan(0);
      const allowed = new Set<string>();
      for (const capability of capabilities) {
        for (const entry of CAPABILITY_MAP[capability]) {
          allowed.add(entry.perm);
        }
      }
      const needs = row.perms_needed as { perm: string; why: string }[];
      expect(Array.isArray(needs)).toBe(true);
      expect(needs.length).toBeLessThanOrEqual(3);
      for (const need of needs) {
        expect(allowed.has(need.perm)).toBe(true);
      }
    }
  });
});
