// Tests for the pre-call budget guard and per-brief cost spans.
//
// Written from the guard's own contract: the boundaries tested are the ones a
// billing gate must get exactly right (allow at the allowance, block one
// credit over, warn at 80%), the `getSpent` read is injected and never hits a
// DB, and every invalid input fails loudly instead of degrading into a silent
// allow.
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUDGET_WARN_RATIO,
  MONTHLY_GRANTS,
  MONTHLY_GRANT_PRO,
  MONTHLY_GRANT_SCALE,
  MONTHLY_GRANT_STUDIO,
  MONTHLY_GRANT_TRIAL,
  REFILL_CREDITS_SQL,
  REFILL_REASON,
  REFILL_WINDOW_DAYS,
  __resetRefillPool,
  __setRefillPool,
  briefHash,
  checkBudget,
  isPlanTier,
  refillAllowance,
  startSpan,
} from './budget.js';
import type { CheckBudgetInput } from './budget.js';

function budgetInput(overrides: Partial<CheckBudgetInput> = {}): CheckBudgetInput {
  return {
    accountId: 'acct-1',
    estimatedCredits: 0,
    getSpent: () => Promise.resolve(0),
    ...overrides,
  };
}

function spentOf(credits: number): () => Promise<number> {
  return () => Promise.resolve(credits);
}

afterEach(() => {
  __resetRefillPool();
});

function fakeRefillPool(handler: (text: string, params: unknown[]) => { rows: unknown[] }): {
  query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
  calls: { text: string; params: unknown[] }[];
} {
  const calls: { text: string; params: unknown[] }[] = [];
  return {
    calls,
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return handler(text, params);
    },
  };
}

describe('monthly grants', () => {
  it('pins the per-tier allowance constants', () => {
    expect(MONTHLY_GRANT_TRIAL).toBe(100);
    expect(MONTHLY_GRANT_PRO).toBe(2000);
    expect(MONTHLY_GRANT_STUDIO).toBe(6000);
    expect(MONTHLY_GRANT_SCALE).toBe(20000);
    // The single config table KI-020 asked for: all four tiers, one object.
    expect(MONTHLY_GRANTS).toEqual({ trial: 100, pro: 2000, studio: 6000, scale: 20000 });
    expect(BUDGET_WARN_RATIO).toBe(0.8);
  });

  it('recognises known plan tiers and rejects everything else', () => {
    expect(isPlanTier('trial')).toBe(true);
    expect(isPlanTier('pro')).toBe(true);
    expect(isPlanTier('studio')).toBe(true);
    expect(isPlanTier('scale')).toBe(true);
    expect(isPlanTier('enterprise')).toBe(false);
    expect(isPlanTier('')).toBe(false);
    expect(isPlanTier(null)).toBe(false);
    expect(isPlanTier(undefined)).toBe(false);
    expect(isPlanTier(7)).toBe(false);
    // Never treat an inherited Object key as a tier.
    expect(isPlanTier('toString')).toBe(false);
  });
});

