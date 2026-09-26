// Tests for GET /api/bots/[botId]/versions (Wave 4 compare/undo read side).
//
// Hermetic: pure flag logic + fake-pool request shape always run (no
// database). Read-only is pinned two ways: the module exports no mutation
// handler (POST/PUT/PATCH/DELETE are undefined), and every query the GET
// issues is asserted mutation-free. No Postgres-backed section: the two
// queries mirror the sibling activity route's ownership-first pattern.

import { afterEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { __resetPool, __setPool } from '../../../../../lib/db/pool';
import {
  GET,
  __resetSessionReader,
  __setSessionReader,
  toVersionItems,
  type VersionsSession,
} from './route';
import * as routeModule from './route';

const BOT = '11111111-2222-4333-8444-555555555555';
const OWNER: VersionsSession = { accountId: 'acct-owner', discordId: 'disc-owner' };
const INTRUDER: VersionsSession = { accountId: 'acct-intruder', discordId: 'disc-intruder' };

const V1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const V2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

function actAs(session: VersionsSession | null): void {
  __setSessionReader({ getSession: async () => session });
}

function versionsRequest(botId: string): Request {
  return new Request(`http://localhost/api/bots/${botId}/versions`);
}

function contextFor(botId: string): { params: Promise<{ botId: string }> } {
  return { params: Promise.resolve({ botId }) };
}

interface RecordedQuery {
  text: string;
  params: unknown[];
}

interface FakePool {
  pool: Pool;
  calls: RecordedQuery[];
}

function makeFakePool(
  handler: (text: string, params: unknown[]) => { rowCount: number; rows: unknown[] },
): FakePool {
  const calls: RecordedQuery[] = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return handler(text, params);
    },
  } as unknown as Pool;
  return { pool: fake, calls };
}

function expectReadOnly(calls: readonly RecordedQuery[]): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  }
}

afterEach(() => {
  __resetSessionReader();
  __resetPool();
});

// --- Pure flag logic (no database) ------------------------------------------

describe('toVersionItems (pure)', () => {
  it('flags the draft and prod pointers and converts timestamps to ISO', () => {
    const items = toVersionItems(
      [
        { id: V2, version: 2, created_at: new Date('2026-09-12T10:00:00.000Z') },
        { id: V1, version: 1, created_at: '2026-09-11T10:00:00.000Z' },
      ],
      V2,
      V1,
    );
    expect(items).toEqual([
      { id: V2, version: 2, createdAt: '2026-09-12T10:00:00.000Z', isDraft: true, isProd: false },
      { id: V1, version: 1, createdAt: '2026-09-11T10:00:00.000Z', isDraft: false, isProd: true },
    ]);
  });

  it('flags nothing when neither pointer names a row', () => {
    const items = toVersionItems(
      [{ id: V1, version: 1, created_at: '2026-09-11T10:00:00.000Z' }],
      null,
      null,
    );
    expect(items).toEqual([
      { id: V1, version: 1, createdAt: '2026-09-11T10:00:00.000Z', isDraft: false, isProd: false },
    ]);
  });

  it('returns an empty list for an empty version history', () => {
    expect(toVersionItems([], V1, V1)).toEqual([]);
  });
});

// --- Request shape without a database ---------------------------------------

describe('versions request shape without a database', () => {
  it('returns 401 when unauthenticated, before any validation', async () => {
    __resetSessionReader();
    const res = await GET(versionsRequest('not-a-uuid'), contextFor('not-a-uuid'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('maps a malformed botId to 404 (no existence leak)', async () => {
    actAs(OWNER);
    const res = await GET(versionsRequest('not-a-uuid'), contextFor('not-a-uuid'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('exports no mutation handler — the route is GET-only', () => {
    const exported = routeModule as unknown as Record<string, unknown>;
    expect(exported.POST).toBeUndefined();
    expect(exported.PUT).toBeUndefined();
    expect(exported.PATCH).toBeUndefined();
    expect(exported.DELETE).toBeUndefined();
    expect(typeof routeModule.GET).toBe('function');
  });
});

// --- Fake-pool behaviour (no live database) ---------------------------------

describe('versions route against a fake pool', () => {
  it('returns 404 - never 403 - for an unknown or foreign bot', async () => {
    const { pool: fake, calls } = makeFakePool(() => ({ rowCount: 0, rows: [] }));
    __setPool(fake);
    actAs(INTRUDER);

    const res = await GET(versionsRequest(BOT), contextFor(BOT));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    // Only the ownership probe ran; the version list never leaked.
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('FROM bots');
    expect(calls[0].params).toEqual([BOT, INTRUDER.accountId]);
    expectReadOnly(calls);
  });

  it('returns newest-first rows with draft/prod flags and version numbers and never mutates', async () => {
    const { pool: fake, calls } = makeFakePool((text) =>
      text.includes('FROM bots')
        ? { rowCount: 1, rows: [{ draft_spec_id: V2, prod_spec_id: V1 }] }
        : {
            rowCount: 2,
            rows: [
              { id: V2, version: 2, created_at: '2026-09-12T10:00:00.000Z' },
              { id: V1, version: 1, created_at: '2026-09-11T10:00:00.000Z' },
            ],
          },
    );
    __setPool(fake);
    actAs(OWNER);

    const res = await GET(versionsRequest(BOT), contextFor(BOT));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: unknown };
    expect(body).toEqual({
      versions: [
        { id: V2, version: 2, createdAt: '2026-09-12T10:00:00.000Z', isDraft: true, isProd: false },
        { id: V1, version: 1, createdAt: '2026-09-11T10:00:00.000Z', isDraft: false, isProd: true },
      ],
    });

    // Ownership probe scoped to the session account, version list scoped to
    // the bot — and neither query mutates.
    expect(calls).toHaveLength(2);
    expect(calls[0].params).toEqual([BOT, OWNER.accountId]);
    expect(calls[1].params).toEqual([BOT]);
    expectReadOnly(calls);
  });

  it('returns an empty version list as { versions: [] }', async () => {
    const { pool: fake } = makeFakePool((text) =>
      text.includes('FROM bots')
        ? { rowCount: 1, rows: [{ draft_spec_id: null, prod_spec_id: null }] }
        : { rowCount: 0, rows: [] },
    );
    __setPool(fake);
    actAs(OWNER);

    const res = await GET(versionsRequest(BOT), contextFor(BOT));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ versions: [] });
  });
});

// --- Missing DATABASE_URL maps honestly (KI-021) ----------------------------

describe('versions with DATABASE_URL absent', () => {
  it('answers the canonical database-not-configured 500, never a misleading one', async () => {
    const original = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    actAs(OWNER);
    try {
      const res = await GET(versionsRequest(BOT), contextFor(BOT));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'database not configured' });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      __resetPool();
    }
  });
});
