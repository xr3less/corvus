import { describe, expect, it } from 'vitest';
import {
  createGateway,
  type GatewayClient,
  type GatewayLogger,
  type GatewayStore,
  type LogRecord,
} from './gateway.js';
import {
  createSupervisor,
  type Supervisor,
  type SupervisorPolicy,
} from './supervisor/supervisor.js';

const TOKEN_ALPHA = 'alpha-secret-token';
const TOKEN_BETA = 'beta-secret-token';

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeClient implements GatewayClient {
  destroyed = false;
  loggedIn = false;
  seenToken?: string;
  loginShouldThrow?: unknown;
  disconnectOrder: string[];
  private botId: string;
  private listeners = new Map<string, Array<(error: unknown) => void>>();

  constructor(botId: string, disconnectOrder: string[] = []) {
    this.botId = botId;
    this.disconnectOrder = disconnectOrder;
  }

  on(event: string, listener: (error: unknown) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
  }

  async login(token?: string): Promise<void> {
    if (this.loginShouldThrow !== undefined) {
      throw this.loginShouldThrow;
    }
    this.loggedIn = true;
    this.seenToken = token;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.disconnectOrder.push(`destroy:${this.botId}`);
  }

  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? []) {
      listener(error);
    }
  }
}

class FakeStore implements GatewayStore {
  flushCount = 0;
  order: string[];

  constructor(order: string[] = []) {
    this.order = order;
  }

  flush(): void {
    this.flushCount += 1;
    this.order.push('flush');
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

interface Harness {
  clients: Map<string, FakeClient>;
  store: FakeStore;
  logger: FakeLogger;
  gateway: ReturnType<typeof createGateway>;
}

function setup(order: string[] = []): Harness {
  const clients = new Map<string, FakeClient>();
  const store = new FakeStore(order);
  const logger = new FakeLogger();
  const gateway = createGateway({
    createClient: (botId: string) => {
      const client = new FakeClient(botId, order);
      clients.set(botId, client);
      return client;
    },
    store,
    logger,
  });
  return { clients, store, logger, gateway };
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

  // Only the timers that would still fire: handleCrash cancels the previous
  // one before scheduling the next, so the active delay shows the current ramp.
  activeDelays(): number[] {
    return this.entries.filter((entry) => !entry.cancelled).map((entry) => entry.delayMs);
  }
}

interface SupervisorHarness extends Harness {
  supervisor: Supervisor;
  scheduler: FakeScheduler;
  quarantineCalls: string[];
  failNextLogin: Map<string, unknown>;
}

// Builds the gateway with the REAL supervisor so relogin's interaction with
// crash state is exercised end to end. The clock, scheduler and random are
// injected so backoff is deterministic; quarantine is recorded at the source.
function setupWithSupervisor(policy?: Partial<SupervisorPolicy>): SupervisorHarness {
  const clients = new Map<string, FakeClient>();
  const store = new FakeStore();
  const logger = new FakeLogger();
  const scheduler = new FakeScheduler();
  const quarantineCalls: string[] = [];
  const failNextLogin = new Map<string, unknown>();
  const clock = { value: 1_000_000 };
  const host: { gateway: ReturnType<typeof createGateway> | null } = { gateway: null };
  const supervisor = createSupervisor({
    logger,
    quarantine: (botId: string, reason: string) => {
      quarantineCalls.push(botId);
      return host.gateway?.quarantine(botId, reason);
    },
    audit: () => undefined,
    restart: () => undefined,
    policy,
    clock: () => clock.value,
    random: () => 0.5,
    scheduleRestart: (task: () => void, delayMs: number) => scheduler.schedule(task, delayMs),
  });
  const gateway = createGateway({
    createClient: (botId: string) => {
      const client = new FakeClient(botId);
      const pending = failNextLogin.get(botId);
      if (pending !== undefined) {
        client.loginShouldThrow = pending;
        failNextLogin.delete(botId);
      }
      clients.set(botId, client);
      return client;
    },
    store,
    logger,
    supervisor,
  });
  host.gateway = gateway;
  return { clients, store, logger, gateway, supervisor, scheduler, quarantineCalls, failNextLogin };
}

function assertCleanLogLines(logger: FakeLogger, forbidden: string[]): void {
  expect(logger.lines.length).toBeGreaterThan(0);
  for (const line of logger.lines) {
    const parsed = JSON.parse(line) as { botId?: unknown };
    expect(typeof parsed.botId).toBe('string');
    for (const secret of forbidden) {
      expect(line).not.toContain(secret);
    }
  }
}
describe('gateway core', () => {
  it('quarantining one bot leaves its sibling alive', async () => {
    const { clients, logger, gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.addBot({ id: 'bot-b', token: TOKEN_BETA });

    clients.get('bot-a')?.emitError(new Error('connection reset'));
    await flushAsync();

    expect(gateway.status('bot-a')).toBe('quarantined');
    expect(gateway.status('bot-b')).toBe('live');
    expect(clients.get('bot-a')?.destroyed).toBe(true);
    expect(clients.get('bot-b')?.destroyed).toBe(false);
    expect(clients.get('bot-b')?.loggedIn).toBe(true);

    const quarantineLines = logger.records.filter((r) => r.event === 'bot-quarantined');
    expect(quarantineLines.length).toBe(1);
    expect(quarantineLines[0]?.botId).toBe('bot-a');
  });

  it('a failed login quarantines that bot and rejects, sibling untouched', async () => {
    const order: string[] = [];
    const clients = new Map<string, FakeClient>();
    const store = new FakeStore(order);
    const logger = new FakeLogger();
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId, order);
        if (botId === 'bot-bad') {
          client.loginShouldThrow = new Error('invalid token');
        }
        clients.set(botId, client);
        return client;
      },
      store,
      logger,
    });

    await gateway.addBot({ id: 'bot-good', token: TOKEN_ALPHA });
    await expect(gateway.addBot({ id: 'bot-bad', token: TOKEN_BETA })).rejects.toThrow(
      'invalid token',
    );

    expect(gateway.status('bot-bad')).toBe('quarantined');
    expect(gateway.status('bot-good')).toBe('live');
    expect(clients.get('bot-good')?.destroyed).toBe(false);
  });

