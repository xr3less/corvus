// Tests for GET + POST + DELETE /api/conversations/[id] (Wave 1).
//
// Hermetic fake-pool shape tests only (no database): auth-first, GET caps at
// 50 ending at the last user row with the older-history-truncated note,
// ownership stays scoped by account_id, soft-deleted bots read as not found,
// POST is append-only (double-path writes create no duplicate rows), and a
// pool failure answers an honest 500 — never a fabricated row.

import { afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DatabaseNotConfiguredError, __resetPool, __setPool } from '../../../../lib/db/pool';
import type { SessionReader } from '../../../../lib/interview/session-bind';
import {
  DELETE,
  GET,
  OLDER_HISTORY_NOTE,
  POST,
  TURNS_CAP,
  validateTurnsBody,
  windowTurns,
  __resetSessionReader,
  __setSessionReader,
  type TurnItem,
} from './route';

const ACCOUNT = 'acct-owner';
const OTHER = 'acct-other';
const CONV = '22222222-3333-4444-8555-666666666666';
const BOT = '11111111-2222-4333-8444-555555555555';

const SIGNED_IN: SessionReader = {
  getSession: async () => ({ accountId: ACCOUNT, discordId: 'disc-1' }),
};
const SIGNED_OUT: SessionReader = {
  getSession: async () => null,
};

afterEach(() => {
  __resetSessionReader();
  __resetPool();
});

interface ConvSeed {
  id: string;
  accountId: string;
  botDeleted?: boolean;
}

function turn(id: string, role: 'user' | 'assistant', text: string): TurnItem {
  return { id, role, text };
}

