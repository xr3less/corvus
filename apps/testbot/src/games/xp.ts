// XP + levels + currency for the trial bot (apps/testbot/src/games/xp.ts).
//
// Shape (from OSS brief, Bastion behavioural shape only — no GPL lines):
// - 1 XP per message, 2 for server boosters (premiumSinceTimestamp set).
// - 30s per-user cooldown, checked BEFORE any write. Cooldowns in memory only.
// - Hard cap 1e9. Level = floor(0.42 * sqrt(totalXp)), pure function of total.
// - Level-up pays level * 42 currency. State in data/games.json, atomic tmp+rename.
// - Level roles from data/roles.json {guildId: [{roleId, level}]}: nearest level
//   <= current, roles.set() only when the target set differs. Missing/empty
//   roles file = skip silently.

import { Events, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember, Message } from 'discord.js';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRENCY_PER_LEVEL,
  LEVEL_K,
  XP_BOOSTER,
  XP_CAP,
  XP_COOLDOWN_MS,
  XP_PER_MESSAGE,
} from '../config.js';
import type { BotCommand, BotEvent } from '../core/registry.js';
import { log } from '../log.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** XP/currency store. Missing file = empty store (trial bot starts clean). */
export const GAMES_PATH = resolve(HERE, '../../data/games.json');
/** Level-role map {guildId: [{roleId, level}]}. Missing/empty = skip silently. */
export const ROLES_PATH = resolve(HERE, '../../data/roles.json');

export interface XpRecord {
  xp: number;
  balance: number;
}

export type XpStore = Record<string, Record<string, XpRecord>>;

export interface LevelRoleEntry {
  roleId: string;
  level: number;
}

/** Level is a pure function of total XP: floor(0.42 * sqrt(clamped total)). */
export function computeLevel(totalXp: number): number {
  const clamped = Math.min(Math.max(totalXp, 0), XP_CAP);
  return Math.floor(LEVEL_K * Math.sqrt(clamped));
}

/** Inverse of computeLevel: total XP needed to reach a level. */
export function computeExperience(level: number): number {
  if (level <= 0) return 0;
  return Math.floor((level / LEVEL_K) ** 2);
}

function coerceRecord(value: unknown): XpRecord {
  if (typeof value !== 'object' || value === null) return { xp: 0, balance: 0 };
  const rec = value as Record<string, unknown>;
  return {
    xp: typeof rec.xp === 'number' && rec.xp >= 0 ? Math.min(rec.xp, XP_CAP) : 0,
    balance: typeof rec.balance === 'number' && rec.balance >= 0 ? rec.balance : 0,
  };
}

export function loadStore(path: string = GAMES_PATH): XpStore {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return {};
    const store: XpStore = {};
    for (const [guildId, members] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof members !== 'object' || members === null) continue;
      store[guildId] = {};
      for (const [memberId, record] of Object.entries(members as Record<string, unknown>)) {
        const guildStore = store[guildId];
        if (guildStore !== undefined) guildStore[memberId] = coerceRecord(record);
      }
    }
    return store;
  } catch {
    return {};
  }
}

/** Atomic write: tmp file + rename, so a crash never leaves half a JSON file. */
export function saveStore(store: XpStore, path: string = GAMES_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  renameSync(tmp, path);
}

export interface AwardResult {
  xp: number;
  balance: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
  reward: number;
}

/**
 * Apply an XP award to an in-memory store (pure apart from the passed store).
 * Caps at XP_CAP; on level-up pays newLevel * 42 currency.
 */
export function awardXp(
  store: XpStore,
  guildId: string,
  memberId: string,
  amount: number,
): AwardResult {
  const guild = (store[guildId] ??= {});
  const record = (guild[memberId] ??= { xp: 0, balance: 0 });
  const oldLevel = computeLevel(record.xp);
  record.xp = Math.min(record.xp + Math.max(amount, 0), XP_CAP);
  const newLevel = computeLevel(record.xp);
  let reward = 0;
  let leveledUp = false;
  if (newLevel > oldLevel) {
    leveledUp = true;
    reward = newLevel * CURRENCY_PER_LEVEL;
    record.balance += reward;
  }
  return { xp: record.xp, balance: record.balance, oldLevel, newLevel, leveledUp, reward };
}

// --- Cooldown (in memory only; checked BEFORE any write) ---

const lastAwardByUser = new Map<string, number>();

export function isCooldownActive(
  lastAwardMs: number | undefined,
  nowMs: number,
  cooldownMs: number = XP_COOLDOWN_MS,
): boolean {
  if (lastAwardMs === undefined) return false;
  return nowMs - lastAwardMs < cooldownMs;
}

/** Test hook: clear the in-memory cooldown map. */
export function resetCooldowns(): void {
  lastAwardByUser.clear();
}

export interface TryAwardResult extends AwardResult {
  awarded: boolean;
}

/**
 * Gate + award in one step: when on cooldown nothing is written
 * (awarded:false) and the store is untouched.
 */
