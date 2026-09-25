// Contract + live tests for 0011_credit_ledger_subscriptions.sql.
//
// Leg 1 (no DB): the Drizzle catalog (v11.ts) must agree with the shipped SQL
// text and with the locked contract in the overnight money-harness SPEC —
// column-for-column, plus the re-run safety claim the file's header makes.
//
// Leg 2 (real Postgres): applies 0001/0002/0008/0009/0010/0011 to an empty
// scratch schema, then proves by behaviour what the header only claims —
// (a) re-running 0011 does NOT re-arm the trial clock, (b) re-running 0010
// DOES (the hazard the header warns about), (c) the ledger's partial unique
// index makes a double-counted attempt a no-op while leaving NULL-attempt rows
// alone, (d) events and subscriptions are replay-safe. Loud skip when no
// Postgres is reachable — recorded, never faked green (L-008/L-009).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { creditLedger, subscriptions, webhookReceipts } from '../v11.js';

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', '..', 'drizzle');
const readMigration = (file: string): string => readFileSync(join(drizzleDir, file), 'utf8');

const sql = readMigration('0011_credit_ledger_subscriptions.sql');
const sql0010 = readMigration('0010_accounts_trial_ends.sql');

const dbColumnNames = (table: Parameters<typeof getTableColumns>[0]): string[] =>
  Object.values(getTableColumns(table))
    .map((c) => c.name)
    .sort();

// Comment lines are not SQL: strip them so the header prose (which quotes the
// 0010 UPDATE it warns about) can never be mistaken for a statement here.
const migrationStatements = (text: string): string[] =>
  text
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

const statements = migrationStatements(sql);

/** The `WHERE …` tail of a named partial index, without the statement's `;`. */
function partialIndexWhere(text: string, indexName: string): string {
  const statement = migrationStatements(text).find((s) => s.includes(indexName));
  if (statement === undefined) {
    throw new Error(`no statement in this migration creates the index ${indexName}`);
  }
  return statement.split(' WHERE ')[1].trim().replace(/;$/, '');
}

describe('0011 billing contract: credit_ledger', () => {
  it('maps to the credit_ledger table', () => {
    expect(getTableName(creditLedger)).toBe('credit_ledger');
  });

  it('declares the SPEC columns with exact DB names', () => {
    expect(dbColumnNames(creditLedger)).toEqual([
      'account_id',
      'amount_cr',
      'attempt',
      'created_at',
      'id',
      'meta',
      'reason',
      'ref_id',
    ]);
    for (const name of dbColumnNames(creditLedger)) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('marks money columns NOT NULL and links ref/attempt nullable', () => {
    const c = getTableColumns(creditLedger);
    expect(c.accountId.notNull).toBe(true);
    expect(c.reason.notNull).toBe(true);
    // Signed credits — no default: a writer must state the sign explicitly.
    expect(c.amountCr.notNull).toBe(true);
    expect(c.amountCr.hasDefault).toBe(false);
    expect(c.meta.notNull).toBe(true);
    expect(c.createdAt.notNull).toBe(true);
    // Nullable by design: grants carry no attempt, webhook rows carry no uuid ref.
    expect(c.refId.notNull).toBe(false);
    expect(c.attempt.notNull).toBe(false);
  });

  it('migration carries FK cascade + defaults + both indexes', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "credit_ledger"');
    expect(sql).toContain(
      '"account_id" uuid NOT NULL REFERENCES "accounts" ("id") ON DELETE CASCADE',
    );
    expect(sql).toContain('"amount_cr" numeric NOT NULL');
    expect(sql).toContain(`"meta" jsonb NOT NULL DEFAULT '{}'::jsonb`);
    expect(sql).toContain('"created_at" timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "credit_ledger_account_created_idx" ON "credit_ledger" ("account_id", "created_at")',
    );
  });

  it('carries the partial unique (ref_id, reason, attempt) mirroring 0009', () => {
    const partial =
      'CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_ref_reason_attempt_uidx" ON "credit_ledger" ("ref_id", "reason", "attempt") WHERE "ref_id" IS NOT NULL AND "attempt" IS NOT NULL';
    expect(sql).toContain(partial);
    // Same WHERE clause as the 0009 backstop it mirrors — not a lookalike.
    expect(partialIndexWhere(sql, 'credit_ledger_ref_reason_attempt_uidx')).toBe(
      partialIndexWhere(
        readMigration('0009_ai_spend_attempt.sql'),
        'ai_spend_ref_reason_attempt_uidx',
      ),
    );
  });
});

describe('0011 billing contract: subscriptions', () => {
  it('maps to the subscriptions table, keyed by account_id', () => {
    expect(getTableName(subscriptions)).toBe('subscriptions');
    expect(dbColumnNames(subscriptions)).toEqual([
      'account_id',
      'creem_subscription_id',
      'status',
      'tier',
      'updated_at',
    ]);
    const c = getTableColumns(subscriptions);
    expect(c.accountId.primary).toBe(true);
    expect(c.tier.notNull).toBe(true);
    expect(c.status.notNull).toBe(true);
    expect(c.updatedAt.notNull).toBe(true);
    expect(c.creemSubscriptionId.notNull).toBe(false);
  });

  it('migration carries the PK, FK cascade and the partial subscription-id unique', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "subscriptions"');
    expect(sql).toContain(
      '"account_id" uuid PRIMARY KEY REFERENCES "accounts" ("id") ON DELETE CASCADE',
    );
    expect(sql).toContain(`"tier" text NOT NULL DEFAULT 'trial'`);
    expect(sql).toContain('"status" text NOT NULL');
    expect(sql).toContain('"updated_at" timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_creem_subscription_id_uidx" ON "subscriptions" ("creem_subscription_id") WHERE "creem_subscription_id" IS NOT NULL',
    );
  });
});

