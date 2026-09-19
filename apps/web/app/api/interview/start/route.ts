import type { Pool } from 'pg';
import { getPool, mapDbError, __setPool as setSharedPool } from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { firstQuestion, validateBotName } from '../../../../lib/interview/tree';
import {
  LIVE_BOT_COUNT_SQL,
  MINT_ACCOUNT_SQL,
  mintGate,
  mintRefusal,
  needsLiveBotCount,
  type MintAccountRow,
} from '../../../../lib/bots';

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
//
// KI-033: an interview start mints a bot, so it is one of the three mint entry
// points and enforces the same trial gate as POST /api/bots, before any write.
// The gate costs one extra SELECT (the account's tier + trial_ends_at) and, on
// a still-running trial only, a second one for the live-bot count; a paid tier
// and an expired clock skip the count entirely (lib/bots.ts needsLiveBotCount).
// A refusal answers 403 { error, message } and writes nothing: no bot row, so
// no interview either.
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
    // Same gate, same order as POST /api/bots (ONE shared decision in
    // lib/bots.ts): account row first, the live-bot count only when the tier
    // makes the cap apply, refusal before the INSERT. Nothing is written and
    // nothing is charged when the gate refuses.
    const account = await getPool().query<MintAccountRow>(MINT_ACCOUNT_SQL, [session.accountId]);
    const row = account.rows[0] ?? null;
    let liveBots = 0;
    if (needsLiveBotCount(row)) {
      const counted = await getPool().query<{ count: number }>(LIVE_BOT_COUNT_SQL, [
        session.accountId,
      ]);
      liveBots = counted.rows[0]?.count ?? 0;
    }
    const refused = mintRefusal(
      mintGate({ tier: row?.tier ?? null, trial_ends_at: row?.trial_ends_at ?? null }, liveBots),
    );
    if (refused) {
      return Response.json({ error: refused.code, message: refused.message }, { status: 403 });
    }

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