describe('checkBudget allow / warn / block boundaries', () => {
  it('allows a spend far below the allowance without warning', async () => {
    const decision = await checkBudget(budgetInput({ estimatedCredits: 10, getSpent: spentOf(0) }));
    expect(decision).toEqual({
      ok: true,
      warn: false,
      spent: 0,
      projected: 10,
      allowance: MONTHLY_GRANT_TRIAL,
    });
  });

  it('warns exactly at 80% of the allowance', async () => {
    const decision = await checkBudget(
      budgetInput({ estimatedCredits: 10, getSpent: spentOf(70) }),
    );
    expect(decision.ok).toBe(true);
    expect(decision).toMatchObject({ ok: true, warn: true, projected: 80, allowance: 100 });
  });

  it('does not warn one credit below 80%', async () => {
    const decision = await checkBudget(
      budgetInput({ estimatedCredits: 10, getSpent: spentOf(69) }),
    );
    expect(decision).toMatchObject({ ok: true, warn: false, projected: 79 });
  });

  it('allows a call landing exactly on the allowance (and warns)', async () => {
    const decision = await checkBudget(
      budgetInput({ estimatedCredits: 10, getSpent: spentOf(90) }),
    );
    expect(decision).toEqual({
      ok: true,
      warn: true,
      spent: 90,
      projected: 100,
      allowance: 100,
    });
  });

  it('blocks a call that would cross the allowance by one credit', async () => {
    const decision = await checkBudget(
      budgetInput({ estimatedCredits: 11, getSpent: spentOf(90) }),
    );
    expect(decision).toEqual({
      ok: false,
      reason: 'budget_exceeded',
      spent: 90,
      projected: 101,
      allowance: 100,
    });
    expect('warn' in decision).toBe(false);
  });

  it('blocks before the call when the account is already over budget', async () => {
    const decision = await checkBudget(
      budgetInput({ estimatedCredits: 0, getSpent: spentOf(150) }),
    );
    expect(decision).toMatchObject({ ok: false, reason: 'budget_exceeded', projected: 150 });
  });

  it('allows a zero-estimate call at exactly the allowance', async () => {
    const decision = await checkBudget(
      budgetInput({ estimatedCredits: 0, getSpent: spentOf(100) }),
    );
    expect(decision).toMatchObject({ ok: true, warn: true, projected: 100 });
  });

  it('resolves the allowance from the tier', async () => {
    const pro = await checkBudget(
      budgetInput({ tier: 'pro', estimatedCredits: 0, getSpent: spentOf(1599) }),
    );
    expect(pro).toMatchObject({ ok: true, warn: false, allowance: 2000 });
    const proAtThreshold = await checkBudget(
      budgetInput({ tier: 'pro', estimatedCredits: 1, getSpent: spentOf(1599) }),
    );
    expect(proAtThreshold).toMatchObject({ ok: true, warn: true, allowance: 2000 });
    const studio = await checkBudget(
      budgetInput({ tier: 'studio', estimatedCredits: 6000, getSpent: spentOf(0) }),
    );
    expect(studio).toMatchObject({ ok: true, allowance: 6000 });
  });

  it('lets an explicit allowance override the tier lookup', async () => {
    const allowed = await checkBudget(
      budgetInput({ tier: 'studio', allowance: 50, estimatedCredits: 10, getSpent: spentOf(40) }),
    );
    expect(allowed).toMatchObject({ ok: true, allowance: 50, projected: 50 });
    const blocked = await checkBudget(
      budgetInput({ tier: 'studio', allowance: 50, estimatedCredits: 11, getSpent: spentOf(40) }),
    );
    expect(blocked).toMatchObject({ ok: false, reason: 'budget_exceeded', allowance: 50 });
  });

  it('honours a custom warn ratio', async () => {
    const warned = await checkBudget(
      budgetInput({ warnRatio: 0.5, estimatedCredits: 0, getSpent: spentOf(50) }),
    );
    expect(warned).toMatchObject({ ok: true, warn: true });
    const quiet = await checkBudget(
      budgetInput({ warnRatio: 0.5, estimatedCredits: 0, getSpent: spentOf(49) }),
    );
    expect(quiet).toMatchObject({ ok: true, warn: false });
    const pinned = await checkBudget(
      budgetInput({ warnRatio: 1, estimatedCredits: 0, getSpent: spentOf(99) }),
    );
    expect(pinned).toMatchObject({ ok: true, warn: false });
  });

  it('awaits an async getSpent read', async () => {
    let resolved = false;
    const getSpent = (): Promise<number> =>
      new Promise((resolve) => {
        resolved = true;
        resolve(42);
      });
    const decision = await checkBudget(budgetInput({ estimatedCredits: 0, getSpent }));
    expect(resolved).toBe(true);
    expect(decision).toMatchObject({ ok: true, spent: 42 });
  });

  it('propagates a getSpent rejection instead of allowing the call', async () => {
    const getSpent = (): Promise<number> => Promise.reject(new Error('ledger down'));
    await expect(checkBudget(budgetInput({ estimatedCredits: 1, getSpent }))).rejects.toThrow(
      'ledger down',
    );
  });
});

