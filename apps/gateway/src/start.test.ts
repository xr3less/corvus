// Boot entry tests (V1-3): the process must start the gateway AND the
// preflight worker together, and must refuse to start without a database.
//
// No Postgres, no Discord, no hooks that throw: the gateway factory, worker
// starter and pg Pool are mocked. The missing-URL guarantee is proven twice —
// once in-process (main() returns 1 without touching either dependency) and
// once by spawning the real entry file and asserting a non-zero exit.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createGateway: vi.fn(),
  createSupervisor: vi.fn(),
  startPreflightWorker: vi.fn(),
  startBuilderWorker: vi.fn(),
  poolEnd: vi.fn(async () => undefined),
  poolConstructed: 0,
}));

vi.mock('./gateway.js', () => ({ createGateway: mocks.createGateway }));

// start.ts imports the REAL createSupervisor; mock it like the workers so boot
// stays DB-free and the constructed supervisor can be asserted.
vi.mock('./supervisor/supervisor.js', () => ({
  createSupervisor: mocks.createSupervisor,
}));

vi.mock('./preflight/worker.js', () => ({
  FULL_PREFLIGHT_INTENTS: ['Guilds'],
  startPreflightWorker: mocks.startPreflightWorker,
}));

vi.mock('./db/builder-runs.js', () => ({
  startBuilderWorker: mocks.startBuilderWorker,
}));

vi.mock('pg', () => ({
  Pool: class Pool {
    constructor() {
      mocks.poolConstructed += 1;
    }
    end(): Promise<void> {
      return mocks.poolEnd();
    }
    // The supervisor's audit writer runs a drizzle insert over this pool; the
    // rejected promise drives the supervisor-audit-failed path under test.
    query(): Promise<never> {
      return Promise.reject(new Error('pg pool is mocked'));
    }
  },
}));

// createDiscordClient is never called in these tests (the gateway factory is
// mocked), but the module import must resolve.
vi.mock('discord.js', () => ({
  Client: class Client {},
  GatewayIntentBits: { Guilds: 1 },
}));

import { auditEvents, type NewAuditEvent } from './db/audit-events.js';
import { CryptoError, encryptToken } from './lib/crypto.js';
import { boot, handleShutdownSignal, main, restartBotFromVault } from './start.js';
import type { GatewayLogger, LogRecord } from './gateway.js';

const DB_URL = 'postgresql://corvus:supersecret@localhost:5432/corvus';

function makeGateway(): { shutdown: ReturnType<typeof vi.fn> } {
  return { shutdown: vi.fn(async () => undefined) };
}

function makeSupervisor(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    registerBot: vi.fn(),
    forget: vi.fn(),
    handleCrash: vi.fn(),
    handleHealthy: vi.fn(),
    quarantineBot: vi.fn(),
  };
}

function makeWorkerHandle(): { stop: ReturnType<typeof vi.fn> } {
  return { stop: vi.fn(async () => undefined) };
}

