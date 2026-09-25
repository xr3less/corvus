// Gateway games handler: XP curve, awards, level roles (site-engine bridge A6).
//
// FeatureModule kind xp: MessageCreate awards XP (bots ignored, 30s per-user
// cooldown checked before any write), plus /rank /balance /leaderboard.
// State flows through the XpStore port (in-memory default here); the Postgres
// tables are declared as DDL text in the task report, never migrated here.
// No ready listener anywhere in this module.

import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  InteractionReplyOptions,
  Message,
} from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { BotCommand, FeatureModule } from '../registry.js';

export const XP_CAP = 1_000_000_000;
export const LEVEL_K = 0.42;
export const CURRENCY_PER_LEVEL = 42;
export const XP_COOLDOWN_MS = 30_000;

export interface XpRecord {
  xp: number;
  balance: number;
}

export interface GuildXpRow {
  userId: string;
  xp: number;
  balance: number;
}

/** Storage port. Postgres backs this in production; memory is the default. */
export interface XpStore {
  get(guildId: string, userId: string): XpRecord | undefined;
  set(guildId: string, userId: string, record: XpRecord): void;
  listGuild(guildId: string): GuildXpRow[];
}

export class InMemoryXpStore implements XpStore {
  private readonly data = new Map<string, Map<string, XpRecord>>();

  get(guildId: string, userId: string): XpRecord | undefined {
    return this.data.get(guildId)?.get(userId);
  }

  set(guildId: string, userId: string, record: XpRecord): void {
    let guild = this.data.get(guildId);
    if (guild === undefined) {
      guild = new Map<string, XpRecord>();
      this.data.set(guildId, guild);
    }
    guild.set(userId, { xp: record.xp, balance: record.balance });
  }

  listGuild(guildId: string): GuildXpRow[] {
    const guild = this.data.get(guildId);
    if (guild === undefined) return [];
    return [...guild.entries()].map(([userId, record]) => ({
      userId,
      xp: record.xp,
      balance: record.balance,
    }));
  }
}

/** Level is a pure function of total XP: floor(0.42 * sqrt(clamped total)). */
export function levelFor(totalXp: number): number {
  const clamped = Math.min(Math.max(totalXp, 0), XP_CAP);
  return Math.floor(LEVEL_K * Math.sqrt(clamped));
}

/** Inverse of levelFor: total XP needed to reach a level. */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor((level / LEVEL_K) ** 2);
}

export interface AwardResult {
  xp: number;
  balance: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
  reward: number;
}

/** Apply an XP award to the store. Caps at XP_CAP; level-up pays level * 42. */
export function awardXp(
  store: XpStore,
  guildId: string,
  userId: string,
  amount: number,
): AwardResult {
  const current = store.get(guildId, userId) ?? { xp: 0, balance: 0 };
  const oldLevel = levelFor(current.xp);
  const xp = Math.min(current.xp + Math.max(amount, 0), XP_CAP);
  const newLevel = levelFor(xp);
  let balance = current.balance;
  let reward = 0;
  let leveledUp = false;
  if (newLevel > oldLevel) {
    leveledUp = true;
    reward = newLevel * CURRENCY_PER_LEVEL;
    balance += reward;
  }
  store.set(guildId, userId, { xp, balance });
  return { xp, balance, oldLevel, newLevel, leveledUp, reward };
}

/** Per-user write gate: an award proceeds only 30s after the last write. */
export class XpCooldowns {
  private readonly last = new Map<string, number>();

  allow(guildId: string, userId: string, nowMs: number, windowMs = XP_COOLDOWN_MS): boolean {
    const key = `${guildId}:${userId}`;
    const last = this.last.get(key);
    if (last !== undefined && nowMs - last < windowMs) return false;
    this.last.set(key, nowMs);
    return true;
  }

  reset(): void {
    this.last.clear();
  }
}

export interface TryAwardResult extends AwardResult {
  awarded: boolean;
}

/** Cooldown gate plus award: on cooldown nothing is written (awarded:false). */
export function tryAwardXp(
  store: XpStore,
  cooldowns: XpCooldowns,
  guildId: string,
  userId: string,
  amount: number,
  nowMs: number = Date.now(),
): TryAwardResult {
  if (!cooldowns.allow(guildId, userId, nowMs)) {
    const record = store.get(guildId, userId) ?? { xp: 0, balance: 0 };
    const level = levelFor(record.xp);
    return {
      awarded: false,
      xp: record.xp,
      balance: record.balance,
      oldLevel: level,
      newLevel: level,
      leveledUp: false,
      reward: 0,
    };
  }
  return { awarded: true, ...awardXp(store, guildId, userId, amount) };
}

