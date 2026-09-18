import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  type Guild,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import { Pool } from 'pg';
import { PgBoss, type JobResult } from 'pg-boss';
import { decryptToken } from '../lib/crypto.js';
import { scanGuild, type PreflightRow, type ScanDeps, type ScanInput } from './scanner.js';

export const PREFLIGHT_QUEUE = 'preflight';

// Soft-deleted bots must never be logged in: the vault reader filters them, and
// the preflight lookup must match. Exported so the filter has a regression test.
export const PREFLIGHT_LOAD_BOT_SQL =
  'SELECT token_cipher AS "tokenCipher" FROM bots WHERE id = $1 AND deleted_at IS NULL';

// Client.login() resolves once the token is accepted and the shard connects —
// NOT once the client is usable. client.user / client.application are only
// populated on Discord's READY dispatch, so reading them straight after login
// threw preflight_not_ready into a retry loop. Wait for clientReady, bounded.
export const PREFLIGHT_READY_TIMEOUT_MS = 15_000;

export const FULL_PREFLIGHT_INTENTS = [
  'Guilds',
  'GuildMembers',
  'GuildMessages',
  'MessageContent',
  'GuildMessageReactions',
] as const;

export type PreflightFailureCode = 'bad_job' | 'unknown_bot' | 'login_failed';

export interface PreflightJob {
  botId: string;
  guildId: string;
  required: { perm: string; why: string }[];
  bitfield: string;
  intents: string[];
  expectedCommands: number;
}

export interface PreflightSuccess {
  scannedAt: string;
  rows: PreflightRow[];
  summary: { red: number; yellow: number; green: number };
}

export interface PreflightFailure {
  error: PreflightFailureCode;
}

export type PreflightResult = PreflightSuccess | PreflightFailure;

export interface WorkerDeps {
  loadBot(botId: string): Promise<{ tokenCipher: Buffer } | null>;
  savePreflight(botId: string, guildId: string, preflight: object): Promise<void>;
  createClient(token: string, intents: readonly string[]): Client;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (!isRecord(err)) return '';
  const parts: string[] = [];
  if (typeof err['name'] === 'string') parts.push(err['name']);
  if (typeof err['message'] === 'string') parts.push(err['message']);
  const code = err['code'];
  if (typeof code === 'string' || typeof code === 'number') parts.push(String(code));
  return parts.join(' ');
}

function isKnownIntentName(name: string): boolean {
  const table = GatewayIntentBits as unknown as Record<string, GatewayIntentBits | undefined>;
  return table[name] !== undefined;
}

function resolveIntents(names: readonly string[]): GatewayIntentBits[] {
  const table = GatewayIntentBits as unknown as Record<string, GatewayIntentBits | undefined>;
  return names.map((name) => {
    const bit = table[name];
    if (bit === undefined) throw new Error(`preflight_unknown_intent:${name}`);
    return bit;
  });
}

// Discord closes with 4014 (disallowed intents) without naming the offending
// privileged intent, so match on the close code / reason text.
function isDisallowedIntents(err: unknown): boolean {
  const hay = errorText(err);
  return hay.includes('4014') || /disallowed.?intents/i.test(hay);
}

// A login that fails on the network (DNS, reset, timeout, 5xx) is transient:
// pg-boss must retry it. Anything else at login is a bad token -> fail fast.
function isTransientNetwork(err: unknown): boolean {
  const hay = errorText(err);
  if (
    /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|network/i.test(hay)
  ) {
    return true;
  }
  if (isRecord(err) && typeof err['status'] === 'number' && err['status'] >= 500) return true;
  return false;
}

// 10004 Unknown Guild / 50001 Missing Access (HTTP 403/404): the bot is not
// in the guild. The scanner owns the not-installed Red row, so adapters
// report faithful empty data here and let scanGuild author the rows.
function isMissingAccess(err: unknown): boolean {
  if (!isRecord(err)) return false;
  return (
    err['code'] === 10004 || err['code'] === 50001 || err['status'] === 403 || err['status'] === 404
  );
}

