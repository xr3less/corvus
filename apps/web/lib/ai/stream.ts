// Streaming counterpart to the metered model router (T-router).
//
// `chatStream` mirrors `chat()`'s lane loop, headers and timeout, but reads an
// OpenAI-compatible Server-Sent Events stream instead of one JSON body. It
// yields the LOCKED event contract consumed by the chat API + UI:
//
//   { t: 'reasoning', text }  -> model's own reasoning tokens, verbatim
//   { t: 'content',   text }  -> answer deltas, verbatim
//   { t: 'done', credits }    -> metered cost (provider-reported only)
//
// Order: zero or more reasoning -> zero or more content -> exactly one done.
// Reasoning/answer text is never fabricated: an absent or non-string field is
// skipped. On provider/transport failure a plain Error is thrown (the route
// maps it); no partial text is invented.
//
// SSE shape verified 2026-09-13 against:
//   - OpenAI Chat Completions streaming events (developers.openai.com/api/reference/
//     resources/chat/subresources/completions/streaming-events): chunks carry
//     `choices[0].delta.content`; `usage` is null on every chunk except a final
//     `choices: []` chunk when `stream_options.include_usage` is set; the stream
//     ends with a literal `data: [DONE]` line.
//   - DeepSeek API docs (streaming + thinking mode): reasoning arrives on
//     `choices[0].delta.reasoning_content`, streams before `content`, and usage
//     is only populated when `stream_options.include_usage` is set.
// The request body intentionally stays minimal per the locked contract; usage is
// therefore provider-dependent (OpenRouter-style gateways report it by default,
// OpenAI-style ones omit it unless opted in) and the absent case is handled below.
import { extractCost, toCredits } from './cost';
import { LANES } from './lanes';
import type { LaneName, ProviderRoute } from './lanes';
import { ROUTER_TIMEOUT_MS } from './router';
import type { ChatMessage, FetchFn } from './router';

export type StreamEvent =
  | { t: 'reasoning'; text: string }
  | { t: 'content'; text: string }
  | { t: 'done'; credits: number; note?: 'usage-unavailable' };

export interface StreamOptions {
  readonly lane: LaneName;
  readonly messages: ChatMessage[];
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  readonly fetchFn?: FetchFn;
  /**
   * Reserved for the API route's `ai_spend` write (mirrors `chat()`'s callers).
   * The generator itself never touches the database; it only reports credits.
   */
  readonly accountId?: string;
  readonly reason?: string;
  readonly refId?: string;
}

// Browser-like UA, mirroring router.ts (bare clients get Cloudflare 1010 on
// some origins). Kept local because router.ts does not export it.
const USER_AGENT = 'Mozilla/5.0 (compatible; corvus-web/1.0)';

function readKey(route: ProviderRoute): string {
  const key = process.env[route.keyEnv];
  return key && key.trim() !== '' ? key : '';
}

function resolveBaseURL(route: ProviderRoute): string {
  if (route.baseURLEnv) {
    const override = process.env[route.baseURLEnv];
    if (override && override.trim() !== '') {
      return override.trim().replace(/\/+$/, '');
    }
  }
  return route.baseURL;
}

function buildStreamBody(route: ProviderRoute, options: StreamOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: route.model,
    messages: options.messages,
    temperature: 0,
    stream: true,
  };
  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }
  if (route.reasoningLow) {
    body.reasoning_effort = 'low';
  }
  return body;
}

function createTimeoutSignal(ms: number): AbortSignal {
  const statics = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
  if (typeof statics.timeout === 'function') {
    return statics.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms) as unknown as { unref?: () => void };
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return controller.signal;
}