describe('0011 billing contract: webhook_receipts', () => {
  it('maps to the webhook_receipts table, keyed by the provider event id', () => {
    expect(getTableName(webhookReceipts)).toBe('webhook_receipts');
    expect(dbColumnNames(webhookReceipts)).toEqual([
      'event_id',
      'payload_hash',
      'received_at',
      'type',
    ]);
    const c = getTableColumns(webhookReceipts);
    // text, not uuid: Creem ids are strings ("evt_…"); the PK is the replay guard.
    expect(c.eventId.primary).toBe(true);
    expect(c.eventId.columnType).toBe('PgText');
    expect(c.type.notNull).toBe(true);
    expect(c.payloadHash.notNull).toBe(true);
    expect(c.receivedAt.notNull).toBe(true);
  });

  it('migration carries the PK and the received_at index', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "webhook_receipts"');
    expect(sql).toContain('"event_id" text PRIMARY KEY');
    expect(sql).toContain('"payload_hash" text NOT NULL');
    expect(sql).toContain('"received_at" timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "webhook_receipts_received_at_idx" ON "webhook_receipts" ("received_at")',
    );
  });
});

describe('0011 forward-only safety', () => {
  it('is re-run safe: every statement is an idempotent CREATE TABLE/INDEX', () => {
    // A verb allow-list, not a keyword deny-list: any DML or DDL this migration
    // is not allowed to contain fails here, without tripping over legitimate
    // fragments like the "ON DELETE CASCADE" on the FK clauses.
    for (const statement of statements) {
      expect(statement).toMatch(/^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS /);
    }
    // 3 tables + 4 indexes, so a silently dropped "IF NOT EXISTS" also fails here.
    expect(statements.length).toBe(7);
  });

  it('never touches the trial clock — accounts is only an FK target, never a write', () => {
    // The trial clock may only be NAMED (in the warning comment), never touched:
    // every line mentioning it must be a comment, and no statement may contain it.
    const namedLines = sql.split('\n').filter((line) => line.includes('trial_ends_at'));
    expect(namedLines.length).toBeGreaterThan(0);
    for (const line of namedLines) {
      expect(line.trimStart().startsWith('--')).toBe(true);
    }
    for (const statement of statements) {
      expect(statement).not.toContain('trial_ends_at');
    }
    const touchingAccounts = statements.filter((s) => s.includes('"accounts"'));
    // Exactly the two child tables' FK clauses — nothing else names accounts.
    expect(touchingAccounts).toHaveLength(2);
    for (const statement of touchingAccounts) {
      expect(statement).toMatch(/^CREATE TABLE IF NOT EXISTS /);
      expect(statement).toContain('ON DELETE CASCADE');
    }
  });

  it('warns that re-running 0010 re-arms the trial, and 0010 still carries the UPDATE', () => {
    expect(sql).toContain('NEVER RE-RUN 0010');
    expect(sql).toContain('RE-ARMS');
    // The warning names the real statement, verbatim, as a commented-out copy.
    expect(sql).toContain(
      `--   UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days'\n--    WHERE "trial_ends_at" IS NULL;`,
    );
    // …and the warned-about statement really is live in 0010 (so the warning is
    // about that file, not a stale story).
    expect(
      migrationStatements(sql0010).some((s) =>
        s.startsWith('UPDATE "accounts" SET "trial_ends_at"'),
      ),
    ).toBe(true);
  });

  it('leaves 0008/0009/0010 to their own migrations (no duplicated DDL here)', () => {
    expect(sql).not.toContain('ai_spend');
    expect(sql).not.toContain('ADD COLUMN');
    for (const sibling of ['0008_accounts_tier.sql', '0009_ai_spend_attempt.sql']) {
      expect(readMigration(sibling)).toContain('IF NOT EXISTS');
    }
  });
});

