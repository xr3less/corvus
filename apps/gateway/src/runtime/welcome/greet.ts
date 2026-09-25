// Gateway welcome greeting primitives (apps/gateway/src/runtime/welcome/greet.ts).
//
// Adapted shapes from the trial bot's apps/testbot/src/welcome/greet.ts (same
// project, reference implementation): the fixed placeholder grammar
// ({member:mention}, {server}, {count}, plus literal backslash-n newlines), the
// 2040-character embed-description clamp, and the more-than-10-joins-in-60s
// raid predicate. Pure functions only: no Discord I/O, no config reads, no
// secrets.

import { EmbedBuilder } from 'discord.js';

export interface GreetVars {
  memberMention: string;
  serverName: string;
  memberCount: number;
}

/** Joins within this window count toward raid mode. */
export const RAID_WINDOW_MS = 60 * 1000;

/** Raid mode trips when MORE than this many joins fall in the window. */
export const RAID_JOIN_THRESHOLD = 10;

/** Discord embed description limit for the greeting. */
export const WELCOME_DESCRIPTION_LIMIT = 2040;

/** Built-in template used when the welcome config carries no message. */
export const DEFAULT_WELCOME_TEMPLATE =
  'Welcome {member:mention} to {server}!\\nYou are member #{count}.';

/**
 * Substitute {member:mention} {server} {count} and convert every literal
 * backslash-n sequence into a real newline. Pure string replacement: no
 * expressions, no nesting, no conditionals (TRIGGER-SANDBOX-1).
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

/** Clamp a string to at most `max` characters. */
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

/** Greeting embed: description plus color plus avatar thumbnail plus footer. */
export function buildWelcomeEmbed(description: string, avatarUrl: string): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor(0x5865f2)
    .setThumbnail(avatarUrl)
    .setFooter({ text: 'Greetings!' });
}
