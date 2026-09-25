// Site-engine bridge A3: module registry plus the FeatureModule contract.
//
// Sibling handler waves (welcome, moderation, games, connector) implement
// against the contract defined here. Sibling waves never touch this file's
// contract without a new orchestrator SPEC.
//
// Single-owner rule: ClientReady and InteractionCreate are FORBIDDEN as
// BotEvent names. The composition root owns ready; the dispatcher owns
// interactionCreate. The BotEvent union below is CLOSED — one member per
// supported event — so the forbidden names are unrepresentable by construction.

import type {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  Message,
  MessageReaction,
  PartialMessage,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import type { RuntimeConfigRow, RuntimeKind } from './config.js';

export interface BotCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  cooldownSeconds?: number;
}

export type BotEvent =
  | { name: 'GuildMemberAdd'; execute: (member: GuildMember) => Promise<void> }
  | { name: 'GuildMemberRemove'; execute: (member: GuildMember) => Promise<void> }
  | { name: 'MessageCreate'; execute: (message: Message) => Promise<void> }
  | { name: 'MessageDelete'; execute: (message: Message) => Promise<void> }
  | {
      name: 'MessageUpdate';
      execute: (
        oldMessage: Message | PartialMessage,
        newMessage: Message | PartialMessage,
      ) => Promise<void>;
    }
  | {
      name: 'MessageReactionAdd';
      execute: (reaction: MessageReaction, user: User) => Promise<void>;
    };

export interface FeatureModule {
  kind: RuntimeKind;
  commands: BotCommand[];
  events: BotEvent[];
  start?: (client: Client, config: RuntimeConfigRow | null) => { stop: () => void } | void;
}

export interface Registry {
  commands: Map<string, BotCommand>;
  events: BotEvent[];
}

/**
 * Compose feature modules into a command map plus an event list.
 * A duplicate commandName across modules throws fail-fast here at
 * composition time, never at runtime inside the dispatcher.
 */
export function buildRegistry(modules: FeatureModule[]): Registry {
  const commands = new Map<string, BotCommand>();
  const events: BotEvent[] = [];
  for (const module of modules) {
    for (const command of module.commands) {
      const name = command.data.name;
      if (commands.has(name)) {
        throw new Error(`duplicate commandName: ${name}`);
      }
      commands.set(name, command);
    }
    events.push(...module.events);
  }
  return { commands, events };
}
