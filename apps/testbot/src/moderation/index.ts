// Discord execution layer for moderation (apps/testbot/src/moderation/index.ts).
//
// The ONLY file in moderation/ that imports discord.js. Pure logic lives in
// ./checks.js (content classification, cooldowns, spam rings) and ./ladder.js
// (strike -> punishment resolution); this file wires those to Discord actions.
//
// Order (OSS shape: aternosorg/modbot behavioural shape only):
// - messageCreate: never-fire guards -> own-perms preflight -> strike checks
//   (badword/invite -> strike + ladder) -> cooldown checks (link/attachment/
//   spam: delete + log, no strike). Plain links and bare attachments are NOT
//   strikes — they fall through to the cooldown branches, which are the only
//   owner of delete+log-no-strike handling.
// - messageUpdate: strike checks only, never cooldowns (an edit is not a new
//   message and must not consume rate budget).
//
// Temp bans: member.ban() is permanent, so ladder rungs with a durationMs
// persist {guildId, userId, unbanAt} via ./tempbans.js; its 60s poll unbans
// due rows. Only durationMs === null bans are true permabans.
//
// Trial notes:
// - No muted-role fallback: a timeout failure is logged as fallback-needed and
//   the strike/DM/log still happen. A role fallback is a post-trial decision.
// - log() only accepts 'info' | 'error' (see ../log.js), so warn-level automod
//   rows are logged at 'info'. LogMeta only accepts string | number, so the
//   onCooldown flag is logged as 0/1.

import { Events, PermissionFlagsBits } from 'discord.js';
import type { Message, PartialMessage } from 'discord.js';
import { checkStrikeContent, CooldownTracker, SpamRing, truncateForLog } from './checks.js';
import type { ContentHit } from './checks.js';
import { describeAction, lookupAction } from './ladder.js';
import type { BotCommand, BotEvent } from '../core/registry.js';
import { log, sanitize } from '../log.js';
import { scheduleTempban, startTempbanPoll } from './tempbans.js';

/** Re-exported for boot wiring: src/index.ts calls this in ClientReady. */
export { startTempbanPoll };

type ContentSignal = Exclude<ContentHit, null>;

/** Matches any http(s) URL hint (same family as checks.ts LINK_RE). */
const LINK_HINT_RE: RegExp = /https?:\/\//i;

/**
 * Role ids exempt from automod, from the MOD_PROTECTED_ROLES env var
 * (comma-separated; empty = no protected roles). Read once at module load,
 * never logged. Named roles for trial staff who lack ManageMessages.
 */
