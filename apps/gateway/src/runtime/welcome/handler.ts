// Gateway welcome handler (site-engine bridge A4): FeatureModule kind welcome.
//
// GuildMemberAdd: auto-role, raid check, greeting embed. GuildMemberRemove:
// farewell embed. Every step runs in its own try/catch so one failure cannot
// abort the others. This module never subscribes to the ready event; the
// composition root owns ready and the dispatcher owns interactionCreate.

import type { Client, EmbedBuilder, GuildMember } from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { FeatureModule } from '../registry.js';
import {
  buildWelcomeEmbed,
  DEFAULT_WELCOME_TEMPLATE,
  isRaidMode,
  parse,
  RAID_WINDOW_MS,
  shortenText,
  WELCOME_DESCRIPTION_LIMIT,
} from './greet.js';

export interface WelcomeLogger {
  info(record: { event: string; guildId?: string }): void;
  error(record: { event: string; guildId?: string; reason?: string }): void;
}

export interface WelcomeModuleOptions {
  logger?: WelcomeLogger;
  now?: () => number;
}

interface WelcomeParams {
  channelId: string | null;
  farewellChannelId: string | null;
  message: string;
  farewellMessage: string;
  autoRoleId: string | null;
  logChannelId: string | null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Translator item payload keys scanned (in this order) for welcome text. */
const TEXT_KEYS = ['title', 'name', 'detail', 'description', 'channel'] as const;

function scanKeys(item: unknown): string | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  for (const key of TEXT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function firstItemText(record: Record<string, unknown>): string | null {
  const items = record['items'];
  if (Array.isArray(items)) {
    for (const item of items) {
      const found = scanKeys(item);
      if (found !== null) {
        return found;
      }
    }
  }
  return scanKeys(record);
}

/**
 * Pure welcome-text resolver for translator-shaped params. Direct message
 * keys win, then translator item payloads (scanning title, name, detail,
 * description, channel in order), then the built-in default. Never throws.
 */
export function resolveWelcomeText(params: unknown): string {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return DEFAULT_WELCOME_TEMPLATE;
  }
  const record = params as Record<string, unknown>;
  return (
    asNonEmptyString(record['message']) ??
    asNonEmptyString(record['farewellMessage']) ??
    asNonEmptyString(record['text']) ??
    firstItemText(record) ??
    DEFAULT_WELCOME_TEMPLATE
  );
}

/** Defensive params parse: malformed input falls back, never throws. */
export function parseWelcomeParams(params: unknown): WelcomeParams {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return {
      channelId: null,
      farewellChannelId: null,
      message: DEFAULT_WELCOME_TEMPLATE,
      farewellMessage: DEFAULT_WELCOME_TEMPLATE,
      autoRoleId: null,
      logChannelId: null,
    };
  }
  const record = params as Record<string, unknown>;
  const message =
    asNonEmptyString(record['message']) ?? firstItemText(record) ?? DEFAULT_WELCOME_TEMPLATE;
  const farewellMessage =
    asNonEmptyString(record['farewellMessage']) ??
    asNonEmptyString(record['message']) ??
    firstItemText(record) ??
    DEFAULT_WELCOME_TEMPLATE;
  return {
    channelId: asNonEmptyString(record['channelId']),
    farewellChannelId:
      asNonEmptyString(record['farewellChannelId']) ?? asNonEmptyString(record['channelId']),
    message,
    farewellMessage,
    autoRoleId: asNonEmptyString(record['autoRoleId']),
    logChannelId: asNonEmptyString(record['logChannelId']),
  };
}

function isSendableChannel(channel: unknown): channel is {
  send(payload: unknown): Promise<unknown>;
} {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    typeof (channel as { send?: unknown }).send === 'function'
  );
}

