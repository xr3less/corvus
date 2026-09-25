// Welcome module barrel (apps/testbot/src/welcome/index.ts).
// Core imports these arrays; welcome never imports core.

import { guildMemberAddEvent } from './greet.js';
import type { BotCommand, BotEvent } from '../core/registry.js';

export const commands: BotCommand[] = [];

export const events: BotEvent[] = [guildMemberAddEvent];

export { guildMemberAddEvent };
