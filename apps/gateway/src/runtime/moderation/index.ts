// Gateway moderation handler (site-engine bridge A5): FeatureModule kind
// moderation.
//
// MessageCreate: automod (content-then-cooldown, first-hit-wins) → strike
// ladder (timeout/ban) with own-perms preflight, DM plus record. Spam ring:
// warn-once plus bulkDelete ask. /warn and /timeout commands (invoker needs
// ManageMessages, denied = ephemeral). start() runs the 60s tempban poll and
// returns stop. No client.on(ready) anywhere in this module — the composition
// root owns ready; start() is called by the loader.

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  Message,
} from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { BotCommand, FeatureModule } from '../registry.js';
import { checkMessage, CooldownTracker, LINK_COOLDOWN_MS, SpamRing } from './automod.js';
import type { AutomodMessageView } from './automod.js';
import { nextPunishment, TIMEOUT_MAX_MS } from './ladder.js';
import type { Punishment } from './ladder.js';
import { InMemoryTempbanStorage, scheduleTempban, startTempbanPoll } from './tempban.js';
import type { StoragePort, TempbanLogger } from './tempban.js';

/**
 * Defer-first-compatible reply: the dispatcher may already have deferred the
 * interaction, in which case reply() would throw InteractionAlreadyReplied.
 * Once acked (deferred or replied) followUp() is the safe continuation — it
 * accepts the full reply options including the Ephemeral flag, which editReply
 * cannot set. Otherwise reply() sends the first response. Exactly one message
 * per call; no behavior change.
 */
export async function respondCompat(
  interaction: ChatInputCommandInteraction,
  payload: InteractionReplyOptions & { fetchReply?: never; withResponse?: never },
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
}

export interface ModerationLogger {
  info(record: { event: string; guildId?: string; userId?: string }): void;
  error(record: { event: string; guildId?: string; userId?: string; reason?: string }): void;
}

export interface ModerationModuleOptions {
  logger?: ModerationLogger;
  now?: () => number;
}

export type LinkInviteAction = 'strike' | 'delete';

export interface ModerationParams {
  badWords: string[];
  inviteAction: LinkInviteAction;
  linkAction: LinkInviteAction;
  protectedRoleIds: string[];
  alertOnly: boolean;
  logChannelId: string | null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function asAction(value: unknown, fallback: LinkInviteAction): LinkInviteAction {
  return value === 'strike' || value === 'delete' ? value : fallback;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseModerationParams(params: unknown): ModerationParams {
  const fallback: ModerationParams = {
    badWords: [],
    inviteAction: 'strike',
    linkAction: 'delete',
    protectedRoleIds: [],
    alertOnly: false,
    logChannelId: null,
  };
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return fallback;
  }
  const record = params as Record<string, unknown>;
  return {
    badWords:
      asStringArray(record['badWords']).length > 0
        ? asStringArray(record['badWords'])
        : asStringArray(record['words']),
    inviteAction: asAction(record['inviteAction'], fallback.inviteAction),
    linkAction: asAction(record['linkAction'], fallback.linkAction),
    protectedRoleIds:
      asStringArray(record['protectedRoleIds']).length > 0
        ? asStringArray(record['protectedRoleIds'])
        : asStringArray(record['protectedRoles']),
    alertOnly: record['alertOnly'] === true,
    logChannelId: asNonEmptyString(record['logChannelId']),
  };
}

function toReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hasPerm(member: GuildMember | null, flag: bigint): boolean {
  try {
    if (!member) return false;
    return member.permissions.has(flag);
  } catch {
    return false;
  }
}

function botMemberOf(guild: Guild): GuildMember | null {
  try {
    return guild.members.me;
  } catch {
    return null;
  }
}

function isSendable(channel: unknown): channel is { send(payload: unknown): Promise<unknown> } {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    typeof (channel as { send?: unknown }).send === 'function'
  );
}

