// discord.js Client builder for the trial bot (apps/testbot).
// Owns intents/partials in one place. Unknown intent names from config fail
// fast with a clear Error — intents must never silently become undefined
// (undefined intents throw ClientMissingIntents at construction).

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { INTENT_NAMES } from './config.js';

const INTENT_BY_NAME: Record<string, GatewayIntentBits> = {
  Guilds: GatewayIntentBits.Guilds,
  GuildMembers: GatewayIntentBits.GuildMembers,
  GuildMessages: GatewayIntentBits.GuildMessages,
  MessageContent: GatewayIntentBits.MessageContent,
  GuildMessageReactions: GatewayIntentBits.GuildMessageReactions,
};

export function buildClient(): Client {
  const intents = INTENT_NAMES.map((name) => {
    const bits: GatewayIntentBits | undefined = INTENT_BY_NAME[name];
    if (bits === undefined) {
      throw new Error(`Unknown intent name in config: ${name}`);
    }
    return bits;
  });
  return new Client({ intents, partials: [Partials.GuildMember] });
}