const PROTECTED_ROLE_IDS: string[] = (process.env.MOD_PROTECTED_ROLES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/** Strike counts by user id (in-memory only, per trial state rules). */
const strikeCounts = new Map<string, number>();
/** 10s per-user link/attachment cooldowns (OSS defaults). */
const linkCooldown = new CooldownTracker(10_000);
const attachCooldown = new CooldownTracker(10_000);
/** One spam ring per user (keyed `${guildId}:${userId}`). */
const spamRings = new Map<string, SpamRing>();

/** Delete in isolation: a failed delete is logged and never blocks punishment. */
async function deleteQuietly(message: Message, guildId: string, userId: string): Promise<void> {
  try {
    await message.delete();
  } catch (err: unknown) {
    log('error', 'bot-mod-delete-error', {
      guild: guildId,
      user: userId,
      error: sanitize(err instanceof Error ? err.message : String(err)),
    });
  }
}

/**
 * Shared punishment path for content hits (messageCreate + messageUpdate):
 * delete -> strike++ -> ladder -> timeout/ban -> DM -> log.
 */
async function punishHit(message: Message, hit: ContentSignal): Promise<void> {
  const guild = message.guild;
  if (guild === null) return;
  const guildId = guild.id;
  const userId = message.author.id;
  const text = message.content ?? '';

  await deleteQuietly(message, guildId, userId);

  const strikes = (strikeCounts.get(userId) ?? 0) + 1;
  strikeCounts.set(userId, strikes);
  const action = lookupAction(strikes);
  if (action === null) {
    log('info', 'bot-mod-no-action', { guild: guildId, user: userId, strikes });
    return;
  }
  const actionLabel = describeAction(action);
  const reason = `Trial automod: ${hit} (strike ${strikes}, ${actionLabel})`;

  let member = message.member;
  if (member === null) {
    try {
      member = await guild.members.fetch(userId);
    } catch (err: unknown) {
      log('error', 'bot-mod-member-fetch-error', {
        guild: guildId,
        user: userId,
        error: sanitize(err instanceof Error ? err.message : String(err)),
      });
      member = null;
    }
  }

  if (member === null) {
    log('info', 'bot-mod-no-member', { guild: guildId, user: userId, strikes });
  } else if (action.kind === 'mute') {
    if (action.durationMs === null) {
      // A permanent mute cannot be expressed via timeout(); the trial has no
      // muted-role fallback by decision, so report instead of half-acting.
      log('info', 'bot-mod-timeout-fallback-needed', { guild: guildId, user: userId, strikes });
    } else {
      try {
        await member.timeout(action.durationMs, reason);
      } catch (err: unknown) {
        // Covers RANGE/out-of-limit plus permission/hierarchy failures: the
        // trial never attempts a role fallback, it reports.
        log('error', 'bot-mod-timeout-fallback-needed', {
          guild: guildId,
          user: userId,
          strikes,
          error: sanitize(err instanceof Error ? err.message : String(err)),
        });
      }
    }
  } else {
    if (action.durationMs === null) {
      try {
        await member.ban({ reason });
      } catch (err: unknown) {
        log('error', 'bot-mod-ban-error', {
          guild: guildId,
          user: userId,
          error: sanitize(err instanceof Error ? err.message : String(err)),
        });
      }
    } else {
      // Temporary ban: the ban call itself is permanent, so schedule the
      // unban. Ban + schedule each in isolation — a schedule failure must
      // never hide a landed ban, and vice versa.
      try {
        await member.ban({ reason });
      } catch (err: unknown) {
        log('error', 'bot-mod-ban-error', {
          guild: guildId,
          user: userId,
          error: sanitize(err instanceof Error ? err.message : String(err)),
        });
      }
      try {
        const unbanAt = new Date(Date.now() + action.durationMs).toISOString();
        scheduleTempban({ guildId, userId, unbanAt, reason });
        log('info', 'bot-mod-tempban', { guild: guildId, user: userId, unbanAt });
      } catch (err: unknown) {
        log('error', 'bot-mod-tempban-schedule-error', {
          guild: guildId,
          user: userId,
          error: sanitize(err instanceof Error ? err.message : String(err)),
        });
      }
    }
  }

  try {
    await message.author.send(
      `Trial automod: you received ${actionLabel} in ${guild.name} (strike ${strikes}) for prohibited content (${hit}).`,
    );
  } catch {
    // Closed DMs are routine, not an error: one info row and on.
    log('info', 'bot-mod-dm-failed', { guild: guildId, user: userId });
  }

  log('info', 'bot-mod-action', {
    guild: guildId,
    user: userId,
    hit,
    strikes,
    action: actionLabel,
    onCooldown: 0,
    content: sanitize(truncateForLog(text)),
  });
}

/** Never-fire guard: true when automod must ignore the message entirely. */
function isExempt(message: Message): boolean {
  if (message.author.bot) return true;
  if (message.system) return true;
  if (message.guild === null) return true;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages) === true) return true;
  // Protected roles (MOD_PROTECTED_ROLES): a roles-cache failure must NOT
  // silently exempt — fall through to normal checks. Partial members
  // (member null, roles not cached) are NOT exempt — fall through.
  if (PROTECTED_ROLE_IDS.length > 0 && message.member !== null) {
    try {
      if (message.member.roles.cache.hasAny(...PROTECTED_ROLE_IDS) === true) return true;
    } catch {
      // Fall through to normal checks.
    }
  }
  return false;
}

/**
 * Own-permission preflight (Bastion blockedBy shape): when the bot holds
 * NEITHER ManageMessages NOR ModerateMembers it cannot act, so it logs the
 * block and returns instead of half-acting.
 */
function isBlockedByOwnPerms(message: Message): boolean {
  const guild = message.guild;
  if (guild === null) return true;
  const me = guild.members.me;
  if (me === null) return true;
  const own = me.permissions;
  return (
    !own.has(PermissionFlagsBits.ManageMessages) && !own.has(PermissionFlagsBits.ModerateMembers)
  );
}

