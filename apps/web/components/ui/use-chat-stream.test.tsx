'use client';

/* Tests for the chat stream hook: submit/stream/retry/lock through a stubbed
   SSE fetch. Provider behavior stays in the stream/route suites. Persistence
   (wave1b2c) runs through the real thread helpers against the same fetch stub:
   POST /api/conversations opens the thread BEFORE POST /api/chat, the reply
   streams, then POST /api/conversations/[id] appends the completed turns.
   Failing history answers the single honest notice and the send lane continues. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ATTACHMENTS_UNSUPPORTED, useChatStream } from './use-chat-stream';

const CONV = '22222222-3333-4444-8555-666666666666';
const DOWN_NOTICE = 'Conversation history unavailable — new messages still send.';

let consoleError: ReturnType<typeof vi.spyOn>;

function sseStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(inner) {
      controller = inner;
    },
  });
  return {
    stream,
    push(text: string) {
      controller?.enqueue(encoder.encode(text));
    },
    close() {
      controller?.close();
    },
  };
}

function streamResponse(stream: ReadableStream<Uint8Array>) {
  return { ok: true, status: 200, body: stream, json: async () => ({}) };
}

/* History-aware fetch stub: conversation opens resolve { conversationId },
   appends resolve { saved }, and every other path (here: /api/chat) answers
   from the queued `chat` responses. Calls are recorded so tests pin the
   ordering contract — POST /api/conversations BEFORE POST /api/chat. */
function stubHistory(chat: unknown[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const queue = [...chat];
  const stub = vi.fn(async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') {
      return Response.json({ conversationId: CONV });
    }
    if (href === `/api/conversations/${CONV}` && init?.method === 'POST') {
      return Response.json({ saved: 2 });
    }
    const next = queue.shift();
    /* istanbul ignore next: every test queues exactly the /api/chat answers it
       triggers; an empty queue means the hook fetched where no test expected. */
    if (next === undefined) throw new Error(`unexpected fetch to ${href}`);
    if (next instanceof Response) return next;
    return next as Response;
  });
  vi.stubGlobal('fetch', stub);
  return { stub, calls };
}

function chatBody(call: { url: string; init?: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? '{}')) as Record<string, unknown>;
}

function frame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  );
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