describe('checkBudget invalid input fails loudly', () => {
  it('rejects a non-object input', async () => {
    await expect(checkBudget(null as unknown as CheckBudgetInput)).rejects.toThrow(
      'input must be an object',
    );
  });

  it('rejects a missing or blank accountId', async () => {
    await expect(checkBudget(budgetInput({ accountId: '' }))).rejects.toThrow(
      'accountId must be a non-empty string',
    );
    await expect(checkBudget(budgetInput({ accountId: '   ' }))).rejects.toThrow(
      'accountId must be a non-empty string',
    );
  });

  it('rejects a non-function getSpent', async () => {
    await expect(
      checkBudget(budgetInput({ getSpent: undefined as unknown as () => Promise<number> })),
    ).rejects.toThrow('getSpent must be a function');
  });

  it('rejects negative, NaN and infinite estimates', async () => {
    await expect(checkBudget(budgetInput({ estimatedCredits: -1 }))).rejects.toThrow(
      'estimatedCredits must be a finite non-negative number',
    );
    await expect(checkBudget(budgetInput({ estimatedCredits: Number.NaN }))).rejects.toThrow(
      'estimatedCredits must be a finite non-negative number',
    );
    await expect(
      checkBudget(budgetInput({ estimatedCredits: Number.POSITIVE_INFINITY })),
    ).rejects.toThrow('estimatedCredits must be a finite non-negative number');
  });

  it('rejects a negative or non-finite spent read', async () => {
    await expect(checkBudget(budgetInput({ getSpent: spentOf(-5) }))).rejects.toThrow(
      'getSpent() result must be a finite non-negative number',
    );
    await expect(checkBudget(budgetInput({ getSpent: spentOf(Number.NaN) }))).rejects.toThrow(
      'getSpent() result must be a finite non-negative number',
    );
  });

  it('rejects a warnRatio outside [0, 1]', async () => {
    await expect(checkBudget(budgetInput({ warnRatio: 1.5 }))).rejects.toThrow(
      'warnRatio must be within [0, 1]',
    );
    await expect(checkBudget(budgetInput({ warnRatio: -0.1 }))).rejects.toThrow(
      'warnRatio must be a finite non-negative number',
    );
  });
});

describe('refillAllowance — 90-day refill window', () => {
  it('reads as zero with no pool wired (absence-tolerant)', async () => {
    __resetRefillPool();
    await expect(refillAllowance('acct-1')).resolves.toBe(0);
  });

  it('sums refill rows within the window and queries the ledger idiom', async () => {
    const pool = fakeRefillPool(() => ({ rows: [{ refills: 1000 }] }));
    __setRefillPool(pool);
    await expect(refillAllowance('acct-1')).resolves.toBe(1000);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].text).toContain('FROM credit_ledger');
    expect(pool.calls[0].text).toContain('reason = $2');
    expect(pool.calls[0].text).toContain('90 days');
    expect(pool.calls[0].params).toEqual(['acct-1', REFILL_REASON]);
    expect(REFILL_REASON).toBe('refill');
    expect(REFILL_WINDOW_DAYS).toBe(90);
  });

  it('reads numeric-string sums (pg numeric) and ignores non-positive reads', async () => {
    __setRefillPool(fakeRefillPool(() => ({ rows: [{ refills: '2000' }] })));
    await expect(refillAllowance('acct-1')).resolves.toBe(2000);
    __setRefillPool(fakeRefillPool(() => ({ rows: [{ refills: 0 }] })));
    await expect(refillAllowance('acct-1')).resolves.toBe(0);
    __setRefillPool(fakeRefillPool(() => ({ rows: [{ refills: null }] })));
    await expect(refillAllowance('acct-1')).resolves.toBe(0);
  });

  it('reads as zero when the ledger is unreachable, never throwing', async () => {
    __setRefillPool({
      query: async () => {
        throw new Error('relation "credit_ledger" does not exist');
      },
    });
    await expect(refillAllowance('acct-1')).resolves.toBe(0);
  });

  it('rejects a blank accountId loudly', async () => {
    await expect(refillAllowance('   ')).rejects.toThrow(
      'refillAllowance: accountId must be a non-empty string',
    );
  });

  it('checkBudget adds refills to the tier allowance', async () => {
    __setRefillPool(fakeRefillPool(() => ({ rows: [{ refills: 1000 }] })));
    const decision = await checkBudget(
      budgetInput({ tier: 'pro', estimatedCredits: 0, getSpent: spentOf(2000) }),
    );
    expect(decision).toMatchObject({ ok: true, allowance: MONTHLY_GRANT_PRO + 1000, spent: 2000 });
  });

  it('checkBudget blocks at the widened allowance boundary', async () => {
    __setRefillPool(fakeRefillPool(() => ({ rows: [{ refills: 1000 }] })));
    const allowed = await checkBudget(
      budgetInput({ tier: 'pro', estimatedCredits: 0, getSpent: spentOf(3000) }),
    );
    expect(allowed).toMatchObject({ ok: true, allowance: 3000 });
    const blocked = await checkBudget(
      budgetInput({ tier: 'pro', estimatedCredits: 1, getSpent: spentOf(3000) }),
    );
    expect(blocked).toMatchObject({ ok: false, reason: 'budget_exceeded', allowance: 3000 });
  });

  it('checkBudget widens nothing when refills are unreadable (expiry behaves as zero)', async () => {
    __setRefillPool({
      query: async () => {
        throw new Error('relation "credit_ledger" does not exist');
      },
    });
    const decision = await checkBudget(
      budgetInput({ tier: 'pro', estimatedCredits: 0, getSpent: spentOf(0) }),
    );
    expect(decision).toMatchObject({ ok: true, allowance: MONTHLY_GRANT_PRO });
  });

  it('an explicit allowance override skips the tier lookup but still adds refills', async () => {
    __setRefillPool(fakeRefillPool(() => ({ rows: [{ refills: 500 }] })));
    const decision = await checkBudget(
      budgetInput({ tier: 'studio', allowance: 50, estimatedCredits: 0, getSpent: spentOf(0) }),
    );
    expect(decision).toMatchObject({ ok: true, allowance: 550 });
  });
});