function combineWithTimeout(caller: AbortSignal | undefined): AbortSignal {
  const timeout = createTimeoutSignal(ROUTER_TIMEOUT_MS);
  if (!caller) {
    return timeout;
  }
  const statics = AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal };
  if (typeof statics.any === 'function') {
    return statics.any([caller, timeout]);
  }
  const controller = new AbortController();
  const link = (source: AbortSignal): void => {
    if (source.aborted) {
      controller.abort();
      return;
    }
    source.addEventListener('abort', () => controller.abort(), { once: true });
  };
  link(caller);
  link(timeout);
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** Secret-free transport class, mirroring router.ts's classifier. */
function classifyThrow(error: unknown): string {
  return isAbortError(error) ? 'timeout' : 'network';
}

function abortError(): Error {
  const error = new Error('chatStream: aborted');
  error.name = 'AbortError';
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Locate the next SSE event boundary (blank line), tolerating CRLF. */
function findBoundary(text: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}

/** Join an SSE event block's `data:` lines; null when it carries no data. */
function readDataPayload(raw: string): string | null {
  const parts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }
    let value = line.slice('data:'.length);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    parts.push(value);
  }
  return parts.length === 0 ? null : parts.join('\n');
}

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new Error('chatStream: malformed SSE JSON payload');
  }
}

/**
 * Decode a `text/event-stream` body into parsed JSON chunks. `[DONE]` ends the
 * generator; comment/keep-alive frames are ignored. Aborts surface as an
 * AbortError so the caller can distinguish a clean cancel from a transport
 * failure.
 */
async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal.aborted) {
        throw abortError();
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = findBoundary(buffer);
      while (boundary !== null) {
        const raw = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const payload = readDataPayload(raw);
        if (payload !== null) {
          if (payload === '[DONE]') {
            return;
          }
          yield parseJson(payload);
        }
        boundary = findBoundary(buffer);
      }
    }
    // Flush a final event that arrived without a trailing blank line.
    buffer += decoder.decode();
    const tail = readDataPayload(buffer);
    if (tail !== null && tail !== '[DONE]') {
      yield parseJson(tail);
    }
  } finally {
    reader.releaseLock();
  }
}

interface DeltaText {
  reasoning?: string;
  content?: string;
}

/** Extract string reasoning/content deltas; ignore every other shape. */
function extractDelta(chunk: unknown): DeltaText | null {
  if (!isRecord(chunk)) {
    return null;
  }
  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0];
  if (!isRecord(first)) {
    return null;
  }
  const delta = first.delta;
  if (!isRecord(delta)) {
    return null;
  }
  const out: DeltaText = {};
  const reasoning =
    typeof delta.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof delta.reasoning === 'string'
        ? delta.reasoning
        : undefined;
  if (reasoning !== undefined && reasoning !== '') {
    out.reasoning = reasoning;
  }
  const content = typeof delta.content === 'string' ? delta.content : undefined;
  if (content !== undefined && content !== '') {
    out.content = content;
  }
  return out;
}

/**
 * Metering mirrors `chat()`: the only cost source is the provider-reported
 * total (`extractCost` + `toCredits` from ./cost), never token math. `chat()`
 * returns `providerCostUsd: null` when a provider reports none, and the ledger
 * write then stores NULL `usd_cost`/`credits` — never 0. The LOCKED done event
 * carries a numeric `credits`, so absence is surfaced as `credits: 0` plus
 * `note: 'usage-unavailable'`; the route MUST translate that note into a NULL
 * spend row, not a zero-cost run.
 */
function buildDone(usdCost: number | null): StreamEvent {
  if (usdCost === null) {
    return { t: 'done', credits: 0, note: 'usage-unavailable' };
  }
  return { t: 'done', credits: toCredits(usdCost) };
}

/**
 * Stream a metered completion from the first healthy route on a lane. Yields
 * the locked StreamEvent contract; throws a plain Error when every route fails
 * or the stream breaks after output has started. A caller abort ends the
 * generator cleanly with no `done` event.
 */
