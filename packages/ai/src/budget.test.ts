// Tests for the pre-call budget guard and per-brief cost spans.
//
// Written from the guard's own contract: the boundaries tested are the ones a
// billing gate must get exactly right (allow at the allowance, block one
// credit over, warn at 80%), the `getSpent` read is injected and never hits a
// DB, and every invalid input fails loudly instead of degrading into a silent
// allow.
import { describe, expect, it } from 'vitest';
import {
  BUDGET_WARN_RATIO,
  MONTHLY_GRANTS,
  MONTHLY_GRANT_PRO,
  MONTHLY_GRANT_SCALE,
  MONTHLY_GRANT_STUDIO,
  MONTHLY_GRANT_TRIAL,
  briefHash,
  checkBudget,
  isPlanTier,
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
