// Structured JSON-line logger for the standalone trial bot (apps/testbot).
// Rule: NEVER log token or message content. Anything resembling a secret is
// redacted via sanitize() before it reaches stdout.

export type LogLevel = 'info' | 'error';

export type LogMeta = Record<string, string | number>;

/** Write one JSON line to stdout. Never throws for record-shaped input. */
export function log(level: LogLevel, event: string, meta?: LogMeta): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta });
  process.stdout.write(`${line}\n`);
}

/**
 * Redact anything that looks like a secret: runs of 24+ ASCII alphanumerics
 * (a Discord token is three such runs joined by dots) become [redacted].
 */
export function sanitize(value: string): string {
  return value.replace(/[A-Za-z0-9]{24,}/g, '[redacted]');
}

const DISALLOWED_INTENT_MARKERS = ['4014', 'disallowed intents', 'disallowed-intents'];

/**
 * Route a shard error to the log with a distinct event name so a 4014
 * (privileged intent not enabled in the Developer Portal) is never mistaken
 * for noise. discord.js surfaces gateway close codes on the shardError event,
 * never on 'error' — the future index.ts must bind the enum member
 * Events.ShardError to this helper. Never logs raw content unredacted.
 */
export function logShardError(error: unknown): void {
  const message = sanitize(error instanceof Error ? error.message : String(error));
  const isDisallowed = DISALLOWED_INTENT_MARKERS.some((m) => message.toLowerCase().includes(m));
  log('error', isDisallowed ? 'bot-disallowed-intents' : 'bot-shard-error', { error: message });
}
