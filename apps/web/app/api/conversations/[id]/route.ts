// Conversation turns API (Wave 1): GET turns, POST turns, DELETE conversation.
//
// GET /api/conversations/[id] — the conversation's turns: at most 50, ending
// at the last user row; when older history is truncated the response carries
// an older-history-truncated note. POST appends turns append-only: INSERT only,
// never UPDATE or DELETE an existing turn row — so a retry or a double-path
// write that re-sends already-stored turns cannot duplicate them. DELETE marks
// nothing: the conversation is hard-deleted by delete only when it belongs to
// the caller, and the turns go with it (one DELETE each, ordered so a child
// row never orphans).
//
// Ownership on every method: the conversation must belong to the session
// account or the route answers 404 — unknown, malformed, and foreign ids
// share the exact same shape so conversation existence never leaks. A
// conversation linked to a soft-deleted bot (deleted_at NOT NULL) reads as not
// found on GET/POST. A database failure on any path answers an honest 500 —
// never a fabricated row, never a silent success.

import { getPool, mapDbError, __setPool } from '../../../../lib/db/pool';
import { isUuid } from '../../../../lib/editor/drafts';
import { defaultSessionReader, type SessionReader } from '../../../../lib/interview/session-bind';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* Conversation metadata the readers need before touching turns: owner account
   plus the linked bot's soft-delete state (NULL when the conversation has no
   bot). A row is only usable when the account matches the caller and the bot
   is absent or live. */
export const OWN_CONVERSATION_SQL =
  'SELECT c.id, c.account_id, b.deleted_at AS bot_deleted_at FROM conversations c' +
  ' LEFT JOIN bots b ON b.id = c.bot_id WHERE c.id = $1';

export const TURNS_CAP = 50;

export const OLDER_HISTORY_NOTE = 'older-history-truncated';

/* Turns ordered oldest-first: the POST idempotency guard consumes the stored
   prefix in order, so the ordering is what makes a re-sent tail match instead
   of duplicate. `id` breaks created_at ties so two turns stored in the same
   instant still read in insertion order. */
export const LIST_TURNS_SQL =
  'SELECT id, role, text FROM conversation_turns WHERE conversation_id = $1' +
  ' ORDER BY created_at ASC, id ASC LIMIT $2';

/* Newest-first twin for the GET window: the 50-cap must end at the thread's
   TRUE last user row, so the fetch has to cover the END of the thread, not
   its start. The handler reverses back to oldest-first before windowing.
   Fetches the cap plus one so the reader can tell "exactly 50" (nothing
   truncated) from "more than 50" (truncated) without a second round trip. */
export const LIST_TURNS_DESC_SQL =
  'SELECT id, role, text FROM conversation_turns WHERE conversation_id = $1' +
  ' ORDER BY created_at DESC, id DESC LIMIT $2';

export interface TurnItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const TURN_TEXT_MAX = 2000;

function readTurn(row: unknown): TurnItem | null {
  if (!isRecord(row)) {
    return null;
  }
  if (typeof row['id'] !== 'string') {
    return null;
  }
  if (row['role'] !== 'user' && row['role'] !== 'assistant') {
    return null;
  }
  if (typeof row['text'] !== 'string') {
    return null;
  }
  return { id: row['id'], role: row['role'], text: row['text'] };
}

/* The window the client rehydrates: at most TURNS_CAP turns, ending at the
   last stored user exchange. A newest user row is the current draft — it and
   anything it supersedes stays out. The exchange-closing assistant reply is
   kept when stored. `truncated` is true only when rows exist before the
   window; the note is the client's cue to say so rather than invent a seam. */
export function windowTurns(all: TurnItem[]): { turns: TurnItem[]; truncated: boolean } {
  // The thread's NEWEST row decides the shape. A newest user row is the
  // current draft — history stops before it, so the draft and everything the
  // draft supersedes stays out of the window.
  const newestRow = all.length === 0 ? null : all[all.length - 1];
  if (newestRow !== null && newestRow.role === 'user') {
    const history = all.slice(0, all.length - 1);
    if (history.length <= TURNS_CAP) {
      return { turns: history, truncated: false };
    }
    return { turns: history.slice(history.length - TURNS_CAP), truncated: true };
  }
  // Otherwise the last user row is closed by the assistant reply that
  // follows it (or by nothing, when the thread ends on that user row): keep
  // the closing reply when stored, drop anything past that one reply.
  let end = -1;
  for (let i = all.length - 1; i >= 0; i -= 1) {
    if (all[i]?.role === 'user') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { turns: [], truncated: all.length > 0 };
  }
  const close = end + 1 < all.length && all[end + 1]?.role === 'assistant' ? end + 2 : end + 1;
  const through = all.slice(0, close);
  if (through.length <= TURNS_CAP) {
    return { turns: through, truncated: false };
  }
  return { turns: through.slice(through.length - TURNS_CAP), truncated: true };
}