// ---------------------------------------------------------------------------
// Live leg. Applies the real migration files to a scratch schema — no box, no
// prod, dropped at the end. Loud-skip when Postgres is unreachable.
// ---------------------------------------------------------------------------

const LIVE_FALLBACK_DB_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

function resolveLiveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return LIVE_FALLBACK_DB_URL;
}

const liveUrl = resolveLiveDatabaseUrl();

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const probe = new Pool({ connectionString: liveUrl, connectionTimeoutMillis: 3000 });
  try {
    await probe.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'connection failed' };
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const probe = await probeDatabase();
if (!probe.ok) {
  console.warn(
    `[0011-billing.test] LOUD SKIP: Postgres unreachable at the configured URL — ${probe.reason}. ` +
      'Start the CI-identical container (postgres:17) or set TEST_DATABASE_URL/DATABASE_URL. ' +
      'Skipping loudly, not failing, and NOT claiming green.',
  );
}

const applyMigration = async (pool: Pool, file: string): Promise<void> => {
  const statements = readMigration(file)
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await pool.query(statement);
  }
};

describe.skipIf(!probe.ok)('0011 billing migration (real Postgres)', () => {
  it('is re-runnable, never re-arms the trial, and enforces the ledger/webhook guards', async () => {
    const schema = `billing_0011_${process.pid}_${Date.now()}`;
    // max:1 plus `options: -c search_path=` binds every backend of the pool to
    // the scratch schema (a session SET would be lost on reconnect).
    const pool = new Pool({
      connectionString: liveUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    });
    try {
      const control = new Pool({ connectionString: liveUrl, max: 1 });
      await control.query(`CREATE SCHEMA "${schema}"`);
      await control.end().catch(() => undefined);

      // 0008/0009 need accounts (0002); 0011's FK needs accounts too. Only the
      // files this migration actually depends on are applied, in number order.
      for (const file of [
        '0001_init.sql',
        '0002_v11.sql',
        '0003_v12.sql',
        '0008_accounts_tier.sql',
        '0009_ai_spend_attempt.sql',
        '0010_accounts_trial_ends.sql',
      ]) {
        await applyMigration(pool, file);
      }
      // Guard against a false green: 0009 must really have added its column, or
      // the "0011 is re-runnable" claim below would be tested against a schema
      // that never had the 0009 backstop to begin with.
      const attemptCol = await pool.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'ai_spend' AND column_name = 'attempt'`,
        [schema],
      );
      expect(Number(attemptCol.rows[0].n)).toBe(1);

      const account = await pool.query<{ id: string }>(
        'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
        [`billing-0011-${randomUUID()}`],
      );
      const accountId = account.rows[0].id;
      // 0010 ran before this row existed, so the clock starts NULL ("no clock").
      const before = await pool.query<{ trial_ends_at: Date | null; tier: string }>(
        'SELECT trial_ends_at, tier FROM accounts WHERE id = $1',
        [accountId],
      );
      expect(before.rows[0].trial_ends_at).toBeNull();

      // Apply 0011 twice — the second run happens while a row exists.
      await applyMigration(pool, '0011_credit_ledger_subscriptions.sql');
      await applyMigration(pool, '0011_credit_ledger_subscriptions.sql');

      const after = await pool.query<{ trial_ends_at: Date | null; tier: string }>(
        'SELECT trial_ends_at, tier FROM accounts WHERE id = $1',
        [accountId],
      );
      expect(after.rows[0].trial_ends_at).toBeNull();
      expect(after.rows[0].tier).toBe('trial');

      // No backfill: the new tables start empty.
      for (const table of ['credit_ledger', 'subscriptions', 'webhook_receipts']) {
        const counted = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`);
        expect(Number(counted.rows[0].n)).toBe(0);
      }

      // (b) The hazard is real: re-running 0010 now DOES stamp the clock. This
      // is the behaviour 0011's header warns about, demonstrated, not asserted.
      await applyMigration(pool, '0010_accounts_trial_ends.sql');
      const armed = await pool.query<{ trial_ends_at: Date | null }>(
        'SELECT trial_ends_at FROM accounts WHERE id = $1',
        [accountId],
      );
      expect(armed.rows[0].trial_ends_at).not.toBeNull();

      // Signed credits survive the round trip exactly (numeric, never float).
      await pool.query(
        `INSERT INTO credit_ledger (account_id, reason, amount_cr, meta)
         VALUES ($1, 'trial_grant', 150.125, '{"grant":"trial"}'::jsonb)`,
        [accountId],
      );
      await pool.query(
        `INSERT INTO credit_ledger (account_id, reason, amount_cr)
         VALUES ($1, 'burn:builder', -3.5)`,
        [accountId],
      );
      const amounts = await pool.query<{ amount_cr: string; meta: unknown }>(
        'SELECT amount_cr, meta FROM credit_ledger WHERE account_id = $1 ORDER BY amount_cr',
        [accountId],
      );
      expect(amounts.rows.map((r) => r.amount_cr)).toEqual(['-3.5', '150.125']);
      // meta defaults to an empty object when the writer omits it.
      expect(amounts.rows[0].meta).toEqual({});
      expect(amounts.rows[1].meta).toEqual({ grant: 'trial' });

      // Partial unique: the same (ref_id, reason, attempt) triple is a no-op.
      const refId = randomUUID();
      await pool.query(
        `INSERT INTO credit_ledger (account_id, ref_id, reason, attempt, amount_cr)
         VALUES ($1, $2, 'burn:builder', 1, -2)`,
        [accountId, refId],
      );
      await expect(
        pool.query(
          `INSERT INTO credit_ledger (account_id, ref_id, reason, attempt, amount_cr)
           VALUES ($1, $2, 'burn:builder', 1, -2)`,
          [accountId, refId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      // NULL-attempt rows share (ref_id, reason) freely — the index skips them.
      for (let i = 0; i < 2; i += 1) {
        await pool.query(
          `INSERT INTO credit_ledger (account_id, ref_id, reason, amount_cr)
           VALUES ($1, $2, 'monthly_grant', 30)`,
          [accountId, refId],
        );
      }
      const counted = await pool.query<{ n: string }>(
        'SELECT COUNT(*) AS n FROM credit_ledger WHERE ref_id = $1',
        [refId],
      );
      expect(Number(counted.rows[0].n)).toBe(3);

      // Subscription upsert is idempotent, and one Creem id cannot bind twice.
      for (const status of ['active', 'past_due']) {
        await pool.query(
          `INSERT INTO subscriptions (account_id, tier, creem_subscription_id, status)
           VALUES ($1, 'pro', 'sub_test_0011', $2)
           ON CONFLICT (account_id) DO UPDATE
             SET tier = EXCLUDED.tier, status = EXCLUDED.status, updated_at = now()`,
          [accountId, status],
        );
      }
      const subs = await pool.query<{ tier: string; status: string }>(
        'SELECT tier, status FROM subscriptions WHERE account_id = $1',
        [accountId],
      );
      expect(subs.rows).toEqual([{ tier: 'pro', status: 'past_due' }]);

      const other = await pool.query<{ id: string }>(
        'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
        [`billing-0011-other-${randomUUID()}`],
      );
      await expect(
        pool.query(
          `INSERT INTO subscriptions (account_id, tier, creem_subscription_id, status)
           VALUES ($1, 'pro', 'sub_test_0011', 'active')`,
          [other.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23505' });

      // Webhook replay: the second insert of one event id is the no-op.
      const eventId = `evt_test_${randomUUID()}`;
      await pool.query(
        `INSERT INTO webhook_receipts (event_id, type, payload_hash)
         VALUES ($1, 'checkout.completed', $2)`,
        [eventId, 'hash-of-raw-body'],
      );
      await expect(
        pool.query(
          `INSERT INTO webhook_receipts (event_id, type, payload_hash)
           VALUES ($1, 'checkout.completed', $2)`,
          [eventId, 'hash-of-raw-body'],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      const receipts = await pool.query<{ n: string }>(
        'SELECT COUNT(*) AS n FROM webhook_receipts',
      );
      expect(Number(receipts.rows[0].n)).toBe(1);

      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end().catch(() => undefined);
    }
  }, 60_000);
});
