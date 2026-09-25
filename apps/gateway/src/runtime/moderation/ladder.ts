// Site-engine bridge A5: strike ladder → punishment resolution.
//
// Pure functions only: no discord.js import, no I/O, no timers. Shapes
// ported from the trial bot; testbot is never imported.
//
// Ladder (strike count → punishment):
//   1 → mute 5m · 2 → mute 30m · 3 → mute 3h · 5 → ban 1d · 6 → ban 1w
//   7 → ban 2w · 8 → ban 60d · 9 → ban 180d · 11 → permanent ban.
// Gap-tolerant downward lookup: the highest rung whose strikes value is <=
// the input (4 resolves as 3, 10 as 9, 12+ as 11). Counts < 1 → null.

export type PunishmentKind = 'mute' | 'ban';

export interface Punishment {
  /** Ladder rung this resolved from (post gap-folding, e.g. input 4 → 3). */
  strikes: number;
  kind: PunishmentKind;
  /** Mute/ban duration in ms; null = permanent (permaban only). */
  durationMs: number | null;
  reason: string;
}

interface LadderRung {
  strikes: number;
  kind: PunishmentKind;
  durationMs: number | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const LADDER: readonly LadderRung[] = [
  { strikes: 1, kind: 'mute', durationMs: 5 * MINUTE_MS },
  { strikes: 2, kind: 'mute', durationMs: 30 * MINUTE_MS },
  { strikes: 3, kind: 'mute', durationMs: 3 * HOUR_MS },
  { strikes: 5, kind: 'ban', durationMs: DAY_MS },
  { strikes: 6, kind: 'ban', durationMs: 7 * DAY_MS },
  { strikes: 7, kind: 'ban', durationMs: 14 * DAY_MS },
  { strikes: 8, kind: 'ban', durationMs: 60 * DAY_MS },
  { strikes: 9, kind: 'ban', durationMs: 180 * DAY_MS },
  { strikes: 11, kind: 'ban', durationMs: null },
];

/** Discord caps communication-disabled (timeout) at 28 days. */
export const TIMEOUT_MAX_MS = 28 * DAY_MS;

function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / MINUTE_MS);
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours < 24) return `${hours}h`;
    if (hours % 24 === 0) return `${hours / 24}d`;
  }
  return `${minutes}m`;
}

function describe(kind: PunishmentKind, durationMs: number | null): string {
  if (durationMs === null) return 'permanent ban';
  return `${kind} ${formatDuration(durationMs)}`;
}

/**
 * Resolve the punishment for a strike count. Gap-tolerant downward:
 * returns the rung with the highest strikes value <= the floored input.
 * Returns null for 0, negative, NaN, or non-finite input.
 */
export function nextPunishment(strikes: number): Punishment | null {
  const count = Math.floor(strikes);
  if (!Number.isFinite(count) || count < 1) return null;
  let best: LadderRung | null = null;
  for (const rung of LADDER) {
    if (rung.strikes <= count && (best === null || rung.strikes > best.strikes)) {
      best = rung;
    }
  }
  if (best === null) return null;
  return {
    strikes: best.strikes,
    kind: best.kind,
    durationMs: best.durationMs,
    reason: describe(best.kind, best.durationMs),
  };
}

/** One-line human description of a resolved punishment. */
export function describePunishment(p: Punishment): string {
  return describe(p.kind, p.durationMs);
}
