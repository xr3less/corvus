// Typed client for the server-persisted conversations API (Wave 1).
//
// SOLE OWNER: wave1-conv (wave1b1-conv-client). wave4-hub consumes this module
// read-only. Do NOT import thread.ts, use-chat-stream.ts, or dashboard-rail.tsx
// here — the follow-up wiring task owns that direction.
//
// PUBLIC INTERFACE:
//   HISTORY_UNAVAILABLE_NOTICE  the ONE owner-surface sentence this module may
//                               produce (SPEC §3 copy freeze, byte-identical).
//   openConversation(botId)     POST /api/conversations -> { conversationId }.
//   listConversations()         GET /api/conversations -> newest-first items.
//   getConversationTurns(id)    GET /api/conversations/[id] -> windowed turns.
//   appendTurns(id, turns)      POST /api/conversations/[id] -> { saved }.
//   deleteConversation(id)      DELETE /api/conversations/[id] -> { deleted }.
//
// FAIL-CLOSED CONTRACT: every function returns a typed result union and NEVER
// throws for a transport, status, or shape problem. On any persistence failure
// the caller gets `{ ok: false, status, notice }` and keeps the user's message
// path locally — the chat send lane continues, the rail renders its honest
// empty/degraded state. No other user-facing string lives in this file.

import { isUuid } from '../editor/drafts';

// The single honest notice for a persistence failure. Callers show this and
// fall back to local state; the send path is never blocked by it.
export const HISTORY_UNAVAILABLE_NOTICE =
  'Conversation history unavailable — new messages still send.';

// Diagnostic twin for the [id] GET truncation note
// (app/api/conversations/[id]/route.ts OLDER_HISTORY_NOTE). The client only
// branches on it into `truncated: true` — it never renders it.
export const OLDER_HISTORY_NOTE = 'older-history-truncated';

export interface ConversationListItem {
  id: string;
  botId: string | null;
  title: string | null;
  updatedAt: string;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface AppendTurn {
  role: 'user' | 'assistant';
  text: string;
}

/* Every failure carries the same shape: `status` is the HTTP status (null when
   the request never completed or the body was not JSON — a diagnostic for
   logs/tests, never rendered), and `notice` is the one sentence the owner
   reads. Callers fall back locally on `ok: false` and keep sending. */
export interface ConversationsFailure {
  ok: false;
  status: number | null;
  notice: typeof HISTORY_UNAVAILABLE_NOTICE;
}

function failure(status: number | null): ConversationsFailure {
  return { ok: false, status, notice: HISTORY_UNAVAILABLE_NOTICE };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function conversationUrl(conversationId: string): string {
  return `/api/conversations/${encodeURIComponent(conversationId)}`;
}

export type OpenConversationResult = { ok: true; conversationId: string } | ConversationsFailure;

/* Opens one server-persisted conversation. `botId` is the uuid the route owns,
   or null for an account-level conversation — the caller coerces display ids
   (chatBotId/resolveBotId) before calling, never this module. */
export async function openConversation(botId: string | null): Promise<OpenConversationResult> {
  let response: Response;
  try {
    response = await postJson('/api/conversations', { botId });
  } catch {
    return failure(null);
  }
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload)) {
    return failure(response.status);
  }
  const conversationId: unknown = payload['conversationId'];
  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    return failure(response.status);
  }
  return { ok: true, conversationId };
}

export type ListConversationsResult =
  { ok: true; conversations: ConversationListItem[] } | ConversationsFailure;

function readListItem(row: unknown): ConversationListItem | null {
  if (!isRecord(row)) {
    return null;
  }
  if (typeof row['id'] !== 'string') {
    return null;
  }
  const botId: unknown = row['botId'];
  const title: unknown = row['title'];
  const updatedAt: unknown = row['updatedAt'];
  if (botId !== null && typeof botId !== 'string') {
    return null;
  }
  if (title !== null && typeof title !== 'string') {
    return null;
  }
  if (typeof updatedAt !== 'string') {
    return null;
  }
  return { id: row['id'], botId, title, updatedAt };
}

