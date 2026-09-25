// Wave E4: sleep/wake sweeper unit tests (fakes only — no Discord, no Postgres).
//
// Covers: the paid-tier vocabulary, the fail-open trial-clock reader, the
// pure sleep/wake decision (including the 24h grace default), grouping, the
// pool driver (sleep destroys the client first, wake is a DB flip, failures
// are logged never thrown), the interval lifecycle, and the minimal
// gateway.ts wiring (attach + stop-on-shutdown).

import { describe, expect, it, vi } from 'vitest';
import { createGateway } from '../gateway.js';
import {
  decideSweep,
  isPaidTier,
  parseSweepExpiryMs,
  reconcileSweep,
  startSweeper,
  SWEEP_CANDIDATES_SQL,
  SWEEP_GRACE_MS,
  SWEEP_SLEEP_SQL,
  SWEEP_WAKE_SQL,
  SWEEPER_POLL_MS,
  type SweeperRow,
} from './sweeper.js';

const NOW_MS = Date.parse('2026-09-23T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function makeRow(overrides: Partial<SweeperRow> = {}): SweeperRow {
  return {
    id: 'bot-1',
    status: 'live',
    tier: 'trial',
    trialEndsAt: new Date(NOW_MS - 25 * HOUR_MS),
    hasProdSpec: true,
    hasToken: true,
    ...overrides,
  };
}

describe('sweeper constants', () => {
  it('defaults to a 24h grace and a 60s poll', () => {
    expect(SWEEP_GRACE_MS).toBe(24 * 60 * 60 * 1000);
    expect(SWEEPER_POLL_MS).toBe(60 * 1000);
  });

  it('scopes candidates to live/sleeping bots only', () => {
    expect(SWEEP_CANDIDATES_SQL).toContain("'live'");
    expect(SWEEP_CANDIDATES_SQL).toContain("'sleeping'");
    expect(SWEEP_CANDIDATES_SQL).toContain('trial_ends_at');
  });

  it('guards both flips so a retry cannot move a bot twice', () => {
    expect(SWEEP_SLEEP_SQL).toContain("status = 'live'");
    expect(SWEEP_WAKE_SQL).toContain("status = 'sleeping'");
  });
});

describe('isPaidTier', () => {
  it('treats pro and studio as paid, everything else as unpaid', () => {
    expect(isPaidTier('pro')).toBe(true);
    expect(isPaidTier('studio')).toBe(true);
    expect(isPaidTier('trial')).toBe(false);
    expect(isPaidTier('enterprise')).toBe(false);
    expect(isPaidTier('')).toBe(false);
    expect(isPaidTier(null)).toBe(false);
    expect(isPaidTier(undefined)).toBe(false);
  });
});

describe('parseSweepExpiryMs', () => {
  it('fails open on null, missing, empty, and garbage clocks', () => {
    expect(parseSweepExpiryMs(null)).toBeNull();
    expect(parseSweepExpiryMs(undefined)).toBeNull();
    expect(parseSweepExpiryMs('')).toBeNull();
    expect(parseSweepExpiryMs('not-a-date')).toBeNull();
  });

  it('reads both the pg Date form and the JSON ISO-string form', () => {
    expect(parseSweepExpiryMs(new Date(NOW_MS))).toBe(NOW_MS);
    expect(parseSweepExpiryMs(new Date(NOW_MS).toISOString())).toBe(NOW_MS);
  });
});

