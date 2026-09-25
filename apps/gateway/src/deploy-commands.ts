// Standalone guild-command deploy script for the gateway (site-engine bridge A3).
//
// NEVER imported at boot or by any runtime file — invoke explicitly, e.g.
// `npx tsx src/deploy-commands.ts` (dev) or `node dist/deploy-commands.js`
// (built). Guild-scoped PUT only. `--clear` performs an empty-array PUT first
// (resetting stale commands), then proceeds with the normal deploy.
//
// Unit identity of the registry body lives in buildSlashCommandBody() — the
// sync-commands worker PUTs the same array, so the script and the worker can
// never drift (one builder, two callers).

import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { FEATURE_MODULES } from './runtime/feature-modules.js';
import { buildRegistry } from './runtime/registry.js';

// Deploy-log idiom: error text only, token-like runs redacted, values never printed.
const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_.-]{24,}/g;

function sanitizeMessage(value: string): string {
  return value.replace(TOKEN_LIKE_PATTERN, '[redacted]');
}

// The registry manifest as a Discord PUT body. Exported for the sync-commands
// worker; the standalone script below consumes it too, so CLI and worker PUT
// the identical array.
export function buildSlashCommandBody(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [...buildRegistry(FEATURE_MODULES).commands.values()].map((command) =>
    command.data.toJSON(),
  );
}

// Worker-facing sync for ONE bot/guild: decrypt, resolve the application id
// through the token's own client (no stored app ids — the token is the source
// of truth), then guild-scoped PUT. Never touches global commands.
export interface SyncRest {
  get(route: string): Promise<{ id: string }>;
  put(route: string, options: { body: unknown }): Promise<unknown>;
}

export async function syncGuildCommands(
  token: string,
  guildId: string,
  rest?: SyncRest,
): Promise<number> {
  const client: SyncRest = rest ?? (new REST().setToken(token) as unknown as SyncRest);
  const app = await client.get(Routes.oauth2CurrentApplication());
  const route = Routes.applicationGuildCommands(app.id, guildId);
  const body = buildSlashCommandBody();
  await client.put(route, { body });
  return body.length;
}

async function main(): Promise<void> {
  const token: string | undefined = process.env['DEPLOY_TOKEN'];
  const appId: string | undefined = process.env['DEPLOY_APP_ID'];
  const guildId: string | undefined = process.env['DEPLOY_GUILD_ID'];

  const missing: string[] = [];
  if (token === undefined || token === '') {
    missing.push('DEPLOY_TOKEN');
  }
  if (appId === undefined || appId === '') {
    missing.push('DEPLOY_APP_ID');
  }
  if (guildId === undefined || guildId === '') {
    missing.push('DEPLOY_GUILD_ID');
  }
  if (missing.length > 0) {
    // Names only — never values.
    console.error(`Missing required environment variables: ${missing.join(', ')}.`);
    process.exit(1);
  }
  if (token === undefined || appId === undefined || guildId === undefined) {
    throw new Error('unreachable: environment validated above');
  }

  const rest = new REST().setToken(token);
  const route = Routes.applicationGuildCommands(appId, guildId);

  if (process.argv.includes('--clear')) {
    await rest.put(route, { body: [] });
    console.log(`Cleared guild commands for guild ${guildId}.`);
  }

  const body = buildSlashCommandBody();
  await rest.put(route, { body });
  console.log(`Deployed ${body.length} guild command(s) to guild ${guildId}.`);
}

try {
  // Entry guard: only the explicitly-invoked script runs main(). Imports
  // (the worker, its tests) get the exports with zero side effects — the old
  // top-level `await main()` executed the CLI path on every import and killed
  // the importer with process.exit(1). Guarded by argv identity, exactly like
  // start.ts: CLI behavior byte-identical when invoked as the entry script.
  const invokedPath = process.argv[1];
  if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
    await main();
  }
} catch (err: unknown) {
  console.error(
    `deploy-commands failed: ${sanitizeMessage(err instanceof Error ? err.message : String(err))}`,
  );
  process.exit(1);
}
