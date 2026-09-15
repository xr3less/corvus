// V1-9 self-healing supervisor tests.
//
// Rhymes with launch-blockers.test.ts: fakes are injected, the crash is
// injected through a client (or straight into the supervisor), and sibling
// isolation is asserted by proving the OTHER bot is untouched. No database is
// needed — the audit writer is an injected collector.
//
// The point of each test is the promise, not the mechanism:
// - backoff 1s,2s,4s… capped at 30s
// - quarantine trips exactly at the threshold, once, and audits once
// - a successful tick resets the counter
// - one bot's crash loop never affects its sibling
// - a quarantined bot re-adds cleanly via removeBot + addBot
// - the only string a user can see is plain language, never a stack trace

import { describe, expect, it } from 'vitest';
import {
  createGateway,
  type Gateway,
  type GatewayClient,
  type GatewayLogger,
  type LogRecord,
} from '../gateway.js';
import type { NewAuditEvent } from '../db/audit-events.js';
import {
  createSupervisor,
  QUARANTINE_USER_REASON,
  type Supervisor,
  type SupervisorPolicy,
} from './supervisor.js';
import { computeBackoffDelay } from './retry.js';

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const TOKEN_A = 'supervisor-synthetic-token-a';
const TOKEN_B = 'supervisor-synthetic-token-b';

class FakeClient implements GatewayClient {
  destroyed = false;
  loggedIn = false;
  messagesReceived = 0;
  loginShouldThrow?: unknown;
  private listeners = new Map<string, Array<(error: unknown) => void>>();

  on(event: string, listener: (error: unknown) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
  }

  async login(): Promise<void> {
    if (this.loginShouldThrow !== undefined) {
      throw this.loginShouldThrow;
    }
    this.loggedIn = true;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? []) {
      listener(error);
    }
  }

  emitMessage(): void {
    this.messagesReceived += 1;
  }
}

class FakeLogger implements GatewayLogger {
  records: LogRecord[] = [];
  lines: string[] = [];

  info(record: LogRecord): void {
    this.capture(record);
  }

  error(record: LogRecord): void {
    this.capture(record);
  }

  private capture(record: LogRecord): void {
    this.records.push(record);
    this.lines.push(JSON.stringify(record));
  }
}

interface Scheduled {
  delayMs: number;
  task: () => void;
  cancelled: boolean;
}

class FakeScheduler {
  entries: Scheduled[] = [];

  schedule(task: () => void, delayMs: number): () => void {
    const entry: Scheduled = { delayMs, task, cancelled: false };
    this.entries.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }

  delays(): number[] {
    return this.entries.map((entry) => entry.delayMs);
  }

  runLatest(): void {
    const entry = this.entries[this.entries.length - 1];
    if (entry !== undefined && !entry.cancelled) {
      entry.task();
    }
  }
}

interface Harness {
  clients: Map<string, FakeClient>;
  logger: FakeLogger;
  scheduler: FakeScheduler;
  audit: NewAuditEvent[];
  restarts: string[];
  clock: { value: number };
  gateway: Gateway;
  supervisor: Supervisor;
}

function setup(policy?: Partial<SupervisorPolicy>, failingBots: string[] = []): Harness {
  const failing = new Set(failingBots);
  const clients = new Map<string, FakeClient>();
  const logger = new FakeLogger();
  const scheduler = new FakeScheduler();
  const audit: NewAuditEvent[] = [];
  const restarts: string[] = [];
  const clock = { value: 1_000_000 };
  // Late-bound host: the supervisor is built before the gateway but only ever
  // calls back into it after construction.
  const host: { gateway: Gateway | null } = { gateway: null };
  const supervisor = createSupervisor({
    logger,
    quarantine: (botId: string, reason: string) => {
      if (host.gateway === null) {
        throw new Error('harness: gateway not constructed yet');
      }
      return host.gateway.quarantine(botId, reason);
    },
    audit: (event: NewAuditEvent) => {
      audit.push(event);
    },
    restart: (botId: string) => {
      restarts.push(botId);
    },
    policy,
    clock: () => clock.value,
    random: () => 0.5,
    scheduleRestart: (task: () => void, delayMs: number) => scheduler.schedule(task, delayMs),
  });
  const gateway = createGateway({
    createClient: (botId: string) => {
      const client = new FakeClient();
      if (failing.has(botId)) {
        client.loginShouldThrow = new Error('invalid token');
      }
      clients.set(botId, client);
      return client;
    },
    store: { flush: () => undefined },
    logger,
    supervisor,
  });
  host.gateway = gateway;
  return { clients, logger, scheduler, audit, restarts, clock, gateway, supervisor };
}

