// Composition root for the standalone trial bot (apps/testbot/src/index.ts).
// Wires config -> client -> dispatcher -> login. Feature modules are imported
// as command/event arrays only (core imports features; features never import
// core). Commands are NEVER registered here — use deploy-commands.ts, a
// standalone script, so a reboot can never wipe or duplicate guild commands.

// Trial-only: broken local DNS (ISP resolver blackholes discord.com) — patch
// dns.lookup via public DNS before any network module initializes.
import './dns-fix.js';
import { Events } from 'discord.js';
import type { Client, ClientEvents } from 'discord.js';
import { buildClient } from './client.js';
import { createDispatcher } from './core/dispatcher.js';
import type { BotCommand, BotEvent } from './core/registry.js';
import { log, logShardError, sanitize } from './log.js';
import { commands as connectorCommands, events as connectorEvents } from './connector/index.js';
import { startPolling } from './connector/index.js';
import {
  commands as gamesCommands,
  events as gamesEvents,
  startGiveawayPoll,
  stopGiveawayPoll,
} from './games/index.js';
import {
  commands as moderationCommands,
  events as moderationEvents,
  startTempbanPoll,
} from './moderation/index.js';
import { commands as welcomeCommands, events as welcomeEvents } from './welcome/index.js';

const token = process.env.TESTBOT_TOKEN;
const guildId = process.env.TESTBOT_GUILD_ID;
if (token === undefined || token === '' || guildId === undefined || guildId === '') {
  console.error(
    'Missing required environment variables: TESTBOT_TOKEN and TESTBOT_GUILD_ID must be set.',
  );
  process.exit(1);
}

const allCommands: BotCommand[] = [
  ...welcomeCommands,
  ...moderationCommands,
  ...gamesCommands,
  ...connectorCommands,
];

const allEvents: BotEvent[] = [
  ...welcomeEvents,
  ...moderationEvents,
  ...gamesEvents,
  ...connectorEvents,
];

/**
 * Bind one feature event to the client with once/on per its flag. The handler
 * is wrapped so a throwing execute() is logged and swallowed — a feature bug
 * must never crash the process or break other events.
 */
function bindFeatureEvents(client: Client, events: BotEvent[]): void {
  for (const event of events) {
    const handler = (...args: ClientEvents[typeof event.name]): void => {
      void Promise.resolve()
        .then(() => event.execute(...args))
        .catch((err: unknown) => {
          log('error', 'bot-event-error', {
            event: String(event.name),
            error: sanitize(err instanceof Error ? err.message : String(err)),
          });
        });
    };
    if (event.once === true) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }
  }
}

const client: Client = buildClient();
const dispatcher = createDispatcher(allCommands);
let tempbanPoll: { stop(): void } | null = null;

client.once(Events.ClientReady, (readyClient) => {
  log('info', 'bot-ready', { tag: readyClient.user.tag, guild: guildId });
  startGiveawayPoll(client);
  tempbanPoll = startTempbanPoll(client);
});

client.on(Events.InteractionCreate, dispatcher);

client.on(Events.ShardError, (error: Error) => {
  logShardError(error);
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('4014')) {
    log('info', 'bot-shard-4014-hint', {
      hint: 'Enable the privileged intents for this app in the Developer Portal, then restart',
    });
  }
});

client.on(Events.Error, (error: Error) => {
  log('error', 'bot-client-error', {
    error: sanitize(error instanceof Error ? error.message : String(error)),
  });
});

bindFeatureEvents(client, allEvents);

const connectorPoll = startPolling();

function shutdown(signal: string): void {
  log('info', 'bot-shutdown', { signal });
  try {
    connectorPoll.stop();
  } catch {
    // A polling-stop failure must never break client.destroy().
  }
  try {
    stopGiveawayPoll();
  } catch {
    // A giveaway-poll-stop failure must never break client.destroy().
  }
  try {
    tempbanPoll?.stop();
  } catch {
    // A tempban-poll-stop failure must never break client.destroy().
  }
  tempbanPoll = null;
  client.destroy();
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

try {
  await client.login(token);
} catch (err: unknown) {
  console.error('Login failed: could not connect to Discord.');
  log('error', 'bot-login-error', {
    error: sanitize(err instanceof Error ? err.message : String(err)),
  });
  process.exit(1);
}