export interface LevelRoleEntry {
  roleId: string;
  level: number;
}

/**
 * Resolve the target role-id list: current roles minus every managed (level)
 * role, plus the roles at the nearest level <= current. Returns null when
 * there is nothing to do (no entries, no eligible level, or the set already
 * matches) so the caller can skip the roles.set() call.
 */
export function resolveLevelRoleIds(
  currentRoleIds: readonly string[],
  entries: LevelRoleEntry[],
  level: number,
): string[] | null {
  if (entries.length === 0) return null;
  const eligible = entries.filter((entry) => entry.level <= level);
  if (eligible.length === 0) return null;
  const nearest = Math.max(...eligible.map((entry) => entry.level));
  const atNearest = eligible
    .filter((entry) => entry.level === nearest)
    .map((entry) => entry.roleId);
  const managed = new Set(entries.map((entry) => entry.roleId));
  const target = currentRoleIds.filter((id) => !managed.has(id));
  for (const id of atNearest) {
    if (!target.includes(id)) target.push(id);
  }
  const currentSet = new Set(currentRoleIds);
  if (target.length === currentSet.size && target.every((id) => currentSet.has(id))) return null;
  return target;
}

/** Apply level roles via roles.set(); false when skipped or failed. */
export async function applyLevelRoles(
  member: GuildMember,
  level: number,
  entries: LevelRoleEntry[],
): Promise<boolean> {
  let current: string[];
  try {
    current = [...member.roles.cache.keys()];
  } catch {
    return false;
  }
  const target = resolveLevelRoleIds(current, entries, level);
  if (target === null) return false;
  try {
    await member.roles.set(target);
    return true;
  } catch {
    return false;
  }
}

export interface XpParams {
  xpPerMessage: number;
  boosterBonus: number;
  levelRoles: LevelRoleEntry[];
  logChannelId: string | null;
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function asLevelRoles(value: unknown): LevelRoleEntry[] {
  if (!Array.isArray(value)) return [];
  const out: LevelRoleEntry[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record['roleId'] !== 'string' || typeof record['level'] !== 'number') continue;
    out.push({ roleId: record['roleId'], level: record['level'] });
  }
  return out;
}

export function parseXpParams(params: unknown): XpParams {
  const fallback: XpParams = {
    xpPerMessage: 1,
    boosterBonus: 2,
    levelRoles: [],
    logChannelId: null,
  };
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return fallback;
  const record = params as Record<string, unknown>;
  const logChannelId = record['logChannelId'];
  return {
    xpPerMessage: asPositiveInt(record['xpPerMessage'], fallback.xpPerMessage),
    boosterBonus: asPositiveInt(record['boosterBonus'], fallback.boosterBonus),
    levelRoles: asLevelRoles(record['levelRoles']),
    logChannelId: typeof logChannelId === 'string' && logChannelId.length > 0 ? logChannelId : null,
  };
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

export interface XpLogger {
  info(record: { event: string; guildId?: string }): void;
  error(record: { event: string; guildId?: string; reason?: string }): void;
}

export interface XpModuleOptions {
  store?: XpStore;
  cooldowns?: XpCooldowns;
  logger?: XpLogger;
  now?: () => number;
}

function toReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isSendable(channel: unknown): channel is { send(payload: unknown): Promise<unknown> } {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    typeof (channel as { send?: unknown }).send === 'function'
  );
}

