'use client';

/* One chat thread's live state machine (D-118): messages, streaming lock,
   submit, retry, reset, and abort. Both chat pages use it — the detail page
   with its selected bot id, the creation page with null. No rendering here;
   ChatAssistantRow renders the assistant side. */
import { useEffect, useRef, useState } from 'react';
import {
  chatBotId,
  historyBefore,
  parseSseFrame,
  readHttpError,
  threadHistory,
  type ChatStreamEvent,
  type ThreadRow,
} from '@/lib/chat/thread';

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function useChatStream(botId: string | null | undefined) {
  const [messages, setMessages] = useState<ThreadRow[]>([]);
  /* True while a stream is open; the composer locks (inert) and a second
     submit is refused. The ref is the synchronous guard, the state drives
     the render. */
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const messageSeq = useRef(0);
  const botIdRef = useRef(botId);
  botIdRef.current = botId;

  function patchMessage(id: string, patch: (row: ThreadRow) => ThreadRow) {
    setMessages((prev) => prev.map((row) => (row.id === id ? patch(row) : row)));
  }

  /* Fold one streamed event into its assistant row. Returns true when the
     stream is finished (done/error). */
  function applyStreamEvent(id: string, event: ChatStreamEvent): boolean {
    if (event.t === 'reasoning') {
      patchMessage(id, (row) => ({ ...row, reasoning: `${row.reasoning ?? ''}${event.text}` }));
      return false;
    }
    if (event.t === 'content') {
      patchMessage(id, (row) => ({
        ...row,
        status: 'answering',
        text: `${row.text}${event.text}`,
      }));
      return false;
    }
    if (event.t === 'done') {
      patchMessage(id, (row) => ({
        ...row,
        status: 'done',
        credits: event.credits,
        creditsUnavailable: event.note === 'usage-unavailable',
        finishedAt: Date.now(),
      }));
      return true;
    }
    patchMessage(id, (row) => ({ ...row, status: 'error', error: event.message }));
    return true;
  }

  /* One POST /api/chat read as an SSE stream onto the assistant row `id`. No
     timers: every visible change is an event that actually arrived. */
  async function runStream(assistantId: string, userText: string, history: ChatHistoryTurn[]) {
    if (streamingRef.current) return;
    const controller = new AbortController();
    streamAbortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId: chatBotId(botIdRef.current), message: userText, history }),
        signal: controller.signal,
      });
      if (!response.ok || response.body === null) {
        const message = await readHttpError(response);
        patchMessage(assistantId, (row) => ({ ...row, status: 'error', error: message }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseSseFrame(frame);
          if (event !== null) finished = applyStreamEvent(assistantId, event);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        patchMessage(assistantId, (row) => ({
          ...row,
          status: 'error',
          error: 'The reply stopped unexpectedly. Try again.',
        }));
      }
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
    }
  }

  function submit(value: string, attachments: File[]) {
    if (streamingRef.current) return;
    const text = value.trim();
    if (text === '') return;
    const userId = `msg-${messageSeq.current++}`;
    const assistantId = `msg-${messageSeq.current++}`;
    const history = threadHistory(messages);
    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        text,
        attachmentCount: attachments.length,
      },
      {
        id: assistantId,
        role: 'assistant',
        text: '',
        attachmentCount: 0,
        status: 'thinking',
        reasoning: '',
        sourceText: text,
        startedAt: Date.now(),
      },
    ]);
    void runStream(assistantId, text, history);
  }

  /* Re-send an errored reply's original text on the same row, so the thread
     keeps one user row and one assistant row. */
  function retry(id: string) {
    if (streamingRef.current) return;
    const row = messages.find((entry) => entry.id === id);
    if (!row || row.role !== 'assistant' || row.sourceText === undefined) return;
    const text = row.sourceText;
    const history = historyBefore(messages, id);
    patchMessage(id, (current) => ({
      ...current,
      status: 'thinking',
      text: '',
      reasoning: '',
      error: undefined,
      credits: undefined,
      startedAt: Date.now(),
      finishedAt: undefined,
    }));
    void runStream(id, text, history);
  }

  function reset() {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    streamingRef.current = false;
    setStreaming(false);
    setMessages([]);
  }

  /* Leaving (unmount or bot switch) cancels any stream in flight: the
     AbortController tears down the fetch here and the server's
     request.signal on the other end. */
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, [botId]);

  return { messages, streaming, submit, retry, reset };
}
