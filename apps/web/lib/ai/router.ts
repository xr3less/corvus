// Provider-agnostic chat router with automatic fallback (T-router).
//
// Every billable AI call runs through this lane loop: routes are tried in
// order, the first healthy response wins, and each attempt is recorded with
// a secret-free class so key/config errors stay visible. No provider SDKs —
// hand-rolled fetch against OpenAI-compatible `/chat/completions` endpoints.
//
// Retry policy (orchestrator contract): 5xx / network / timeout / 429 move
// to the next route. Any other 4xx is a key/config signal: it is recorded,
// the next route is tried exactly once, then the router throws instead of
// retrying forever. Routes whose key is missing (or with no known
// OpenAI-compat path) are skipped without consuming that one extra attempt.
import { extractCost } from './cost';
import { LANES } from './lanes';
import type { LaneName, ProviderRoute } from './lanes';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ChatMessage {
  readonly role: string;
  readonly content: string;
}

export interface ChatOptions {
  readonly lane: LaneName;
  readonly messages: ChatMessage[];
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
  readonly fetchFn?: FetchFn;
}

export interface AttemptRecord {
  readonly label: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly status?: number;
  readonly skipped?: 'no-key' | 'incompatible';
  readonly error?: string;
}

export interface ChatResult {
  readonly text: string;
  readonly model: string;
  readonly lane: LaneName;
  readonly providerCostUsd: number | null;
  readonly attempts: AttemptRecord[];
}

export const ROUTER_TIMEOUT_MS = 90_000;

// Browser-like UA: bare non-browser clients get Cloudflare 1010 on some
// origins. The `corvus-web` token keeps the client identifiable.
const USER_AGENT = 'Mozilla/5.0 (compatible; corvus-web/1.0)';

function describeAttempt(attempt: AttemptRecord): string {
  if (attempt.ok) {
    return 'ok';
  }
  if (attempt.skipped) {
    return `skipped:${attempt.skipped}`;
  }
  if (attempt.status !== undefined) {
    return `http-${attempt.status}`;
  }
  return attempt.error ?? 'failed';
}

export class RouterError extends Error {
  readonly code = 'all_lanes_failed';
  readonly attempts: AttemptRecord[];
  constructor(lane: string, attempts: AttemptRecord[]) {
    const classes = attempts.map((attempt) => `${attempt.label}=${describeAttempt(attempt)}`);
    super(
      `AI router: all routes on lane "${lane}" failed ` +
        `(${attempts.length} attempt(s)). Classes: ${classes.join(', ') || 'none'}.`,
    );
    this.name = 'RouterError';
    this.attempts = attempts;
  }
}

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

function buildBody(route: ProviderRoute, options: ChatOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: route.model,
    messages: options.messages,
    temperature: 0,
    max_tokens: options.maxTokens,
  };
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
  const timer = setTimeout(() => controller.abort(), ms) as unknown as {
    unref?: () => void;
  };
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

/** Classify a thrown fetch failure without keeping any error text. */
function classifyThrow(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  ) {
    return 'timeout';
  }
  return 'network';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** First-choice message text, or null when the body carries no usable text. */
function extractText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0];
  if (typeof first !== 'object' || first === null) {
    return null;
  }
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    const text = content.trim();
    return text === '' ? null : text;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        typeof part === 'object' && part !== null ? (part as { text?: unknown }).text : undefined,
      )
      .filter((text): text is string => typeof text === 'string')
      .join('')
      .trim();
    return text === '' ? null : text;
  }
  return null;
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const routes = LANES[options.lane];
  const attempts: AttemptRecord[] = [];
  if (!routes) {
    throw new RouterError(String(options.lane), attempts);
  }
  if (!Number.isFinite(options.maxTokens) || options.maxTokens <= 0) {
    throw new Error('chat: maxTokens must be a positive finite number');
  }
  const fetchFn: FetchFn = options.fetchFn ?? fetch;
  let clientErrorSeen = false;
  const failOrContinue = (attempt: AttemptRecord): void => {
    attempts.push(attempt);
    if (clientErrorSeen) {
      throw new RouterError(options.lane, attempts);
    }
  };
  for (const route of routes) {
    if (route.compatible === false) {
      attempts.push({ label: route.label, ok: false, latencyMs: 0, skipped: 'incompatible' });
      continue;
    }
    const key = readKey(route);
    if (!key) {
      attempts.push({ label: route.label, ok: false, latencyMs: 0, skipped: 'no-key' });
      continue;
    }
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetchFn(`${resolveBaseURL(route)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(buildBody(route, options)),
        signal: combineWithTimeout(options.signal),
      });
    } catch (error) {
      failOrContinue({
        label: route.label,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: classifyThrow(error),
      });
      continue;
    }
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      const status = response.status;
      if (status >= 400 && status < 500 && status !== 429) {
        attempts.push({ label: route.label, ok: false, latencyMs, status, error: 'http-4xx' });
        if (clientErrorSeen) {
          throw new RouterError(options.lane, attempts);
        }
        // Key/config errors stay visible: exactly one more route, then throw.
        clientErrorSeen = true;
        continue;
      }
      failOrContinue({ label: route.label, ok: false, latencyMs, status });
      continue;
    }
    const body = await readJson(response);
    if (body === undefined) {
      failOrContinue({ label: route.label, ok: false, latencyMs, error: 'bad-json' });
      continue;
    }
    const text = extractText(body);
    if (text === null) {
      failOrContinue({
        label: route.label,
        ok: false,
        latencyMs,
        status: response.status,
        error: 'empty-text',
      });
      continue;
    }
    attempts.push({ label: route.label, ok: true, latencyMs, status: response.status });
    return {
      text,
      model: route.model,
      lane: options.lane,
      providerCostUsd: extractCost(body),
      attempts,
    };
  }
  throw new RouterError(options.lane, attempts);
}