export function buildXpModule(opts: XpModuleOptions = {}): FeatureModule {
  const store = opts.store ?? new InMemoryXpStore();
  const cooldowns = opts.cooldowns ?? new XpCooldowns();
  const logger = opts.logger;
  const now = opts.now ?? Date.now;
  let params: XpParams = parseXpParams(null);
  let clientRef: Client | null = null;

  function info(record: { event: string; guildId?: string }): void {
    try {
      logger?.info(record);
    } catch {
      // Logger failure never breaks XP.
    }
  }

  function failure(record: { event: string; guildId?: string; reason?: string }): void {
    try {
      logger?.error(record);
    } catch {
      // Logger failure never breaks XP.
    }
  }

  function clock(): number {
    try {
      return now();
    } catch {
      return Date.now();
    }
  }

  function isBooster(message: Message): boolean {
    try {
      return (message.member?.premiumSinceTimestamp ?? null) !== null;
    } catch {
      return false;
    }
  }

  async function postLog(text: string): Promise<void> {
    try {
      if (!clientRef || !params.logChannelId) return;
      const channel = clientRef.channels.cache.get(params.logChannelId);
      if (!isSendable(channel)) return;
      await channel.send(text);
    } catch (err) {
      failure({ event: 'xp-log-failed', reason: toReason(err) });
    }
  }

  async function onMessageCreate(message: Message): Promise<void> {
    let authorBot = false;
    let guildId: string | null = null;
    let userId = '';
    try {
      authorBot = message.author.bot === true;
      guildId = message.guild?.id ?? null;
      userId = typeof message.author.id === 'string' ? message.author.id : '';
    } catch {
      return;
    }
    if (authorBot || guildId === null || userId === '') return;
    const amount = isBooster(message) ? params.boosterBonus : params.xpPerMessage;
    const result = tryAwardXp(store, cooldowns, guildId, userId, amount, clock());
    if (!result.awarded) return;
    if (result.leveledUp) {
      info({ event: 'xp-levelup', guildId });
      await postLog(`<@${userId}> reached level ${result.newLevel}.`);
    }
    const member = message.member;
    if (member) {
      try {
        await applyLevelRoles(member, result.newLevel, params.levelRoles);
      } catch (err) {
        failure({ event: 'xp-role-error', guildId, reason: toReason(err) });
      }
    }
  }

  function readRecord(guildId: string, userId: string): XpRecord {
    try {
      return store.get(guildId, userId) ?? { xp: 0, balance: 0 };
    } catch {
      return { xp: 0, balance: 0 };
    }
  }

  async function guildOnly(interaction: ChatInputCommandInteraction): Promise<string | null> {
    const guildId = interaction.guildId;
    if (guildId === null) {
      await respondCompat(interaction, {
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }
    return guildId;
  }

  async function onRank(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await guildOnly(interaction);
    if (guildId === null) return;
    const target = interaction.options.getUser('user') ?? interaction.user;
    const record = readRecord(guildId, target.id);
    const level = levelFor(record.xp);
    const toNext = xpForLevel(level + 1) - record.xp;
    await respondCompat(interaction, {
      content: `${target.username} — level ${level} (${record.xp} XP, ${toNext} XP to level ${level + 1}) · ${record.balance} coins.`,
    });
  }

  async function onBalance(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await guildOnly(interaction);
    if (guildId === null) return;
    const target = interaction.options.getUser('user') ?? interaction.user;
    const record = readRecord(guildId, target.id);
    await respondCompat(interaction, {
      content: `${target.username} has ${record.balance} coins.`,
    });
  }

  async function onLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await guildOnly(interaction);
    if (guildId === null) return;
    let rows: GuildXpRow[];
    try {
      rows = store.listGuild(guildId);
    } catch {
      rows = [];
    }
    const top = [...rows].sort((a, b) => b.xp - a.xp).slice(0, 10);
    if (top.length === 0) {
      await respondCompat(interaction, { content: 'No XP recorded in this server yet.' });
      return;
    }
    const lines = top.map(
      (row, i) => `${i + 1}. <@${row.userId}> — level ${levelFor(row.xp)} (${row.xp} XP)`,
    );
    const embed = new EmbedBuilder()
      .setTitle('Leaderboard')
      .setDescription(lines.join('\n'))
      .setColor(0x5865f2);
    await respondCompat(interaction, { embeds: [embed] });
  }

  // addXOption() narrows the builder; the BotCommand contract wants
  // SlashCommandBuilder, so cast at the boundary.
  const rankCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Show XP level and balance.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Whose rank to show.').setRequired(false),
      ) as SlashCommandBuilder,
    execute: onRank,
  };

  const balanceCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Show coin balance.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Whose balance to show.').setRequired(false),
      ) as SlashCommandBuilder,
    execute: onBalance,
  };

  const leaderboardCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show the top 10 members by XP in this server.'),
    execute: onLeaderboard,
  };

  return {
    kind: 'xp',
    commands: [rankCommand, balanceCommand, leaderboardCommand],
    events: [{ name: 'MessageCreate', execute: onMessageCreate }],
    start(client: Client, config: RuntimeConfigRow | null) {
      clientRef = client;
      try {
        params = parseXpParams(config?.params ?? null);
      } catch {
        params = parseXpParams(null);
      }
    },
  };
}