function validateJob(job: unknown): { ok: true; value: PreflightJob } | { ok: false } {
  if (!isRecord(job)) return { ok: false };
  const botId = job['botId'];
  const guildId = job['guildId'];
  const required = job['required'];
  const bitfield = job['bitfield'];
  const intents = job['intents'];
  const expectedCommands = job['expectedCommands'];
  if (typeof botId !== 'string' || botId.length === 0) return { ok: false };
  if (typeof guildId !== 'string' || guildId.length === 0) return { ok: false };
  if (!Array.isArray(required) || required.length === 0) return { ok: false };
  const cleanRequired: { perm: string; why: string }[] = [];
  for (const item of required) {
    if (!isRecord(item)) return { ok: false };
    const perm = item['perm'];
    const why = item['why'];
    if (typeof perm !== 'string' || perm.length === 0 || typeof why !== 'string') {
      return { ok: false };
    }
    cleanRequired.push({ perm, why });
  }
  if (typeof bitfield !== 'string' || bitfield.length === 0) return { ok: false };
  if (!Array.isArray(intents) || intents.length === 0) return { ok: false };
  const cleanIntents: string[] = [];
  for (const name of intents) {
    // Unknown names are caller data, and an unknown name would make the real
    // discord.js client constructor throw -> fail closed here instead of
    // burning retries on a job that can never succeed.
    if (typeof name !== 'string' || name.length === 0 || !isKnownIntentName(name)) {
      return { ok: false };
    }
    cleanIntents.push(name);
  }
  if (
    typeof expectedCommands !== 'number' ||
    !Number.isInteger(expectedCommands) ||
    expectedCommands < 0
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      botId,
      guildId,
      required: cleanRequired,
      bitfield,
      intents: cleanIntents,
      expectedCommands,
    },
  };
}

async function destroyQuietly(made: Client): Promise<void> {
  try {
    await made.destroy();
  } catch {
    // A failed login leaves nothing worth reporting; the original error is
    // already captured by the caller. Deliberately no logging: connection
    // error text may echo connection details.
  }
}

// Waits until the client is actually ready (client.user/client.application
// populated) or the bounded timeout elapses. A timeout rejects with the
// existing preflight_not_ready code; the caller's catch maps it to the
// existing transient error, so no new failure taxonomy is introduced.
function waitForReady(client: Client, timeoutMs = PREFLIGHT_READY_TIMEOUT_MS): Promise<void> {
  if (client.isReady()) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    // settled guards against the clientReady listener and the timeout racing:
    // whichever fires first wins, and the late one is a no-op.
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('preflight_not_ready'));
    }, timeoutMs);
    client.once(Events.ClientReady, () => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      resolve();
    });
  });
}

async function loginWith(
  deps: WorkerDeps,
  token: string,
  intents: readonly string[],
): Promise<Client> {
  const made = deps.createClient(token, intents);
  try {
    await made.login(token);
    return made;
  } catch (err) {
    await destroyQuietly(made);
    throw err;
  }
}

async function fetchGuildOrNull(client: Client, guildId: string): Promise<Guild | null> {
  try {
    return await client.guilds.fetch(guildId);
  } catch (err) {
    if (isMissingAccess(err)) return null;
    throw err;
  }
}

