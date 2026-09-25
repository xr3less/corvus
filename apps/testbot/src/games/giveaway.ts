// Giveaway for the trial bot (apps/testbot/src/games/giveaway.ts).
//
// Hand-rolled poll shape (discord-giveaways is stale since 2022; Bastion
// behavioural shape only — no GPL lines):
// - /giveaway start (title, description, winners, hours 1..720, ManageGuild
//   guard) persists {messageId, guild, channel, winners, ends} AFTER sending
//   the entry message. Entry by reacting with the party emoji.
// - 60s setInterval poll finds ends<=now, fetches reactors excluding bots +
//   prior winners, partial Fisher-Yates draw, edits the message with winners,
//   marks ended. Missing channel/message = mark ended, never retry forever.
// - Reaction users are PAGED (limit 100 + `after` cursor, capped at
//   MAX_REACTION_PAGES): discord.js' ReactionUserManager.fetch defaults to
//   limit=100 with no pagination, so a bare fetch silently truncated big
//   giveaways to the first 100 reactions.
// - /giveaway end (running only) and /giveaway reroll (ended only, excludes
//   prior winners), both ManageGuild, both guild-scoped lookup.
// - No valid participants = explicit red-colour message.

import {
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildTextBasedChannel,
  Message,
  Snowflake,
  TextChannel,
} from 'discord.js';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BotCommand } from '../core/registry.js';
import { log } from '../log.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Persisted giveaway rows. Missing file = empty map (trial bot starts clean). */
export const GIVEAWAYS_PATH = resolve(HERE, '../../data/giveaways.json');

export const ENTRY_EMOJI = '🎉';
export const POLL_MS = 60 * 1000;
export const GIVEAWAY_MIN_HOURS = 1;
export const GIVEAWAY_MAX_HOURS = 720;
export const GIVEAWAY_MAX_WINNERS = 20;

/** Reaction-user page size. Discord caps this endpoint at 100 per request. */
export const REACTION_PAGE_SIZE = 100;

/**
 * Hard page cap for reaction-user pagination: 100 pages x 100 users = 10 000
 * entrants, far above any realistic giveaway. It bounds the poll against an API
 * that ignores `after` and keeps handing back full pages forever.
 */
export const MAX_REACTION_PAGES = 100;

export interface GiveawayRow {
  messageId: string;
  guildId: string;
  channelId: string;
  title: string;
  winners: number;
  ends: number;
  ended: boolean;
  winnerIds: string[];
}

export type GiveawayStore = Record<string, GiveawayRow>;

export function loadGiveaways(path: string = GIVEAWAYS_PATH): GiveawayStore {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return {};
    const store: GiveawayStore = {};
    for (const [id, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof row !== 'object' || row === null) continue;
      const rec = row as Record<string, unknown>;
      if (
        typeof rec.messageId !== 'string' ||
        typeof rec.guildId !== 'string' ||
        typeof rec.channelId !== 'string' ||
        typeof rec.title !== 'string' ||
        typeof rec.winners !== 'number' ||
        typeof rec.ends !== 'number'
      ) {
        continue;
      }
      store[id] = {
        messageId: rec.messageId,
        guildId: rec.guildId,
        channelId: rec.channelId,
        title: rec.title,
        winners: rec.winners,
        ends: rec.ends,
        ended: rec.ended === true,
        winnerIds: Array.isArray(rec.winnerIds)
          ? rec.winnerIds.filter((v): v is string => typeof v === 'string')
          : [],
      };
    }
    return store;
  } catch {
    return {};
  }
}

/** Atomic write: tmp file + rename, so a crash never leaves half a JSON file. */
export function saveGiveaways(store: GiveawayStore, path: string = GIVEAWAYS_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  renameSync(tmp, path);
}

/**
 * Partial Fisher-Yates draw: winners are unique, each entrant equally likely.
 * `exclude` holds already-picked ids (e.g. prior winners on reroll).
 * `random` is injectable for tests; production passes Math.random.
 */
export function drawWinners(
  entrants: readonly string[],
  winnerCount: number,
  exclude: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): string[] {
  const pool = entrants.filter((id) => !exclude.has(id));
  const take = Math.min(Math.max(winnerCount, 0), pool.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(random() * (pool.length - i));
    const a = pool[i];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[i] = b;
      pool[j] = a;
    }
  }
  return pool.slice(0, take);
}

export interface ExpireResult {
  status: 'ended' | 'no-participants';
  winnerIds: string[];
}

