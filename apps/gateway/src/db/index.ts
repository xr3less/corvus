import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export * from './schema.js';
export * from './v11.js';
export * from './v12.js';
export * from './v13.js';
export * from './guilds.js';
export * from './audit-events.js';
export * from './builder-runs.js';

export type GatewayDb = NodePgDatabase<typeof schema>;

export interface GatewayDbHandle {
  db: GatewayDb;
  pool: Pool;
}

// Creates a Postgres-backed Drizzle client. The connection string comes from
// the environment only — never hardcoded, never committed.
export function createDb(connectionString?: string): GatewayDbHandle {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
