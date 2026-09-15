// Unit tests for Discord OAuth login: state single-use/replay, callback
// success + failure paths with mocked Discord HTTP, getSession edge cases +
// rolling logic, logout clearing. No network calls: every Discord HTTP call
// goes through an injected stub fetch; the real `fetch` is never touched.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import {
  DISCORD_AUTHORIZE_URL,
  DiscordApiError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  getDiscordConfig,
} from './discord';
import type { DiscordOAuthConfig, DiscordUser, FetchFn } from './discord';
import {
  PgOAuthStateStore,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  buildClearedSessionCookie,
  buildSessionCookie,
  createMemoryOAuthStateStore,
  createMemorySessionStore,
  getSession,
  handleLogout,
  handleOAuthCallback,
  sweepExpired,
} from './session';
import type { SessionStore } from './session';

const TEST_CONFIG: DiscordOAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  appUrl: 'http://localhost:3000',
  redirectUri: 'http://localhost:3000/api/auth/callback',
};

function stubFetch(handler: (url: string) => Response): FetchFn {
  return (input: string) => Promise.resolve(handler(input));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function throwingStore(): SessionStore {
  const fail = (): Promise<never> => Promise.reject(new Error('db down'));
  return {
    findSessionWithAccount: fail,
    touchSession: () => fail(),
    deleteSession: () => fail(),
    upsertAccountByDiscordId: () => fail(),
    createSession: () => fail(),
  };
}

describe('oauth state store', () => {
  it('mints unique states that consume exactly once (replay fails)', async () => {
    const store = createMemoryOAuthStateStore();
    const first = await store.mint();
    const second = await store.mint();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.consume(first)).toBe(true);
    expect(await store.consume(first)).toBe(false);
    expect(await store.consume(second)).toBe(true);
    expect(await store.consume(second)).toBe(false);
  });

  it('rejects unknown states', async () => {
    const store = createMemoryOAuthStateStore();
    expect(await store.consume('nope')).toBe(false);
  });

  it('expires states after 10 minutes', async () => {
    let now = 1_000_000;
    const store = createMemoryOAuthStateStore(() => now);
    const state = await store.mint();
    now += 10 * 60 * 1000 + 1;
    expect(await store.consume(state)).toBe(false);
  });

  it('accepts states just inside the 10-minute window', async () => {
    let now = 1_000_000;
    const store = createMemoryOAuthStateStore(() => now);
    const state = await store.mint();
    now += 10 * 60 * 1000 - 1_000;
    expect(await store.consume(state)).toBe(true);
  });
});

