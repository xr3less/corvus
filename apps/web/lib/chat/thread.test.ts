// Unit tests for the shared chat-thread primitives. Pure functions only —
///network and provider behavior stay in the stream/route suites.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_UNAVAILABLE_NOTICE } from '../conversations/client';
import {
  BRIEF_MAX_CHARS,
  chatBotId,
  ensureConversationForBot,
  formatCredits,
  HISTORY_MAX_ROWS,
  historyBefore,
  overlayDraft,
  parseSseFrame,
  PERSISTED_TURNS_CAP,
  persistThreadTurns,
  readHttpError,
  rehydrateThread,
  stitchBrief,
  threadHistory,
  toChatStreamEvent,
  toPersistedTurns,
  toThreadRow,
  type ThreadRow,
} from './thread';

const NOTICE = 'Conversation history unavailable — new messages still send.';
const BOT = '11111111-2222-4333-8444-555555555555';
const CONV = '22222222-3333-4444-8555-666666666666';

function okJson(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function userRow(id: string, text: string): ThreadRow {
  return {
    id,
    role: 'user',
    text,
    attachmentCount: 0,
  };
}

function doneRow(id: string, text: string): ThreadRow {
  return { ...userRow(id, text), role: 'assistant', status: 'done', startedAt: 1, finishedAt: 2 };
}

describe('toChatStreamEvent', () => {
  it('accepts reasoning/content/done/error shapes and rejects the rest', () => {
    expect(toChatStreamEvent({ t: 'reasoning', text: 'hmm' })).toEqual({
      t: 'reasoning',
      text: 'hmm',
    });
    expect(toChatStreamEvent({ t: 'content', text: 'hi' })).toEqual({ t: 'content', text: 'hi' });
    expect(toChatStreamEvent({ t: 'done', credits: 0.5 })).toEqual({ t: 'done', credits: 0.5 });
    expect(toChatStreamEvent({ t: 'done', credits: 0, note: 'usage-unavailable' })).toEqual({
      t: 'done',
      credits: 0,
      note: 'usage-unavailable',
    });
    expect(toChatStreamEvent({ t: 'error', message: 'boom' })).toEqual({
      t: 'error',
      message: 'boom',
    });
    for (const bad of [
      null,
      'x',
      {},
      { t: 'done', credits: 'lots' },
      { t: 'content' },
      { t: 'nope' },
    ]) {
      expect(toChatStreamEvent(bad)).toBeNull();
    }
  });
});

describe('parseSseFrame', () => {
  it('parses data frames and ignores empty/non-data frames', () => {
    expect(parseSseFrame('data: {"t":"content","text":"hi"}\n\n')).toEqual({
      t: 'content',
      text: 'hi',
    });
    expect(parseSseFrame('\n\n')).toBeNull();
    expect(parseSseFrame(': keep-alive\n\n')).toBeNull();
    expect(parseSseFrame('data: {broken\n\n')).toBeNull();
  });
});

describe('formatCredits', () => {
  it('trims trailing zeros to three decimals', () => {
    expect(formatCredits(1.1)).toBe('1.1');
    expect(formatCredits(0.075)).toBe('0.075');
    expect(formatCredits(0)).toBe('0');
  });
});

describe('readHttpError', () => {
  it('says logged-out in plain words on 401', async () => {
    const res = new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    expect(await readHttpError(res)).toBe('You are logged out — log in again, then press Retry.');
  });

  it('keeps the logged-out line even when the 401 body carries a message', async () => {
    const res = new Response(JSON.stringify({ error: 'unauthorized', message: 'nope' }), {
      status: 401,
    });
    expect(await readHttpError(res)).toBe('You are logged out — log in again, then press Retry.');
  });

  /* F15: a code-only body no longer reaches the screen. 'busy' is not a code the
     Turkish refusal table knows, so the reader's unknown-code branch renders the
     generic sentence instead of the raw machine token. */
  it('renders the refusal generic for an unknown code, generic otherwise', async () => {
    const withText = new Response(JSON.stringify({ error: 'busy' }), { status: 500 });
    expect(await readHttpError(withText)).toBe('İstek tamamlanamadı — tekrar dene.');
    const empty = new Response('nope', { status: 500 });
    expect(await readHttpError(empty)).toBe('The reply stopped unexpectedly. Try again.');
  });

  /* KI-033: the refusal body is { error: <code>, message: <sentence> }. The
     sentence is what the person must read — the code is a machine token. */
  it('prefers message over error when both are present', async () => {
    const res = new Response(
      JSON.stringify({
        error: 'trial_expired',
        message: 'Your 3-day trial ended — your bots are paused. Nothing is deleted.',
      }),
      { status: 403 },
    );
    expect(await readHttpError(res)).toBe(
      'Your 3-day trial ended — your bots are paused. Nothing is deleted.',
    );
  });

  it('renders the locked allowance sentence byte-identical', async () => {
    const res = new Response(
      JSON.stringify({
        error: 'trial_budget_exceeded',
        message: 'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.',
      }),
      { status: 403 },
    );
    expect(await readHttpError(res)).toBe(
      'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.',
    );
  });

  it('resolves the error code when message is absent, empty, or whitespace', async () => {
    const absent = new Response(JSON.stringify({ error: 'busy' }), { status: 403 });
    expect(await readHttpError(absent)).toBe('İstek tamamlanamadı — tekrar dene.');
    const blank = new Response(JSON.stringify({ error: 'busy', message: '   ' }), { status: 403 });
    expect(await readHttpError(blank)).toBe('İstek tamamlanamadı — tekrar dene.');
    const nonString = new Response(JSON.stringify({ error: 'busy', message: 42 }), { status: 403 });
    expect(await readHttpError(nonString)).toBe('İstek tamamlanamadı — tekrar dene.');
  });

  it('keeps the generic line when the body carries neither field', async () => {
    const onlyMessage = new Response(JSON.stringify({ message: '   ' }), { status: 500 });
    expect(await readHttpError(onlyMessage)).toBe('The reply stopped unexpectedly. Try again.');
    const neither = new Response(JSON.stringify({ detail: 'x' }), { status: 500 });
    expect(await readHttpError(neither)).toBe('The reply stopped unexpectedly. Try again.');
  });
});

describe('chatBotId', () => {
  it('passes uuids through and coerces display ids to null', () => {
    expect(chatBotId('11111111-2222-4333-8444-555555555555')).toBe(
      '11111111-2222-4333-8444-555555555555',
    );
    expect(chatBotId('bot-3')).toBeNull();
    expect(chatBotId(null)).toBeNull();
    expect(chatBotId(undefined)).toBeNull();
  });
});

describe('threadHistory', () => {
  it('keeps completed turns, drops in-flight/empty/error rows, caps the tail', () => {
    const rows: ThreadRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(userRow(`u-${i}`, `q${i}`));
      rows.push(doneRow(`a-${i}`, `a${i}`));
    }
    rows.push({ ...userRow('thinking-1', ''), role: 'assistant', status: 'thinking' });
    rows.push({ ...userRow('error-1', ''), role: 'assistant', status: 'error', error: 'boom' });
    const history = threadHistory(rows);
    expect(history).toHaveLength(HISTORY_MAX_ROWS);
    expect(history[0]).toEqual({ role: 'user', content: 'q4' });
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: 'a9' });
  });
});

