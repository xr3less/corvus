// Single-listener InteractionCreate dispatcher for the trial bot.
// Shape: ignore non-chat-input → lookup by commandName (missing = log + return)
// → run guards in order → try/catch execute. The error reply branches on
// interaction state (replied||deferred → followUp, else reply) and sits in its
// OWN bare try/catch so it can never throw out of the dispatcher.

import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import { log as defaultLog, sanitize } from '../log.js';
import type { BotCommand } from './registry.js';

export type LogFn = (
  level: 'info' | 'error',
  event: string,
  meta?: Record<string, string | number>,
) => void;

export function createDispatcher(
  commands: BotCommand[],
  log: LogFn = defaultLog,
): (interaction: Interaction) => Promise<void> {
  const byName = new Map<string, BotCommand>(commands.map((c) => [c.data.name, c]));

  return async (interaction: Interaction): Promise<void> => {
    if (!interaction.isChatInputCommand()) return;

    const command = byName.get(interaction.commandName);
    if (command === undefined) {
      log('info', 'bot-unknown-command', { command: sanitize(interaction.commandName) });
      return;
    }

    for (const guard of command.guards ?? []) {
      const deny = await guard(interaction);
      if (deny !== null) {
        try {
          await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral });
        } catch {
          // The denial already stands; a failed deny-reply must never throw.
        }
        return;
      }
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', 'bot-command-error', {
        command: sanitize(interaction.commandName),
        error: sanitize(message),
      });
      const payload = {
        content: 'There was an error while executing this command.',
        flags: MessageFlags.Ephemeral,
      } as const;
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch {
        // The error reply itself must never escape the dispatcher.
      }
    }
  };
}