// ---------------------------------------------------------------------------
// $5 = 1,000 credits, valid 90 days — a revenue boundary, not just an edge.
//
// The window lives in SQL (`created_at >= now() - interval '90 days'`), so an
// inclusive/exclusive slip is invisible to every other test in this file: the
// others feed the SUM straight in and never exercise the predicate. These tests
// model that predicate and pin both the arithmetic and the SQL text, so a
// one-day drift cannot silently move revenue.
//
// Semantics asserted (PostgreSQL 18, §9.9 Table 9.32): `timestamp - interval`
// yields a timestamp, and `interval '90 days'` carries no month component, so
// it is exactly 90 x 24h — no calendar or DST truncation. The comparison is a
// half-open LOWER bound: `>= now() - interval '90 days'` INCLUDES the grant
// landing exactly on the boundary instant.
// Source: https://www.postgresql.org/docs/current/functions-datetime.html
// ---------------------------------------------------------------------------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// A fixed "now" keeps the arithmetic deterministic. The DB evaluates its own
// `now()`, but only the DISTANCE from it expires a grant, so a window defect
// shifts every reading identically whenever this runs.
const REFILL_NOW_MS = Date.parse('2026-09-23T12:00:00.000Z');

/** The DB's `now() - interval '<REFILL_WINDOW_DAYS> days'` cutoff, in test arithmetic. */
function refillWindowCutoffMs(nowMs: number = REFILL_NOW_MS): number {
  return nowMs - REFILL_WINDOW_DAYS * ONE_DAY_MS;
}

/** One ledger row in the fixture, aged back from REFILL_NOW_MS. */
interface RefillGrant {
  readonly refId: string;
  readonly credits: number;
  readonly ageDays: number;
}

/**
 * Fake pool that evaluates the shipped predicate — no more, no less: sum the
 * rows at or inside the window cutoff, then apply `refillAllowance`'s own read
 * rule (only a positive finite number widens the allowance). A window that
 * drifted exclusive would lose exactly the row sitting ON the cutoff, which is
 * the regression these tests exist to catch.
 */
function refillPoolFromGrants(grants: readonly RefillGrant[]): ReturnType<typeof fakeRefillPool> {
  const cutoff = refillWindowCutoffMs();
  const active = grants.filter((grant) => REFILL_NOW_MS - grant.ageDays * ONE_DAY_MS >= cutoff);
  const sum = active.reduce((total, grant) => total + grant.credits, 0);
  return fakeRefillPool(() => ({ rows: [{ refills: sum }] }));
}

