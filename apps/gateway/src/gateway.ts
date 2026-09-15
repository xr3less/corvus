// Multiplexed gateway core (SPEC section 4).
//
// One gateway hosts N bots. Each bot gets its own injected client, its own
// error boundary, and its own quarantine state — a crashing bot is isolated
// without ever touching its siblings.
//
// The discord.js Client is NEVER imported here. Production passes a factory
// that wraps a real discord.js v14 Client; tests pass fakes. The store and
// logger are likewise injected and defined by structural typing — the real
// implementations are owned by sibling tracks (T-store) and integrated in
// Wave C.
//
// V1-9: an optional Supervisor (see ./supervisor/supervisor.ts) can be
// injected. When present, the error boundary routes crashes through it
// (crash-loop counting, backoff restart, audit-on-quarantine) instead of
// quarantining on the first error. When absent, the original first-error
// quarantine is unchanged.

import type { Supervisor } from './supervisor/supervisor.js';

export interface BotConfig {
  id: string;
  token?: string;
}

export type BotStatus = 'live' | 'quarantined' | 'unknown';

// Minimal structural surface the gateway needs from a Discord client.
// Production adapts a real discord.js v14 Client to this shape; tests use
// fakes. Kept intentionally narrow so fakes stay trivial.
export interface GatewayClient {
  on(event: string, listener: (error: unknown) => void): void;
  login(token?: string): Promise<void>;
  destroy(): Promise<void> | void;
}

export type GatewayClientFactory = (botId: string) => GatewayClient;

// Minimal structural surface the gateway needs from the store (SPEC
// section 4). recordXp/getXp live on T-store's own interface; the gateway
// core only needs durability-on-shutdown, so only flush() is required here.
export interface GatewayStore {
  flush(): Promise<void> | void;
}

// Every log record carries botId and is JSON-serializable. The gateway
// NEVER puts tokens or message content into a record (see sanitizeReason
// and the addBot path, which logs the id only — never cfg).
export interface LogRecord {
  level: 'info' | 'error';
  event: string;
  botId: string;
  reason?: string;
}

export interface GatewayLogger {
  info(record: LogRecord): void;
  error(record: LogRecord): void;
}

export interface GatewayOptions {
  createClient: GatewayClientFactory;
  store: GatewayStore;
  logger: GatewayLogger;
  // Optional self-healing policy layer. Absent -> original first-error
  // quarantine behavior (unchanged for every existing caller).
  supervisor?: Supervisor;
}

export interface Gateway {
  addBot(cfg: BotConfig): Promise<void>;
  removeBot(id: string): Promise<void>;
  /**
   * Reconnect a live bot with a fresh client, preserving supervision state.
   * The restart path (V1-9) MUST use this rather than removeBot + addBot:
   * removeBot calls supervisor.forget() and addBot calls registerBot(), which
   * together reset the consecutive-crash counter on every restart and make the
   * crash-loop quarantine unreachable.
   */
  relogin(id: string, token?: string): Promise<void>;
  quarantine(botId: string, reason: string): Promise<void>;
  shutdown(): Promise<void>;
  status(botId: string): BotStatus;
  botIds(): string[];
}

interface BotEntry {
  client: GatewayClient;
  status: 'live' | 'quarantined';
}

const MAX_REASON_LENGTH = 500;

// Token-like runs (discord tokens are long base64-ish segments) are
// redacted so an error message that accidentally echoes a credential can
// never land in a log line verbatim.
const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_.-]{24,}/g;

export function sanitizeReason(reason: string): string {
  const redacted = reason.replace(TOKEN_LIKE_PATTERN, '[redacted]');
  return redacted.length > MAX_REASON_LENGTH
    ? `${redacted.slice(0, MAX_REASON_LENGTH)}…`
    : redacted;
}

export function errorToReason(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.length > 0 ? `: ${error.message}` : '';
    return sanitizeReason(`${error.name}${message}`);
  }
  if (typeof error === 'string') {
    return sanitizeReason(error);
  }
  return 'unknown-error';
}

