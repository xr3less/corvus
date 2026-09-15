import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionReader as AnswerSessionReader } from '../../app/api/interview/answer/route';
import {
  POST as startPOST,
  __resetSessionReader as resetStartReader,
  __setPool as setStartPool,
  __setSessionReader as setStartReader,
  type SessionReader as StartSessionReader,
} from '../../app/api/interview/start/route';
import { createMemorySessionStore, SESSION_COOKIE } from '../auth/session';
import { createSessionReader, defaultSessionReader } from './session-bind';

const DISCORD_ID = '987654321';
const FAKE_INTERVIEW_ID = '11111111-1111-4111-8111-111111111111';

async function setupStore(): Promise<{
  store: ReturnType<typeof createMemorySessionStore>;
  accountId: string;
  sessionId: string;
}> {
  const store = createMemorySessionStore();
  const account = await store.upsertAccountByDiscordId(DISCORD_ID, null);
  const session = await store.createSession(account.id, new Date(Date.now() + 60 * 60 * 1000));
  return { store, accountId: account.id, sessionId: session.id };
}

function postRequest(cookie: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) {
    headers.cookie = cookie;
  }
  return new Request('http://localhost/api/interview/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({ botName: 'Scout' }),
  });
}

function fakePool(): Pool {
  return {
    query: async () => ({ rows: [{ id: FAKE_INTERVIEW_ID }] }),
  } as unknown as Pool;
}

afterEach(() => {
  resetStartReader();
});

describe('session-bind adapter', () => {
  it('returns the session for a valid corvus_session cookie', async () => {
    const { store, accountId, sessionId } = await setupStore();
    const req = postRequest(`${SESSION_COOKIE}=${sessionId}`);
    await expect(createSessionReader(store).getSession(req)).resolves.toEqual({
      accountId,
      discordId: DISCORD_ID,
    });
  });

  it('returns null for a malformed cookie value (fail closed)', async () => {
    const { store } = await setupStore();
    const req = postRequest(`${SESSION_COOKIE}=!!!not-a-session!!!`);
    await expect(createSessionReader(store).getSession(req)).resolves.toBeNull();
  });

  it('returns null when no session cookie is present (fail closed)', async () => {
    const { store } = await setupStore();
    const req = postRequest(null);
    await expect(createSessionReader(store).getSession(req)).resolves.toBeNull();
  });

  it('returns null for a well-formed but unknown session id (fail closed)', async () => {
    const { store } = await setupStore();
    const req = postRequest(`${SESSION_COOKIE}=0123456789abcdef0123456789abcdef`);
    await expect(createSessionReader(store).getSession(req)).resolves.toBeNull();
  });

  it('never throws when the request object itself is broken', async () => {
    const { store } = await setupStore();
    const broken = {
      headers: {
        get: () => {
          throw new Error('boom');
        },
      },
    } as unknown as Request;
    await expect(createSessionReader(store).getSession(broken)).resolves.toBeNull();
  });

  it("is assignable to both interview routes' SessionReader types", () => {
    const asStartReader: StartSessionReader = defaultSessionReader;
    const asAnswerReader: AnswerSessionReader = defaultSessionReader;
    expect(asStartReader).toBe(defaultSessionReader);
    expect(asAnswerReader).toBe(defaultSessionReader);
  });
});

describe('start route with the adapter bound', () => {
  it('sees the session for a valid cookie (200)', async () => {
    const { store, sessionId } = await setupStore();
    setStartReader(createSessionReader(store));
    setStartPool(fakePool());
    const res = await startPOST(postRequest(`${SESSION_COOKIE}=${sessionId}`));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = body as { interviewId?: unknown; question?: unknown };
    expect(parsed.interviewId).toBe(FAKE_INTERVIEW_ID);
    expect(parsed.question).toBeDefined();
  });

  it('still fails closed (401) on a bad cookie', async () => {
    const { store } = await setupStore();
    setStartReader(createSessionReader(store));
    setStartPool(fakePool());
    const res = await startPOST(postRequest(`${SESSION_COOKIE}=!!!not-a-session!!!`));
    expect(res.status).toBe(401);
  });
});
