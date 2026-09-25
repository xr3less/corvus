// Site-engine bridge A3: single-listener InteractionCreate dispatcher. (e5a1)
//
// Shape: ignore non-chat-input → lookup by commandName (missing = log plus
// return) → per-user per-command cooldown check (denied = ephemeral reply) →
// defer-first acknowledge (deferReply before execute, so handlers slower than
// ~3s never hit Discord 10062 Unknown Interaction) → try/catch execute (called
// at most once per interaction; 429 retry applies ONLY to the ack and the
// honest error reply, never to execute) with nested-try honest error reply branching on
// interaction.replied||interaction.deferred (followUp vs reply, ephemeral).
// The error reply itself sits in a bare try/catch so it can never escape.

import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import type { BotCommand, Registry } from './registry.js';

export interface DispatcherLogger {
  info(record: { event: string; command?: string }): void;
  error(record: { event: string; command?: string; reason?: string }): void;
}

export interface DispatcherOptions {
  logger?: DispatcherLogger;
  /** Injectable clock so cooldown tests are deterministic. */
  now?: () => number;
  /** Bounded Discord 429 retries per ack/reply step (default 2). Never wraps execute. */
  maxRateLimitRetries?: number;
  /** Injectable sleep so backoff tests stay instant (default setTimeout). */
  sleep?: (ms: number) => Promise<void>;
}

export interface Dispatcher {
  handleInteraction: (interaction: Interaction) => Promise<void>;
}

// Gateway log-redaction idiom (see gateway.ts sanitizeReason): token-like runs
// never land in a log line verbatim.
const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_.-]{24,}/g;

function sanitize(value: string): string {
  return value.replace(TOKEN_LIKE_PATTERN, '[redacted]');
}

// Cooldown sweep horizon: entries older than this can never deny a future
// call (no real command sets a cooldown longer than an hour), so they are
// dropped lazily on each dispatch. Bounded, no timer, no leak.
const MAX_COOLDOWN_TRACK_MS = 60 * 60 * 1000;

// e5a1: 429 backoff bounds. retryAfter on the @discordjs/rest RateLimitError is
// milliseconds; the raw Discord retry_after field is seconds (handled
// separately). Each wait is capped so a pathological header cannot stall the
// event loop, and the retry count is small so the dispatcher stays responsive.
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRY_AFTER_MS = 10_000;

/**
 * Extract the backoff delay for a Discord 429, or null when the error is not
 * rate-limit related. Duck-typed (name/status/retryAfter) so it matches both
 * the @discordjs/rest RateLimitError and raw 429 shapes without importing the
 * REST package — non-429 errors always return null and are never retried.
 */
