// Connector module barrel (apps/testbot/src/connector/index.ts).
// Trial-only: one seeded keyless weather connector behind /status, polled on a
// single setInterval. The /status embed is built LIVE from the in-memory cache
// on each invocation — there is no background channel-embed edit in the trial
// (EMBED_REFRESH_SECONDS below only documents that future cadence).
// reader.ts owns fetching; this file owns scheduling, cache, state and /status.

import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOWN_AFTER,
  EMBED_REFRESH_SECONDS,
  POLL_SECONDS,
  TIMEOUT_MS,
  WARN_AFTER,
} from '../config.js';
import type { BotCommand, BotEvent } from '../core/registry.js';
import { log } from '../log.js';
import { readConnector } from './reader.js';
import type { ConnectorConfig, ConnectorReading } from './reader.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Seeded trial connector: keyless weather fetch at fixed trial coordinates. */
export const TRIAL_CONNECTOR: ConnectorConfig = {
  id: 'trial-weather',
  kind: 'json_rest',
  url: 'https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current=temperature_2m',
  intervalSec: POLL_SECONDS,
  timeoutMs: TIMEOUT_MS,
};

/** Poll loop runs at the seeded interval, never below the 60s poll floor. */
const EFFECTIVE_INTERVAL_SEC: number = Math.max(TRIAL_CONNECTOR.intervalSec, POLL_SECONDS);
const POLL_MS: number = EFFECTIVE_INTERVAL_SEC * 1000;
/** Cache TTL = the poll interval, floored at 10s (extapi checklist §3.4). */
const TTL_MS: number = Math.max(EFFECTIVE_INTERVAL_SEC, 10) * 1000;

/** Last-good-reading state file. Written at runtime only; data/ is gitignored. */
export const CONNECTOR_STATE_PATH: string = resolve(
  HERE,
  `../../data/connector-${TRIAL_CONNECTOR.id}.json`,
);

interface ConnectorCache {
  reading: ConnectorReading;
  cachedAtMs: number;
}

let lastGood: ConnectorCache | null = null;
let consecutiveFailures = 0;

