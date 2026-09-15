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

import { getPool, __setPool } from '../../../../lib/db/pool';
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
  } catch {
    return error(500, 'could not publish');
  }

  let target: { id: string; version: number };
  try {
    if (version !== null) {
      const row = await pool.query<{ id: string; version: number }>(
        'SELECT id, version FROM spec_versions WHERE bot_id = $1 AND version = $2',
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
      const row = await pool.query<{ id: string; version: number }>(
        'SELECT id, version FROM spec_versions WHERE id = $1 AND bot_id = $2',
        [pointers.draft_spec_id, botId],
      );
      if (row.rowCount !== 1) {
        return error(404, 'no draft yet');
      }
      target = row.rows[0];
    }
  } catch {
    return error(500, 'could not publish');
  }

  let envelopes: unknown[];
  try {
    const scans = await pool.query<{ preflight: unknown }>(
      'SELECT preflight FROM guild_installs WHERE bot_id = $1 AND preflight IS NOT NULL',
      [botId],
    );
    envelopes = scans.rows.map((scan) => scan.preflight);
  } catch {
    return error(500, 'could not publish');
  }

  const failing = detectRedFailing(envelopes);
  if (failing.length > 0) {
    return error(409, 'preflight red', { reason: 'preflight-red', failing });
  }

  const preflight = latestPreflightEnvelope(envelopes) ?? 'unscanned';
  const detail = JSON.stringify({ version: target.version, preflight });

  const client = await pool.connect().catch(() => null);
  if (client === null) {
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
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return error(500, 'could not publish');
  } finally {
    client.release();
  }

  return Response.json({ version: target.version, state: 'published' }, { status: 200 });
}
