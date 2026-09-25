// Site-engine bridge A7: /status embed builder (pure, no I/O).

import { EmbedBuilder } from 'discord.js';

export type ConnectorStatus = 'ok' | 'stale' | 'down';

export const CONNECTOR_STATUS_COLORS: Record<ConnectorStatus, number> = {
  ok: 0x57f287,
  stale: 0xfee75c,
  down: 0xed4245,
};

/**
 * /status embed refresh cadence cap: live embeds are never rebuilt more often
 * than every 300s (callers throttle on this; the poll loop itself is floored
 * at 60s in reader.ts).
 */
export const EMBED_REFRESH_SECONDS = 300;

const STATUS_COPY: Record<ConnectorStatus, { label: string; detail: string }> = {
  ok: { label: 'Operational', detail: 'The connector is responding normally.' },
  stale: {
    label: 'Stale — retrying',
    detail: 'Showing the last good reading while a fresh one is retried.',
  },
  down: { label: 'Offline', detail: 'The connector is unreachable. Retrying automatically.' },
};

export interface StatusEmbedInput {
  status: ConnectorStatus;
  name: string;
  lastUpdatedAt: string | null;
  refreshedAt: string;
}

/**
 * Build the /status embed: title, status fields, green/yellow/red color,
 * refreshed-at footer.
 */
export function buildStatusEmbed(input: StatusEmbedInput): EmbedBuilder {
  const copy = STATUS_COPY[input.status];
  return new EmbedBuilder()
    .setTitle(`Connector status — ${input.name}`)
    .setDescription(`${copy.label} — ${copy.detail}`)
    .setColor(CONNECTOR_STATUS_COLORS[input.status])
    .addFields(
      { name: 'Status', value: copy.label, inline: true },
      { name: 'Last updated', value: input.lastUpdatedAt ?? 'Never', inline: true },
    )
    .setFooter({ text: `Refreshed at ${input.refreshedAt}` });
}
