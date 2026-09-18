// Single shared Postgres pool for @corvus/web route handlers (V1-2, KI-002).
// Both interview routes and both auth routes key the same globalThis entry so
// they share one pool in production. `pg` resolves via the hoisted workspace
// install (declared; @corvus/web package.json is untouched).

import { Pool } from 'pg';

// Disposable CI container URL. This is a TEST fixture, never a production
// default: the hermetic suites inject a pool via `__setPool`, and the live-PG
// suites opt into this URL explicitly. A production boot without a real
// DATABASE_URL must fail fast (mirrors the gateway's BootError semantics).
export const TEST_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

const POOL_KEY = '__corvusPool';

type PoolHolder = { [key: string]: Pool | undefined };

function holder(): PoolHolder {
  return globalThis as unknown as PoolHolder;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('database not configured');
    this.name = 'DatabaseNotConfiguredError';
  }
}

// Resolved lazily (not at import time) so hermetic tests can inject a pool
// without setting DATABASE_URL. An empty or whitespace-only value is not a
// degraded mode — it is a process that cannot do its job, so it throws.
export function requireDatabaseUrl(): string {
  const url = (process.env.DATABASE_URL ?? '').trim();
  if (url.length === 0) throw new DatabaseNotConfiguredError();
  return url;
}

// A stand-in for the real pool when DATABASE_URL is missing. Every read/write
// entry point rejects with DatabaseNotConfiguredError, and the route handlers
// translate that to an honest 500. This is the "fail fast" boundary for a
// request-scoped runtime (the gateway fails at boot instead) — and crucially it
// removes the old `?? TEST_DATABASE_URL` default, so a misconfigured production
// process can never silently read or write the CI test database.
//
// Constructing it performs no I/O, so lazy holders (e.g. the interview progress
// store) can still be instantiated without a live database; the failure lands
// on first use, which for every route is the very first query.
function unconfiguredPool(): Pool {
  const reject = (): Promise<never> => Promise.reject(new DatabaseNotConfiguredError());
  return {
    query: reject,
    connect: reject,
    end: () => Promise.resolve(),
  } as unknown as Pool;
}

export function getPool(): Pool {
  const existing = holder()[POOL_KEY];
  if (existing) {
    return existing;
  }
  const url = (process.env.DATABASE_URL ?? '').trim();
  if (url.length === 0) {
    // KI-021: the stand-in is deliberately NOT cached. It is a stateless
    // "every query rejects" object, and caching it in globalThis would freeze
    // the unconfigured verdict for the life of the process — a DATABASE_URL
    // supplied later (env injection, test setup, a supervisor that sets it
    // after import) would be ignored and every route would keep answering 500
    // 'database not configured' against a live database. Only a real pool is
    // a cacheable singleton; an unconfigured process re-checks the env on
    // every call and fails fast on the first query either way.
    return unconfiguredPool();
  }
  const pool = new Pool({ connectionString: url });
  holder()[POOL_KEY] = pool;
  return pool;
}

export function __setPool(pool: Pool): void {
  holder()[POOL_KEY] = pool;
}

export function __resetPool(): void {
  holder()[POOL_KEY] = undefined;
}

// KI-021: the db module's single import surface — routes get the pool and the
// shared error mapping from here. Re-exported (not redefined) so the helper
// stays dependency-free and unit-testable in isolation. The `map-db-error.ts`
// <-> `pool.ts` cycle is intentional and safe: `DatabaseNotConfiguredError` is
// only read inside `mapDbError`'s body, at call time, never at module load.
export { mapDbError, type DbErrorResponse } from './map-db-error';
