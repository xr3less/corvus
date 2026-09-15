'use client';

/* Tests for the chat stream hook: submit/stream/retry/lock through a stubbed
   SSE fetch. Provider behavior stays in the stream/route suites. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChatStream } from './use-chat-stream';

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
    const fetchStub = vi.fn().mockResolvedValue(streamResponse(sse.stream));
    vi.stubGlobal('fetch', fetchStub);
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
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ botId: null, message: 'Hello', history: [] }),
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
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('coerces a mock bot id to null and retries an errored row in place', async () => {
    const failing = { ok: false, status: 500, json: async () => ({ error: 'busy' }) };
    const sse = sseStream();
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(failing)
      .mockResolvedValueOnce(streamResponse(sse.stream));
    vi.stubGlobal('fetch', fetchStub);
    const { result } = renderHook(() => useChatStream('bot-3'));

    act(() => {
      result.current.submit('Hello', []);
    });
    await waitFor(() =>
      expect(result.current.messages.find((row) => row.role === 'assistant')?.status).toBe('error'),
    );
    const firstBody = JSON.parse(String(fetchStub.mock.calls[0][1]?.body));
    expect(firstBody.botId).toBeNull();

    const assistantId = result.current.messages[1].id;
    act(() => {
      result.current.retry(assistantId);
    });
    expect(fetchStub).toHaveBeenCalledTimes(2);
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
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ignores empty submits and resets the thread', () => {
    const { result } = renderHook(() => useChatStream(null));
    act(() => {
      result.current.submit('   ', []);
    });
    expect(result.current.messages).toHaveLength(0);
    act(() => {
      result.current.submit('Hi', [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      text: 'Hi',
      attachmentCount: 2,
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.streaming).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
