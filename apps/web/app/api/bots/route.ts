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
//
// POST /api/bots — mint one draft bot (KI-027). Same seams: session first
// (401), then the name validated with the shared validateBotName (422), then
// the KI-033 trial gate (403), then the mint INSERT (account_id, name, empty
// token placeholder, draft) RETURNING id → 200 { botId }. DB failure answers
// through the shared mapDbError mapping, else 500 — mirroring the GET
// handler's error shape.
//
// The trial gate runs BEFORE the INSERT, so a refused mint writes nothing and
// costs nothing: an expired clock refuses whatever the bot count (the account's
// bots are paused), a still-running trial refuses a second live bot, and a paid
// tier bypasses both. See lib/bots.ts for the decision itself — this route only
// does the reads and the response shape, identical in all three mint paths.

import { getPool, mapDbError, __setPool } from '../../../lib/db/pool';
import { defaultSessionReader } from '../../../lib/interview/session-bind';
import { validateBotName } from '../../../lib/interview/tree';
import {
  LIVE_BOT_COUNT_SQL,
  MINT_ACCOUNT_SQL,
  mintGate,
  mintRefusal,
  needsLiveBotCount,
  type MintAccountRow,
} from '../../../lib/bots';

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
  } catch (err) {
    // A missing DATABASE_URL is not a read failure — it is an unconfigured
    // process, and the caller must be told that plainly (KI-021). One shared
    // mapping (lib/db/map-db-error.ts) keeps this shape identical everywhere.
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not load bots');
  }
}

/* The mint INSERT — same quadruple as interview/start and templates fork:
   account-scoped, empty token placeholder (no token custody on mint), draft. */
export const MINT_BOT_SQL =
  "INSERT INTO bots (account_id, name, token_cipher, status) VALUES ($1, $2, '\\x'::bytea, 'draft') RETURNING id";

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

  try {
    const account = await getPool().query<MintAccountRow>(MINT_ACCOUNT_SQL, [session.accountId]);
    const row = account.rows[0] ?? null;
    let liveBots = 0;
    // The bot count is read only when it could change the answer: a paid tier
    // is never capped, and an expired clock already refuses on its own. At most
    // one extra SELECT, never two, on any mint.
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

    // token_cipher is NOT NULL bytea with no token custody on mint, so the
    // draft row carries an empty placeholder — never a real token.
    const result = await getPool().query<{ id: string }>(MINT_BOT_SQL, [
      session.accountId,
      name.value,
    ]);
    const botId = result.rows[0]?.id;
    if (typeof botId !== 'string' || botId.length === 0) {
      return error(500, 'could not mint bot');
    }
    return Response.json({ botId }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not mint bot');
  }
}
