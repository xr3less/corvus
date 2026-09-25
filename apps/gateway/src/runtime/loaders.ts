// Site-engine bridge A3: per-bot loader.
//
// Wires exactly one interactionCreate listener into the dispatcher, wires each
// module event with per-handler try/catch (one module throw never kills the
// others), calls each module start with its matching config row or null, and
// returns stop() removing all listeners and stopping all started polls.
// No client.on ready anywhere in runtime/: the composition root owns ready.

import { Events } from 'discord.js';
import type { Client, ClientEvents, Interaction } from 'discord.js';
import type { RuntimeConfigRow } from './config.js';
import { createDispatcher } from './dispatcher.js';
import type { DispatcherLogger } from './dispatcher.js';
import { buildRegistry } from './registry.js';
import type { BotEvent, FeatureModule } from './registry.js';

// discord.js v14 types Client.on/off by `keyof ClientEvents` (string
// literals), so the Events enum members are cast at the registration boundary
// below. Runtime behavior is identical: each enum value is exactly its key
// string (installed discord.js 14.27.0 typings, Events block lines 6359-6412:
// GuildMemberAdd = 'guildMemberAdd', …, InteractionCreate = 'interactionCreate').
const EVENT_TO_CLIENT_EVENT: Record<BotEvent['name'], Events> = {
  GuildMemberAdd: Events.GuildMemberAdd,
  GuildMemberRemove: Events.GuildMemberRemove,
  MessageCreate: Events.MessageCreate,
  MessageDelete: Events.MessageDelete,
  MessageUpdate: Events.MessageUpdate,
  MessageReactionAdd: Events.MessageReactionAdd,
};

export interface LoadBotOptions {
  logger?: DispatcherLogger;
  /**
   * m-33: the guild whose per-guild overrides apply, when the caller knows it.
   * Null (default) keeps the old behavior: the first bot-global row wins.
   * Per-guild precedence is implemented here at the read side because the
   * boot path (BOOT_CONFIG_SQL) loads one bot's rows with no ORDER BY and no
   * guild context; a future caller that knows the event guild can pass it.
   */
  guildId?: string | null;
}

export interface LoadedBot {
  stop: () => void;
}

// Guild-install recorder (E6-C2): a bot joining a guild writes its install row
// with joined_at = the actual install moment. This is plain persistence — NOT a
// BotEvent, NOT a FeatureModule event: the composition root owns join (like
// ready), and the dispatcher registry is untouched. A Pool here is the narrow
// structural surface (query only) so callers hand the real pg Pool; failures
// are best-effort (logged, never thrown) so a DB hiccup never breaks the
// gateway event path. Duplicate joins upsert on (bot_id, guild_id): the
// joined_at updates to the latest join, preflight stays NULL until the first
// scan — the upsert touches joined_at only, never the preflight column.
export interface GuildInstallPool {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export interface GuildInstallLogger {
  error(record: { event: string; reason?: string }): void;
}

export const GUILD_INSTALL_SQL =
  'INSERT INTO guild_installs (bot_id, guild_id, joined_at) VALUES ($1, $2, NOW()) ' +
  'ON CONFLICT (bot_id, guild_id) DO UPDATE SET joined_at = EXCLUDED.joined_at';

export async function recordGuildInstall(
  pool: GuildInstallPool,
  botId: string,
  guildId: string,
  logger?: GuildInstallLogger,
): Promise<void> {
  try {
    await pool.query(GUILD_INSTALL_SQL, [botId, guildId]);
  } catch (err: unknown) {
    // Reason is a fixed literal — raw error text may carry the connection URL.
    logger?.error({ event: 'guild-install-failed', reason: 'db-error' });
    void err;
  }
}

/**
 * m-33: per-kind config resolution honoring the config.ts documented
 * semantics — "Null means bot-global default; per-guild rows override it at
 * read time." With no guildId, the first bot-global (guildId null) row wins,
 * falling back to the first row of the kind when no global exists. With a
 * guildId, that guild's row wins, then the global, then the first row.
 */
export function resolveModuleConfig(
  configs: RuntimeConfigRow[],
  kind: RuntimeConfigRow['kind'],
  guildId?: string | null,
): RuntimeConfigRow | null {
  const rows = configs.filter((row) => row.kind === kind);
  if (rows.length === 0) return null;
  if (guildId !== undefined && guildId !== null && guildId !== '') {
    const scoped = rows.find((row) => row.guildId === guildId);
    if (scoped !== undefined) return scoped;
  }
  const global = rows.find((row) => row.guildId === null);
  return global ?? rows[0] ?? null;
}

export function loadBot(
  client: Client,
  modules: FeatureModule[],
  configs: RuntimeConfigRow[],
  opts: LoadBotOptions = {},
): LoadedBot {
  const logger = opts.logger;
  const dispatcher = createDispatcher(buildRegistry(modules), { logger });

  const onInteraction = (interaction: Interaction): void => {
    void dispatcher.handleInteraction(interaction);
  };
  client.on(
    Events.InteractionCreate as keyof ClientEvents,
    onInteraction as (...args: ClientEvents[keyof ClientEvents]) => void,
  );

  const removeEventListeners: Array<() => void> = [];
  for (const module of modules) {
    for (const event of module.events) {
      const clientEvent = EVENT_TO_CLIENT_EVENT[event.name] as keyof ClientEvents;
      const handler = (...args: unknown[]): void => {
        try {
          const result = (event.execute as (...a: unknown[]) => unknown)(...args);
          void Promise.resolve(result).catch(() => {
            // Isolated per-handler: one module's rejection never kills the others.
          });
        } catch {
          // Isolated per-handler: one module's sync throw never kills the others.
        }
      };
      client.on(clientEvent, handler as (...args: ClientEvents[keyof ClientEvents]) => void);
      removeEventListeners.push(() => {
        client.off(clientEvent, handler as (...args: ClientEvents[keyof ClientEvents]) => void);
      });
    }
  }

  const stopPolls: Array<() => void> = [];
  for (const module of modules) {
    if (module.start === undefined) {
      continue;
    }
    const config = resolveModuleConfig(configs, module.kind, opts.guildId ?? null);
    try {
      const started = module.start(client, config);
      if (started !== undefined && started !== null) {
        stopPolls.push(started.stop);
      }
    } catch (err: unknown) {
      logger?.error({
        event: 'loader-start-failed',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    stop(): void {
      client.off(
        Events.InteractionCreate as keyof ClientEvents,
        onInteraction as (...args: ClientEvents[keyof ClientEvents]) => void,
      );
      for (const remove of removeEventListeners) {
        remove();
      }
      for (const stopPoll of stopPolls) {
        try {
          stopPoll();
        } catch {
          // Best-effort teardown: one failing poll never blocks the rest.
        }
      }
    },
  };
}
