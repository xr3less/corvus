// Gateway games handler: giveaways (site-engine bridge A6).
//
// FeatureModule kind giveaway: /giveaway start/end/reroll (ManageGuild guard,
// denied = ephemeral) plus a single shared 60s expiry poll. Entry by reacting
// with the party emoji; draw is a partial Fisher-Yates excluding bots and
// prior winners. State flows through the GiveawayStore port (in-memory
// default); the Postgres table is declared as DDL text in the task report.
// No ready listener anywhere in this module — start() is called by the loader.

import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  InteractionReplyOptions,
  Message,
} from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { BotCommand, FeatureModule } from '../registry.js';

export const ENTRY_EMOJI_DEFAULT = '🎉';
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

/** Storage port. Postgres backs this in production; memory is the default. */
export interface GiveawayStore {
  get(messageId: string): GiveawayRow | undefined;
  set(row: GiveawayRow): void;
  list(): GiveawayRow[];
}

export class InMemoryGiveawayStore implements GiveawayStore {
  private readonly rows = new Map<string, GiveawayRow>();

  get(messageId: string): GiveawayRow | undefined {
    return this.rows.get(messageId);
  }

  set(row: GiveawayRow): void {
    this.rows.set(row.messageId, { ...row, winnerIds: [...row.winnerIds] });
  }

  list(): GiveawayRow[] {
    return [...this.rows.values()];
  }
}

export interface GiveawayParams {
  giveawayEmoji: string;
  logChannelId: string | null;
}