describe('historyBefore', () => {
  it('excludes the failed pair so a retry sends the text once', () => {
    const rows = [userRow('u-1', 'q1'), doneRow('a-1', 'a1'), userRow('u-2', 'q2')];
    const failed = {
      ...userRow('a-2', ''),
      role: 'assistant' as const,
      status: 'error' as const,
      error: 'boom',
      sourceText: 'q2',
    };
    expect(historyBefore([...rows, failed], 'a-2')).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ]);
    expect(historyBefore(rows, 'missing')).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
  });
});

describe('stitchBrief', () => {
  it('exposes the 2000-char clamp that mirrors the builder route rule', () => {
    expect(BRIEF_MAX_CHARS).toBe(2000);
  });

  it('stitches user turns in send order, trimmed', () => {
    expect(stitchBrief([userRow('u-1', '  welcome newcomers  '), userRow('u-2', 'add XP')])).toBe(
      'welcome newcomers\nadd XP',
    );
  });

  it('skips assistant and empty rows, appends the live composer text', () => {
    expect(
      stitchBrief(
        [userRow('u-1', 'first'), doneRow('a-1', 'model prose'), userRow('u-2', '   ')],
        '  composer line  ',
      ),
    ).toBe('first\ncomposer line');
  });

  it('ignores a blank composer and returns empty when nothing remains', () => {
    expect(stitchBrief([doneRow('a-1', 'model prose')], '   ')).toBe('');
    expect(stitchBrief([])).toBe('');
  });

  it('clamps to maxChars and trims the seam', () => {
    expect(stitchBrief([userRow('u-1', 'abcdef')], undefined, 4)).toBe('abcd');
    expect(stitchBrief([userRow('u-1', 'ab'), userRow('u-2', 'cd')], undefined, 5)).toBe('ab\ncd');
  });
});