export async function runPreflightScan(
  deps: WorkerDeps,
  job: PreflightJob,
): Promise<PreflightResult> {
  const valid = validateJob(job);
  if (!valid.ok) return { error: 'bad_job' };
  const { botId, guildId } = valid.value;

  let bot: { tokenCipher: Buffer } | null;
  try {
    bot = await deps.loadBot(botId);
  } catch {
    throw new Error('preflight_bot_lookup_failed');
  }
  if (bot === null) return { error: 'unknown_bot' };

  // The decrypted token is used for login only. Every error below carries a
  // code constant - token bytes never appear in a message, output, or log
  // (this worker logs nothing at all).
  let token: string;
  try {
    token = decryptToken(botId, bot.tokenCipher);
  } catch (err) {
    // CryptoError (wrong key, tampered bytes, wrong AAD) means this job can
    // never succeed -> fail fast. Anything else (e.g. missing env config) is
    // matched by class name so a sibling-owned error type never needs an
    // import here; non-crypto failures stay retryable.
    if (isRecord(err) && err['name'] === 'CryptoError') return { error: 'login_failed' };
    throw new Error('preflight_decrypt_failed');
  }

  // Connect. Discord's 4014 (disallowed intents) close does not name the
  // offending privileged intent, so triangulate by exclusion with at most 3
  // short-lived logins: full set, minus-GuildMembers, minus-MessageContent.
  // The first subset that connects becomes the scan connection and proves the
  // excluded intent was the blocked one; a full-set connection proves every
  // intent at once with zero extra logins.
  const fullIntents = [...valid.value.intents];
  let client: Client;
  let probe: { intent: string; ok: boolean }[];
  try {
    client = await loginWith(deps, token, fullIntents);
    probe = fullIntents.map((intent) => ({ intent, ok: true }));
  } catch (err) {
    if (isTransientNetwork(err)) throw new Error('preflight_login_network');
    if (!isDisallowedIntents(err)) return { error: 'login_failed' };
    const minusMembers = fullIntents.filter((intent) => intent !== 'GuildMembers');
    try {
      client = await loginWith(deps, token, minusMembers);
      probe = fullIntents.map((intent) => ({ intent, ok: intent !== 'GuildMembers' }));
    } catch (err2) {
      if (isTransientNetwork(err2)) throw new Error('preflight_login_network');
      if (!isDisallowedIntents(err2)) throw new Error('preflight_login_retry');
      const minusContent = fullIntents.filter((intent) => intent !== 'MessageContent');
      try {
        client = await loginWith(deps, token, minusContent);
        probe = fullIntents.map((intent) => ({ intent, ok: intent !== 'MessageContent' }));
      } catch (err3) {
        if (isTransientNetwork(err3)) throw new Error('preflight_login_network');
        // All three subsets refused: fail fast. (A base-privileged-only
        // fallback could still scan here; deliberately not attempted - the
        // contract caps this path at 3 logins.)
        return { error: 'login_failed' };
      }
    }
  }

  try {
    // H2: login() resolves the token, not readiness — wait for READY before
    // reading client.user / client.application.
    await waitForReady(client);
    const botUserId = client.user?.id;
    if (!botUserId) throw new Error('preflight_not_ready');
    const guild = await fetchGuildOrNull(client, guildId);
    const scanDeps: ScanDeps = {
      getRoles: async () => {
        if (!guild) return [];
        const roles = await guild.roles.fetch();
        return roles.map((role) => ({ id: role.id, name: role.name, position: role.position }));
      },
      getChannels: async () => {
        if (!guild) return [];
        const channels = await guild.channels.fetch();
        // Caller-enforced cap: first 25 text channels only. Bulk fetch may
        // contain nulls, so drop them before narrowing on channel type.
        const text = [...channels.values()]
          .filter(
            (channel): channel is TextChannel | NewsChannel =>
              channel !== null &&
              (channel.type === ChannelType.GuildText ||
                channel.type === ChannelType.GuildAnnouncement),
          )
          .slice(0, 25);
        return text.map((channel) => ({
          id: channel.id,
          name: channel.name,
          // ScanDeps types channel type as a string: emit the ChannelType
          // name (GuildText, GuildAnnouncement), never a raw number.
          type: ChannelType[channel.type] ?? String(channel.type),
          overwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
            roleId: overwrite.id,
            allow: String(overwrite.allow.bitfield),
            deny: String(overwrite.deny.bitfield),
          })),
        }));
      },
      getBotMember: async () => {
        if (!guild) return null;
        try {
          const me = await guild.members.fetchMe();
          return {
            roles: [...me.roles.cache.keys()],
            permissions: String(me.permissions.bitfield),
          };
        } catch (err) {
          if (isMissingAccess(err)) return null;
          throw err;
        }
      },
      probeIntents: async () => [...probe],
      getCommandCount: async () => {
        const app = client.application;
        if (!app) throw new Error('preflight_no_application');
        try {
          const commands = await app.commands.fetch({ guildId });
          return commands.size;
        } catch (err) {
          if (isMissingAccess(err)) return 0;
          throw err;
        }
      },
    };
    const input: ScanInput = {
      guildId,
      botUserId,
      required: valid.value.required,
      requiredBitfield: valid.value.bitfield,
      intents: [...valid.value.intents],
      expectedCommands: valid.value.expectedCommands,
    };
    const rows: PreflightRow[] = await scanGuild(input, scanDeps);
    const summary = { red: 0, yellow: 0, green: 0 };
    for (const row of rows) summary[row.tone] += 1;
    const result: PreflightSuccess = { scannedAt: new Date().toISOString(), rows, summary };
    // Upsert writes the preflight JSON only; joined_at is insert-defaulted
    // and never touched on rescan (enforced by the SQL in savePreflight, and
    // asserted in worker.test.ts via the saved args).
    await deps.savePreflight(botId, guildId, result);
    return result;
  } catch {
    // Post-login failures are transient by contract (network mid-scan,
    // non-login Discord 5xx): pg-boss retries them. The code constant keeps
    // third-party error text (URLs, request ids) out of the job output; the
    // handler maps this to a generic failed output.
    throw new Error('preflight_transient');
  } finally {
    await destroyQuietly(client);
  }
}