export function parseGiveawayParams(params: unknown): GiveawayParams {
  const fallback: GiveawayParams = { giveawayEmoji: ENTRY_EMOJI_DEFAULT, logChannelId: null };
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return fallback;
  const record = params as Record<string, unknown>;
  const emoji = record['giveawayEmoji'];
  const logChannelId = record['logChannelId'];
  return {
    giveawayEmoji: typeof emoji === 'string' && emoji.length > 0 ? emoji : fallback.giveawayEmoji,
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

export interface GiveawayLogger {
  info(record: { event: string; guildId?: string }): void;
  error(record: { event: string; guildId?: string; reason?: string }): void;
}

export interface GiveawayModuleOptions {
  store?: GiveawayStore;
  logger?: GiveawayLogger;
  now?: () => number;
}

/**
 * Partial Fisher-Yates draw: winners are unique, each entrant equally likely.
 * `exclude` holds already-picked ids (prior winners on reroll).
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
    .setDescription(row.description)
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

/** Pure due filter: running rows whose end time has passed. Separated for tests. */
export function findDue(rows: readonly GiveawayRow[], nowMs: number = Date.now()): GiveawayRow[] {
  return rows.filter((row) => !row.ended && row.ends <= nowMs);
}

function toReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
export async function fetchEntrantIds(message: Message, emoji: string): Promise<string[] | null> {
  try {
    const reaction = message.reactions.cache.get(emoji);
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

/** Resolve a channel to a sendable/fetchable text channel, or null when gone. */
function toTextChannel(channel: unknown): {
  messages: { fetch(id: string): Promise<Message> };
} | null {
  if (channel === null || typeof channel !== 'object') return null;
  const candidate = channel as {
    isTextBased?: unknown;
    isDMBased?: unknown;
    messages?: unknown;
  };
  if (typeof candidate.isTextBased !== 'function') return null;
  let textBased = false;
  try {
    textBased = (candidate.isTextBased as () => boolean)() === true;
  } catch {
    return null;
  }
  if (!textBased) return null;
  if (typeof candidate.isDMBased === 'function') {
    try {
      if ((candidate.isDMBased as () => boolean)() === true) return null;
    } catch {
      return null;
    }
  }
  if (typeof candidate.messages !== 'object' || candidate.messages === null) return null;
  const messages = candidate.messages as { fetch?: unknown };
  if (typeof messages.fetch !== 'function') return null;
  return channel as { messages: { fetch(id: string): Promise<Message> } };
}

export interface ExpireOneOptions {
  emoji?: string;
  logger?: GiveawayLogger;
}

async function expireOne(
  client: Client,
  store: GiveawayStore,
  row: GiveawayRow,
  opts: ExpireOneOptions = {},
): Promise<ExpireResult | null> {
  const emoji = opts.emoji ?? ENTRY_EMOJI_DEFAULT;
  const logger = opts.logger;
  let guild: unknown;
  try {
    guild = await client.guilds.fetch(row.guildId);
  } catch {
    row.ended = true;
    store.set(row);
    return null;
  }
  const guildRecord = guild as { channels?: { fetch?: unknown } };
  let channel: unknown = null;
  try {
    const fetch = guildRecord.channels?.fetch;
    if (typeof fetch !== 'function') throw new Error('no channel fetch');
    channel = await (fetch as (id: string) => Promise<unknown>).call(
      guildRecord.channels,
      row.channelId,
    );
  } catch {
    channel = null;
  }
  const text = toTextChannel(channel);
  if (text === null) {
    row.ended = true;
    store.set(row);
    return null;
  }
  let message: Message;
  try {
    message = await text.messages.fetch(row.messageId);
  } catch {
    row.ended = true;
    store.set(row);
    return null;
  }
  const entrants = await fetchEntrantIds(message, emoji);
  if (entrants === null) {
    row.ended = true;
    store.set(row);
    return null;
  }
  const winnerIds = drawWinners(entrants, row.winners, new Set(row.winnerIds));
  const result: ExpireResult =
    winnerIds.length === 0
      ? { status: 'no-participants', winnerIds: [] }
      : { status: 'ended', winnerIds };
  row.ended = true;
  row.winnerIds = winnerIds;
  store.set(row);
  try {
    await message.edit({ content: null, embeds: [buildEndedEmbed(row.title, result)] });
  } catch (err) {
    try {
      logger?.error({
        event: 'giveaway-edit-error',
        guildId: row.guildId,
        reason: toReason(err),
      });
    } catch {
      // Logger failure never breaks the poll.
    }
  }
  try {
    logger?.info({ event: 'giveaway-ended', guildId: row.guildId });
  } catch {
    // Logger failure never breaks the poll.
  }
  return result;
}

export interface PollGiveawaysOptions {
  emoji?: string;
  logger?: GiveawayLogger;
  now?: () => number;
}

/** Poll tick: expire every due, un-ended row. Separated for unit testing. */
export async function pollGiveaways(
  client: Client,
  store: GiveawayStore,
  opts: PollGiveawaysOptions = {},
): Promise<void> {
  let nowMs = Date.now();
  try {
    nowMs = (opts.now ?? Date.now)();
  } catch {
    nowMs = Date.now();
  }
  const due = findDue(store.list(), nowMs);
  for (const row of due) {
    await expireOne(client, store, row, { emoji: opts.emoji, logger: opts.logger });
  }
}

/** Start the single shared 60s poll loop. A second call is a no-op. */
export function startGiveawayPoll(
  client: Client,
  store: GiveawayStore,
  opts: PollGiveawaysOptions & { intervalMs?: number } = {},
): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? POLL_MS;
  const timer = setInterval(() => {
    void pollGiveaways(client, store, opts).catch((err: unknown) => {
      try {
        opts.logger?.error({ event: 'giveaway-poll-error', reason: toReason(err) });
      } catch {
        // Logger failure never breaks the poll.
      }
    });
  }, intervalMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as unknown as { unref(): void }).unref();
  }
  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}

async function requireManageGuild(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guild === null) {
    await respondCompat(interaction, {
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  let has = false;
  try {
    has = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
  } catch {
    has = false;
  }
  if (!has) {
    await respondCompat(interaction, {
      content: 'You need the Manage Server permission to manage giveaways.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

function findRow(store: GiveawayStore, guildId: string, messageId: string): GiveawayRow | null {
  let row: GiveawayRow | undefined;
  try {
    row = store.get(messageId);
  } catch {
    return null;
  }
  if (row === undefined || row.guildId !== guildId) return null;
  return row;
}

export function buildGiveawayModule(opts: GiveawayModuleOptions = {}): FeatureModule {
  const store = opts.store ?? new InMemoryGiveawayStore();
  const logger = opts.logger;
  const now = opts.now ?? Date.now;
  let params: GiveawayParams = parseGiveawayParams(null);
  let emoji = ENTRY_EMOJI_DEFAULT;

  function clock(): number {
    try {
      return now();
    } catch {
      return Date.now();
    }
  }

  async function executeStart(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireManageGuild(interaction))) return;
    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description', true);
    const winners = interaction.options.getInteger('winners', true);
    const hours = interaction.options.getInteger('hours', true);
    if (winners < 1 || winners > GIVEAWAY_MAX_WINNERS) {
      await respondCompat(interaction, {
        content: `Winners must be between 1 and ${GIVEAWAY_MAX_WINNERS}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (hours < GIVEAWAY_MIN_HOURS || hours > GIVEAWAY_MAX_HOURS) {
      await respondCompat(interaction, {
        content: `Duration must be between ${GIVEAWAY_MIN_HOURS} and ${GIVEAWAY_MAX_HOURS} hours.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const ends = clock() + hours * 60 * 60 * 1000;
    const channel = interaction.channel;
    const text = toSendable(channel);
    if (text === null) {
      await respondCompat(interaction, {
        content: 'Giveaways can only be started in a server text channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const message = await text.send({
      embeds: [buildGiveawayEmbed({ title, description, winners, ends })],
    });
    try {
      await message.react(emoji);
    } catch (err) {
      try {
        logger?.error({ event: 'giveaway-react-error', reason: toReason(err) });
      } catch {
        // Logger failure never breaks the command.
      }
    }
    const guildId = interaction.guildId ?? '';
    store.set({
      messageId: message.id,
      guildId,
      channelId: text.id,
      title,
      winners,
      ends,
      ended: false,
      winnerIds: [],
    });
    try {
      logger?.info({ event: 'giveaway-started', guildId });
    } catch {
      // Logger failure never breaks the command.
    }
    await respondCompat(interaction, {
      content: `Giveaway started: **${title}** (ends <t:${Math.floor(ends / 1000)}:R>).`,
    });
  }

  async function executeEnd(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireManageGuild(interaction))) return;
    const guildId = interaction.guildId ?? '';
    const messageId = interaction.options.getString('message-id', true);
    const row = findRow(store, guildId, messageId);
    if (row === null) {
      await respondCompat(interaction, {
        content: 'No giveaway found with that message ID in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (row.ended) {
      await respondCompat(interaction, {
        content: 'That giveaway has already ended. Use reroll to pick new winners.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const result = await expireOne(interaction.client, store, row, { emoji, logger });
    if (result === null && row.ended) {
      await respondCompat(interaction, {
        content: 'Giveaway channel or message is gone — the giveaway was marked ended.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await respondCompat(interaction, { content: 'Giveaway ended early.' });
  }

  async function executeReroll(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireManageGuild(interaction))) return;
    const guildId = interaction.guildId ?? '';
    const messageId = interaction.options.getString('message-id', true);
    const row = findRow(store, guildId, messageId);
    if (row === null) {
      await respondCompat(interaction, {
        content: 'No giveaway found with that message ID in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!row.ended) {
      await respondCompat(interaction, {
        content: 'The giveaway has not ended yet — reroll is only for ended giveaways.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let guild: unknown;
    try {
      guild = await interaction.client.guilds.fetch(row.guildId);
    } catch {
      guild = null;
    }
    const guildRecord = guild as { channels?: { fetch?: unknown } } | null;
    let channel: unknown = null;
    try {
      const fetch = guildRecord?.channels?.fetch;
      if (typeof fetch !== 'function') throw new Error('no channel fetch');
      channel = await (fetch as (id: string) => Promise<unknown>).call(
        guildRecord?.channels,
        row.channelId,
      );
    } catch {
      channel = null;
    }
    const text = toTextChannel(channel);
    if (text === null) {
      await respondCompat(interaction, {
        content: 'Giveaway channel is gone — cannot reroll.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let message: Message | null = null;
    try {
      message = await text.messages.fetch(row.messageId);
    } catch {
      message = null;
    }
    if (message === null) {
      await respondCompat(interaction, {
        content: 'Giveaway message is gone — cannot reroll.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const entrants = (await fetchEntrantIds(message, emoji)) ?? [];
    const fresh = drawWinners(entrants, row.winners, new Set(row.winnerIds));
    const result: ExpireResult =
      fresh.length === 0
        ? { status: 'no-participants', winnerIds: [] }
        : { status: 'ended', winnerIds: fresh };
    if (fresh.length > 0) {
      row.winnerIds = [...row.winnerIds, ...fresh];
      store.set(row);
    }
    await message.edit({ content: null, embeds: [buildEndedEmbed(row.title, result)] });
    await respondCompat(interaction, { content: 'Giveaway rerolled.' });
  }

  async function onGiveaway(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') {
      await executeStart(interaction);
    } else if (sub === 'end') {
      await executeEnd(interaction);
    } else if (sub === 'reroll') {
      await executeReroll(interaction);
    } else {
      await respondCompat(interaction, {
        content: 'Unknown subcommand.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // addSubcommand() narrows the builder; the BotCommand contract wants
  // SlashCommandBuilder, so cast at the boundary.
  const giveawayCommand: BotCommand = {
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
    execute: onGiveaway,
  };

  return {
    kind: 'giveaway',
    commands: [giveawayCommand],
    events: [],
    start(client: Client, config: RuntimeConfigRow | null) {
      try {
        params = parseGiveawayParams(config?.params ?? null);
        emoji = params.giveawayEmoji;
      } catch {
        params = parseGiveawayParams(null);
        emoji = ENTRY_EMOJI_DEFAULT;
      }
      const poll = startGiveawayPoll(client, store, { emoji, logger, now });
      return {
        stop(): void {
          poll.stop();
        },
      };
    },
  };
}

interface SendableChannel {
  id: string;
  send(payload: {
    embeds: EmbedBuilder[];
  }): Promise<{ id: string; react(emoji: string): Promise<unknown> }>;
}

function toSendable(channel: unknown): SendableChannel | null {
  if (channel === null || typeof channel !== 'object') return null;
  const candidate = channel as {
    id?: unknown;
    send?: unknown;
    isTextBased?: unknown;
    isDMBased?: unknown;
  };
  if (typeof candidate.send !== 'function' || typeof candidate.id !== 'string') return null;
  if (typeof candidate.isTextBased === 'function') {
    try {
      if ((candidate.isTextBased as () => boolean)() !== true) return null;
    } catch {
      return null;
    }
  }
  if (typeof candidate.isDMBased === 'function') {
    try {
      if ((candidate.isDMBased as () => boolean)() === true) return null;
    } catch {
      return null;
    }
  }
  return channel as SendableChannel;
}
