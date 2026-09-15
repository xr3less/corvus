// Postgres-backed session tests: session row round-trip + expiry touch
// against the live test database. Skips LOUDLY (console warning naming
// DATABASE_URL) when no database is reachable.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgSessionStore, SESSION_TTL_MS } from './session';

const FALLBACK_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

function resolveDatabaseUrl(): { url: string; fromEnv: boolean } {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv && fromEnv.trim() !== '') {
    return { url: fromEnv, fromEnv: true };
  }
  return { url: FALLBACK_DATABASE_URL, fromEnv: false };
}

// Inline fallback with the exact SPEC section 4 columns. Runs ONLY when the
// sibling migration file is absent.
const INLINE_FALLBACK_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  email text NULLABLE,
  creem_id text NULLABLE,
  credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const IGNORED_MIGRATION_CODES = new Set(['42P07', '42710', '42723', '42P16', '42P06']);

let pool: Pool | null = null;
let skipped = false;
let schemaPathUsed = '';

beforeAll(async () => {
  const { url, fromEnv } = resolveDatabaseUrl();
  if (!fromEnv) {
    console.warn(
      'session-db.test: DATABASE_URL is unset, falling back to the disposable test container URL.',
    );
  }
  const candidate = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await candidate.query('SELECT 1');
  } catch (error) {
    console.warn(
      `session-db.test: SKIP — no Postgres reachable (set DATABASE_URL to run). Cause: ${(error as Error).message}`,
    );
    skipped = true;
    await candidate.end().catch(() => undefined);
    return;
  }
  pool = candidate;

  const migrationCandidates = [
    path.resolve(process.cwd(), '../../gateway/drizzle/0002_v11.sql'),
    path.resolve(process.cwd(), '../gateway/drizzle/0002_v11.sql'),
  ];
  let migrationSql: string | null = null;
  for (const file of migrationCandidates) {
    try {
      migrationSql = await readFile(file, 'utf8');
      schemaPathUsed = `migration file: ${file}`;
      break;
    } catch {
      migrationSql = null;
    }
  }
  try {
    if (migrationSql !== null) {
      await pool.query(migrationSql);
    } else {
      schemaPathUsed = 'inline fallback (SPEC section 4 columns)';
      await pool.query(INLINE_FALLBACK_SQL);
    }
  } catch (error) {
    if (
      migrationSql !== null &&
      IGNORED_MIGRATION_CODES.has((error as { code?: string }).code ?? '')
    ) {
      schemaPathUsed += ' (already applied — duplicate objects ignored)';
    } else {
      throw error;
    }
  }
  console.log(`session-db.test: schema ready via ${schemaPathUsed}`);
}, 30_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  pool = null;
});

function loudSkipGuard(): boolean {
  if (skipped || !pool) {
    console.warn('session-db.test: SKIP — no database; set DATABASE_URL to run PG tests.');
    return true;
  }
  return false;
}

describe('pg session store', () => {
  it('round-trips account upsert + session create/find', async () => {
    if (loudSkipGuard()) {
      return;
    }
    const store = new PgSessionStore(pool as Pool);
    const discordId = `db-test-${randomUUID()}`;
    const account = await store.upsertAccountByDiscordId(discordId, 'db@example.com');
    expect(account.discord_id).toBe(discordId);

    const same = await store.upsertAccountByDiscordId(discordId, null);
    expect(same.id).toBe(account.id);
    expect(same.email).toBe('db@example.com');

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await store.createSession(account.id, expiresAt);
    const found = await store.findSessionWithAccount(session.id);
    expect(found?.session.account_id).toBe(account.id);
    expect(found?.discordId).toBe(discordId);

    await store.deleteSession(session.id);
    await expect(store.findSessionWithAccount(session.id)).resolves.toBeNull();
    await (pool as Pool).query('DELETE FROM accounts WHERE id = $1', [account.id]);
  });

  it('touches expires_at forward for rolling expiry', async () => {
    if (loudSkipGuard()) {
      return;
    }
    const store = new PgSessionStore(pool as Pool);
    const discordId = `db-touch-${randomUUID()}`;
    const account = await store.upsertAccountByDiscordId(discordId, null);
    const session = await store.createSession(account.id, new Date(Date.now() + 60_000));

    const later = new Date(Date.now() + SESSION_TTL_MS);
    await store.touchSession(session.id, later);
    const found = await store.findSessionWithAccount(session.id);
    expect(found).not.toBeNull();
    const stored = Number(new Date(found?.session.expires_at as string).getTime());
    expect(Math.abs(stored - later.getTime())).toBeLessThan(5000);

    await store.deleteSession(session.id);
    await (pool as Pool).query('DELETE FROM accounts WHERE id = $1', [account.id]);
  });
});
