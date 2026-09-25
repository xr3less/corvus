// Site-engine bridge A1: static spec-to-runtime translator (SPEC section 1).
//
// Published spec envelopes stay opaque DATA; this module maps known behavior
// kinds to per-bot runtime config rows for bot_runtime_config (the table is
// owned by sibling wave A2 — drizzle/0012 plus db/schema.ts, never touched
// here). One row per (bot, guild-or-global, kind): entries sharing a canonical
// kind merge into a single row whose params carry the item list.
//
// Static code only: no eval, no new Function, no vm, no dynamic import, no
// child_process anywhere (TRIGGER-SANDBOX-1). Unknown kinds degrade Yellow —
// skipped with a translator-skip log line, never a throw. Malformed envelopes
// are rejected by the REAL parseSpec from @corvus/spec (never an inline copy).
//
// Wave E1 maps the sold template kinds: ticket aliases (panel, routing,
// transcript, sla) fold to `tickets`; reaction-role aliases (picker, removal,
// groups, limits) fold to `reaction-roles`. Still-unknown kinds keep the
// skip-log, never a throw; token-bearing entries are still skipped outright.

import { parseSpec } from '@corvus/spec';
import {
  isRuntimeKind,
  RUNTIME_KINDS,
  validateRuntimeConfigRow,
  type RuntimeConfigRow,
  type RuntimeKind,
} from './config.js';

export const TRANSLATOR_SKIP_EVENT = 'translator-skip';

export interface TranslatorLogger {
  info(record: { level: 'info'; event: string; botId: string; reason?: string }): void;
}

const NO_OP_LOGGER: TranslatorLogger = {
  info: () => undefined,
};

// Non-canonical alias -> canonical kind. Canonical names themselves resolve
// via isRuntimeKind before this table is consulted.
export const KIND_ALIASES: Readonly<Record<string, RuntimeKind>> = {
  greeting: 'welcome',
  onboarding: 'welcome',
  farewell: 'welcome',
  'direct-message': 'welcome',
  direct_message: 'welcome',
  dm: 'welcome',
  filter: 'moderation',
  warn: 'moderation',
  warning: 'moderation',
  mute: 'moderation',
  'warn-mute': 'moderation',
  warn_mute: 'moderation',
  timeout: 'moderation',
  appeal: 'moderation',
  verification: 'moderation',
  'message-log': 'moderation',
  message_log: 'moderation',
  messagelog: 'moderation',
  'member-log': 'moderation',
  member_log: 'moderation',
  'channel-log': 'moderation',
  channel_log: 'moderation',
  digest: 'moderation',
  'rank-up': 'xp',
  rank_up: 'xp',
  rankup: 'xp',
  'level-up': 'xp',
  leaderboard: 'xp',
  rewards: 'xp',
  earn: 'xp',
  balance: 'xp',
  shop: 'xp',
  gamble: 'xp',
  entry: 'giveaway',
  reroll: 'giveaway',
  requirements: 'giveaway',
  'open-meteo': 'connector',
  weather: 'connector',
  panel: 'tickets',
  routing: 'tickets',
  transcript: 'tickets',
  sla: 'tickets',
  ticket: 'tickets',
  picker: 'reaction-roles',
  removal: 'reaction-roles',
  groups: 'reaction-roles',
  limits: 'reaction-roles',
  'reaction-role': 'reaction-roles',
  reaction_role: 'reaction-roles',
};

export interface TranslatorItem {
  sourceKind: string;
  title?: string;
  detail?: string;
  channel?: string;
  count?: number;
  intervalSec?: number;
}

// Keys that must never travel from a spec row into params. Spec rows never
// contain token material (SPEC section 0.3); an entry carrying any of these
// with a non-empty value is skipped outright and nothing of it is echoed.
const SECRET_KEYS: ReadonlySet<string> = new Set([
  'secret',
  'password',
  'authorization',
  'api_key',
  'apikey',
]);

function hasTokenMaterial(record: Record<string, unknown>): boolean {
  for (const key of Object.keys(record)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || SECRET_KEYS.has(lower)) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return true;
      }
      if (Buffer.isBuffer(value) && value.length > 0) {
        return true;
      }
    }
  }
  return false;
}

// Same shape as the gateway's sanitizeReason (gateway.ts): a token-like run
// echoed inside a spec string can never land in a log line verbatim. Local
// copy so this leaf stays independent of the gateway core.
const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_.-]{24,}/g;

