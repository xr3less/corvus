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

// Inline fallback with the exact SPEC section 4 columns. Runs when the sibling
// migrations are unreadable or cannot all apply. `nullable` is the default
// column constraint in Postgres — spelling it as `text NULLABLE` is a syntax
// error, so the modifier is simply omitted (same shape as 0002_v11.sql).
const INLINE_FALLBACK_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  email text,
  creem_id text,
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

// Tolerated on re-run / concurrent-suite creation: duplicate_table,
// duplicate_object, duplicate_function, invalid_table_definition,
// duplicate_schema. Any other code is a real schema failure and is rethrown.
const IGNORED_MIGRATION_CODES = new Set(['42P07', '42710', '42723', '42P16', '42P06']);

// Resolved relative to THIS FILE, not process.cwd(): the previous cwd-relative
// candidates only worked when vitest was launched from apps/web, and the first
// of the two silently pointed at a non-existent repo-root gateway/ directory.
// From apps/web/lib/auth/ three levels up is apps/, where the gateway package
// actually lives.
//
// The URLs must be BUILT INSIDE THE HOOK, not at module scope. Vitest rewrites
// `import.meta.url` per context: while this module is being evaluated it is the
// Vite dev-server URL (`http://localhost:3000/@fs/...`), which `readFile`
// rejects with "The URL must be of scheme file"; by the time `beforeAll` runs it
// is the real `file://` URL. Building them at module scope therefore made every
// sibling read fail, and because those failures were swallowed into the
// fallback, the suite silently never exercised the real migration SQL at all.
const MIGRATION_RELATIVE_PATHS = [
  '../../../gateway/drizzle/0001_init.sql',
  '../../../gateway/drizzle/0002_v11.sql',
];

function migrationSources(): URL[] {
  return MIGRATION_RELATIVE_PATHS.map((relative) => new URL(relative, import.meta.url));
}

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

  // Apply the sibling migrations in dependency order. 0001 creates bots, which
  // 0002's spec_versions references — applying 0002 alone (the old behaviour)
  // throws `relation "bots" does not exist` on an empty database, and that
  // error's code is not in IGNORED_MIGRATION_CODES, so the hook rejected and
  // every test in this file failed on CI.
  const sources = migrationSources();
  const applied: string[] = [];
  const unapplied: string[] = [];
  for (const source of sources) {
    try {
      const sql = await readFile(source, 'utf8');
      await pool.query(sql);
      applied.push(path.basename(source.pathname));
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (IGNORED_MIGRATION_CODES.has(code)) {
        // Duplicate objects from a previous run / a concurrent suite: fine.
        applied.push(`${path.basename(source.pathname)} (duplicates ignored)`);
      } else {
        unapplied.push(`${path.basename(source.pathname)}: ${(error as Error).message}`);
      }
    }
  }
  // Always run the fallback too: it is IF NOT EXISTS throughout, so it is a
  // no-op when the migrations above succeeded and the repair path when they did
  // not. Without it a partially-applied database leaves the suite running
  // against a half-built schema — and because this fallback makes a swallowed
  // migration failure survivable, the migration reads must be REPORTED, not
  // merely tolerated: a silent 0/2 looks exactly like a clean run.
  await pool.query(INLINE_FALLBACK_SQL);
  schemaPathUsed =
    applied.length === sources.length
      ? `migrations + inline fallback: ${applied.join(', ')}`
      : `inline fallback (${applied.length}/${sources.length} migrations applied)`;
  if (unapplied.length > 0) {
    // Loud, and deliberately NOT a rethrow (the inline DDL above is sufficient
    // for this suite's own tests) — but the sum of the two lines cannot be read
    // as success: a sibling read failure is always visible in the log.
    console.warn(
      `session-db.test: WARNING — sibling migration(s) NOT applied (${unapplied.join('; ')}); ` +
        `schema came from the inline SPEC section 4 DDL only.`,
    );
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