function captureStream(stream: NodeJS.WriteStream): { text: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(stream, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  });
  return { text: () => chunks.join(''), restore: () => spy.mockRestore() };
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolConstructed = 0;
  // The builder worker boots beside the preflight worker; default it to a
  // healthy handle so boot tests never open a real pg-boss connection.
  mocks.startBuilderWorker.mockResolvedValue(makeWorkerHandle());
  // boot always constructs a supervisor; default one so tests that don't care
  // still get a valid object.
  mocks.createSupervisor.mockReturnValue(makeSupervisor());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('boot', () => {
  it('starts the preflight worker once with DATABASE_URL, builds the gateway, and injects a supervisor', async () => {
    const gateway = makeGateway();
    const worker = makeWorkerHandle();
    const supervisor = makeSupervisor();
    mocks.createGateway.mockReturnValue(gateway);
    mocks.startPreflightWorker.mockResolvedValue(worker);
    mocks.createSupervisor.mockReturnValue(supervisor);

    const booted = await boot({ DATABASE_URL: DB_URL });

    expect(mocks.startPreflightWorker).toHaveBeenCalledTimes(1);
    expect(mocks.startPreflightWorker).toHaveBeenCalledWith(DB_URL);
    expect(mocks.startBuilderWorker).toHaveBeenCalledTimes(1);
    expect(mocks.startBuilderWorker).toHaveBeenCalledWith(DB_URL, expect.any(Function));
    expect(mocks.createGateway).toHaveBeenCalledTimes(1);
    // The supervisor is constructed with real callbacks and handed to the gateway.
    expect(mocks.createSupervisor).toHaveBeenCalledTimes(1);
    const supervisorDeps = mocks.createSupervisor.mock.calls[0]?.[0] as {
      quarantine: unknown;
      audit: unknown;
      restart: unknown;
    };
    expect(typeof supervisorDeps.quarantine).toBe('function');
    expect(typeof supervisorDeps.audit).toBe('function');
    expect(typeof supervisorDeps.restart).toBe('function');
    const gatewayOptions = mocks.createGateway.mock.calls[0]?.[0] as { supervisor?: unknown };
    expect(gatewayOptions.supervisor).toBe(supervisor);
    expect(booted.worker).toBe(worker);
    expect(booted.gateway).toBe(gateway);
  });

  it('passes a tier resolver that degrades to null (trial grant preserved)', async () => {
    const gateway = makeGateway();
    mocks.createGateway.mockReturnValue(gateway);
    mocks.startPreflightWorker.mockResolvedValue(makeWorkerHandle());

    await boot({ DATABASE_URL: DB_URL });

    const resolver = mocks.startBuilderWorker.mock.calls[0]?.[1] as (
      accountId: string,
    ) => Promise<unknown>;
    expect(typeof resolver).toBe('function');
    // The mocked pg pool rejects every query, so the resolver must degrade to
    // null — the worker then applies the trial grant, exactly as before KI-025.
    await expect(resolver('account-1')).resolves.toBeNull();
  });

  it('logs lifecycle records as JSON carrying botId, never the connection URL', async () => {
    const captured = captureStream(process.stdout);
    const gateway = makeGateway();
    mocks.createGateway.mockReturnValue(gateway);
    mocks.startPreflightWorker.mockResolvedValue(makeWorkerHandle());

    await boot({ DATABASE_URL: DB_URL });
    captured.restore();

    const lines = captured.text().trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { botId?: unknown; event?: unknown };
      expect(typeof parsed.botId).toBe('string');
      expect(typeof parsed.event).toBe('string');
    }
    expect(captured.text()).not.toContain('supersecret');
    expect(captured.text()).not.toContain(DB_URL);
  });

  it('shutdown stops the worker, shuts the gateway, closes the pool, and is idempotent', async () => {
    const gateway = makeGateway();
    const worker = makeWorkerHandle();
    const builderWorker = makeWorkerHandle();
    mocks.createGateway.mockReturnValue(gateway);
    mocks.startPreflightWorker.mockResolvedValue(worker);
    mocks.startBuilderWorker.mockResolvedValue(builderWorker);

    const booted = await boot({ DATABASE_URL: DB_URL });
    await booted.shutdown();
    await booted.shutdown();

    expect(worker.stop).toHaveBeenCalledTimes(1);
    expect(builderWorker.stop).toHaveBeenCalledTimes(1);
    expect(gateway.shutdown).toHaveBeenCalledTimes(1);
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  // M4: a throw from the first stop must not skip the remaining shutdown legs.
  it('attempts every shutdown leg when the first stop throws, and reports the first error', async () => {
    const gateway = makeGateway();
    const worker = makeWorkerHandle();
    const builderWorker = makeWorkerHandle();
    worker.stop.mockRejectedValueOnce(new Error('worker stop failed'));
    mocks.createGateway.mockReturnValue(gateway);
    mocks.startPreflightWorker.mockResolvedValue(worker);
    mocks.startBuilderWorker.mockResolvedValue(builderWorker);

    const booted = await boot({ DATABASE_URL: DB_URL });
    await expect(booted.shutdown()).rejects.toThrow('worker stop failed');

    expect(worker.stop).toHaveBeenCalledTimes(1);
    expect(builderWorker.stop).toHaveBeenCalledTimes(1);
    expect(gateway.shutdown).toHaveBeenCalledTimes(1);
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  it('closes the pool and rejects when the worker cannot boot', async () => {
    mocks.createGateway.mockReturnValue(makeGateway());
    mocks.startPreflightWorker.mockRejectedValue(new Error('pg-boss is down'));

    await expect(boot({ DATABASE_URL: DB_URL })).rejects.toThrow('pg-boss is down');
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
    expect(mocks.poolConstructed).toBe(1);
  });

  it('rejects before creating any resource when DATABASE_URL is empty', async () => {
    await expect(boot({ DATABASE_URL: '   ' })).rejects.toThrow('DATABASE_URL is not set');
    expect(mocks.createGateway).not.toHaveBeenCalled();
    expect(mocks.startPreflightWorker).not.toHaveBeenCalled();
    expect(mocks.poolConstructed).toBe(0);
  });
});

// SHUTDOWN THROW CONTRACT (boot layer). The canonical text is on
// Gateway.shutdown in gateway.ts; this asserts the referencing half. `stopping`
// memoizes the first call's promise, so a failed pass re-rejects with the same
// error and no shutdown leg is ever retried.
describe('boot shutdown throw contract', () => {
  it('re-rejects with the same error on a repeated shutdown() and never retries a leg', async () => {
    const gateway = makeGateway();
    const worker = makeWorkerHandle();
    const builderWorker = makeWorkerHandle();
    worker.stop.mockRejectedValue(new Error('worker stop failed'));
    mocks.createGateway.mockReturnValue(gateway);
    mocks.startPreflightWorker.mockResolvedValue(worker);
    mocks.startBuilderWorker.mockResolvedValue(builderWorker);

    const booted = await boot({ DATABASE_URL: DB_URL });
    await expect(booted.shutdown()).rejects.toThrow('worker stop failed');
    // The remembered rejection is the only outcome on repeat: no leg re-runs.
    await expect(booted.shutdown()).rejects.toThrow('worker stop failed');

    expect(worker.stop).toHaveBeenCalledTimes(1);
    expect(builderWorker.stop).toHaveBeenCalledTimes(1);
    expect(gateway.shutdown).toHaveBeenCalledTimes(1);
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });
});

describe('main', () => {
  it('returns 1 with a plain message when DATABASE_URL is missing', async () => {
    const captured = captureStream(process.stderr);
    const code = await main({});
    captured.restore();

    expect(code).toBe(1);
    expect(captured.text()).toContain('DATABASE_URL is not set');
    // Plain operator message: no stack frames.
    expect(captured.text()).not.toMatch(/\n\s+at /);
    expect(mocks.createGateway).not.toHaveBeenCalled();
    expect(mocks.startPreflightWorker).not.toHaveBeenCalled();
    expect(mocks.poolConstructed).toBe(0);
  });

  it('returns 1 without echoing an unexpected failure message (which may carry the URL)', async () => {
    mocks.createGateway.mockReturnValue(makeGateway());
    mocks.startPreflightWorker.mockRejectedValue(new Error(`connect failed to ${DB_URL}`));
    const captured = captureStream(process.stderr);

    const code = await main({ DATABASE_URL: DB_URL });
    captured.restore();

    expect(code).toBe(1);
    expect(captured.text()).toContain('startup failed (Error)');
    expect(captured.text()).not.toContain('supersecret');
  });
});

describe('handleShutdownSignal', () => {
  it('SIGTERM -> stops, logs signal + complete, exits 0', async () => {
    const shutdown = vi.fn(async () => undefined);
    const exit = vi.fn();
    const log = vi.fn();

    await handleShutdownSignal('SIGTERM', { shutdown, log, exit });

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    const events = log.mock.calls.map((call) => (call[0] as { event: string }).event);
    expect(events).toEqual(['shutdown-signal', 'shutdown-complete']);
    expect((log.mock.calls[0]?.[0] as { reason?: string }).reason).toBe('SIGTERM');
    expect((log.mock.calls[0]?.[0] as { botId?: string }).botId).toBe('system');
  });

  it('a failing shutdown logs the event (no error text) and exits 1', async () => {
    const shutdown = vi.fn(async () => {
      throw new Error(`pool end failed ${DB_URL}`);
    });
    const exit = vi.fn();
    const log = vi.fn();

    await handleShutdownSignal('SIGINT', { shutdown, log, exit });

    expect(exit).toHaveBeenCalledWith(1);
    const events = log.mock.calls.map((call) => (call[0] as { event: string }).event);
    expect(events).toEqual(['shutdown-signal', 'shutdown-failed']);
    expect(JSON.stringify(log.mock.calls)).not.toContain('supersecret');
  });
});

describe('entry point', () => {
  it(
    'the real process exits non-zero when DATABASE_URL is missing',
    { timeout: 30_000 },
    async () => {
      const gatewayRoot = fileURLToPath(new URL('..', import.meta.url));
      const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: '' };
      const result = await runProcess(
        process.execPath,
        ['--import', 'tsx', 'src/start.ts'],
        gatewayRoot,
        env,
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('DATABASE_URL is not set');
      expect(result.stderr).not.toMatch(/\n\s+at /);
    },
  );
});

function recordingLogger(): { logger: GatewayLogger; lines: string[] } {
  const lines: string[] = [];
  const capture = (record: LogRecord): void => {
    lines.push(JSON.stringify(record));
  };
  return { logger: { info: capture, error: capture }, lines };
}

describe('restartBotFromVault', () => {
  it('returns quietly with restart-no-row when there is no live row to heal', async () => {
    const { logger, lines } = recordingLogger();
    const relogin = vi.fn(async () => undefined);

    await restartBotFromVault(
      { activeBotToken: async () => undefined },
      { relogin },
      logger,
      'bot-missing',
    );

    expect(relogin).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? '{}') as { event?: string; botId?: string };
    expect(record.event).toBe('restart-no-row');
    expect(record.botId).toBe('bot-missing');
    expect(lines[0]).not.toContain('token');
  });

  it('propagates a decrypt failure instead of swallowing it', async () => {
    const { logger } = recordingLogger();
    const relogin = vi.fn(async () => undefined);

    await expect(
      restartBotFromVault(
        { activeBotToken: async () => ({ id: 'bot-a', tokenCipher: Buffer.from('short') }) },
        { relogin },
        logger,
        'bot-a',
      ),
    ).rejects.toBeInstanceOf(CryptoError);
    expect(relogin).not.toHaveBeenCalled();
  });

  it('decrypts the vault token and relogins without logging the token', async () => {
    const previousKey = process.env['ENCRYPTION_KEY'];
    process.env['ENCRYPTION_KEY'] = 'a'.repeat(64);
    try {
      const { logger, lines } = recordingLogger();
      const relogin = vi.fn(async () => undefined);
      const cipher = encryptToken('bot-a', 'live-secret-token');

      await restartBotFromVault(
        { activeBotToken: async () => ({ id: 'bot-a', tokenCipher: cipher }) },
        { relogin },
        logger,
        'bot-a',
      );

      expect(relogin).toHaveBeenCalledWith('bot-a', 'live-secret-token');
      expect(JSON.stringify(lines)).not.toContain('live-secret-token');
    } finally {
      if (previousKey === undefined) {
        delete process.env['ENCRYPTION_KEY'];
      } else {
        process.env['ENCRYPTION_KEY'] = previousKey;
      }
    }
  });
});

describe('supervisor audit writer', () => {
  it('logs supervisor-audit-failed and never throws when the insert rejects', async () => {
    mocks.createGateway.mockReturnValue(makeGateway());
    mocks.startPreflightWorker.mockResolvedValue(makeWorkerHandle());
    const captured = captureStream(process.stdout);

    try {
      await boot({ DATABASE_URL: DB_URL });
      const deps = mocks.createSupervisor.mock.calls[0]?.[0] as {
        audit: (event: NewAuditEvent) => Promise<void>;
      };

      await expect(
        deps.audit({
          botId: 'bot-a',
          actor: 'system',
          action: 'quarantine',
          detail: { reason: 'crash_loop' },
        }),
      ).resolves.toBeUndefined();
    } finally {
      captured.restore();
    }

    const text = captured.text();
    expect(text).toContain('supervisor-audit-failed');
    expect(text).toContain('bot-a');
    expect(text).not.toContain('supersecret');
    expect(text).not.toContain(DB_URL);
  });
});

// ---------------------------------------------------------------------------
// Live leg: prove the same drizzle insert path boot uses actually writes a
// supervisor audit row. Loud-skip when Postgres is unreachable — a silent skip
// is forbidden (L-009) and the unknown must never be recorded as success.
// ---------------------------------------------------------------------------

const FALLBACK_DB_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

function resolveLiveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : FALLBACK_DB_URL;
}

describe('supervisor audit write (real Postgres)', () => {
  it(
    'inserts an audit row through the drizzle path boot uses',
    { timeout: 60_000 },
    async (ctx) => {
      const actualPg = await vi.importActual<typeof import('pg')>('pg');
      const pool = new actualPg.Pool({
        connectionString: resolveLiveDatabaseUrl(),
        connectionTimeoutMillis: 3_000,
      });
      const schema = `start_audit_test_${process.pid}_${Date.now()}`;
      let client: import('pg').PoolClient | null = null;
      try {
        try {
          await pool.query('SELECT 1');
        } catch {
          console.warn(
            '[start] SKIP: no Postgres reachable at the configured URL — ' +
              'start the CI-identical container (postgres:17, see .github/workflows/ci.yml) ' +
              'or set DATABASE_URL. Skipping loudly, not failing.',
          );
          ctx.skip();
          return;
        }
        client = await pool.connect();
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        const migration = readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle', '0006_audit_events.sql'),
          'utf8',
        );
        const statements = migration
          .split('--> statement-breakpoint')
          .map((statement) => statement.trim())
          .filter((statement) => statement.length > 0);
        for (const statement of statements) {
          await client.query(statement);
        }

        // Same shape as boot: drizzle over a single connection, explicit table.
        const db = drizzle(client);
        await db.insert(auditEvents).values({
          botId: '00000000-0000-4000-8000-0000000000aa',
          actor: 'system',
          action: 'quarantine',
          detail: { reason: 'crash_loop', crashes: 5 },
        });

        const found = await client.query<{ action: string }>(
          'SELECT action FROM audit_events WHERE action = $1',
          ['quarantine'],
        );
        expect(found.rowCount).toBe(1);
        expect(found.rows[0]?.action).toBe('quarantine');
      } finally {
        if (client !== null) {
          await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
          client.release();
        }
        await pool.end().catch(() => undefined);
      }
    },
  );
});
