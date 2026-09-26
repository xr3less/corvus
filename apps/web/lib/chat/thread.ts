// Shared chat-thread primitives (D-118): row shape, SSE parsing, history tail,
// bot-id coercion, and HTTP error text. Core stays pure — no React — so both chat
// pages and the stream hook share one implementation instead of two copies.
//
// Persistence wiring (wave1b2a): thin fail-closed helpers over
// ../conversations/client.ts. The send lane never blocks on persistence: every
// helper returns a typed result with the single honest notice on failure and
// never throws for transport/status/shape problems.

import { isUuid } from '../editor/drafts';
import {
  appendTurns,
  getConversationTurns,
  HISTORY_UNAVAILABLE_NOTICE,
  openConversation,
  type AppendTurn,
  type ConversationTurn,
} from '../conversations/client';
import { readRefusalMessage } from '../http/refusal';

export interface ThreadRow {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachmentCount: number;
  status?: 'thinking' | 'answering' | 'done' | 'error';
  reasoning?: string;
  credits?: number;
  /* The provider reported no cost for this reply; the spent line says so
     instead of printing a fabricated 0. */
  creditsUnavailable?: boolean;
  error?: string;
  /* Assistant rows only: the user text a Retry re-sends. */
  sourceText?: string;
  /* Real clock readings for the ThinkingTrace elapsed readout (assistant
     rows only; user rows never render a trace). */
  startedAt?: number;
  finishedAt?: number;
}

export type ChatStreamEvent =
  | { t: 'reasoning'; text: string }
  | { t: 'content'; text: string }
  | { t: 'done'; credits: number; note?: 'usage-unavailable' }
  | { t: 'error'; message: string };

/* SSE frames arrive as `data: <json>\n\n`; a chunk boundary can split any
   frame, so only complete frames are parsed and the tail is kept for the next
   read. Unknown shapes are ignored, never rendered. */
export function toChatStreamEvent(value: unknown): ChatStreamEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.t === 'reasoning' || record.t === 'content') {
    return typeof record.text === 'string' ? { t: record.t, text: record.text } : null;
  }
  if (record.t === 'done') {
    const credits = record.credits;
    if (typeof credits !== 'number' || !Number.isFinite(credits)) return null;
    const note = record.note === 'usage-unavailable' ? 'usage-unavailable' : undefined;
    return { t: 'done', credits, note };
  }
  if (record.t === 'error') {
    return {
      t: 'error',
      message:
        typeof record.message === 'string' ? record.message : 'The reply stopped unexpectedly.',
    };
  }
  return null;
}

export function parseSseFrame(frame: string): ChatStreamEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).replace(/^ /, ''))
    .join('\n');
  if (data === '') return null;
  try {
    return toChatStreamEvent(JSON.parse(data) as unknown);
  } catch {
    return null;
  }
}

/* Prior completed turns travel with each send so the model remembers the
   thread (OpenCode-style transcript tail). In-flight, empty, and errored rows
   never travel — only what both sides actually said. Capped so one long
   thread cannot run the meter away. */
export const HISTORY_MAX_ROWS = 12;

export function threadHistory(
  rows: ThreadRow[],
): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const row of rows) {
    if (row.role === 'user') {
      if (row.text.trim() !== '') turns.push({ role: 'user', content: row.text });
    } else if (row.status === 'done' && row.text.trim() !== '') {
      turns.push({ role: 'assistant', content: row.text });
    }
  }
  return turns.slice(-HISTORY_MAX_ROWS);
}

/* History for a retry: everything before the failed pair, so the resent
   user text does not travel twice (once in history, once as the message). */
export function historyBefore(rows: ThreadRow[], assistantId: string) {
  const idx = rows.findIndex((row) => row.id === assistantId);
  return threadHistory(idx === -1 ? rows : rows.slice(0, Math.max(0, idx - 1)));
}

