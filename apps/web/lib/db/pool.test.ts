// KI-021: the unconfigured stand-in must never be cached in globalThis.
//
// Reproduction-first. Before the fix, `getPool()` wrote the stand-in into the
// global holder exactly like a real pool, so a DATABASE_URL supplied later in
// the same process was ignored for the rest of that process's life — every
// route kept getting the stand-in and answered 500 'database not configured'
// against a database that was by then fully configured.
//
// The first test below fails on the old implementation (`configured` is the
// same object as `unconfigured`, and it still rejects with
// DatabaseNotConfiguredError). The second pins the property the fix must not
// break: once DATABASE_URL IS set, the real pool is cached and reused.
//
// No network I/O happens here: constructing `new Pool({ connectionString })`
// opens no sockets (clients are created lazily on the first query), and every
// `getPool()` result is cleared by `__resetPool()` between tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

// `@corvus/ai` is mocked at the MODULE BOUNDARY with a spy that delegates to the
// real setter, so `pool.ts`'s handoff to the refill seam is observable (counted
// and identity-checked) while every other assertion in this file — the live-PG
// boundary suite included — still drives real production behaviour. Only the
// seam `getPool()` writes into is observed; `getPool()` itself is not mocked.
const seamSpy = vi.hoisted(() => vi.fn());

vi.mock('@corvus/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@corvus/ai')>();
  seamSpy.mockImplementation((pool: unknown) => {
    actual.__setRefillPool(pool as Parameters<typeof actual.__setRefillPool>[0]);
  });
  return { ...actual, __setRefillPool: seamSpy };
});

import {
  REFILL_CREDITS_SQL,
  __resetRefillPool,
  __setRefillPool,
  refillAllowance,
} from '@corvus/ai';
import { DatabaseNotConfiguredError, TEST_DATABASE_URL, __resetPool, getPool } from './pool';

const REAL_URL = 'postgresql://corvus:corvus_ci@127.0.0.1:5434/corvus_ci';

describe('getPool stand-in caching (KI-021)', () => {
  const previous = process.env.DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
    __resetPool();
    __resetRefillPool();
  });

  it('does not cache the unconfigured stand-in, so a later DATABASE_URL is honored', async () => {
    __resetPool();
    delete process.env.DATABASE_URL;

    const unconfigured = getPool();
    await expect(unconfigured.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseNotConfiguredError);

    process.env.DATABASE_URL = REAL_URL;

    const configured = getPool();
    // Before the fix: `configured === unconfigured` and this identity fails.
    expect(configured).not.toBe(unconfigured);
    // The later URL was actually read (Pool keeps its config on `.options`).
    expect(configured.options.connectionString).toBe(REAL_URL);
  });

  it('still caches and reuses a real pool once DATABASE_URL is set', () => {
    __resetPool();
    process.env.DATABASE_URL = REAL_URL;

    const first = getPool();
    const second = getPool();
    expect(second).toBe(first);
    expect(first.options.connectionString).toBe(REAL_URL);
  });
});

