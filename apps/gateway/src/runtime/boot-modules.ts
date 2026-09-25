// Site-engine bridge wiring: composition root for per-bot feature modules.
//
// composeBotModules() returns a FRESH array of the 7 built FeatureModules in
// kind order (welcome, moderation, xp, giveaway, connector, tickets,
// reaction-roles). attachBotModules()
// wires them onto the REAL discord.js Client via loadBot and returns stop.
// BOOT_CONFIG_SQL selects this bot's runtime-config rows from
// bot_runtime_config. The ready-handler lives in start.ts (composition root
// owns ready); this module only composes and attaches.

import type { Client } from 'discord.js';
import type { RuntimeConfigRow } from './config.js';
import { createConnectorModule } from './connector/index.js';
import { buildGiveawayModule } from './games/giveaway.js';
import { buildXpModule } from './games/xp.js';
import { loadBot } from './loaders.js';
import type { LoadBotOptions } from './loaders.js';
import { buildModerationModule } from './moderation/index.js';
import { buildReactionRolesModule } from './reaction-roles/handler.js';
import type { FeatureModule } from './registry.js';
import { buildTicketsModule } from './tickets/handler.js';
import { buildWelcomeModule } from './welcome/handler.js';

export const BOOT_CONFIG_SQL =
  'SELECT bot_id AS "botId", guild_id AS "guildId", kind, params, spec_version AS "specVersion" ' +
  'FROM bot_runtime_config WHERE bot_id = $1';

export function composeBotModules(): FeatureModule[] {
  return [
    buildWelcomeModule(),
    buildModerationModule(),
    buildXpModule(),
    buildGiveawayModule(),
    createConnectorModule(),
    buildTicketsModule(),
    buildReactionRolesModule(),
  ];
}

export function attachBotModules(
  client: Client,
  configs: RuntimeConfigRow[],
  opts: LoadBotOptions = {},
): () => void {
  return loadBot(client, composeBotModules(), configs, opts).stop;
}
