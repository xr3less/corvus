// Postgres-backed session tests: session row round-trip + expiry touch
// against the live test database. Skips LOUDLY (console warning naming
// DATABASE_URL) when no database is reachable.
//
// The KI-033 trial-clock half is SPLIT deliberately: its behaviour assertions
// need the live database (a memory double can only re-assert the logic we
// wrote, never the SQL Postgres actually runs), and its SQL-SHAPE assertions
// need no database at all — so the shape block below still runs and still
// fails on a developer machine or CI runner with no Postgres. That split
// exists because the DB-backed blocks silently skip without a reachable
// database: without the shape block, breaking the ON CONFLICT clause would
// look exactly like a clean run.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PgSessionStore,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createMemorySessionStore,
  getSession,
  isTrialExpired,
} from './session';

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
  tier text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz
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
  // Self-heal for the cross-workspace shared-DB path (KI-033): the shared test
  // container may already hold `accounts` from an older tree whose migrations
  // stop before 0010, in which case the CREATE TABLE above is a no-op and the
  // trial column would be missing — every KI-033 assertion in this file would
  // then fail on `column "trial_ends_at" does not exist`. Best-effort, mirroring
  // apps/web/app/api/bots/[botId]/activity/route.test.ts: loud warn, never fail
  // the hook on repair DDL.
  try {
    await pool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz');
  } catch (error) {
    console.warn(
      `session-db.test: self-heal accounts.trial_ends_at failed: ${(error as Error).message}`,
    );
  }
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

