// Tests for GET /api/session/trial (KI-033 trial-signal follow-up).
//
// The trial clock is server truth (accounts.trial_ends_at) and the dashboard
// pages are 'use client', so they read this narrow endpoint instead of
// guessing from the bare bot rows. The shape is locked: 401
// { error: 'unauthorized' } with no session, else 200
// { trialExpired: boolean } via the single isTrialExpired predicate — no other
// shape. The route's store seam is injected with memory stores seeded to
// explicit clocks (past = expired, future = running, none = fail-open), so
// every assertion is hermetic — no database, no skips.
import { afterEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createMemorySessionStore,
  type SessionStore,
} from '@/lib/auth/session';
import { GET, __resetSessionStore, __setSessionStore } from './route';

function trialRequest(sessionId: string | null): Request {
  const headers: Record<string, string> = {};
  if (sessionId !== null) {
    headers.cookie = `${SESSION_COOKIE}=${sessionId}`;
  }
  return new Request('http://localhost/api/session/trial', { headers });
}

// Seeds a memory store to one session; the account row is then stamped with
// the given clock directly (the double passes account.trial_ends_at straight
// through findSessionWithAccount, so mutating the row is the honest way to
// express "this clock" through the real getSession path — no second query,
// no private-field reach-in: upsert returns the live row object the store
// itself holds).
async function signInWithClock(
  clock: Date | string | null | undefined,
): Promise<{ store: SessionStore; sessionId: string }> {
  const store = createMemorySessionStore();
  const account = await store.upsertAccountByDiscordId(`trial-signal-${String(clock)}`, null);
  if (clock !== undefined) {
    account.trial_ends_at = clock;
  }
  const session = await store.createSession(account.id, new Date(Date.now() + SESSION_TTL_MS));
  return { store, sessionId: session.id };
}

afterEach(() => {
  __resetSessionStore();
});

describe('GET /api/session/trial', () => {
  it('answers 401 { error: unauthorized } with no session cookie', async () => {
    const res = await GET(trialRequest(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('answers 401 for a well-formed but unknown session id', async () => {
    const { store } = await signInWithClock(undefined);
    __setSessionStore(store);
    const res = await GET(trialRequest('0123456789abcdef0123456789abcdef'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('answers 200 { trialExpired: true } for a past clock', async () => {
    const { store, sessionId } = await signInWithClock(new Date(Date.now() - 3_600_000));
    __setSessionStore(store);
    const res = await GET(trialRequest(sessionId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trialExpired: true });
  });

  it('answers 200 { trialExpired: false } for a running clock', async () => {
    const { store, sessionId } = await signInWithClock(new Date(Date.now() + 3_600_000));
    __setSessionStore(store);
    const res = await GET(trialRequest(sessionId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trialExpired: false });
  });

  it('answers 200 { trialExpired: false } for an explicit null clock (fail-open)', async () => {
    const { store, sessionId } = await signInWithClock(null);
    __setSessionStore(store);
    const res = await GET(trialRequest(sessionId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trialExpired: false });
  });

  it('answers 200 { trialExpired: false } when the session carries no clock at all', async () => {
    // The double-created row carries no trial_ends_at key (undefined) — the
    // pre-migration shape. Fail-open: undefined is NOT expired.
    const { store, sessionId } = await signInWithClock(undefined);
    __setSessionStore(store);
    const res = await GET(trialRequest(sessionId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trialExpired: false });
  });
});