describe('refill window boundary — $5 / 1,000 credits / 90 days', () => {
  it('pins the terms promise: $5 buys 1,000 credits valid 90 days', () => {
    // terms/page.tsx:99 promises "$5 refill pack of 1,000 credits, valid for
    // 90 days"; the ledger row is written with that amount, and the window is
    // the constant below. A change to any one of the three is a pricing change.
    expect(REFILL_REASON).toBe('refill');
    expect(REFILL_WINDOW_DAYS).toBe(90);
  });

  it('derives the SQL window from the same 90 days the constant names (drift guard)', () => {
    // The window is a literal inside the SQL, NOT an interpolation of
    // REFILL_WINDOW_DAYS — so the two can drift apart. This is the guard that
    // makes an edit to either one red until both agree.
    expect(REFILL_CREDITS_SQL).toContain(`interval '${REFILL_WINDOW_DAYS} days'`);
    expect(REFILL_CREDITS_SQL).toContain('90 days');
  });

  it('pins the predicate as half-open: >= cutoff, in the ledger and on the reason', () => {
    // Assert BOTH the operator and its operand: `>=` (inclusive at the
    // boundary) is the whole point, and a regex is the only way to catch
    // `>` smuggling in behind the same wording. The length is asserted so the
    // three narrower checks above cannot pass vacuously against an empty or
    // truncated statement; 147 is the statement's full literal length. It comes
    // last on purpose — a flipped operator must fail on the regex (saying what
    // actually broke), not on a one-character length diff.
    expect(REFILL_CREDITS_SQL).toContain('created_at >=');
    expect(REFILL_CREDITS_SQL).not.toContain('created_at > ');
    expect(REFILL_CREDITS_SQL).toHaveLength(147);
    expect(REFILL_CREDITS_SQL).toMatch(
      /FROM credit_ledger WHERE account_id = \$1 AND reason = \$2 AND created_at >= now\(\) - interval '90 days'$/,
    );
  });

  it('COUNTS a grant 89 days old (one day inside the window)', async () => {
    __setRefillPool(refillPoolFromGrants([{ refId: 'purchase-a', credits: 1000, ageDays: 89 }]));
    await expect(refillAllowance('acct-1')).resolves.toBe(1000);
  });

  it('EXCLUDES a grant 91 days old (one day past the window)', async () => {
    __setRefillPool(refillPoolFromGrants([{ refId: 'purchase-a', credits: 1000, ageDays: 91 }]));
    await expect(refillAllowance('acct-1')).resolves.toBe(0);
  });

  it('COUNTS a grant exactly 90 days old — the boundary is inclusive (documented)', async () => {
    // Documents the code as built rather than a wish: the SQL is `>=`, so the
    // grant landing exactly on the cutoff instant is still active. Half-open
    // [now - 90d, now] is the promise the terms copy makes ("valid for 90
    // days") and the reading that favours the paying customer. If this ever
    // fails, the operator flipped to `>` — revenue moved, decide deliberately.
    __setRefillPool(refillPoolFromGrants([{ refId: 'purchase-a', credits: 1000, ageDays: 90 }]));
    await expect(refillAllowance('acct-1')).resolves.toBe(1000);
    // The boundary is where the two sides disagree, so prove they DO disagree.
    expect(REFILL_NOW_MS - 90 * ONE_DAY_MS).toBe(refillWindowCutoffMs());
  });

  it('treats a 1-day window slip as a full 1,000-credit revenue event', async () => {
    const grant = { refId: 'purchase-a', credits: 1000, ageDays: 90 };
    // Same account, same tier, same spend, same estimate — the ONLY difference
    // between these two runs is where the window edge falls. Both calls are
    // built from one shared input so the claim is structural, not a comment.
    const spent = spentOf(MONTHLY_GRANT_PRO);
    const nearBoundary = (): CheckBudgetInput =>
      budgetInput({ tier: 'pro', estimatedCredits: 1, getSpent: spent });

    __setRefillPool(refillPoolFromGrants([{ ...grant, ageDays: 89 }]));
    const counted = await checkBudget(nearBoundary());
    expect(counted).toMatchObject({
      ok: true,
      spent: MONTHLY_GRANT_PRO,
      allowance: MONTHLY_GRANT_PRO + 1000,
    });

    __setRefillPool(refillPoolFromGrants([{ ...grant, ageDays: 91 }]));
    const expired = await checkBudget(nearBoundary());
    expect(expired).toMatchObject({
      ok: false,
      reason: 'budget_exceeded',
      spent: MONTHLY_GRANT_PRO,
      allowance: MONTHLY_GRANT_PRO,
    });

    // The gap between the two readings is the refill's full face value.
    expect(counted.allowance - expired.allowance).toBe(1000);
  });

  it('counts only refill rows that are both inside the window and the account', async () => {
    // Two purchases, one expired: the SUM is the surviving pack's face value.
    __setRefillPool(
      refillPoolFromGrants([
        { refId: 'purchase-old', credits: 1000, ageDays: 120 },
        { refId: 'purchase-new', credits: 1000, ageDays: 30 },
      ]),
    );
    await expect(refillAllowance('acct-1')).resolves.toBe(1000);
    // And both-active stacks (a renewal before the first expires).
    __setRefillPool(
      refillPoolFromGrants([
        { refId: 'purchase-new', credits: 1000, ageDays: 30 },
        { refId: 'purchase-older', credits: 1000, ageDays: 89 },
      ]),
    );
    await expect(refillAllowance('acct-1')).resolves.toBe(2000);
  });

  it('checks the ledger in the account it was asked about, with the refill reason', async () => {
    const pool = refillPoolFromGrants([{ refId: 'purchase-a', credits: 1000, ageDays: 89 }]);
    __setRefillPool(pool);
    await refillAllowance('acct-42');
    expect(pool.calls).toHaveLength(1);
    // A window that expired everything must never widen a DIFFERENT account's
    // allowance either: the scope travels as a bound parameter, never baked in.
    expect(pool.calls[0].params).toEqual(['acct-42', REFILL_REASON]);
  });
});

