// Tests for POST + GET /api/conversations (Wave 1).
//
// Hermetic fake-pool shape tests only (no database): auth-first, POST with
// null or owned uuid botId returns a conversationId, malformed botId is 422,
// foreign and soft-deleted bots are 404, GET scopes rows to the caller, and a
// pool failure answers an honest 500 — never a fabricated row.

import { afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DatabaseNotConfiguredError, __resetPool, __setPool } from '../../../lib/db/pool';
import type { SessionReader } from '../../../lib/interview/session-bind';
import {
  CONVERSATIONS_MAX_LIST,
  GET,
  POST,
  __resetSessionReader,
  __setSessionReader,
} from './route';

const ACCOUNT = 'acct-owner';
const OTHER = 'acct-other';
const BOT = '11111111-2222-4333-8444-555555555555';
const CONV = '22222222-3333-4444-8555-666666666666';

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

interface BotSeed {
  id: string;
  accountId: string;
  deleted?: boolean;
}

interface ConvSeed {
  id: string;
  accountId: string;
  botId: string | null;
  title: string | null;
  updatedAt: string;
}

function fakePool(bots: BotSeed[], convs: ConvSeed[]): Pool & { queries: string[] } {
  const queries: string[] = [];
  let minted = 0;
  const pool = {
    queries,
    query: async (text: string, params: unknown[] = []) => {
      queries.push(text);
      if (text.includes('FROM bots')) {
        const rows = bots
          .filter(
            (bot) => bot.id === params[0] && bot.accountId === params[1] && bot.deleted !== true,
          )
          .map(() => ({}));
        return { rows, rowCount: rows.length };
      }
      if (text.includes('INSERT INTO conversations')) {
        minted += 1;
        return { rows: [{ id: `${CONV.slice(0, CONV.length - 1)}${minted}` }], rowCount: 1 };
      }
      if (text.includes('FROM conversations')) {
        const rows = convs
          .filter((conv) => conv.accountId === params[0])
          .slice(0, params[1] as number)
          .map((conv) => ({
            id: conv.id,
            bot_id: conv.botId,
            title: conv.title,
            updated_at: conv.updatedAt,
          }));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool & { queries: string[] };
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

function post(body: unknown): Request {
  return new Request('http://localhost/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('POST /api/conversations', () => {
  it('returns 401 first when there is no session', async () => {
    __setPool(fakePool([], []));
    __setSessionReader(SIGNED_OUT);
    const res = await POST(post({ botId: null }));
    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
  });

  it('opens a conversation with a null botId and returns its id', async () => {
    __setPool(fakePool([], []));
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: null }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(typeof body['conversationId']).toBe('string');
  });

  it('opens a conversation with an owned uuid botId', async () => {
    const pool = fakePool([{ id: BOT, accountId: ACCOUNT }], []);
    __setPool(pool);
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: BOT }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(typeof body['conversationId']).toBe('string');
    expect(pool.queries.some((text) => text.includes('FROM bots'))).toBe(true);
  });

  it('answers 422 for a malformed botId', async () => {
    __setPool(fakePool([], []));
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: 'bot-1' }));
    expect(res.status).toBe(422);
    expect(await readBody(res)).toEqual({ error: 'botId must be a uuid' });
  });

  it('answers 404 — never 403 — for a foreign bot', async () => {
    __setPool(fakePool([{ id: BOT, accountId: OTHER }], []));
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: BOT }));
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'not found' });
  });

  it('answers 404 for a soft-deleted bot', async () => {
    __setPool(fakePool([{ id: BOT, accountId: ACCOUNT, deleted: true }], []));
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: BOT }));
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: 'not found' });
  });

  it('answers an honest 500 when persistence fails', async () => {
    __setPool(failingPool());
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: null }));
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not create conversation' });
  });

  it('maps a missing DATABASE_URL to the canonical 500 shape', async () => {
    __setPool(unconfiguredPool());
    __setSessionReader(SIGNED_IN);
    const res = await POST(post({ botId: null }));
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'database not configured' });
  });
});

describe('GET /api/conversations', () => {
  it('returns 401 first when there is no session', async () => {
    __setPool(fakePool([], []));
    __setSessionReader(SIGNED_OUT);
    const res = await GET(new Request('http://localhost/api/conversations'));
    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
  });

  it('lists only the caller’s own conversations', async () => {
    __setPool(
      fakePool(
        [],
        [
          {
            id: CONV,
            accountId: ACCOUNT,
            botId: BOT,
            title: null,
            updatedAt: '2026-09-25T00:00:00.000Z',
          },
          {
            id: '33333333-4444-4555-8666-777777777777',
            accountId: OTHER,
            botId: null,
            title: null,
            updatedAt: '2026-09-25T00:00:00.000Z',
          },
        ],
      ),
    );
    __setSessionReader(SIGNED_IN);
    const res = await GET(new Request('http://localhost/api/conversations'));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    const conversations = body['conversations'] as { id: string }[];
    expect(conversations.map((conv) => conv.id)).toEqual([CONV]);
  });

  it('answers an honest empty list, never a 404, when the caller has none', async () => {
    __setPool(fakePool([], []));
    __setSessionReader(SIGNED_IN);
    const res = await GET(new Request('http://localhost/api/conversations'));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ conversations: [] });
  });

  it('answers an honest 500 when the list read fails', async () => {
    __setPool(failingPool());
    __setSessionReader(SIGNED_IN);
    const res = await GET(new Request('http://localhost/api/conversations'));
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not load conversations' });
  });

  it('caps the list read', () => {
    expect(CONVERSATIONS_MAX_LIST).toBe(100);
  });
});