export function tryAward(
  store: XpStore,
  guildId: string,
  memberId: string,
  amount: number,
  nowMs: number = Date.now(),
): TryAwardResult {
  const key = `${guildId}:${memberId}`;
  if (isCooldownActive(lastAwardByUser.get(key), nowMs)) {
    const record = store[guildId]?.[memberId] ?? { xp: 0, balance: 0 };
    const level = computeLevel(record.xp);
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
  lastAwardByUser.set(key, nowMs);
  return { awarded: true, ...awardXp(store, guildId, memberId, amount) };
}

// --- Level roles ---

export function readLevelRoles(guildId: string, path: string = ROLES_PATH): LevelRoleEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return [];
    const list: unknown = (parsed as Record<string, unknown>)[guildId];
    if (!Array.isArray(list)) return [];
    const out: LevelRoleEntry[] = [];
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.roleId !== 'string' || typeof rec.level !== 'number') continue;
      out.push({ roleId: rec.roleId, level: rec.level });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Resolve the target role-id list: keep current roles minus every managed
 * (level) role, plus the roles at the nearest level <= current. Returns null
 * when there is nothing to do (no entries, no eligible level, or the set
 * already matches) so the caller can skip the roles.set() API call.
 */
export function resolveLevelRoleIds(
  currentRoleIds: readonly string[],
  entries: LevelRoleEntry[],
  level: number,
): string[] | null {
  if (entries.length === 0) return null;
  const eligible = entries.filter((e) => e.level <= level);
  if (eligible.length === 0) return null;
  const nearest = Math.max(...eligible.map((e) => e.level));
  const atNearest = eligible.filter((e) => e.level === nearest).map((e) => e.roleId);
  const managed = new Set(entries.map((e) => e.roleId));
  const target = currentRoleIds.filter((id) => !managed.has(id));
  for (const id of atNearest) {
    if (!target.includes(id)) target.push(id);
  }
  const currentSet = new Set(currentRoleIds);
  if (target.length === currentSet.size && target.every((id) => currentSet.has(id))) return null;
  return target;
}

export async function maybeAssignLevelRole(member: GuildMember, level: number): Promise<boolean> {
  const entries = readLevelRoles(member.guild.id);
  const target = resolveLevelRoleIds([...member.roles.cache.keys()], entries, level);
  if (target === null) return false;
  await member.roles.set(target);
  return true;
}

// --- messageCreate handler ---

export async function handleMessageXp(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.guild === null) return;
  const guildId = message.guild.id;
  const memberId = message.author.id;
  const amount = message.member?.premiumSinceTimestamp ? XP_BOOSTER : XP_PER_MESSAGE;
  const store = loadStore();
  const result = tryAward(store, guildId, memberId, amount);
  if (!result.awarded) return;
  saveStore(store);
  if (result.leveledUp) {
    log('info', 'bot-xp-levelup', { guild: guildId, level: result.newLevel });
  }
  if (message.member !== null) {
    try {
      await maybeAssignLevelRole(message.member, result.newLevel);
    } catch (err) {
      log('error', 'bot-xp-role-error', {
        guild: guildId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const xpMessageCreateEvent: BotEvent<'messageCreate'> = {
  name: Events.MessageCreate,
  execute: async (message): Promise<void> => {
    await handleMessageXp(message);
  },
};

// --- Commands: /rank /balance /leaderboard ---

function readMemberRecord(guildId: string, memberId: string): XpRecord {
  const store = loadStore();
  return store[guildId]?.[memberId] ?? { xp: 0, balance: 0 };
}

export const rankCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show XP level and balance.')
    .addUserOption((o) =>
      o.setName('user').setDescription('Whose rank to show.').setRequired(false),
    ) as SlashCommandBuilder,
  execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
    const guildId = interaction.guildId;
    if (guildId === null) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const target = interaction.options.getUser('user') ?? interaction.user;
    const record = readMemberRecord(guildId, target.id);
    const level = computeLevel(record.xp);
    const toNext = computeExperience(level + 1) - record.xp;
    await interaction.reply({
      content: `${target.username} — level ${level} (${record.xp} XP, ${toNext} XP to level ${level + 1}) · ${record.balance} coins.`,
    });
  },
};

export const balanceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show coin balance.')
    .addUserOption((o) =>
      o.setName('user').setDescription('Whose balance to show.').setRequired(false),
    ) as SlashCommandBuilder,
  execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
    const guildId = interaction.guildId;
    if (guildId === null) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const target = interaction.options.getUser('user') ?? interaction.user;
    const record = readMemberRecord(guildId, target.id);
    await interaction.reply({ content: `${target.username} has ${record.balance} coins.` });
  },
};

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top 10 members by XP in this server.'),
  execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
    const guildId = interaction.guildId;
    if (guildId === null) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const store = loadStore();
    const guildStore = store[guildId] ?? {};
    const rows = Object.entries(guildStore)
      .map(([memberId, record]) => ({ memberId, xp: record.xp }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10);
    if (rows.length === 0) {
      await interaction.reply({ content: 'No XP recorded in this server yet.' });
      return;
    }
    const lines = rows.map(
      (row, i) => `${i + 1}. <@${row.memberId}> — level ${computeLevel(row.xp)} (${row.xp} XP)`,
    );
    await interaction.reply({ content: `**Leaderboard**\n${lines.join('\n')}` });
  },
};