/* Lists the caller's conversations, newest first. The server answers an honest
   empty array when the caller has none — that is `{ ok: true }`, never a
   failure. Malformed rows are dropped, never guessed. */
export async function listConversations(): Promise<ListConversationsResult> {
  let response: Response;
  try {
    response = await fetch('/api/conversations');
  } catch {
    return failure(null);
  }
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload)) {
    return failure(response.status);
  }
  const raw: unknown = payload['conversations'];
  if (!Array.isArray(raw)) {
    return failure(response.status);
  }
  const conversations: ConversationListItem[] = [];
  for (const row of raw) {
    const item = readListItem(row);
    if (item !== null) {
      conversations.push(item);
    }
  }
  return { ok: true, conversations };
}

export type GetTurnsResult =
  { ok: true; turns: ConversationTurn[]; truncated: boolean } | ConversationsFailure;

function readTurn(row: unknown): ConversationTurn | null {
  if (!isRecord(row)) {
    return null;
  }
  if (typeof row['id'] !== 'string') {
    return null;
  }
  if (row['role'] !== 'user' && row['role'] !== 'assistant') {
    return null;
  }
  if (typeof row['text'] !== 'string') {
    return null;
  }
  return { id: row['id'], role: row['role'], text: row['text'] };
}

/* Reads the rehydration window: at most 50 turns ending at the last user row.
   `truncated` is true only when the server says older history exists — the
   caller's cue to say so rather than invent a seam. A malformed id can never
   resolve server-side (404), so it fails fast locally without a fetch. */
export async function getConversationTurns(conversationId: string): Promise<GetTurnsResult> {
  if (!isUuid(conversationId)) {
    return failure(null);
  }
  let response: Response;
  try {
    response = await fetch(conversationUrl(conversationId));
  } catch {
    return failure(null);
  }
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload)) {
    return failure(response.status);
  }
  const raw: unknown = payload['turns'];
  if (!Array.isArray(raw)) {
    return failure(response.status);
  }
  const turns: ConversationTurn[] = [];
  for (const row of raw) {
    const turn = readTurn(row);
    if (turn !== null) {
      turns.push(turn);
    }
  }
  return { ok: true, turns, truncated: payload['note'] === OLDER_HISTORY_NOTE };
}

export type AppendTurnsResult = { ok: true; saved: number } | ConversationsFailure;

/* Appends turns append-only (the route de-duplicates re-sent tails). The
   failure path is the whole point: `{ ok: false }` means "not persisted" and
   the caller keeps the turns in local state — the user's message is never
   thrown away because the server was unreachable. */
export async function appendTurns(
  conversationId: string,
  turns: AppendTurn[],
): Promise<AppendTurnsResult> {
  if (!isUuid(conversationId)) {
    return failure(null);
  }
  let response: Response;
  try {
    response = await postJson(conversationUrl(conversationId), { turns });
  } catch {
    return failure(null);
  }
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload)) {
    return failure(response.status);
  }
  const saved: unknown = payload['saved'];
  if (typeof saved !== 'number' || !Number.isInteger(saved) || saved < 0) {
    return failure(response.status);
  }
  return { ok: true, saved };
}

export type DeleteConversationResult = { ok: true } | ConversationsFailure;

/* Deletes one conversation. On failure the caller keeps its local entry — a
   failed delete must never read as a confirmed one. */
export async function deleteConversation(
  conversationId: string,
): Promise<DeleteConversationResult> {
  if (!isUuid(conversationId)) {
    return failure(null);
  }
  let response: Response;
  try {
    response = await fetch(conversationUrl(conversationId), { method: 'DELETE' });
  } catch {
    return failure(null);
  }
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload)) {
    return failure(response.status);
  }
  if (payload['deleted'] !== true) {
    return failure(response.status);
  }
  return { ok: true };
}
