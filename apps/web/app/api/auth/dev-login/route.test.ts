// Tests for POST /api/auth/dev-login (dev-only founder login).
//
// The handler mints a real trial account + session through the SessionStore
// seam and sets the `corvus_session` cookie, so the whole trial-gated product
// works unchanged without Discord OAuth. The store seam is injected with a
// memory store, so every assertion is hermetic — no database, no skips, no
// Discord network calls.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_COOKIE,
  createMemorySessionStore,
  getSession,
  type SessionStore,
} from '@/lib/auth/session';
import { GET, POST, __resetSessionStore, __setSessionStore } from './route';

function sessionIdFromSetCookie(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(header);
  return match ? decodeURIComponent(match[1]) : null;
}

afterEach(() => {
  __resetSessionStore();
  vi.unstubAllEnvs();
});

describe('POST /api/auth/dev-login', () => {
  it('mints account+session, sets the session cookie, and redirects to /dashboard', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORVUS_DEV_LOGIN', '1');
    const store = createMemorySessionStore();
    __setSessionStore(store);

    const res = await POST();

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
    const sessionId = sessionIdFromSetCookie(res.headers.get('set-cookie'));
    expect(sessionId).toBeTruthy();
    // The minted rows are real: the session resolves through the store seam.
    const session = await getSession(`${SESSION_COOKIE}=${sessionId}`, store);
    expect(session).not.toBeNull();
    expect(session?.discordId).toBe('dev-founder');
  });

  it('answers 404 with an empty body when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORVUS_DEV_LOGIN', '1');
    const base = createMemorySessionStore();
    let upsertCalls = 0;
    const counting: SessionStore = {
      ...base,
      upsertAccountByDiscordId: (discordId, email) => {
        upsertCalls += 1;
        return base.upsertAccountByDiscordId(discordId, email);
      },
    };
    __setSessionStore(counting);

    const res = await POST();

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(upsertCalls).toBe(0);
  });

  it('answers 404 with an empty body when CORVUS_DEV_LOGIN is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    __setSessionStore(createMemorySessionStore());

    const res = await POST();

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('answers 404 when CORVUS_DEV_LOGIN is not exactly 1', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORVUS_DEV_LOGIN', '0');
    __setSessionStore(createMemorySessionStore());

    const res = await POST();

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('answers 500 when the store fails, never throwing unhandled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORVUS_DEV_LOGIN', '1');
    const failing: SessionStore = {
      ...createMemorySessionStore(),
      upsertAccountByDiscordId: () => Promise.reject(new Error('db down')),
    };
    __setSessionStore(failing);

    const res = await POST();

    expect(res.status).toBe(500);
  });
});

describe('GET /api/auth/dev-login', () => {
  it('answers 405 when enabled in dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORVUS_DEV_LOGIN', '1');

    const res = await GET();

    expect(res.status).toBe(405);
  });

  it('answers 404 with an empty body in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORVUS_DEV_LOGIN', '1');

    const res = await GET();

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });
});
