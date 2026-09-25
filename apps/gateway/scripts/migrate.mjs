// Wave 0 migration runner: applies apps/gateway/drizzle/*.sql in filename order
// and journals each applied file (filename + sha256) in public.schema_migrations.
// Forward-only: a checksum mismatch on a journaled file is a hard fail.
// Usage: DATABASE_URL=<url> node apps/gateway/scripts/migrate.mjs [--check]
// (--check = verify-only: exit non-zero when any file is pending.)
/* global process:readonly, console:readonly, URL:readonly */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const DRIZZLE_DIR = fileURLToPath(new URL('../drizzle/', import.meta.url));
const SEPARATOR = '--> statement-breakpoint';
const LOCK_KEY = 'corvus-migrate';
const CHECK_ONLY = process.argv.includes('--check');

const fail = (msg) => {
  console.error(`migrate: FATAL: ${msg}`);
  process.exit(1);
};

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const readJournal = async (db) => {
  const { rows } = await db.query('SELECT filename, checksum FROM public.schema_migrations');
  return new Map(rows.map((r) => [r.filename, r.checksum]));
};

const validateChecksums = (files, journaled) => {
  const onDisk = new Set(files.map((f) => f.name));
  for (const name of journaled.keys()) {
    if (!onDisk.has(name)) {
      fail(
        `journaled file ${name} is missing from the migrations directory — ` +
          `migrations are forward-only; never delete or rename an applied file.`,
      );
    }
  }
  for (const f of files) {
    const known = journaled.get(f.name);
    if (known !== undefined && known !== f.checksum) {
      fail(
        `checksum mismatch for journaled file ${f.name} — migrations are forward-only; ` +
          `never edit an applied file.`,
      );
    }
  }
};

const applyFile = async (db, f) => {
  const statements = f.sql
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    await db.query('BEGIN');
    let n = 0;
    for (const stmt of statements) {
      n += 1;
      if (/\bCONCURRENTLY\b/i.test(stmt)) {
        throw new Error(
          `statement ${n} uses CONCURRENTLY (non-transactional) — not supported by the runner`,
        );
      }
      try {
        await db.query(stmt);
      } catch (err) {
        throw new Error(`statement ${n} failed: ${err.message}`);
      }
    }
    await db.query('INSERT INTO public.schema_migrations(filename, checksum) VALUES ($1, $2)', [
      f.name,
      f.checksum,
    ]);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    fail(`applying ${f.name}: ${err.message}`);
  }
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('DATABASE_URL is not set. Refusing to guess a port — export DATABASE_URL explicitly.');
  }
  const entries = (await readdir(DRIZZLE_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (entries.length === 0) fail(`no .sql files found in ${DRIZZLE_DIR}`);
  const files = [];
  for (const name of entries) {
    const sql = await readFile(path.join(DRIZZLE_DIR, name), 'utf8');
    files.push({ name, sql, checksum: sha256(sql) });
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = await pool.connect();
  try {
    await db.query(
      `CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const journaled = await readJournal(db);
    validateChecksums(files, journaled);
    const pending = files.filter((f) => !journaled.has(f.name));
    if (CHECK_ONLY) {
      if (pending.length > 0) {
        fail(`pending migrations: ${pending.map((f) => f.name).join(', ')}`);
      }
      console.log(`migrate: OK — ${files.length} files applied, journal clean.`);
      return;
    }
    if (pending.length === 0) {
      console.log(`migrate: OK — nothing to do (${files.length} files already journaled).`);
      return;
    }
    await db.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    try {
      // Re-read under the lock so concurrent invocations serialize honestly.
      const locked = await readJournal(db);
      validateChecksums(files, locked);
      let applied = 0;
      for (const f of files) {
        if (locked.has(f.name)) continue;
        await applyFile(db, f);
        locked.set(f.name, f.checksum);
        applied += 1;
        console.log(`migrate: applied ${f.name}`);
      }
      console.log(`migrate: OK — applied ${applied} file(s).`);
    } finally {
      await db.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
    }
  } finally {
    db.release();
    await pool.end();
  }
};

main().catch((err) => fail(err.message ?? String(err)));