function quarantineRecords(logger: FakeLogger): LogRecord[] {
  return logger.records.filter((record) => record.event === 'bot-quarantined');
}

describe('computeBackoffDelay', () => {
  it('grows 1s, 2s, 4s… and caps at 30s', () => {
    const sequence = [1, 2, 3, 4, 5, 6, 7, 8].map((attempt) => computeBackoffDelay(attempt));
    expect(sequence).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('jitter is deterministic when random is injected and never exceeds the cap', () => {
    expect(computeBackoffDelay(1, { jitterRatio: 0.5 }, () => 0)).toBe(1000);
    expect(computeBackoffDelay(1, { jitterRatio: 0.5 }, () => 0.999)).toBe(1500);
    expect(computeBackoffDelay(2, { jitterRatio: 0.5 }, () => 0.999)).toBe(2999);
    // Already capped: jitter is clamped away, the cap still wins.
    expect(computeBackoffDelay(6, { jitterRatio: 0.5 }, () => 0.999)).toBe(30000);
  });

  it('rejects an invalid attempt instead of scheduling a hot loop', () => {
    expect(() => computeBackoffDelay(0)).toThrow();
    expect(() => computeBackoffDelay(-1)).toThrow();
    expect(() => computeBackoffDelay(1.5)).toThrow();
  });
});

describe('supervisor crash loop', () => {
  it('quarantines exactly at the threshold, once, with a single audit row', async () => {
    const h = setup({ crashThreshold: 5, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });

    for (let i = 0; i < 4; i++) {
      const outcome = await h.supervisor.handleCrash('bot-a', 'connection reset by peer');
      expect(outcome.action).toBe('retry');
    }
    expect(h.gateway.status('bot-a')).toBe('live');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(false);
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(4);
    expect(h.audit).toHaveLength(0);
    expect(h.clients.get('bot-a')?.destroyed).toBe(false);
    // One scheduled restart per sub-threshold crash, on the 1/2/4/8s ramp.
    expect(h.scheduler.delays()).toEqual([1000, 2000, 4000, 8000]);

    const fifth = await h.supervisor.handleCrash('bot-a', 'connection reset by peer');
    expect(fifth).toEqual({ action: 'quarantined', crashes: 5 });
    expect(h.gateway.status('bot-a')).toBe('quarantined');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(true);
    expect(h.clients.get('bot-a')?.destroyed).toBe(true);
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      botId: 'bot-a',
      actor: 'system',
      action: 'quarantine',
      detail: { reason: 'crash_loop', crashes: 5, windowMs: 300_000 },
    });

    // Idempotent after quarantine: no second destroy, no second audit.
    const again = await h.supervisor.handleCrash('bot-a', 'connection reset by peer');
    expect(again.action).toBe('ignored');
    expect(h.audit).toHaveLength(1);
  });

  it('lets the sliding window expire old crashes', async () => {
    const h = setup({ crashThreshold: 2, windowMs: 1000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });

    await h.supervisor.handleCrash('bot-a', 'boom');
    h.clock.value += 2000; // outside the window
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(0);

    const outcome = await h.supervisor.handleCrash('bot-a', 'boom');
    expect(outcome.action).toBe('retry');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(false);
  });

  it('a successful tick resets the counter and the backoff ramp', async () => {
    const h = setup({ crashThreshold: 5, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });

    await h.supervisor.handleCrash('bot-a', 'boom');
    await h.supervisor.handleCrash('bot-a', 'boom');
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(2);

    h.supervisor.handleHealthy('bot-a');
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(0);

    const after = await h.supervisor.handleCrash('bot-a', 'boom');
    expect(after).toEqual({ action: 'retry', attempt: 1, delayMs: 1000 });
  });

  it('a successful restart is a healthy tick and clears the counter', async () => {
    const h = setup({ crashThreshold: 5, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });

    await h.supervisor.handleCrash('bot-a', 'boom');
    expect(h.scheduler.delays()).toEqual([1000]);

    h.scheduler.runLatest();
    await flushAsync();

    expect(h.restarts).toEqual(['bot-a']);
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(0);
    expect(h.gateway.status('bot-a')).toBe('live');
  });
});

