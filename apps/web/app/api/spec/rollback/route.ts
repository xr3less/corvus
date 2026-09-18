// POST /api/spec/rollback { botId, version } — repoint bots.prod_spec_id at an
// OLDER, previously-published spec_versions row of the same bot.
//
// Implements the V1-3 locked contract (shared verbatim with V1-3a). A row is a
// valid rollback target when it belongs to the bot, its version is strictly
// lower than the current production version, and it has been moved by this
// pair of routes before — proven by an audit_events row (action publish or
// rollback) carrying the same version, with spec_versions.state as a
// fallback. spec_versions rows are never mutated; rollback only repoints the
// prod pointer and appends an audit_events row.
//
// Rollback is never Red-blocked: recovery must always work, so a Red scan does
// not refuse the move (04_design_language.md:71 — "rollback is safe"). The last
// preflight envelope is still read and recorded in the audit note, or
// 'unscanned' when no scan exists. The guarded UPDATE serializes concurrent
// moves exactly like publish.

import type { PoolClient } from 'pg';
import { getPool, mapDbError, __setPool } from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { isUuid } from '../../../../lib/editor/drafts';
import { latestPreflightEnvelope } from '../../../../lib/spec/preflight';

export interface EditorSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<EditorSession | null>;
}

// Re-exported so route tests inject the same shared pool singleton that
// lib/db/pool exposes (mirrors publish/route.ts).
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

export interface ValidRollback {
  botId: string;
  version: number;
}

export type RollbackValidation =
  { ok: true; value: ValidRollback } | { ok: false; status: 404 | 422; error: string };

// `version` is required. Malformed botId is 404 (indistinguishable from
// foreign); a missing or non-positive-integer version is 422.
export function validateRollbackBody(body: unknown): RollbackValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 422, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;

  const rawBotId: unknown = record.botId;
  if (!isUuid(rawBotId)) {
    return { ok: false, status: 404, error: 'not found' };
  }

  const rawVersion: unknown = record.version;
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
    return { ok: false, status: 422, error: 'version must be a positive integer' };
  }

  return { ok: true, value: { botId: rawBotId, version: rawVersion } };
}

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
  const parsed = validateRollbackBody(body);
  if (!parsed.ok) {
    return error(parsed.status, parsed.error);
  }
  const { botId, version } = parsed.value;

  const pool = getPool();

  let prodSpecId: string | null;
  try {
    const owned = await pool.query<{ prod_spec_id: string | null }>(
      'SELECT prod_spec_id FROM bots WHERE id = $1 AND account_id = $2',
      [botId, session.accountId],
    );
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
    prodSpecId = owned.rows[0].prod_spec_id;
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not roll back');
  }
  if (prodSpecId === null) {
    // Nothing has been published yet — there is no production version to roll
    // back from. Same 404 shape as a foreign bot.
    return error(404, 'not found');
  }

  let current: { version: number };
  let target: { id: string; version: number; state: string | null };
  try {
    const currentRow = await pool.query<{ version: number }>(
      'SELECT version FROM spec_versions WHERE id = $1 AND bot_id = $2',
      [prodSpecId, botId],
    );
    if (currentRow.rowCount !== 1) {
      return error(404, 'not found');
    }
    current = currentRow.rows[0];

    const targetRow = await pool.query<{ id: string; version: number; state: string | null }>(
      'SELECT id, version, state FROM spec_versions WHERE bot_id = $1 AND version = $2',
      [botId, version],
    );
    if (targetRow.rowCount !== 1) {
      return error(404, 'not found');
    }
    target = targetRow.rows[0];
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not roll back');
  }

  // Only an older, previously-published row is a rollback target.
  if (target.version >= current.version) {
    return error(404, 'not found');
  }
  let wasPublished: boolean;
  try {
    const audited = await pool.query<{ version: string }>(
      `SELECT detail->>'version' AS version FROM audit_events
       WHERE bot_id = $1 AND action IN ('publish', 'rollback') AND detail->>'version' = $2`,
      [botId, String(target.version)],
    );
    wasPublished =
      (audited.rowCount ?? 0) > 0 || target.state === 'published' || target.state === 'rolled_back';
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not roll back');
  }
  if (!wasPublished) {
    return error(404, 'not found');
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
    return error(500, 'could not roll back');
  }

  // Rollback is never Red-blocked — recovery must always work. The scan (or
  // its absence) is recorded in the audit note below.
  const preflight = latestPreflightEnvelope(envelopes) ?? 'unscanned';
  const detail = JSON.stringify({ version: target.version, preflight });

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not roll back');
  }
  try {
    await client.query('BEGIN');
    const moved = await client.query(
      `UPDATE bots SET prod_spec_id = $1, updated_at = now()
       WHERE id = $2 AND account_id = $3 AND prod_spec_id IS NOT DISTINCT FROM $4`,
      [target.id, botId, session.accountId, prodSpecId],
    );
    if (moved.rowCount !== 1) {
      await client.query('ROLLBACK').catch(() => undefined);
      return error(409, 'stale draft', { reason: 'stale-draft' });
    }
    await client.query(
      `INSERT INTO audit_events (account_id, bot_id, actor, action, detail)
       VALUES ($1, $2, $3, 'rollback', $4::jsonb)`,
      [session.accountId, botId, `owner:${session.discordId}`, detail],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not roll back');
  } finally {
    client.release();
  }

  return Response.json({ version: target.version }, { status: 200 });
}
