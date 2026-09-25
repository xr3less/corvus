// Site-engine bridge A3: composed feature-module list. Sequential wiring now done 2026-09-20.
//
// APPEND PROTOCOL: a later sequential wiring task appends one import plus one
// entry per handler wave (welcome, moderation, games, connector). Parallel
// handler waves never touch this file — each wave implements its module in its
// own directory and the sequential wiring task composes them here. An empty
// list must compile and must deploy as an empty PUT body.

import type { FeatureModule } from './registry.js';
import { buildWelcomeModule } from './welcome/handler.js';
import { buildModerationModule } from './moderation/index.js';
import { buildXpModule } from './games/xp.js';
import { buildGiveawayModule } from './games/giveaway.js';
import { createConnectorModule } from './connector/index.js';
import { buildReactionRolesModule } from './reaction-roles/handler.js';
import { buildTicketsModule } from './tickets/handler.js';

export const FEATURE_MODULES: FeatureModule[] = [
  buildWelcomeModule(),
  buildModerationModule(),
  buildXpModule(),
  buildGiveawayModule(),
  createConnectorModule(),
  buildTicketsModule(),
  buildReactionRolesModule(),
];