describe('discord helpers', () => {
  it('builds the authorize URL with the identify scope and state', () => {
    const url = new URL(buildAuthorizeUrl('state-123', TEST_CONFIG));
    expect(`${url.origin}${url.pathname}`).toBe(DISCORD_AUTHORIZE_URL);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(TEST_CONFIG.redirectUri);
    expect(url.searchParams.get('scope')).toBe('identify');
    expect(url.searchParams.get('state')).toBe('state-123');
  });

  it('reads secrets from env only and rejects missing values', () => {
    const config = getDiscordConfig({
      DISCORD_CLIENT_ID: 'id',
      DISCORD_CLIENT_SECRET: 'secret',
      APP_URL: 'https://example.com/',
    } as unknown as NodeJS.ProcessEnv);
    expect(config.redirectUri).toBe('https://example.com/api/auth/callback');
    expect(() => getDiscordConfig({} as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() =>
      getDiscordConfig({ NEXT_PUBLIC_X: 'y' } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('exchanges a code for the access token', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchFn: FetchFn = (input, init) => {
      seen.push({ url: input, init });
      return Promise.resolve(jsonResponse({ access_token: 'token-abc', token_type: 'Bearer' }));
    };
    const token = await exchangeCodeForToken('code-1', TEST_CONFIG, fetchFn);
    expect(token).toBe('token-abc');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toContain('discord.com/api/oauth2/token');
    expect(seen[0]?.init?.method).toBe('POST');
  });

  it('maps token-endpoint failures to a coded error with no body text', async () => {
    const fetchFn = stubFetch(() => jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(exchangeCodeForToken('bad', TEST_CONFIG, fetchFn)).rejects.toMatchObject({
      code: 'token_exchange_failed',
    });
    const networkDown: FetchFn = () => Promise.reject(new Error('socket hang up'));
    await expect(exchangeCodeForToken('bad', TEST_CONFIG, networkDown)).rejects.toMatchObject({
      code: 'token_exchange_failed',
    });
    const malformed = stubFetch(() => jsonResponse({ nope: true }));
    await expect(exchangeCodeForToken('bad', TEST_CONFIG, malformed)).rejects.toMatchObject({
      code: 'token_exchange_failed',
    });
  });

  it('fetches the Discord user id with a Bearer token', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchFn: FetchFn = (input, init) => {
      seen.push({ url: input, init });
      return Promise.resolve(jsonResponse({ id: 'discord-1', email: 'a@b.c' }));
    };
    const user = await fetchDiscordUser('token-abc', fetchFn);
    expect(user).toEqual({ id: 'discord-1', email: 'a@b.c' });
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-abc');
  });

  it('maps profile failures to a coded error', async () => {
    const denied = stubFetch(() => jsonResponse({ message: '401: Unauthorized' }, 401));
    await expect(fetchDiscordUser('bad', denied)).rejects.toMatchObject({
      code: 'profile_fetch_failed',
    });
  });
});

describe('handleOAuthCallback', () => {
  const discordStubs: {
    exchangeCode: (code: string, config: DiscordOAuthConfig) => Promise<string>;
    fetchUser: (accessToken: string) => Promise<DiscordUser>;
  } = {
    exchangeCode: () => Promise.resolve('access-token'),
    fetchUser: () => Promise.resolve({ id: 'discord-9', email: 'u@example.com' }),
  };

  it('succeeds end to end and the state cannot be replayed', async () => {
    const stateStore = createMemoryOAuthStateStore();
    const sessionStore = createMemorySessionStore();
    const state = await stateStore.mint();
    const first = await handleOAuthCallback(
      { code: 'code-1', state },
      { stateStore, sessionStore, config: TEST_CONFIG, ...discordStubs },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.accountId).toBeTruthy();
    expect(first.sessionId).toBeTruthy();

    const replay = await handleOAuthCallback(
      { code: 'code-1', state },
      { stateStore, sessionStore, config: TEST_CONFIG, ...discordStubs },
    );
    expect(replay).toEqual({ ok: false, error: 'invalid_state' });
  });

  it('upserts the same account for repeat logins by discord_id', async () => {
    const sessionStore = createMemorySessionStore();
    const run = async (): Promise<string> => {
      const stateStore = createMemoryOAuthStateStore();
      const result = await handleOAuthCallback(
        { code: 'c', state: await stateStore.mint() },
        { stateStore, sessionStore, config: TEST_CONFIG, ...discordStubs },
      );
      if (!result.ok) {
        throw new Error('expected success');
      }
      return result.accountId;
    };
    expect(await run()).toBe(await run());
  });

  it('rejects missing code / missing state / unknown state', async () => {
    const deps = { sessionStore: createMemorySessionStore(), config: TEST_CONFIG, ...discordStubs };
    await expect(handleOAuthCallback({ code: null, state: 's' }, deps)).resolves.toEqual({
      ok: false,
      error: 'missing_code',
    });
    await expect(handleOAuthCallback({ code: 'c', state: null }, deps)).resolves.toEqual({
      ok: false,
      error: 'missing_state',
    });
    await expect(
      handleOAuthCallback(
        { code: 'c', state: 'unknown' },
        { ...deps, stateStore: createMemoryOAuthStateStore() },
      ),
    ).resolves.toEqual({ ok: false, error: 'invalid_state' });
  });

  it('maps exchange / profile / account / session failures to codes, never stacks', async () => {
    const base = {
      sessionStore: createMemorySessionStore(),
      config: TEST_CONFIG,
      ...discordStubs,
    };
    const failExchange = (): Promise<string> => {
      throw new DiscordApiError('token_exchange_failed');
    };
    const failFetch = (): Promise<DiscordUser> => {
      throw new DiscordApiError('profile_fetch_failed');
    };
    const cases: { name: string; deps: typeof base; error: string }[] = [
      {
        name: 'exchange',
        deps: { ...base, exchangeCode: failExchange },
        error: 'token_exchange_failed',
      },
      { name: 'profile', deps: { ...base, fetchUser: failFetch }, error: 'profile_fetch_failed' },
      {
        name: 'account',
        deps: { ...base, sessionStore: throwingStore() },
        error: 'account_failed',
      },
    ];
    for (const testCase of cases) {
      const stateStore = createMemoryOAuthStateStore();
      const result = await handleOAuthCallback(
        { code: 'c', state: await stateStore.mint() },
        { ...testCase.deps, stateStore },
      );
      expect(result).toEqual({ ok: false, error: testCase.error });
      expect(JSON.stringify(result)).not.toContain('Error');
      expect(JSON.stringify(result)).not.toContain(' at ');
    }

    const accountFirst: SessionStore = {
      ...createMemorySessionStore(),
      createSession: () => Promise.reject(new Error('boom')),
    };
    const stateStore = createMemoryOAuthStateStore();
    const sessionFail = await handleOAuthCallback(
      { code: 'c', state: await stateStore.mint() },
      { ...base, sessionStore: accountFirst, stateStore },
    );
    expect(sessionFail).toEqual({ ok: false, error: 'session_failed' });
  });
});

describe('getSession', () => {
  async function seedActive(
    createdAgoMs: number,
  ): Promise<{ store: SessionStore; header: string; accountId: string; sessionId: string }> {
    const realNow = Date.now();
    let fakeNow = realNow - createdAgoMs;
    const store = createMemorySessionStore(() => fakeNow);
    const account = await store.upsertAccountByDiscordId('discord-7', null);
    const session = await store.createSession(account.id, new Date(fakeNow + SESSION_TTL_MS));
    fakeNow = realNow;
    const header = `${SESSION_COOKIE}=${session.id}`;
    return { store, header, accountId: account.id, sessionId: session.id };
  }

  it('returns null for missing, malformed, unknown, and expired cookies — never throws', async () => {
    const store = createMemorySessionStore();
    await expect(getSession(undefined, store)).resolves.toBeNull();
    await expect(getSession(null, store)).resolves.toBeNull();
    await expect(getSession('', store)).resolves.toBeNull();
    await expect(getSession('no-equals-here', store)).resolves.toBeNull();
    await expect(getSession(`${SESSION_COOKIE}=!!!not-a-session!!!`, store)).resolves.toBeNull();
    await expect(
      getSession(`${SESSION_COOKIE}=12345678-1234-1234-1234-123456789012`, store),
    ).resolves.toBeNull();
    await expect(
      getSession(throwingStore().findSessionWithAccount as never, store),
    ).resolves.toBeNull();
    await expect(getSession({ get: () => undefined }, throwingStore())).resolves.toBeNull();

    const expiredStore = createMemorySessionStore();
    const account = await expiredStore.upsertAccountByDiscordId('discord-old', null);
    const expired = await expiredStore.createSession(account.id, new Date(Date.now() - 1000));
    await expect(getSession(`${SESSION_COOKIE}=${expired.id}`, expiredStore)).resolves.toBeNull();
  });

  it('returns the session for a fresh cookie without touching expiry', async () => {
    const seeded = await seedActive(60 * 1000);
    const store = seeded.store;
    const touch = vi.spyOn(store, 'touchSession');
    const info = await getSession(seeded.header, store);
    expect(info).toEqual({ accountId: seeded.accountId, discordId: 'discord-7' });
    expect(touch).not.toHaveBeenCalled();
  });

  it('applies rolling expiry once more than half the TTL is consumed', async () => {
    const twentyDaysMs = 20 * 24 * 60 * 60 * 1000;
    const seeded = await seedActive(twentyDaysMs);
    const store = seeded.store;
    const touch = vi.spyOn(store, 'touchSession');
    const before = Date.now();
    const info = await getSession(seeded.header, store);
    expect(info).toEqual({ accountId: seeded.accountId, discordId: 'discord-7' });
    expect(touch).toHaveBeenCalledTimes(1);
    const touchedAt = touch.mock.calls[0]?.[1];
    expect(touchedAt).toBeInstanceOf(Date);
    expect((touchedAt as Date).getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS - 5000);
  });

  it('accepts a Next-style cookie store object', async () => {
    const seeded = await seedActive(1000);
    const info = await getSession(
      {
        get: (name: string) => (name === SESSION_COOKIE ? { value: seeded.sessionId } : undefined),
      },
      seeded.store,
    );
    expect(info?.accountId).toBe(seeded.accountId);
  });
});

describe('session cookies and logout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function baseFlags(header: string): void {
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=2592000');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  }

  it('sets Secure on https APP_URL and keeps the stable cookie name', () => {
    vi.stubEnv('APP_URL', 'https://example.com');
    const header = buildSessionCookie('session-id-1');
    expect(header).toContain(`${SESSION_COOKIE}=session-id-1`);
    expect(header).toContain('Secure');
    expect(header).not.toContain('__Secure-');
    baseFlags(header);
  });

  it('omits Secure on http APP_URL outside production (name unchanged)', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
    const header = buildSessionCookie('session-id-1');
    expect(header).toContain(`${SESSION_COOKIE}=session-id-1`);
    expect(header).not.toContain('Secure');
    baseFlags(header);
  });

  it('lets the explicit opts override win over the environment', () => {
    vi.stubEnv('APP_URL', 'https://example.com');
    expect(buildSessionCookie('s', { secure: false })).not.toContain('Secure');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
    expect(buildSessionCookie('s', { secure: true })).toContain('Secure');
  });

  it('gates the cleared cookie identically (https -> Secure, http -> absent)', () => {
    vi.stubEnv('APP_URL', 'https://example.com');
    const secureCleared = buildClearedSessionCookie();
    expect(secureCleared).toContain(`${SESSION_COOKIE}=;`);
    expect(secureCleared).toContain('Max-Age=0');
    expect(secureCleared).toContain('Secure');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
    const plainCleared = buildClearedSessionCookie();
    expect(plainCleared).toContain('Max-Age=0');
    expect(plainCleared).not.toContain('Secure');
  });

  it('authenticates a cookie that was set without the Secure flag', async () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
    const store = createMemorySessionStore();
    const account = await store.upsertAccountByDiscordId('discord-plain', null);
    const session = await store.createSession(account.id, new Date(Date.now() + SESSION_TTL_MS));
    const setHeader = buildSessionCookie(session.id);
    expect(setHeader).not.toContain('Secure');
    const info = await getSession(setHeader, store);
    expect(info).toEqual({ accountId: account.id, discordId: 'discord-plain' });
  });

  it('logout deletes the session row and never throws', async () => {
    const store = createMemorySessionStore();
    const account = await store.upsertAccountByDiscordId('discord-bye', null);
    const session = await store.createSession(account.id, new Date(Date.now() + SESSION_TTL_MS));
    await handleLogout(session.id, store);
    await expect(getSession(`${SESSION_COOKIE}=${session.id}`, store)).resolves.toBeNull();

    await expect(handleLogout(null, store)).resolves.toBeUndefined();
    await expect(handleLogout('!!!bad!!!', store)).resolves.toBeUndefined();
    await expect(handleLogout(session.id, throwingStore())).resolves.toBeUndefined();
  });
});

describe('pg oauth state store SQL shape (fake pool, no PG needed)', () => {
  function fakePool(): { pool: Pool; seen: string[] } {
    const seen: string[] = [];
    const pool = {
      query: async (text: string) => {
        seen.push(text);
        if (text.startsWith('INSERT')) {
          return { rows: [], rowCount: 1 };
        }
        if (text.startsWith('DELETE')) {
          const already = seen.filter((entry) => entry.startsWith('DELETE')).length;
          return { rows: already > 1 ? [] : [{ state: 's' }], rowCount: already > 1 ? 0 : 1 };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    } as unknown as Pool;
    return { pool, seen };
  }

  it('mints with an INSERT and consumes with an atomic single-use DELETE..RETURNING', async () => {
    const { pool, seen } = fakePool();
    const store = new PgOAuthStateStore(pool);
    const state = await store.mint();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(seen[0]).toContain('INSERT INTO oauth_states');
    await expect(store.consume(state)).resolves.toBe(true);
    const consumeSql = seen.find((entry) => entry.startsWith('DELETE'));
    expect(consumeSql).toContain('DELETE FROM oauth_states');
    expect(consumeSql).toContain('expires_at > now()');
    expect(consumeSql).toContain('RETURNING');
    // Replay finds no row: single-use without a second round-trip shape.
    await expect(store.consume(state)).resolves.toBe(false);
  });
});

// Inline DDL matching 0003_v12.sql verbatim (oauth_states has no FK deps, so
// it applies standalone). Runs ONLY when the sibling migration file is
// absent; IF NOT EXISTS makes it a no-op once the sibling lands.
const OAUTH_STATES_DDL = `
CREATE TABLE IF NOT EXISTS oauth_states (
  state text PRIMARY KEY,
  code_verifier text NOT NULL,
  return_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON oauth_states (expires_at);
`;

const STATE_FALLBACK_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

describe('pg oauth state store (live PG when reachable, loud skip otherwise)', () => {
  let pool: Pool | null = null;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? STATE_FALLBACK_URL;
    if (!process.env.DATABASE_URL) {
      console.warn(
        'auth.test: DATABASE_URL is unset, falling back to the disposable test container URL.',
      );
    }
    const candidate = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      await candidate.query('SELECT 1');
    } catch (error) {
      console.warn(
        `auth.test: SKIP pg oauth state tests — no Postgres reachable. Cause: ${(error as Error).message}`,
      );
      await candidate.end().catch(() => undefined);
      return;
    }
    try {
      await candidate.query(OAUTH_STATES_DDL);
    } catch (error) {
      console.warn(
        `auth.test: SKIP pg oauth state tests — schema setup failed. Cause: ${(error as Error).message}`,
      );
      await candidate.end().catch(() => undefined);
      return;
    }
    pool = candidate;
  }, 30_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    pool = null;
  });

  function guard(): boolean {
    if (!pool) {
      console.warn('auth.test: SKIP — no database; set DATABASE_URL to run PG state tests.');
      return true;
    }
    return false;
  }

  it('mints a state that consumes exactly once (replay fails)', async () => {
    if (guard()) {
      return;
    }
    const store = new PgOAuthStateStore(pool as Pool);
    const state = await store.mint();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    await expect(store.consume(state)).resolves.toBe(true);
    await expect(store.consume(state)).resolves.toBe(false);
  });

  it('refuses expired states (10-minute TTL enforced in SQL)', async () => {
    if (guard()) {
      return;
    }
    const store = new PgOAuthStateStore(pool as Pool);
    const state = await store.mint();
    await (pool as Pool).query(
      "UPDATE oauth_states SET expires_at = now() - interval '1 second' WHERE state = $1",
      [state],
    );
    await expect(store.consume(state)).resolves.toBe(false);
    await (pool as Pool).query('DELETE FROM oauth_states WHERE state = $1', [state]);
  });

  it('sweeps only expired rows and reports the deleted count', async () => {
    if (guard()) {
      return;
    }
    const store = new PgOAuthStateStore(pool as Pool);
    const live = await store.mint();
    const stale = await store.mint();
    await (pool as Pool).query(
      "UPDATE oauth_states SET expires_at = now() - interval '1 minute' WHERE state = $1",
      [stale],
    );
    const swept = await sweepExpired(pool as Pool);
    expect(swept).toBeGreaterThanOrEqual(1);
    // The live row survives the sweep and still consumes.
    await expect(store.consume(live)).resolves.toBe(true);
    await expect(store.consume(stale)).resolves.toBe(false);
  });
});
