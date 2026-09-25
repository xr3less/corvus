// Wave E1: reaction-roles FeatureModule (kind reaction-roles).
//
// Role-reactor runtime: subscribes to MessageReactionAdd (already in the
// closed BotEvent union — NO new BotEvent is added). The picker is posted by a
// dispatcher slash command (/role post lists the emoji→role map and seeds the
// emojis); the add-path grants the matching role when a user reacts to a
// tracked picker message; removal ships as /role remove (per SPEC E1, no
// MessageReactionRemove event). Per-group exclusivity and per-member limits
// are enforced at grant time.
//
// OSS basis: discord.js guide v14 reactions + partials
// (discordjs.guide/popular-topics/reactions, .../partials) — partial reaction
// fetch before reading, seeded emoji via message.react, role grant via
// member.roles.add — against installed discord.js 14.27.0 (disk-verified).
// In-repo module shape follows apps/gateway/src/runtime/moderation/index.ts
// (own-perms preflight, per-handler try/catch).

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  MessageReaction,
  User,
} from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { BotCommand, FeatureModule } from '../registry.js';

export const ROLE_COMMAND_NAME = 'role';

export interface ReactionRolesLogger {
  info(record: { event: string; guildId?: string; userId?: string }): void;
  error(record: { event: string; guildId?: string; userId?: string; reason?: string }): void;
}

export interface ReactionRolesModuleOptions {
  logger?: ReactionRolesLogger;
}

export interface RoleGroup {
  /** Picker message id this group is attached to (empty = any picker). */
  messageId: string;
  /** Emoji key (unicode or custom id) -> role id. */
  emojiToRole: Record<string, string>;
  /** When true, picking one role drops the other group roles. */
  exclusive: boolean;
  /** Max roles from this group one member may hold (0 = unlimited). */
  maxPerMember: number;
}

export interface ReactionRolesParams {
  groups: RoleGroup[];
  logChannelId: string | null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRoleGroup(value: unknown): RoleGroup | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const emojiToRole: Record<string, string> = {};
  const raw = record['emojiToRole'];
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [emoji, roleId] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof roleId === 'string' && roleId.length > 0) {
        emojiToRole[emoji] = roleId;
      }
    }
  }
  if (Object.keys(emojiToRole).length === 0) {
    return null;
  }
  const maxRaw = record['maxPerMember'];
  const maxPerMember =
    typeof maxRaw === 'number' && Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 0;
  return {
    messageId: typeof record['messageId'] === 'string' ? record['messageId'] : '',
    emojiToRole,
    exclusive: record['exclusive'] === true,
    maxPerMember,
  };
}

/** Defensive params parse: malformed input falls back, never throws. */
export function parseReactionRolesParams(params: unknown): ReactionRolesParams {
  const fallback: ReactionRolesParams = { groups: [], logChannelId: null };
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return fallback;
  }
  const record = params as Record<string, unknown>;
  const rawGroups = record['groups'];
  const groups: RoleGroup[] = [];
  if (Array.isArray(rawGroups)) {
    for (const item of rawGroups) {
      const group = asRoleGroup(item);
      if (group !== null) {
        groups.push(group);
      }
    }
  } else {
    // Translator-item shape: a single emoji→role map carried inline.
    const single = asRoleGroup(record);
    if (single !== null) {
      groups.push(single);
    }
  }
  return {
    groups,
    logChannelId: asNonEmptyString(record['logChannelId']),
  };
}

/**
 * Emoji key for matching: custom emoji prefer id (stable across names),
 * unicode falls back to name. Never throws.
 */