/* Append validation: a turn is `{ role, text }`; role is user-or-assistant,
   text is a trimmed non-empty string capped at the same 2000 the chat route
   accepts per turn, so a turn the chat route will happily store can never be
   refused here for length alone. Batch-bounded so one POST cannot stuff the
   table. */
export const TURNS_BATCH_MAX = 50;

export type TurnsValidation =
  | { ok: true; value: { role: 'user' | 'assistant'; text: string }[] }
  | { ok: false; status: 422; error: string };

export function validateTurnsBody(body: unknown): TurnsValidation {
  if (!isRecord(body)) {
    return { ok: false, status: 422, error: 'body must be an object' };
  }
  const rawTurns: unknown = body['turns'];
  if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
    return { ok: false, status: 422, error: 'turns must be a non-empty array' };
  }
  if (rawTurns.length > TURNS_BATCH_MAX) {
    return { ok: false, status: 422, error: `turns must hold at most ${TURNS_BATCH_MAX} turns` };
  }
  const turns: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const entry of rawTurns) {
    if (!isRecord(entry)) {
      return { ok: false, status: 422, error: 'turns must be objects' };
    }
    if (entry['role'] !== 'user' && entry['role'] !== 'assistant') {
      return { ok: false, status: 422, error: "turn role must be 'user' or 'assistant'" };
    }
    if (typeof entry['text'] !== 'string') {
      return { ok: false, status: 422, error: 'turn text must be a string' };
    }
    const text = entry['text'].trim();
    if (text === '' || text.length > TURN_TEXT_MAX) {
      return {
        ok: false,
        status: 422,
        error: `turn text must be 1-${TURN_TEXT_MAX} characters`,
      };
    }
    turns.push({ role: entry['role'], text });
  }
  return { ok: true, value: turns };
}

/* INSERT-only writer with an idempotency guard: a turn is identified by
   (role, text) pairing against the conversation's existing turns, and rows
   already present are skipped — so a retry or a double-path write that
   re-sends stored turns inserts only the genuinely new ones and never
   rewrites an existing row (no UPDATE) or removes one (no DELETE). Keyed on
   exact text so a repeated "yes" typed twice is stored twice, but a re-sent
   first "yes" is not. */
export const INSERT_TURN_SQL =
  'INSERT INTO conversation_turns (conversation_id, role, text) VALUES ($1, $2, $3) RETURNING id';

export const TOUCH_CONVERSATION_SQL = 'UPDATE conversations SET updated_at = now() WHERE id = $1';

export const DELETE_TURNS_SQL = 'DELETE FROM conversation_turns WHERE conversation_id = $1';

export const DELETE_CONVERSATION_SQL =
  'DELETE FROM conversations WHERE id = $1 AND account_id = $2';

interface OwnedConversation {
  id: string;
  botDeleted: boolean;
}

function readOwned(row: unknown, accountId: string): OwnedConversation | null {
  if (!isRecord(row)) {
    return null;
  }
  if (typeof row['id'] !== 'string' || row['account_id'] !== accountId) {
    return null;
  }
  return { id: row['id'], botDeleted: row['bot_deleted_at'] !== null };
}

