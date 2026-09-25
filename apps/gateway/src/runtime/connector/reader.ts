// Site-engine bridge A7: connector reader — a never-throwing outbound poll.
//
// Ported SHAPE from apps/testbot/src/connector/reader.ts (idioms only, no
// verbatim paste, never imported): the never-reject contract, TimeoutError
// plus AbortError both mapping to the timeout class, HTTP statuses never
// retried, auth resolved from an env NAME at call time with the value never
// logged. Gateway deltas: fixed 5s timeout, retry backoff 1000ms then 2000ms
// with an injectable sleeper, 60s poll-floor normalization, no file state
// (the in-memory TTL cache lives in index.ts; the Postgres DDL lives in the
// task report as text only, no migration).

export const CONNECTOR_TIMEOUT_MS = 5000;

export const CONNECTOR_POLL_FLOOR_SEC = 60;

export const CONNECTOR_MIN_TTL_SEC = 10;

export const CONNECTOR_RETRY_DELAYS_MS: readonly number[] = [1000, 2000];

export interface ConnectorParams {
  url: string;
  intervalSec: number;
  authEnvName?: string;
  name: string;
}

export type ConnectorFailureClass = 'timeout' | 'network' | 'http' | 'parse' | 'auth';

export interface ConnectorFailure {
  class: ConnectorFailureClass;
  message: string;
  status?: number;
}

export interface ConnectorReading {
  ok: boolean;
  at: string;
  data?: unknown;
  failure?: ConnectorFailure;
}

export interface IntervalNormalization {
  value: number;
  normalized: boolean;
  note?: string;
}

/**
 * Normalize a configured poll interval up to the 60s floor. Values below the
 * floor (or non-finite) come back at the floor with normalized=true and a
 * meta note naming what happened; values at/above pass through floored to
 * whole seconds.
 */
export function normalizeIntervalSec(intervalSec: number): IntervalNormalization {
  if (!Number.isFinite(intervalSec) || intervalSec < CONNECTOR_POLL_FLOOR_SEC) {
    return {
      value: CONNECTOR_POLL_FLOOR_SEC,
      normalized: true,
      note: `intervalSec ${String(intervalSec)} below 60s floor; using 60s`,
    };
  }
  return { value: Math.floor(intervalSec), normalized: false };
}

/** Cache TTL equals the (normalized) poll interval, floored at 10s. */
export function ttlMsForIntervalSec(intervalSec: number): number {
  return Math.max(intervalSec, CONNECTOR_MIN_TTL_SEC) * 1000;
}

export interface ReadConnectorDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function timestamp(): string {
  return new Date().toISOString();
}

function timeoutFailure(): ConnectorFailure {
  return { class: 'timeout', message: 'The request timed out.' };
}

function networkFailure(err: unknown): ConnectorFailure {
  const message = err instanceof Error ? err.message : String(err);
  return { class: 'network', message: message === '' ? 'A network error occurred.' : message };
}

/**
 * Node 24 fetch (undici) rejects with a DOMException named TimeoutError when
 * AbortSignal.timeout() fires while waiting, but AbortError when it lands
 * while the body is streaming — both count as timeouts.
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

/**
 * Read one connector. NEVER throws: every failure path returns
 * { ok: false, at, failure }. Two extra attempts (1000ms then 2000ms backoff)
 * apply to network/timeout failures only — HTTP statuses and bad JSON are
 * returned immediately. Auth resolves the env VALUE from params.authEnvName
 * at call time; only the NAME ever appears in messages, never the value.
 */
export async function readConnector(
  params: ConnectorParams,
  deps: ReadConnectorDeps = {},
): Promise<ConnectorReading> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  try {
    const headers: Record<string, string> = {};
    const authName = params.authEnvName;
    if (typeof authName === 'string' && authName.length > 0) {
      let token: string | undefined;
      try {
        token = process.env[authName];
      } catch {
        token = undefined;
      }
      if (token === undefined || token === '') {
        return {
          ok: false,
          at: timestamp(),
          failure: {
            class: 'auth',
            message: `Connector credentials are not configured (environment variable ${authName} is missing).`,
          },
        };
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const maxAttempts = CONNECTOR_RETRY_DELAYS_MS.length + 1;
    let lastFailure: ConnectorFailure = { class: 'network', message: 'Request failed.' };
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const res = await fetchImpl(params.url, {
          headers,
          signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
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
        try {
          const data: unknown = await res.json();
          return { ok: true, at: timestamp(), data };
        } catch (err) {
          if (isTimeoutError(err)) {
            lastFailure = timeoutFailure();
            if (attempt + 1 < maxAttempts) {
              await sleep(CONNECTOR_RETRY_DELAYS_MS[attempt] ?? 2000);
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
          await sleep(CONNECTOR_RETRY_DELAYS_MS[attempt] ?? 2000);
          continue;
        }
        return { ok: false, at: timestamp(), failure: lastFailure };
      }
    }
    return { ok: false, at: timestamp(), failure: lastFailure };
  } catch (err) {
    return {
      ok: false,
      at: timestamp(),
      failure: isTimeoutError(err) ? timeoutFailure() : networkFailure(err),
    };
  }
}