describe('decideSweep', () => {
  it('sleeps a live unpaid bot whose trial expired past the grace window', () => {
    expect(decideSweep(makeRow(), NOW_MS)).toBe('sleep');
  });

  it('break-the-guard: the default grace is 24h (23h keeps, 25h sleeps)', () => {
    const ago23h = makeRow({ trialEndsAt: new Date(NOW_MS - 23 * HOUR_MS) });
    const ago25h = makeRow({ trialEndsAt: new Date(NOW_MS - 25 * HOUR_MS) });
    expect(decideSweep(ago23h, NOW_MS)).toBe('keep');
    expect(decideSweep(ago25h, NOW_MS)).toBe('sleep');
  });

  it('honours an explicit grace override', () => {
    const ago2h = makeRow({ trialEndsAt: new Date(NOW_MS - 2 * HOUR_MS) });
    expect(decideSweep(ago2h, NOW_MS, HOUR_MS)).toBe('sleep');
    expect(decideSweep(ago2h, NOW_MS, 3 * HOUR_MS)).toBe('keep');
  });

  it('never sleeps on a missing or corrupt clock (fail-open)', () => {
    expect(decideSweep(makeRow({ trialEndsAt: null }), NOW_MS)).toBe('keep');
    expect(decideSweep(makeRow({ trialEndsAt: 'garbage' }), NOW_MS)).toBe('keep');
  });

  it('never sleeps a paid bot, even with a long-expired trial', () => {
    expect(decideSweep(makeRow({ tier: 'pro' }), NOW_MS)).toBe('keep');
    expect(decideSweep(makeRow({ tier: 'studio' }), NOW_MS)).toBe('keep');
  });

  it('treats an unknown tier as unpaid for sleep', () => {
    expect(decideSweep(makeRow({ tier: 'enterprise' }), NOW_MS)).toBe('sleep');
  });

  it('wakes a sleeping paid bot that still has a prod spec and a real token', () => {
    expect(decideSweep(makeRow({ status: 'sleeping', tier: 'pro' }), NOW_MS)).toBe('wake');
  });

  it('stays sleeping without a prod spec, without a token, or without a paid tier', () => {
    expect(
      decideSweep(makeRow({ status: 'sleeping', tier: 'pro', hasProdSpec: false }), NOW_MS),
    ).toBe('keep');
    expect(decideSweep(makeRow({ status: 'sleeping', tier: 'pro', hasToken: false }), NOW_MS)).toBe(
      'keep',
    );
    expect(decideSweep(makeRow({ status: 'sleeping', tier: 'trial' }), NOW_MS)).toBe('keep');
    expect(decideSweep(makeRow({ status: 'sleeping', tier: 'enterprise' }), NOW_MS)).toBe('keep');
  });

  it('ignores bots in any other status and rows without an id', () => {
    expect(decideSweep(makeRow({ status: 'draft' }), NOW_MS)).toBe('keep');
    expect(decideSweep(makeRow({ status: 'quarantined' }), NOW_MS)).toBe('keep');
    expect(decideSweep(makeRow({ id: '' }), NOW_MS)).toBe('keep');
  });
});

describe('reconcileSweep', () => {
  it('groups sleep and wake ids and skips empty ids', () => {
    const rows: SweeperRow[] = [
      makeRow({ id: 'sleep-1' }),
      makeRow({ id: '', status: 'live' }),
      makeRow({ id: 'wake-1', status: 'sleeping', tier: 'pro' }),
      makeRow({ id: 'keep-1', trialEndsAt: new Date(NOW_MS - HOUR_MS) }),
    ];
    expect(reconcileSweep(rows, NOW_MS)).toEqual({ sleep: ['sleep-1'], wake: ['wake-1'] });
  });
});

interface RecordedQuery {
  text: string;
  params: unknown[] | undefined;
}

interface FakePool {
  queries: RecordedQuery[];
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

function makePool(rows: SweeperRow[] | Error, failOn?: 'sleep' | 'wake'): FakePool {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      queries.push({ text, params });
      if (text.includes('FROM bots b JOIN accounts')) {
        if (rows instanceof Error) {
          throw rows;
        }
        return { rows: rows as unknown as T[] };
      }
      if (failOn === 'sleep' && text === SWEEP_SLEEP_SQL) {
        throw new Error('db down');
      }
      if (failOn === 'wake' && text === SWEEP_WAKE_SQL) {
        throw new Error('db down');
      }
      return { rows: [] };
    },
  };
}

interface FakeTarget {
  removed: string[];
  failOn: Set<string>;
  removeBot(id: string): Promise<void>;
}

function makeTarget(): FakeTarget {
  const target: FakeTarget = {
    removed: [],
    failOn: new Set<string>(),
    async removeBot(id: string): Promise<void> {
      if (target.failOn.has(id)) {
        throw new Error('disconnect failed');
      }
      target.removed.push(id);
    },
  };
  return target;
}

interface FakeLogger {
  infos: Array<{ event: string; botId: string; reason?: string }>;
  errors: Array<{ event: string; botId: string }>;
  info(record: { event: string; botId: string; reason?: string }): void;
  error(record: { event: string; botId: string }): void;
}

function makeLogger(): FakeLogger {
  const logger: FakeLogger = {
    infos: [],
    errors: [],
    info(record): void {
      logger.infos.push(record);
    },
    error(record): void {
      logger.errors.push(record);
    },
  };
  return logger;
}

