// Unit tests for the shared chat-thread primitives. Pure functions only —
///network and provider behavior stay in the stream/route suites.
import { describe, expect, it } from 'vitest';
import {
  BRIEF_MAX_CHARS,
  chatBotId,
  formatCredits,
  HISTORY_MAX_ROWS,
  historyBefore,
  parseSseFrame,
  readHttpError,
  stitchBrief,
  threadHistory,
  toChatStreamEvent,
  type ThreadRow,
} from './thread';

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