export function buildGiveawayEmbed(row: {
  title: string;
  description: string;
  winners: number;
  ends: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`🎉 ${row.title}`)
    .setDescription(`${row.description}\n\nReact with ${ENTRY_EMOJI} to enter!`)
    .addFields(
      { name: 'Winners', value: String(row.winners), inline: true },
      { name: 'Ends', value: `<t:${Math.floor(row.ends / 1000)}:R>`, inline: true },
    )
    .setColor(0x5865f2);
}

export function buildEndedEmbed(title: string, result: ExpireResult): EmbedBuilder {
  if (result.status === 'no-participants') {
    return new EmbedBuilder()
      .setTitle(`🎉 ${title}`)
      .setDescription('Giveaway cancelled — no valid participations! (bots excluded)')
      .setColor(0xed4245);
  }
  const mentions = result.winnerIds.map((id) => `<@${id}>`).join(', ');
  return new EmbedBuilder()
    .setTitle(`🎉 ${title} — ENDED`)
    .setDescription(`Winner(s): ${mentions}`)
    .setColor(0x57f287);
}

interface ReactantView {
  id: string;
  bot: boolean;
}

/** The slice of ReactionUserManager this module depends on (paged by id). */
interface ReactionUsersView {
  fetch(options?: { limit?: number; after?: string }): Promise<Map<string, unknown>>;
}

/**
 * Strip an entry to the two fields the caller needs, or null when malformed.
 * Identity is read from the value (as before) and the entry key is only a
 * fallback — so `after` always tracks the documented id order.
 */
function toReactant(key: unknown, value: unknown): ReactantView | null {
  const view = value as Partial<ReactantView> | null | undefined;
  const id = typeof view?.id === 'string' ? view.id : typeof key === 'string' ? key : undefined;
  if (id === undefined || id.length === 0) return null;
  return { id, bot: view?.bot === true };
}

/**
 * Collect every user who reacted, paging with `after` until a short page ends
 * the walk. discord.js' ReactionUserManager.fetch defaults to limit=100 with NO
 * pagination, so a single bare fetch silently truncates big giveaways to the
 * first 100 reactions. The cursor is the highest id seen — ids sort
 * lexicographically and `after` is exclusive, so a colliding id still advances.
 */
async function collectReactants(users: ReactionUsersView): Promise<ReactantView[]> {
  const out: ReactantView[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_REACTION_PAGES; page += 1) {
    const batch = await users.fetch({ limit: REACTION_PAGE_SIZE, after });
    let next: string | undefined;
    for (const [key, value] of batch.entries()) {
      const reactant = toReactant(key, value);
      if (reactant === null) continue;
      out.push(reactant);
      if (next === undefined || reactant.id > next) next = reactant.id;
    }
    // A short (or empty) page means the reaction list is exhausted.
    if (batch.size < REACTION_PAGE_SIZE) break;
    // A full page with no usable id cannot advance: stop rather than re-fetch
    // the same page until the cap.
    if (next === undefined) break;
    after = next;
  }
  return out;
}

/** Ids of every non-bot entrant, or null when the reaction could not be read. */
export async function fetchEntrantIds(message: Message): Promise<string[] | null> {
  try {
    const reaction = message.reactions.cache.get(ENTRY_EMOJI);
    if (reaction === undefined) return [];
    const reactants = await collectReactants(reaction.users as unknown as ReactionUsersView);
    const seen = new Set<string>();
    for (const reactant of reactants) {
      if (!reactant.bot) seen.add(reactant.id);
    }
    return [...seen];
  } catch {
    return null;
  }
}

/** Resolve a channel to a sendable text channel, or null when gone/incompatible. */
function toTextChannel(channel: unknown): GuildTextBasedChannel | null {
  if (channel === null || typeof channel !== 'object') return null;
  const c = channel as { isTextBased?: () => boolean; isDMBased?: () => boolean };
  if (typeof c.isTextBased !== 'function' || !c.isTextBased()) return null;
  if (typeof c.isDMBased === 'function' && c.isDMBased()) return null;
  return channel as GuildTextBasedChannel;
}

