'use client';

/* One chat thread's live state machine (D-118): messages, streaming lock,
   submit, retry, reset, and abort. Both chat pages use it — the detail page
   with its selected bot id, the creation page with null. No rendering here;
   ChatAssistantRow renders the assistant side. */
import { useEffect, useRef, useState } from 'react';
import {
  chatBotId,
  ensureConversationForBot,
  historyBefore,
  parseSseFrame,
  persistThreadTurns,
  readHttpError,
  threadHistory,
  type ChatStreamEvent,
  type ThreadRow,
} from '@/lib/chat/thread';

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/* M-6 defence in depth. The composer refuses an attachment-carrying submit
   first, but this hook is the second site of the same class: POST /api/chat
   validates { botId, message, history } and nothing else, and the persona
   lane's first route (wiro glm/5-2) is text-only by the provider's own spec.
   A caller that hands this hook files therefore gets the turn refused in
   words — never a recorded count that does not travel and never a silently
   destroyed image-only submit. */
export const ATTACHMENTS_UNSUPPORTED =
  'Image sending is not connected yet, so this turn was not sent. Remove the images and try again.';

export function useChatStream(botId: string | null | undefined) {
  const [messages, setMessages] = useState<ThreadRow[]>([]);
  /* True while a stream is open; the composer locks (inert) and a second
     submit is refused. The ref is the synchronous guard, the state drives
     the render. */
  const [streaming, setStreaming] = useState(false);
  /* Conversation persistence (wave1b2c, fail-closed over lib/chat/thread.ts).
     `conversationId` names the server thread the completed turns are appended
     to; `historyNotice` carries the single honest down-path sentence while the
     local thread keeps working. Ordering contract (thread.ts:175-176): the
     ensure call is awaited BEFORE the verdict effect runs — the coerced botId
     is persisted via POST /api/conversations first, so a refresh never
     re-judges a stale verdict with a lost botId. The send lane never blocks on
     persistence: a failed ensure/persist only sets the notice. */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const streamingRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const messageSeq = useRef(0);
  const botIdRef = useRef(botId);
  botIdRef.current = botId;
  /* Synchronous mirror of `messages` for the persist tail: the finally block
     above runs after the last streamed event's setState queued but before the
     re-render commits, so reading state there would persist the pre-stream
     rows. Every writer below appends through this ref first. */
  const messagesRef = useRef<ThreadRow[]>([]);
  function setRows(next: ThreadRow[] | ((prev: ThreadRow[]) => ThreadRow[])) {
    const value = typeof next === 'function' ? next(messagesRef.current) : next;
    messagesRef.current = value;
    setMessages(value);
  }
  /* One in-flight ensure per bot id: concurrent submits while the POST is open
     share the same promise instead of opening duplicate conversations. The key
     is the RAW id (not the coerced one) so a verdict-scoping change always
     re-ensures. Verified by the persist-ordering test (POST before /api/chat). */
  const ensureRef = useRef<{ key: string; promise: Promise<string | null> } | null>(null);

  /* Opens (or reuses the in-flight) server conversation for the current bot.
     Returns the conversationId, or null when persistence is down — and then the
     honest notice is set once so the page can say so without blocking sends. */
  function ensureConversation(): Promise<string | null> {
    const raw = botIdRef.current;
    const key = raw ?? '';
    const inFlight = ensureRef.current;
    if (inFlight !== null && inFlight.key === key) return inFlight.promise;
    const promise = ensureConversationForBot(raw).then((opened) => {
      if (opened.ok) {
        setConversationId(opened.conversationId);
        return opened.conversationId;
      }
      setHistoryNotice((current) => current ?? opened.notice);
      return null;
    });
    ensureRef.current = { key, promise };
    return promise;
  }

  function patchMessage(id: string, patch: (row: ThreadRow) => ThreadRow) {
    setRows((prev) => prev.map((row) => (row.id === id ? patch(row) : row)));
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
     timers: every visible change is an event that actually arrived. The
     conversation ensure is awaited FIRST (ordering contract above): the
     coerced botId lands on the server before /api/chat and before the page's
     verdict effect reads the rows — so a refresh never re-judges a stale
     verdict with a lost botId. Persistence is best-effort: a down history
     read only sets the honest notice, the send lane continues. */
  async function runStream(assistantId: string, userText: string, history: ChatHistoryTurn[]) {
    if (streamingRef.current) return;
    const conversationReady = ensureConversation();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    const persistedId = await conversationReady;
    /* Aborted (reset/stop/unmount) while the ensure was in flight: leave the
       rows as they are and never touch the network. The early return skips the
       try/finally below, so unlock here — guarded so a newer run started after
       a reset keeps its own lock (a reset-then-resubmit moves the abort ref to
       the new controller, or clears it with streaming already false). */
    if (controller.signal.aborted) {
      if (streamAbortRef.current === null || streamAbortRef.current === controller) {
        streamAbortRef.current = null;
        streamingRef.current = false;
        setStreaming(false);
      }
      return;
    }
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
      /* Best-effort append of the finished rows. Skipped when the stream died
         before its first event landed (nothing completed), when persistence is
         down (no id — the notice is already set), or when the run was aborted
         locally (stop/reset/unmount — a local halt must not write). A failed
         persist only sets the honest notice; the local rows stay. */
      if (persistedId !== null && !controller.signal.aborted) {
        void persistThreadTurns(persistedId, messagesRef.current).then((stored) => {
          if (!stored.ok) setHistoryNotice((current) => current ?? stored.notice);
        });
      }
      streamingRef.current = false;
      setStreaming(false);
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
    }
  }

  function submit(value: string, attachments: File[]) {
    if (streamingRef.current) return;
    const text = value.trim();
    if (text === '' && attachments.length === 0) return;
    /* A turn carrying files cannot be transmitted (see
       ATTACHMENTS_UNSUPPORTED). Refuse it as an errored assistant row rather
       than posting a body that silently drops them, and rather than returning
       early — a silent no-op is exactly the destroyed-submit defect this
       guards. Nothing was sent, and the row says so. */
    if (attachments.length > 0) {
      const userId = `msg-${messageSeq.current++}`;
      const assistantId = `msg-${messageSeq.current++}`;
      setRows((prev) => [
        ...prev,
        { id: userId, role: 'user', text, attachmentCount: attachments.length },
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          attachmentCount: 0,
          status: 'error',
          error: ATTACHMENTS_UNSUPPORTED,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        },
      ]);
      return;
    }
    const userId = `msg-${messageSeq.current++}`;
    const assistantId = `msg-${messageSeq.current++}`;
    const history = threadHistory(messagesRef.current);
    setRows((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        text,
        attachmentCount: 0,
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
    const row = messagesRef.current.find((entry) => entry.id === id);
    if (!row || row.role !== 'assistant' || row.sourceText === undefined) return;
    const text = row.sourceText;
    const history = historyBefore(messagesRef.current, id);
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
    setRows([]);
  }

  /* Local-only halt (wave-4 stop contract): aborts the in-flight /api/chat
     fetch and unlocks the composer. The server build — if the page started one
     through the verdict path — keeps running; no verdict/build request is
     touched here, and no copy here claims otherwise. */
  function stop() {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
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

  return { messages, streaming, submit, retry, reset, stop, conversationId, historyNotice };
}