export async function* chatStream(
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const routes = LANES[options.lane];
  if (!routes) {
    throw new Error(`chatStream: unknown lane "${String(options.lane)}"`);
  }
  if (
    options.maxTokens !== undefined &&
    (!Number.isFinite(options.maxTokens) || options.maxTokens <= 0)
  ) {
    throw new Error('chatStream: maxTokens must be a positive finite number');
  }
  const fetchFn: FetchFn = options.fetchFn ?? fetch;
  let clientErrorSeen = false;
  let lastLabel = '';
  let lastClass = '';

  for (const route of routes) {
    if (options.signal?.aborted) {
      return;
    }
    if (route.compatible === false) {
      continue;
    }
    const key = readKey(route);
    if (!key) {
      continue;
    }
    lastLabel = route.label;
    let response: Response;
    try {
      response = await fetchFn(`${resolveBaseURL(route)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(buildStreamBody(route, options)),
        signal: combineWithTimeout(options.signal),
      });
    } catch (error) {
      if (options.signal?.aborted) {
        return;
      }
      lastClass = classifyThrow(error);
      if (clientErrorSeen) {
        throw new Error(
          `chatStream: lane "${options.lane}" failed at ${route.label}=${lastClass}.`,
        );
      }
      continue;
    }

    if (!response.ok) {
      const status = response.status;
      lastClass = `http-${status}`;
      if (status >= 400 && status < 500 && status !== 429) {
        if (clientErrorSeen) {
          throw new Error(
            `chatStream: lane "${options.lane}" failed at ${route.label}=http-${status}.`,
          );
        }
        // Key/config errors stay visible: exactly one more route, then throw.
        clientErrorSeen = true;
        continue;
      }
      // 5xx / 429 / other: fail over to the next route.
      if (clientErrorSeen) {
        throw new Error(
          `chatStream: lane "${options.lane}" failed at ${route.label}=http-${status}.`,
        );
      }
      continue;
    }

    const body = response.body;
    if (!body) {
      lastClass = 'no-body';
      if (clientErrorSeen) {
        throw new Error(`chatStream: lane "${options.lane}" failed at ${route.label}=no-body.`);
      }
      continue;
    }

    let yieldedAny = false;
    let contentSeen = false;
    let usdCost: number | null = null;
    const streamSignal = combineWithTimeout(options.signal);
    try {
      for await (const chunk of readSseEvents(body, streamSignal)) {
        const cost = extractCost(chunk);
        if (cost !== null) {
          usdCost = cost;
        }
        const delta = extractDelta(chunk);
        if (!delta) {
          continue;
        }
        if (delta.reasoning !== undefined) {
          yieldedAny = true;
          yield { t: 'reasoning', text: delta.reasoning };
        }
        if (delta.content !== undefined) {
          yieldedAny = true;
          contentSeen = true;
          yield { t: 'content', text: delta.content };
        }
      }
    } catch (error) {
      if (options.signal?.aborted) {
        return;
      }
      lastClass = classifyThrow(error);
      if (yieldedAny) {
        // Output already reached the consumer: never restart another route on
        // top of it. Throw and let the route surface the failure.
        throw new Error(`chatStream: lane "${options.lane}" stream broke at ${route.label}.`);
      }
      if (clientErrorSeen) {
        throw new Error(
          `chatStream: lane "${options.lane}" failed at ${route.label}=${lastClass}.`,
        );
      }
      continue;
    }

    if (!contentSeen) {
      // Mirror chat()'s empty-text failover: a route that produced no answer
      // text is not a success. Once anything has been yielded we cannot fail
      // over without corrupting the event order, so we throw instead.
      if (yieldedAny) {
        throw new Error(
          `chatStream: lane "${options.lane}" produced no content from ${route.label}.`,
        );
      }
      lastClass = 'empty-stream';
      if (clientErrorSeen) {
        throw new Error(
          `chatStream: lane "${options.lane}" failed at ${route.label}=empty-stream.`,
        );
      }
      continue;
    }

    yield buildDone(usdCost);
    return;
  }

  throw new Error(
    `chatStream: all routes on lane "${options.lane}" failed` +
      (lastLabel === '' ? '.' : ` (last: ${lastLabel}=${lastClass || 'failed'}).`),
  );
}