describe('startSweeper', () => {
  it('sleeps expired trials: destroys the client first, then flips the row', async () => {
    const pool = makePool([makeRow({ id: 'sleep-1' })]);
    const target = makeTarget();
    const logger = makeLogger();
    const handle = startSweeper(pool, target, logger, { now: () => NOW_MS });
    try {
      const result = await handle.sweepNow();
      expect(result).toEqual({ sleep: ['sleep-1'], wake: [] });
      expect(target.removed).toEqual(['sleep-1']);
      const sleepWrite = pool.queries.find((query) => query.text === SWEEP_SLEEP_SQL);
      expect(sleepWrite?.params).toEqual(['sleep-1']);
      const tick = logger.infos.find((record) => record.event === 'sweeper-tick');
      expect(tick?.reason).toBe('slept=1 woken=0');
    } finally {
      handle.stop();
    }
  });

  it('wakes upgraded bots with a DB flip and no client touch', async () => {
    const pool = makePool([makeRow({ id: 'wake-1', status: 'sleeping', tier: 'pro' })]);
    const target = makeTarget();
    const logger = makeLogger();
    const handle = startSweeper(pool, target, logger, { now: () => NOW_MS });
    try {
      const result = await handle.sweepNow();
      expect(result).toEqual({ sleep: [], wake: ['wake-1'] });
      expect(target.removed).toEqual([]);
      const wakeWrite = pool.queries.find((query) => query.text === SWEEP_WAKE_SQL);
      expect(wakeWrite?.params).toEqual(['wake-1']);
    } finally {
      handle.stop();
    }
  });

  it('logs and degrades to empty when the candidate read fails (no error text)', async () => {
    const pool = makePool(new Error('connect ECONNREFUSED host=db user=app'));
    const logger = makeLogger();
    const handle = startSweeper(pool, makeTarget(), logger, { now: () => NOW_MS });
    try {
      await expect(handle.sweepNow()).resolves.toEqual({ sleep: [], wake: [] });
      expect(logger.errors.map((record) => record.event)).toEqual(['sweeper-read-failed']);
    } finally {
      handle.stop();
    }
  });

  it('keeps sweeping the rest when one sleep or wake write fails', async () => {
    const rows: SweeperRow[] = [
      makeRow({ id: 'bad-sleep' }),
      makeRow({ id: 'good-sleep' }),
      makeRow({ id: 'wake-1', status: 'sleeping', tier: 'pro' }),
    ];
    const target = makeTarget();
    target.failOn.add('bad-sleep');
    const logger = makeLogger();
    const handle = startSweeper(makePool(rows), target, logger, { now: () => NOW_MS });
    try {
      const result = await handle.sweepNow();
      expect(result.sleep).toEqual(['good-sleep']);
      expect(logger.errors.map((record) => record.event)).toContain('sweeper-sleep-failed');
    } finally {
      handle.stop();
    }

    const wakePool = makePool([makeRow({ id: 'wake-1', status: 'sleeping', tier: 'pro' })], 'wake');
    const wakeLogger = makeLogger();
    const wakeHandle = startSweeper(wakePool, makeTarget(), wakeLogger, { now: () => NOW_MS });
    try {
      await expect(wakeHandle.sweepNow()).resolves.toEqual({ sleep: [], wake: [] });
      expect(wakeLogger.errors.map((record) => record.event)).toContain('sweeper-wake-failed');
    } finally {
      wakeHandle.stop();
    }
  });

  it('reconciles on the interval and stops on demand', async () => {
    vi.useFakeTimers();
    try {
      const pool = makePool([makeRow({ id: 'sleep-1' })]);
      const logger = makeLogger();
      const handle = startSweeper(pool, makeTarget(), logger, {
        intervalMs: 1000,
        now: () => NOW_MS,
      });
      const reads = (): number =>
        pool.queries.filter((query) => query.text === SWEEP_CANDIDATES_SQL).length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(reads()).toBe(1);
      handle.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(reads()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('gateway sweeper wiring', () => {
  function setupGateway(): {
    gateway: ReturnType<typeof createGateway>;
    stops: string[];
  } {
    const stops: string[] = [];
    const gateway = createGateway({
      createClient: () => ({
        on(): void {
          return undefined;
        },
        login: async (): Promise<void> => undefined,
        destroy: async (): Promise<void> => undefined,
      }),
      store: {
        flush(): void {
          return undefined;
        },
      },
      logger: {
        info(): void {
          return undefined;
        },
        error(): void {
          return undefined;
        },
      },
    });
    return { gateway, stops };
  }

  it('stops the previous handle on replace and the current one on shutdown', async () => {
    const { gateway, stops } = setupGateway();
    gateway.attachSweeper({ stop: (): void => void stops.push('first') });
    gateway.attachSweeper({ stop: (): void => void stops.push('second') });
    // Replace stops the orphaned first interval immediately.
    expect(stops).toEqual(['first']);
    await gateway.shutdown();
    expect(stops).toEqual(['first', 'second']);
    // A second shutdown is a no-op — no further stop calls.
    await gateway.shutdown();
    expect(stops).toEqual(['first', 'second']);
  });

  it('shutdown works with no sweeper attached', async () => {
    const { gateway } = setupGateway();
    await expect(gateway.shutdown()).resolves.toBeUndefined();
  });
});
