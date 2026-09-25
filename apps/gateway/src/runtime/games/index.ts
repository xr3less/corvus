// Gateway games module barrel (site-engine bridge A6).
// Re-exports the kind-xp and kind-giveaway FeatureModule builders plus the
// pure helpers tests and sibling waves use. No ready listener: start() on
// each module is called by the loader.

export {
  applyLevelRoles,
  awardXp,
  buildXpModule,
  CURRENCY_PER_LEVEL,
  InMemoryXpStore,
  levelFor,
  LEVEL_K,
  parseXpParams,
  resolveLevelRoleIds,
  tryAwardXp,
  xpForLevel,
  XP_CAP,
  XP_COOLDOWN_MS,
  XpCooldowns,
} from './xp.js';
export type {
  AwardResult,
  GuildXpRow,
  LevelRoleEntry,
  TryAwardResult,
  XpLogger,
  XpModuleOptions,
  XpParams,
  XpRecord,
  XpStore,
} from './xp.js';
export {
  buildEndedEmbed,
  buildGiveawayEmbed,
  buildGiveawayModule,
  drawWinners,
  ENTRY_EMOJI_DEFAULT,
  findDue,
  GIVEAWAY_MAX_HOURS,
  GIVEAWAY_MAX_WINNERS,
  GIVEAWAY_MIN_HOURS,
  InMemoryGiveawayStore,
  parseGiveawayParams,
  POLL_MS,
  pollGiveaways,
  startGiveawayPoll,
} from './giveaway.js';
export type {
  ExpireResult,
  GiveawayLogger,
  GiveawayModuleOptions,
  GiveawayParams,
  GiveawayRow,
  GiveawayStore,
  PollGiveawaysOptions,
} from './giveaway.js';
