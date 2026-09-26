// POST /api/conversations — open one server-persisted conversation (Wave 1).
// GET /api/conversations — list the caller's own conversations, newest first.
//
// Session first (401 fail-closed, injectable reader). POST validates the body
// (422), checks bot ownership with soft-deleted exclusion (404 — unknown,
// foreign, and deleted share one shape so bot existence never leaks), then
// INSERTs the row and answers 200 { conversationId }. A null botId opens an
// account-level conversation with no ownership read (mirrors POST /api/chat's
// nullable botId). GET scopes every row to the session account, newest first;
// an account with none answers 200 { conversations: [] } — an honest empty
// state, never a 404. A database failure on any path answers an honest 500 —
// never a fabricated row.

import { getPool, mapDbError, __setPool } from '../../../lib/db/pool';
import { isUuid } from '../../../lib/editor/drafts';
import { defaultSessionReader, type SessionReader } from '../../../lib/interview/session-bind';

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/bots/route.ts).
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* Same ownership predicate every bot-scoped read uses: own account, not
   soft-deleted. A missing, foreign, or deleted bot yields no row -> 404. */
export const OWN_BOT_SQL =
  'SELECT 1 FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL';

export const CREATE_CONVERSATION_SQL =
  'INSERT INTO conversations (account_id, bot_id) VALUES ($1, $2) RETURNING id';

/* Newest first so the rail renders recency; the updated_at touch on every
   appended turn (see [id]/route.ts) keeps a re-opened thread at the top. */
export const LIST_CONVERSATIONS_SQL =
  'SELECT id, bot_id, title, updated_at FROM conversations WHERE account_id = $1' +
  ' ORDER BY updated_at DESC LIMIT $2';

export const CONVERSATIONS_MAX_LIST = 100;

export interface ConversationListItem {
  id: string;
  botId: string | null;
  title: string | null;
  updatedAt: string;
}

function readListItem(row: unknown): ConversationListItem | null {
  if (!isRecord(row)) {
    return null;
  }
  if (typeof row['id'] !== 'string') {
    return null;
  }
  const botId = row['bot_id'];
  const title = row['title'];
  const updatedAt = row['updated_at'];
  if (updatedAt instanceof Date) {
    return {
      id: row['id'],
      botId: typeof botId === 'string' ? botId : null,
      title: typeof title === 'string' ? title : null,
      updatedAt: updatedAt.toISOString(),
    };
  }
  if (typeof updatedAt === 'string') {
    return {
      id: row['id'],
      botId: typeof botId === 'string' ? botId : null,
      title: typeof title === 'string' ? title : null,
      updatedAt,
    };
  }
  return null;
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
  if (!isRecord(body)) {
    return error(422, 'body must be an object');
  }

  const rawBotId: unknown = body['botId'];
  let botId: string | null = null;
  if (rawBotId !== undefined && rawBotId !== null) {
    // Malformed botId is 422 here (mirrors POST /api/chat's validateChatBody):
    // the caller sent a value for a field whose shape is known, so the shape
    // problem is theirs. Well-formed-but-unowned is 404 below.
    if (!isUuid(rawBotId)) {
      return error(422, 'botId must be a uuid');
    }
    botId = rawBotId;
  }

  try {
    if (botId !== null) {
      const owned = await getPool().query(OWN_BOT_SQL, [botId, session.accountId]);
      if (owned.rows.length === 0) {
        return error(404, 'not found');
      }
    }
    const created = await getPool().query<{ id: string }>(CREATE_CONVERSATION_SQL, [
      session.accountId,
      botId,
    ]);
    const conversationId: unknown = created.rows[0]?.id;
    if (typeof conversationId !== 'string' || conversationId.length === 0) {
      return error(500, 'could not create conversation');
    }
    return Response.json({ conversationId }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not create conversation');
  }
}

export async function GET(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  try {
    const result = await getPool().query(LIST_CONVERSATIONS_SQL, [
      session.accountId,
      CONVERSATIONS_MAX_LIST,
    ]);
    const conversations: ConversationListItem[] = [];
    for (const row of result.rows) {
      const item = readListItem(row);
      if (item !== null) {
        conversations.push(item);
      }
    }
    return Response.json({ conversations }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not load conversations');
  }
}
