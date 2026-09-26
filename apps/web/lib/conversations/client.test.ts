// Tests for the Wave 1 conversations client (fail-closed typed fetch layer).
//
// fetch-only tests via vi.stubGlobal (no database, no server): open/list shape
// reading, windowed-turns reading with the truncation note, append/delete
// success, and — the load-bearing half — every failure path (network throw,
// non-2xx, malformed body) answering `{ ok: false, notice }` with the ONE
// allowed owner sentence, so callers can fall back locally and keep sending.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_UNAVAILABLE_NOTICE,
  OLDER_HISTORY_NOTE,
  appendTurns,
  deleteConversation,
  getConversationTurns,
  listConversations,
  openConversation,
} from './client';

const CONV = '22222222-3333-4444-8555-666666666666';
const BOT = '11111111-2222-4333-8444-555555555555';

const NOTICE = 'Conversation history unavailable — new messages still send.';

function okJson(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function okStatus(status: number): Response {
  return new Response(null, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('copy freeze', () => {
  it('exposes the single allowed failure sentence, byte-identical', () => {
    expect(HISTORY_UNAVAILABLE_NOTICE).toBe(NOTICE);
    expect(OLDER_HISTORY_NOTE).toBe('older-history-truncated');
  });
});

describe('openConversation', () => {
  it('returns the conversationId on a 200 with a well-formed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ conversationId: CONV })),
    );
    const result = await openConversation(BOT);
    expect(result).toEqual({ ok: true, conversationId: CONV });
  });

  it('opens an account-level conversation with a null botId', async () => {
    const fetchStub = vi.fn(async () => okJson({ conversationId: CONV }));
    vi.stubGlobal('fetch', fetchStub);
    const result = await openConversation(null);
    expect(result).toEqual({ ok: true, conversationId: CONV });
    const [, init] = fetchStub.mock.calls[0] as unknown as [unknown, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ botId: null });
  });

  it('fails closed on a network throw — the send lane keeps the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const result = await openConversation(BOT);
    expect(result).toEqual({ ok: false, status: null, notice: NOTICE });
  });

  it('fails closed with the server status on a non-2xx, never a fabricated id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ error: 'not found' }, 404)),
    );
    const result = await openConversation(BOT);
    expect(result).toEqual({ ok: false, status: 404, notice: NOTICE });
  });

  it('fails closed on a malformed 200 body (no conversationId)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ conversations: [] })),
    );
    const result = await openConversation(BOT);
    expect(result.ok).toBe(false);
  });
});

describe('listConversations', () => {
  it('reads the newest-first list whole', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          conversations: [
            { id: CONV, botId: BOT, title: null, updatedAt: '2026-09-25T00:00:00.000Z' },
          ],
        }),
      ),
    );
    const result = await listConversations();
    expect(result).toEqual({
      ok: true,
      conversations: [{ id: CONV, botId: BOT, title: null, updatedAt: '2026-09-25T00:00:00.000Z' }],
    });
  });

  it('treats the honest empty list as success, never a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ conversations: [] })),
    );
    const result = await listConversations();
    expect(result).toEqual({ ok: true, conversations: [] });
  });

  it('drops malformed rows instead of guessing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          conversations: [
            { id: CONV, botId: BOT, title: null, updatedAt: '2026-09-25T00:00:00.000Z' },
            { id: 42, botId: null, title: null, updatedAt: '2026-09-25T00:00:00.000Z' },
            null,
          ],
        }),
      ),
    );
    const result = await listConversations();
    expect(result).toEqual({
      ok: true,
      conversations: [{ id: CONV, botId: BOT, title: null, updatedAt: '2026-09-25T00:00:00.000Z' }],
    });
  });

  it('fails closed on a 500 read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ error: 'could not load conversations' }, 500)),
    );
    const result = await listConversations();
    expect(result).toEqual({ ok: false, status: 500, notice: NOTICE });
  });

  it('fails closed on a network throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const result = await listConversations();
    expect(result).toEqual({ ok: false, status: null, notice: NOTICE });
  });
});

describe('getConversationTurns', () => {
  it('reads the window and flags truncation only on the server note', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          turns: [{ id: 't-1', role: 'user', text: 'hi' }],
          note: 'older-history-truncated',
        }),
      ),
    );
    const result = await getConversationTurns(CONV);
    expect(result).toEqual({
      ok: true,
      turns: [{ id: 't-1', role: 'user', text: 'hi' }],
      truncated: true,
    });
  });

  it('reads a short thread whole with no truncation flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ turns: [{ id: 't-1', role: 'user', text: 'hi' }] })),
    );
    const result = await getConversationTurns(CONV);
    expect(result).toEqual({
      ok: true,
      turns: [{ id: 't-1', role: 'user', text: 'hi' }],
      truncated: false,
    });
  });

  it('fails fast without a fetch on a malformed id', async () => {
    const fetchStub = vi.fn(async () => okJson({ turns: [] }));
    vi.stubGlobal('fetch', fetchStub);
    const result = await getConversationTurns('not-an-id');
    expect(result).toEqual({ ok: false, status: null, notice: NOTICE });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('fails closed on a 404 with the one allowed sentence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ error: 'not found' }, 404)),
    );
    const result = await getConversationTurns(CONV);
    expect(result).toEqual({ ok: false, status: 404, notice: NOTICE });
  });
});

describe('appendTurns', () => {
  it('reports the saved count on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ saved: 2, turns: [] })),
    );
    const result = await appendTurns(CONV, [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);
    expect(result).toEqual({ ok: true, saved: 2 });
  });

  it('a fully-duplicate POST reads as zero saved, not a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ saved: 0, turns: [] })),
    );
    const result = await appendTurns(CONV, [{ role: 'user', text: 'hi' }]);
    expect(result).toEqual({ ok: true, saved: 0 });
  });

  it('fails closed on a network throw so the caller keeps the turns locally', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const result = await appendTurns(CONV, [{ role: 'user', text: 'hi' }]);
    expect(result).toEqual({ ok: false, status: null, notice: NOTICE });
  });

  it('fails fast without a fetch on a malformed id', async () => {
    const fetchStub = vi.fn(async () => okJson({ saved: 1, turns: [] }));
    vi.stubGlobal('fetch', fetchStub);
    const result = await appendTurns('not-an-id', [{ role: 'user', text: 'hi' }]);
    expect(result).toEqual({ ok: false, status: null, notice: NOTICE });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('deleteConversation', () => {
  it('confirms the delete on { deleted: true }', async () => {
    const fetchStub = vi.fn(async () => okJson({ deleted: true }));
    vi.stubGlobal('fetch', fetchStub);
    const result = await deleteConversation(CONV);
    expect(result).toEqual({ ok: true });
    const [, init] = fetchStub.mock.calls[0] as unknown as [unknown, { method: string }];
    expect(init.method).toBe('DELETE');
  });

  it('a malformed 200 body is a failure — never a confirmed delete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({})),
    );
    const result = await deleteConversation(CONV);
    expect(result.ok).toBe(false);
  });

  it('fails closed on a 404 and on a network throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ error: 'not found' }, 404)),
    );
    expect(await deleteConversation(CONV)).toEqual({ ok: false, status: 404, notice: NOTICE });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await deleteConversation(CONV)).toEqual({ ok: false, status: null, notice: NOTICE });
  });

  it('never throws on a non-JSON error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okStatus(500)),
    );
    const result = await deleteConversation(CONV);
    expect(result).toEqual({ ok: false, status: 500, notice: NOTICE });
  });
});