/** Atomic state write: tmp file + rename. Disk failure never breaks polling. */
function persistReading(reading: ConnectorReading): void {
  try {
    mkdirSync(dirname(CONNECTOR_STATE_PATH), { recursive: true });
    const tmp = `${CONNECTOR_STATE_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ at: reading.at, data: reading.data ?? null }), 'utf8');
    renameSync(tmp, CONNECTOR_STATE_PATH);
  } catch {
    // A failed disk write must never break the poll loop: the in-memory
    // cache stays authoritative and the next tick retries the write.
  }
}

/** Fold one reading into cache + warn/down counters. Never throws. */
function processReading(reading: ConnectorReading): void {
  if (reading.ok) {
    const wasDegraded = consecutiveFailures >= WARN_AFTER;
    consecutiveFailures = 0;
    lastGood = { reading, cachedAtMs: Date.now() };
    persistReading(reading);
    if (wasDegraded) {
      log('info', 'bot-connector-recovered', { connector: TRIAL_CONNECTOR.id });
    }
    return;
  }
  consecutiveFailures += 1;
  const failureClass = reading.failure?.class ?? 'unknown';
  if (consecutiveFailures === WARN_AFTER) {
    log('info', 'bot-connector-warn', {
      connector: TRIAL_CONNECTOR.id,
      failures: consecutiveFailures,
      class: failureClass,
    });
  } else if (consecutiveFailures === DOWN_AFTER) {
    log('error', 'bot-connector-down', {
      connector: TRIAL_CONNECTOR.id,
      failures: consecutiveFailures,
      class: failureClass,
    });
  }
}

/** One poll tick. readConnector never rejects by contract; belt-and-braces anyway. */
async function pollOnce(): Promise<ConnectorReading> {
  let reading: ConnectorReading;
  try {
    reading = await readConnector(TRIAL_CONNECTOR);
  } catch (err: unknown) {
    reading = {
      ok: false,
      at: new Date().toISOString(),
      failure: {
        class: 'network',
        message: err instanceof Error ? err.message : 'Unknown poll error.',
      },
    };
  }
  processReading(reading);
  return reading;
}

export interface PollOptions {
  onUpdate?: (reading: ConnectorReading) => void;
}

export interface PollHandle {
  stop(): void;
}

/**
 * Start the single-setInterval poll loop for the seeded trial connector.
 * Fires one immediate read, then repeats every EFFECTIVE_INTERVAL_SEC.
 * A tick already in flight is skipped (no overlap pile-up). Returns a handle
 * whose stop() clears this loop's timer. Trial choice: no background
 * channel-embed edit here — /status builds its embed live from cache.
 */
export function startPolling(opts: PollOptions = {}): PollHandle {
  log('info', 'bot-connector-poll-started', {
    connector: TRIAL_CONNECTOR.id,
    intervalSec: EFFECTIVE_INTERVAL_SEC,
    embedRefreshSec: EMBED_REFRESH_SECONDS,
  });
  let inFlight = false;
  const tick = (): void => {
    if (inFlight) return;
    inFlight = true;
    void pollOnce()
      .then((reading) => {
        opts.onUpdate?.(reading);
      })
      .catch(() => {
        // pollOnce never rejects; this is a final safety net only.
      })
      .finally(() => {
        inFlight = false;
      });
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return {
    stop: (): void => {
      clearInterval(timer);
    },
  };
}

// --- /status command ---

type ConnectorStatus = 'ok' | 'stale' | 'down';

function resolveStatus(nowMs: number): ConnectorStatus {
  if (consecutiveFailures >= DOWN_AFTER) return 'down';
  if (lastGood !== null && nowMs - lastGood.cachedAtMs <= TTL_MS) return 'ok';
  return 'stale';
}

/** Extract the trial temperature value; never echo raw upstream JSON. */
function extractTemperature(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const current = (data as Record<string, unknown>).current;
  if (typeof current !== 'object' || current === null) return null;
  const temp = (current as Record<string, unknown>).temperature_2m;
  return typeof temp === 'number' && Number.isFinite(temp) ? temp : null;
}

const STATUS_COPY: Record<ConnectorStatus, { label: string; color: number; detail: string }> = {
  ok: {
    label: 'Operational',
    color: 0x57f287,
    detail: 'The trial service is responding.',
  },
  stale: {
    label: 'Stale — retrying',
    color: 0xfee75c,
    detail: 'Showing the last good reading while a fresh one is retried.',
  },
  down: {
    label: 'Offline',
    color: 0xed4245,
    detail: 'The trial service is unreachable. Retrying automatically.',
  },
};

function buildStatusEmbed(status: ConnectorStatus): EmbedBuilder {
  const copy = STATUS_COPY[status];
  const temperature = lastGood !== null ? extractTemperature(lastGood.reading.data) : null;
  return new EmbedBuilder()
    .setTitle('Trial service status')
    .setDescription(`${copy.label} — ${copy.detail}`)
    .setColor(copy.color)
    .addFields(
      {
        name: 'Temperature (London, trial)',
        value: temperature !== null ? `${temperature} °C` : 'Unavailable',
        inline: true,
      },
      {
        name: 'Last updated',
        value: lastGood !== null ? lastGood.reading.at : 'Never',
        inline: true,
      },
    );
}

export const statusCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('status').setDescription('Show trial service status.'),
  execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
    try {
      // One live read only when the cache is empty or expired; the shared
      // poll path updates cache + warn/down counters, so /status traffic
      // (bounded by the TTL) never skews polling state.
      if (lastGood === null || Date.now() - lastGood.cachedAtMs > TTL_MS) {
        await pollOnce();
      }
      const status = resolveStatus(Date.now());
      await interaction.reply({ embeds: [buildStatusEmbed(status)] });
    } catch {
      // Error reply branches on interaction state per the dispatcher contract.
      const payload = {
        content: 'Could not load the trial service status. Please try again.',
        flags: MessageFlags.Ephemeral,
      } as const;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  },
};

export const commands: BotCommand[] = [statusCommand];

export const events: BotEvent[] = [];