export interface PreflightWorkerHandle {
  stop(): Promise<void>;
}

// One preflight worker per process. pg-boss guards its OWN racing start()/stop()
// (node_modules/pg-boss/dist/index.d.ts: `start(): Promise<this>`,
// `stop(): Promise<void>`; live src/index.ts serialises them via #startingPromise
// / #stoppingPromise), but it will register the same polling worker twice if
// this process calls start() twice. That double-registration is what the guard
// below prevents — whether callers race (Promise.all) or call sequentially.
let runningHandle: PreflightWorkerHandle | null = null;
let bootingHandle: Promise<PreflightWorkerHandle> | null = null;

export function isWorkerRunning(): boolean {
  return runningHandle !== null || bootingHandle !== null;
}

async function bootPreflightWorker(connectionString: string): Promise<PreflightWorkerHandle> {
  const boss = new PgBoss(connectionString);
  const pool = new Pool({ connectionString });
  // L5: record maintenance failures instead of swallowing them. Never throw
  // from here — an unhandled emitter 'error' would crash the process — and
  // never log the error text, which can echo the connection string.
  boss.on('error', (error: Error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'preflight-boss-error',
        botId: 'system',
        reason: error.name,
      }),
    );
  });
  const realDeps: WorkerDeps = {
    loadBot: async (botId: string) => {
      const found = await pool.query(PREFLIGHT_LOAD_BOT_SQL, [botId]);
      const first: unknown = found.rows[0];
      if (!isRecord(first)) return null;
      const cipher: unknown = first['tokenCipher'];
      if (!Buffer.isBuffer(cipher)) return null;
      return { tokenCipher: cipher };
    },
    savePreflight: async (botId: string, guildId: string, preflight: object) => {
      await pool.query(
        'INSERT INTO guild_installs (bot_id, guild_id, preflight) VALUES ($1, $2, $3::jsonb) ' +
          'ON CONFLICT (bot_id, guild_id) DO UPDATE SET preflight = EXCLUDED.preflight',
        [botId, guildId, JSON.stringify(preflight)],
      );
    },
    createClient: (token: string, intents: readonly string[]) =>
      new Client({ intents: resolveIntents(intents) }),
  };
  await boss.start();
  // L4: pg-boss v12 does not auto-create a queue, so a worker must create it
  // before work() or jobs sent earlier are dropped (the senders in apps/web
  // already do this). The optional call tolerates the partial pg-boss double
  // in startup.test.ts, which is out of this task's write scope; the real
  // client always implements createQueue (pg-boss 12.x index.d.ts).
  await boss.createQueue?.(PREFLIGHT_QUEUE);
  // perJobResults:true so each job settles on its own outcome: 'completed'
  // stores the scan result, 'deadletter' fails terminally WITHOUT consuming
  // retries (bad token / bad job - retrying can never help, and the queue has
  // no dead-letter queue so the job simply lands failed with our coded
  // output), and 'failed' takes the normal retry path (transient). Throwing
  // from the handler would fail the whole batch instead, so transient errors
  // are returned as per-job 'failed' with a generic code-only output.
  const workOptions = { perJobResults: true } as const;
  await boss.work<PreflightJob>(PREFLIGHT_QUEUE, workOptions, async (jobs) => {
    const settled: JobResult[] = await Promise.all(
      jobs.map(async (job): Promise<JobResult> => {
        let result: PreflightResult;
        try {
          result = await runPreflightScan(realDeps, job.data);
        } catch {
          return { id: job.id, status: 'failed', output: { error: 'transient' } };
        }
        if ('error' in result) {
          return { id: job.id, status: 'deadletter', output: result };
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

// Idempotent by design: the gateway entry point may call this once, and a
// defensive double call (or a racing pair) still yields exactly one worker.
export async function startPreflightWorker(
  connectionString: string,
): Promise<PreflightWorkerHandle> {
  if (runningHandle !== null) return runningHandle;
  if (bootingHandle !== null) return bootingHandle;
  bootingHandle = (async () => {
    const raw = await bootPreflightWorker(connectionString);
    const handle: PreflightWorkerHandle = {
      stop: async () => {
        // Clear the singleton BEFORE awaiting the raw stop so a restart during
        // shutdown still sees a clean slot.
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
    // Cleared on success AND failure: on success `runningHandle` owns the
    // singleton; on failure clearing lets a later call retry instead of forever
    // returning a rejected promise.
    bootingHandle = null;
  }
}