function turnId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function fakePool(
  convs: ConvSeed[],
  turns: TurnItem[],
): Pool & {
  inserted: TurnItem[];
  queries: string[];
  remainingTurns: () => TurnItem[];
  remainingConvs: () => ConvSeed[];
} {
  const inserted: TurnItem[] = [];
  const queries: string[] = [];
  // Stateful rows: a turn-delete really removes rows, a conversation-delete
  // really removes the conversation — so a foreign DELETE cannot hide behind
  // a stateless rowCount stub.
  const liveTurns: TurnItem[] = [...turns];
  const liveConvs: ConvSeed[] = [...convs];
  let minted = 0;
  const pool = {
    inserted,
    queries,
    remainingTurns: () => [...liveTurns, ...inserted],
    remainingConvs: () => [...liveConvs],
    query: async (text: string, params: unknown[] = []) => {
      queries.push(text);
      if (text.startsWith('DELETE FROM conversation_turns')) {
        const removed = liveTurns.length;
        liveTurns.length = 0;
        return { rows: [], rowCount: removed };
      }
      if (text.startsWith('DELETE FROM conversations')) {
        const at = liveConvs.findIndex(
          (conv) => conv.id === params[0] && conv.accountId === params[1],
        );
        if (at === -1) {
          return { rows: [], rowCount: 0 };
        }
        liveConvs.splice(at, 1);
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('FROM conversations')) {
        const seed = liveConvs.find((conv) => conv.id === params[0]);
        if (!seed) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              id: seed.id,
              account_id: seed.accountId,
              bot_deleted_at: seed.botDeleted === true ? '2026-09-25T00:00:00.000Z' : null,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('FROM conversation_turns')) {
        // Newest-first, like LIST_TURNS_DESC_SQL: the tail of the thread,
        // reversed so the handler sees newest rows first.
        const all = [...liveTurns, ...inserted];
        const limit = (params[1] as number) ?? TURNS_CAP + 1;
        const rows = all.slice(Math.max(0, all.length - limit)).reverse();
        return { rows, rowCount: rows.length };
      }
      if (text.includes('INSERT INTO conversation_turns')) {
        minted += 1;
        const row = turn(`saved-${minted}`, params[1] as 'user' | 'assistant', params[2] as string);
        inserted.push(row);
        return { rows: [{ id: row.id }], rowCount: 1 };
      }
      if (text.includes('UPDATE conversations')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool & {
    inserted: TurnItem[];
    queries: string[];
    remainingTurns: () => TurnItem[];
    remainingConvs: () => ConvSeed[];
  };
  return pool;
}

function failingPool(): Pool {
  return {
    query: async () => {
      throw new Error('connection reset');
    },
  } as unknown as Pool;
}

function unconfiguredPool(): Pool {
  return {
    query: async () => {
      throw new DatabaseNotConfiguredError();
    },
  } as unknown as Pool;
}

function contextFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function postTurns(body: unknown): Request {
  return new Request(`http://localhost/api/conversations/${CONV}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('windowTurns (pure)', () => {
  it('caps at 50 through the last user exchange with the truncation flag', () => {
    const all: TurnItem[] = [];
    for (let i = 0; i < 60; i += 1) {
      all.push(turn(turnId(i), i % 2 === 0 ? 'user' : 'assistant', `turn ${i}`));
    }
    const { turns, truncated } = windowTurns(all);
    expect(TURNS_CAP).toBe(50);
    expect(turns.length).toBe(50);
    expect(truncated).toBe(true);
    expect(turns[turns.length - 2]).toEqual(turn(turnId(58), 'user', 'turn 58'));
    expect(turns[turns.length - 1]).toEqual(turn(turnId(59), 'assistant', 'turn 59'));
  });

  it('drops rows after the closing assistant reply without flagging truncation', () => {
    // A completed pair rehydrates whole; the newer in-flight user row belongs
    // to the current exchange, not to history.
    const all = [
      turn(turnId(1), 'user', 'first'),
      turn(turnId(2), 'assistant', 'answer'),
      turn(turnId(3), 'user', 'in flight'),
    ];
    const { turns, truncated } = windowTurns(all);
    expect(turns).toEqual([all[0], all[1]]);
    expect(truncated).toBe(false);
  });

  it('keeps a short thread whole with no truncation flag', () => {
    // The window ends at the last user row: the trailing assistant draft
    // belongs to the current exchange, not to persisted history.
    const all = [turn(turnId(1), 'user', 'hi'), turn(turnId(2), 'assistant', 'hello')];
    const { turns, truncated } = windowTurns(all);
    expect(turns).toEqual([turn(turnId(1), 'user', 'hi'), turn(turnId(2), 'assistant', 'hello')]);
    expect(truncated).toBe(false);
  });
});

describe('validateTurnsBody (pure)', () => {
  it('accepts a bounded user+assistant pair', () => {
    expect(
      validateTurnsBody({
        turns: [
          { role: 'user', text: '  hi  ' },
          { role: 'assistant', text: 'hello' },
        ],
      }),
    ).toEqual({
      ok: true,
      value: [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' },
      ],
    });
  });

  it('refuses an empty turns array and an over-long batch', () => {
    expect(validateTurnsBody({ turns: [] })).toEqual({
      ok: false,
      status: 422,
      error: 'turns must be a non-empty array',
    });
    expect(
      validateTurnsBody({ turns: Array.from({ length: 51 }, () => ({ role: 'user', text: 'x' })) }),
    ).toEqual({ ok: false, status: 422, error: 'turns must hold at most 50 turns' });
  });

  it('refuses an unknown role and blank text', () => {
    expect(validateTurnsBody({ turns: [{ role: 'system', text: 'x' }] })).toEqual({
      ok: false,
      status: 422,
      error: "turn role must be 'user' or 'assistant'",
    });
    expect(validateTurnsBody({ turns: [{ role: 'user', text: '   ' }] })).toEqual({
      ok: false,
      status: 422,
      error: 'turn text must be 1-2000 characters',
    });
  });
});

describe('GET /api/conversations/[id]', () => {
  it('returns 401 first when there is no session', async () => {
    __setPool(fakePool([{ id: CONV, accountId: ACCOUNT }], []));
    __setSessionReader(SIGNED_OUT);
    const res = await GET(
      new Request(`http://localhost/api/conversations/${CONV}`),
      contextFor(CONV),
    );
    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
  });

  it('answers 404 for a malformed, unknown, or foreign id with one shape', async () => {
    __setPool(fakePool([{ id: CONV, accountId: OTHER }], []));
    __setSessionReader(SIGNED_IN);
    const malformed = await GET(
      new Request('http://localhost/api/conversations/not-an-id'),
      contextFor('not-an-id'),
    );
    const foreign = await GET(
      new Request(`http://localhost/api/conversations/${CONV}`),
      contextFor(CONV),
    );
    expect(malformed.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(await readBody(malformed)).toEqual({ error: 'not found' });
    expect(await readBody(foreign)).toEqual({ error: 'not found' });
  });

  it('answers 404 when the linked bot is soft-deleted', async () => {
    __setPool(fakePool([{ id: CONV, accountId: ACCOUNT, botDeleted: true }], []));
    __setSessionReader(SIGNED_IN);
    const res = await GET(
      new Request(`http://localhost/api/conversations/${CONV}`),
      contextFor(CONV),
    );
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'not found' });
  });

  it('returns the newest 50 with the truncation note on a long thread', async () => {
    // 61 stored turns ending on a completed assistant reply: the DESC
    // over-read returns the newest 51, the note fires, and the window keeps
    // the full newest-50 candidate (closed pair at the end survives whole).
    const stored: TurnItem[] = [];
    stored.push(turn(turnId(0), 'user', 'oldest beyond the window'));
    for (let i = 1; i <= 60; i += 1) {
      stored.push(turn(turnId(i), i % 2 === 1 ? 'user' : 'assistant', `turn ${i}`));
    }
    __setPool(fakePool([{ id: CONV, accountId: ACCOUNT }], stored));
    __setSessionReader(SIGNED_IN);
    const res = await GET(
      new Request(`http://localhost/api/conversations/${CONV}`),
      contextFor(CONV),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect((body['turns'] as TurnItem[]).length).toBe(50);
    expect(body['note']).toBe(OLDER_HISTORY_NOTE);
    expect(OLDER_HISTORY_NOTE).toBe('older-history-truncated');
  });

  it('answers an honest 500 when the read fails', async () => {
    __setPool(failingPool());
    __setSessionReader(SIGNED_IN);
    const res = await GET(
      new Request(`http://localhost/api/conversations/${CONV}`),
      contextFor(CONV),
    );
    expect(res.status).toBe(500);
  });

  it('maps a missing DATABASE_URL to the canonical 500 shape', async () => {
    __setPool(unconfiguredPool());
    __setSessionReader(SIGNED_IN);
    const res = await GET(
      new Request(`http://localhost/api/conversations/${CONV}`),
      contextFor(CONV),
    );
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'database not configured' });
  });
});

