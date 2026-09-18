// Gateway process boot entry (V1-3): boots the multiplexed gateway AND the
// preflight worker in the same process, then owns the shutdown sequence.
//
// Why this file exists: `startPreflightWorker` was exported with nobody
// starting it, so preflight scans never ran in production. A boot without it
// is a gateway that never scans a guild; a boot without DATABASE_URL is not a
// gateway at all (spec + guild_installs + preflight upsert all live in
// Postgres), so a missing URL fails fast instead of degrading into a
// half-working process.
//
// Secret policy: DATABASE_URL, bot tokens, and connection error text are
// NEVER written to a log line. Every record is JSON with a `botId` — process
// lifecycle events use the synthetic `system` id — matching the repo's JSON
// log convention (Docs/10_deployment.md).

import { pathToFileURL } from 'node:url';
import { Client, GatewayIntentBits } from 'discord.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  createGateway,
  type Gateway,
  type GatewayClient,
  type GatewayLogger,
  type LogRecord,
} from './gateway.js';
import { bots } from './db/schema.js';
import { auditEvents } from './db/audit-events.js';
import { createStore } from './store/index.js';
import {
  FULL_PREFLIGHT_INTENTS,
  startPreflightWorker,
  type PreflightWorkerHandle,
} from './preflight/worker.js';
import { startBuilderWorker, type BuilderWorkerHandle } from './db/builder-runs.js';
import { createAccountsTierResolver } from './db/tier-resolver.js';
import { decryptToken } from './lib/crypto.js';
import { createSupervisor } from './supervisor/supervisor.js';

// Lifecycle records are not about a single bot; the synthetic id keeps the
// JSON shape identical to per-bot records so log consumers never branch.
const SYSTEM_BOT_ID = 'system';

export class BootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootError';
  }
}

export interface BootedGateway {
  gateway: Gateway;
  worker: PreflightWorkerHandle;
  shutdown(): Promise<void>;
}

export interface ShutdownSignalDeps {
  shutdown(): Promise<void>;
  log(record: LogRecord): void;
  exit(code: number): void;
}

function requireDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env['DATABASE_URL'];
  const url = (raw ?? '').trim();
  if (url.length === 0) {
    throw new BootError(
      'DATABASE_URL is not set — refusing to start (the gateway, store and preflight worker all need Postgres)',
    );
  }
  return url;
}

function createJsonLogger(write: (line: string) => void): GatewayLogger {
  const emit = (record: LogRecord): void => {
    write(`${JSON.stringify(record)}\n`);
  };
  return { info: emit, error: emit };
}

function resolveGatewayIntents(): GatewayIntentBits[] {
  // Reuse the worker's documented full intent set so the live gateway can see
  // the same events a preflight scan promises to check (members, message
  // content, reactions).
  return FULL_PREFLIGHT_INTENTS.map((name) => GatewayIntentBits[name]);
}

// Adapter, not a raw Client: `GatewayClient.login` is Promise<void> while
// discord.js resolves the token string, and the gateway only ever needs the
// error/login/destroy surface. This is the only place discord.js is
// constructed for the multiplexed gateway.
function createDiscordClient(): GatewayClient {
  const client = new Client({ intents: resolveGatewayIntents() });
  return {
    on(event: string, listener: (error: unknown) => void): void {
      client.on(event, listener);
    },
    async login(token?: string): Promise<void> {
      await client.login(token);
    },
    destroy(): Promise<void> {
      return client.destroy();
    },
  };
}

// Minimal structural surfaces for restartBotFromVault. Narrowed so tests can
// inject fakes with no Postgres and no real gateway; the production vault
// reader (drizzle over the boot pool) and the real Gateway satisfy these
// structurally.
export interface RestartVaultRow {
  id: string;
  tokenCipher: Buffer;
}

export interface RestartVaultReader {
  activeBotToken(botId: string): Promise<RestartVaultRow | undefined>;
}

export interface RestartTarget {
  relogin(id: string, token?: string): Promise<void>;
}

// The supervisor's restart callback: look up the bot's live vault row, decrypt
// the token, and reconnect through Gateway.relogin (which preserves crash
// state). A missing/deleted row is not an error — there is simply nothing to
// heal. Decrypt and DB failures propagate so supervisor.attemptRestart records
// restart-failed; they are never swallowed, and no token bytes are logged.
export async function restartBotFromVault(
  vault: RestartVaultReader,
  gateway: RestartTarget,
  logger: GatewayLogger,
  botId: string,
): Promise<void> {
  const row = await vault.activeBotToken(botId);
  if (row === undefined) {
    logger.info({ level: 'info', event: 'restart-no-row', botId });
    return;
  }
  const token = decryptToken(botId, row.tokenCipher);
  await gateway.relogin(botId, token);
}

