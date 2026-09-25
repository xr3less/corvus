// Welcome feature for the trial bot (apps/testbot/src/welcome/greet.ts).
//
// Shape (from OSS brief, discord-js-bot + Bastion behavioural shape only):
// - Event: Events.GuildMemberAdd (enum member, never a string literal).
// - Order: auto-role -> raid check -> greeting embed -> log. Each step runs in
//   its own try/catch so one failure cannot abort the others.
// - Raid mode: more than 10 joins in the last 60s suppresses the greeting.
// - Greeting embed: description + color + thumbnail(avatar) + footer, with a
//   placeholder parser and shortenText() clamping to the Discord limit.
// - Preflight: ViewChannel + SendMessages + EmbedLinks before sending; a
//   missing permission is a silent return plus a log line, never a throw.
//
// Runtime tuning via environment (names only, never values):
// - TESTBOT_AUTOROLE_ID: single auto-role id; unset/empty = skip auto-role.
// - TESTBOT_WELCOME_CHANNEL_ID: greeting target; unset = guild system channel.
// - TESTBOT_WELCOME_MESSAGE: template with {member:mention} {server} {count}
//   and \n newlines; unset = built-in default below.

import { EmbedBuilder, Events, PermissionFlagsBits } from 'discord.js';
import type { GuildMember, GuildTextBasedChannel } from 'discord.js';
import type { BotEvent } from '../core/registry.js';
import { log } from '../log.js';

/** Joins within this window count toward raid mode. */
export const RAID_WINDOW_MS = 60 * 1000;
/** Raid mode trips when MORE than this many joins fall in the window. */
export const RAID_JOIN_THRESHOLD = 10;
/** Discord embed description limit (majo.exe shortenText() shape). */
export const WELCOME_DESCRIPTION_LIMIT = 2040;

export interface GreetVars {
  memberMention: string;
  serverName: string;
  memberCount: number;
}

const DEFAULT_TEMPLATE = 'Welcome {member:mention} to {server}!\\nYou are member #{count}.';

/**
 * Substitute {member:mention} {server} {count} and convert every literal
 * backslash-n sequence into a real newline. Pure string replacement.
 */
export function parse(template: string, vars: GreetVars): string {
  return template
    .split('\\n')
    .join('\n')
    .split('{member:mention}')
    .join(vars.memberMention)
    .split('{server}')
    .join(vars.serverName)
    .split('{count}')
    .join(String(vars.memberCount));
}

/** Clamp a string to at most `max` characters (Discord-side 400 guard). */
export function shortenText(s: string, max: number): string {
  if (max < 0) return '';
  return s.length <= max ? s : s.slice(0, max);
}

/** True when more than 10 of `joinTimes` fall inside the last 60s window. */
export function isRaidMode(joinTimes: readonly number[], now: number): boolean {
  let recent = 0;
  for (const t of joinTimes) {
    if (t <= now && now - t <= RAID_WINDOW_MS) recent += 1;
  }
  return recent > RAID_JOIN_THRESHOLD;
}

// --- In-memory join ring (cooldowns live in memory only, per OSS brief) ---

const joinTimes: number[] = [];

function pruneJoinTimes(now: number): void {
  const cutoff = now - RAID_WINDOW_MS;
  let drop = 0;
  while (drop < joinTimes.length) {
    const oldest: number | undefined = joinTimes[drop];
    if (oldest === undefined || oldest > cutoff) break;
    drop += 1;
  }
  if (drop > 0) joinTimes.splice(0, drop);
}

/** Test hook: clear the in-memory join ring. */
export function resetJoinTimes(): void {
  joinTimes.length = 0;
}

// --- Steps (each .catch-isolated by the caller) ---

async function applyAutoRole(member: GuildMember): Promise<void> {
  const roleId = process.env.TESTBOT_AUTOROLE_ID;
  if (roleId === undefined || roleId === '') return;
  const role = member.guild.roles.cache.get(roleId);
  if (role === undefined) return;
  await member.roles.add(role);
}

/** Narrow an unknown channel to a sendable guild text channel, else null. */
function toTextChannel(channel: unknown): GuildTextBasedChannel | null {
  if (channel === null || typeof channel !== 'object') return null;
  const c = channel as { isTextBased?: () => boolean; isDMBased?: () => boolean };
  if (typeof c.isTextBased !== 'function' || !c.isTextBased()) return null;
  if (typeof c.isDMBased === 'function' && c.isDMBased()) return null;
  return channel as GuildTextBasedChannel;
}

async function resolveWelcomeChannel(member: GuildMember): Promise<GuildTextBasedChannel | null> {
  const configured = process.env.TESTBOT_WELCOME_CHANNEL_ID;
  if (configured !== undefined && configured !== '') {
    const fetched = await member.guild.channels.fetch(configured).catch((): null => null);
    return toTextChannel(fetched);
  }
  return toTextChannel(member.guild.systemChannel);
}

/** Preflight the bot's own channel perms (majo.exe shape: silent no-op). */
function canSendEmbed(channel: GuildTextBasedChannel, member: GuildMember): boolean {
  const me = member.guild.members.me;
  if (me === null) return false;
  const perms = channel.permissionsFor(me);
  if (perms === null) return false;
  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.SendMessages) &&
    perms.has(PermissionFlagsBits.EmbedLinks)
  );
}

export function buildWelcomeEmbed(description: string, avatarUrl: string): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor(0x5865f2)
    .setThumbnail(avatarUrl)
    .setFooter({ text: 'Greetings!' });
}

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;
  const now = Date.now();

  try {
    await applyAutoRole(member);
  } catch (err) {
    log('error', 'welcome-autorole-error', {
      guild: guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  joinTimes.push(now);
  pruneJoinTimes(now);
  if (isRaidMode(joinTimes, now)) {
    log('info', 'raid-suspected', { guild: guildId, joins: joinTimes.length });
    return;
  }

  let channel: GuildTextBasedChannel | null = null;
  try {
    channel = await resolveWelcomeChannel(member);
  } catch (err) {
    log('error', 'welcome-channel-error', {
      guild: guildId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (channel === null) {
    log('info', 'welcome-skipped-no-channel', { guild: guildId });
    return;
  }

  let allowed = false;
  try {
    allowed = canSendEmbed(channel, member);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    log('info', 'welcome-skipped-no-perm', { guild: guildId });
    return;
  }

  try {
    const template = process.env.TESTBOT_WELCOME_MESSAGE ?? DEFAULT_TEMPLATE;
    const description = shortenText(
      parse(template, {
        memberMention: member.toString(),
        serverName: member.guild.name,
        memberCount: member.guild.memberCount,
      }),
      WELCOME_DESCRIPTION_LIMIT,
    );
    await channel.send({
      embeds: [buildWelcomeEmbed(description, member.user.displayAvatarURL())],
    });
    log('info', 'welcome-sent', { guild: guildId });
  } catch (err) {
    log('error', 'welcome-send-error', {
      guild: guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const guildMemberAddEvent: BotEvent<'guildMemberAdd'> = {
  name: Events.GuildMemberAdd,
  execute: async (member): Promise<void> => {
    await handleGuildMemberAdd(member);
  },
};
