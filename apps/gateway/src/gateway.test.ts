import { describe, expect, it } from 'vitest';
import {
  createGateway,
  type GatewayClient,
  type GatewayLogger,
  type GatewayStore,
  type LifecycleEvent,
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
  destroyShouldThrow?: unknown;
  // Optional hold: when set, login() stays pending until the gate resolves.
  // Lets a test observe the 'connecting' state in the middle of a login.
  loginGate?: Promise<void>;
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
    if (this.loginGate !== undefined) {
      await this.loginGate;
    }
    this.loggedIn = true;
    this.seenToken = token;
  }

  async destroy(): Promise<void> {
    if (this.destroyShouldThrow !== undefined) {
      throw this.destroyShouldThrow;
    }
    this.destroyed = true;
    this.disconnectOrder.push(`destroy:${this.botId}`);
  }

  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? []) {
      listener(error);
    }
  }

  emitShardError(error: unknown): void {
    for (const listener of this.listeners.get('shardError') ?? []) {
      listener(error);
    }
  }

  emitShardDisconnect(closeEvent: unknown): void {
    for (const listener of this.listeners.get('shardDisconnect') ?? []) {
      listener(closeEvent);
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

  it('quarantines a 4014 disallowed-intents login with a distinct reason', async () => {
    const clients = new Map<string, FakeClient>();
    const logger = new FakeLogger();
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId);
        if (botId === 'bot-intents') {
          client.loginShouldThrow = new Error('Used disallowed intents');
        }
        clients.set(botId, client);
        return client;
      },
      store: new FakeStore(),
      logger,
    });

    await expect(gateway.addBot({ id: 'bot-intents', token: TOKEN_ALPHA })).rejects.toThrow(
      'Used disallowed intents',
    );

    const quarantined = logger.records.filter((r) => r.event === 'bot-quarantined');
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.reason).toContain('disallowed-intents');
    expect(logger.records.some((r) => r.event === 'bot-disallowed-intents')).toBe(true);
  });

  it('recognizes the discord.js privileged-intent wording as disallowed too', async () => {
    const logger = new FakeLogger();
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId);
        client.loginShouldThrow = new Error(
          'Privileged intent provided is not enabled or whitelisted.',
        );
        return client;
      },
      store: new FakeStore(),
      logger,
    });

    await expect(gateway.addBot({ id: 'bot-priv', token: TOKEN_ALPHA })).rejects.toThrow(
      'Privileged intent',
    );

    const quarantined = logger.records.filter((r) => r.event === 'bot-quarantined');
    expect(quarantined[0]?.reason).toContain('disallowed-intents');
  });

  it('logs a failed destroy distinctly and never claims the bot disconnected', async () => {
    const { clients, logger, gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    const client = clients.get('bot-a');
    if (client !== undefined) {
      client.destroyShouldThrow = new Error('socket already gone');
    }

    await expect(gateway.shutdown()).rejects.toThrow('shutdown disconnected');

    expect(logger.records.some((r) => r.event === 'bot-disconnect-failed')).toBe(true);
    expect(logger.records.some((r) => r.event === 'bot-disconnected')).toBe(false);
  });
});

