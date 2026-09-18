// KI-021: the unconfigured stand-in must never be cached in globalThis.
//
// Reproduction-first. Before the fix, `getPool()` wrote the stand-in into the
// global holder exactly like a real pool, so a DATABASE_URL supplied later in
// the same process was ignored for the rest of that process's life — every
// route kept getting the stand-in and answered 500 'database not configured'
// against a database that was by then fully configured.
//
// The first test below fails on the old implementation (`configured` is the
// same object as `unconfigured`, and it still rejects with
// DatabaseNotConfiguredError). The second pins the property the fix must not
// break: once DATABASE_URL IS set, the real pool is cached and reused.
//
// No network I/O happens here: constructing `new Pool({ connectionString })`
// opens no sockets (clients are created lazily on the first query), and every
// `getPool()` result is cleared by `__resetPool()` between tests.
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseNotConfiguredError, __resetPool, getPool } from './pool';

const REAL_URL = 'postgresql://corvus:corvus_ci@127.0.0.1:5434/corvus_ci';

describe('getPool stand-in caching (KI-021)', () => {
  const previous = process.env.DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
    __resetPool();
  });

  it('does not cache the unconfigured stand-in, so a later DATABASE_URL is honored', async () => {
    __resetPool();
    delete process.env.DATABASE_URL;

    const unconfigured = getPool();
    await expect(unconfigured.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseNotConfiguredError);

    process.env.DATABASE_URL = REAL_URL;

    const configured = getPool();
    // Before the fix: `configured === unconfigured` and this identity fails.
    expect(configured).not.toBe(unconfigured);
    // The later URL was actually read (Pool keeps its config on `.options`).
    expect(configured.options.connectionString).toBe(REAL_URL);
  });

  it('still caches and reuses a real pool once DATABASE_URL is set', () => {
    __resetPool();
    process.env.DATABASE_URL = REAL_URL;

    const first = getPool();
    const second = getPool();
    expect(second).toBe(first);
    expect(first.options.connectionString).toBe(REAL_URL);
  });
});
