// Launch-blocker tests (SPEC section 5) — the two promises the product stands on:
//
// (A) kill -9 loses zero acknowledged XP: a real child process streams awaited
//     Postgres writes and prints an ACK only after each commit; the parent
//     SIGKILLs it mid-storm and every acked write must be present with exact
//     values. Unacked (in-flight at kill) writes may be missing — that is fine.
// (B) one crashed bot never touches its siblings and recovery is fast: a login
//     rejection AND a mid-life emit error each quarantine only the failing bot;
//     re-addBot recovers in wall-clock <30s.
// (C) storm + clean shutdown: 10,000 recordXp across two bots, then shutdown()
//     flushes and every member sum matches exactly.
//
// The PG leg uses the REAL test database (no mocks for durability — the point
// is the real path). Bot ids / guild ids / member ids are synthetic constants;
// member content is never logged.

import { fork, type ChildProcess } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createGateway,
  type GatewayClient,
  type GatewayLogger,
  type LogRecord,
} from './gateway.js';
import { createStore } from './store/index.js';

// ---------------------------------------------------------------------------
// Live test database: explicit env wins, CI-identical container as fallback.
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

// Gate: the suite needs a REACHABLE Postgres (fallback container locally,
// DATABASE_URL/CI service in CI). Reachability is probed in beforeAll; when
// unreachable the suite skips LOUDLY — a silent skip is forbidden, and a hook
// throw must never turn "no DB here" into a red suite (D-030: local gates
// stay green without the container).
let PG_UNREACHABLE = false;

async function probeDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

const pool = new Pool({ connectionString: DATABASE_URL });

// Worker scripts are generated at runtime into scratch space only — never
// committed, never in the repo. The win32 path is the orchestrator-owned
// scratch dir from the brief; elsewhere (CI/Linux) use the OS tmp dir so the
// same file still runs where that Windows path cannot exist.
const SCRATCH_DIR =
  process.platform === 'win32'
    ? 'C:/Users/xr3less/AppData/Local/Temp/opencode/wave-c-blockers'
    : join(tmpdir(), 'wave-c-blockers');

const GATEWAY_PKG_JSON = fileURLToPath(new URL('../package.json', import.meta.url));

// Synthetic constants — never real tokens, never real user content.
const LB_TOKEN_1 = 'lb-synthetic-token-alpha';
const LB_TOKEN_2 = 'lb-synthetic-token-beta';

// ---------------------------------------------------------------------------
// Shared helpers + fakes (same pattern as gateway.test.ts — never real logins)
// ---------------------------------------------------------------------------

async function registerBotRow(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO bots (account_id, name, token_cipher, status) ' +
      "VALUES (gen_random_uuid(), $1, $2, 'live') RETURNING id",
    [name, Buffer.from('launch-blocker-synthetic')],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('registerBotRow: INSERT returned no id');
  }
  return row.id;
}

class FakeClient implements GatewayClient {
  destroyed = false;
  loggedIn = false;
  loginShouldThrow?: unknown;
  messagesReceived = 0;
  private listeners = new Map<string, Array<(error: unknown) => void>>();

  on(event: string, listener: (error: unknown) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
  }

  async login(): Promise<void> {
    if (this.loginShouldThrow !== undefined) {
      throw this.loginShouldThrow;
    }
    this.loggedIn = true;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? []) {
      listener(error);
    }
  }

  emitMessage(): void {
    this.messagesReceived += 1;
  }
}

class FakeLogger implements GatewayLogger {
  records: LogRecord[] = [];
  lines: string[] = [];

  info(record: LogRecord): void {
    this.capture(record);
  }

  error(record: LogRecord): void {
    this.capture(record);
  }

  private capture(record: LogRecord): void {
    this.records.push(record);
    this.lines.push(JSON.stringify(record));
  }
}

