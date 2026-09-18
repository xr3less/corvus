// Accounts tier resolver tests (KI-025): fake-pool unit tests run with no DB;
// the live leg applies 0001 + 0002_v11 + 0008 on an empty schema and reads
// back the DEFAULT 'trial' then an updated 'pro'. Loud-skip when Postgres is
// unreachable — a silent skip is forbidden (L-009).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountsTierResolver, type TierQueryable } from './tier-resolver.js';

function fakePool(rows: unknown[] | Error): TierQueryable {
  return {
    query: async () => {
      if (rows instanceof Error) throw rows;
      return { rows };
    },
  };
}

describe('createAccountsTierResolver (no DB)', () => {
  it.each(['trial', 'pro', 'studio', 'scale'] as const)(
    'passes through known tier %s',
    async (tier) => {
      const resolver = createAccountsTierResolver(fakePool([{ tier }]));
      await expect(resolver('account-1')).resolves.toBe(tier);
    },
  );

  it('returns null when the account row is missing', async () => {
    const resolver = createAccountsTierResolver(fakePool([]));
    await expect(resolver('account-missing')).resolves.toBeNull();
  });

  it('returns null for an invalid tier string (trial fallback at the caller)', async () => {
    const resolver = createAccountsTierResolver(fakePool([{ tier: 'enterprise' }]));
    await expect(resolver('account-1')).resolves.toBeNull();
  });

  it('returns null for a null tier value', async () => {
    const resolver = createAccountsTierResolver(fakePool([{ tier: null }]));
    await expect(resolver('account-1')).resolves.toBeNull();
  });

  it('returns null instead of throwing when the query throws', async () => {
    const resolver = createAccountsTierResolver(fakePool(new Error('connection lost')));
    await expect(resolver('account-1')).resolves.toBeNull();
  });

  it('selects the tier by account id with one bounded row', async () => {
    const seen: Array<{ text: string; params: unknown[] | undefined }> = [];
    const pool: TierQueryable = {
      query: async (text: string, params?: unknown[]) => {
        seen.push({ text, params });
        return { rows: [{ tier: 'pro' }] };
      },
    };
    await expect(createAccountsTierResolver(pool)('account-7')).resolves.toBe('pro');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.text).toBe('SELECT tier FROM accounts WHERE id = $1 LIMIT 1');
    expect(seen[0]?.params).toEqual(['account-7']);
  });
});

// ---------------------------------------------------------------------------
// Live leg: 0001 + 0002_v11 + 0008 on a fresh, empty schema, proving the
// DEFAULT keeps old INSERTs working and the resolver reads the stored tier.
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const initSql = readFileSync(join(here, '..', '..', 'drizzle', '0001_init.sql'), 'utf8');
const v11Sql = readFileSync(join(here, '..', '..', 'drizzle', '0002_v11.sql'), 'utf8');
const tierSql = readFileSync(join(here, '..', '..', 'drizzle', '0008_accounts_tier.sql'), 'utf8');

const FALLBACK_DB_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return FALLBACK_DB_URL;
}

const DATABASE_URL = resolveDatabaseUrl();
const SCHEMA_NAME = `accounts_tier_test_${process.pid}_${Date.now()}`;
const pool = new Pool({ connectionString: DATABASE_URL });
let PG_UNREACHABLE = false;
let client: PoolClient | null = null;

function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe('accounts tier migration (real Postgres)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
    } catch {
      PG_UNREACHABLE = true;
      console.warn(
        '[tier-resolver] SKIP: no Postgres reachable at the configured URL — ' +
          'start the CI-identical container (postgres:17, see .github/workflows/ci.yml) ' +
          'or set DATABASE_URL. Skipping loudly, not failing.',
      );
      return;
    }
    client = await pool.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`CREATE SCHEMA "${SCHEMA_NAME}"`);
    await client.query(`SET search_path TO "${SCHEMA_NAME}"`);
    for (const sql of [initSql, v11Sql, tierSql]) {
      for (const statement of splitStatements(sql)) {
        await client.query(statement);
      }
    }
  }, 60_000);

  afterAll(async () => {
    try {
      if (client !== null) {
        if (!PG_UNREACHABLE) {
          await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA_NAME}" CASCADE`);
        }
        client.release();
      }
    } catch {
      // Cleanup is best-effort; an unreachable DB has nothing to drop.
    }
    await pool.end().catch(() => undefined);
  }, 60_000);

  it('defaults an insert without tier to trial, then reads back an updated pro', async (ctx) => {
    if (PG_UNREACHABLE || client === null) {
      ctx.skip();
      return;
    }
    const c = client;
    const inserted = await c.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [`tier-leg-${process.pid}-${Date.now()}`],
    );
    const accountId = inserted.rows[0]?.id;
    if (typeof accountId !== 'string') {
      throw new Error('tier live leg: insert returned no id');
    }
    const resolver = createAccountsTierResolver(c);
    await expect(resolver(accountId)).resolves.toBe('trial');
    await c.query('UPDATE accounts SET tier = $1 WHERE id = $2', ['pro', accountId]);
    await expect(resolver(accountId)).resolves.toBe('pro');
  });
});