function redact(value: string): string {
  const redacted = value.replace(TOKEN_LIKE_PATTERN, '[redacted]');
  return redacted.length > 120 ? `${redacted.slice(0, 120)}…` : redacted;
}

function resolveKind(record: Record<string, unknown>): RuntimeKind | null {
  const raw = record['kind'];
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  if (isRuntimeKind(normalized)) {
    return normalized;
  }
  return KIND_ALIASES[normalized] ?? null;
}

function firstString(
  record: Record<string, unknown>,
  keys: readonly string[],
  maxLen: number,
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
      }
    }
  }
  return undefined;
}

function firstFiniteNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function toItemPayload(record: Record<string, unknown>, sourceKind: string): TranslatorItem {
  const item: TranslatorItem = { sourceKind };
  const title = firstString(record, ['title', 'question', 'name'], 200);
  if (title !== undefined) {
    item.title = title;
  }
  const detail = firstString(record, ['detail', 'answer', 'description'], 2000);
  if (detail !== undefined) {
    item.detail = detail;
  }
  const channel = firstString(record, ['channel', 'channelName'], 100);
  if (channel !== undefined) {
    item.channel = channel;
  }
  const count = firstFiniteNumber(record, [
    'count',
    'times',
    'warnings',
    'amount',
    'xp',
    'xpPerMessage',
  ]);
  if (count !== undefined) {
    item.count = count;
  }
  // Connector poll floor is 60s (SPEC section 1): normalize here so a stale
  // spec value can never ask the poll loop for less; the handler enforces it
  // again at runtime.
  const interval = firstFiniteNumber(record, [
    'intervalSec',
    'interval',
    'pollSeconds',
    'poll_seconds',
  ]);
  if (interval !== undefined) {
    item.intervalSec = Math.max(60, Math.floor(interval));
  }
  return item;
}

// Validates {version:1, behaviors:[]} via the real parseSpec — a malformed
// envelope throws (ZodError) and is never returned partial. Unknown or
// token-carrying entries are skipped with a translator-skip log line (Yellow
// degrade, never a throw). Returns one row per canonical kind present.
export function translateProdSpec(
  spec: unknown,
  botId: string,
  logger: TranslatorLogger = NO_OP_LOGGER,
): RuntimeConfigRow[] {
  if (typeof botId !== 'string' || botId.length === 0) {
    throw new Error('translateProdSpec: botId must be a non-empty string');
  }
  const parsed = parseSpec(spec);
  const grouped = new Map<RuntimeKind, TranslatorItem[]>();
  parsed.behaviors.forEach((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      logger.info({
        level: 'info',
        event: TRANSLATOR_SKIP_EVENT,
        botId,
        reason: `non-object-entry index=${index}`,
      });
      return;
    }
    const record = entry as Record<string, unknown>;
    if (hasTokenMaterial(record)) {
      logger.info({
        level: 'info',
        event: TRANSLATOR_SKIP_EVENT,
        botId,
        reason: `token-material-present index=${index}`,
      });
      return;
    }
    const kind = resolveKind(record);
    if (kind === null) {
      const rawKind = record['kind'];
      const shown = typeof rawKind === 'string' ? `"${redact(rawKind)}" ` : '';
      logger.info({
        level: 'info',
        event: TRANSLATOR_SKIP_EVENT,
        botId,
        reason: `unknown-kind=${shown}index=${index}`,
      });
      return;
    }
    const item = toItemPayload(record, kind);
    const list = grouped.get(kind);
    if (list === undefined) {
      grouped.set(kind, [item]);
    } else {
      list.push(item);
    }
  });
  const rows: RuntimeConfigRow[] = [];
  for (const kind of RUNTIME_KINDS) {
    const items = grouped.get(kind);
    if (items === undefined) {
      continue;
    }
    const params: Record<string, unknown> = { items, count: items.length };
    if (kind === 'connector') {
      let floor: number | undefined;
      for (const item of items) {
        if (item.intervalSec !== undefined) {
          floor = floor === undefined ? item.intervalSec : Math.min(floor, item.intervalSec);
        }
      }
      if (floor !== undefined) {
        params['intervalSec'] = floor;
      }
    }
    const candidate = { botId, guildId: null, kind, params, specVersion: parsed.version };
    const validated = validateRuntimeConfigRow(candidate);
    if (!validated.ok) {
      logger.info({
        level: 'info',
        event: TRANSLATOR_SKIP_EVENT,
        botId,
        reason: `invalid-row kind="${kind}"`,
      });
      continue;
    }
    rows.push(validated.value);
  }
  return rows;
}