function buildView(message: Message): AutomodMessageView {
  let authorBot = false;
  let authorSystem = false;
  let authorId = '';
  try {
    authorBot = message.author.bot === true;
    authorSystem =
      typeof (message.author as { system?: unknown }).system === 'boolean'
        ? (message.author as { system?: boolean }).system === true
        : false;
    authorId = typeof message.author.id === 'string' ? message.author.id : '';
  } catch {
    // Defaults above stand.
  }
  let inGuild = false;
  try {
    inGuild = message.inGuild();
  } catch {
    inGuild = message.guild !== null && message.guild !== undefined;
  }
  const member = message.member;
  let authorHasManageMessages = false;
  let authorRoleIds: string[] = [];
  try {
    authorHasManageMessages = hasPerm(member, PermissionFlagsBits.ManageMessages);
    const cache = member?.roles?.cache;
    if (cache && typeof cache.keys === 'function') {
      authorRoleIds = Array.from(cache.keys());
    }
  } catch {
    authorHasManageMessages = false;
    authorRoleIds = [];
  }
  let text = '';
  try {
    text = typeof message.content === 'string' ? message.content : '';
  } catch {
    text = '';
  }
  let hasAttachment = false;
  try {
    hasAttachment = (message.attachments?.size ?? 0) > 0;
  } catch {
    hasAttachment = false;
  }
  return {
    authorBot,
    authorSystem,
    inGuild,
    authorHasManageMessages,
    authorId,
    authorRoleIds,
    text,
    hasAttachment,
  };
}