// KI-033 trial clock, database-backed half. These exercise the REAL writer
// (upsertAccountByDiscordId's INSERT ... now() + interval '3 days') and the
// REAL join (findSessionWithAccount), which is the only way to prove the
// ON CONFLICT branch leaves the clock alone — a memory double could only
// re-assert the logic we wrote, not the SQL Postgres actually runs.
describe('trial clock (KI-033)', () => {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  it('stamps trial_ends_at ~3 days out on INSERT and never moves it on re-login', async () => {
    if (loudSkipGuard()) {
      return;
    }
    const store = new PgSessionStore(pool as Pool);
    const discordId = `trial-${randomUUID()}`;

    const before = Date.now();
    const created = await store.upsertAccountByDiscordId(discordId, 'trial@example.com');
    const after = Date.now();
    expect(created.trial_ends_at).toBeTruthy();
    const firstMs = new Date(created.trial_ends_at as Date | string).getTime();
    expect(Number.isFinite(firstMs)).toBe(true);
    // The clock comes from the DATABASE's now(), not the test process's clock,
    // so the bound is a window rather than an exact value.
    expect(firstMs).toBeGreaterThanOrEqual(before + THREE_DAYS_MS - 5000);
    expect(firstMs).toBeLessThanOrEqual(after + THREE_DAYS_MS + 5000);

    // Re-login with an email change and with null: neither may extend (or
    // otherwise touch) the clock.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const reLogin = await store.upsertAccountByDiscordId(discordId, 'changed@example.com');
    expect(reLogin.id).toBe(created.id);
    expect(reLogin.email).toBe('changed@example.com');
    expect(new Date(reLogin.trial_ends_at as Date | string).getTime()).toBe(firstMs);

    const reLoginNull = await store.upsertAccountByDiscordId(discordId, null);
    expect(new Date(reLoginNull.trial_ends_at as Date | string).getTime()).toBe(firstMs);

    // The clock survives to the session join, so a route can gate on it with
    // no second query.
    const session = await store.createSession(created.id, new Date(Date.now() + SESSION_TTL_MS));
    const found = await store.findSessionWithAccount(session.id);
    expect(found).not.toBeNull();
    expect(new Date(found?.trialEndsAt as Date | string).getTime()).toBe(firstMs);

    await store.deleteSession(session.id);
    await (pool as Pool).query('DELETE FROM accounts WHERE id = $1', [created.id]);
  });

  it('reads a grandfathered NULL clock as NOT expired (fail-open)', async () => {
    if (loudSkipGuard()) {
      return;
    }
    const active = pool as Pool;
    const discordId = `trial-null-${randomUUID()}`;
    // A row that reaches the database without a clock: the state every
    // pre-0010 account would be in had the backfill not covered it.
    const inserted = await active.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [discordId],
    );
    const accountId = inserted.rows[0].id;

    const store = new PgSessionStore(active);
    // This upsert takes the ON CONFLICT branch (the discord_id already
    // exists). That is exactly the grandfathering-in-flight case: a row with
    // no clock whose owner logs in again — the trial must NOT be armed, and
    // the row must stay fail-open.
    const account = await store.upsertAccountByDiscordId(discordId, null);
    expect(account.id).toBe(accountId);
    expect(account.trial_ends_at).toBeNull();
    expect(isTrialExpired(account)).toBe(false);
    const raw = await active.query<{ trial_ends_at: Date | null }>(
      'SELECT trial_ends_at FROM accounts WHERE id = $1',
      [accountId],
    );
    expect(raw.rows[0].trial_ends_at).toBeNull();
    expect(isTrialExpired({ trial_ends_at: raw.rows[0].trial_ends_at })).toBe(false);

    // And through the session join, which is how a route sees it.
    const session = await store.createSession(accountId, new Date(Date.now() + SESSION_TTL_MS));
    const found = await store.findSessionWithAccount(session.id);
    expect(found?.trialEndsAt).toBeNull();

    await store.deleteSession(session.id);
    await active.query('DELETE FROM accounts WHERE id = $1', [accountId]);
  });

  it('blocks an expired clock and passes an active one through the session join', async () => {
    if (loudSkipGuard()) {
      return;
    }
    const active = pool as Pool;
    const store = new PgSessionStore(active);
    const discordId = `trial-exp-${randomUUID()}`;
    const account = await store.upsertAccountByDiscordId(discordId, null);
    const session = await store.createSession(account.id, new Date(Date.now() + SESSION_TTL_MS));

    // Expired: one hour ago.
    await active.query(
      "UPDATE accounts SET trial_ends_at = now() - interval '1 hour' WHERE id = $1",
      [account.id],
    );
    const expired = await store.findSessionWithAccount(session.id);
    expect(expired).not.toBeNull();
    // pg returns a Date for timestamptz — the helper must accept it directly.
    expect(expired?.trialEndsAt).toBeInstanceOf(Date);
    expect(isTrialExpired({ trial_ends_at: expired?.trialEndsAt })).toBe(true);

    // Active: one hour from now.
    await active.query(
      "UPDATE accounts SET trial_ends_at = now() + interval '1 hour' WHERE id = $1",
      [account.id],
    );
    const running = await store.findSessionWithAccount(session.id);
    expect(isTrialExpired({ trial_ends_at: running?.trialEndsAt })).toBe(false);

    // getSession carries the clock through to its caller unchanged.
    const info = await getSession(`${SESSION_COOKIE}=${session.id}`, store);
    expect(info?.accountId).toBe(account.id);
    expect(info?.trialEndsAt).toBeInstanceOf(Date);
    expect(isTrialExpired({ trial_ends_at: info?.trialEndsAt })).toBe(false);

    await store.deleteSession(session.id);
    await active.query('DELETE FROM accounts WHERE id = $1', [account.id]);
  });
});

// Unit half: the helper's contract in isolation, no database. These run even
// when no Postgres is reachable (the memory store never sets a clock), which is
// why the fail-open rule is asserted here as well as against real rows.
describe('isTrialExpired', () => {
  const NOW = new Date('2026-09-19T12:00:00.000Z');

  it('is false for a null clock (fail-open for grandfathered rows)', () => {
    expect(isTrialExpired({ trial_ends_at: null }, NOW)).toBe(false);
  });

  it('is false for an undefined clock and for an empty account', () => {
    expect(isTrialExpired({ trial_ends_at: undefined }, NOW)).toBe(false);
    expect(isTrialExpired({}, NOW)).toBe(false);
    expect(isTrialExpired(null, NOW)).toBe(false);
    expect(isTrialExpired(undefined, NOW)).toBe(false);
  });

  it('is true for a clock in the past', () => {
    expect(isTrialExpired({ trial_ends_at: new Date(NOW.getTime() - 1000) }, NOW)).toBe(true);
  });

  it('is false for a clock in the future', () => {
    expect(isTrialExpired({ trial_ends_at: new Date(NOW.getTime() + 1000) }, NOW)).toBe(false);
  });

  it('treats the exact boundary as expired (inclusive)', () => {
    expect(isTrialExpired({ trial_ends_at: new Date(NOW.getTime()) }, NOW)).toBe(true);
  });

  it('accepts an ISO string as well as a Date (pg returns either by path)', () => {
    expect(isTrialExpired({ trial_ends_at: '2026-09-19T11:59:59.000Z' }, NOW)).toBe(true);
    expect(isTrialExpired({ trial_ends_at: '2026-09-19T12:00:01.000Z' }, NOW)).toBe(false);
  });

  it('treats an unparseable clock as NOT expired (a corrupt value never locks a user out)', () => {
    expect(isTrialExpired({ trial_ends_at: 'not-a-date' }, NOW)).toBe(false);
    expect(isTrialExpired({ trial_ends_at: '' }, NOW)).toBe(false);
  });

  it('defaults `now` to the real clock when omitted', () => {
    expect(isTrialExpired({ trial_ends_at: new Date(Date.now() - 60_000) })).toBe(true);
    expect(isTrialExpired({ trial_ends_at: new Date(Date.now() + 60_000) })).toBe(false);
  });
});

