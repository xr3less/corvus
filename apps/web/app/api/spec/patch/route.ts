import { parseSpec } from '@corvus/spec';
import { getPool, __setPool } from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { validatePatchBody } from '../../../../lib/editor/drafts';

export interface EditorSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<EditorSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars.
// The pool itself is owned by lib/db/pool (T-durable); this module never
// constructs one and never reads a database URL.
export { __setPool };

// Production default is the real getSession bind (session-bind.ts);
// closedReader is the test-reset state only.
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

async function currentMaxVersion(
  botId: string,
): Promise<{ ok: true; max: number | null } | { ok: false }> {
  try {
    // MAX() over an integer column returns bigint, which pg hands back as a
    // string — coerce before comparing.
    const head = await getPool().query<{ max_version: string | number | null }>(
      'SELECT MAX(version) AS max_version FROM spec_versions WHERE bot_id = $1',
      [botId],
    );
    const raw: string | number | null = head.rows[0].max_version;
    if (raw === null) {
      return { ok: true, max: null };
    }
    const max = Number(raw);
    if (!Number.isInteger(max) || max < 1) {
      return { ok: false };
    }
    return { ok: true, max };
  } catch {
    return { ok: false };
  }
}

// POST /api/spec/patch { botId, baseVersion, behaviors, summary } ->
//   200 { version } with the new head version number.
// The panel editor and the AI chat write the SAME draft through here:
// behavior entries stay opaque (stored verbatim, never interpreted). The
// write is optimistic-concurrency: the caller's baseVersion must equal the
// current MAX(version) for this bot, else 409 { error: 'stale base',
// currentVersion }. The INSERT + draft-pointer UPDATE run in ONE transaction
// and UNIQUE(bot_id, version) backstops the race, so spec_versions rows are
// immutable — history is append-only.
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
  const parsed = validatePatchBody(body);
  if (!parsed.ok) {
    return error(parsed.status, parsed.error);
  }
  const { botId, baseVersion, behaviors, summary } = parsed.value;

  const pool = getPool();
  try {
    const owned = await pool.query<{ id: string }>(
      'SELECT id FROM bots WHERE id = $1 AND account_id = $2',
      [botId, session.accountId],
    );
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
  } catch {
    return error(500, 'could not save patch');
  }

  const head = await currentMaxVersion(botId);
  if (!head.ok) {
    return error(500, 'could not save patch');
  }
  if (head.max === null) {
    // Minting belongs to the interview done-path; a patch needs a base.
    return error(404, 'no draft yet');
  }
  if (baseVersion !== head.max) {
    return error(409, 'stale base', { currentVersion: head.max });
  }

  // The envelope mirrors createDraft() from @corvus/spec
  // ({ version: 1, behaviors: [] }) with the caller's opaque entries.
  // Guarded by the REAL parseSpec boundary validator (never an inline copy).
  const spec = { version: 1, behaviors };
  try {
    parseSpec(spec);
  } catch {
    return error(500, 'could not save patch');
  }
  const author = `owner:${session.discordId}`;
  const nextVersion = head.max + 1;

  const client = await pool.connect().catch(() => null);
  if (client === null) {
    return error(500, 'could not save patch');
  }
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'draft')
       RETURNING id`,
      [botId, nextVersion, JSON.stringify(spec), summary, author],
    );
    const draftSpecId: string = inserted.rows[0].id;
    await client.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
      draftSpecId,
      botId,
    ]);
    await client.query('COMMIT');
    return Response.json({ version: nextVersion }, { status: 200 });
  } catch (queryError) {
    await client.query('ROLLBACK').catch(() => undefined);
    // A concurrent patch won the race and took our version number:
    // UNIQUE(bot_id, version) fired. Re-read the true head so the caller can
    // retry without an extra round trip.
    if ((queryError as { code?: string }).code === '23505') {
      const retry = await currentMaxVersion(botId);
      if (retry.ok && retry.max !== null) {
        return error(409, 'stale base', { currentVersion: retry.max });
      }
      return error(409, 'stale base', { currentVersion: nextVersion });
    }
    return error(500, 'could not save patch');
  } finally {
    client.release();
  }
}