describe('useChatStream', () => {
  it('submits user + thinking rows and streams the reply to done', async () => {
    const sse = sseStream();
    const { stub, calls } = stubHistory([streamResponse(sse.stream)]);
    const { result } = renderHook(() => useChatStream(null));

    act(() => {
      result.current.submit('Hello', []);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      text: 'Hello',
      attachmentCount: 0,
    });
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', status: 'thinking' });
    expect(result.current.streaming).toBe(true);
    /* Ordering contract (thread.ts:175-176): the coerced botId is persisted
       BEFORE the send lane runs — the open POST precedes /api/chat. */
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/api/chat')).toBe(true);
    });
    const chatCalls = calls.filter((call) => call.url === '/api/chat');
    const openIdx = calls.findIndex((call) => call.url === '/api/conversations');
    const chatIdx = calls.findIndex((call) => call.url === '/api/chat');
    expect(openIdx).toBeGreaterThanOrEqual(0);
    expect(openIdx).toBeLessThan(chatIdx);
    expect(chatCalls).toHaveLength(1);
    expect(chatBody(chatCalls[0])).toEqual({ botId: null, message: 'Hello', history: [] });
    expect(stub).toHaveBeenCalledWith(
      '/api/conversations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ botId: null }),
      }),
    );

    await act(async () => {
      sse.push(frame({ t: 'reasoning', text: 'weighing' }));
      sse.push(frame({ t: 'content', text: 'Hi.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    const assistant = result.current.messages[1];
    expect(assistant).toMatchObject({
      role: 'assistant',
      status: 'done',
      text: 'Hi.',
      reasoning: 'weighing',
      credits: 0.05,
    });
    /* No verdict re-POST on this path: the hook only opens the conversation,
       sends the chat turn, and appends completed turns — nothing touches
       /api/builder/verdict. */
    expect(calls.some((call) => call.url === '/api/builder/verdict')).toBe(false);
    expect(result.current.conversationId).toBe(CONV);
    expect(result.current.historyNotice).toBeNull();
    /* Completed turns are appended best-effort after the stream settles. */
    await waitFor(() => {
      expect(calls.some((call) => call.url === `/api/conversations/${CONV}`)).toBe(true);
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('coerces a mock bot id to null and retries an errored row in place', async () => {
    const failing = { ok: false, status: 500, json: async () => ({ error: 'busy' }) };
    const sse = sseStream();
    const { stub, calls } = stubHistory([
      failing as unknown as Response,
      streamResponse(sse.stream),
    ]);
    const { result } = renderHook(() => useChatStream('bot-3'));

    act(() => {
      result.current.submit('Hello', []);
    });
    await waitFor(() =>
      expect(result.current.messages.find((row) => row.role === 'assistant')?.status).toBe('error'),
    );
    const chatCalls = calls.filter((call) => call.url === '/api/chat');
    expect(chatCalls).toHaveLength(1);
    expect(chatBody(chatCalls[0]).botId).toBeNull();
    /* The open POST carried the coerced null — a display id never travels. */
    const openCall = calls.find((call) => call.url === '/api/conversations');
    expect(openCall).toBeTruthy();
    expect(chatBody(openCall as { url: string; init?: RequestInit }).botId).toBeNull();

    const assistantId = result.current.messages[1].id;
    act(() => {
      result.current.retry(assistantId);
    });
    await waitFor(() => {
      expect(calls.filter((call) => call.url === '/api/chat')).toHaveLength(2);
    });
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Recovered.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() =>
      expect(result.current.messages.find((row) => row.id === assistantId)?.text).toBe(
        'Recovered.',
      ),
    );
    expect(result.current.messages.filter((row) => row.role === 'user')).toHaveLength(1);
    expect(stub).toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ignores empty submits and resets the thread', () => {
    const { result } = renderHook(() => useChatStream(null));
    act(() => {
      result.current.submit('   ', []);
    });
    expect(result.current.messages).toHaveLength(0);
    act(() => {
      result.current.submit('Hi', []);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      text: 'Hi',
      attachmentCount: 0,
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.streaming).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* M-6: POST /api/chat validates { botId, message, history } and nothing
     else, so a turn carrying files cannot travel. The hook is the second site
     of that class after the composer — it must refuse in words rather than
     record a count that never leaves the browser. */
  describe('attachments (M-6)', () => {
    it('an image-only submit is refused in words, posts nothing, and is never silent', () => {
      const fetchStub = vi.fn();
      vi.stubGlobal('fetch', fetchStub);
      const { result } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('', [new File(['a'], 'a.png', { type: 'image/png' })]);
      });

      /* The old behaviour returned early and left the screen untouched: the
         submit vanished. Now a row pair exists and the assistant row says
         exactly why nothing was sent. */
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toMatchObject({ role: 'user', text: '' });
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        status: 'error',
        error: ATTACHMENTS_UNSUPPORTED,
      });
      expect(fetchStub).not.toHaveBeenCalled();
      expect(result.current.streaming).toBe(false);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('a text + attachment submit is refused whole: the text does not travel alone', () => {
      const fetchStub = vi.fn();
      vi.stubGlobal('fetch', fetchStub);
      const { result } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('describe this', [new File(['a'], 'a.png', { type: 'image/png' })]);
      });

      expect(fetchStub).not.toHaveBeenCalled();
      expect(result.current.messages[0]).toMatchObject({
        role: 'user',
        text: 'describe this',
        attachmentCount: 1,
      });
      expect(result.current.messages[1]).toMatchObject({
        status: 'error',
        error: ATTACHMENTS_UNSUPPORTED,
      });
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('a turn with no attachments is unaffected by the guard', async () => {
      const sse = sseStream();
      const { calls } = stubHistory([streamResponse(sse.stream)]);
      const { result } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('plain', []);
      });
      expect(result.current.messages[1]).toMatchObject({ status: 'thinking' });
      await waitFor(() => {
        expect(calls.some((call) => call.url === '/api/chat')).toBe(true);
      });
      await act(async () => {
        sse.push(frame({ t: 'done', credits: 0.05 }));
        sse.close();
      });
      await waitFor(() => expect(result.current.streaming).toBe(false));
    });
  });

  /* Persistence wiring (wave1b2c, fail-closed): the history API is best-effort
     — a down read shows the single honest notice and the send lane continues.
     `stop()` is local-only — it aborts the in-flight chat fetch without
     touching any persistence or verdict path. */
  describe('persistence (wave1b2c)', () => {
    it('chat still sends when the conversation open fails, with the honest notice', async () => {
      const sse = sseStream();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown) => {
          const href = String(url);
          if (href === '/api/conversations') {
            throw new Error('offline');
          }
          if (href.startsWith('/api/conversations/')) {
            throw new Error('offline');
          }
          return streamResponse(sse.stream);
        }),
      );
      const { result } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('Hello', []);
      });
      await act(async () => {
        sse.push(frame({ t: 'content', text: 'Hi.' }));
        sse.push(frame({ t: 'done', credits: 0.05 }));
        sse.close();
      });
      await waitFor(() => expect(result.current.streaming).toBe(false));
      /* The message landed locally even though persistence is down. */
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        status: 'done',
        text: 'Hi.',
      });
      expect(result.current.conversationId).toBeNull();
      expect(result.current.historyNotice).toBe(DOWN_NOTICE);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('a failed append keeps the rows locally and shows the honest notice', async () => {
      const sse = sseStream();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown, init?: RequestInit) => {
          const href = String(url);
          if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') {
            return Response.json({ conversationId: CONV });
          }
          if (href === `/api/conversations/${CONV}` && init?.method === 'POST') {
            return Response.json({ error: 'could not append turns' }, { status: 500 });
          }
          return streamResponse(sse.stream);
        }),
      );
      const { result } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('Hello', []);
      });
      await act(async () => {
        sse.push(frame({ t: 'content', text: 'Hi.' }));
        sse.push(frame({ t: 'done', credits: 0.05 }));
        sse.close();
      });
      await waitFor(() => expect(result.current.streaming).toBe(false));
      expect(result.current.messages[1]).toMatchObject({ status: 'done', text: 'Hi.' });
      expect(result.current.conversationId).toBe(CONV);
      await waitFor(() => expect(result.current.historyNotice).toBe(DOWN_NOTICE));
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('reset during the conversation open never sends chat and unlocks the composer', async () => {
      /* Hold the open POST forever; reset() aborts the pending run, and when
         the ensure resolves nothing may touch /api/chat and the composer must
         accept a fresh submit (guarded unlock, no stuck spinner). */
      let releaseOpen!: (value: Response) => void;
      const openGate = new Promise<Response>((resolve) => {
        releaseOpen = resolve;
      });
      const calls: { url: string; init?: RequestInit }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown, init?: RequestInit) => {
          const href = String(url);
          calls.push({ url: href, init });
          if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') return openGate;
          throw new Error(`unexpected fetch to ${href}`);
        }),
      );
      const { result } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('Hello', []);
      });
      await waitFor(() => {
        expect(calls.some((call) => call.url === '/api/conversations')).toBe(true);
      });
      act(() => {
        result.current.reset();
      });
      await act(async () => {
        releaseOpen(Response.json({ conversationId: CONV }));
      });
      /* No chat POST was launched from the aborted run, and the lock cleared. */
      expect(calls.some((call) => call.url === '/api/chat')).toBe(false);
      expect(result.current.streaming).toBe(false);
      const lockedBefore = result.current.messages.length;

      const sse = sseStream();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown, init?: RequestInit) => {
          const href = String(url);
          if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') {
            return Response.json({ conversationId: CONV });
          }
          if (href === `/api/conversations/${CONV}` && init?.method === 'POST') {
            return Response.json({ saved: 2 });
          }
          if (href === '/api/chat') return streamResponse(sse.stream);
          throw new Error(`unexpected fetch to ${href}`);
        }),
      );
      act(() => {
        result.current.submit('Again', []);
      });
      expect(result.current.messages.length).toBeGreaterThan(lockedBefore);
      await act(async () => {
        sse.push(frame({ t: 'content', text: 'Back.' }));
        sse.push(frame({ t: 'done', credits: 0.05 }));
        sse.close();
      });
      await waitFor(() => expect(result.current.streaming).toBe(false));
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('stop() halts the local fetch only — no persistence or verdict call', async () => {
      const sse = sseStream();
      const { calls } = stubHistory([streamResponse(sse.stream)]);
      const { result, unmount } = renderHook(() => useChatStream(null));

      act(() => {
        result.current.submit('Hello', []);
      });
      await waitFor(() => {
        expect(calls.some((call) => call.url === '/api/chat')).toBe(true);
      });
      const chatCallsBefore = calls.filter((call) => call.url === '/api/chat').length;
      act(() => {
        result.current.stop();
      });
      /* stop() is synchronous local teardown: no fetch of its own, no verdict
         POST, no delete — the server build (if any) keeps running. The stubbed
         SSE body is not linked to the abort signal (a real fetch would reject
         the reader), so settle the stream to let the run reach its finally. */
      await act(async () => {
        sse.push(frame({ t: 'done', credits: 0.05 }));
        sse.close();
      });
      await waitFor(() => expect(result.current.streaming).toBe(false));
      expect(calls.filter((call) => call.url === '/api/chat')).toHaveLength(chatCallsBefore);
      expect(calls.some((call) => call.url === '/api/builder/verdict')).toBe(false);
      expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false);
      unmount();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