function assertNoSecrets(logger: FakeLogger): void {
  expect(logger.lines.length).toBeGreaterThan(0);
  for (const line of logger.lines) {
    const parsed: unknown = JSON.parse(line);
    expect(typeof (parsed as { botId?: unknown }).botId).toBe('string');
    expect(line).not.toContain(LB_TOKEN_1);
    expect(line).not.toContain(LB_TOKEN_2);
  }
}

function quarantineLinesFor(logger: FakeLogger, botId: string): LogRecord[] {
  return logger.records.filter((r) => r.event === 'bot-quarantined' && r.botId === botId);
}

// Mixed deltas including negatives; period sum is nonzero so an expected sum
// of 0 can never hide a missing write behind getXp's empty-means-0 default.
function deltaFor(i: number): number {
  return ((i * 7) % 4) - 1;
}

// Worker source for test A. The worker awaits every upsert before printing its
// ACK with a SYNCHRONOUS fd write (no userspace buffering), so a received ACK
// line strictly implies the commit happened — SIGKILL can only truncate the
// tail of the line stream, never reorder or fake it. Each write targets a
// UNIQUE member row, so every acked write is independently verifiable and the
// kill-window hazard (commit durable but ACK lost) cannot alias one member's
// expectation onto another's.
function buildKillWorkerSource(): string {
  return [
    "import { createRequire } from 'node:module';",
    'import fs from ' + "'node:fs';",
    'const require = createRequire(process.env.LB_GATEWAY_PKG_JSON);',
    "const { Pool } = require('pg');",
    'const pool = new Pool({ connectionString: process.env.LB_DATABASE_URL });',
    'const botId = process.env.LB_BOT_ID;',
    'const guildId = process.env.LB_GUILD_ID;',
    'const total = Number(process.env.LB_TOTAL);',
    'const prefix = process.env.LB_MEMBER_PREFIX;',
    'function deltaFor(i) { return ((i * 7) % 4) - 1; }',
    'async function main() {',
    '  for (let i = 0; i < total; i++) {',
    "    const memberId = prefix + '-' + i;",
    '    const delta = deltaFor(i);',
    '    const result = await pool.query(',
    "      'INSERT INTO user_records (bot_id, guild_id, member_id, xp, updated_at) ' +",
    "      'VALUES ($1, $2, $3, $4, NOW()) ' +",
    "      'ON CONFLICT (bot_id, guild_id, member_id) ' +",
    "      'DO UPDATE SET xp = user_records.xp + EXCLUDED.xp, updated_at = NOW() ' +",
    "      'RETURNING xp',",
    '      [botId, guildId, memberId, delta]',
    '    );',
    "    fs.writeSync(1, 'ACK ' + memberId + ' ' + delta + ' ' + result.rows[0].xp + '\\n');",
    '  }',
    "  fs.writeSync(1, 'DONE\\n');",
    '  await pool.end();',
    '}',
    'main().catch((error) => {',
    "  fs.writeSync(2, 'WORKER-FAIL ' + (error && error.message ? error.message : String(error)) + '\\n');",
    '  pool.end().then(() => process.exit(1), () => process.exit(1));',
    '});',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Suite setup: run the shipped migration (idempotent), clean up afterwards.
//
// The CI job (.github/workflows/ci.yml) starts postgres:17 and runs `npm test`
// with NO migration step, so the database reaches this suite EMPTY. Two
// consequences are handled explicitly below:
//   1. `gen_random_uuid()` HAS been core since Postgres 13, so a fresh
//      postgres:17 satisfies the migration's DEFAULT expressions with no
//      pgcrypto at all (verified against postgres:17.11). The extension is
//      still requested first, defensively, so the suite keeps working on any
//      image where the function is only available via the contrib module.
//   2. The suite owns its schema: it applies 0001_init.sql (which creates the
//      ONLY two tables it touches, bots + user_records) and its cleanup
//      truncates exactly that same set. Migrations owned by other V1 specs
//      (spec_versions in 0002_v11.sql, guild_installs in 0005_guilds.sql) are
//      deliberately NOT applied here and therefore must NOT be truncated — an
//      empty CI DB has no such relations and naming one would red the suite in
//      afterAll.
// ---------------------------------------------------------------------------

// The ONLY tables this suite creates and writes (0001_init.sql), in FK-safe
// order for a single TRUNCATE ... CASCADE. Setup and cleanup share this one
// constant so the two sets can never drift apart again.
const SUITE_TABLES = ['user_records', 'bots'] as const;

// Extensions the migration's DEFAULT expressions depend on. CREATE EXTENSION is
// not reachable for the unprivileged CI role in every image, so a failure is
// tolerated: if another suite already enabled it, the migration still applies.
const REQUIRED_EXTENSIONS = ['pgcrypto'] as const;

function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe('launch blockers (real Postgres)', () => {
  beforeAll(async () => {
    if (!(await probeDatabase())) {
      PG_UNREACHABLE = true;
      console.warn(
        '[launch-blockers] SKIP: no Postgres reachable at the configured URL — ' +
          'start the CI-identical container (see .github/workflows/ci.yml) or set DATABASE_URL. ' +
          'Skipping loudly, not failing.',
      );
      return;
    }
    await mkdir(SCRATCH_DIR, { recursive: true });

    for (const extension of REQUIRED_EXTENSIONS) {
      try {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extension};`);
      } catch (error) {
        console.warn(
          `[launch-blockers] could not create extension ${extension} (insufficient privilege?); ` +
            'continuing — the migration below still needs it to exist. Cause:',
          error,
        );
      }
    }

    const migrationUrl = new URL('../drizzle/0001_init.sql', import.meta.url);
    const sql = await readFile(migrationUrl, 'utf8');
    for (const statement of splitStatements(sql)) {
      await pool.query(statement);
    }
  }, 60_000);

  afterAll(async () => {
    if (PG_UNREACHABLE) {
      try {
        await pool.end();
      } catch {
        // Unreachable from the start — nothing to close.
      }
      return;
    }
    // Truncate EXACTLY the tables beforeAll created (SUITE_TABLES), in one
    // statement so every FK is satisfied within the command. Naming a table
    // this suite never created (spec_versions, guild_installs) would throw
    // `relation does not exist` against the empty CI database.
    await pool.query(`TRUNCATE TABLE ${SUITE_TABLES.join(', ')} CASCADE;`);
    await pool.end();
  }, 60_000);

  it('A — SIGKILL loses zero acknowledged XP', { timeout: 120_000 }, async (ctx) => {
    if (PG_UNREACHABLE) {
      ctx.skip();
    }
    const store = createStore({ pool });
    const botId = await registerBotRow(`lb-kill-bot-${process.pid}`);
    const guildId = `lb-kill-guild-${process.pid}`;
    const prefix = `lb-kill-${process.pid}-${Date.now()}`;
    const TOTAL = 200;
    const KILL_AFTER_ACKS = 50;

    const workerPath = join(SCRATCH_DIR, `kill-worker-${process.pid}-${Date.now()}.mjs`);
    await writeFile(workerPath, buildKillWorkerSource(), 'utf8');

    const child: ChildProcess = fork(workerPath, [], {
      silent: true,
      env: {
        ...process.env,
        LB_DATABASE_URL: DATABASE_URL,
        LB_GATEWAY_PKG_JSON: GATEWAY_PKG_JSON,
        LB_BOT_ID: botId,
        LB_GUILD_ID: guildId,
        LB_TOTAL: String(TOTAL),
        LB_MEMBER_PREFIX: prefix,
      },
    });

    // acked: memberId -> exact acked xp. A complete ACK line implies commit
    // (worker awaits the upsert, then synchronously writes the line), so
    // every entry here MUST be present in Postgres after the kill.
    const acked = new Map<string, number>();
    let ackCount = 0;
    let finished = false;
    let killSent = false;
    let buffer = '';
    let stderrText = '';

    const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      child.on('exit', (code, signal) => {
        resolve({ code, signal });
      });
    });

    const stdout = child.stdout;
    if (stdout === null) {
      throw new Error('kill test: child stdout is not piped');
    }
    stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('ACK ')) {
          const parts = line.split(' ');
          if (parts.length === 4) {
            const member = parts[1];
            const xp = Number(parts[3]);
            if (member !== undefined && member.length > 0 && Number.isInteger(xp)) {
              acked.set(member, xp);
              ackCount += 1;
              if (ackCount >= KILL_AFTER_ACKS && !killSent) {
                killSent = child.kill('SIGKILL');
              }
            }
          }
        } else if (line === 'DONE') {
          finished = true;
        }
        nl = buffer.indexOf('\n');
      }
    });

    const stderr = child.stderr;
    if (stderr !== null) {
      stderr.on('data', (chunk: Buffer) => {
        stderrText += chunk.toString('utf8');
      });
    }

    const { code, signal } = await exitPromise;

    // The kill landed mid-storm: we saw enough acks to arm it, the child
    // never printed DONE, and it did not exit cleanly on its own.
    expect(killSent).toBe(true);
    expect(ackCount).toBeGreaterThanOrEqual(KILL_AFTER_ACKS);
    expect(finished).toBe(false);
    expect(stderrText).not.toContain('WORKER-FAIL');
    expect(code !== 0 || signal !== null).toBe(true);

    // Every acked write is present with its exact value. Writes that were
    // in-flight (unacked) at the moment of SIGKILL may be missing and that
    // is fine — they are not in this map by construction.
    expect(acked.size).toBeGreaterThanOrEqual(KILL_AFTER_ACKS);
    for (const [memberId, xp] of acked) {
      await expect(store.getXp({ botId, guildId, memberId })).resolves.toBe(xp);
    }
  });

  it('B1 — login rejection quarantines only the failing bot', { timeout: 60_000 }, async (ctx) => {
    if (PG_UNREACHABLE) {
      ctx.skip();
    }
    const clients = new Map<string, FakeClient>();
    const logger = new FakeLogger();
    const store = createStore({ pool });
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient();
        if (botId === 'lb-login-bad') {
          client.loginShouldThrow = new Error('invalid token');
        }
        clients.set(botId, client);
        return client;
      },
      store,
      logger,
    });

    await gateway.addBot({ id: 'lb-login-good', token: LB_TOKEN_1 });
    await expect(gateway.addBot({ id: 'lb-login-bad', token: LB_TOKEN_2 })).rejects.toThrow(
      'invalid token',
    );

    expect(gateway.status('lb-login-bad')).toBe('quarantined');
    expect(gateway.status('lb-login-good')).toBe('live');
    expect(clients.get('lb-login-good')?.destroyed).toBe(false);
    expect(clients.get('lb-login-bad')?.destroyed).toBe(true);

    // The sibling still receives events after the crash.
    clients.get('lb-login-good')?.emitMessage();
    expect(clients.get('lb-login-good')?.messagesReceived).toBe(1);

    // The quarantine is logged with the failing bot's id, never any token.
    expect(quarantineLinesFor(logger, 'lb-login-bad').length).toBeGreaterThanOrEqual(1);
    assertNoSecrets(logger);

    await gateway.shutdown();
  });

  it(
    'B2 — mid-life crash isolates the sibling and re-addBot recovers in <30s',
    { timeout: 60_000 },
    async (ctx) => {
      if (PG_UNREACHABLE) {
        ctx.skip();
      }
      const clients = new Map<string, FakeClient>();
      const logger = new FakeLogger();
      const store = createStore({ pool });
      const gateway = createGateway({
        createClient: (botId: string) => {
          const client = new FakeClient();
          clients.set(botId, client);
          return client;
        },
        store,
        logger,
      });

      await gateway.addBot({ id: 'lb-crash-1', token: LB_TOKEN_1 });
      await gateway.addBot({ id: 'lb-crash-2', token: LB_TOKEN_2 });

      clients.get('lb-crash-1')?.emitError(new Error('connection reset by peer'));
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(gateway.status('lb-crash-1')).toBe('quarantined');
      expect(gateway.status('lb-crash-2')).toBe('live');
      expect(clients.get('lb-crash-1')?.destroyed).toBe(true);
      expect(clients.get('lb-crash-2')?.destroyed).toBe(false);

      // The sibling keeps receiving events while its sibling is quarantined.
      clients.get('lb-crash-2')?.emitMessage();
      clients.get('lb-crash-2')?.emitMessage();
      expect(clients.get('lb-crash-2')?.messagesReceived).toBe(2);

      expect(quarantineLinesFor(logger, 'lb-crash-1')).toHaveLength(1);
      assertNoSecrets(logger);

      // Recovery: remove the quarantined entry, re-add — the factory hands out
      // a fresh healthy client. The <30s bound is the promise, not the speed.
      const startedAt = Date.now();
      await gateway.removeBot('lb-crash-1');
      await gateway.addBot({ id: 'lb-crash-1', token: LB_TOKEN_1 });
      const elapsedMs = Date.now() - startedAt;
      expect(gateway.status('lb-crash-1')).toBe('live');
      expect(elapsedMs).toBeLessThan(30_000);

      await gateway.shutdown();
    },
  );

  it(
    'C — 10k-XP storm then clean shutdown flushes everything',
    { timeout: 120_000 },
    async (ctx) => {
      if (PG_UNREACHABLE) {
        ctx.skip();
      }
      const store = createStore({ pool });
      const logger = new FakeLogger();
      const clients = new Map<string, FakeClient>();
      const gateway = createGateway({
        createClient: (botId: string) => {
          const client = new FakeClient();
          clients.set(botId, client);
          return client;
        },
        store,
        logger,
      });

      await gateway.addBot({ id: 'lb-storm-1', token: LB_TOKEN_1 });
      await gateway.addBot({ id: 'lb-storm-2', token: LB_TOKEN_2 });

      const run = `${process.pid}-${Date.now()}`;
      const botA = await registerBotRow(`lb-storm-a-${run}`);
      const botB = await registerBotRow(`lb-storm-b-${run}`);
      const guildId = `lb-storm-guild-${run}`;
      const WRITES_PER_MEMBER = 1250;
      const membersA = [`${run}-a-0`, `${run}-a-1`, `${run}-a-2`, `${run}-a-3`];
      const membersB = [`${run}-b-0`, `${run}-b-1`, `${run}-b-2`, `${run}-b-3`];

      const expected = new Map<string, { botId: string; sum: number }>();
      const tasks: Array<Promise<number>> = [];
      const plan = [
        { botId: botA, members: membersA },
        { botId: botB, members: membersB },
      ];
      for (const { botId, members } of plan) {
        for (const memberId of members) {
          let sum = 0;
          for (let i = 0; i < WRITES_PER_MEMBER; i++) {
            const delta = deltaFor(i);
            sum += delta;
            tasks.push(store.recordXp({ botId, guildId, memberId, delta }));
          }
          expected.set(memberId, { botId, sum });
        }
      }
      expect(tasks).toHaveLength(10_000);

      await Promise.all(tasks);

      // Clean shutdown must resolve (flush durability before disconnect) ...
      await gateway.shutdown();
      expect(gateway.botIds()).toEqual([]);

      // ... and every member sum must match exactly on fresh reads.
      expect(expected.size).toBe(8);
      for (const [memberId, { botId, sum }] of expected) {
        await expect(store.getXp({ botId, guildId, memberId })).resolves.toBe(sum);
      }
    },
  );
});
