// Strike ladder for the trial bot (apps/testbot/src/moderation/ladder.ts).
//
// Shape (from OSS brief, aternosorg/modbot behavioural shape only):
// - Ladder DATA lives in config.ts STRIKE_LADDER (single source of truth);
//   this module only resolves and describes it, so the ladder can be edited
//   without rewriting logic.
// - Gap-tolerant downward lookup: the highest entry whose strikes value is
//   <= the user's strike count (modbot GuildSettings.findPunishment shape).
// - Pure functions only: no discord.js import, no env reads, no I/O.

import { STRIKE_LADDER } from '../config.js';
import type { StrikeEntry } from '../config.js';

/**
 * Resolved punishment for a strike count. `kind` mirrors the config
 * StrikeEntry `action`; `reason` is the one-line human description
 * produced by describeAction (kept on the object so callers can DM/log it
 * without recomputing).
 */
export interface StrikeAction {
  strikes: number;
  kind: 'mute' | 'ban';
  /** Mute/ban duration in ms; null = permanent (permaban only). */
  durationMs: number | null;
  reason: string;
}

/** Compact duration: 5m, 30m, 3h, 1d, 7d, 60d, 180d. Falls back to minutes. */
function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours < 24) return `${hours}h`;
    if (hours % 24 === 0) return `${hours / 24}d`;
  }
  return `${minutes}m`;
}

function formatPunishment(kind: 'mute' | 'ban', durationMs: number | null): string {
  if (durationMs === null) return 'permanent ban';
  return `${kind} ${formatDuration(durationMs)}`;
}

/**
 * Resolve the punishment for a strike count. Returns the entry with the
 * highest strikes value <= the input (gap-tolerant: 4 falls back to the
 * 3-strike rung). Returns null for 0, negative, NaN, or non-positive input.
 */
export function lookupAction(strikes: number): StrikeAction | null {
  const count = Math.floor(strikes);
  if (!Number.isFinite(count) || count < 1) return null;
  let best: StrikeEntry | null = null;
  for (const entry of STRIKE_LADDER) {
    if (entry.strikes <= count && (best === null || entry.strikes > best.strikes)) {
      best = entry;
    }
  }
  if (best === null) return null;
  return {
    strikes: best.strikes,
    kind: best.action,
    durationMs: best.durationMs,
    reason: formatPunishment(best.action, best.durationMs),
  };
}

/** One-line human description of a resolved action ("mute 30m", "permanent ban"). */
export function describeAction(a: StrikeAction): string {
  return formatPunishment(a.kind, a.durationMs);
}
