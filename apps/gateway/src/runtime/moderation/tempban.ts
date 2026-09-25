// Site-engine bridge A5: temporary-ban scheduler (Postgres-ready, memory-backed).
//
// Ladder rungs 5..9 are temporary bans (1d..180d); member.ban() itself is
// permanent, so each temp ban is recorded and a 60s setInterval poll unbans
// due rows via guild.members.unban(). Only this module touches tempban state:
// index.ts calls scheduleTempban() after a successful temp ban and re-exports
// startTempbanPoll() for FeatureModule start() wiring.
//
// Persistence: the StoragePort interface below is the seam. Phase A ships the
// in-memory default (trial guild re-earns state on restart — same honesty
// rule as the other Phase A waves). The Postgres DDL for the durable table
// lives in the wave report as SQL text only — no migration is executed here.

import type { Client } from 'discord.js';

/** 60s poll floor (same as the trial reference; never setTimeout chains). */
export const TEMPBAN_POLL_MS = 60 * 1000;

export interface TempbanEntry {
  guildId: string;
  userId: string;
  /** Epoch-ms at which the user must be unbanned. */
  unbanAtMs: number;
  reason: string;
}

export interface TempbanStorage {
  list(): Promise<TempbanEntry[]>;
  add(entry: TempbanEntry): Promise<void>;
  remove(guildId: string, userId: string): Promise<void>;
}

/** Alias: the persistence seam the module (and future Postgres backing) uses. */
export type StoragePort = TempbanStorage;

/** Phase A default: process-local map, deduped by guildId+userId. */
export class InMemoryTempbanStorage implements TempbanStorage {
  private readonly rows = new Map<string, TempbanEntry>();

  private static key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  async list(): Promise<TempbanEntry[]> {
    return [...this.rows.values()];
  }

  async add(entry: TempbanEntry): Promise<void> {
    this.rows.set(InMemoryTempbanStorage.key(entry.guildId, entry.userId), entry);
  }

  async remove(guildId: string, userId: string): Promise<void> {
    this.rows.delete(InMemoryTempbanStorage.key(guildId, userId));
  }
}

export interface TempbanLogger {
  info(record: { event: string; guildId?: string; userId?: string }): void;
  error(record: { event: string; guildId?: string; userId?: string; reason?: string }): void;
}

export interface PollTempbansOptions {
  logger?: TempbanLogger;
  /** Injectable clock so tests are deterministic. */
  now?: () => number;
}

function safeLogInfo(
  logger: TempbanLogger | undefined,
  record: { event: string; guildId?: string; userId?: string },
): void {
  try {
    logger?.info(record);
  } catch {
    // Logger failure never breaks the poll.
  }
}

function safeLogError(
  logger: TempbanLogger | undefined,
  record: { event: string; guildId?: string; userId?: string; reason?: string },
): void {
  try {
    logger?.error(record);
  } catch {
    // Logger failure never breaks the poll.
  }
}

function toReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUnbannableGuild(
  guild: unknown,
): guild is { members: { unban(userId: string, reason?: string): Promise<unknown> } } {
  if (typeof guild !== 'object' || guild === null) return false;
  const members = (guild as { members?: unknown }).members;
  if (typeof members !== 'object' || members === null) return false;
  return typeof (members as { unban?: unknown }).unban === 'function';
}

/**
 * Schedule (or replace) a temp ban. Never throws: persistence failure only
 * loses the scheduled unban (the ban itself already landed).
 */
export async function scheduleTempban(
  storage: TempbanStorage,
  entry: TempbanEntry,
  logger?: TempbanLogger,
): Promise<void> {
  try {
    await storage.add(entry);
  } catch (err) {
    safeLogError(logger, {
      event: 'moderation-tempban-schedule-failed',
      guildId: entry.guildId,
      userId: entry.userId,
      reason: toReason(err),
    });
  }
}

/**
 * One poll tick: unban every due row. Per-row try/catch — one bad row never
 * stops the rest. A row whose unban throws (already unbanned, missing perms)
 * is still dropped so it cannot retry forever. A row whose guild cannot be
 * fetched is kept for the next tick.
 */
export async function pollTempbans(
  client: Client,
  storage: TempbanStorage,
  opts: PollTempbansOptions = {},
): Promise<void> {
  const now = opts.now ?? Date.now;
  let at = 0;
  try {
    at = now();
  } catch {
    return;
  }
  let rows: TempbanEntry[];
  try {
    rows = await storage.list();
  } catch (err) {
    safeLogError(opts.logger, { event: 'moderation-tempban-list-failed', reason: toReason(err) });
    return;
  }
  for (const entry of rows) {
    if (!Number.isFinite(entry.unbanAtMs) || entry.unbanAtMs > at) continue;
    let guild: unknown;
    try {
      guild = await client.guilds.fetch(entry.guildId);
    } catch (err) {
      safeLogError(opts.logger, {
        event: 'moderation-tempban-guild-error',
        guildId: entry.guildId,
        userId: entry.userId,
        reason: toReason(err),
      });
      continue;
    }
    if (!isUnbannableGuild(guild)) {
      safeLogError(opts.logger, {
        event: 'moderation-tempban-guild-error',
        guildId: entry.guildId,
        userId: entry.userId,
        reason: 'guild unresolvable',
      });
      continue;
    }
    try {
      await guild.members.unban(entry.userId, 'Temp-ban expired');
    } catch (err) {
      safeLogError(opts.logger, {
        event: 'moderation-tempban-unban-error',
        guildId: entry.guildId,
        userId: entry.userId,
        reason: toReason(err),
      });
    }
    try {
      await storage.remove(entry.guildId, entry.userId);
    } catch (err) {
      safeLogError(opts.logger, {
        event: 'moderation-tempban-remove-failed',
        guildId: entry.guildId,
        userId: entry.userId,
        reason: toReason(err),
      });
    }
    safeLogInfo(opts.logger, {
      event: 'moderation-tempban-expired',
      guildId: entry.guildId,
      userId: entry.userId,
    });
  }
}

export interface StartTempbanPollOptions extends PollTempbansOptions {
  intervalMs?: number;
}

/**
 * Start the 60s poll loop. One setInterval per call (never setTimeout
 * chains); the returned handle stops it. Called from the module start()
 * (never from a ready listener — the composition root owns ready).
 */
export function startTempbanPoll(
  client: Client,
  storage: TempbanStorage,
  opts: StartTempbanPollOptions = {},
): { stop(): void } {
  const intervalMs = opts.intervalMs ?? TEMPBAN_POLL_MS;
  const timer = setInterval(() => {
    void pollTempbans(client, storage, opts).catch((err: unknown) => {
      safeLogError(opts.logger, {
        event: 'moderation-tempban-poll-error',
        reason: toReason(err),
      });
    });
  }, intervalMs);
  // Never hold the process open for the poll alone (same idiom as the trial
  // reference). Guarded: vitest fake-timer handles may lack unref.
  try {
    const maybeUnref = timer as unknown as { unref?: () => void };
    if (typeof maybeUnref.unref === 'function') {
      maybeUnref.unref();
    }
  } catch {
    // Ignore — stop() still halts the loop.
  }
  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