export function createGateway(options: GatewayOptions): Gateway {
  const { createClient, store, logger, supervisor } = options;
  const bots = new Map<string, BotEntry>();
  let shutDown = false;

  async function destroyQuietly(botId: string, entry: BotEntry): Promise<void> {
    try {
      await entry.client.destroy();
    } catch (error) {
      logger.error({
        level: 'error',
        event: 'bot-disconnect-failed',
        botId,
        reason: errorToReason(error),
      });
    }
  }

  async function quarantine(botId: string, reason: string): Promise<void> {
    const entry = bots.get(botId);
    if (entry === undefined) {
      logger.error({
        level: 'error',
        event: 'quarantine-unknown-bot',
        botId,
        reason: sanitizeReason(reason),
      });
      return;
    }
    if (entry.status === 'quarantined') {
      return;
    }
    entry.status = 'quarantined';
    logger.error({
      level: 'error',
      event: 'bot-quarantined',
      botId,
      reason: sanitizeReason(reason),
    });
    // Disconnect ONLY this bot — siblings are never touched here.
    await destroyQuietly(botId, entry);
  }

  // Per-bot error boundary: with a supervisor injected, a crash is counted
  // and (below the threshold) retried with backoff; without one, any client
  // error quarantines this bot only — the original behavior. Extracted so
  // addBot and relogin attach the identical boundary.
  function attachErrorBoundary(botId: string, client: GatewayClient): void {
    client.on('error', (error: unknown) => {
      const reason = errorToReason(error);
      if (supervisor === undefined) {
        void quarantine(botId, reason);
        return;
      }
      void supervisor.handleCrash(botId, reason).catch((supervisorError: unknown) => {
        logger.error({
          level: 'error',
          event: 'supervisor-crash-failed',
          botId,
          reason: errorToReason(supervisorError),
        });
      });
    });
  }

  async function addBot(cfg: BotConfig): Promise<void> {
    if (shutDown) {
      throw new Error('gateway is shut down');
    }
    if (cfg.id.length === 0) {
      throw new Error('bot id must not be empty');
    }
    if (bots.has(cfg.id)) {
      throw new Error(`bot already added: ${cfg.id}`);
    }
    const client = createClient(cfg.id);
    const entry: BotEntry = { client, status: 'live' };
    bots.set(cfg.id, entry);
    supervisor?.registerBot(cfg.id);
    attachErrorBoundary(cfg.id, client);
    try {
      await client.login(cfg.token);
    } catch (error) {
      const reason = errorToReason(error);
      if (supervisor === undefined) {
        await quarantine(cfg.id, reason);
      } else {
        await supervisor.quarantineBot(cfg.id, reason);
      }
      throw error;
    }
    // A completed login is a successful tick: it clears the crash counter.
    supervisor?.handleHealthy(cfg.id);
    // Log the id only — cfg (which may carry the token) is never logged.
    logger.info({ level: 'info', event: 'bot-added', botId: cfg.id });
  }

  async function removeBot(id: string): Promise<void> {
    const entry = bots.get(id);
    if (entry === undefined) {
      logger.error({ level: 'error', event: 'remove-unknown-bot', botId: id });
      return;
    }
    // Disconnect ONLY this bot — siblings are never touched here.
    await destroyQuietly(id, entry);
    bots.delete(id);
    // Drop supervision state so a late error from the old client is ignored
    // and a fresh addBot re-arms the bot cleanly (recovery path).
    supervisor?.forget(id);
    logger.info({ level: 'info', event: 'bot-removed', botId: id });
  }

  // Reconnects a live bot in place, preserving supervision state. Deliberately
  // NOT removeBot + addBot: removeBot forget()s the crash window and addBot
  // registerBot()s a fresh one, so the pair resets the consecutive-crash
  // counter on every restart and the 5-crashes/5min quarantine can never trip
  // — an infinite restart loop instead of supervision. Here the supervisor is
  // never told anything; the counting policy (attemptRestart) owns health.
  async function relogin(id: string, token?: string): Promise<void> {
    if (shutDown) {
      throw new Error('gateway is shut down');
    }
    const entry = bots.get(id);
    if (entry === undefined) {
      throw new Error(`unknown bot: ${id}`);
    }
    // Quietly drop the old client; only then swap in the fresh one so a late
    // error from the old client can never re-enter the boundary (it is no
    // longer the entry the boundary closes over).
    await destroyQuietly(id, entry);
    const client = createClient(id);
    entry.client = client;
    attachErrorBoundary(id, client);
    // No quarantine and no handleHealthy here: on failure we throw so
    // supervisor.attemptRestart records restart-failed; on success the caller
    // marks the tick healthy. relogin must never decide quarantine itself.
    await client.login(token);
    // Log the id only — the token never reaches a log line.
    logger.info({ level: 'info', event: 'bot-reconnected', botId: id });
  }

  async function shutdown(): Promise<void> {
    if (shutDown) {
      return;
    }
    shutDown = true;
    let flushError: unknown;
    try {
      // Durability first: every write must be durable before any disconnect.
      await store.flush();
    } catch (error) {
      flushError = error;
    }
    // Disconnect every bot, but never let one failing destroy save the
    // others from being disconnected.
    const entries = [...bots.entries()];
    const results = await Promise.allSettled(
      entries.map(async ([botId, entry]) => {
        await destroyQuietly(botId, entry);
        logger.info({ level: 'info', event: 'bot-disconnected', botId });
      }),
    );
    bots.clear();
    // Release supervision state (and any pending restart timer) for every bot.
    for (const [botId] of entries) {
      supervisor?.forget(botId);
    }
    const rejected = results.filter((r) => r.status === 'rejected');
    if (flushError !== undefined) {
      throw flushError;
    }
    if (rejected.length > 0) {
      throw new Error(`shutdown disconnected with ${rejected.length} failure(s)`);
    }
  }

  function status(botId: string): BotStatus {
    const entry = bots.get(botId);
    if (entry === undefined) {
      return 'unknown';
    }
    return entry.status;
  }

  function botIds(): string[] {
    return [...bots.keys()];
  }

  return { addBot, removeBot, relogin, quarantine, shutdown, status, botIds };
}