/* Build brief = the refined conversation, stitched deterministically (KI-036):
   every user-turn text in send order, trimmed, non-empty only; the live
   composer text appended when non-empty; joined with newlines, clamped to the
   builder route's 1..2000 rule, trimmed. Assistant rows never contribute
   (model prose is not requirements). NO model call — pure concat of state
   already on screen. */
export const BRIEF_MAX_CHARS = 2000;

export function stitchBrief(
  rows: { role: 'user' | 'assistant'; text: string }[],
  current?: string,
  maxChars = BRIEF_MAX_CHARS,
): string {
  const texts = rows
    .filter((row) => row.role === 'user')
    .map((row) => row.text.trim())
    .filter((text) => text !== '');
  const live = current?.trim() ?? '';
  if (live !== '') texts.push(live);
  return texts.join('\n').slice(0, maxChars).trim();
}

/* Compact credit display mirroring the composer's `1.1 credits` spelling — no
   trailing zeros, at most three decimals. */
export function formatCredits(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

/* HTTP-level failures never reach the SSE shape. A 401 means the session is
   gone — say so in plain words with the fix, instead of the raw status.
   A KI-033 refusal arrives as { error: <code>, message: <the honest sentence> }
   (route.ts errorJson writes both), and the chat lane is the surface a
   trial-expired person hits first — so `message` is preferred and `error` is
   only the fallback for the older code-only shape. Printing the code alone
   would paint `trial_expired` where the comment above promises plain words.
   Same precedence as the dashboard and gallery forks. */
export async function readHttpError(response: Response): Promise<string> {
  if (response.status === 401) {
    return 'You are logged out — log in again, then press Retry.';
  }
  try {
    const payload = (await response.json()) as unknown;
    return readRefusalMessage(payload) ?? 'The reply stopped unexpectedly. Try again.';
  } catch {
    /* fall through to the generic line */
  }
  return 'The reply stopped unexpectedly. Try again.';
}

/* Mock bots carry display ids (bot-1…), never uuids. The API validates uuid,
   so a mock id is sent as null (account-level reply, no fake bot linkage)
   instead of failing every send with a 422 no user can fix. */
export function chatBotId(id: string | null | undefined): string | null {
  return isUuid(id) ? id : null;
}

/* Conversation persistence wiring (wave1b2a, fail-closed over
   ../conversations/client.ts). The send lane (/api/chat) never blocks on
   persistence: every helper below returns a typed result carrying the single
   honest notice on failure and never throws for transport/status/shape
   problems. Callers fall back to local state and keep sending.

   Ordering contract: await `ensureConversationForBot` FIRST — it persists the
   coerced botId (POST /api/conversations) BEFORE the verdict effect runs, so a
   refresh never re-judges a stale verdict with a lost botId. `rehydrateThread`
   then reads the window via getConversationTurns (server caps at 50 ending at
   the last user row; the newest user row is the in-flight draft and stays out
   of the GET window). Render the local draft OVER fetched history with
   `overlayDraft` — never merge it into the persisted window. Nothing here
   touches /api/builder/verdict. */

export const PERSISTED_TURNS_CAP = 50;

export interface EnsureConversationOk {
  ok: true;
  conversationId: string;
  botId: string | null;
}

export interface EnsureConversationFailure {
  ok: false;
  botId: string | null;
  status: number | null;
  notice: typeof HISTORY_UNAVAILABLE_NOTICE;
}

export type EnsureConversationResult = EnsureConversationOk | EnsureConversationFailure;

/* Persists the coerced botId by opening one server conversation. Returns the
   botId intact alongside the conversationId so the caller keeps verdict
   scoping across refresh. Fail-closed: on any persistence failure the caller
   keeps the botId locally and the chat send lane continues. */
export async function ensureConversationForBot(
  rawBotId: string | null | undefined,
): Promise<EnsureConversationResult> {
  const botId = chatBotId(rawBotId);
  const opened = await openConversation(botId);
  if (!opened.ok) {
    return { ok: false, botId, status: opened.status, notice: opened.notice };
  }
  return { ok: true, conversationId: opened.conversationId, botId };
}

/* One persisted turn as one local row. User rows carry no status; assistant
   rows land as done so threadHistory keeps them. Ids are preserved
   byte-identical so a verdict guard keyed by row id never re-fires for the
   same row after refresh. No clock readings are fabricated. */
export function toThreadRow(turn: ConversationTurn): ThreadRow {
  if (turn.role === 'assistant') {
    return { id: turn.id, role: 'assistant', text: turn.text, attachmentCount: 0, status: 'done' };
  }
  return { id: turn.id, role: 'user', text: turn.text, attachmentCount: 0 };
}

/* Rows worth persisting: completed turns only (mirrors threadHistory —
   in-flight, empty, and errored rows never travel), text trimmed and capped at
   the turns route's 2000-char bound so a persistable row can never 422 for
   shape alone. */
export function toPersistedTurns(rows: ThreadRow[]): AppendTurn[] {
  const turns: AppendTurn[] = [];
  for (const row of rows) {
    if (row.role === 'user') {
      const text = row.text.trim();
      if (text === '') continue;
      turns.push({ role: 'user', text: text.slice(0, 2000) });
    } else if (row.status === 'done') {
      const text = row.text.trim();
      if (text === '') continue;
      turns.push({ role: 'assistant', text: text.slice(0, 2000) });
    }
  }
  return turns;
}

/* Renders the local draft OVER fetched history: a plain append that never
   mutates either input and never merges the draft into the persisted window.
   The GET window excludes the newest user row (the in-flight draft), so the
   caller keeps that row local and overlays it here. */
export function overlayDraft(persisted: ThreadRow[], draft: ThreadRow[]): ThreadRow[] {
  return [...persisted, ...draft];
}

export interface RehydrateThreadOk {
  ok: true;
  rows: ThreadRow[];
  truncated: boolean;
}

export interface RehydrateThreadFailure {
  ok: false;
  rows: [];
  truncated: false;
  status: number | null;
  notice: typeof HISTORY_UNAVAILABLE_NOTICE;
}

export type RehydrateThreadResult = RehydrateThreadOk | RehydrateThreadFailure;

/* Refresh path: reads the persisted window (at most PERSISTED_TURNS_CAP rows)
   and maps it to local rows with ids intact. Defensive slice keeps the cap
   even if the server ever answers more; truncation is honest either way. */
export async function rehydrateThread(conversationId: string): Promise<RehydrateThreadResult> {
  const loaded = await getConversationTurns(conversationId);
  if (!loaded.ok) {
    return { ok: false, rows: [], truncated: false, status: loaded.status, notice: loaded.notice };
  }
  const mapped: ThreadRow[] = [];
  for (const turn of loaded.turns) {
    mapped.push(toThreadRow(turn));
  }
  const rows = mapped.slice(-PERSISTED_TURNS_CAP);
  const truncated = loaded.truncated || mapped.length > PERSISTED_TURNS_CAP;
  return { ok: true, rows, truncated };
}

export type PersistThreadTurnsResult =
  | { ok: true; saved: number }
  | { ok: false; status: number | null; notice: typeof HISTORY_UNAVAILABLE_NOTICE };

/* Best-effort append of completed rows. Empty batches skip the fetch (the
   route requires a non-empty array) and read as zero saved, not a failure.
   Fail-closed: the caller keeps the rows locally on ok:false. */
export async function persistThreadTurns(
  conversationId: string,
  rows: ThreadRow[],
): Promise<PersistThreadTurnsResult> {
  const turns = toPersistedTurns(rows);
  if (turns.length === 0) {
    return { ok: true, saved: 0 };
  }
  const stored = await appendTurns(conversationId, turns);
  if (!stored.ok) {
    return { ok: false, status: stored.status, notice: stored.notice };
  }
  return { ok: true, saved: stored.saved };
}