describe('persistence wiring (wave1b2a, fail-closed)', () => {
  it('exposes the single allowed failure sentence, byte-identical', () => {
    expect(HISTORY_UNAVAILABLE_NOTICE).toBe(NOTICE);
    expect(PERSISTED_TURNS_CAP).toBe(50);
  });

  it('ensureConversationForBot persists the coerced botId first and returns it intact', async () => {
    const fetchStub = vi.fn(async () => okJson({ conversationId: CONV }));
    vi.stubGlobal('fetch', fetchStub);
    const result = await ensureConversationForBot(BOT);
    expect(result).toEqual({ ok: true, conversationId: CONV, botId: BOT });
    const [, init] = fetchStub.mock.calls[0] as unknown as [unknown, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ botId: BOT });
  });

  it('ensureConversationForBot coerces a display id to null before the POST', async () => {
    const fetchStub = vi.fn(async () => okJson({ conversationId: CONV }));
    vi.stubGlobal('fetch', fetchStub);
    const result = await ensureConversationForBot('bot-3');
    expect(result).toEqual({ ok: true, conversationId: CONV, botId: null });
    const [, init] = fetchStub.mock.calls[0] as unknown as [unknown, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ botId: null });
  });

  it('ensureConversationForBot fails closed keeping the botId — the send lane continues', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const result = await ensureConversationForBot(BOT);
    expect(result).toEqual({ ok: false, botId: BOT, status: null, notice: NOTICE });
  });

  it('rehydrateThread rehydrates the persisted window with ids intact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          turns: [
            { id: 't-1', role: 'user', text: 'hi' },
            { id: 't-2', role: 'assistant', text: 'hello' },
          ],
        }),
      ),
    );
    const result = await rehydrateThread(CONV);
    expect(result).toEqual({
      ok: true,
      rows: [
        { id: 't-1', role: 'user', text: 'hi', attachmentCount: 0 },
        { id: 't-2', role: 'assistant', text: 'hello', attachmentCount: 0, status: 'done' },
      ],
      truncated: false,
    });
  });

  it('rehydrateThread caps the window at 50 and flags the honest truncation', async () => {
    const turns = Array.from({ length: 60 }, (_, i) => ({
      id: `t-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `m${i}`,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ turns, note: 'older-history-truncated' })),
    );
    const result = await rehydrateThread(CONV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(50);
      expect(result.rows[0]).toEqual(expect.objectContaining({ id: 't-10', text: 'm10' }));
      expect(result.truncated).toBe(true);
    }
  });

  it('rehydrateThread adds no verdict row and never re-posts — read-only refresh', async () => {
    const fetchStub = vi.fn(async () => okJson({ turns: [] }));
    vi.stubGlobal('fetch', fetchStub);
    await rehydrateThread(CONV);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const first = fetchStub.mock.calls[0] as unknown as [unknown, unknown?];
    expect(first[1]).toBeUndefined();
  });

  it('rehydrateThread fails closed with the single allowed notice, rows empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const result = await rehydrateThread(CONV);
    expect(result).toEqual({ ok: false, rows: [], truncated: false, status: null, notice: NOTICE });
  });

  it('overlayDraft renders the local draft OVER history without mutating either input', () => {
    const persisted = [userRow('t-1', 'old')];
    const draft = [userRow('local-1', 'draft text')];
    const rows = overlayDraft(persisted, draft);
    expect(rows.map((row) => row.id)).toEqual(['t-1', 'local-1']);
    expect(persisted).toHaveLength(1);
    expect(draft).toHaveLength(1);
  });

  it('toThreadRow keeps ids byte-identical so a verdict guard never re-fires after refresh', () => {
    const user = toThreadRow({ id: 'u-9', role: 'user', text: 'evet' });
    expect(user).toEqual({ id: 'u-9', role: 'user', text: 'evet', attachmentCount: 0 });
    const assistant = toThreadRow({ id: 'a-9', role: 'assistant', text: 'plan' });
    expect(assistant).toEqual({
      id: 'a-9',
      role: 'assistant',
      text: 'plan',
      attachmentCount: 0,
      status: 'done',
    });
  });

  it('toPersistedTurns skips in-flight/empty/error rows and caps 2000 chars', () => {
    const rows: ThreadRow[] = [
      userRow('u-1', '  keep  '),
      userRow('u-blank', '   '),
      {
        ...userRow('thinking-1', ''),
        role: 'assistant',
        status: 'thinking',
      },
      {
        ...userRow('error-1', ''),
        role: 'assistant',
        status: 'error',
        error: 'boom',
        sourceText: 'keep',
      },
      doneRow('a-1', 'reply'),
      userRow('u-long', `x`.repeat(2500)),
    ];
    const turns = toPersistedTurns(rows);
    expect(turns).toEqual([
      { role: 'user', text: 'keep' },
      { role: 'assistant', text: 'reply' },
      { role: 'user', text: `x`.repeat(2000) },
    ]);
  });

  it('persistThreadTurns appends completed rows and skips empty batches without a fetch', async () => {
    const fetchStub = vi.fn(async () => okJson({ saved: 2, turns: [] }));
    vi.stubGlobal('fetch', fetchStub);
    const stored = await persistThreadTurns(CONV, [userRow('u-1', 'hi'), doneRow('a-1', 'hello')]);
    expect(stored).toEqual({ ok: true, saved: 2 });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('persistThreadTurns reads an empty batch as zero saved, not a failure', async () => {
    const fetchStub = vi.fn(async () => okJson({ saved: 1, turns: [] }));
    vi.stubGlobal('fetch', fetchStub);
    const stored = await persistThreadTurns(CONV, []);
    expect(stored).toEqual({ ok: true, saved: 0 });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('persistThreadTurns fails closed so the message still sends locally', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const stored = await persistThreadTurns(CONV, [userRow('u-1', 'hi')]);
    expect(stored).toEqual({ ok: false, status: null, notice: NOTICE });
  });
});
