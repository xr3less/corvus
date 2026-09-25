// Module contracts for the standalone trial bot (apps/testbot).
// Types only — this file makes zero discord.js runtime calls.

import type { ChatInputCommandInteraction, ClientEvents, SlashCommandBuilder } from 'discord.js';

/**
 * Ordered precondition on a command. Return null to allow, or a non-null
 * deny reason to block. The first non-null deny wins: the dispatcher replies
 * with it ephemerally and never runs execute.
 */
export type Guard = (interaction: ChatInputCommandInteraction) => Promise<string | null>;

export interface BotCommand {
  data: SlashCommandBuilder;
  guards?: Guard[];
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void>;
}