  it('removeBot disconnects only that bot', async () => {
    const { clients, gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.addBot({ id: 'bot-b', token: TOKEN_BETA });

    await gateway.removeBot('bot-a');

    expect(clients.get('bot-a')?.destroyed).toBe(true);
    expect(clients.get('bot-b')?.destroyed).toBe(false);
    expect(gateway.botIds()).toEqual(['bot-b']);
  });

  it('shutdown flushes the store before disconnecting any bot', async () => {
    const order: string[] = [];
    const { store, gateway } = setup(order);
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.addBot({ id: 'bot-b', token: TOKEN_BETA });

    await gateway.shutdown();

    expect(store.flushCount).toBe(1);
    expect(order[0]).toBe('flush');
    expect(order).toContain('destroy:bot-a');
    expect(order).toContain('destroy:bot-b');
    expect(gateway.botIds()).toEqual([]);
    // Idempotent: a second shutdown flushes nothing more.
    await gateway.shutdown();
    expect(store.flushCount).toBe(1);
  });

  it('log lines are JSON with botId and never carry tokens', async () => {
    const { logger, gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.addBot({ id: 'bot-b', token: TOKEN_BETA });
    await gateway.quarantine('bot-b', 'boom');
    await gateway.removeBot('bot-a');

    // The reason is preserved (logging works) while secrets never appear.
    expect(logger.lines.some((line) => line.includes('boom'))).toBe(true);
    assertCleanLogLines(logger, [TOKEN_ALPHA, TOKEN_BETA]);
  });
});

describe('gateway relogin (supervised restart)', () => {
  const VAULT_TOKEN = 'vault-issued-secret-token';

  it('destroys the old client, logs in the fresh one, and re-arms the error boundary', async () => {
    const h = setupWithSupervisor();
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    const first = h.clients.get('bot-a');

    await h.gateway.relogin('bot-a', VAULT_TOKEN);

    expect(first?.destroyed).toBe(true);
    const second = h.clients.get('bot-a');
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(second?.loggedIn).toBe(true);
    expect(second?.seenToken).toBe(VAULT_TOKEN);

    // The boundary is live on the NEW client: an error routes to the supervisor.
    second?.emitError(new Error('connection reset'));
    await flushAsync();
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(1);

    const reconnect = h.logger.records.filter((r) => r.event === 'bot-reconnected');
    expect(reconnect).toHaveLength(1);
    expect(reconnect[0]?.botId).toBe('bot-a');
    // The new log event never carries the token (or the original one).
    assertCleanLogLines(h.logger, [TOKEN_ALPHA, VAULT_TOKEN]);
  });

  it('propagates a login failure without quarantining (the policy owns that decision)', async () => {
    const h = setupWithSupervisor();
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    h.failNextLogin.set('bot-a', new Error('vault token rejected'));

    await expect(h.gateway.relogin('bot-a', VAULT_TOKEN)).rejects.toThrow('vault token rejected');

    expect(h.quarantineCalls).toEqual([]);
    expect(h.supervisor.isQuarantined('bot-a')).toBe(false);
    expect(h.gateway.status('bot-a')).toBe('live');
    expect(h.logger.records.some((r) => r.event === 'bot-quarantined')).toBe(false);
    // A failed relogin never logs the success event.
    expect(h.logger.records.some((r) => r.event === 'bot-reconnected')).toBe(false);
  });

  it('rejects an unknown bot id', async () => {
    const h = setupWithSupervisor();
    await expect(h.gateway.relogin('ghost')).rejects.toThrow('unknown bot');
  });

  // THE PRESERVATION TEST. Under a removeBot + addBot implementation the
  // counter resets (forget + registerBot), so the second crash would report
  // attempt 1 and delay 1000ms. relogin must keep it at 2 / 2000ms.
  it('preserves the consecutive-crash counter across a relogin', async () => {
    const h = setupWithSupervisor({ crashThreshold: 5, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });

    h.clients.get('bot-a')?.emitError(new Error('connection reset'));
    await flushAsync();
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(1);
    expect(h.scheduler.activeDelays()).toEqual([1000]);

    await h.gateway.relogin('bot-a', VAULT_TOKEN);
    // removeBot would have forgotten this; addBot would have reset it.
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(1);

    h.clients.get('bot-a')?.emitError(new Error('connection reset'));
    await flushAsync();
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(2);
    expect(h.scheduler.activeDelays()).toEqual([2000]);
  });
});