// Web refill-pool wiring guard (webwire, 2026-09-23).
//
// `apps/web/lib/db/pool.ts` hands the pool it constructs to the `@corvus/ai`
// refill seam (`__setRefillPool(pool)`) so `refillAllowance()` reads the SAME
// pool every route reads through `getPool()`. The hermetic suites inject via
// `__setPool`, which never enters the `new Pool(...)` branch where the wiring
// lives — so nothing else in this file can detect the wiring line going
// missing. These tests close that gap WITHOUT a live database: they let
// `getPool()` take the real construction branch (an unroutable URL; `pg`
// opens sockets lazily on first query, never at construction), intercept the
// constructed pool's `query`, and assert the seam names that pool.
//
// Break-and-watch-it-fail (the guard is only a guard if it fails when the
// wiring is removed): with `__setRefillPool(pool);` commented out in
// `pool.ts`, the positive guard test FAILS (seam reads 0, no query issued)
// while the stand-in pin still passes by design. With the line restored, all
// PASS. Verified 2026-09-23 (see the task report).
describe('refill-pool wiring guard (webwire)', () => {
  const previous = process.env.DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
    __resetPool();
    __resetRefillPool();
  });

  it('wires the constructed pool to the refill seam exactly once per process', async () => {
    __resetPool();
    __resetRefillPool();
    process.env.DATABASE_URL = REAL_URL;

    const pool = getPool();
    const second = getPool();
    expect(second).toBe(pool);

    // Observation WITHOUT calling a second setter: the seam must already name
    // the pool this process reads through `getPool()`. `refillAllowance` only
    // answers non-zero when the seam holds a pool whose query returns a
    // positive sum, so intercept the constructed pool's query and check the
    // full path: getPool() -> seam -> that pool -> the shared SQL idiom.
    const calls: { text: string; params: unknown[] }[] = [];
    pool.query = (async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [{ refills: 1000 }] };
    }) as typeof pool.query;

    await expect(refillAllowance('guard-account')).resolves.toBe(1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toBe(REFILL_CREDITS_SQL);
    expect(calls[0]?.params).toEqual(['guard-account', 'refill']);
  });

  it('does not wire the unconfigured stand-in to the refill seam', async () => {
    __resetPool();
    __resetRefillPool();
    delete process.env.DATABASE_URL;

    const standin = getPool();
    await expect(standin.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseNotConfiguredError);

    // The stand-in's query rejects with DatabaseNotConfiguredError; the seam
    // is absence-tolerant and reads it as zero rather than failing. What
    // matters: the seam was NOT handed the stand-in at module scope — if it
    // had been, a real DATABASE_URL supplied later would still read refills
    // through the dead object.
    await expect(refillAllowance('guard-account')).resolves.toBe(0);
  });
});

// Permanent call-shape guard: the seam handoff is COUNTED, not merely observed
// through its effect. The suite above can only see that SOME pool reached the
// seam (it reads through whatever the seam holds); this one names the call —
// once per real-pool construction, with the cached instance — and pins that the
// unconfigured stand-in never reaches it. The count comes from the real
// `getPool()` on the real module; only the seam's setter is intercepted, so a
// passing count means production ran, not that the branch was modelled here.
describe('refill-pool wiring call shape (guard)', () => {
  const previous = process.env.DATABASE_URL;

  beforeEach(() => {
    // Construction calls recorded by an earlier test must not leak into this
    // one's count. (`mockClear` empties call state only; the delegating
    // implementation installed at module scope is preserved.)
    seamSpy.mockClear();
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
    __resetPool();
    __resetRefillPool();
  });

  it('instruments the real seam (the mock actually intercepts pool.ts)', () => {
    // Instrument validation, not an assertion about the product: the named
    // import must BE the spy. If `vi.mock` ever stops intercepting (wrong
    // specifier, a second copy of `@corvus/ai` in the graph), the identity
    // below fails and every count assertion in this block is meaningless —
    // so this test is what makes the other two trustworthy.
    expect(__setRefillPool).toBe(seamSpy);
    expect(vi.isMockFunction(__setRefillPool)).toBe(true);
  });

  it('calls the refill seam exactly once per real-pool construction, with that pool', () => {
    __resetPool();
    __resetRefillPool();
    process.env.DATABASE_URL = REAL_URL;

    const pool = getPool();
    expect(seamSpy).toHaveBeenCalledTimes(1);
    // Identity, not shape: the seam must name the very instance every route
    // reads through `getPool()`, not a lookalike or a second pool.
    expect(seamSpy.mock.calls[0]?.[0]).toBe(pool);
    expect(seamSpy.mock.calls[0]?.[0]).toBe(getPool());

    // Cached re-entry does not re-wire: the early return is what makes the
    // "exactly once per process" property true rather than incidental.
    getPool();
    getPool();
    expect(seamSpy).toHaveBeenCalledTimes(1);

    // Resetting the holder and constructing again is a NEW construction, so
    // the seam is handed the new pool — proving the count tracks real
    // construction and is not a one-shot that could pass while broken.
    __resetPool();
    const rebuilt = getPool();
    expect(rebuilt).not.toBe(pool);
    expect(seamSpy).toHaveBeenCalledTimes(2);
    expect(seamSpy.mock.calls[1]?.[0]).toBe(rebuilt);
  });

  it('does not call the refill seam on the unconfigured stand-in path (KI-021)', async () => {
    __resetPool();
    __resetRefillPool();
    delete process.env.DATABASE_URL;

    const standin = getPool();
    await expect(standin.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseNotConfiguredError);

    // The dead object must never become the seam: `refillAllowance` swallows a
    // rejecting pool into 0, so wiring it would silently zero a paying
    // customer's refills for the life of the process.
    expect(seamSpy).not.toHaveBeenCalled();
    await expect(refillAllowance('guard-account')).resolves.toBe(0);

    // ...and the stand-in is deliberately uncached, so the SAME process
    // constructs a real pool once a URL appears — which is exactly when the
    // seam must be wired.
    process.env.DATABASE_URL = REAL_URL;
    const configured = getPool();
    expect(configured).not.toBe(standin);
    expect(seamSpy).toHaveBeenCalledTimes(1);
    expect(seamSpy.mock.calls[0]?.[0]).toBe(configured);
  });
});