function getRateLimitDelayMs(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const record = err as Record<string, unknown>;
  const name =
    err instanceof Error ? err.name : typeof record['name'] === 'string' ? record['name'] : '';
  if (name !== 'RateLimitError' && record['status'] !== 429) return null;
  const retryAfterMs = record['retryAfter'];
  if (
    typeof retryAfterMs === 'number' &&
    Number.isFinite(retryAfterMs) &&
    retryAfterMs >= 0
  ) {
    return Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
  }
  const retryAfterSec = record['retry_after'];
  if (
    typeof retryAfterSec === 'number' &&
    Number.isFinite(retryAfterSec) &&
    retryAfterSec >= 0
  ) {
    return Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
}

export function createDispatcher(registry: Registry, opts: DispatcherOptions = {}): Dispatcher {
  const logger = opts.logger;
  const now = opts.now ?? Date.now;
  const maxRateLimitRetries = opts.maxRateLimitRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // m-31: cooldown entries are keyed per user+command; a failed execute never
  // consumes the window (stamp lands after success), and entries are evicted
  // lazily — a stamp is kept only while a later call could still be inside its
  // own window, so the map stays bounded by live users, not history. Exact
  // eviction timing is lazy (not a timer) so there is no handle to leak.
  const lastUsed = new Map<string, number>();

  function evictStaleEntries(at: number): void {
    try {
      for (const [key, stamp] of lastUsed) {
        if (at - stamp > MAX_COOLDOWN_TRACK_MS) lastUsed.delete(key);
      }
    } catch {
      // Eviction is best-effort; a failed sweep never blocks the command.
    }
  }

  // e5a1r: run an ack/reply Discord step with bounded 429 backoff. Never wraps
  // execute() (a retry there would re-run handler side effects). Non-429 errors
  // propagate immediately (never retried); 429s sleep retry-after and retry up
  // to maxRateLimitRetries, then rethrow for the honest-error path.
  async function withRateLimitRetry<T>(commandName: string, step: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await step();
      } catch (err: unknown) {
        const delayMs = getRateLimitDelayMs(err);
        if (delayMs === null || attempt >= maxRateLimitRetries) throw err;
        attempt += 1;
        logger?.info({ event: 'dispatcher-rate-limit-backoff', command: commandName });
        await sleep(delayMs);
      }
    }
  }

  function isRateLimited(err: unknown): boolean {
    return getRateLimitDelayMs(err) !== null;
  }

  // e5a1 defer-first: acknowledge within Discord's ~3s window BEFORE execute,
  // so slow handlers never trigger 10062 Unknown Interaction. Throws the
  // original error when acknowledgement fails (after 429 backoff); the caller
  // converts that to the honest error reply without running the handler,
  // because executing with a dead token could never deliver a result.
  async function acknowledge(
    interaction: ChatInputCommandInteraction,
    commandName: string,
  ): Promise<void> {
    if (interaction.replied || interaction.deferred) return;
    // Real Discord interactions always expose deferReply; the guard keeps the
    // dispatcher total against doubles that do not (pre-e5a1 unit fakes).
    const defer = (interaction as unknown as { deferReply?: unknown }).deferReply;
    if (typeof defer !== 'function') return;
    await withRateLimitRetry(commandName, () => interaction.deferReply());
  }

  async function replyHonestError(
    interaction: ChatInputCommandInteraction,
    commandName: string,
    rateLimited: boolean,
  ): Promise<void> {
    const payload = {
      content: rateLimited
        ? 'Discord is rate-limiting commands right now — please try again shortly.'
        : 'There was an error while executing this command.',
      flags: MessageFlags.Ephemeral,
    } as const;
    try {
      if (interaction.replied || interaction.deferred) {
        await withRateLimitRetry(commandName, () => interaction.followUp(payload));
      } else {
        await withRateLimitRetry(commandName, () => interaction.reply(payload));
      }
    } catch {
      // The error reply itself must never escape the dispatcher.
    }
  }

  // Returns true when execute succeeded (the caller stamps the cooldown
  // window); false on any failure, which never consumes the window (m-31).
  async function runCommand(
    interaction: ChatInputCommandInteraction,
    command: BotCommand,
    commandName: string,
  ): Promise<boolean> {
    try {
      await acknowledge(interaction, commandName);
    } catch (err: unknown) {
      const reason = sanitize(err instanceof Error ? err.message : String(err));
      logger?.error({ event: 'dispatcher-ack-error', command: commandName, reason });
      await replyHonestError(interaction, commandName, isRateLimited(err));
      return false;
    }
    try {
      // e5a1r: execute runs exactly once per interaction. A 429 thrown
      // mid-handler is NOT retried here (retrying would re-run handler side
      // effects like ticket opens or role grants); 429 retry applies only to
      // the ack (above) and the honest error reply (below).
      await command.execute(interaction);
      return true;
    } catch (err: unknown) {
      const reason = sanitize(err instanceof Error ? err.message : String(err));
      logger?.error({ event: 'dispatcher-command-error', command: commandName, reason });
      await replyHonestError(interaction, commandName, isRateLimited(err));
      return false;
    }
  }

  async function handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const rawName = interaction.commandName;
    const commandName = sanitize(rawName);
    const command = registry.commands.get(rawName);
    if (command === undefined) {
      logger?.info({ event: 'dispatcher-unknown-command', command: commandName });
      return;
    }

    const cooldownMs = (command.cooldownSeconds ?? 0) * 1000;
    evictStaleEntries(now());
    if (cooldownMs > 0) {
      const key = `${rawName}:${interaction.user.id}`;
      const at = now();
      const last = lastUsed.get(key) ?? Number.NEGATIVE_INFINITY;
      if (at - last < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (at - last)) / 1000);
        try {
          await withRateLimitRetry(commandName, () =>
            interaction.reply({
              content: `Slow down — try again in ${remaining}s.`,
              flags: MessageFlags.Ephemeral,
            }),
          );
        } catch {
          // The denial already stands; a failed deny-reply must never throw.
        }
        return;
      }
      // m-31: stamp AFTER a successful execute, so a throwing command does not
      // consume the caller's window. The pre-check above only reads.
      if (await runCommand(interaction, command, commandName)) {
        lastUsed.set(key, at);
      }
      return;
    }

    await runCommand(interaction, command, commandName);
  }

  return { handleInteraction };
}
