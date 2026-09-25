// Standalone guild-command deploy script for the trial bot (apps/testbot).
// NEVER runs at boot — invoke explicitly, e.g. `npx tsx src/deploy-commands.ts`
// (dev) or `node dist/deploy-commands.js` (built). `--clear` wipes the trial
// guild's commands (empty-array PUT) and exits, so the previously-used bot's
// stale commands are reset before the fresh deploy.

// Trial-only: broken local DNS (ISP resolver blackholes discord.com) — patch
// dns.lookup via public DNS before any network module initializes.
import './dns-fix.js';
import { REST, Routes } from 'discord.js';
import { commands as connectorCommands } from './connector/index.js';
import { commands as gamesCommands } from './games/index.js';
import { commands as moderationCommands } from './moderation/index.js';
import { commands as welcomeCommands } from './welcome/index.js';
import type { BotCommand } from './core/registry.js';
import { sanitize } from './log.js';

const allCommands: BotCommand[] = [
  ...welcomeCommands,
  ...moderationCommands,
  ...gamesCommands,
  ...connectorCommands,
];

async function main(): Promise<void> {
  const token: string | undefined = process.env.TESTBOT_TOKEN;
  const guildId: string | undefined = process.env.TESTBOT_GUILD_ID;
  const clientId: string | undefined = process.env.TESTBOT_CLIENT_ID;
  if (
    token === undefined ||
    token === '' ||
    guildId === undefined ||
    guildId === '' ||
    clientId === undefined ||
    clientId === ''
  ) {
    console.error(
      'Missing required environment variables: TESTBOT_TOKEN, TESTBOT_GUILD_ID, and TESTBOT_CLIENT_ID must be set.',
    );
    process.exit(1);
  }

  const rest = new REST().setToken(token);
  const route = Routes.applicationGuildCommands(clientId, guildId);

  if (process.argv.includes('--clear')) {
    await rest.put(route, { body: [] });
    console.log(`Cleared guild commands for guild ${guildId}.`);
    return;
  }

  const body = allCommands.map((command) => command.data.toJSON());
  await rest.put(route, { body });
  console.log(`Deployed ${body.length} guild command(s) to guild ${guildId}.`);
}

try {
  await main();
} catch (err: unknown) {
  console.error(
    `deploy-commands failed: ${sanitize(err instanceof Error ? err.message : String(err))}`,
  );
  process.exit(1);
}
