// Site-engine bridge A7: connector FeatureModule (kind connector).
//
// /status command served from the in-memory TTL cache plus a floored poll
// loop. Single ready-handler owner rule: no client.on(ready) here — the
// composition root owns ready; start() only begins polling and returns stop().

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Client, InteractionReplyOptions } from 'discord.js';
import type { RuntimeConfigRow } from '../config.js';
import type { FeatureModule } from '../registry.js';
import { normalizeIntervalSec, readConnector, ttlMsForIntervalSec } from './reader.js';
import type { ConnectorParams, ConnectorReading, ReadConnectorDeps } from './reader.js';
import { buildStatusEmbed } from './status.js';
import type { ConnectorStatus } from './status.js';

export const CONNECTOR_STATUS_COMMAND = 'status';

export const CONNECTOR_WARN_AFTER = 3;

export const CONNECTOR_DOWN_AFTER = 10;

export interface ConnectorLogger {
  info(record: {
    event: string;
    connector?: string;
    failures?: number;
    class?: string;
    note?: string;
  }): void;
  error(record: { event: string; connector?: string; failures?: number; class?: string }): void;
}

export interface ConnectorModuleOptions extends ReadConnectorDeps {
  logger?: ConnectorLogger;
  now?: () => number;
}

export interface ConnectorPollState {
  consecutiveFailures: number;
  lastGood: { reading: ConnectorReading; cachedAtMs: number } | null;
}

export function createConnectorPollState(): ConnectorPollState {
  return { consecutiveFailures: 0, lastGood: null };
}

/** Fold one reading into cache plus warn/down counters. Never throws. */
export function applyReading(
  state: ConnectorPollState,
  reading: ConnectorReading,
  logger: ConnectorLogger | undefined,
  connectorName: string,
  nowMs: number,
): void {
  if (reading.ok) {
    const wasDegraded = state.consecutiveFailures >= CONNECTOR_WARN_AFTER;
    state.consecutiveFailures = 0;
    state.lastGood = { reading, cachedAtMs: nowMs };
    if (wasDegraded) {
      logger?.info({ event: 'bot-connector-recovered', connector: connectorName });
    }
    return;
  }
  state.consecutiveFailures += 1;
  const failureClass = reading.failure?.class ?? 'unknown';
  if (state.consecutiveFailures === CONNECTOR_WARN_AFTER) {
    logger?.info({
      event: 'bot-connector-warn',
      connector: connectorName,
      failures: state.consecutiveFailures,
      class: failureClass,
    });
  } else if (state.consecutiveFailures === CONNECTOR_DOWN_AFTER) {
    logger?.error({
      event: 'bot-connector-down',
      connector: connectorName,
      failures: state.consecutiveFailures,
      class: failureClass,
    });
  }
}

export function resolveConnectorStatus(
  consecutiveFailures: number,
  lastGoodAtMs: number | null,
  nowMs: number,
  ttlMs: number,
): ConnectorStatus {
  if (consecutiveFailures >= CONNECTOR_DOWN_AFTER) return 'down';
  if (lastGoodAtMs !== null && nowMs - lastGoodAtMs <= ttlMs) return 'ok';
  return 'stale';
}

/**
 * Parse bot_runtime_config params ({url, intervalSec, authEnvName, name}).
 * Returns null when the row cannot drive a poll (not an object, or no url).
 */
export function parseConnectorParams(params: unknown): ConnectorParams | null {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return null;
  }
  const record = params as Record<string, unknown>;
  const url = typeof record['url'] === 'string' ? record['url'] : '';
  if (url === '') {
    return null;
  }
  const name =
    typeof record['name'] === 'string' && record['name'].length > 0 ? record['name'] : 'connector';
  const intervalSec =
    typeof record['intervalSec'] === 'number' && Number.isFinite(record['intervalSec'])
      ? record['intervalSec']
      : 60;
  const authEnvName =
    typeof record['authEnvName'] === 'string' && record['authEnvName'].length > 0
      ? record['authEnvName']
      : undefined;
  return { url, intervalSec, authEnvName, name };
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