async function expireOne(client: Client, row: GiveawayRow): Promise<ExpireResult | null> {
  let guild: Guild;
  try {
    guild = await client.guilds.fetch(row.guildId);
  } catch {
    row.ended = true;
    return null;
  }
  const channel = toTextChannel(await guild.channels.fetch(row.channelId).catch(() => null));
  if (channel === null) {
    row.ended = true;
    return null;
  }
  let message: Message;
  try {
    message = await channel.messages.fetch(row.messageId);
  } catch {
    row.ended = true;
    return null;
  }
  const entrants = await fetchEntrantIds(message);
  if (entrants === null) {
    row.ended = true;
    return null;
  }
  const winnerIds = drawWinners(entrants, row.winners, new Set(row.winnerIds));
  const result: ExpireResult =
    winnerIds.length === 0
      ? { status: 'no-participants', winnerIds: [] }
      : { status: 'ended', winnerIds };
  row.ended = true;
  row.winnerIds = winnerIds;
  try {
    await message.edit({
      content: null,
      embeds: [buildEndedEmbed(row.title, result)],
    });
  } catch (err) {
    log('error', 'bot-giveaway-edit-error', {
      guild: row.guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  log('info', 'bot-giveaway-ended', {
    guild: row.guildId,
    winners: winnerIds.length,
  });
  return result;
}

/** Poll tick: expire every due, un-ended row. Separated for unit testing. */
export function findDue(store: GiveawayStore, nowMs: number = Date.now()): GiveawayRow[] {
  return Object.values(store).filter((row) => !row.ended && row.ends <= nowMs);
}

export async function pollGiveaways(client: Client, nowMs: number = Date.now()): Promise<void> {
  const store = loadGiveaways();
  const due = findDue(store, nowMs);
  if (due.length === 0) return;
  let changed = false;
  for (const row of due) {
    const outcome = await expireOne(client, row);
    if (outcome !== null || row.ended) changed = true;
  }
  if (changed) saveGiveaways(store);
}

let pollTimer: NodeJS.Timeout | null = null;

/** Start the 60s poll loop. Idempotent: a second call is a no-op. */
export function startGiveawayPoll(client: Client): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    void pollGiveaways(client).catch((err: unknown) => {
      log('error', 'bot-giveaway-poll-error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, POLL_MS);
  pollTimer.unref();
}

/** Test hook: stop the poll loop. */
export function stopGiveawayPoll(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function requireManageGuild(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guild === null) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  const member = interaction.member;
  const has =
    member !== null &&
    typeof member === 'object' &&
    'permissions' in member &&
    typeof (member as { permissions?: { has?: unknown } }).permissions?.has === 'function'
      ? (member as unknown as { permissions: { has: (f: bigint) => boolean } }).permissions.has(
          PermissionFlagsBits.ManageGuild,
        )
      : false;
  if (!has) {
    await interaction.reply({
      content: 'You need the Manage Server permission to manage giveaways.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

function findRow(store: GiveawayStore, guildId: string, messageId: string): GiveawayRow | null {
  const row = store[messageId];
  if (row === undefined || row.guildId !== guildId) return null;
  return row;
}

async function executeStart(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireManageGuild(interaction))) return;
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description', true);
  const winners = interaction.options.getInteger('winners', true);
  const hours = interaction.options.getInteger('hours', true);
  if (winners < 1 || winners > GIVEAWAY_MAX_WINNERS) {
    await interaction.reply({
      content: `Winners must be between 1 and ${GIVEAWAY_MAX_WINNERS}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (hours < GIVEAWAY_MIN_HOURS || hours > GIVEAWAY_MAX_HOURS) {
    await interaction.reply({
      content: `Duration must be between ${GIVEAWAY_MIN_HOURS} and ${GIVEAWAY_MAX_HOURS} hours.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const ends = Date.now() + hours * 60 * 60 * 1000;
  const channel = interaction.channel;
  if (channel === null || toTextChannel(channel) === null) {
    await interaction.reply({
      content: 'Giveaways can only be started in a server text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const text = channel as TextChannel;
  const message = await text.send({
    embeds: [buildGiveawayEmbed({ title, description, winners, ends })],
  });
  try {
    await message.react(ENTRY_EMOJI);
  } catch (err) {
    log('error', 'bot-giveaway-react-error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const guildId = interaction.guildId ?? '';
  const store = loadGiveaways();
  store[message.id] = {
    messageId: message.id,
    guildId,
    channelId: text.id,
    title,
    winners,
    ends,
    ended: false,
    winnerIds: [],
  };
  saveGiveaways(store);
  log('info', 'bot-giveaway-started', { guild: guildId });
  await interaction.reply({
    content: `Giveaway started: **${title}** (ends <t:${Math.floor(ends / 1000)}:R>).`,
  });
}

async function executeEnd(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireManageGuild(interaction))) return;
  const guildId = interaction.guildId ?? '';
  const messageId = interaction.options.getString('message-id', true) as Snowflake;
  const store = loadGiveaways();
  const row = findRow(store, guildId, messageId);
  if (row === null) {
    await interaction.reply({
      content: 'No giveaway found with that message ID in this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (row.ended) {
    await interaction.reply({
      content: 'That giveaway has already ended. Use reroll to pick new winners.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = toTextChannel(
    await interaction.guild?.channels.fetch(row.channelId).catch(() => null),
  );
  if (channel === null) {
    row.ended = true;
    saveGiveaways(store);
    await interaction.reply({
      content: 'Giveaway channel is gone — the giveaway was marked ended.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  let message: Message | null = null;
  try {
    message = await channel.messages.fetch(row.messageId);
  } catch {
    message = null;
  }
  if (message === null) {
    row.ended = true;
    saveGiveaways(store);
    await interaction.reply({
      content: 'Giveaway message is gone — the giveaway was marked ended.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const entrants = (await fetchEntrantIds(message)) ?? [];
  const winnerIds = drawWinners(entrants, row.winners, new Set(row.winnerIds));
  const result: ExpireResult =
    winnerIds.length === 0
      ? { status: 'no-participants', winnerIds: [] }
      : { status: 'ended', winnerIds };
  row.ended = true;
  row.winnerIds = winnerIds;
  saveGiveaways(store);
  await message.edit({ content: null, embeds: [buildEndedEmbed(row.title, result)] });
  await interaction.reply({ content: 'Giveaway ended early.' });
}

async function executeReroll(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireManageGuild(interaction))) return;
  const guildId = interaction.guildId ?? '';
  const messageId = interaction.options.getString('message-id', true) as Snowflake;
  const store = loadGiveaways();
  const row = findRow(store, guildId, messageId);
  if (row === null) {
    await interaction.reply({
      content: 'No giveaway found with that message ID in this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!row.ended) {
    await interaction.reply({
      content: 'The giveaway has not ended yet — reroll is only for ended giveaways.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = toTextChannel(
    await interaction.guild?.channels.fetch(row.channelId).catch(() => null),
  );
  if (channel === null) {
    await interaction.reply({
      content: 'Giveaway channel is gone — cannot reroll.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  let message: Message | null = null;
  try {
    message = await channel.messages.fetch(row.messageId);
  } catch {
    message = null;
  }
  if (message === null) {
    await interaction.reply({
      content: 'Giveaway message is gone — cannot reroll.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const entrants = (await fetchEntrantIds(message)) ?? [];
  const fresh = drawWinners(entrants, row.winners, new Set(row.winnerIds));
  const result: ExpireResult =
    fresh.length === 0
      ? { status: 'no-participants', winnerIds: [] }
      : { status: 'ended', winnerIds: fresh };
  if (fresh.length > 0) {
    row.winnerIds = [...row.winnerIds, ...fresh];
    saveGiveaways(store);
  }
  await message.edit({ content: null, embeds: [buildEndedEmbed(row.title, result)] });
  await interaction.reply({ content: 'Giveaway rerolled.' });
}

export const giveawayCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run giveaways in this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Start a giveaway.')
        .addStringOption((o) =>
          o.setName('title').setDescription('Giveaway title.').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('description').setDescription('What is up for grabs.').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('winners')
            .setDescription('Number of winners (1-20).')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(GIVEAWAY_MAX_WINNERS),
        )
        .addIntegerOption((o) =>
          o
            .setName('hours')
            .setDescription('Duration in hours (1-720).')
            .setRequired(true)
            .setMinValue(GIVEAWAY_MIN_HOURS)
            .setMaxValue(GIVEAWAY_MAX_HOURS),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('end')
        .setDescription('End a running giveaway early.')
        .addStringOption((o) =>
          o.setName('message-id').setDescription('Giveaway message ID.').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('reroll')
        .setDescription('Pick new winners for an ended giveaway.')
        .addStringOption((o) =>
          o.setName('message-id').setDescription('Giveaway message ID.').setRequired(true),
        ),
    ) as SlashCommandBuilder,
  guards: [
    async (interaction): Promise<string | null> => {
      if (interaction.guildId === null) return 'Giveaways can only be used in a server.';
      return null;
    },
  ],
  execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') {
      await executeStart(interaction);
    } else if (sub === 'end') {
      await executeEnd(interaction);
    } else if (sub === 'reroll') {
      await executeReroll(interaction);
    } else {
      await interaction.reply({
        content: 'Unknown giveaway action.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

/** Bind the client once at boot: start the 60s poll loop. Exported for index.ts. */
export function onClientReady(client: Client): void {
  client.on(Events.ClientReady, () => {
    startGiveawayPoll(client);
    log('info', 'bot-giveaway-poll-started', {});
  });
}