// The memory double must stay type-compatible WITHOUT acquiring trial
// behaviour: it leaves the clock unset, so accounts it creates are never
// expired. This is asserted (rather than assumed) because it is the property
// the whole non-DB test suite rests on.
describe('memory session store trial clock (type-only compat)', () => {
  it('leaves the clock unset on create and on re-login, so nothing expires', async () => {
    const store = createMemorySessionStore();
    const account = await store.upsertAccountByDiscordId('mem-trial-1', null);
    expect(account.trial_ends_at).toBeUndefined();
    expect(isTrialExpired(account)).toBe(false);

    const again = await store.upsertAccountByDiscordId('mem-trial-1', 'x@example.com');
    expect(again.trial_ends_at).toBeUndefined();

    // And a session built from it carries NO clock through the join —
    // undefined, not null: the double has no clock concept, while null would
    // claim it asked and was told "none". Both read as not expired.
    const session = await store.createSession(account.id, new Date(Date.now() + SESSION_TTL_MS));
    const found = await store.findSessionWithAccount(session.id);
    expect(found?.trialEndsAt).toBeUndefined();
    expect(isTrialExpired({ trial_ends_at: found?.trialEndsAt })).toBe(false);
  });

  it('an account seeded with a past clock through the double reads as expired', async () => {
    // Proves a suite CAN express "expired" without a database, by injecting a
    // reader/store that yields a past clock (the pattern agents b/c/d use).
    expect(isTrialExpired({ trial_ends_at: new Date(Date.now() - 1) })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No database required below this line. These run everywhere, including a
// machine with no Postgres, and they are the only thing standing between the
// DB-backed blocks' silent skip and a green run over broken SQL.
// ---------------------------------------------------------------------------

// Records every statement the store sends, so the trial-clock SQL can be
// asserted as TEXT — the one property a memory double cannot fake, and the one
// a well-meaning edit is most likely to break (adding trial_ends_at to the
// DO UPDATE SET list would silently re-arm every trial on each login).
function recordingPool(): { pool: Pool; seen: string[] } {
  const seen: string[] = [];
  const pool = {
    query: async (text: string) => {
      seen.push(text);
      if (text.startsWith('INSERT INTO accounts')) {
        return {
          rows: [
            {
              id: 'acct-1',
              discord_id: 'disc-1',
              email: null,
              creem_id: null,
              credits: '0',
              created_at: new Date().toISOString(),
              trial_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            },
          ],
          rowCount: 1,
        };
      }
      if (text.startsWith('SELECT')) {
        return {
          rows: [
            {
              id: 'sess-1',
              account_id: 'acct-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              created_at: new Date().toISOString(),
              discord_id: 'disc-1',
              trial_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, seen };
}

describe('trial clock SQL shape (no database required)', () => {
  it('arms the clock on INSERT and never in the ON CONFLICT branch', async () => {
    const { pool, seen } = recordingPool();
    const store = new PgSessionStore(pool);
    await store.upsertAccountByDiscordId('disc-1', 'a@example.com');

    const insert = seen.find((text) => text.startsWith('INSERT INTO accounts'));
    expect(insert).toBeDefined();
    const sql = insert as string;

    // The clock is armed by the database, not the process clock.
    expect(sql).toContain('trial_ends_at');
    expect(sql).toContain("now() + interval '3 days'");

    // THE regression guard: the DO UPDATE branch must not mention the column.
    // Sliced from ON CONFLICT up to RETURNING — the RETURNING clause legitimately
    // names trial_ends_at and sits after it, so a naive slice would false-fail.
    const onConflict = sql.slice(sql.indexOf('ON CONFLICT'), sql.indexOf('RETURNING'));
    expect(onConflict).toContain('DO UPDATE');
    expect(onConflict).not.toContain('trial_ends_at');

    // It still returns the clock, so the caller can read it with no second query.
    expect(sql.slice(sql.indexOf('RETURNING'))).toContain('trial_ends_at');
  });

  it('selects the clock in the session join so no second query is needed', async () => {
    const { pool, seen } = recordingPool();
    const store = new PgSessionStore(pool);
    await store.findSessionWithAccount('sess-1');

    const select = seen.find((text) => text.startsWith('SELECT'));
    expect(select).toBeDefined();
    const sql = select as string;
    expect(sql).toContain('a.trial_ends_at');
    // Still a single statement against two tables — the point of putting it on
    // the join is that a route needs no extra round trip.
    expect(sql).toContain('JOIN accounts');
  });

  it('maps a missing clock to null rather than a backfilled value', async () => {
    // A row with no clock (grandfathered / pre-migration) must surface as null
    // so isTrialExpired's fail-open branch decides — never as a coerced date.
    const pool = {
      query: async () => ({
        rows: [
          {
            id: 'sess-2',
            account_id: 'acct-2',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            created_at: new Date().toISOString(),
            discord_id: 'disc-2',
            trial_ends_at: null,
          },
        ],
        rowCount: 1,
      }),
    } as unknown as Pool;
    const found = await new PgSessionStore(pool).findSessionWithAccount('sess-2');
    expect(found?.trialEndsAt).toBeNull();
    expect(isTrialExpired({ trial_ends_at: found?.trialEndsAt })).toBe(false);
  });
});

// The migration file itself. Nothing else in the repo asserts its contents, so
// a dropped backfill or a renumbered file would ship unnoticed — and the
// backfill is the entire grandfathering guarantee.
describe('0010 trial-clock migration file', () => {
  // Read via `import.meta.dirname` inside a HOOK, deliberately not via
  // `new URL(..., import.meta.url)`: under vitest 3 `import.meta.url` resolves
  // to the Vite dev-server origin (`http://localhost:3000/...`), so readFile
  // rejects it with "The URL must be of scheme file". `import.meta.dirname` is
  // the real filesystem path here. (The sibling suites' URL form survives only
  // because they swallow the failure into a fallback DDL path — silently, which
  // is exactly what this block must not do.)
  let migrationSql = '';
  beforeAll(async () => {
    migrationSql = await readFile(
      path.join(import.meta.dirname, '../../../gateway/drizzle/0010_accounts_trial_ends.sql'),
      'utf8',
    );
  });

  it('adds the column additively and is safe to re-run', () => {
    expect(migrationSql).toContain(
      'ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "trial_ends_at"',
    );
    expect(migrationSql).toContain('timestamptz');
    // Nullable, never NOT NULL: the fail-open rule requires an absent clock to
    // be representable, and a NOT NULL column would block the add on a live table.
    expect(migrationSql).not.toMatch(/trial_ends_at[^;]*NOT NULL/);
  });

  it('backfills existing rows with a fresh 3 days and documents the rule', () => {
    expect(migrationSql).toContain('UPDATE "accounts" SET "trial_ends_at" = now()');
    expect(migrationSql).toContain("interval '3 days'");
    expect(migrationSql).toContain('WHERE "trial_ends_at" IS NULL');
    // The grandfathering rule is a comment-only contract; assert it is stated.
    expect(migrationSql.toLowerCase()).toContain('grandfathering');
  });

  it('leaves created_at alone (it stays a pure signup stamp)', () => {
    expect(migrationSql).not.toMatch(/SET[^;]*created_at/);
    expect(migrationSql).not.toContain('DROP COLUMN');
  });
});