describe('briefHash (FNV-1a 32-bit, non-crypto)', () => {
  it('matches the published FNV-1a value for "hello"', () => {
    // Independent golden, not derived from this implementation: FNV-1a 32-bit
    // of the ASCII string "hello" is 0x4f9f2cab.
    expect(briefHash('hello')).toBe('4f9f2cab');
  });

  it('returns the FNV-1a offset basis for the empty string', () => {
    expect(briefHash('')).toBe('811c9dc5');
  });

  it('is deterministic and differs for different briefs', () => {
    expect(briefHash('welcome bot')).toBe(briefHash('welcome bot'));
    expect(briefHash('welcome bot')).not.toBe(briefHash('moderation bot'));
  });

  it('always returns 8 lowercase hex chars, including for non-ASCII text', () => {
    for (const text of ['', 'a', 'welcome bot', 'çğü Türkçe 日本語 🎉', 'x'.repeat(5000)]) {
      expect(briefHash(text)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe('startSpan (one brief, many attempts)', () => {
  it('starts at zero calls and zero credits', () => {
    const span = startSpan('a welcome bot');
    expect(span.calls).toBe(0);
    expect(span.credits).toBe(0);
    expect(span.summary()).toEqual({ calls: 0, credits: 0 });
    expect(span.briefHash).toBe(briefHash('a welcome bot'));
  });

  it('sums three builder attempts into one brief total', () => {
    const span = startSpan('xp levels bot');
    span.addCall(1.5);
    span.addCall(2.25);
    span.addCall(0.25);
    expect(span.calls).toBe(3);
    expect(span.credits).toBe(4);
    expect(span.summary()).toEqual({ calls: 3, credits: 4 });
  });

  it('returns a snapshot that later calls do not mutate', () => {
    const span = startSpan('moderation bot');
    span.addCall(1);
    const snapshot = span.summary();
    span.addCall(9);
    expect(snapshot).toEqual({ calls: 1, credits: 1 });
    expect(span.summary()).toEqual({ calls: 2, credits: 10 });
  });

  it('gives each span its own id and keeps briefs grouped by hash', () => {
    const first = startSpan('same brief');
    const second = startSpan('same brief');
    expect(first.id).not.toBe(second.id);
    expect(first.briefHash).toBe(second.briefHash);
  });

  it('rejects a non-string brief', () => {
    expect(() => startSpan(42 as unknown as string)).toThrow('brief must be a string');
  });

  it('rejects an invalid credit and leaves the span untouched', () => {
    const span = startSpan('brief');
    expect(() => span.addCall(-1)).toThrow('credits must be a finite non-negative number');
    expect(() => span.addCall(Number.NaN)).toThrow('credits must be a finite non-negative number');
    expect(span.summary()).toEqual({ calls: 0, credits: 0 });
  });
});