describe('sibling isolation', () => {
  it("one bot's crash loop quarantines only that bot and never touches its sibling", async () => {
    const h = setup({ crashThreshold: 3, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });
    await h.gateway.addBot({ id: 'bot-b', token: TOKEN_B });

    // Drive A through its loop through the real per-bot error boundary.
    for (let i = 0; i < 3; i++) {
      h.clients.get('bot-a')?.emitError(new Error('connection reset'));
      await flushAsync();
    }

    expect(h.gateway.status('bot-a')).toBe('quarantined');
    expect(h.gateway.status('bot-b')).toBe('live');
    expect(h.clients.get('bot-a')?.destroyed).toBe(true);
    expect(h.clients.get('bot-b')?.destroyed).toBe(false);

    // The audit trail names only A.
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]?.botId).toBe('bot-a');

    // The sibling is still live and still receiving events.
    h.clients.get('bot-b')?.emitMessage();
    expect(h.clients.get('bot-b')?.messagesReceived).toBe(1);
    expect(h.gateway.botIds()).toEqual(['bot-a', 'bot-b']);

    // A crash on B afterwards still only concerns B.
    await h.supervisor.handleCrash('bot-b', 'boom');
    expect(h.gateway.status('bot-b')).toBe('live');
    expect(h.supervisor.consecutiveCrashes('bot-b')).toBe(1);
  });

  it('recovers a quarantined bot via removeBot + addBot without touching siblings', async () => {
    const h = setup({ crashThreshold: 3, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });
    await h.gateway.addBot({ id: 'bot-b', token: TOKEN_B });

    for (let i = 0; i < 3; i++) {
      await h.supervisor.handleCrash('bot-a', 'boom');
    }
    expect(h.gateway.status('bot-a')).toBe('quarantined');

    await h.gateway.removeBot('bot-a');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(false);

    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });
    expect(h.gateway.status('bot-a')).toBe('live');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(false);
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(0);
    expect(h.clients.get('bot-a')?.destroyed).toBe(false);

    // The sibling was never disconnected by any of this.
    expect(h.gateway.status('bot-b')).toBe('live');
    expect(h.clients.get('bot-b')?.destroyed).toBe(false);
  });
});

describe('user surface', () => {
  it('shows only plain language — never a stack trace — and audits it as system', async () => {
    const h = setup({ crashThreshold: 2, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_A });

    const rawStack =
      'Error: boom\n    at Object.<anonymous> (C:/app/secret.ts:1:1)\n    at Module._load';
    await h.supervisor.handleCrash('bot-a', rawStack);
    await h.supervisor.handleCrash('bot-a', rawStack);

    const quarantine = quarantineRecords(h.logger);
    expect(quarantine.length).toBeGreaterThanOrEqual(1);
    for (const record of quarantine) {
      expect(record.botId).toBe('bot-a');
      expect(record.reason).toBe(QUARANTINE_USER_REASON);
      expect(record.reason).not.toMatch(/Error:|stack|\bat\s/);
    }

    // No accepted log line carries a multi-line stack frame.
    for (const line of h.logger.lines) {
      expect(line).not.toContain('\n    at ');
    }

    // The audit row records the decision, not the error text.
    expect(h.audit).toHaveLength(1);
    const detail = JSON.stringify(h.audit[0]?.detail);
    expect(detail).not.toContain('at Object');
    expect(detail).not.toContain('secret.ts');
    expect(h.audit[0]).toMatchObject({ actor: 'system', action: 'quarantine' });
  });

  it('a failed startup quarantines immediately with the same plain reason', async () => {
    const h = setup({ crashThreshold: 5, windowMs: 300_000 }, ['bot-bad']);
    await h.gateway.addBot({ id: 'bot-good', token: TOKEN_A });
    await expect(h.gateway.addBot({ id: 'bot-bad', token: TOKEN_B })).rejects.toThrow(
      'invalid token',
    );

    expect(h.gateway.status('bot-bad')).toBe('quarantined');
    expect(h.gateway.status('bot-good')).toBe('live');

    const quarantine = quarantineRecords(h.logger);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toBe(QUARANTINE_USER_REASON);
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      botId: 'bot-bad',
      actor: 'system',
      action: 'quarantine',
      detail: { reason: 'explicit', crashes: 0 },
    });
  });
});
