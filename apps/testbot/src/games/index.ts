// Games module barrel (apps/testbot/src/games/index.ts).
// Core imports these arrays; games never imports core.

import { balanceCommand, leaderboardCommand, rankCommand, xpMessageCreateEvent } from './xp.js';
import { giveawayCommand, startGiveawayPoll, stopGiveawayPoll } from './giveaway.js';
import type { BotCommand } from '../core/registry.js';

export const commands: BotCommand[] = [
  rankCommand,
  balanceCommand,
  leaderboardCommand,
  giveawayCommand,
];

export const events = [xpMessageCreateEvent];

export {
  balanceCommand,
  giveawayCommand,
  leaderboardCommand,
  rankCommand,
  xpMessageCreateEvent,
  startGiveawayPoll,
  stopGiveawayPoll,
};
