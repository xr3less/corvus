// Exponential backoff for the self-healing supervisor (V1-9).
//
// Grounded in Discord's own reconnect guidance — the gateway recommends
// reconnecting with an exponential backoff rather than hammering the API:
//   https://discord.com/developers/docs/topics/gateway#reconnect
// and in Node's documented timer contract (setTimeout/clearTimeout):
//   https://nodejs.org/api/timers.html
//
// Pure and deterministic by construction: the caller injects `random`, so
// tests pin the exact sequence while production may opt into jitter.

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Fraction of the (capped) delay added as jitter, 0..1. 0 = none. */
  jitterRatio?: number;
}

export const DEFAULT_BASE_DELAY_MS = 1_000;
export const DEFAULT_MAX_DELAY_MS = 30_000;

// `attempt` is 1-based: attempt 1 -> base, attempt 2 -> 2*base, ...
// The result is always an integer number of milliseconds, never above
// maxDelayMs. Throws on a non-positive/non-integer attempt so a caller bug
// fails loudly instead of silently scheduling a zero-delay hot loop.
export function computeBackoffDelay(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('attempt must be an integer >= 1');
  }
  const base = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = options.jitterRatio ?? 0;
  // Cap the exponent so 2 ** (attempt - 1) can never overflow to Infinity for
  // a very large consecutive-crash count.
  const exponent = Math.min(attempt - 1, 53);
  const capped = Math.min(base * 2 ** exponent, max);
  if (jitterRatio <= 0) {
    return capped;
  }
  const span = Math.floor(capped * jitterRatio);
  const jitter = span > 0 ? Math.floor(random() * (span + 1)) : 0;
  return Math.min(capped + jitter, max);
}
