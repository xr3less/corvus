// GET /api/bots — the caller's own bots, newest first (KI-010 remainder).
//
// Auth first: no session answers 401 { error }. The query is scoped to the
// session account, so another account's rows can never appear. An account with
// no bots answers 200 [] — an honest empty state, never a 404, so the list
// page can tell "none yet" from "could not read".
//
// Only id, name and status are exposed: the list is a picker, not a copy of
// the bots table. Deleted bots are excluded. A database failure answers 500
// { error }; falling back to the example bots is the page's deliberate choice,
// the route itself never invents a row.

import { getPool, __setPool } from '../../../lib/db/pool';
import { defaultSessionReader } from '../../../lib/interview/session-bind';

export interface ListSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<ListSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/bots/[botId]/activity/route.ts).
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

export interface BotListRow {
  id: string;
  name: string;
  status: string;
}

/* One query, one predicate set: own account, not deleted, newest first. */
export const LIST_BOTS_SQL =
  'SELECT id, name, status FROM bots WHERE account_id = $1 AND deleted_at IS NULL' +
  ' ORDER BY created_at DESC';

export async function GET(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  try {
    const result = await getPool().query<BotListRow>(LIST_BOTS_SQL, [session.accountId]);
    return Response.json(result.rows, { status: 200 });
  } catch {
    return error(500, 'could not load bots');
  }
}