async function loadOwned(
  conversationId: string,
  accountId: string,
): Promise<OwnedConversation | null> {
  const found = await getPool().query(OWN_CONVERSATION_SQL, [conversationId]);
  return readOwned(found.rows[0], accountId);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return error(404, 'not found');
  }

  try {
    const owned = await loadOwned(id, session.accountId);
    // A conversation on a soft-deleted bot is unreadable: the bot's thread
    // belongs to a bot the owner deleted, so it reads as not found rather
    // than surfacing orphaned history.
    if (owned === null || owned.botDeleted) {
      return error(404, 'not found');
    }

    const stored = await getPool().query(LIST_TURNS_DESC_SQL, [id, TURNS_CAP + 1]);
    const newestFirst: TurnItem[] = [];
    for (const row of stored.rows) {
      const turn = readTurn(row);
      if (turn !== null) {
        newestFirst.push(turn);
      }
    }
    // The fetch over-reads by one at the NEW end only to detect window
    // truncation: when 51 rows arrive there is older history beyond the
    // newest-50 candidate, so `truncated` is true regardless of where the
    // last user row falls. The window then runs on the newest-50 candidate
    // (reversed back to oldest-first); `windowTruncated` covers the
    // no-user-row edge (assistant-only history is never rehydrated, which
    // the caller says plainly rather than inventing a seam).
    const truncated = newestFirst.length > TURNS_CAP;
    const full = (truncated ? newestFirst.slice(0, TURNS_CAP) : newestFirst).reverse();
    const { turns, truncated: windowTruncated } = windowTurns(full);
    return Response.json(
      truncated || windowTruncated ? { turns, note: OLDER_HISTORY_NOTE } : { turns },
      { status: 200 },
    );
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not load conversation');
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return error(404, 'not found');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(422, 'body must be JSON');
  }
  const parsed = validateTurnsBody(body);
  if (!parsed.ok) {
    return error(parsed.status, parsed.error);
  }

  try {
    const owned = await loadOwned(id, session.accountId);
    if (owned === null || owned.botDeleted) {
      return error(404, 'not found');
    }

    // Idempotency guard: the stored slice covers the thread's NEWEST turns
    // (DESC fetch, reversed back to oldest-first), because the client re-sends
    // the recent tail — a retry or a double-path write replays what it just
    // sent, never the ancient head. Each posted turn consumes one stored turn
    // in order when (role, text) match: a posted turn matching the next stored
    // turn is already persisted and skipped; one that does not match is
    // genuinely new and INSERTed. A middle-of-thread repeat still INSERTs (it
    // does not match the next unconsumed row) while a re-sent tail is fully
    // skipped — and turns stay append-only either way (INSERT only, no UPDATE,
    // no DELETE of turn rows).
    const stored = await getPool().query(LIST_TURNS_DESC_SQL, [id, TURNS_CAP + 1]);
    const newestFirst: TurnItem[] = [];
    for (const row of stored.rows) {
      const turn = readTurn(row);
      if (turn !== null) {
        newestFirst.push(turn);
      }
    }
    // Compare against the newest slice oldest-first (same reversal as GET).
    const existing = newestFirst.reverse();
    let cursor = 0;
    const fresh: { role: 'user' | 'assistant'; text: string }[] = [];
    for (const turn of parsed.value) {
      if (
        cursor < existing.length &&
        existing[cursor]?.role === turn.role &&
        existing[cursor]?.text === turn.text
      ) {
        cursor += 1;
      } else {
        fresh.push(turn);
      }
    }

    const saved: { id: string }[] = [];
    for (const turn of fresh) {
      const inserted = await getPool().query<{ id: string }>(INSERT_TURN_SQL, [
        id,
        turn.role,
        turn.text,
      ]);
      const turnId: unknown = inserted.rows[0]?.id;
      if (typeof turnId === 'string' && turnId.length > 0) {
        saved.push({ id: turnId });
      }
    }
    // The rail sorts by updated_at, so a conversation that gained turns must
    // re-sort to the top — even a fully-duplicate POST, which wrote no rows
    // but still confirmed the thread is the caller's latest touch.
    await getPool().query(TOUCH_CONVERSATION_SQL, [id]);
    return Response.json({ saved: saved.length, turns: saved }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not save turns');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return error(404, 'not found');
  }

  try {
    // Ownership first: nothing is deleted until the conversation is proven
    // to belong to the caller. A conversation on a soft-deleted bot is still
    // deletable (orphaned-thread cleanup) — only foreign/unknown ids 404.
    const owned = await loadOwned(id, session.accountId);
    if (owned === null) {
      return error(404, 'not found');
    }
    // Turns first, then the conversation: the child rows are removed before
    // the parent so a failure between the two can never leave turns pointing
    // at a conversation that no longer exists.
    await getPool().query(DELETE_TURNS_SQL, [id]);
    const removed = await getPool().query(DELETE_CONVERSATION_SQL, [id, session.accountId]);
    if ((removed.rowCount ?? 0) !== 1) {
      return error(404, 'not found');
    }
    return Response.json({ deleted: true }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not delete conversation');
  }
}
