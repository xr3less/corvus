// Gateway welcome module barrel (site-engine bridge A4).
// Re-exports the FeatureModule builder plus the pure text resolver.

export { buildWelcomeModule, parseWelcomeParams, resolveWelcomeText } from './handler.js';
export type { WelcomeLogger, WelcomeModuleOptions } from './handler.js';
export {
  buildWelcomeEmbed,
  DEFAULT_WELCOME_TEMPLATE,
  isRaidMode,
  parse,
  RAID_JOIN_THRESHOLD,
  RAID_WINDOW_MS,
  shortenText,
  WELCOME_DESCRIPTION_LIMIT,
} from './greet.js';