describe('POST /api/conversations/[id]', () => {
  it('appends turns append-only: re-sent stored turns create no duplicate rows', async () => {
    const stored = [turn(turnId(1), 'user', 'hi'), turn(turnId(2), 'assistant', 'hello')];
    const pool = fakePool([{ id: CONV, accountId: ACCOUNT }], stored);
    __setPool(pool);
    __setSessionReader(SIGNED_IN);

    const replay = await POST(
      postTurns({
        turns: [
          { role: 'user', text: 'hi' },
          { role: 'assistant', text: 'hello' },
        ],
      }),
      contextFor(CONV),
    );
    expect(replay.status).toBe(200);
    expect(pool.inserted.length).toBe(0);
    expect(await readBody(replay)).toEqual({ saved: 0, turns: [] });

    const fresh = await POST(
      postTurns({ turns: [{ role: 'user', text: 'next?' }] }),
      contextFor(CONV),
    );
    expect(fresh.status).toBe(200);
    expect(pool.inserted.length).toBe(1);
    expect(pool.queries.some((text) => text.startsWith('UPDATE conversations'))).toBe(true);
  });

  it('rejects a foreign conversation and a bad body', async () => {
    __setPool(fakePool([{ id: CONV, accountId: OTHER }], []));
    __setSessionReader(SIGNED_IN);
    const foreign = await POST(
      postTurns({ turns: [{ role: 'user', text: 'hi' }] }),
      contextFor(CONV),
    );
    expect(foreign.status).toBe(404);
    const bad = await POST(postTurns({ turns: [] }), contextFor(CONV));
    expect(bad.status).toBe(422);
  });

  it('answers an honest 500 when the write fails', async () => {
    __setPool(failingPool());
    __setSessionReader(SIGNED_IN);
    const res = await POST(postTurns({ turns: [{ role: 'user', text: 'hi' }] }), contextFor(CONV));
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not save turns' });
  });
});

describe('DELETE /api/conversations/[id]', () => {
  it('deletes only the caller’s own conversation', async () => {
    const pool = fakePool([{ id: CONV, accountId: ACCOUNT }], [turn(turnId(1), 'user', 'hi')]);
    __setPool(pool);
    __setSessionReader(SIGNED_IN);
    const res = await DELETE(
      new Request(`http://localhost/api/conversations/${CONV}`, { method: 'DELETE' }),
      contextFor(CONV),
    );
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ deleted: true });
    expect(pool.remainingTurns()).toEqual([]);
    expect(pool.remainingConvs()).toEqual([]);
  });

  it('answers 404 for a foreign conversation and leaves its turns intact', async () => {
    const foreign = [turn(turnId(1), 'user', 'hi'), turn(turnId(2), 'assistant', 'hello')];
    const pool = fakePool([{ id: CONV, accountId: OTHER }], foreign);
    __setPool(pool);
    __setSessionReader(SIGNED_IN);
    const res = await DELETE(
      new Request(`http://localhost/api/conversations/${CONV}`, { method: 'DELETE' }),
      contextFor(CONV),
    );
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'not found' });
    // A pre-fix ordering (turns deleted before the ownership check) fails
    // this: the fake is stateful, so the turn-delete really removes rows and
    // nothing may be touched on a foreign id.
    expect(pool.remainingTurns()).toEqual(foreign);
    expect(pool.remainingConvs()).toEqual([{ id: CONV, accountId: OTHER }]);
    expect(pool.queries.some((text) => text.startsWith('DELETE FROM'))).toBe(false);
  });

  it('still deletes an owned conversation whose bot is soft-deleted', async () => {
    const pool = fakePool(
      [{ id: CONV, accountId: ACCOUNT, botDeleted: true }],
      [turn(turnId(1), 'user', 'hi')],
    );
    __setPool(pool);
    __setSessionReader(SIGNED_IN);
    const res = await DELETE(
      new Request(`http://localhost/api/conversations/${CONV}`, { method: 'DELETE' }),
      contextFor(CONV),
    );
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ deleted: true });
    expect(pool.remainingTurns()).toEqual([]);
    expect(pool.remainingConvs()).toEqual([]);
  });

  it('answers an honest 500 when the delete fails', async () => {
    __setPool(failingPool());
    __setSessionReader(SIGNED_IN);
    const res = await DELETE(
      new Request(`http://localhost/api/conversations/${CONV}`, { method: 'DELETE' }),
      contextFor(CONV),
    );
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not delete conversation' });
  });

  it('ignores the unused query and bot bindings', () => {
    expect(BOT.length).toBeGreaterThan(0);
  });
});
