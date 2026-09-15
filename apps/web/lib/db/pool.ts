// Single shared Postgres pool for @corvus/web route handlers (V1-2, KI-002).
// Both interview routes and both auth routes key the same globalThis entry so
// they share one pool in production. `pg` resolves via the hoisted workspace
// install (declared; @corvus/web package.json is untouched).

import { Pool } from 'pg';

export const TEST_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

const POOL_KEY = '__corvusPool';

type PoolHolder = { [key: string]: Pool | undefined };

function holder(): PoolHolder {
  return globalThis as unknown as PoolHolder;
}

export function getPool(): Pool {
  let pool = holder()[POOL_KEY];
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL ?? TEST_DATABASE_URL });
    holder()[POOL_KEY] = pool;
  }
  return pool;
}

export function __setPool(pool: Pool): void {
  holder()[POOL_KEY] = pool;
}
