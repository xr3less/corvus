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
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import { __setRefillPool } from '@corvus/ai';
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
import { startSyncCommandsWorker, type SyncCommandsWorkerHandle } from './deploy/worker.js';
import { createAccountsTierResolver } from './db/tier-resolver.js';
import { decryptToken } from './lib/crypto.js';
import { translateProdSpec } from './runtime/translator.js';
import { createSupervisor } from './supervisor/supervisor.js';
import { attachBotModules, BOOT_CONFIG_SQL } from './runtime/boot-modules.js';
import { recordGuildInstall } from './runtime/loaders.js';
import { startSweeper, type SweeperHandle } from './runtime/sweeper.js';
import { validateRuntimeConfigRow, type RuntimeConfigRow } from './runtime/config.js';

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
  builderWorker: BuilderWorkerHandle;
  syncCommandsWorker: SyncCommandsWorkerHandle;
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
const realClients = new Map<string, Client>();
const moduleStops = new Map<string, () => void>();
const readyAttached = new Set<string>();

type ReadyPool = {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
};

// Releases the module attach recorded for a botId, at most once. Both lifecycle
// edges go through here — the destroy path (the client those modules belong to
// is going away) and the attach path (a predecessor whose destroy failed) — so
// a stop can never be orphaned and a later attach can never leave an earlier
// one's polls running against a dead client. The entry is dropped BEFORE the
// stop runs, so a throwing stop can never leave a stale entry behind.
function stopModulesFor(botId: string, logger: GatewayLogger): void {
  const stop = moduleStops.get(botId);
  if (stop === undefined) {
    return;
  }
  moduleStops.delete(botId);
  try {
    stop();
  } catch {
    // Best-effort teardown, the same contract as the loader's own stop: one
    // failing poll never blocks the others, and it never blocks a disconnect.
    logger.error({ level: 'error', event: 'module-stop-failed', botId });
  }
}

async function onClientReady(botId: string, pool: ReadyPool, logger: GatewayLogger): Promise<void> {
  const realClient = realClients.get(botId);
  if (realClient === undefined) {
    return;
  }
  // The listener is one-shot, so a re-attach after relogin must be allowed to
  // arm again. Clearing here — the single point where a live attach has just
  // happened — is what makes the latch below mean "a ready attach is armed for
  // the client currently in realClients", never "this botId was seen once".
  readyAttached.delete(botId);
  // A predecessor's stop can still be pending here when its client's destroy
  // failed (destroyQuietly logs and the gateway proceeds with a fresh client).
  // Releasing it on attach too keeps the invariant absolute: one botId never
  // has two live attaches, and no attach outlives the client it was wired to.
  stopModulesFor(botId, logger);
  let rows: unknown[];
  try {
    const result = await pool.query(BOOT_CONFIG_SQL, [botId]);
    rows = result.rows;
  } catch {
    logger.error({ level: 'error', event: 'boot-config-failed', botId });
    rows = [];
  }
  const validConfigs: RuntimeConfigRow[] = [];
  for (const row of rows) {
    const parsed = validateRuntimeConfigRow(row);
    if (!parsed.ok) {
      logger.info({ level: 'info', event: 'boot-config-skip', botId, reason: 'invalid-row' });
      continue;
    }
    validConfigs.push(parsed.value);
  }
  const adapter = {
    info: (r: { event: string }): void => {
      logger.info({ level: 'info', event: r.event, botId });
    },
    error: (r: { event: string; reason?: string }): void => {
      if (r.reason === undefined) {
        logger.error({ level: 'error', event: r.event, botId });
      } else {
        logger.error({ level: 'error', event: r.event, botId, reason: r.reason });
      }
    },
  };
  type LoadBotLogger = NonNullable<Parameters<typeof attachBotModules>[2]>['logger'];
  try {
    const stop = attachBotModules(realClient, validConfigs, {
      logger: adapter as unknown as LoadBotLogger,
    });
    moduleStops.set(botId, stop);
  } catch {
    logger.error({ level: 'error', event: 'boot-modules-failed', botId });
  }
}

