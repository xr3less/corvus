// GET /api/bots/[botId]/activity — unified read-only activity feed for one
// bot (V1-7 "Logs"): publish/rollback events from audit_events plus AI spend
// burns from ai_spend, newest first.
//
// Ownership: the bot must belong to the session account or the route answers
// 404 — unknown and foreign ids share the exact same shape, so bot existence
// never leaks. Malformed botId is also 404 for the same reason.
//
// ai_spend attribution rule (Docs/06 §2–3): ai_spend is account-scoped
// (accounts 1—N ai_spend) and has no bot FK; a row links to a bot only through
// its nullable `ref_id`. A spend row is therefore shown on this feed ONLY when
// `account_id` is the session account AND `ref_id` equals the bot id. Rows
// without that link are omitted rather than guessed, which structurally
// prevents another bot's spend from ever appearing here. No helper change was
// needed: this query is local to the route (no cross-workspace imports).
//
// Every `text` is built ONLY from stored columns (audit `detail->>'version'`,
// ai_spend `reason`/`credits`) in plain non-coder English — nothing is invented
// when a column is missing.

import { getPool, __setPool } from '../../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../../lib/interview/session-bind';
import { isUuid } from '../../../../../lib/editor/drafts';

export interface EditorSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<EditorSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/spec/publish/route.ts).
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

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// --- Types ------------------------------------------------------------------

export type ActivityKind = 'publish' | 'rollback' | 'spend';

export interface ActivityItem {
  at: string;
  kind: ActivityKind;
  text: string;
  credits?: number;
}

export interface AuditFeedRow {
  action: string;
  version: string | null;
  created_at: Date | string;
}

export interface SpendFeedRow {
  reason: string;
  credits: string | number | null;
  created_at: Date | string;
}

export const DEFAULT_ACTIVITY_LIMIT = 20;
export const MAX_ACTIVITY_LIMIT = 100;

// --- Limit parsing ----------------------------------------------------------

export type LimitParse = { ok: true; value: number } | { ok: false; status: 422; error: string };

const LIMIT_ERROR = 'limit must be an integer between 1 and 100';

// `?limit` is optional (default 20). A numeric value above the max is clamped
// down to 100 and below the minimum up to 1 — the feed is read-only, so a bad
// upper bound degrades to the documented cap rather than failing the request.
// A non-integer value (letters, decimals, exponent notation) is a malformed
// request and answers 422.
export function parseActivityLimit(raw: string | null): LimitParse {
  if (raw === null || raw.trim() === '') {
    return { ok: true, value: DEFAULT_ACTIVITY_LIMIT };
  }
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, status: 422, error: LIMIT_ERROR };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, status: 422, error: LIMIT_ERROR };
  }
  const clamped = Math.min(MAX_ACTIVITY_LIMIT, Math.max(1, value));
  return { ok: true, value: clamped };
}

// --- Text building (pure, DB-free) ------------------------------------------

function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) {
    return value;
  }
  const stripped = value.replace(/0+$/, '').replace(/\.$/, '');
  return stripped === '' || stripped === '-' ? '0' : stripped;
}

// Credits arrive from Postgres `numeric` as a string (e.g. '1.100'); a number
// is also accepted so pure tests can call this directly. Unknown shapes return
// null so the caller can omit the credit detail instead of printing garbage.
export function formatCredits(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (raw === '') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return stripTrailingZeros(raw);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return stripTrailingZeros(parsed.toFixed(10));
}

const REASON_LABELS: Record<string, string> = {
  'builder-run': 'Builder run',
  'builder run': 'Builder run',
  'persona-run': 'Persona run',
  'persona run': 'Persona run',
};

// Stored reasons are machine tokens ('builder-run'); map the known ones and
// humanize anything else from the stored string itself. Never invents a label
// for an empty reason.
export function humanizeReason(reason: string): string {
  const key = reason.trim().toLowerCase();
  if (key === '') {
    return 'AI run';
  }
  const mapped = REASON_LABELS[key];
  if (mapped !== undefined) {
    return mapped;
  }
  const words = key.replace(/[-_]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'AI run';
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// e.g. 'Builder run · 1.1 credits'; a null credit column yields just the label
// (never a fabricated zero).
export function buildSpendText(
  reason: string,
  credits: string | number | null | undefined,
): string {
  const label = humanizeReason(reason);
  const formatted = formatCredits(credits);
  return formatted === null ? label : `${label} · ${formatted} credits`;
}

function normalizeVersion(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = typeof value === 'number' ? String(value) : value.trim();
  return /^\d+$/.test(raw) ? raw : null;
}

// e.g. 'Published v12'; a missing stored version yields the bare verb.
export function buildPublishText(version: string | number | null | undefined): string {
  const normalized = normalizeVersion(version);
  return normalized === null ? 'Published' : `Published v${normalized}`;
}

// e.g. 'Rolled back to v7'; a missing stored version yields the bare verb.
export function buildRollbackText(version: string | number | null | undefined): string {
  const normalized = normalizeVersion(version);
  return normalized === null ? 'Rolled back' : `Rolled back to v${normalized}`;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Merge both streams and order newest first. ISO-8601 UTC strings sort
// lexicographically, and Array.prototype.sort is stable, so equal timestamps
// keep their stream order deterministically.
export function mergeActivity(
  auditRows: readonly AuditFeedRow[],
  spendRows: readonly SpendFeedRow[],
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const row of auditRows) {
    const kind: ActivityKind = row.action === 'rollback' ? 'rollback' : 'publish';
    const text =
      kind === 'rollback' ? buildRollbackText(row.version) : buildPublishText(row.version);
    items.push({ at: toIso(row.created_at), kind, text });
  }
  for (const row of spendRows) {
    const formatted = formatCredits(row.credits);
    const item: ActivityItem = {
      at: toIso(row.created_at),
      kind: 'spend',
      text: buildSpendText(row.reason, row.credits),
    };
    if (formatted !== null) {
      item.credits = Number(formatted);
    }
    items.push(item);
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items;
}

// --- Route -----------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { botId } = await params;
  if (!isUuid(botId)) {
    return error(404, 'not found');
  }

  const limit = parseActivityLimit(new URL(req.url).searchParams.get('limit'));
  if (!limit.ok) {
    return error(422, limit.error);
  }

  const pool = getPool();

  try {
    const owned = await pool.query('SELECT 1 FROM bots WHERE id = $1 AND account_id = $2', [
      botId,
      session.accountId,
    ]);
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }

    const [audit, spend] = await Promise.all([
      pool.query<AuditFeedRow>(
        `SELECT action, detail->>'version' AS version, created_at
           FROM audit_events
          WHERE bot_id = $1 AND account_id = $2 AND action IN ('publish', 'rollback')
          ORDER BY created_at DESC
          LIMIT $3`,
        [botId, session.accountId, limit.value],
      ),
      pool.query<SpendFeedRow>(
        `SELECT reason, credits, created_at
           FROM ai_spend
          WHERE account_id = $1 AND ref_id = $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [session.accountId, botId, limit.value],
      ),
    ]);

    const items = mergeActivity(audit.rows, spend.rows).slice(0, limit.value);
    return Response.json({ items }, { status: 200 });
  } catch {
    return error(500, 'could not load activity');
  }
}
