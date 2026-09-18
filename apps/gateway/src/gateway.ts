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

// Fine-grained lifecycle machine for one bot (the discord-multiclient pattern,
// reimplemented here rather than copied). 'idle' is the declared initial state
// of an entry; addBot synchronously marks 'connecting' before it awaits login,
// so no external caller can observe idle — the machine is still the same one.
export type BotStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'destroyed';

// Coarse status kept for the pre-existing status() surface and every existing
// caller. Maps onto the machine as: live -> connecting/ready, quarantined ->
// error, unknown -> never seen.
export type LegacyBotStatus = 'live' | 'quarantined' | 'unknown';

// Minimal structural surface the gateway needs from a Discord client.
// Production adapts a real discord.js v14 Client to this shape; tests use
// fakes. Kept intentionally narrow so fakes stay trivial.
export interface GatewayClient {
  // Rest-typed on purpose: Discord reports a terminal socket loss through
  // shardError(error, shardId), shardDisconnect(closeEvent, shardId) and
  // invalidated() — a single `(error: unknown)` parameter cannot express all
  // three. Simple fakes with `(error: unknown) => void` remain assignable.
  on(event: string, listener: (...args: unknown[]) => void): void;
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

// Lifecycle events are id-tagged: every listener call carries the bot it
// belongs to, so a fleet-wide subscriber never has to guess which bot changed.
export type LifecycleEventName = 'ready' | 'error' | 'disconnect' | 'shardError' | 'quarantined';

export interface LifecycleEvent {
  botId: string;
  event: LifecycleEventName;
}

export type LifecycleListener = (event: LifecycleEvent) => void;

export interface StartAllFailure {
  id: string;
  reason: string;
}

export interface StartAllResult {
  started: string[];
  failed: StartAllFailure[];
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
  /**
   * SHUTDOWN THROW CONTRACT (canonical text; start.ts's BootedGateway.shutdown
   * references this block instead of restating it — one contract, two layers,
   * KI-023).
   *
   * Shutdown is single-shot and deliberately NOT retryable — it is not a
   * SafeExecutor-style retry loop. A caller that wants retryable teardown must
   * build that itself; calling shutdown again never re-runs teardown.
   *
   * - First call: flush the store before disconnecting anything, then attempt
   *   every bot. It rejects with the flush error when flushing failed
   *   (durability outranks disconnect reporting); otherwise it rejects with an
   *   aggregate error when one or more disconnects failed. Every bot is
   *   attempted regardless of an earlier bot's failure.
   * - Later calls: the shut-down flag is latched BEFORE teardown begins, so
   *   every later call is a no-op that RESOLVES. The first pass's failure is
   *   not re-surfaced here; the boot wrapper (start.ts) owns that reporting.
   *
   * In one line: "same outcome on repeat, never a retry" is the public contract
   * at the boot layer, and this early-resolving latch is the inner mechanism
   * that makes each boot-layer shutdown leg run exactly once across repeated
   * calls.
   */
  shutdown(): Promise<void>;
  /**
   * Coarse legacy status. Returns 'unknown' once the bot's entry is gone —
   * after removeBot() or shutdown() — even though the terminal lifecycle state
   * remains queryable. That divergence from getStatus() is BY DESIGN: this is
   * the pre-lifecycle-machine vocabulary, in which a bot that is no longer
   * hosted is simply 'unknown', while getStatus() preserves the terminal state
   * ('destroyed') for observability. Use getStatus() when you need to tell
   * "never added" apart from "removed or shut down".
   */
  status(botId: string): LegacyBotStatus;
  /**
   * Fine-grained lifecycle state; 'unknown' when the id was never added.
   * After removeBot()/shutdown() this stays queryable as 'destroyed', which is
   * the counterpart of status() returning 'unknown' for the same id — by
   * design, not a bug.
   */
  getStatus(botId: string): BotStatus | 'unknown';
  /** Subscribes to id-tagged lifecycle events; returns an unsubscribe handle. */
  onLifecycle(listener: LifecycleListener): () => void;
  /**
   * Starts every id in order, isolating failures. A token that fails to load
   * or a bot whose login fails is collected in `failed`; the batch itself
   * never rejects, so one bad token cannot stop the rest of the fleet.
   * `load()` failures are reported as reason 'load_failed'; addBot failures
   * reuse the existing errorToReason vocabulary.
   */
  startAll(botIds: string[], load: (id: string) => Promise<BotConfig>): Promise<StartAllResult>;
  botIds(): string[];
}

interface BotEntry {
  client: GatewayClient;
  status: 'live' | 'quarantined';
  lifecycle: BotStatus;
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

// Discord closes with 4014 (disallowed intents) without naming the offending
// privileged intent, so the only reliable signal is the close code / reason
// text. @discordjs/ws surfaces it as "Used disallowed intents"; discord.js's
// own message reads "Privileged intent provided is not enabled or whitelisted."
// Detecting either lets addBot quarantine with a distinct, actionable reason
// instead of a generic crash.
const DISALLOWED_INTENTS_PATTERN = /4014|disallowed.?intents|privileged intent/i;

// A shardDisconnect carries a CloseEvent (code/reason), not an Error. Turn it
// into a redacted reason so a terminal socket loss is recorded meaningfully.
function shardDisconnectReason(closeEvent: unknown): string {
  if (typeof closeEvent === 'object' && closeEvent !== null) {
    const record = closeEvent as { code?: unknown; reason?: unknown };
    if (typeof record.code === 'number') {
      const detail =
        typeof record.reason === 'string' && record.reason.length > 0 ? ` ${record.reason}` : '';
      return sanitizeReason(`shard-disconnect code=${record.code}${detail}`);
    }
  }
  return 'shard-disconnect';
}

export function createGateway(options: GatewayOptions): Gateway {
  const { createClient, store, logger, supervisor } = options;
  const bots = new Map<string, BotEntry>();
  // Ids whose entry was removed (removeBot/shutdown) but whose terminal state
  // should stay queryable. Kept beside the map, never inside it — the map's
  // shape is unchanged.
  const destroyed = new Set<string>();
  const lifecycleListeners = new Set<LifecycleListener>();
  let shutDown = false;

  function emitLifecycle(botId: string, event: LifecycleEventName): void {
    // Snapshot the listeners so an unsubscribe during dispatch cannot skip a
    // sibling, and a throwing listener can never take the gateway down —
    // lifecycle hooks are observability, not control flow.
    for (const listener of [...lifecycleListeners]) {
      try {
        listener({ botId, event });
      } catch (listenerError) {
        logger.error({
          level: 'error',
          event: 'lifecycle-listener-failed',
          botId,
          reason: errorToReason(listenerError),
        });
      }
    }
  }

  function onLifecycle(listener: LifecycleListener): () => void {
    lifecycleListeners.add(listener);
    return () => {
      lifecycleListeners.delete(listener);
    };
  }

  // The machine only moves forward on a real signal, and only for the entry
  // that is still registered: a late ready from a replaced or removed client
  // must never resurrect a bot.
  function markReady(botId: string, entry: BotEntry): void {
    if (bots.get(botId) !== entry || entry.lifecycle === 'ready') {
      return;
    }
    entry.lifecycle = 'ready';
    emitLifecycle(botId, 'ready');
  }

  function markError(botId: string, entry: BotEntry): void {
    if (bots.get(botId) !== entry || entry.lifecycle === 'error') {
      return;
    }
    entry.lifecycle = 'error';
    emitLifecycle(botId, 'error');
  }

  // Returns true when the client was actually disconnected. Shutdown needs
  // that distinction: logging "bot-disconnected" after a failed destroy is a
  // lie, and the old allSettled check was dead because this never rethrew.
  async function destroyQuietly(botId: string, entry: BotEntry): Promise<boolean> {
    try {
      await entry.client.destroy();
      return true;
    } catch (error) {
      logger.error({
        level: 'error',
        event: 'bot-disconnect-failed',
        botId,
        reason: errorToReason(error),
      });
      return false;
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
    entry.lifecycle = 'error';
    logger.error({
      level: 'error',
      event: 'bot-quarantined',
      botId,
      reason: sanitizeReason(reason),
    });
    emitLifecycle(botId, 'quarantined');
    // Disconnect ONLY this bot — siblings are never touched here.
    await destroyQuietly(botId, entry);
  }

  // Per-bot error boundary: with a supervisor injected, a crash is counted
  // and (below the threshold) retried with backoff; without one, any client
  // error quarantines this bot only — the original behavior. Extracted so
  // addBot and relogin attach the identical boundary.
  //
  // H1: discord.js reports the DOMINANT live-but-dead path through
  // shardError / shardDisconnect / invalidated, not through 'error'. Wiring
  // only 'error' left a dead socket supervised at crash count 0. All four
  // events route through the same boundary; shardDisconnect only fires for
  // unrecoverable close codes, so recoverable reconnects do not count.
  function attachErrorBoundary(botId: string, entry: BotEntry): void {
    const client = entry.client;
    const handleFailure = (reason: string, event: LifecycleEventName): void => {
      // Every failure is broadcast with its bot id before policy runs, so a
      // listener sees the raw event even when the supervisor retries instead
      // of quarantining.
      emitLifecycle(botId, event);
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
    };

    client.on('error', (...args: unknown[]) => handleFailure(errorToReason(args[0]), 'error'));
    client.on('shardError', (...args: unknown[]) =>
      handleFailure(errorToReason(args[0]), 'shardError'),
    );
    client.on('shardDisconnect', (...args: unknown[]) =>
      handleFailure(shardDisconnectReason(args[0]), 'disconnect'),
    );
    client.on('invalidated', () => handleFailure('client-invalidated', 'disconnect'));
    // discord.js v14 emits 'ready' (newer builds also 'clientReady'). Marking
    // ready on the real signal means a client whose login promise settles
    // before the ready event still lands in 'ready' rather than 'connecting'.
    const onReady = (): void => markReady(botId, entry);
    client.on('ready', onReady);
    client.on('clientReady', onReady);
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
    // idle -> connecting: the entry starts at the machine's initial state and
    // is moved to connecting synchronously, before any await, so no caller can
    // observe idle (it exists to make the state space total, not to be polled).
    const entry: BotEntry = { client, status: 'live', lifecycle: 'idle' };
    entry.lifecycle = 'connecting';
    bots.set(cfg.id, entry);
    // A fresh add of a previously removed id makes it live-queryable again.
    destroyed.delete(cfg.id);
    supervisor?.registerBot(cfg.id);
    attachErrorBoundary(cfg.id, entry);
    try {
      await client.login(cfg.token);
    } catch (error) {
      const detail = errorToReason(error);
      const disallowed = DISALLOWED_INTENTS_PATTERN.test(detail);
      // M6: a portal-disabled privileged intent (4014) is a configuration
      // problem that will keep killing this bot. Name it distinctly so an
      // operator sees why, while still quarantining it like any failed login.
      if (disallowed) {
        logger.error({ level: 'error', event: 'bot-disallowed-intents', botId: cfg.id });
      }
      markError(cfg.id, entry);
      const reason = disallowed ? sanitizeReason(`disallowed-intents: ${detail}`) : detail;
      if (supervisor === undefined) {
        await quarantine(cfg.id, reason);
      } else {
        await supervisor.quarantineBot(cfg.id, reason);
      }
      throw error;
    }
    // A completed login is a successful tick: it clears the crash counter.
    supervisor?.handleHealthy(cfg.id);
    markReady(cfg.id, entry);
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
    entry.lifecycle = 'destroyed';
    bots.delete(id);
    destroyed.add(id);
    // Drop supervision state so a late error from the old client is ignored
    // and a fresh addBot re-arms the bot cleanly (recovery path).
    supervisor?.forget(id);
    logger.info({ level: 'info', event: 'bot-removed', botId: id });
  }

  // Reconnects a live bot in place, preserving supervision state. Deliberately
  // NOT removeBot + addBot: removeBot forget()s the crash window and addBot
  // registerBot()s a fresh one, so the pair resets the consecutive-crash
  // counter on every restart and the 5-crashes/5min quarantine can never trip
  // — an infinite restart loop instead of supervision. The supervisor's crash
  // COUNTING is left alone; only a stale quarantine flag is cleared on success.
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
    attachErrorBoundary(id, entry);
    // No quarantine and no handleHealthy here: on failure we throw so
    // supervisor.attemptRestart records restart-failed; on success the caller
    // marks the tick healthy. relogin must never decide quarantine itself.
    try {
      await client.login(token);
    } catch (error) {
      // M2: a login that fails leaves a half-connected client behind; drop it
      // exactly like addBot's failed-login path so no socket leaks while the
      // policy decides what to do next.
      await destroyQuietly(id, entry);
      markError(id, entry);
      throw error;
    }
    // A completed relogin means the bot is live again: the lifecycle machine
    // moves to ready. On failure markError above leaves it at error.
    markReady(id, entry);
    // Clear any stale quarantine so the gateway status and the supervisor
    // agree and future crashes are counted instead of silently ignored.
    entry.status = 'live';
    supervisor?.clearQuarantine(id);
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
    // others from being disconnected. destroyQuietly reports success so a
    // failed destroy is recorded as bot-disconnect-failed and never logged as
    // a successful bot-disconnected.
    const entries = [...bots.entries()];
    const failedDisconnects: string[] = [];
    await Promise.all(
      entries.map(async ([botId, entry]) => {
        const disconnected = await destroyQuietly(botId, entry);
        if (disconnected) {
          logger.info({ level: 'info', event: 'bot-disconnected', botId });
        } else {
          failedDisconnects.push(botId);
        }
      }),
    );
    // Release supervision state (and any pending restart timer) for every bot,
    // and keep the terminal state queryable after the map is cleared.
    for (const [botId, entry] of entries) {
      entry.lifecycle = 'destroyed';
      destroyed.add(botId);
      supervisor?.forget(botId);
    }
    bots.clear();
    if (flushError !== undefined) {
      throw flushError;
    }
    if (failedDisconnects.length > 0) {
      throw new Error(`shutdown disconnected with ${failedDisconnects.length} failure(s)`);
    }
  }

  function status(botId: string): LegacyBotStatus {
    const entry = bots.get(botId);
    if (entry === undefined) {
      return 'unknown';
    }
    return entry.status;
  }

  function getStatus(botId: string): BotStatus | 'unknown' {
    const entry = bots.get(botId);
    if (entry !== undefined) {
      return entry.lifecycle;
    }
    return destroyed.has(botId) ? 'destroyed' : 'unknown';
  }

  async function startAll(
    botIds: string[],
    load: (id: string) => Promise<BotConfig>,
  ): Promise<StartAllResult> {
    const started: string[] = [];
    const failed: StartAllFailure[] = [];
    // Sequential on purpose: the result order mirrors the input, and a single
    // bad token only ever fails its own iteration. Every await is wrapped so
    // neither a load failure nor an addBot rejection can escape the loop.
    for (const id of botIds) {
      let cfg: BotConfig;
      try {
        cfg = await load(id);
      } catch {
        // Closed reason vocabulary: 'load_failed' for config/token retrieval,
        // errorToReason's coded output for a login/registration failure.
        failed.push({ id, reason: 'load_failed' });
        continue;
      }
      try {
        await addBot(cfg);
      } catch (error) {
        failed.push({ id, reason: errorToReason(error) });
        continue;
      }
      started.push(id);
    }
    return { started, failed };
  }

  function botIds(): string[] {
    return [...bots.keys()];
  }

  return {
    addBot,
    removeBot,
    relogin,
    quarantine,
    shutdown,
    status,
    getStatus,
    onLifecycle,
    startAll,
    botIds,
  };
}