function logNoPerms(message: Message): void {
  const guild = message.guild;
  if (guild === null) return;
  log('info', 'bot-mod-no-perms', { guild: guild.id, channel: message.channelId });
}

export async function handleMessage(message: Message): Promise<void> {
  if (isExempt(message)) return;
  const guild = message.guild;
  if (guild === null) return;
  const guildId = guild.id;
  if (isBlockedByOwnPerms(message)) {
    logNoPerms(message);
    return;
  }

  const userId = message.author.id;
  const text = message.content ?? '';

  // Strike path: badword/invite ONLY punish (strike + ladder). Plain links
  // and bare attachments are NOT strikes — they fall through to the 10s
  // cooldown branches below (delete + log, no strike).
  const hit = checkStrikeContent(text);
  if (hit !== null) {
    await punishHit(message, hit);
    return;
  }

  // Cooldown checks AFTER content (content was clean): delete + log only,
  // never a strike, never a DM (alert-like handling).
  const key = `${guildId}:${userId}`;
  const nowMs = Date.now();
  if (LINK_HINT_RE.test(text)) {
    if (linkCooldown.mark(key, nowMs)) {
      await deleteQuietly(message, guildId, userId);
      log('info', 'bot-mod-cooldown', {
        guild: guildId,
        user: userId,
        kind: 'link',
        onCooldown: 1,
        content: sanitize(truncateForLog(text)),
      });
      return;
    }
  }
  if (message.attachments.size > 0) {
    if (attachCooldown.mark(key, nowMs)) {
      await deleteQuietly(message, guildId, userId);
      log('info', 'bot-mod-cooldown', {
        guild: guildId,
        user: userId,
        kind: 'attachment',
        onCooldown: 1,
        content: sanitize(truncateForLog(text)),
      });
      return;
    }
  }
  let ring = spamRings.get(key);
  if (ring === undefined) {
    ring = new SpamRing();
    spamRings.set(key, ring);
  }
  if (ring.push(userId, text, nowMs)) {
    await deleteQuietly(message, guildId, userId);
    log('info', 'bot-mod-cooldown', {
      guild: guildId,
      user: userId,
      kind: 'spam',
      onCooldown: 1,
      content: sanitize(truncateForLog(text)),
    });
  }
}

export async function handleMessageUpdate(
  oldM: Message | PartialMessage,
  newM: Message | PartialMessage,
): Promise<void> {
  // Edits need the full new message; a fetch failure means no safe basis to act.
  let fresh: Message;
  if (newM.partial) {
    try {
      fresh = await newM.fetch();
    } catch {
      return;
    }
  } else {
    fresh = newM;
  }

  // Same-content edits never fire.
  if ((oldM.content ?? '') === (fresh.content ?? '')) return;

  // Content checks ONLY on edits: same never-fire + preflight as creates.
  if (isExempt(fresh)) return;
  if (fresh.guild === null) return;
  if (isBlockedByOwnPerms(fresh)) {
    logNoPerms(fresh);
    return;
  }

  const hit = checkStrikeContent(fresh.content ?? '');
  if (hit !== null) {
    await punishHit(fresh, hit);
  }
  // Note: link/attachment edits intentionally do NOT fire — an edit is not a
  // new message and must not consume rate budget (spec: updates run content
  // checks only).
}

export const commands: BotCommand[] = [];

export const messageCreateEvent: BotEvent<'messageCreate'> = {
  name: Events.MessageCreate,
  execute: async (message): Promise<void> => {
    try {
      await handleMessage(message);
    } catch (err: unknown) {
      log('error', 'bot-mod-error', {
        error: sanitize(err instanceof Error ? err.message : String(err)),
      });
    }
  },
};

export const messageUpdateEvent: BotEvent<'messageUpdate'> = {
  name: Events.MessageUpdate,
  execute: async (oldM, newM): Promise<void> => {
    try {
      await handleMessageUpdate(oldM, newM);
    } catch (err: unknown) {
      log('error', 'bot-mod-error', {
        error: sanitize(err instanceof Error ? err.message : String(err)),
      });
    }
  },
};

export const events: BotEvent[] = [messageCreateEvent, messageUpdateEvent];