export function buildModerationModule(opts?: ModerationModuleOptions): FeatureModule {
  const logger = opts?.logger;
  const now = opts?.now ?? Date.now;
  const cooldown = new CooldownTracker(LINK_COOLDOWN_MS);
  const ring = new SpamRing();
  const strikes = new Map<string, number>();
  const storage: StoragePort = new InMemoryTempbanStorage();
  let params: ModerationParams = parseModerationParams(null);
  let clientRef: Client | null = null;

  function info(record: { event: string; guildId?: string; userId?: string }): void {
    try {
      logger?.info(record);
    } catch {
      // Logger failure never breaks moderation.
    }
  }

  function error(record: {
    event: string;
    guildId?: string;
    userId?: string;
    reason?: string;
  }): void {
    try {
      logger?.error(record);
    } catch {
      // Logger failure never breaks moderation.
    }
  }

  function strikeKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  async function postLog(text: string): Promise<void> {
    try {
      if (!clientRef || !params.logChannelId) return;
      const channel = clientRef.channels.cache.get(params.logChannelId);
      if (!isSendable(channel)) return;
      await channel.send(text);
    } catch (err) {
      error({ event: 'moderation-log-failed', reason: toReason(err) });
    }
  }

  async function dmMember(member: GuildMember, text: string): Promise<void> {
    try {
      await member.send(text);
    } catch (err) {
      error({
        event: 'moderation-dm-failed',
        guildId: member.guild.id,
        userId: member.id,
        reason: toReason(err),
      });
    }
  }

  function recordStrike(guildId: string, userId: string): number {
    try {
      const next = (strikes.get(strikeKey(guildId, userId)) ?? 0) + 1;
      strikes.set(strikeKey(guildId, userId), next);
      return next;
    } catch (err) {
      error({ event: 'moderation-record-failed', guildId, userId, reason: toReason(err) });
      return 1;
    }
  }

  /**
   * Apply a resolved ladder punishment. Own-perms preflight per action:
   * missing permission = log plus skip that action (never throw). Timeout
   * over the 28d Discord limit is recorded as fallback-needed and skipped.
   */
  async function applyPunishment(
    member: GuildMember,
    punishment: Punishment,
    strikeCount: number,
    reason: string,
  ): Promise<void> {
    const guild = member.guild;
    const guildId = guild.id;
    const userId = member.id;
    const bot = botMemberOf(guild);
    if (punishment.kind === 'mute') {
      const durationMs = punishment.durationMs ?? 0;
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > TIMEOUT_MAX_MS) {
        error({
          event: 'moderation-timeout-fallback',
          guildId,
          userId,
          reason: `timeout over limit strike=${strikeCount}`,
        });
      } else if (!hasPerm(bot, PermissionFlagsBits.ModerateMembers)) {
        error({ event: 'moderation-missing-perms', guildId, userId, reason: 'ModerateMembers' });
      } else {
        try {
          await member.timeout(durationMs, reason);
        } catch (err) {
          error({
            event: 'moderation-timeout-failed',
            guildId,
            userId,
            reason: toReason(err),
          });
        }
      }
    } else {
      if (!hasPerm(bot, PermissionFlagsBits.BanMembers)) {
        error({ event: 'moderation-missing-perms', guildId, userId, reason: 'BanMembers' });
      } else {
        try {
          await member.ban({ reason });
          if (punishment.durationMs !== null) {
            let at = 0;
            try {
              at = now();
            } catch {
              at = Date.now();
            }
            await scheduleTempban(
              storage,
              {
                guildId,
                userId,
                unbanAtMs: at + punishment.durationMs,
                reason,
              },
              logger as TempbanLogger | undefined,
            );
          }
        } catch (err) {
          error({ event: 'moderation-ban-failed', guildId, userId, reason: toReason(err) });
        }
      }
    }
    await dmMember(
      member,
      `You received a ${punishment.reason} (strike ${strikeCount}): ${reason}`,
    );
    info({ event: 'moderation-action', guildId, userId });
    await postLog(`mod strike=${strikeCount} user=${userId} action=${punishment.reason}`);
  }

  async function deleteMessage(message: Message, guildId: string, userId: string): Promise<void> {
    const bot = message.guild ? botMemberOf(message.guild) : null;
    if (!hasPerm(bot, PermissionFlagsBits.ManageMessages)) {
      error({ event: 'moderation-missing-perms', guildId, userId, reason: 'ManageMessages' });
      return;
    }
    try {
      await message.delete();
    } catch (err) {
      error({ event: 'moderation-delete-failed', guildId, userId, reason: toReason(err) });
    }
  }

  async function handleSpam(message: Message): Promise<void> {
    const guild = message.guild;
    if (!guild) return;
    const userId = message.author.id;
    const channel = message.channel as unknown;
    if (
      !hasPerm(botMemberOf(guild), PermissionFlagsBits.ManageMessages) ||
      typeof (channel as { bulkDelete?: unknown }).bulkDelete !== 'function'
    ) {
      error({
        event: 'moderation-missing-perms',
        guildId: guild.id,
        userId,
        reason: 'ManageMessages',
      });
      return;
    }
    try {
      if (isSendable(channel)) {
        await channel.send(`<@${userId}> slow down — similar messages detected.`);
      }
    } catch (err) {
      error({ event: 'moderation-spam-failed', guildId: guild.id, userId, reason: toReason(err) });
    }
    try {
      await (
        channel as { bulkDelete(msgs: number, filterOld: boolean): Promise<unknown> }
      ).bulkDelete(10, true);
    } catch (err) {
      error({ event: 'moderation-spam-failed', guildId: guild.id, userId, reason: toReason(err) });
    }
    info({ event: 'moderation-spam', guildId: guild.id, userId });
    await postLog(`mod spam user=${userId} action=warn+bulkDelete`);
  }

  async function onMessageCreate(message: Message): Promise<void> {
    let at = 0;
    try {
      at = now();
    } catch {
      at = Date.now();
    }
    const view = buildView(message);
    const verdict = checkMessage(
      view,
      {
        badWords: params.badWords,
        protectedRoleIds: params.protectedRoleIds,
        alertOnly: params.alertOnly,
      },
      { cooldown, ring },
      at,
    );
    if (verdict.verdict === 'ignore') return;
    const guild = message.guild;
    if (!guild) return;
    const userId = view.authorId || message.author.id;
    if (verdict.verdict === 'spam') {
      await handleSpam(message);
      return;
    }
    const hit = verdict.hit;
    await deleteMessage(message, guild.id, userId);
    if (hit === 'link' || hit === 'attachment') {
      // Cooldown gates log+strike; deletion above always happens.
      if (verdict.cooldownActive) return;
      info({ event: 'moderation-link-action', guildId: guild.id, userId });
      await postLog(`mod ${hit} user=${userId} action=delete`);
      if (params.linkAction !== 'strike') return;
    } else if (hit === 'invite' && params.inviteAction !== 'strike') {
      info({ event: 'moderation-link-action', guildId: guild.id, userId });
      await postLog(`mod invite user=${userId} action=delete`);
      return;
    }
    const strikeCount = recordStrike(guild.id, userId);
    const punishment = nextPunishment(strikeCount);
    if (!punishment) return;
    const member = message.member;
    if (!member) {
      error({ event: 'moderation-missing-member', guildId: guild.id, userId });
      return;
    }
    await applyPunishment(
      member,
      punishment,
      strikeCount,
      `Automod ${hit} (strike ${strikeCount})`,
    );
  }

  async function denied(interaction: ChatInputCommandInteraction): Promise<void> {
    await respondCompat(interaction, {
      content: 'You need the Manage Messages permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  function invokerAllowed(interaction: ChatInputCommandInteraction): boolean {
    try {
      return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) === true;
    } catch {
      return false;
    }
  }

  async function fetchTarget(guild: Guild, userId: string): Promise<GuildMember | null> {
    try {
      return await guild.members.fetch(userId);
    } catch (err) {
      error({
        event: 'moderation-command-failed',
        guildId: guild.id,
        userId,
        reason: toReason(err),
      });
      return null;
    }
  }

  async function onWarn(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!invokerAllowed(interaction)) {
      await denied(interaction);
      return;
    }
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'This command works in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const target = interaction.options.getUser('user', true);
    const reasonText = interaction.options.getString('reason') ?? 'No reason given';
    const member = await fetchTarget(guild, target.id);
    if (!member) {
      await respondCompat(interaction, {
        content: 'User not found in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const strikeCount = recordStrike(guild.id, target.id);
    const punishment = nextPunishment(strikeCount);
    if (!punishment) {
      await respondCompat(interaction, {
        content: `Recorded strike ${strikeCount} for <@${target.id}>.`,
      });
      return;
    }
    await applyPunishment(member, punishment, strikeCount, `Manual warn: ${reasonText}`);
    await respondCompat(interaction, {
      content: `Warned <@${target.id}> (strike ${strikeCount}): ${punishment.reason}.`,
    });
  }

  async function onTimeout(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!invokerAllowed(interaction)) {
      await denied(interaction);
      return;
    }
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'This command works in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const target = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reasonText = interaction.options.getString('reason') ?? 'No reason given';
    const durationMs = minutes * 60_000;
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > TIMEOUT_MAX_MS) {
      error({
        event: 'moderation-timeout-fallback',
        guildId: guild.id,
        userId: target.id,
        reason: `command timeout over limit minutes=${minutes}`,
      });
      await respondCompat(interaction, {
        content: 'Timeout exceeds the 28-day Discord limit.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasPerm(botMemberOf(guild), PermissionFlagsBits.ModerateMembers)) {
      error({
        event: 'moderation-missing-perms',
        guildId: guild.id,
        userId: target.id,
        reason: 'ModerateMembers',
      });
      await respondCompat(interaction, {
        content: 'I am missing the Timeout Members permission.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const member = await fetchTarget(guild, target.id);
    if (!member) {
      await respondCompat(interaction, {
        content: 'User not found in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await member.timeout(durationMs, `Manual timeout: ${reasonText}`);
    } catch (err) {
      error({
        event: 'moderation-timeout-failed',
        guildId: guild.id,
        userId: target.id,
        reason: toReason(err),
      });
      await respondCompat(interaction, {
        content: 'Timeout failed — check my role position and permissions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await dmMember(member, `You received a timeout (${minutes}m): ${reasonText}`);
    info({ event: 'moderation-timeout-command', guildId: guild.id, userId: target.id });
    await respondCompat(interaction, { content: `Timed out <@${target.id}> for ${minutes}m.` });
  }

  // addXOption() narrows the builder to SlashCommandOptionsOnlyBuilder; the
  // BotCommand contract (registry.ts) wants SlashCommandBuilder, so cast at
  // the boundary (same pattern as sibling waves).
  const warnCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Issue a moderation strike to a member')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Member to warn').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for the warn').setRequired(false),
      ) as SlashCommandBuilder,
    execute: onWarn,
  };

  const timeoutCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout a member')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Member to timeout').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('minutes')
          .setDescription('Timeout duration in minutes (max 40320)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(40320),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for the timeout').setRequired(false),
      ) as SlashCommandBuilder,
    execute: onTimeout,
  };

  return {
    kind: 'moderation',
    commands: [warnCommand, timeoutCommand],
    events: [{ name: 'MessageCreate', execute: onMessageCreate }],
    start(client: Client, config: RuntimeConfigRow | null) {
      clientRef = client;
      try {
        params = parseModerationParams(config?.params ?? null);
      } catch {
        params = parseModerationParams(null);
      }
      const poll = startTempbanPoll(client, storage, { logger, now });
      return {
        stop(): void {
          poll.stop();
        },
      };
    },
  };
}
