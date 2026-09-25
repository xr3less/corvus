// Sync-commands worker (E6-C2): pg-boss `sync-commands` queue.
//
// The bot's slash commands are guild-scoped and must match the registry
// manifest (deploy-commands.ts) after every install or publish. This worker
// decrypts the bot's vault token and PUTs the registry body into ONE guild via
// syncGuildCommands() — never global commands.
//
// Job contract: { botId, guildId }. Result: { ok:true, commands:N } on success.
// Failure codes: bad_job (missing/empty ids, fail fast — retrying can never
// help) and transient (unknown bot, decrypt/vault failure, Discord failure —
// pg-boss retries). No new BotEvents: command sync is a REST PUT, not a gateway
// event.
//
// Secret policy: tokens are decrypted in-memory only and never logged; error
// outputs carry codes only, never provider text.

import { Pool } from 'pg';
import { PgBoss, type JobResult } from 'pg-boss';
import { syncGuildCommands } from '../deploy-commands.js';
import { decryptToken } from '../lib/crypto.js';

export const SYNC_COMMANDS_QUEUE = 'sync-commands';

export const SYNC_LOAD_TOKEN_SQL =
  'SELECT token_cipher AS "tokenCipher" FROM bots WHERE id = $1 AND deleted_at IS NULL';

export interface SyncCommandsJob {
  botId: string;
  guildId: string;
}

export type SyncCommandsError = 'bad_job' | 'transient';

export interface SyncCommandsSuccess {
  ok: true;
  commands: number;
}

export interface SyncCommandsFailure {
  error: SyncCommandsError;
}

export type SyncCommandsResult = SyncCommandsSuccess | SyncCommandsFailure;

export interface SyncCommandsDeps {
  loadToken(botId: string): Promise<{ tokenCipher: Buffer } | null>;
  sync(token: string, guildId: string): Promise<number>;
}

export interface SyncCommandsWorkerHandle {
  stop(): Promise<void>;
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function runSyncCommandsJob(
  deps: SyncCommandsDeps,
  job: SyncCommandsJob,
): Promise<SyncCommandsResult> {
  if (!isValidId(job?.botId) || !isValidId(job?.guildId)) {
    return { error: 'bad_job' };
  }
  const found = await deps.loadToken(job.botId);
  const cipher: unknown = found?.tokenCipher;
  if (found === null || found === undefined || !Buffer.isBuffer(cipher)) {
    return { error: 'transient' };
  }
  let token: string;
  try {
    token = decryptToken(job.botId, cipher);
  } catch {
    return { error: 'transient' };
  }
  try {
    const commands = await deps.sync(token, job.guildId);
    return { ok: true, commands };
  } catch {
    return { error: 'transient' };
  }
}

async function bootSyncCommandsWorker(connectionString: string): Promise<SyncCommandsWorkerHandle> {
  const boss = new PgBoss(connectionString);
  const pool = new Pool({ connectionString });
  // Bare listener: maintenance errors must not become unhandled 'error' crashes.
  boss.on('error', () => undefined);
  const deps: SyncCommandsDeps = {
    loadToken: async (botId: string) => {
      const found = await pool.query(SYNC_LOAD_TOKEN_SQL, [botId]);
      const first: unknown = found.rows[0];
      if (typeof first !== 'object' || first === null) return null;
      const cipher: unknown = (first as Record<string, unknown>)['tokenCipher'];
      if (!Buffer.isBuffer(cipher)) return null;
      return { tokenCipher: cipher };
    },
    sync: (token: string, guildId: string) => syncGuildCommands(token, guildId),
  };
  await boss.start();
  // pg-boss v12 does not auto-create a queue: create before work() or jobs sent
  // earlier are silently dropped (same as the preflight/builder workers).
  await boss.createQueue(SYNC_COMMANDS_QUEUE);
  const workOptions = { perJobResults: true } as const;
  await boss.work<SyncCommandsJob>(SYNC_COMMANDS_QUEUE, workOptions, async (jobs) => {
    const settled: JobResult[] = await Promise.all(
      jobs.map(async (job): Promise<JobResult> => {
        let result: SyncCommandsResult;
        try {
          result = await runSyncCommandsJob(deps, job.data);
        } catch {
          return { id: job.id, status: 'failed', output: { error: 'transient' } };
        }
        if ('error' in result) {
          return {
            id: job.id,
            // bad_job can never succeed on retry; transient takes the retry path.
            status: result.error === 'bad_job' ? 'deadletter' : 'failed',
            output: result,
          };
        }
        return { id: job.id, status: 'completed', output: result };
      }),
    );
    return settled;
  });
  return {
    stop: async () => {
      await boss.stop();
      await pool.end();
    },
  };
}

let runningHandle: SyncCommandsWorkerHandle | null = null;
let bootingHandle: Promise<SyncCommandsWorkerHandle> | null = null;

export function isSyncCommandsWorkerRunning(): boolean {
  return runningHandle !== null || bootingHandle !== null;
}

// Idempotent by design: one call, a defensive double call, or a racing pair
// still yields exactly one worker (same pattern as the preflight worker).
export async function startSyncCommandsWorker(
  connectionString: string,
): Promise<SyncCommandsWorkerHandle> {
  if (runningHandle !== null) return runningHandle;
  if (bootingHandle !== null) return bootingHandle;
  bootingHandle = (async () => {
    const raw = await bootSyncCommandsWorker(connectionString);
    const handle: SyncCommandsWorkerHandle = {
      stop: async () => {
        runningHandle = null;
        await raw.stop();
      },
    };
    runningHandle = handle;
    return handle;
  })();
  try {
    return await bootingHandle;
  } finally {
    bootingHandle = null;
  }
}