// Reads the URL, builds the real gateway deps, then starts the preflight
// worker. If the worker cannot boot, the gateway pool is closed so a failed
// boot leaves no open handle behind.
export async function boot(env: NodeJS.ProcessEnv = process.env): Promise<BootedGateway> {
  const databaseUrl = requireDatabaseUrl(env);
  const logger = createJsonLogger((line) => process.stdout.write(line));
  const pool = new Pool({ connectionString: databaseUrl });
  // One pool per process: the supervisor's audit writer reuses the boot pool
  // through drizzle instead of opening a second connection pool.
  const db = drizzle(pool);

  const vault: RestartVaultReader = {
    async activeBotToken(botId: string): Promise<RestartVaultRow | undefined> {
      const rows = await db
        .select({ id: bots.id, tokenCipher: bots.tokenCipher })
        .from(bots)
        .where(and(eq(bots.id, botId), isNull(bots.deletedAt)))
        .limit(1);
      return rows[0];
    },
  };

  // The supervisor callbacks need the gateway, which is constructed next.
  // Declared first so the closures capture the binding; they only ever run
  // after boot has assigned it (a crash/restart cannot occur during boot).
  // `let` is required for that closure order, so prefer-const does not apply.
  // eslint-disable-next-line prefer-const
  let gateway: Gateway;
  const supervisor = createSupervisor({
    logger,
    quarantine: (id, reason) => gateway.quarantine(id, reason),
    audit: async (event) => {
      try {
        await db.insert(auditEvents).values(event);
      } catch {
        // The audit trail matters but is never worth crashing the gateway
        // over. Record the failure with the bot id only — never token or
        // connection bytes.
        logger.error({
          level: 'error',
          event: 'supervisor-audit-failed',
          botId: event.botId ?? SYSTEM_BOT_ID,
        });
      }
    },
    restart: (botId) => restartBotFromVault(vault, gateway, logger, botId),
  });
  gateway = createGateway({
    createClient: () => createDiscordClient(),
    store: createStore({ pool }),
    logger,
    supervisor,
  });

  let worker: PreflightWorkerHandle;
  try {
    worker = await startPreflightWorker(databaseUrl);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  // The builder-run worker boots beside the preflight worker. If it cannot
  // boot, the already-started preflight worker is stopped so a failed boot
  // leaves no open handle behind.
  let builderWorker: BuilderWorkerHandle;
  try {
    // The builder pre-check resolves the account's plan tier through the
    // boot pool (one pool per process); an unreadable tier falls back to the
    // trial grant inside the worker, never a crash.
    builderWorker = await startBuilderWorker(databaseUrl, createAccountsTierResolver(pool));
  } catch (error) {
    await worker.stop().catch(() => undefined);
    await pool.end().catch(() => undefined);
    throw error;
  }

  logger.info({ level: 'info', event: 'gateway-started', botId: SYSTEM_BOT_ID });
  logger.info({ level: 'info', event: 'worker-started', botId: SYSTEM_BOT_ID });
  logger.info({ level: 'info', event: 'builder-worker-started', botId: SYSTEM_BOT_ID });

  // Boot-layer half of the SHUTDOWN THROW CONTRACT. The canonical text lives
  // on Gateway.shutdown in gateway.ts; this is the reference, not a second
  // definition (KI-023).
  //
  // `stopping` memoizes the first call's promise, so boot shutdown is
  // single-shot and NOT retryable: every leg (worker stop, builder-worker
  // stop, gateway shutdown, pool end) runs at most once across any number of
  // calls. A first pass that threw re-rejects with the SAME error on every
  // later call — the failure is remembered, never retried — and a first pass
  // that succeeded resolves every later call. The inner gateway.shutdown()
  // latches and resolves early on a repeat, which is what keeps each leg here
  // running exactly once.
  let stopping: Promise<void> | null = null;

  function shutdown(): Promise<void> {
    if (stopping !== null) {
      return stopping;
    }
    stopping = (async () => {
      // Stop pulling new scans first, then flush the store and disconnect
      // every bot. Each leg runs even if an earlier one throws — a failed
      // worker stop must never save the bots from being disconnected or skip
      // the pool close. The first error is rethrown after every leg has had
      // its attempt.
      const errors: unknown[] = [];
      try {
        await worker.stop();
      } catch (error) {
        errors.push(error);
      }
      try {
        await builderWorker.stop();
      } catch (error) {
        errors.push(error);
      }
      try {
        await gateway.shutdown();
      } catch (error) {
        errors.push(error);
      }
      try {
        await pool.end();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw errors[0];
      }
    })();
    return stopping;
  }

  return { gateway, worker, shutdown };
}

// SIGTERM/SIGINT -> stop worker, shutdown gateway, exit. Exported so the
// signal path is testable without sending a real signal to the test runner.
export function handleShutdownSignal(signal: string, deps: ShutdownSignalDeps): Promise<void> {
  deps.log({ level: 'info', event: 'shutdown-signal', botId: SYSTEM_BOT_ID, reason: signal });
  return deps.shutdown().then(
    () => {
      deps.log({ level: 'info', event: 'shutdown-complete', botId: SYSTEM_BOT_ID });
      deps.exit(0);
    },
    () => {
      // Error text may carry the connection string; log the event only.
      deps.log({ level: 'error', event: 'shutdown-failed', botId: SYSTEM_BOT_ID });
      deps.exit(1);
    },
  );
}

function installShutdownHandlers(booted: BootedGateway): void {
  const deps: ShutdownSignalDeps = {
    shutdown: () => booted.shutdown(),
    log: (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
    exit: (code) => process.exit(code),
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    void handleShutdownSignal(signal, deps);
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

// Returns 0 once the process is up and serving, 1 when the process must not
// start. A BootError yields a plain operator message; unexpected failures
// yield the error name only (never the message, which may carry the URL).
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let booted: BootedGateway;
  try {
    booted = await boot(env);
  } catch (error) {
    if (error instanceof BootError) {
      process.stderr.write(`corvus-gateway: ${error.message}\n`);
    } else {
      const name = error instanceof Error ? error.name : 'unknown-error';
      process.stderr.write(`corvus-gateway: startup failed (${name})\n`);
    }
    return 1;
  }
  installShutdownHandlers(booted);
  return 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().then(
    (code) => {
      if (code !== 0) {
        process.exit(code);
      }
    },
    () => process.exit(1),
  );
}