export function createConnectorModule(opts: ConnectorModuleOptions = {}): FeatureModule {
  const logger = opts.logger;
  const now = opts.now ?? Date.now;
  const state = createConnectorPollState();
  let runtime: { params: ConnectorParams; ttlMs: number } | null = null;

  async function pollOnce(): Promise<ConnectorReading> {
    let reading: ConnectorReading;
    try {
      if (runtime === null) {
        reading = {
          ok: false,
          at: new Date().toISOString(),
          failure: { class: 'network', message: 'Connector is not configured.' },
        };
      } else {
        reading = await readConnector(runtime.params, {
          fetchImpl: opts.fetchImpl,
          sleep: opts.sleep,
        });
      }
    } catch (err) {
      reading = {
        ok: false,
        at: new Date().toISOString(),
        failure: {
          class: 'network',
          message: err instanceof Error && err.message !== '' ? err.message : 'Unknown poll error.',
        },
      };
    }
    applyReading(state, reading, logger, runtime?.params.name ?? 'connector', now());
    return reading;
  }

  async function executeStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      if (runtime === null || state.lastGood === null) {
        await respondCompat(interaction, {
          content: `Connector "${runtime?.params.name ?? 'connector'}" has no readings yet — not yet polled. Please try again shortly.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const status = resolveConnectorStatus(
        state.consecutiveFailures,
        state.lastGood.cachedAtMs,
        now(),
        runtime.ttlMs,
      );
      await respondCompat(interaction, {
        embeds: [
          buildStatusEmbed({
            status,
            name: runtime.params.name,
            lastUpdatedAt: state.lastGood.reading.at,
            refreshedAt: new Date(now()).toISOString(),
          }),
        ],
      });
    } catch {
      const payload = {
        content: 'Could not load the connector status. Please try again.',
        flags: MessageFlags.Ephemeral,
      } as const;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }

  return {
    kind: 'connector',
    commands: [
      {
        data: new SlashCommandBuilder()
          .setName(CONNECTOR_STATUS_COMMAND)
          .setDescription('Show connector status.'),
        execute: executeStatus,
      },
    ],
    events: [],
    start: (client: Client, config: RuntimeConfigRow | null) => {
      void client;
      const parsed = parseConnectorParams(config?.params ?? null);
      if (parsed === null) {
        logger?.info({ event: 'bot-connector-no-config' });
        return undefined;
      }
      const normalized = normalizeIntervalSec(parsed.intervalSec);
      const ttlMs = ttlMsForIntervalSec(normalized.value);
      runtime = { params: { ...parsed, intervalSec: normalized.value }, ttlMs };
      if (normalized.normalized) {
        logger?.info({
          event: 'bot-connector-interval-floored',
          connector: parsed.name,
          note: normalized.note,
        });
      }
      logger?.info({ event: 'bot-connector-poll-started', connector: parsed.name });
      let inFlight = false;
      const tick = (): void => {
        if (inFlight) return;
        inFlight = true;
        // m-29: a rejection (or a throw from applyReading) must never escape
        // as an unhandled rejection — swallow and let the counters below fold
        // it in on the next tick. Sibling polls log their tick errors; the
        // connector's pollOnce already folds read failures into its reading,
        // so a bare catch is the matching idiom here.
        void pollOnce()
          .catch(() => undefined)
          .finally(() => {
            inFlight = false;
          });
      };
      tick();
      const timer = setInterval(tick, normalized.value * 1000);
      // m-30: guarded unref, mirroring startGiveawayPoll/startTempbanPoll —
      // vitest fake-timer handles may lack unref. A throwing guard never stops
      // the poll; stop() still halts it.
      try {
        const maybeUnref = timer as unknown as { unref?: () => void };
        if (typeof maybeUnref.unref === 'function') {
          maybeUnref.unref();
        }
      } catch {
        // Ignore — stop() still halts the loop.
      }
      return {
        stop: (): void => {
          clearInterval(timer);
        },
      };
    },
  };
}