// LIFECYCLE OWNERSHIP (follow-up completed): the three maps above are keyed by
// botId but describe ONE live client, so every entry is created on attach and
// released again by that client's destroy() — see the adapter below. This makes
// removeBot and relogin behave correctly without either path knowing anything
// about modules or ready: destroy consumes the stored stop (old polls stop),
// drops the ready latch (the fresh client arms its own ClientReady listener, so
// attachBotModules runs again for the resurrected bot), and clears the client
// slot. Nothing leaks across bot churn.
function createDiscordClient(botId: string, pool: ReadyPool, logger: GatewayLogger): GatewayClient {
  const client = new Client({
    intents: resolveGatewayIntents(),
    partials: [Partials.GuildMember],
  });
  realClients.set(botId, client);
  // Armed only while the client currently in realClients has no live ready
  // listener. Cleared on successful attach (onClientReady) and on destroy
  // below, so a replacement client for the same botId — relogin builds one
  // through this same factory — arms its own ClientReady listener and
  // attachBotModules runs again. Without the clear, the latch was permanent:
  // a resurrected bot came back with no dispatcher, no slash commands and no
  // feature events, and the client slot leaked on every relogin.
  if (!readyAttached.has(botId)) {
    readyAttached.add(botId);
    // Identity-guarded: by the time a late ready fires, relogin may already
    // have swapped in a fresh client. Attaching the old client's modules then
    // would bind them to the dead client AND overwrite moduleStops, orphaning
    // the live attach's polls. A ready from a client that is no longer the
    // registered one is therefore ignored, exactly as gateway.markReady
    // ignores a late ready from a replaced entry.
    client.once(Events.ClientReady, () => {
      if (realClients.get(botId) !== client) {
        return;
      }
      void onClientReady(botId, pool, logger);
    });
    // Join edge: the composition root owns install, exactly as it owns ready.
    // A bot joining a guild records guild_installs with the true joined_at —
    // plain persistence via recordGuildInstall, NOT a BotEvent (the dispatcher
    // registry is untouched) and never a global-command touch.
    client.once(Events.GuildCreate, (guild) => {
      if (realClients.get(botId) !== client) {
        return;
      }
      const guildId: unknown = (guild as { id?: unknown }).id;
      if (typeof guildId !== 'string' || guildId.length === 0) {
        return;
      }
      void recordGuildInstall(pool, botId, guildId, logger);
    });
  }
  return {
    on(event: string, listener: (error: unknown) => void): void {
      client.on(event, listener);
    },
    async login(token?: string): Promise<void> {
      await client.login(token);
    },
    async destroy(): Promise<void> {
      // Tear this bot's detached modules down before the socket goes away.
      //
      // Why here and not at a caller: the gateway reaches destroy() through
      // exactly one seam (destroyQuietly in gateway.ts) and funnels EVERY
      // lifecycle path through it — removeBot, relogin (both the swap-out and
      // a failed login), quarantine and shutdown. Consuming the stored stop at
      // that single seam fixes the whole class instead of the two named paths,
      // and it is the follow-up the former NOTE on this factory deferred.
      //
      // Without it the module polls outlive their client: the 60s tempban poll
      // keeps ticking against a destroyed client, its guild fetch fails every
      // tick, and tempban keeps the row ("A row whose guild cannot be fetched
      // is kept for the next tick") — so the row never drains and a scheduled
      // unban never executes. The giveaway/connector polls leak the same way.
      stopModulesFor(botId, logger);
      // Drop the ready latch with the client it belonged to, so the fresh
      // client relogin builds through this factory re-arms its listener.
      readyAttached.delete(botId);
      try {
        await client.destroy();
      } finally {
        // Slot ownership is per live client: only clear it when this client is
        // still the registered one, so a slow destroy of an already-replaced
        // client can never evict its successor.
        if (realClients.get(botId) === client) {
          realClients.delete(botId);
        }
      }
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

// ---------------------------------------------------------------------------
// Site-engine bridge A1: boot reader (the missing 10 meters, SPEC section 1).
//
// Enumerates live bots and starts them through the existing startAll batch
// loader. Per-bot failures are logged and skipped so one bad row never aborts
// boot; a reader/DB failure degrades to zero bots, never a failed boot.
//
// Row filter: status = live, not soft-deleted, prod_spec_id NOT NULL, and a
// real token_cipher — placeholder rows minted with '\x'::bytea (zero/one-byte
// ciphers) are skipped with a boot-skip-placeholder-token line. Tokens are
// decrypted once per bot via decryptToken (AAD = bot id) before startAll; the
// load closure only reads the map. The translator pass is best-effort Yellow
// degrade: a bad prod spec logs boot-translator-failed and the bot still
// starts. Row persistence into bot_runtime_config belongs to the publish-hook
// wave, not to boot (see report's Open Questions).
// ---------------------------------------------------------------------------

export const BOOT_LIVE_BOTS_SQL =
  'SELECT b.id AS "id", b.token_cipher AS "tokenCipher", sv.spec AS "prodSpec" ' +
  'FROM bots b LEFT JOIN spec_versions sv ON sv.id = b.prod_spec_id ' +
  "WHERE b.status = 'live' AND b.deleted_at IS NULL AND b.prod_spec_id IS NOT NULL " +
  'ORDER BY b.created_at ASC, b.id ASC';

// Minimal structural pool surface (same convention as the store layer): the
// real pg Pool satisfies this without an import; tests hand in fakes.
export interface BootReaderPool {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface BootBotRow {
  id: string;
  tokenCipher: Buffer;
  prodSpec: unknown;
}

export interface BootReaderResult {
  started: string[];
  failed: { id: string; reason: string }[];
}

export async function bootLiveBots(
  pool: BootReaderPool,
  gateway: Gateway,
  logger: GatewayLogger,
): Promise<BootReaderResult> {
  let rows: BootBotRow[];
  try {
    const result = await pool.query<BootBotRow>(BOOT_LIVE_BOTS_SQL);
    rows = result.rows;
  } catch {
    // The reader must never fail boot: workers are already wired, so log and
    // continue with zero bots. No error text — it may carry the connection URL.
    logger.error({ level: 'error', event: 'boot-reader-failed', botId: SYSTEM_BOT_ID });
    return { started: [], failed: [] };
  }
  const tokens = new Map<string, string>();
  const ids: string[] = [];
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (id.length === 0) {
      continue;
    }
    const cipher = row.tokenCipher;
    if (!Buffer.isBuffer(cipher) || cipher.length <= 1) {
      logger.info({ level: 'info', event: 'boot-skip-placeholder-token', botId: id });
      continue;
    }
    // Translator pass: validate the prod envelope and degrade loudly on skip.
    // GatewayLogger satisfies the translator's logger structurally (info).
    if (row.prodSpec !== null && row.prodSpec !== undefined) {
      try {
        const translated = translateProdSpec(row.prodSpec, id, logger);
        logger.info({
          level: 'info',
          event: 'boot-translator-rows',
          botId: id,
          reason: `kinds=${translated.length}`,
        });
      } catch {
        logger.error({ level: 'error', event: 'boot-translator-failed', botId: id });
      }
    }
    try {
      tokens.set(id, decryptToken(id, cipher));
    } catch {
      // Fixed literal only — decryptToken messages carry no secret bytes, but
      // the reason is kept constant so a log scan can never surprise us.
      logger.error({ level: 'error', event: 'boot-token-decrypt-failed', botId: id });
      continue;
    }
    ids.push(id);
  }
  // startAll never rejects (one bad token only fails its own iteration), and
  // the load closure only reads the pre-decrypted map, so each token is
  // decrypted exactly once per boot.
  const result = await gateway.startAll(ids, (id: string) => {
    const token = tokens.get(id);
    if (token === undefined) {
      return Promise.reject(new Error('load_failed'));
    }
    return Promise.resolve({ id, token });
  });
  for (const failure of result.failed) {
    // failure.reason comes from the gateway's errorToReason (token-redacted).
    logger.error({
      level: 'error',
      event: 'boot-bot-failed',
      botId: failure.id,
      reason: failure.reason,
    });
  }
  logger.info({
    level: 'info',
    event: 'boot-bots-started',
    botId: SYSTEM_BOT_ID,
    reason: `started=${result.started.length} failed=${result.failed.length}`,
  });
  return result;
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

  // Refill seam (E4b): `packages/ai/src/budget.ts` is DB-free by design, so its
  // refill-allowance read hangs off a module-level pool setter. Until it is
  // given a pool, `refillAllowance` reads as zero and `checkBudget` enforces
  // the bare tier grant — a customer who bought a refill pack would silently
  // get none of it. Wiring the SAME pool the rest of boot uses (no second
  // pool, no new env read, no config change) is what makes the budget gate and
  // the credits display agree on what "active refills" means.
  //
  // Set before any worker starts: the builder worker runs checkBudget from its
  // first job, so a later call site could otherwise bill a refill-less grant.
  // `@corvus/ai` is the single shared AI layer, so this reaches the same module
  // instance every consumer in this process imports.
  __setRefillPool(pool);

  const vault: RestartVaultReader = {
    async activeBotToken(botId: string): Promise<RestartVaultRow | undefined> {
      // m-34: mirror the BOOT_LIVE_BOTS_SQL filter — a paused/slept/
      // quarantined bot must not be resurrected by the supervisor path. Only
      // status='live' rows are healable; anything else is "nothing to heal".
      const rows = await db
        .select({ id: bots.id, tokenCipher: bots.tokenCipher })
        .from(bots)
        .where(and(eq(bots.id, botId), eq(bots.status, 'live'), isNull(bots.deletedAt)))
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
    createClient: (botId: string) => createDiscordClient(botId, pool, logger),
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

  // The sync-commands worker boots beside the builder worker: it PUTs the
  // registry manifest into one guild per job (guild-scoped only, no global
  // commands). On boot failure the two already-started workers stop so a
  // failed boot leaves no open handle behind.
  let syncCommandsWorker: SyncCommandsWorkerHandle;
  try {
    syncCommandsWorker = await startSyncCommandsWorker(databaseUrl);
  } catch (error) {
    await builderWorker.stop().catch(() => undefined);
    await worker.stop().catch(() => undefined);
    await pool.end().catch(() => undefined);
    throw error;
  }

  logger.info({ level: 'info', event: 'gateway-started', botId: SYSTEM_BOT_ID });
  logger.info({ level: 'info', event: 'worker-started', botId: SYSTEM_BOT_ID });
  logger.info({ level: 'info', event: 'builder-worker-started', botId: SYSTEM_BOT_ID });
  logger.info({ level: 'info', event: 'sync-commands-worker-started', botId: SYSTEM_BOT_ID });

  // The reader runs after workers are wired: it enumerates live bots and
  // starts them through the existing startAll loader. Per-bot failures are
  // logged and skipped inside bootLiveBots, so this never throws — the only
  // failure surface is the workers above, which keep their original behavior.
  await bootLiveBots(pool, gateway, logger);

  // Sweeper seam (E4d): the sleep/wake reconcile interval driver, started only
  // now so its first tick can never observe a mid-boot fleet — every live bot
  // the reader would start already has. No opts are passed on purpose: the
  // poll interval and the 24h trial grace stay exactly the values
  // ./runtime/sweeper.ts exports and its suite proves (SWEEPER_POLL_MS,
  // SWEEP_GRACE_MS), so this call cannot drift them.
  //
  // The handle goes to the gateway, not to a leg of the shutdown below:
  // attachSweeper makes the gateway own the lifecycle (a later attach stops
  // this one, and Gateway.shutdown stops it FIRST — before store.flush and the
  // pool close — so no tick can query a closed pool). Adding a second stop leg
  // here would be redundant, not safer.
  const sweeper: SweeperHandle = startSweeper(pool, gateway, logger);
  gateway.attachSweeper(sweeper);
  logger.info({ level: 'info', event: 'sweeper-started', botId: SYSTEM_BOT_ID });

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
        await syncCommandsWorker.stop();
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

  return { gateway, worker, builderWorker, syncCommandsWorker, shutdown };
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
