// Trial-only tunables for the standalone test bot (apps/testbot).
// Plain data: no discord.js import, so this file typechecks before install.

/** Trial guild (empty sandbox guild). All commands register guild-scoped here. */
export const TRIAL_GUILD_ID: string = '1051424774426992723';

/** Intent names (string form; client.ts maps them to GatewayIntentBits). */
export const INTENT_NAMES: string[] = [
  'Guilds',
  'GuildMembers',
  'GuildMessages',
  'MessageContent',
  'GuildMessageReactions',
];

export type StrikeAction = 'mute' | 'ban';

export interface StrikeEntry {
  strikes: number;
  action: StrikeAction;
  /** Mute/ban duration in ms; null = permanent (permaban only). */
  durationMs: number | null;
}

/**
 * Strike ladder (gap-tolerant downward lookup: use the highest entry
 * whose strikes value is <= the user's strike count).
 */
export const STRIKE_LADDER: StrikeEntry[] = [
  { strikes: 1, action: 'mute', durationMs: 5 * 60 * 1000 },
  { strikes: 2, action: 'mute', durationMs: 30 * 60 * 1000 },
  { strikes: 3, action: 'mute', durationMs: 3 * 60 * 60 * 1000 },
  { strikes: 5, action: 'ban', durationMs: 24 * 60 * 60 * 1000 },
  { strikes: 6, action: 'ban', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { strikes: 7, action: 'ban', durationMs: 14 * 24 * 60 * 60 * 1000 },
  { strikes: 8, action: 'ban', durationMs: 60 * 24 * 60 * 60 * 1000 },
  { strikes: 9, action: 'ban', durationMs: 180 * 24 * 60 * 60 * 1000 },
  { strikes: 11, action: 'ban', durationMs: null },
];

/** Small trial-only seeded bad-word list (lowercase, obvious English profanity). */
export const TRIAL_BAD_WORDS: string[] = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'slut',
  'whore',
];

/** XP: 1 per message (2 for boosters), one award per user per 30s, cap 1e9. */
export const XP_PER_MESSAGE: number = 1;
export const XP_BOOSTER: number = 2;
export const XP_COOLDOWN_MS: number = 30 * 1000;
export const XP_CAP: number = 1e9;
/** Level formula: level = floor(LEVEL_K * sqrt(totalXp)). */
export const LEVEL_K: number = 0.42;
/** Currency paid on level-up: level * CURRENCY_PER_LEVEL. */
export const CURRENCY_PER_LEVEL: number = 42;

/** Connector (game-agnostic) defaults. */
export const POLL_SECONDS: number = 60;
export const EMBED_REFRESH_SECONDS: number = 300;
export const TIMEOUT_MS: number = 5000;
export const RETRIES: number = 2;
export const WARN_AFTER: number = 3;
export const DOWN_AFTER: number = 10;
