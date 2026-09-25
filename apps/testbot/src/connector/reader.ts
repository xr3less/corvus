// Generic outbound HTTP connector reader for the trial bot.
// Game-agnostic: this module knows URLs, timeouts, retries and failure
// classes only. readConnector never throws and never logs credentials.

import { RETRIES, TIMEOUT_MS } from '../config.js';

export interface ConnectorConfig {
  id: string;
  kind: 'json_rest' | 'plaintext_rest';
  url: string;
  intervalSec: number;
  timeoutMs: number;
  authEnv?: string;
  headers?: Record<string, string>;
}

export interface ConnectorFailure {
  class: 'timeout' | 'network' | 'http' | 'parse' | 'auth';
  message: string;
  status?: number;
}

export interface ConnectorReading {
  ok: boolean;
  at: string;
  data?: unknown;
  failure?: ConnectorFailure;
}

/** Retry backoff between attempts: 100ms, then 300ms (2 extra attempts). */
const RETRY_DELAYS_MS: readonly number[] = [100, 300];

function timestamp(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Node 24's fetch (undici) rejects with a DOMException named 'TimeoutError'
 * when AbortSignal.timeout() fires while waiting, but 'AbortError' when it
 * lands while the body is streaming — handle both as timeouts.
 */
function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'TimeoutError' || err.name === 'AbortError';
  }
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = (err as { name?: unknown }).name;
    return name === 'TimeoutError' || name === 'AbortError';
  }
  return false;
}

function timeoutFailure(): ConnectorFailure {
  return { class: 'timeout', message: 'The request timed out.' };
}

function networkFailure(err: unknown): ConnectorFailure {
  const message = err instanceof Error ? err.message : String(err);
  return { class: 'network', message: message === '' ? 'A network error occurred.' : message };
}

/**
 * Read one connector. NEVER throws: every failure path returns
 * { ok: false, at, failure }. Retries (2 extra attempts) apply to
 * network/timeout failures only — HTTP statuses are never retried.
 */
export async function readConnector(c: ConnectorConfig): Promise<ConnectorReading> {
  try {
    const headers: Record<string, string> = { ...(c.headers ?? {}) };
    if (c.authEnv !== undefined && c.authEnv !== '') {
      const token = process.env[c.authEnv];
      if (token === undefined || token === '') {
        return {
          ok: false,
          at: timestamp(),
          failure: {
            class: 'auth',
            message: `Credentials are not configured (environment variable ${c.authEnv} is missing).`,
          },
        };
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const timeoutMs = Number.isFinite(c.timeoutMs) ? c.timeoutMs : TIMEOUT_MS;
    const maxAttempts = RETRIES + 1;
    let lastFailure: ConnectorFailure = { class: 'network', message: 'Request failed.' };

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const res = await fetch(c.url, {
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          return {
            ok: false,
            at: timestamp(),
            failure: {
              class: 'http',
              message: `Request failed with status ${res.status}.`,
              status: res.status,
            },
          };
        }
        if (c.kind === 'plaintext_rest') {
          try {
            const text = await res.text();
            return { ok: true, at: timestamp(), data: text };
          } catch (err) {
            if (isTimeoutError(err)) {
              lastFailure = timeoutFailure();
              if (attempt + 1 < maxAttempts) {
                await sleep(RETRY_DELAYS_MS[attempt] ?? 300);
                continue;
              }
              return { ok: false, at: timestamp(), failure: lastFailure };
            }
            throw err;
          }
        }
        try {
          const data: unknown = await res.json();
          return { ok: true, at: timestamp(), data };
        } catch (err) {
          if (isTimeoutError(err)) {
            lastFailure = timeoutFailure();
            if (attempt + 1 < maxAttempts) {
              await sleep(RETRY_DELAYS_MS[attempt] ?? 300);
              continue;
            }
            return { ok: false, at: timestamp(), failure: lastFailure };
          }
          return {
            ok: false,
            at: timestamp(),
            failure: { class: 'parse', message: 'Response is not valid JSON.' },
          };
        }
      } catch (err) {
        lastFailure = isTimeoutError(err) ? timeoutFailure() : networkFailure(err);
        if (
          attempt + 1 < maxAttempts &&
          (lastFailure.class === 'timeout' || lastFailure.class === 'network')
        ) {
          await sleep(RETRY_DELAYS_MS[attempt] ?? 300);
          continue;
        }
        return { ok: false, at: timestamp(), failure: lastFailure };
      }
    }
    return { ok: false, at: timestamp(), failure: lastFailure };
  } catch (err) {
    // Absolute safety net: this function never rejects.
    return {
      ok: false,
      at: timestamp(),
      failure: isTimeoutError(err) ? timeoutFailure() : networkFailure(err),
    };
  }
}
