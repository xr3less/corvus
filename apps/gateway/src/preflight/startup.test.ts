import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The preflight worker's start path constructs PgBoss + Pool and calls
// start()/work()/stop() against a live Postgres. This suite exercises the
// SINGLETON GUARD (a double start must not register two workers) with the boss
// client mocked — no database is needed and no hook ever throws (D-030: a
// missing DB must not turn a local suite red; loud-skip is for PG-BACKED paths,
// which this is not). The scan path itself is covered by worker.test.ts.
const bossMock = vi.hoisted(() => ({
  starts: 0,
  stops: 0,
  instances: 0,
}));

vi.mock('pg-boss', () => {
  class PgBoss {
    constructor(options: unknown) {
      void options;
      bossMock.instances += 1;
    }
    on(): this {
      return this;
    }
    async start(): Promise<this> {
      bossMock.starts += 1;
      return this;
    }
    async work(): Promise<string> {
      return 'mock-worker-id';
    }
    async stop(): Promise<void> {
      bossMock.stops += 1;
    }
  }
  return { PgBoss };
});

vi.mock('pg', () => {
  class Pool {
    constructor(options: unknown) {
      void options;
    }
    query(): Promise<{ rows: unknown[] }> {
      return Promise.resolve({ rows: [] });
    }
    end(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { Pool };
});

import { isWorkerRunning, startPreflightWorker, type PreflightWorkerHandle } from './worker.js';

let handle: PreflightWorkerHandle | undefined;

beforeEach(() => {
  bossMock.starts = 0;
  bossMock.stops = 0;
  bossMock.instances = 0;
});

afterEach(async () => {
  if (handle !== undefined) {
    await handle.stop();
    handle = undefined;
  }
});

describe('preflight worker startup', () => {
  it('starts one worker and reports it running', async () => {
    expect(isWorkerRunning()).toBe(false);
    handle = await startPreflightWorker('postgresql://mock/db');
    expect(isWorkerRunning()).toBe(true);
    expect(bossMock.instances).toBe(1);
    expect(bossMock.starts).toBe(1);
  });

  it('sequential double start is idempotent — same handle, one boss', async () => {
    const first = await startPreflightWorker('postgresql://mock/db');
    const second = await startPreflightWorker('postgresql://mock/db');
    expect(second).toBe(first);
    expect(bossMock.instances).toBe(1);
    expect(bossMock.starts).toBe(1);
    handle = first;
  });

  it('concurrent double start is idempotent — one boot wins', async () => {
    const [a, b] = await Promise.all([
      startPreflightWorker('postgresql://mock/db'),
      startPreflightWorker('postgresql://mock/db'),
    ]);
    expect(a).toBe(b);
    expect(bossMock.instances).toBe(1);
    expect(bossMock.starts).toBe(1);
    handle = a;
  });

  it('stop clears the singleton so a later start boots a fresh worker', async () => {
    const first = await startPreflightWorker('postgresql://mock/db');
    await first.stop();
    expect(isWorkerRunning()).toBe(false);
    expect(bossMock.stops).toBe(1);
    const second = await startPreflightWorker('postgresql://mock/db');
    expect(second).not.toBe(first);
    expect(isWorkerRunning()).toBe(true);
    expect(bossMock.instances).toBe(2);
    expect(bossMock.starts).toBe(2);
    handle = second;
  });
});
