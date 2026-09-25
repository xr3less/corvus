// Wave E1: tickets FeatureModule (kind tickets).
//
// Ticket-desk runtime: /ticket open|close|transcript via the dispatcher
// (InteractionCreate stays dispatcher-owned — this module never subscribes to
// ready or interactionCreate). Ticket routing uses Discord threads in a support
// channel when supported, falling back to plain-channel notice when the start
// surface is unavailable. Transcripts are fetched from the ticket channel and
// posted to the configured log channel. SLA timers ride the existing in-gateway
// poll idiom: one setInterval per start() (mirroring moderation tempban poll
// TEMPBAN_POLL_MS), guarded unref so vitest fake-timer handles survive.
//
// OSS basis: discord.js guide v14 threads
// (discordjs.guide/popular-topics/threads) — ThreadChannel archiving,
// private threads, member add via ThreadMemberManager; slash-command
// subcommands against installed discord.js 14.27.0 (disk-verified).
// In-repo module shape follows apps/gateway/src/runtime/moderation/index.ts
// (own-perms preflight, per-handler try/catch, registry duplicate-command
// guard handled centrally in buildRegistry).

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  Message,
  ThreadChannel,
} from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { BotCommand, FeatureModule } from '../registry.js';

export const TICKET_COMMAND_NAME = 'ticket';

/** SLA poll floor: same 60s idiom as the moderation tempban poll. */
export const TICKET_SLA_POLL_MS = 60 * 1000;

export interface TicketsLogger {
  info(record: { event: string; guildId?: string; userId?: string }): void;
  error(record: { event: string; guildId?: string; userId?: string; reason?: string }): void;
}

export interface TicketsModuleOptions {
  logger?: TicketsLogger;
  now?: () => number;
}

export interface TicketSlaEntry {
  guildId: string;
  channelId: string;
  openerId: string;
  /** Epoch-ms of last ticket activity. */
  lastActivityMs: number;
  /** Epoch-ms the ticket was opened. */
  openedAtMs: number;
}

export interface TicketStore {
  get(channelId: string): TicketSlaEntry | undefined;
  set(entry: TicketSlaEntry): void;
  remove(channelId: string): void;
  list(): TicketSlaEntry[];
}

export class InMemoryTicketStore implements TicketStore {
  private readonly rows = new Map<string, TicketSlaEntry>();

  get(channelId: string): TicketSlaEntry | undefined {
    return this.rows.get(channelId);
  }

  set(entry: TicketSlaEntry): void {
    this.rows.set(entry.channelId, { ...entry });
  }

  remove(channelId: string): void {
    this.rows.delete(channelId);
  }

  list(): TicketSlaEntry[] {
    return [...this.rows.values()];
  }
}

