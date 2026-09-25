// POST /api/spec/publish { botId, version? } — move bots.prod_spec_id to an
// existing immutable spec_versions row of the same bot.
//
// Implements the V1-3 locked contract (shared verbatim with V1-3a): the write
// is a single guarded `UPDATE ... WHERE prod_spec_id IS NOT DISTINCT FROM
// <expected>` so two simultaneous publishes serialize on the bot row — the
// loser observes 0 rows and is answered 409 { reason: 'stale-draft' }.
// spec_versions rows are never mutated: publish only repoints the prod
// pointer and appends an audit_events row. Rollback reads publish history
// from that same audit trail (see rollback/route.ts).
//
// Red block: every non-null guild_installs.preflight for the bot is inspected
// (any guild — worst guild wins). Any Red row refuses the move. No scan at
// all is allowed and recorded as the audit note 'unscanned'.

import type { PoolClient } from 'pg';
import { getPool, mapDbError, __setPool } from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { isUuid } from '../../../../lib/editor/drafts';
import { detectRedFailing, latestPreflightEnvelope } from '../../../../lib/spec/preflight';

export interface EditorSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<EditorSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/spec/patch/route.ts).
export { __setPool };

const closedReader: SessionReader = {
  getSession: async () => null,
};

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = closedReader;
}

// --- Publish-hook runtime-row sync -------------------------------------------
// Contract owner: apps/gateway/src/runtime/translator.ts (kind vocabulary,
// alias table, skip policy), apps/gateway/src/runtime/config.ts (row shape +
// validation), apps/gateway/src/runtime/boot-modules.ts (BOOT_CONFIG_SQL),
// apps/gateway/drizzle/0012_bot_runtime_config.sql (unique(bot_id, guild_id,
// kind)). The web package must not import gateway internals, so the minimal
// mapping below duplicates that contract inline. If translator.ts gains a
// kind or alias, this block must be updated to match.
//
// Row scope: bot-global rows only (guild_id NULL). translator.ts:284 emits
// guildId: null for every row; config.ts:24 defines NULL as "bot-global
// default; per-guild rows override it at read time"; 0012:6-7 says the same;
// BOOT_CONFIG_SQL (boot-modules.ts:21-23) selects WHERE bot_id = $1 with no
// guild filter, so one global row per kind is exactly what boot reads. No
// guild_installs fan-out: publishing fans a spec into one row per kind, not
// one row per guild.

// Closed kind vocabulary (mirrors RUNTIME_KINDS in config.ts:11-20).
export const RUNTIME_KINDS = [
  'welcome',
  'moderation',
  'xp',
  'giveaway',
  'connector',
  'status',
  'tickets',
  'reaction-roles',
] as const;

export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

function isRuntimeKind(value: unknown): value is RuntimeKind {
  return typeof value === 'string' && (RUNTIME_KINDS as readonly string[]).includes(value);
}

// Non-canonical alias -> canonical kind (mirrors KIND_ALIASES in
// translator.ts:40-90).
const KIND_ALIASES: Readonly<Record<string, RuntimeKind>> = {
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

export interface RuntimeRow {
  kind: RuntimeKind;
  params: Record<string, unknown>;
  specVersion: number;
}

export type PublishTranslator = (spec: unknown, botId: string, specVersion: number) => RuntimeRow[];

// Keys that must never travel from a spec entry into params (mirrors
// SECRET_KEYS in translator.ts:93-99). An entry carrying any of these with a
// non-empty value is skipped outright and nothing of it is echoed.
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
    }
  }
  return false;
}

function logSkip(botId: string, reason: string): void {
  console.info(JSON.stringify({ level: 'info', event: 'translator-skip', botId, reason }));
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
  // Connector poll floor is 60s (translator.ts:197-199): normalize here so a
  // stale spec value can never ask the poll loop for less.
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

// Inline copy of the translator contract (translateProdSpec in
// translator.ts:216-298): a malformed envelope THROWS so the publish rolls
// back; unknown or token-carrying entries are SKIPPED + logged, never thrown.
// Returns one row per canonical kind present. specVersion is the published
// spec_versions.version (the "which published spec_version produced the row"
// of config.ts:29-30), not the envelope's own format-version field.
export function defaultTranslateProdSpec(
  spec: unknown,
  botId: string,
  specVersion: number,
): RuntimeRow[] {
  if (typeof botId !== 'string' || botId.length === 0) {
    throw new Error('translateProdSpec: botId must be a non-empty string');
  }
  if (!Number.isInteger(specVersion) || specVersion < 1) {
    throw new Error('translateProdSpec: specVersion must be a positive integer');
  }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new Error('translateProdSpec: spec envelope must be an object');
  }
  const behaviors = (spec as Record<string, unknown>)['behaviors'];
  if (!Array.isArray(behaviors)) {
    throw new Error('translateProdSpec: spec.behaviors must be an array');
  }
  const grouped = new Map<RuntimeKind, TranslatorItem[]>();
  behaviors.forEach((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      logSkip(botId, `non-object-entry index=${index}`);
      return;
    }
    const record = entry as Record<string, unknown>;
    if (hasTokenMaterial(record)) {
      logSkip(botId, `token-material-present index=${index}`);
      return;
    }
    const kind = resolveKind(record);
    if (kind === null) {
      logSkip(botId, `unknown-kind index=${index}`);
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
  const rows: RuntimeRow[] = [];
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
    rows.push({ kind, params, specVersion });
  }
  return rows;
}

let translator: PublishTranslator = defaultTranslateProdSpec;

export function __setTranslator(fn: PublishTranslator): void {
  translator = fn;
}

export function __resetTranslator(): void {
  translator = defaultTranslateProdSpec;
}

// Full-sync write: DELETE-then-INSERT inside the caller's transaction. Delete
// first so kinds the new version no longer carries do not linger as stale
// rows; re-publishing the same version therefore yields the same rows.
async function syncRuntimeRows(
  client: PoolClient,
  botId: string,
  rows: RuntimeRow[],
  specVersion: number,
): Promise<number> {
  await client.query('DELETE FROM bot_runtime_config WHERE bot_id = $1', [botId]);
  for (const row of rows) {
    await client.query(
      `INSERT INTO bot_runtime_config (bot_id, guild_id, kind, params, spec_version)
       VALUES ($1, NULL, $2, $3::jsonb, $4)`,
      [botId, row.kind, JSON.stringify(row.params), specVersion],
    );
  }
  return rows.length;
}

function error(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

// --- Body validation -------------------------------------------------------

export interface ValidPublish {
  botId: string;
  version: number | null;
}

export type PublishValidation =
  { ok: true; value: ValidPublish } | { ok: false; status: 404 | 422; error: string };

// `version` is optional: omitted (or null) publishes the current draft. A
// malformed botId is 404 (indistinguishable from foreign); every other shape
// problem is 422.
export function validatePublishBody(body: unknown): PublishValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 422, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;

  const rawBotId: unknown = record.botId;
  if (!isUuid(rawBotId)) {
    return { ok: false, status: 404, error: 'not found' };
  }

  const rawVersion: unknown = record.version;
  if (rawVersion === undefined || rawVersion === null) {
    return { ok: true, value: { botId: rawBotId, version: null } };
  }
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
    return { ok: false, status: 422, error: 'version must be a positive integer' };
  }

  return { ok: true, value: { botId: rawBotId, version: rawVersion } };
}

