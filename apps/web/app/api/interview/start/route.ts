import type { Pool } from 'pg';
import { getPool, mapDbError, __setPool as setSharedPool } from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { firstQuestion, validateBotName } from '../../../../lib/interview/tree';

export interface InterviewSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<InterviewSession | null>;
}

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

// Pool lives in lib/db/pool (single shared helper, V1-2). This re-export
// keeps the historical __setPool injection name working by delegating.
export function __setPool(pool: Pool): void {
  setSharedPool(pool);
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// POST /api/interview/start { botName } -> 200 { interviewId, question }.
// Creates the draft bots row (status=draft, scoped to the session account);
// the bot id IS the interview id (no separate interview table in V1-1).
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
  const botName = (body as { botName?: unknown } | null)?.botName;
  const name = validateBotName(botName);
  if (!name.ok) {
    return error(422, name.error);
  }

  let interviewId: string;
  try {
    // token_cipher is NOT NULL bytea with no token custody in V1-1 (SPEC
    // section 7: bot TOKEN fields stay NULL until gateway install), so the
    // draft row carries an empty placeholder — never a real token.
    const result = await getPool().query<{ id: string }>(
      `INSERT INTO bots (account_id, name, token_cipher, status)
       VALUES ($1, $2, '\\x'::bytea, 'draft')
       RETURNING id`,
      [session.accountId, name.value],
    );
    interviewId = result.rows[0].id;
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not start interview');
  }

  return Response.json({ interviewId, question: firstQuestion() }, { status: 200 });
}