export interface TicketsParams {
  panelChannelId: string | null;
  logChannelId: string | null;
  helperRoleId: string | null;
  /** Idle ms before a reminder nudge (sla kind). Default 24h. */
  staleAfterMs: number;
  /** Idle ms before auto-close (sla kind). Default 7d. */
  closeAfterMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asPositiveMs(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

/** Defensive params parse: translator items can carry channel/detail keys. */
export function parseTicketsParams(params: unknown): TicketsParams {
  const fallback: TicketsParams = {
    panelChannelId: null,
    logChannelId: null,
    helperRoleId: null,
    staleAfterMs: DAY_MS,
    closeAfterMs: 7 * DAY_MS,
  };
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return fallback;
  }
  const record = params as Record<string, unknown>;
  return {
    panelChannelId:
      asNonEmptyString(record['panelChannelId']) ??
      asNonEmptyString(record['panelChannel']) ??
      null,
    logChannelId: asNonEmptyString(record['logChannelId']) ?? null,
    helperRoleId:
      asNonEmptyString(record['helperRoleId']) ?? asNonEmptyString(record['helperRole']) ?? null,
    staleAfterMs: asPositiveMs(record['staleAfterMs'], fallback.staleAfterMs),
    closeAfterMs: asPositiveMs(record['closeAfterMs'], fallback.closeAfterMs),
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

interface ThreadStartView {
  id: string;
  send(payload: unknown): Promise<unknown>;
}

/**
 * Resolve the support channel to open tickets under: configured panel channel
 * first, then the interaction's own channel when sendable.
 */
function resolveSupportChannel(
  client: Client,
  configuredId: string | null,
  fallback: unknown,
): { id: string; starter: unknown } | null {
  try {
    if (configuredId) {
      const direct = client.channels.cache.get(configuredId);
      if (direct !== undefined) {
        return { id: configuredId, starter: direct };
      }
    }
  } catch {
    // Fall through to the fallback channel.
  }
  const candidate = fallback as { id?: unknown } | null;
  if (
    fallback !== null &&
    typeof fallback === 'object' &&
    typeof candidate?.id === 'string' &&
    isSendable(fallback)
  ) {
    return { id: candidate.id, starter: fallback };
  }
  return null;
}

/**
 * Try the discord.js thread start surface on a text channel: prefer
 * threads.create (GuildTextThreadManager, ChannelType.PrivateThread), fall back
 * to startThread (message-create path). Returns null when neither exists —
 * the caller degrades to a plain-channel notice so /ticket open never throws.
 */
async function startTicketThread(starter: unknown, name: string): Promise<ThreadStartView | null> {
  const record = starter as {
    threads?: { create?: unknown };
    startThread?: unknown;
  };
  try {
    const create = record.threads?.create;
    if (typeof create === 'function') {
      const thread = (await (create as (opts: unknown) => Promise<unknown>).call(record.threads, {
        name,
        autoArchiveDuration: 1440,
      })) as ThreadStartView;
      if (thread && typeof thread.id === 'string') {
        return thread;
      }
    }
  } catch {
    // Fall through to startThread.
  }
  try {
    const startThread = record.startThread;
    if (typeof startThread === 'function') {
      const thread = (await (startThread as (opts: unknown) => Promise<unknown>).call(starter, {
        name,
        autoArchiveDuration: 1440,
      })) as ThreadStartView;
      if (thread && typeof thread.id === 'string') {
        return thread;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function addThreadMember(thread: ThreadStartView, userId: string): Promise<void> {
  try {
    const members = (thread as unknown as { members?: { add?: unknown } }).members;
    if (members !== null && typeof members === 'object') {
      const add = (members as { add?: unknown }).add;
      if (typeof add === 'function') {
        await (add as (id: string) => Promise<unknown>).call(members, userId);
      }
    }
  } catch {
    // Missing thread-members surface is non-fatal.
  }
}

function fetchDisplayMessages(
  channel: unknown,
  limit: number,
): Promise<Array<{ authorTag: string; content: string }>> {
  const record = channel as { messages?: { fetch?: unknown } } | null;
  const fetch = record?.messages?.fetch;
  if (typeof fetch !== 'function') {
    return Promise.resolve([]);
  }
  return (fetch as (opts: unknown) => Promise<unknown>)({ limit })
    .then((collection: unknown) => {
      const out: Array<{ authorTag: string; content: string }> = [];
      if (collection instanceof Map) {
        for (const value of collection.values()) {
          const msg = value as Partial<Message> & {
            author?: { tag?: unknown; username?: unknown };
            content?: unknown;
          };
          const tag =
            typeof msg.author?.tag === 'string'
              ? msg.author.tag
              : typeof msg.author?.username === 'string'
                ? msg.author.username
                : 'unknown';
          const content = typeof msg.content === 'string' ? msg.content.slice(0, 500) : '';
          out.push({ authorTag: tag, content });
        }
      }
      return out;
    })
    .catch(() => []);
}

/** Render at most 50 fetched lines as a plain-text transcript. */
export function renderTranscript(
  lines: ReadonlyArray<{ authorTag: string; content: string }>,
  ticketName: string,
): string {
  const capped = lines.slice(0, 50);
  const body = capped.map((line) => `[${line.authorTag}] ${line.content}`).join('\n');
  const text = `Transcript for ${ticketName} (${capped.length} messages):\n${body}`;
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
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

export function buildTicketsModule(opts: TicketsModuleOptions = {}): FeatureModule {
  const logger = opts.logger;
  const now = opts.now ?? Date.now;
  const store: TicketStore = new InMemoryTicketStore();
  let params: TicketsParams = parseTicketsParams(null);
  let clientRef: Client | null = null;

  function clock(): number {
    try {
      return now();
    } catch {
      return Date.now();
    }
  }

  function info(record: { event: string; guildId?: string; userId?: string }): void {
    try {
      logger?.info(record);
    } catch {
      // Logger failure never breaks tickets.
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
      // Logger failure never breaks tickets.
    }
  }

  async function postLog(text: string): Promise<void> {
    try {
      if (!clientRef || !params.logChannelId) return;
      const channel = clientRef.channels.cache.get(params.logChannelId);
      if (!isSendable(channel)) return;
      await channel.send(text);
    } catch (err) {
      failure({ event: 'tickets-log-failed', reason: toReason(err) });
    }
  }

  async function onTicketOpen(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'Tickets work in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasPerm(botMemberOf(guild), PermissionFlagsBits.ManageThreads)) {
      failure({
        event: 'tickets-missing-perms',
        guildId: guild.id,
        reason: 'ManageThreads',
      });
      await respondCompat(interaction, {
        content: 'I am missing the Manage Threads permission to open tickets.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const topic = interaction.options.getString('topic') ?? 'support';
    const openerId = interaction.user.id;
    const ticketName = `ticket-${openerId.slice(-6)}-${topic.slice(0, 20)}`;
    const support = resolveSupportChannel(
      clientRef ?? interaction.client,
      params.panelChannelId,
      interaction.channel,
    );
    if (support === null) {
      await respondCompat(interaction, {
        content: 'No ticket channel is configured yet — ask an admin to set one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let thread: ThreadStartView | null = null;
    try {
      thread = await startTicketThread(support.starter, ticketName);
    } catch (err) {
      failure({ event: 'tickets-open-failed', guildId: guild.id, reason: toReason(err) });
    }
    if (thread === null) {
      // No thread surface: route as a plain-channel ticket notice instead.
      try {
        if (isSendable(support.starter)) {
          await (support.starter as { send(p: unknown): Promise<unknown> }).send(
            `Ticket opened by <@${openerId}> — topic: ${topic}.` +
              (params.helperRoleId ? ` <@&${params.helperRoleId}>` : ''),
          );
        }
      } catch (err) {
        failure({ event: 'tickets-open-failed', guildId: guild.id, reason: toReason(err) });
        await respondCompat(interaction, {
          content: 'Could not open the ticket — please try again.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      store.set({
        guildId: guild.id,
        channelId: support.id,
        openerId,
        lastActivityMs: clock(),
        openedAtMs: clock(),
      });
      info({ event: 'tickets-opened', guildId: guild.id, userId: openerId });
      await respondCompat(interaction, {
        content: `Ticket opened in <#${support.id}> about "${topic}".`,
      });
      return;
    }
    try {
      await addThreadMember(thread, openerId);
      await thread.send(
        `Hello <@${openerId}> — describe your issue about "${topic}".` +
          (params.helperRoleId ? ` <@&${params.helperRoleId}> will help.` : ''),
      );
    } catch (err) {
      failure({ event: 'tickets-open-failed', guildId: guild.id, reason: toReason(err) });
    }
    store.set({
      guildId: guild.id,
      channelId: thread.id,
      openerId,
      lastActivityMs: clock(),
      openedAtMs: clock(),
    });
    info({ event: 'tickets-opened', guildId: guild.id, userId: openerId });
    await respondCompat(interaction, {
      content: `Ticket opened: <#${thread.id}> about "${topic}".`,
    });
  }

  async function archiveTicketChannel(channelId: string): Promise<void> {
    try {
      if (!clientRef) return;
      const channel = clientRef.channels.cache.get(channelId) as ThreadChannel | undefined;
      const setArchived = (channel as unknown as { setArchived?: unknown })?.setArchived;
      if (typeof setArchived === 'function') {
        await (setArchived as (archived: boolean) => Promise<unknown>).call(channel, true);
      }
    } catch (err) {
      failure({ event: 'tickets-close-failed', reason: toReason(err) });
    }
  }

  async function onTicketClose(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'Tickets work in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const channelId = interaction.channelId ?? '';
    const entry = store.get(channelId);
    await archiveTicketChannel(channelId);
    if (entry !== undefined) {
      store.remove(channelId);
    }
    info({ event: 'tickets-closed', guildId: guild.id, userId: interaction.user.id });
    await postLog(`ticket closed channel=${channelId} by=${interaction.user.id}`);
    await respondCompat(interaction, { content: 'Ticket closed — thanks for reaching out.' });
  }

  async function onTicketTranscript(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await respondCompat(interaction, {
        content: 'Tickets work in a server only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const channelId = interaction.channelId ?? '';
    let channel: unknown = null;
    try {
      channel =
        (clientRef ?? interaction.client).channels.cache.get(channelId) ?? interaction.channel;
    } catch {
      channel = interaction.channel;
    }
    const lines = await fetchDisplayMessages(channel, 50);
    const transcript = renderTranscript(lines, channelId);
    await postLog(transcript);
    info({ event: 'tickets-transcript', guildId: guild.id, userId: interaction.user.id });
    await respondCompat(interaction, {
      content:
        lines.length === 0
          ? 'Transcript saved to the log channel.'
          : 'Transcript saved to the log channel.',
    });
  }

  async function onTicket(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === 'open') {
        await onTicketOpen(interaction);
      } else if (sub === 'close') {
        await onTicketClose(interaction);
      } else if (sub === 'transcript') {
        await onTicketTranscript(interaction);
      } else {
        await respondCompat(interaction, {
          content: 'Unknown subcommand.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      failure({
        event: 'tickets-command-failed',
        guildId: interaction.guildId ?? undefined,
        reason: toReason(err),
      });
      try {
        const payload = {
          content: 'Ticket command failed — please try again.',
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
  const ticketCommand: BotCommand = {
    data: new SlashCommandBuilder()
      .setName(TICKET_COMMAND_NAME)
      .setDescription('Open and manage support tickets.')
      .addSubcommand((s) =>
        s
          .setName('open')
          .setDescription('Open a support ticket.')
          .addStringOption((o) =>
            o.setName('topic').setDescription('What the ticket is about.').setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName('close').setDescription('Close this ticket.'))
      .addSubcommand((s) =>
        s.setName('transcript').setDescription('Save this ticket transcript to the log channel.'),
      ) as SlashCommandBuilder,
    execute: onTicket,
  };

  return {
    kind: 'tickets',
    commands: [ticketCommand],
    events: [],
    start(client: Client, config: RuntimeConfigRow | null) {
      clientRef = client;
      try {
        params = parseTicketsParams(config?.params ?? null);
      } catch {
        params = parseTicketsParams(null);
      }
      // SLA poll: one setInterval (never setTimeout chains), same idiom as the
      // moderation tempban poll. Per-tick try/catch isolation; a throwing logger
      // never breaks the loop.
      const timer = setInterval(() => {
        void (async (): Promise<void> => {
          let at = 0;
          try {
            at = clock();
          } catch {
            at = Date.now();
          }
          let rows: TicketSlaEntry[] = [];
          try {
            rows = store.list();
          } catch (err) {
            failure({ event: 'tickets-sla-list-failed', reason: toReason(err) });
            return;
          }
          for (const row of rows) {
            try {
              const idle = at - row.lastActivityMs;
              if (idle >= params.closeAfterMs) {
                await archiveTicketChannel(row.channelId);
                store.remove(row.channelId);
                info({ event: 'tickets-sla-autoclosed', guildId: row.guildId });
                await postLog(`ticket auto-closed channel=${row.channelId} idle=${idle}ms`);
              } else if (idle >= params.staleAfterMs) {
                info({ event: 'tickets-sla-stale', guildId: row.guildId });
                await postLog(`ticket stale channel=${row.channelId} idle=${idle}ms`);
              }
            } catch (err) {
              failure({
                event: 'tickets-sla-row-failed',
                guildId: row.guildId,
                reason: toReason(err),
              });
            }
          }
        })().catch((err: unknown) => {
          failure({ event: 'tickets-sla-poll-error', reason: toReason(err) });
        });
      }, TICKET_SLA_POLL_MS);
      try {
        const maybeUnref = timer as unknown as { unref?: () => void };
        if (typeof maybeUnref.unref === 'function') {
          maybeUnref.unref();
        }
      } catch {
        // Ignore — stop() still halts the loop.
      }
      return {
        stop(): void {
          clearInterval(timer);
        },
      };
    },
  };
}