// --- Route -----------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(422, 'body must be JSON');
  }
  const parsed = validatePublishBody(body);
  if (!parsed.ok) {
    return error(parsed.status, parsed.error);
  }
  const { botId, version } = parsed.value;

  const pool = getPool();

  let pointers: { prod_spec_id: string | null; draft_spec_id: string | null };
  try {
    const owned = await pool.query<{ prod_spec_id: string | null; draft_spec_id: string | null }>(
      'SELECT prod_spec_id, draft_spec_id FROM bots WHERE id = $1 AND account_id = $2',
      [botId, session.accountId],
    );
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
    pointers = owned.rows[0];
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not publish');
  }

  let target: { id: string; version: number; spec: unknown };
  try {
    if (version !== null) {
      const row = await pool.query<{ id: string; version: number; spec: unknown }>(
        'SELECT id, version, spec FROM spec_versions WHERE bot_id = $1 AND version = $2',
        [botId, version],
      );
      if (row.rowCount !== 1) {
        return error(404, 'not found');
      }
      target = row.rows[0];
    } else {
      if (pointers.draft_spec_id === null) {
        return error(404, 'no draft yet');
      }
      const row = await pool.query<{ id: string; version: number; spec: unknown }>(
        'SELECT id, version, spec FROM spec_versions WHERE id = $1 AND bot_id = $2',
        [pointers.draft_spec_id, botId],
      );
      if (row.rowCount !== 1) {
        return error(404, 'no draft yet');
      }
      target = row.rows[0];
    }
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not publish');
  }

  let envelopes: unknown[];
  try {
    const scans = await pool.query<{ preflight: unknown }>(
      'SELECT preflight FROM guild_installs WHERE bot_id = $1 AND preflight IS NOT NULL',
      [botId],
    );
    envelopes = scans.rows.map((scan) => scan.preflight);
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not publish');
  }

  const failing = detectRedFailing(envelopes);
  if (failing.length > 0) {
    return error(409, 'preflight red', { reason: 'preflight-red', failing });
  }

  const preflight = latestPreflightEnvelope(envelopes) ?? 'unscanned';
  const detail = JSON.stringify({ version: target.version, preflight });

  let client: PoolClient;
  let runtimeRows = 0;
  try {
    client = await pool.connect();
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not publish');
  }
  try {
    await client.query('BEGIN');
    const moved = await client.query(
      `UPDATE bots SET prod_spec_id = $1, updated_at = now()
       WHERE id = $2 AND account_id = $3 AND prod_spec_id IS NOT DISTINCT FROM $4`,
      [target.id, botId, session.accountId, pointers.prod_spec_id],
    );
    if (moved.rowCount !== 1) {
      await client.query('ROLLBACK').catch(() => undefined);
      return error(409, 'stale draft', { reason: 'stale-draft' });
    }
    await client.query(
      `INSERT INTO audit_events (account_id, bot_id, actor, action, detail)
       VALUES ($1, $2, $3, 'publish', $4::jsonb)`,
      [session.accountId, botId, `owner:${session.discordId}`, detail],
    );
    // Publish-hook runtime sync, inside the same transaction: a translation or
    // row-sync failure throws into the catch below, rolling back the pointer
    // move and the audit row — never a moved pointer with stale rows.
    const rows = translator(target.spec, botId, target.version);
    runtimeRows = await syncRuntimeRows(client, botId, rows, target.version);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not publish');
  } finally {
    client.release();
  }

  return Response.json(
    { version: target.version, state: 'published', runtimeRows },
    { status: 200 },
  );
}