// H1: discord.js reports the dominant socket loss through shardError /
// shardDisconnect / invalidated, not through 'error'. Subscribing only to
// 'error' left the crash counter at 0 while the socket was already dead.
describe('gateway disconnect boundary', () => {
  it('routes shardDisconnect with no error event into the supervisor as a crash', async () => {
    const h = setupWithSupervisor({ crashThreshold: 5, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });

    h.clients.get('bot-a')?.emitShardDisconnect({ code: 1006, reason: 'abnormal closure' });
    await flushAsync();

    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(1);
    expect(h.scheduler.activeDelays()).toEqual([1000]);
  });

  it('routes shardError into the supervisor as a crash', async () => {
    const h = setupWithSupervisor({ crashThreshold: 5, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });

    h.clients.get('bot-a')?.emitShardError(new Error('websocket error'));
    await flushAsync();

    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(1);
  });

  it('without a supervisor, a shardDisconnect quarantines only that bot', async () => {
    const { clients, gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.addBot({ id: 'bot-b', token: TOKEN_BETA });

    clients.get('bot-a')?.emitShardDisconnect({ code: 1006 });
    await flushAsync();

    expect(gateway.status('bot-a')).toBe('quarantined');
    expect(gateway.status('bot-b')).toBe('live');
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

  // M2: a failed relogin must not leak the half-connected client.
  it('destroys the half-connected client when the relogin login fails', async () => {
    const h = setupWithSupervisor();
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    const first = h.clients.get('bot-a');
    h.failNextLogin.set('bot-a', new Error('vault token rejected'));

    await expect(h.gateway.relogin('bot-a', VAULT_TOKEN)).rejects.toThrow('vault token rejected');

    const fresh = h.clients.get('bot-a');
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(first);
    expect(fresh?.destroyed).toBe(true);
  });

  // M1: a successful relogin must not leave a live socket under a quarantined
  // status, or every later crash is ignored by the supervisor.
  it('clears quarantine on a successful relogin so future crashes are supervised', async () => {
    const h = setupWithSupervisor({ crashThreshold: 2, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    h.clients.get('bot-a')?.emitError(new Error('boom'));
    await flushAsync();
    h.clients.get('bot-a')?.emitError(new Error('boom'));
    await flushAsync();

    expect(h.gateway.status('bot-a')).toBe('quarantined');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(true);

    await h.gateway.relogin('bot-a', VAULT_TOKEN);

    expect(h.gateway.status('bot-a')).toBe('live');
    expect(h.supervisor.isQuarantined('bot-a')).toBe(false);
    expect(h.logger.records.some((r) => r.event === 'bot-quarantine-cleared')).toBe(true);

    // The re-armed boundary counts crashes again instead of ignoring them.
    h.clients.get('bot-a')?.emitError(new Error('boom'));
    await flushAsync();
    expect(h.supervisor.consecutiveCrashes('bot-a')).toBe(1);
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

// The fine-grained lifecycle machine. status() (legacy) is asserted alongside
// so the two surfaces are proven to agree at every step.
describe('gateway status machine', () => {
  it('reports unknown for a bot that was never added', () => {
    const { gateway } = setup();
    expect(gateway.getStatus('ghost')).toBe('unknown');
  });

  it('moves connecting -> ready -> destroyed and keeps status() in sync', async () => {
    const clients = new Map<string, FakeClient>();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId);
        client.loginGate = gate;
        clients.set(botId, client);
        return client;
      },
      store: new FakeStore(),
      logger: new FakeLogger(),
    });

    // addBot runs synchronously up to the pending login, so the machine is
    // observable in its connecting state before the login resolves.
    const pending = gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    expect(gateway.getStatus('bot-a')).toBe('connecting');
    expect(gateway.status('bot-a')).toBe('live');

    release?.();
    await pending;
    expect(gateway.getStatus('bot-a')).toBe('ready');
    expect(gateway.status('bot-a')).toBe('live');

    await gateway.removeBot('bot-a');
    expect(gateway.getStatus('bot-a')).toBe('destroyed');
    expect(gateway.status('bot-a')).toBe('unknown');
  });

  it('marks error (not ready) when the login fails, legacy status quarantined', async () => {
    const clients = new Map<string, FakeClient>();
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId);
        if (botId === 'bot-bad') {
          client.loginShouldThrow = new Error('invalid token');
        }
        clients.set(botId, client);
        return client;
      },
      store: new FakeStore(),
      logger: new FakeLogger(),
    });

    await expect(gateway.addBot({ id: 'bot-bad', token: TOKEN_BETA })).rejects.toThrow(
      'invalid token',
    );

    expect(gateway.getStatus('bot-bad')).toBe('error');
    expect(gateway.status('bot-bad')).toBe('quarantined');
  });

  it('moves quarantine to error while keeping the legacy quarantined status', async () => {
    const { gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    expect(gateway.getStatus('bot-a')).toBe('ready');

    await gateway.quarantine('bot-a', 'boom');

    expect(gateway.getStatus('bot-a')).toBe('error');
    expect(gateway.status('bot-a')).toBe('quarantined');
  });

  it('sets ready on a successful relogin and keeps error when it fails', async () => {
    const h = setupWithSupervisor({ crashThreshold: 2, windowMs: 300_000 });
    await h.gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    h.clients.get('bot-a')?.emitError(new Error('boom'));
    await flushAsync();
    h.clients.get('bot-a')?.emitError(new Error('boom'));
    await flushAsync();
    expect(h.gateway.getStatus('bot-a')).toBe('error');

    await h.gateway.relogin('bot-a', VAULT_TOKEN_FOR_STATUS);
    expect(h.gateway.getStatus('bot-a')).toBe('ready');

    h.failNextLogin.set('bot-a', new Error('vault token rejected'));
    await expect(h.gateway.relogin('bot-a', VAULT_TOKEN_FOR_STATUS)).rejects.toThrow(
      'vault token rejected',
    );
    expect(h.gateway.getStatus('bot-a')).toBe('error');
    // A failed relogin never quarantines, so the legacy surface is untouched.
    expect(h.gateway.status('bot-a')).toBe('live');
  });
});

const VAULT_TOKEN_FOR_STATUS = 'status-machine-issued-token';

describe('gateway tagged lifecycle events', () => {
  it('carries the bot id on ready and quarantined', async () => {
    const { gateway } = setup();
    const events: LifecycleEvent[] = [];
    gateway.onLifecycle((event) => events.push(event));

    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.quarantine('bot-a', 'boom');

    expect(events).toContainEqual({ botId: 'bot-a', event: 'ready' });
    expect(events).toContainEqual({ botId: 'bot-a', event: 'quarantined' });
  });

  it('tags a login failure as error and then quarantined', async () => {
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId);
        if (botId === 'bot-bad') {
          client.loginShouldThrow = new Error('invalid token');
        }
        return client;
      },
      store: new FakeStore(),
      logger: new FakeLogger(),
    });
    const events: LifecycleEvent[] = [];
    gateway.onLifecycle((event) => events.push(event));

    await expect(gateway.addBot({ id: 'bot-bad', token: TOKEN_BETA })).rejects.toThrow(
      'invalid token',
    );

    expect(events).toContainEqual({ botId: 'bot-bad', event: 'error' });
    expect(events).toContainEqual({ botId: 'bot-bad', event: 'quarantined' });
  });

  it('tags an unrecoverable shard disconnect with the bot id', async () => {
    const { clients, gateway } = setup();
    const events: LifecycleEvent[] = [];
    gateway.onLifecycle((event) => events.push(event));
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });

    clients.get('bot-a')?.emitShardDisconnect({ code: 1006, reason: 'abnormal closure' });
    await flushAsync();

    expect(events).toContainEqual({ botId: 'bot-a', event: 'disconnect' });
  });

  it('stops delivering after the unsubscribe handle is called', async () => {
    const { gateway } = setup();
    const events: LifecycleEvent[] = [];
    const unsubscribe = gateway.onLifecycle((event) => events.push(event));
    unsubscribe();

    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });

    expect(events).toEqual([]);
  });
});

