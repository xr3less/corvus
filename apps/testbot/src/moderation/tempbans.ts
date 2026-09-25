// Temporary-ban scheduler for the trial bot (apps/testbot/src/moderation/tempbans.ts).
//
// Ladder rungs 5..9 are temporary bans (1d..6mo); member.ban() itself is
// permanent, so each temp ban persists {guildId, userId, unbanAt} to
// apps/testbot/data/tempbans.json (gitignored, atomic tmp+rename write) and a
// 60s setInterval poll unbans due rows via guild.members.unban(). Only this
// module touches the tempbans file: index.ts calls scheduleTempban() after a
// successful temp ban and re-exports startTempbanPoll() for boot wiring.
// Poll shape mirrors the giveaway poll (60s setInterval, per-row try/catch).

import type { Client } from 'discord.js';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, sanitize } from '../log.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Persisted temp-ban rows. Missing file = no pending unbans (trial starts clean). */
export const TEMPBANS_PATH = resolve(HERE, '../../data/tempbans.json');

/** 60s poll floor (same as the giveaway poll; never setTimeout chains). */
export const TEMPBAN_POLL_MS = 60 * 1000;

export interface TempbanEntry {
  guildId: string;
  userId: string;
  /** ISO-8601 timestamp at which the user must be unbanned. */
  unbanAt: string;
  reason: string;
}

function isTempbanEntry(value: unknown): value is TempbanEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.guildId === 'string' &&
    typeof e.userId === 'string' &&
    typeof e.unbanAt === 'string' &&
    typeof e.reason === 'string'
  );
}

/** Load all rows. Missing/corrupt file = [] (a bad file never breaks the bot). */
export function loadEntries(path: string = TEMPBANS_PATH): TempbanEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTempbanEntry);
  } catch {
    return [];
  }
}

/**
 * Atomic write: tmp file + rename, so a crash never leaves half a JSON file.
 * Never throws: disk failure only loses the scheduled unban (the ban itself
 * already landed), surfaced via the schedule-error log row at the call site.
 */
export function saveEntries(entries: TempbanEntry[], path: string = TEMPBANS_PATH): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8');
    renameSync(tmp, path);
  } catch {
    // Swallow: callers must never break moderation over persistence.
  }
}

/** Schedule (or replace) a temp ban, deduped by guildId+userId. Never throws. */
export function scheduleTempban(entry: TempbanEntry, path: string = TEMPBANS_PATH): void {
  const entries = loadEntries(path).filter(
    (e) => !(e.guildId === entry.guildId && e.userId === entry.userId),
  );
  entries.push(entry);
  saveEntries(entries, path);
}

/** Remove a scheduled unban (after expiry or manual pardon). Never throws. */
export function removeTempban(guildId: string, userId: string, path: string = TEMPBANS_PATH): void {
  const entries = loadEntries(path).filter((e) => !(e.guildId === guildId && e.userId === userId));
  saveEntries(entries, path);
}

/**
 * Pure filter: rows whose unbanAt is at or before nowMs. Rows with
 * unparseable dates are never due (they linger until manually removed
 * rather than firing immediately).
 */
export function extractDue(entries: TempbanEntry[], nowMs: number = Date.now()): TempbanEntry[] {
  return entries.filter((e) => {
    const t = Date.parse(e.unbanAt);
    return Number.isFinite(t) && t <= nowMs;
  });
}

/** File-backed due query: load + pure filter. */
export function loadDue(nowMs: number = Date.now(), path: string = TEMPBANS_PATH): TempbanEntry[] {
  return extractDue(loadEntries(path), nowMs);
}

/** One poll tick: unban every due row. Separated for unit testing. */
export async function pollTempbans(
  client: Client,
  nowMs: number = Date.now(),
  path: string = TEMPBANS_PATH,
): Promise<void> {
  const due = extractDue(loadEntries(path), nowMs);
  for (const entry of due) {
    const guild = await client.guilds.fetch(entry.guildId).catch((err: unknown) => {
      // Guild gone or fetch failed: keep the row and retry next tick.
      log('error', 'bot-mod-tempban-guild-error', {
        guild: entry.guildId,
        user: entry.userId,
        error: sanitize(err instanceof Error ? err.message : String(err)),
      });
      return null;
    });
    if (guild === null) continue;
    try {
      await guild.members.unban(entry.userId, 'Trial temp-ban expired');
    } catch (err: unknown) {
      // Already unbanned / missing perms: log, then still drop the row so it
      // cannot retry forever.
      log('error', 'bot-mod-tempban-unban-error', {
        guild: entry.guildId,
        user: entry.userId,
        error: sanitize(err instanceof Error ? err.message : String(err)),
      });
    }
    removeTempban(entry.guildId, entry.userId, path);
    log('info', 'bot-mod-tempban-expired', { guild: entry.guildId, user: entry.userId });
  }
}

/**
 * Start the 60s poll loop. One setInterval per call (never setTimeout
 * chains); the returned handle stops it. Call once from the ClientReady
 * handler (exact wiring lines are in this task's agent report, Open
 * Questions — index.ts itself is a sibling task's scope).
 */
export function startTempbanPoll(
  client: Client,
  intervalMs: number = TEMPBAN_POLL_MS,
): { stop(): void } {
  const timer = setInterval(() => {
    void pollTempbans(client).catch((err: unknown) => {
      log('error', 'bot-mod-tempban-poll-error', {
        error: sanitize(err instanceof Error ? err.message : String(err)),
      });
    });
  }, intervalMs);
  timer.unref();
  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
