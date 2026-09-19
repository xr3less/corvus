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
//
// KI-033 enforcement: an expired trial is refused with a plain 403 JSON body
// BEFORE any model call or stream is opened, and a turn that would cross the
// account's monthly allowance is refused the same way. Both gates sit in front
// of the ReadableStream: once the stream is open the client is reading SSE, so
// a spend refusal has to be a status the caller can act on, not a frame.

import { chatStream } from '@/lib/ai/stream';
import type { StreamEvent } from '@/lib/ai/stream';
import { LANES } from '@/lib/ai/lanes';
import { recordSpend, USD_PER_CREDIT } from '@/lib/ai/cost';
import { checkBudget, isPlanTier } from '@corvus/ai';
import { getPool, mapDbError, __setPool } from '@/lib/db/pool';
import { isUuid } from '@/lib/editor/drafts';
import { defaultSessionReader } from '@/lib/interview/session-bind';
import { isTrialExpired } from '@/lib/auth/session';

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/simulate/route.ts).
export { __setPool };

export interface ChatSession {
  accountId: string;
  discordId: string;
  // KI-033: the account's trial clock, carried on the session (now live via
  // session-bind from getSession; the structural type keeps this optional
  // so a reader that has no clock concept still satisfies it). null/undefined
  // both mean "no clock" and read as NOT expired — that fail-open direction is
  // locked by the KI-033 SPEC, and isTrialExpired owns the comparison.
  trialEndsAt?: Date | string | null;
  // KI-033: the plan tier behind the monthly allowance. Now live via
  // session-bind from getSession (accounts.tier, default 'trial'); an
  // absent/unknown tier resolves to the trial path, never to a bypass. A paid tier is coded to bypass BOTH the clock and the bot cap
  // now so the gate cannot harden into a wall once billing ships.
  tier?: string | null;
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

// --- KI-033 gates -----------------------------------------------------------

// Locked wording (KI-033 SPEC, byte-level): the SAME sentence the dashboard
// banner and the landing FAQ carry. A refusal that does not say what happened
// and what was NOT lost is the kind of dead end the SPEC exists to prevent —
// there is no checkout to send the caller to, so the message is the whole UX.
const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

// Same predicate the builder worker bills with (builder-runs.ts uses
// isPlanTier then falls back to the guard's own trial default). A missing or
// unknown tier reads as trial — never as a paid bypass. True means "the trial
// gate applies to this account".
function onTrial(tier: string | null | undefined): boolean {
  return !isPlanTier(tier) || tier === 'trial';
}

// The monthly allowance gate is tier-aware, so its refusal has to be too.
// Tier-blind copy would tell a paying account that its 3-day trial expired,
// which is false about the one fact the user can see. The trial branch names
// the credit count the SPEC locks ("100 credits"); the paid branch takes the
// number the meter actually resolved, because no paid allowance is granted yet
// (migration 0008 defaults the column to 'trial' and no session store selects
// it), so naming a paid figure here would be an invented number.
function budgetRefusalMessage(tier: string | null | undefined, allowance: number): string {
  if (onTrial(tier)) {
    return 'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.';
  }
  return `This month's ${allowance} AI credits are used up. Nothing is deleted.`;
}

// One persona call's worst-case output cost (seam H4's shape, ported to chat).
// The most expensive persona route is wiro `xai/grok-4-1-fast` at $0.50 / 1M
// output tokens (lanes.ts), and PERSONA_MAX_TOKENS bounds ONE reply. As in
// builder-runs.ts this file states no credit count of its own except by reading
// the shared allowance table: USD -> credits goes through the shared meter.
const PERSONA_MAX_OUTPUT_USD_PER_MTOKEN = 0.5;
const PERSONA_CALL_CREDITS =
  (PERSONA_MAX_TOKENS / 1_000_000) * (PERSONA_MAX_OUTPUT_USD_PER_MTOKEN / USD_PER_CREDIT);

// Credits already spent this calendar month, scoped to the account. Identical
// arithmetic to the builder worker's SPENT_CREDITS_SQL (ai_spend has no period
// column, so created_at is the period and the shared allowance is monthly).
const SPENT_CREDITS_SQL =
  'SELECT COALESCE(SUM(credits), 0) AS spent FROM ai_spend ' +
  "WHERE account_id = $1 AND created_at >= date_trunc('month', now())";

// A SUM the database could not express as a number is a billing-boundary read
// failure, so it surfaces as NaN and checkBudget throws on it. Returning 0
// instead would silently reset an exhausted month. Mirrors readSpentCredits.
function readSpentCredits(row: unknown): number {
  if (typeof row === 'object' && row !== null) {
    const value = (row as Record<string, unknown>).spent;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
  }
  return Number.NaN;
}

async function loadSpentCredits(accountId: string): Promise<number> {
  const result = await getPool().query(SPENT_CREDITS_SQL, [accountId]);
  return readSpentCredits(result.rows[0]);
}

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

// `code` is the machine-readable verdict every existing caller already returns
// as `{ error }`. The optional `message` is the human sentence a KI-033 refusal
// adds so the caller reads why, not only a token — omitted elsewhere, so every
// pre-existing response shape stays byte-identical.
function errorJson(status: number, code: string, message?: string): Response {
  return Response.json(message === undefined ? { error: code } : { error: code, message }, {
    status,
  });
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

  // KI-033, clock first: the trial gate needs no database, no provider and no
  // body parsing, so an expired account is refused before anything else can
  // fail (a malformed body must not be able to mask an expired trial as 422,
  // and vice versa). Sits ahead of validateChatBody on purpose. The locked
  // sentence rides the response, so the caller has the reason in words and not
  // only in a code.
  if (onTrial(session.tier) && isTrialExpired({ trial_ends_at: session.trialEndsAt })) {
    return errorJson(403, 'trial_expired', TRIAL_ENDED_MESSAGE);
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

  // KI-033, allowance second (and after the provider check, so an unconfigured
  // lane keeps answering exactly as before): refuse a turn that would cross the
  // month's grant. A blocked turn makes NO model call and writes NO ledger row.
  let budget: Awaited<ReturnType<typeof checkBudget>>;
  try {
    budget = await checkBudget({
      accountId: session.accountId,
      estimatedCredits: PERSONA_CALL_CREDITS,
      getSpent: () => loadSpentCredits(session.accountId),
      // Unknown/absent tier falls back to the guard's own trial default.
      tier: isPlanTier(session.tier) ? session.tier : undefined,
    });
  } catch (error) {
    // checkBudget throws on a read failure by design (a fake allow at a billing
    // boundary is the failure it exists to prevent), so the caller gets the
    // honest 500 the route already uses for "cannot do its job" — the same
    // status the budget module's own callers answer. Never a refusal it cannot
    // explain, never a model call on an unverified meter.
    const mapped = mapDbError(error);
    if (mapped) {
      return errorJson(mapped.status, mapped.error);
    }
    console.error('chat: cannot read the monthly allowance', error);
    return errorJson(500, 'could not check your AI credits');
  }
  if (!budget.ok) {
    // The verdict carries the allowance it actually resolved, so the sentence
    // names the real number instead of a remembered one.
    return errorJson(
      403,
      'trial_budget_exceeded',
      budgetRefusalMessage(session.tier, budget.allowance),
    );
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
