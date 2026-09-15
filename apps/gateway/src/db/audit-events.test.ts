import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents } from './audit-events.js';

// No-DB contract test: the Drizzle definition must agree with
// 06_data_model.md section 2 and with drizzle/0006_audit_events.sql
// column-for-column. No live database required.
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', '..', 'drizzle', '0006_audit_events.sql'), 'utf8');

describe('gateway db audit_events (06_data_model section 2)', () => {
  it('uses the exact SPEC table name', () => {
    expect(getTableName(auditEvents)).toBe('audit_events');
  });

  it('defines every SPEC audit_events column in snake_case', () => {
    const names = Object.values(getTableColumns(auditEvents)).map(
      (c) => (c as { name: string }).name,
    );
    expect([...names].sort()).toEqual(
      ['account_id', 'action', 'actor', 'bot_id', 'created_at', 'detail', 'id'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('marks account_id/bot_id nullable and the event fields NOT NULL', () => {
    const t = getTableColumns(auditEvents);
    expect(t.accountId.notNull).toBe(false);
    expect(t.botId.notNull).toBe(false);
    expect(t.actor.notNull).toBe(true);
    expect(t.action.notNull).toBe(true);
    expect(t.detail.notNull).toBe(true);
    expect(t.createdAt.notNull).toBe(true);
  });

  it('migration creates the table with PK default + now() default + bot_id index', () => {
    expect(sql).toContain('"audit_events"');
    expect(sql).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sql).toContain('"account_id" uuid');
    expect(sql).toContain('"bot_id" uuid');
    expect(sql).toContain('"actor" text NOT NULL');
    expect(sql).toContain('"action" text NOT NULL');
    expect(sql).toContain('"detail" jsonb NOT NULL');
    expect(sql).toContain('"created_at" timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain('"audit_events_bot_id_idx"');
    expect(sql).toContain('ON "audit_events" ("bot_id")');
    expect(sql).toContain('--> statement-breakpoint');
    expect(sql).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/i);
  });
});

// ---------------------------------------------------------------------------
// Live leg: apply the migration on a fresh, empty schema (proving it has no
// dependency on other tables) and round-trip a row through insert + select.
// Loud-skip when Postgres is unreachable — a silent skip is forbidden and a
// hook throw must never turn "no DB here" into a red suite (D-030).
// ---------------------------------------------------------------------------

const FALLBACK_DB_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return FALLBACK_DB_URL;
}

const DATABASE_URL = resolveDatabaseUrl();
const SCHEMA_NAME = `audit_events_test_${process.pid}_${Date.now()}`;
const pool = new Pool({ connectionString: DATABASE_URL });
let PG_UNREACHABLE = false;
let client: PoolClient | null = null;

describe('audit_events migration (real Postgres)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
    } catch {
      PG_UNREACHABLE = true;
      console.warn(
        '[audit-events] SKIP: no Postgres reachable at the configured URL — ' +
          'start the CI-identical container (postgres:17, see .github/workflows/ci.yml) ' +
          'or set DATABASE_URL. Skipping loudly, not failing.',
      );
      return;
    }
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${SCHEMA_NAME}"`);
    await client.query(`SET search_path TO "${SCHEMA_NAME}"`);
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      await client.query(statement);
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

  it('applies on an empty schema and round-trips an inserted row', async (ctx) => {
    if (PG_UNREACHABLE || client === null) {
      ctx.skip();
      return;
    }
    const c = client;
    const botId = '00000000-0000-4000-8000-000000000001';
    const inserted = await c.query<{
      id: string;
      action: string;
      version: string;
      created_at: Date;
    }>(
      `INSERT INTO audit_events (account_id, bot_id, actor, action, detail)
       VALUES (gen_random_uuid(), $1, 'owner:123', 'publish', $2::jsonb)
       RETURNING id, action, detail->>'version' AS version, created_at`,
      [botId, JSON.stringify({ version: 3, preflight: 'unscanned' })],
    );
    expect(inserted.rowCount).toBe(1);
    const row = inserted.rows[0];
    expect(row).toBeDefined();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.action).toBe('publish');
    expect(row?.version).toBe('3');
    expect(row?.created_at).toBeInstanceOf(Date);

    // The rollback reader's lookup: bot_id + action IN (publish, rollback).
    const found = await c.query<{ version: string }>(
      `SELECT detail->>'version' AS version FROM audit_events
       WHERE bot_id = $1 AND action IN ('publish', 'rollback')`,
      [botId],
    );
    expect(found.rows.map((r) => r.version)).toEqual(['3']);
  });

  it('accepts a system event with null account_id/bot_id', async (ctx) => {
    if (PG_UNREACHABLE || client === null) {
      ctx.skip();
      return;
    }
    const c = client;
    const inserted = await c.query<{ account_id: string | null; bot_id: string | null }>(
      `INSERT INTO audit_events (account_id, bot_id, actor, action, detail)
       VALUES (NULL, NULL, 'system', 'grant', '{}'::jsonb)
       RETURNING account_id, bot_id`,
    );
    expect(inserted.rows[0]?.account_id).toBeNull();
    expect(inserted.rows[0]?.bot_id).toBeNull();
  });
});