// 90-day refill boundary against live Postgres (repo live-PG idiom).
//
// SQL under test (`packages/ai/src/budget.ts` REFILL_CREDITS_SQL, mirrored by
// `apps/web/app/api/credits/route.ts` REFILL_CREDITS_SQL):
//   SELECT COALESCE(SUM(amount_cr), 0) AS refills FROM credit_ledger
//   WHERE account_id = $1 AND reason = $2
//     AND created_at >= now() - interval '90 days'
//
// Proof: insert an 89-day-old refill row (inside the window, must count) and
// a 91-day-old refill row (outside the window, must NOT count), then read
// through the real `refillAllowance` wired to a live pool. The suite SKIPS
// (never passes silently) when Postgres is unreachable, per the repo's
// loud-skip idiom.
const liveConnectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

async function probeLiveDatabase(): Promise<{ ok: boolean; reason: string }> {
  const probe = new Pool({ connectionString: liveConnectionString, connectionTimeoutMillis: 3000 });
  try {
    await probe.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'connection failed' };
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const liveProbe = await probeLiveDatabase();
const liveSkipReason =
  `Postgres unreachable at ${liveConnectionString} ` +
  `(${process.env.DATABASE_URL ? 'DATABASE_URL' : 'default TEST_DATABASE_URL'}): ${liveProbe.reason}`;
if (!liveProbe.ok) {
  console.warn(
    `[lib/db/pool.test] LOUD SKIP: ${liveSkipReason}. ` +
      'The live-PG 90-day boundary describe needs TEST_DATABASE_URL (or DATABASE_URL) ' +
      'with migration 0011 applied; the hermetic guard above still ran.',
  );
}

describe.skipIf(!liveProbe.ok)('refill 90-day boundary on live Postgres', () => {
  it('counts an 89-day-old refill and excludes a 91-day-old refill', async () => {
    const pool = new Pool({
      connectionString: liveConnectionString,
      connectionTimeoutMillis: 3000,
    });
    const discordId = `poolguard-live-${Date.now()}`;
    try {
      const inserted = await pool.query<{ id: string }>(
        'INSERT INTO accounts (discord_id, tier) VALUES ($1, $2) RETURNING id',
        [discordId, 'trial'],
      );
      const accountId = inserted.rows[0]?.id;
      expect(accountId).toBeDefined();
      if (accountId === undefined) return;

      await pool.query(
        "INSERT INTO credit_ledger (account_id, reason, amount_cr, created_at) VALUES ($1, 'refill', 1000, now() - interval '89 days')",
        [accountId],
      );
      await pool.query(
        "INSERT INTO credit_ledger (account_id, reason, amount_cr, created_at) VALUES ($1, 'refill', 5000, now() - interval '91 days')",
        [accountId],
      );

      __resetRefillPool();
      // Read through the real `refillAllowance` with the seam naming the live
      // pool (the same handoff `getPool()` performs in production).
      __setRefillPool(pool);

      // Asserted as a single exact number, not a range: the costly defect is
      // the aged row that should not be there (5000 leaking in would read
      // 6000 instead of 1000).
      await expect(refillAllowance(accountId)).resolves.toBe(1000);
    } finally {
      __resetRefillPool();
      await pool
        .query('DELETE FROM accounts WHERE discord_id = $1', [discordId])
        .catch(() => undefined);
      await pool.end().catch(() => undefined);
    }
  });
});