function resolveTargetChannel(member: GuildMember, configuredId: string | null): unknown {
  try {
    if (configuredId) {
      const direct = member.guild.channels.cache.get(configuredId);
      if (direct !== undefined) {
        return direct;
      }
    }
  } catch {
    // Fall through to the first-sendable scan below.
  }
  try {
    for (const channel of member.guild.channels.cache.values()) {
      if (isSendableChannel(channel)) {
        return channel;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function buildWelcomeModule(opts?: WelcomeModuleOptions): FeatureModule {
  const logger = opts?.logger;
  const now = opts?.now ?? Date.now;
  // m-32: per-guild join-time rings. A join burst in one guild must never trip
  // raid suppression for a different guild, so each guild owns its ring; rings
  // are dropped lazily when fully drained so the map stays bounded by live
  // guilds, not history. No timer — eviction rides the join path itself.
  const joinTimesByGuild = new Map<string, number[]>();
  let params: WelcomeParams = parseWelcomeParams(null);
  let clientRef: Client | null = null;

  function logInfo(event: string, guildId: string): void {
    try {
      logger?.info({ event, guildId });
    } catch {
      // Logger failures never block the flow.
    }
  }

  function logError(event: string, guildId: string, err: unknown): void {
    try {
      logger?.error({
        event,
        guildId,
        reason: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Logger failures never block the flow.
    }
  }

  async function postLog(text: string): Promise<void> {
    try {
      if (!clientRef || !params.logChannelId) {
        return;
      }
      const channel = clientRef.channels.cache.get(params.logChannelId);
      if (!isSendableChannel(channel)) {
        return;
      }
      await channel.send(text);
    } catch {
      // Log-channel failures are swallowed by design.
    }
  }

  async function onGuildMemberAdd(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    let joinTimes: number[];
    try {
      let ring = joinTimesByGuild.get(guildId);
      if (ring === undefined) {
        ring = [];
        joinTimesByGuild.set(guildId, ring);
      }
      joinTimes = ring;
    } catch {
      joinTimes = [];
    }
    let at: number;
    try {
      at = now();
    } catch {
      at = Date.now();
    }
    try {
      joinTimes.push(at);
      while (joinTimes.length > 0 && at - joinTimes[0] > RAID_WINDOW_MS) {
        joinTimes.shift();
      }
      if (joinTimes.length === 0) joinTimesByGuild.delete(guildId);
    } catch {
      // Clock or ring failure never blocks the greeting.
    }
    if (params.autoRoleId) {
      try {
        await member.roles.add(params.autoRoleId);
      } catch (err) {
        logError('welcome-autorole-failed', guildId, err);
      }
    }
    let raid = false;
    try {
      raid = isRaidMode(joinTimes, at);
    } catch {
      raid = false;
    }
    if (raid) {
      logInfo('welcome-raid-suppressed', guildId);
      await postLog(`welcome-raid-suppressed guild=${guildId}`);
      return;
    }
    let embed: EmbedBuilder;
    try {
      const raw = parse(params.message, {
        memberMention: `<@${member.id}>`,
        serverName: member.guild.name,
        memberCount: member.guild.memberCount,
      });
      const avatar = typeof member.displayAvatarURL === 'function' ? member.displayAvatarURL() : '';
      embed = buildWelcomeEmbed(shortenText(raw, WELCOME_DESCRIPTION_LIMIT), avatar);
    } catch (err) {
      logError('welcome-render-failed', guildId, err);
      return;
    }
    try {
      const channel = resolveTargetChannel(member, params.channelId);
      if (!isSendableChannel(channel)) {
        logInfo('welcome-no-channel', guildId);
        return;
      }
      await channel.send({ embeds: [embed] });
      await postLog(`welcome-sent guild=${guildId}`);
    } catch (err) {
      logError('welcome-send-failed', guildId, err);
    }
  }

  async function onGuildMemberRemove(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    let embed: EmbedBuilder;
    try {
      const raw = parse(params.farewellMessage, {
        memberMention: `<@${member.id}>`,
        serverName: member.guild.name,
        memberCount: member.guild.memberCount,
      });
      const avatar = typeof member.displayAvatarURL === 'function' ? member.displayAvatarURL() : '';
      embed = buildWelcomeEmbed(shortenText(raw, WELCOME_DESCRIPTION_LIMIT), avatar);
    } catch (err) {
      logError('welcome-farewell-render-failed', guildId, err);
      return;
    }
    try {
      const channel = resolveTargetChannel(member, params.farewellChannelId);
      if (!isSendableChannel(channel)) {
        logInfo('welcome-no-channel', guildId);
        return;
      }
      await channel.send({ embeds: [embed] });
      await postLog(`farewell-sent guild=${guildId}`);
    } catch (err) {
      logError('welcome-farewell-send-failed', guildId, err);
    }
  }

  return {
    kind: 'welcome',
    commands: [],
    events: [
      { name: 'GuildMemberAdd', execute: onGuildMemberAdd },
      { name: 'GuildMemberRemove', execute: onGuildMemberRemove },
    ],
    start(client: Client, config: RuntimeConfigRow | null) {
      clientRef = client;
      try {
        params = parseWelcomeParams(config?.params ?? null);
      } catch {
        params = parseWelcomeParams(null);
      }
      return undefined;
    },
  };
}
