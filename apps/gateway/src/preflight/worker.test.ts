import { Collection, type Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptToken } from '../lib/crypto.js';
import {
  FULL_PREFLIGHT_INTENTS,
  runPreflightScan,
  type PreflightJob,
  type PreflightResult,
  type PreflightSuccess,
  type WorkerDeps,
} from './worker.js';

// Synthetic 32-byte key for the REAL sibling vault envelope: tests encrypt a
// fake token with the real encryptToken and decrypt it inside runPreflightScan
// via the real decryptToken. No production secret, no stubbed crypto.
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const FAKE_TOKEN = 'fake-discord-token-no-secret';

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function validJob(overrides: Partial<PreflightJob> = {}): PreflightJob {
  return {
    botId: 'bot-1',
    guildId: '123456789012345678',
    required: [{ perm: 'ManageMessages', why: 'needed to moderate' }],
    bitfield: '8192',
    intents: [...FULL_PREFLIGHT_INTENTS],
    expectedCommands: 3,
    ...overrides,
  };
}

function fakeGuild() {
  return {
    id: '123456789012345678',
    roles: {
      // discord.js managers return Collection (with .map/.filter), never a
      // native Map - the fakes must too, or the adapters fail exactly like
      // production code would against a wrong shape.
      fetch: async () => new Collection([['role-1', { id: 'role-1', name: 'Bot', position: 5 }]]),
    },
    channels: {
      fetch: async () => new Collection(),
    },
    members: {
      fetchMe: async () => ({
        roles: { cache: new Collection([['role-1', {}]]) },
        permissions: { bitfield: '8' },
      }),
    },
    application: null,
  };
}

function fakeConnectedClient(onDestroy: () => void = () => undefined) {
  return {
    login: async () => 'fake-token',
    destroy: async () => {
      onDestroy();
    },
    user: { id: 'bot-user-1' },
    guilds: { fetch: async () => fakeGuild() },
    application: { commands: { fetch: async () => ({ size: 3 }) } },
  } as unknown as Client;
}

function baseDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps & {
  saved: { botId: string; guildId: string; preflight: object }[];
} {
  const saved: { botId: string; guildId: string; preflight: object }[] = [];
  return {
    loadBot: async (botId: string) => ({ tokenCipher: encryptToken(botId, FAKE_TOKEN) }),
    savePreflight: async (botId: string, guildId: string, preflight: object) => {
      saved.push({ botId, guildId, preflight });
    },
    createClient: () => fakeConnectedClient(),
    saved,
    ...overrides,
  };
}

function isSuccess(result: PreflightResult): result is PreflightSuccess {
  return !('error' in result);
}

describe('preflight worker', () => {
  it('happy path - persists rows and returns result shape', async () => {
    const deps = baseDeps();
    const result = await runPreflightScan(deps, validJob());
    expect(isSuccess(result)).toBe(true);
    if (!isSuccess(result)) return;
    expect(typeof result.scannedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.scannedAt))).toBe(false);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.summary.red + result.summary.yellow + result.summary.green).toBe(
      result.rows.length,
    );
    expect(deps.saved).toHaveLength(1);
    expect(deps.saved[0]?.botId).toBe('bot-1');
    expect(deps.saved[0]?.guildId).toBe('123456789012345678');
    expect(deps.saved[0]?.preflight).toMatchObject({ rows: result.rows, summary: result.summary });
  });

  it('happy path - full login success uses zero extra probe logins', async () => {
    const createClient = vi.fn(() => fakeConnectedClient());
    const deps = baseDeps({ createClient });
    const result = await runPreflightScan(deps, validJob());
    expect(isSuccess(result)).toBe(true);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('login reject - resolves login_failed without throwing', async () => {
    const onDestroy = vi.fn();
    const deps = baseDeps({
      createClient: () =>
        ({
          login: async () => {
            throw new Error('Incorrect login details');
          },
          destroy: async () => {
            onDestroy();
          },
        }) as unknown as Client,
    });
    const result = await runPreflightScan(deps, validJob());
    expect(result).toEqual({ error: 'login_failed' });
    expect(onDestroy).toHaveBeenCalled();
  });

  it('disallowed intents - triangulates by exclusion within 3 logins', async () => {
    const seenIntents: string[][] = [];
    let calls = 0;
    const deps = baseDeps({
      createClient: (_token: string, intents: readonly string[]) => {
        calls += 1;
        seenIntents.push([...intents]);
        if (calls === 1) {
          return {
            login: async () => {
              throw new Error('Disallowed intents (close 4014)');
            },
            destroy: async () => undefined,
          } as unknown as Client;
        }
        return fakeConnectedClient();
      },
    });
    const result = await runPreflightScan(deps, validJob());
    expect(isSuccess(result)).toBe(true);
    expect(calls).toBeLessThanOrEqual(3);
    expect(seenIntents[1]).not.toContain('GuildMembers');
  });

  it('save failure - rejects transient and still destroys client', async () => {
    const onDestroy = vi.fn();
    const deps = baseDeps({
      createClient: () => fakeConnectedClient(onDestroy),
      savePreflight: async () => {
        throw new Error('db down');
      },
    });
    await expect(runPreflightScan(deps, validJob())).rejects.toThrow('preflight_transient');
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it('malformed job - resolves bad_job', async () => {
    const createClient = vi.fn(() => fakeConnectedClient());
    const badDeps = baseDeps({ createClient });
    const cases: unknown[] = [
      {},
      null,
      validJob({ botId: '' }),
      validJob({ guildId: '' }),
      validJob({ required: [] }),
      validJob({ required: [{ perm: '', why: 'x' }] }),
      validJob({ bitfield: '' }),
      validJob({ intents: [] }),
      validJob({ intents: ['NotAnIntent'] }),
      validJob({ expectedCommands: -1 }),
      validJob({ expectedCommands: 1.5 }),
    ];
    for (const job of cases) {
      const result = await runPreflightScan(badDeps, job as PreflightJob);
      expect(result).toEqual({ error: 'bad_job' });
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it('unknown bot - resolves unknown_bot', async () => {
    const deps = baseDeps({ loadBot: async () => null });
    const result = await runPreflightScan(deps, validJob());
    expect(result).toEqual({ error: 'unknown_bot' });
  });

  it('rescan - save args carry no joined_at', async () => {
    const deps = baseDeps();
    const result = await runPreflightScan(deps, validJob());
    expect(isSuccess(result)).toBe(true);
    expect(deps.saved).toHaveLength(1);
    const saved = deps.saved[0];
    expect(saved).toBeDefined();
    if (!saved) return;
    // savePreflight takes exactly (botId, guildId, preflight): joined_at is
    // insert-defaulted and never written on rescan.
    expect(Object.keys(saved)).toEqual(['botId', 'guildId', 'preflight']);
    expect(JSON.stringify(saved.preflight)).not.toContain('joined_at');
  });

  it('failure outputs carry codes only', async () => {
    const loginFailDeps = baseDeps({
      createClient: () =>
        ({
          login: async () => {
            throw new Error('Incorrect login details');
          },
          destroy: async () => undefined,
        }) as unknown as Client,
    });
    const failures: PreflightResult[] = [
      await runPreflightScan(baseDeps(), validJob({ botId: '' })),
      await runPreflightScan(baseDeps({ loadBot: async () => null }), validJob()),
      await runPreflightScan(loginFailDeps, validJob()),
    ];
    for (const failure of failures) {
      expect(Object.keys(failure)).toEqual(['error']);
      expect(JSON.stringify(failure)).not.toContain('bot-1');
      expect(JSON.stringify(failure)).not.toContain('cipher');
    }
  });
});