export function emojiKeyOf(reaction: MessageReaction): string | null {
  try {
    const emoji = reaction.emoji as { id?: unknown; name?: unknown };
    if (typeof emoji.id === 'string' && emoji.id.length > 0) {
      return emoji.id;
    }
    if (typeof emoji.name === 'string' && emoji.name.length > 0) {
      return emoji.name;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pure grant planner: given the member's current role ids, the matched group
 * and role, decide the add/remove sets. Exclusive groups drop sibling group
 * roles; maxPerMember caps the grant (null = denied by limit, caller logs).
 * Returns null when there is nothing to do (role already held, no siblings).
 */
export function planRoleGrant(
  currentRoleIds: readonly string[],
  group: RoleGroup,
  roleId: string,
): { add: string[]; remove: string[] } | null {
  const current = new Set(currentRoleIds);
  if (current.has(roleId)) {
    return null;
  }
  const groupRoleIds = Object.values(group.emojiToRole);
  const remove: string[] = [];
  if (group.exclusive) {
    for (const sibling of groupRoleIds) {
      if (sibling !== roleId && current.has(sibling)) {
        remove.push(sibling);
      }
    }
  }
  const after = currentRoleIds.filter((id) => !remove.includes(id));
  if (!after.includes(roleId)) {
    after.push(roleId);
  }
  const heldFromGroup = after.filter((id) => groupRoleIds.includes(id));
  if (group.maxPerMember > 0 && heldFromGroup.length > group.maxPerMember) {
    return null;
  }
  return { add: [roleId], remove };
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

export function buildReactionRolesModule(opts: ReactionRolesModuleOptions = {}): FeatureModule {
  const logger = opts.logger;
  let params: ReactionRolesParams = parseReactionRolesParams(null);
  let clientRef: Client | null = null;
  // Picker registry: messageId -> group index into params.groups. Seeded by
  // /role post at runtime; rebuilt from params on start().
  const pickers = new Map<string, number>();

  function info(record: { event: string; guildId?: string; userId?: string }): void {
    try {
      logger?.info(record);
    } catch {
      // Logger failure never breaks role grants.
    }
  }

  function failure(record: {
    event: string;
    guildId?: string;
    userId?: string;
    reason?: string;
  }): void {
    try {
      logger?.error(record);
    } catch {
      // Logger failure never breaks role grants.
    }
  }

  async function postLog(text: string): Promise<void> {
    try {
      if (!clientRef || !params.logChannelId) return;
      const channel = clientRef.channels.cache.get(params.logChannelId);
      if (!isSendable(channel)) return;
      await channel.send(text);
    } catch (err) {
      failure({ event: 'reaction-roles-log-failed', reason: toReason(err) });
    }
  }

  function rebuildPickers(): void {
    try {
      pickers.clear();
      params.groups.forEach((group, index) => {
        if (group.messageId.length > 0) {
          pickers.set(group.messageId, index);
        }
      });
    } catch {
      // A broken params shape never breaks the module.
    }
  }

  function groupForMessage(messageId: string): { group: RoleGroup; index: number } | null {
    const index = pickers.get(messageId);
    if (index !== undefined) {
      const group = params.groups[index];
      if (group !== undefined) {
        return { group, index };
      }
    }
    // Unpinned groups (no messageId) match any picker message.
    for (let i = 0; i < params.groups.length; i += 1) {
      const group = params.groups[i];
      if (group !== undefined && group.messageId.length === 0) {
        return { group, index: i };
      }
    }
    return null;
  }

  async function fetchFullReaction(reaction: MessageReaction): Promise<MessageReaction | null> {
    try {
      const partial = (reaction as { partial?: unknown }).partial;
      if (partial === true && typeof reaction.fetch === 'function') {
        return (await reaction.fetch()) as MessageReaction;
      }
      return reaction;
    } catch (err) {
      failure({ event: 'reaction-roles-fetch-failed', reason: toReason(err) });
      return null;
    }
  }

  async function onMessageReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
    let userId = '';
    let isBot = false;
    try {
      userId = typeof user.id === 'string' ? user.id : '';
      isBot = user.bot === true;
    } catch {
      return;
    }
    if (userId === '' || isBot) return;
    const full = await fetchFullReaction(reaction);
    if (full === null) return;
    let messageId = '';
    let guild: Guild | null = null;
    try {
      messageId = typeof full.message.id === 'string' ? full.message.id : '';
      guild = full.message.guild ?? null;
    } catch {
      return;
    }
    if (messageId === '' || !guild) return;
    const matched = groupForMessage(messageId);
    if (matched === null) return;
    const key = emojiKeyOf(full);
    if (key === null) return;
    const roleId = matched.group.emojiToRole[key];
    if (roleId === undefined) return;
    if (!hasPerm(botMemberOf(guild), PermissionFlagsBits.ManageRoles)) {
      failure({
        event: 'reaction-roles-missing-perms',
        guildId: guild.id,
        userId,
        reason: 'ManageRoles',
      });
      return;
    }
    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch(userId);
    } catch (err) {
      failure({
        event: 'reaction-roles-member-failed',
        guildId: guild.id,
        userId,
        reason: toReason(err),
      });
      return;
    }
    if (!member) return;
    let current: string[] = [];
    try {
      current = [...member.roles.cache.keys()];
    } catch {
      return;
    }
    let plan: { add: string[]; remove: string[] } | null = null;
    try {
      plan = planRoleGrant(current, matched.group, roleId);
    } catch {
      return;
    }
    if (plan === null) {
      // Already holds the role, or the group limit denies the grant.
      info({ event: 'reaction-roles-skipped', guildId: guild.id, userId });
      return;
    }
    try {
      for (const drop of plan.remove) {
        await member.roles.remove(drop);
      }
      for (const add of plan.add) {
        await member.roles.add(add);
      }
    } catch (err) {
      failure({
        event: 'reaction-roles-grant-failed',
        guildId: guild.id,
        userId,
        reason: toReason(err),
      });
      return;
    }
    info({ event: 'reaction-roles-granted', guildId: guild.id, userId });
    await postLog(`role granted user=${userId} role=${roleId}`);
  }

  async function onRolePost(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'Role pickers work in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let allowed = false;
    try {
      allowed = interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles) === true;
    } catch {
      allowed = false;
    }
    if (!allowed) {
      await respondCompat(interaction, {
        content: 'You need the Manage Roles permission to post a role picker.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const channel = interaction.channel;
    if (!isSendable(channel)) {
      await respondCompat(interaction, {
        content: 'Role pickers can only be posted in a server text channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = params.groups.flatMap((group) =>
      Object.entries(group.emojiToRole).map(([emoji, roleId]) => `${emoji} → <@&${roleId}>`),
    );
    const body =
      lines.length > 0 ? lines.join('\n') : 'React to this message to collect your roles.';
    let posted: { id: string; react(e: string): Promise<unknown> };
    try {
      posted = (await (
        channel as { send(p: unknown): Promise<{ id: string; react(e: string): Promise<unknown> }> }
      ).send(`**Pick your roles**\n${body}`)) as {
        id: string;
        react(e: string): Promise<unknown>;
      };
    } catch (err) {
      failure({ event: 'reaction-roles-post-failed', guildId: guild.id, reason: toReason(err) });
      await respondCompat(interaction, {
        content: 'Could not post the picker — check my channel permissions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Seed the picker emojis (own-perms preflight: missing AddReactions logs).
    if (!hasPerm(botMemberOf(guild), PermissionFlagsBits.AddReactions)) {
      failure({
        event: 'reaction-roles-missing-perms',
        guildId: guild.id,
        reason: 'AddReactions',
      });
    } else {
      const emojis = [...new Set(params.groups.flatMap((group) => Object.keys(group.emojiToRole)))];
      for (const emoji of emojis) {
        try {
          await posted.react(emoji);
        } catch (err) {
          failure({
            event: 'reaction-roles-seed-failed',
            guildId: guild.id,
            reason: toReason(err),
          });
        }
      }
    }
    // Track the posted picker under every pinned-by-nothing group slot so the
    // add-path resolves immediately without waiting for a config refresh.
    try {
      params.groups.forEach((group, index) => {
        if (group.messageId.length === 0) {
          pickers.set(posted.id, index);
        }
      });
    } catch {
      // Registry bookkeeping never breaks the command.
    }
    info({ event: 'reaction-roles-posted', guildId: guild.id });
    await respondCompat(interaction, { content: `Role picker posted: <#${posted.id}>.` });
  }

  async function onRoleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'Role removal works in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const target = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    let allowed = false;
    try {
      allowed = interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles) === true;
    } catch {
      allowed = false;
    }
    if (!allowed) {
      await respondCompat(interaction, {
        content: 'You need the Manage Roles permission to remove roles.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasPerm(botMemberOf(guild), PermissionFlagsBits.ManageRoles)) {
      failure({
        event: 'reaction-roles-missing-perms',
        guildId: guild.id,
        userId: target.id,
        reason: 'ManageRoles',
      });
      await respondCompat(interaction, {
        content: 'I am missing the Manage Roles permission.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch(target.id);
    } catch (err) {
      failure({
        event: 'reaction-roles-member-failed',
        guildId: guild.id,
        userId: target.id,
        reason: toReason(err),
      });
      await respondCompat(interaction, {
        content: 'User not found in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!member) {
      await respondCompat(interaction, {
        content: 'User not found in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await member.roles.remove(role.id);
    } catch (err) {
      failure({
        event: 'reaction-roles-remove-failed',
        guildId: guild.id,
        userId: target.id,
        reason: toReason(err),
      });
      await respondCompat(interaction, {
        content: 'Role removal failed — check my role position.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    info({ event: 'reaction-roles-removed', guildId: guild.id, userId: target.id });
    await respondCompat(interaction, { content: `Removed <@&${role.id}> from <@${target.id}>.` });
  }

  async function onRole(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === 'post') {
        await onRolePost(interaction);
      } else if (sub === 'remove') {
        await onRoleRemove(interaction);
      } else {
        await respondCompat(interaction, {
          content: 'Unknown subcommand.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      failure({
        event: 'reaction-roles-command-failed',
        guildId: interaction.guildId ?? undefined,
        reason: toReason(err),
      });
      try {
        const payload = {
          content: 'Role command failed — please try again.',
          flags: MessageFlags.Ephemeral,
        } as const;
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch {
        // Error reply must never escape.
      }
    }
  }

  // addSubcommand() narrows the builder; the BotCommand contract wants
  // SlashCommandBuilder, so cast at the boundary (same pattern as siblings).
  const roleCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName(ROLE_COMMAND_NAME)
      .setDescription('Post a role picker and manage granted roles.')
      .addSubcommand((s) => s.setName('post').setDescription('Post the role picker.'))
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('Remove a granted role from a member.')
          .addUserOption((o) =>
            o.setName('user').setDescription('Member to remove the role from.').setRequired(true),
          )
          .addRoleOption((o) =>
            o.setName('role').setDescription('Role to remove.').setRequired(true),
          ),
      ) as SlashCommandBuilder,
    execute: onRole,
  };

  return {
    kind: 'reaction-roles',
    commands: [roleCommand],
    events: [{ name: 'MessageReactionAdd', execute: onMessageReactionAdd }],
    start(client: Client, config: RuntimeConfigRow | null) {
      clientRef = client;
      try {
        params = parseReactionRolesParams(config?.params ?? null);
      } catch {
        params = parseReactionRolesParams(null);
      }
      rebuildPickers();
      return undefined;
    },
  };
}