describe('gateway startAll (non-rejecting batch start)', () => {
  it('starts every other bot when the middle token fails to load', async () => {
    const { gateway } = setup();
    const result = await gateway.startAll(['bot-a', 'bot-bad', 'bot-c'], async (id) => {
      if (id === 'bot-bad') {
        throw new Error('missing token');
      }
      return { id, token: TOKEN_ALPHA };
    });

    expect(result.started).toEqual(['bot-a', 'bot-c']);
    expect(result.failed).toEqual([{ id: 'bot-bad', reason: 'load_failed' }]);
    expect(gateway.getStatus('bot-a')).toBe('ready');
    expect(gateway.getStatus('bot-c')).toBe('ready');
    expect(gateway.getStatus('bot-bad')).toBe('unknown');
  });

  it('collects a login failure with the existing reason vocabulary and continues', async () => {
    const clients = new Map<string, FakeClient>();
    const gateway = createGateway({
      createClient: (botId: string) => {
        const client = new FakeClient(botId);
        if (botId === 'bot-bad') {
          client.loginShouldThrow = new Error('invalid token');
        }
        clients.set(botId, client);
        return client;
      },
      store: new FakeStore(),
      logger: new FakeLogger(),
    });

    const result = await gateway.startAll(['bot-a', 'bot-bad', 'bot-c'], async (id) => ({ id }));

    expect(result.started).toEqual(['bot-a', 'bot-c']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe('bot-bad');
    expect(result.failed[0]?.reason).toContain('invalid token');
    expect(gateway.getStatus('bot-bad')).toBe('error');
    expect(gateway.getStatus('bot-c')).toBe('ready');
  });

  it('never rejects even when every bot fails', async () => {
    const { gateway } = setup();
    const result = await gateway.startAll(['x', 'y'], async () => {
      throw new Error('boom');
    });

    expect(result.started).toEqual([]);
    expect(result.failed.map((failure) => failure.id)).toEqual(['x', 'y']);
  });
});

// SHUTDOWN THROW CONTRACT (gateway layer). The canonical text is on
// Gateway.shutdown in gateway.ts; the boot layer's half is asserted in
// start.test.ts. Both tests pin the same rule: shutdown is single-shot and
// never a retry.
describe('gateway shutdown throw contract', () => {
  it('resolves early on a repeated shutdown() after a failed first pass (no retry)', async () => {
    const { clients, store, logger, gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    const client = clients.get('bot-a');
    if (client !== undefined) {
      client.destroyShouldThrow = new Error('socket already gone');
    }

    await expect(gateway.shutdown()).rejects.toThrow('shutdown disconnected');
    // The shut-down flag is latched before teardown, so the repeat is a no-op
    // that resolves: the first failure is reported by the boot wrapper and is
    // never re-surfaced here, and teardown never re-runs.
    await expect(gateway.shutdown()).resolves.toBeUndefined();

    expect(store.flushCount).toBe(1);
    expect(
      logger.records.filter((record) => record.event === 'bot-disconnect-failed'),
    ).toHaveLength(1);
    expect(logger.records.filter((record) => record.event === 'bot-disconnected')).toHaveLength(0);
    expect(gateway.botIds()).toEqual([]);
  });

  it('keeps status() at unknown while getStatus() stays destroyed after removeBot (by design)', async () => {
    const { gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.removeBot('bot-a');

    expect(gateway.status('bot-a')).toBe('unknown');
    expect(gateway.getStatus('bot-a')).toBe('destroyed');
  });

  it('keeps status() at unknown while getStatus() stays destroyed after shutdown (by design)', async () => {
    const { gateway } = setup();
    await gateway.addBot({ id: 'bot-a', token: TOKEN_ALPHA });
    await gateway.shutdown();

    expect(gateway.status('bot-a')).toBe('unknown');
    expect(gateway.getStatus('bot-a')).toBe('destroyed');
  });
});
