// POST /api/chat { botId?, message, history? } — stream one AI persona reply to the
// bot-detail composer as Server-Sent Events.
//
// Implements the V1-7i locked contract. The persona lane (lib/ai/stream) yields
// { t:'reasoning', text } | { t:'content', text } | { t:'done', credits }; each
// is re-emitted verbatim as one `data: <json>` frame. A failure before the
// stream opens is a plain error status; a failure after the first frame is a
// final { t:'error', message } frame. No path ever emits a canned answer.
//
// Auth/validation mirror app/api/spec/publish/route.ts: an injectable session
// reader (default binds the real lib/auth getSession through session-bind),
// JSON body validation with 422, and an honest 500 when no persona route has a
// key — never a fabricated reply while the model is unreachable.

import { chatStream } from '@/lib/ai/stream';
import type { StreamEvent } from '@/lib/ai/stream';
import { LANES } from '@/lib/ai/lanes';
import { recordSpend, USD_PER_CREDIT } from '@/lib/ai/cost';
import { getPool, mapDbError, __setPool } from '@/lib/db/pool';
import { isUuid } from '@/lib/editor/drafts';
import { defaultSessionReader } from '@/lib/interview/session-bind';

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/simulate/route.ts).
export { __setPool };

export interface ChatSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<ChatSession | null>;
}

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

const MESSAGE_MAX = 2000;

// Mirrors router.ts's buildBody cap: the persona lane is the cheapest lane and
// chat turns are short by design; the cap keeps one reply from running away.
const PERSONA_MAX_TOKENS = 1024;

// The stream reports the lane, not which fallback route answered, so the ledger
// `model` column carries the lane label rather than a guessed provider model.
// `reason` reuses the vocabulary the bot activity feed already maps
// ('persona-run' -> "Persona run"), so the burn renders with the right label.
const PERSONA_LANE = 'persona' as const;
const PERSONA_REASON = 'persona-run';

export interface ValidChat {
  botId: string | null;
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

export type ChatValidation =
  { ok: true; value: ValidChat } | { ok: false; status: 422; error: string };

// Prior turns ride along so the model remembers the thread (OpenCode-style:
// the client owns the transcript and sends a bounded tail with each turn).
// Bounds keep one reply from running away on someone else's long thread.
const HISTORY_MAX_TURNS = 20;

function validateHistory(value: unknown): ValidChat['history'] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'history must be an array';
  if (value.length > HISTORY_MAX_TURNS) {
    return `history must hold at most ${HISTORY_MAX_TURNS} turns`;
  }
  const turns: ValidChat['history'] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return 'history turns must be objects';
    }
    const record = entry as Record<string, unknown>;
    if (record.role !== 'user' && record.role !== 'assistant') {
      return "history turn role must be 'user' or 'assistant'";
    }
    if (typeof record.content !== 'string') {
      return 'history turn content must be a string';
    }
    const content = record.content.trim();
    if (content === '' || content.length > MESSAGE_MAX) {
      return `history turn content must be 1-${MESSAGE_MAX} characters`;
    }
    turns.push({ role: record.role, content });
  }
  return turns;
}

// `botId` is optional (the detail composer may not have one yet); a malformed
// botId is 422, and every message-shape problem is 422 too.
export function validateChatBody(body: unknown): ChatValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 422, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;

  const rawMessage: unknown = record.message;
  if (typeof rawMessage !== 'string') {
    return { ok: false, status: 422, error: 'message must be a string' };
  }
  const message = rawMessage.trim();
  if (message === '') {
    return { ok: false, status: 422, error: 'message is required' };
  }
  if (message.length > MESSAGE_MAX) {
    return { ok: false, status: 422, error: `message must be at most ${MESSAGE_MAX} characters` };
  }

  const rawBotId: unknown = record.botId;
  const history = validateHistory(record.history);
  if (typeof history === 'string') {
    return { ok: false, status: 422, error: history };
  }
  if (rawBotId === undefined || rawBotId === null) {
    return { ok: true, value: { botId: null, message, history } };
  }
  if (!isUuid(rawBotId)) {
    return { ok: false, status: 422, error: 'botId must be a uuid' };
  }
  return { ok: true, value: { botId: rawBotId, message, history } };
}

// Any configured key on the persona lane is enough to attempt a reply. When
// none is present the route answers honestly instead of opening a stream that
// can never produce anything.
function personaConfigured(): boolean {
  return LANES.persona.some((route) => {
    const key = process.env[route.keyEnv];
    return typeof key === 'string' && key.trim() !== '';
  });
}

const encoder = new TextEncoder();

function sse(data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function errorJson(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

type DoneEvent = Extract<StreamEvent, { t: 'done' }>;

// Billing must never silently drop a metered turn, but the client must never
// see a ledger failure: the done frame is already delivered when this runs, so
// a DB error is logged server-side and swallowed. Mirrors cost.ts — a
// provider that reported no usage stores NULL usd_cost/credits, never zero.
async function recordChatSpend(
  done: DoneEvent,
  accountId: string,
  refId: string | null,
): Promise<void> {
  try {
    await recordSpend(getPool(), {
      accountId,
      model: PERSONA_LANE,
      usdCost: done.note === 'usage-unavailable' ? null : done.credits * USD_PER_CREDIT,
      reason: PERSONA_REASON,
      refId: refId ?? undefined,
    });
  } catch (error) {
    // The client's reply is already delivered and must never be broken by a
    // ledger failure (see above), so this is deliberately not a status code.
    // The one thing that must not be swallowed is the CAUSE: an unconfigured
    // database is an ops misconfiguration, not a provider/ledger fault, and the
    // log has to name it as such (KI-021). The shared mapper is the single
    // source of truth for that cause; its `error` literal is reused verbatim so
    // the emitted log line is unchanged.
    const mapped = mapDbError(error);
    const message = mapped
      ? `chat: cannot record ai_spend - ${mapped.error}`
      : 'chat: failed to record ai_spend';
    console.error(message, error);
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return errorJson(401, 'unauthorized');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson(422, 'body must be JSON');
  }
  const parsed = validateChatBody(body);
  if (!parsed.ok) {
    return errorJson(parsed.status, parsed.error);
  }
  const { botId, message, history } = parsed.value;

  if (!personaConfigured()) {
    return errorJson(500, 'AI is not configured yet');
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let done: DoneEvent | null = null;
      try {
        try {
          for await (const event of chatStream({
            lane: PERSONA_LANE,
            messages: [...history, { role: 'user', content: message }],
            maxTokens: PERSONA_MAX_TOKENS,
            signal: req.signal,
          })) {
            if (event.t === 'done') {
              done = event;
            }
            controller.enqueue(sse(event));
          }
        } catch {
          // A failure after the first frame stays inside the open stream: the
          // client renders it and offers Retry rather than seeing it as a clean
          // end. Never a fabricated answer.
          controller.enqueue(sse({ t: 'error', message: 'The reply stopped unexpectedly.' }));
        }
        if (done) {
          // After the done frame, before close: the write is guarded so a DB
          // failure can never turn into a stream error (see recordChatSpend).
          await recordChatSpend(done, session.accountId, botId);
        }
      } finally {
        controller.close();
      }
    },
    // Client disconnect already propagates through req.signal into the lane;
    // nothing else to release here.
    cancel() {
      /* no-op */
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
