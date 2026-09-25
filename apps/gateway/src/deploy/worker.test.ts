// Sync-commands worker tests (E6-C2): job contract + startup singleton.
//
// No Postgres, no Discord REST, no hooks that throw: runSyncCommandsJob is
// exercised with injected fakes (token envelope via the real encryptToken with
// a stubbed ENCRYPTION_KEY); the lifecycle half mocks pg-boss + pg exactly as
// the preflight startup suite does. Secret hygiene: no token or key bytes are
// asserted — only shapes, codes, and call counts.

import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bossMock = vi.hoisted(() => ({
  starts: 0,
  stops: 0,
  instances: 0,
  queues: [] as string[],
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
    async createQueue(name: string): Promise<void> {
      bossMock.queues.push(name);
      void name;
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

// deploy-commands.ts only runs main() when invoked as the entry script
// (argv-identity guard, same as start.ts), so a plain import is side-effect
// free and no env stubs are needed.
vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  class MockREST {
    setToken(): this {
      return this;
    }
    async get(): Promise<{ id: string }> {
      return { id: 'app-id' };
    }
    async put(): Promise<unknown> {
      return undefined;
    }
  }
  const MockRoutes = {
    oauth2CurrentApplication: () => '/oauth2/applications/@me',
    applicationGuildCommands: (appId: string, guildId: string) =>
      `/applications/${appId}/guilds/${guildId}/commands`,
  };
  return { ...actual, REST: MockREST, Routes: MockRoutes };
});

import { encryptToken } from '../lib/crypto.js';
import {
  isSyncCommandsWorkerRunning,
  runSyncCommandsJob,
  startSyncCommandsWorker,
  SYNC_COMMANDS_QUEUE,
  type SyncCommandsDeps,
  type SyncCommandsWorkerHandle,
} from './worker.js';

const BOT_ID = 'bot-sync-001';
const GUILD_ID = 'guild-sync-001';

function stubKey(): void {
  vi.stubEnv('ENCRYPTION_KEY', randomBytes(32).toString('base64'));
}

function makeDeps(overrides: Partial<SyncCommandsDeps> = {}): SyncCommandsDeps & {
  sync: ReturnType<typeof vi.fn>;
  loadToken: ReturnType<typeof vi.fn>;
} {
  stubKey();
  const cipher = encryptToken(BOT_ID, 'token-for-tests-only');
  const deps = {
    loadToken: vi.fn(async () => ({ tokenCipher: cipher })),
    sync: vi.fn(async () => 7),
    ...overrides,
  };
  return deps as SyncCommandsDeps & {
    sync: ReturnType<typeof vi.fn>;
    loadToken: ReturnType<typeof vi.fn>;
  };
}

let handle: SyncCommandsWorkerHandle | undefined;

beforeEach(() => {
  bossMock.starts = 0;
  bossMock.stops = 0;
  bossMock.instances = 0;
  bossMock.queues.length = 0;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (handle !== undefined) {
    await handle.stop();
    handle = undefined;
  }
});

describe('runSyncCommandsJob', () => {
  it('syncs guild commands and reports the command count', async () => {
    const deps = makeDeps();
    const result = await runSyncCommandsJob(deps, { botId: BOT_ID, guildId: GUILD_ID });
    expect(result).toEqual({ ok: true, commands: 7 });
    expect(deps.loadToken).toHaveBeenCalledWith(BOT_ID);
    expect(deps.sync).toHaveBeenCalledTimes(1);
    // The decrypted token reaches sync in-memory; it never appears in output.
    const syncToken: unknown = deps.sync.mock.calls[0]?.[0];
    expect(typeof syncToken).toBe('string');
    expect(JSON.stringify(result)).not.toContain(syncToken as string);
    expect(deps.sync.mock.calls[0]?.[1]).toBe(GUILD_ID);
  });

  it('rejects empty ids as bad_job without touching the vault or Discord', async () => {
    const deps = makeDeps();
    expect(await runSyncCommandsJob(deps, { botId: '', guildId: GUILD_ID })).toEqual({
      error: 'bad_job',
    });
    expect(await runSyncCommandsJob(deps, { botId: BOT_ID, guildId: '' })).toEqual({
      error: 'bad_job',
    });
    expect(deps.loadToken).not.toHaveBeenCalled();
    expect(deps.sync).not.toHaveBeenCalled();
  });

  it('maps an unknown bot to transient (retryable)', async () => {
    const deps = makeDeps({ loadToken: vi.fn(async () => null) });
    expect(await runSyncCommandsJob(deps, { botId: BOT_ID, guildId: GUILD_ID })).toEqual({
      error: 'transient',
    });
    expect(deps.sync).not.toHaveBeenCalled();
  });

  it('maps a decrypt failure to transient without leaking token bytes', async () => {
    const deps = makeDeps({
      loadToken: vi.fn(async () => ({ tokenCipher: Buffer.from('not-an-envelope') })),
    });
    const result = await runSyncCommandsJob(deps, { botId: BOT_ID, guildId: GUILD_ID });
    expect(result).toEqual({ error: 'transient' });
    expect(deps.sync).not.toHaveBeenCalled();
  });

  it('maps a Discord PUT failure to transient', async () => {
    const deps = makeDeps({ sync: vi.fn(async () => Promise.reject(new Error('403'))) });
    expect(await runSyncCommandsJob(deps, { botId: BOT_ID, guildId: GUILD_ID })).toEqual({
      error: 'transient',
    });
  });
});

describe('sync-commands worker startup', () => {
  it('starts one worker, creates the queue, and reports it running', async () => {
    expect(isSyncCommandsWorkerRunning()).toBe(false);
    handle = await startSyncCommandsWorker('postgresql://mock/db');
    expect(isSyncCommandsWorkerRunning()).toBe(true);
    expect(bossMock.instances).toBe(1);
    expect(bossMock.starts).toBe(1);
    expect(bossMock.queues).toEqual([SYNC_COMMANDS_QUEUE]);
  });

  it('returns the same handle on a defensive double start', async () => {
    const first = await startSyncCommandsWorker('postgresql://mock/db');
    handle = first;
    const second = await startSyncCommandsWorker('postgresql://mock/db');
    expect(second).toBe(first);
    expect(bossMock.instances).toBe(1);
  });

  it('stops the worker and clears the running flag', async () => {
    const local = await startSyncCommandsWorker('postgresql://mock/db');
    expect(isSyncCommandsWorkerRunning()).toBe(true);
    await local.stop();
    expect(isSyncCommandsWorkerRunning()).toBe(false);
    expect(bossMock.stops).toBe(1);
  });
});
