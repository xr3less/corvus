import { getPool, __setPool } from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { isEnvelope, parseBotId } from '../../../../lib/editor/drafts';

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

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// GET /api/spec/draft?botId=<uuid> -> 200 { version, spec, state }.
// Reads the row bots.draft_spec_id points at, so the panel editor and the AI
// chat always render the SAME versioned draft. Ownership failures return 404
// (never 403-with-existence-leak); a bot with no minted draft yet returns
// 404 { error: 'no draft yet' }.
export async function GET(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const botId = parseBotId(new URL(req.url).searchParams.get('botId'));
  if (botId === null) {
    // Malformed ids are indistinguishable from foreign ones: 404, no leak.
    return error(404, 'not found');
  }

  const pool = getPool();
  let draftSpecId: string | null;
  try {
    const owned = await pool.query<{ draft_spec_id: string | null }>(
      'SELECT draft_spec_id FROM bots WHERE id = $1 AND account_id = $2',
      [botId, session.accountId],
    );
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
    draftSpecId = owned.rows[0].draft_spec_id;
  } catch {
    return error(500, 'could not load draft');
  }
  if (draftSpecId === null) {
    return error(404, 'no draft yet');
  }

  try {
    const row = await pool.query<{ version: number; spec: unknown; state: string }>(
      'SELECT version, spec, state FROM spec_versions WHERE id = $1',
      [draftSpecId],
    );
    if (row.rowCount !== 1) {
      return error(500, 'could not load draft');
    }
    const found = row.rows[0];
    if (!isEnvelope(found.spec)) {
      return error(500, 'could not load draft');
    }
    return Response.json(
      { version: found.version, spec: found.spec, state: found.state },
      { status: 200 },
    );
  } catch {
    return error(500, 'could not load draft');
  }
}
