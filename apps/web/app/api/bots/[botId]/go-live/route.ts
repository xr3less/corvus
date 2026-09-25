// POST /api/bots/[botId]/go-live — transition a bot to genuinely live (E6 install chain).
//
// Gates, in order: session (401) → ownership (404-shape, never a 403-leak:
// unknown, foreign, malformed and soft-deleted ids share one shape) → Red scan
// (409 via the shared detectRedFailing; unscanned installs are allowed per the
// locked publish rule) → token custody (409 while the mint placeholder is still
// empty) → prod-spec pointer (409 when nothing was ever published) → a single
// transaction flipping status + appending the audit row → one pg-boss
// `sync-commands` send per installed guild ({ botId, guildId }) that the
// gateway worker owns (the worker deadletters jobs without guildId, so a
// bot-level send would never sync commands into Discord).
//
// This route is the FIRST and only non-test writer of bots.status = 'live'
// (readers: the gateway BOOT_LIVE_BOTS_SQL live-only filter; the E4 sweeper
// inverts that filter). The token itself is never read — presence is measured
// with octet_length only, so token bytes never enter this process and can
// never leak into a log or a response. The web package must not import gateway
// internals, so the command sync crosses the boundary as a queue job, never a
// function call.

import type { PoolClient } from 'pg';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import {
  DatabaseNotConfiguredError,
  getPool,
  mapDbError,
  requireDatabaseUrl,
  __setPool,
} from '../../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../../lib/interview/session-bind';
import { isUuid } from '../../../../../lib/editor/drafts';
import { detectRedFailing, latestPreflightEnvelope } from '../../../../../lib/spec/preflight';

export interface GoLiveSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<GoLiveSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/bots/[botId]/activity/route.ts).
export { __setPool };

const closedReader: SessionReader = {
  getSession: async () => null,
};

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = closedReader;
}

// Queue name shared with the gateway worker (apps/gateway/src/deploy/worker.ts
// consumes it; this route only enqueues). Exported so the name is a single
// source of truth on the web side.
export const SYNC_COMMANDS_QUEUE = 'sync-commands';

// --- Injectable boss seam (mirrors preflight/start/route.ts) -----------------
// One client per request (created, started, used, stopped in a finally) — no
// shared boss, no leaked pools. createQueue-before-send is mandatory: pg-boss
// v12 does not auto-create the queue on send.

export interface GoLiveBoss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
}

// The connection string resolves through requireDatabaseUrl() (never a test
// fallback), so a misconfigured process fails fast with an honest 500 instead
// of silently talking to the wrong database.
function defaultBossFactory(): GoLiveBoss {
  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data, options) => boss.send(name, data, options),
  };
}

let bossFactory: () => GoLiveBoss = defaultBossFactory;

export function __setBossFactory(factory: () => GoLiveBoss): void {
  bossFactory = factory;
}

export function __resetBossFactory(): void {
  bossFactory = defaultBossFactory;
}

function error(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

// --- SQL ---------------------------------------------------------------------

// octet_length measures the cipher without reading it: a zero length is the
// mint placeholder (no token custody yet); anything longer is a stored token
// whose bytes this route never touches.
export const OWNED_BOT_SQL =
  'SELECT prod_spec_id, status, octet_length(token_cipher) AS token_len ' +
  'FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL';

export const SCANS_SQL =
  'SELECT guild_id, preflight FROM guild_installs WHERE bot_id = $1';

export const GO_LIVE_SQL =
  "UPDATE bots SET status = 'live', updated_at = now() " +
  'WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL';

export const AUDIT_SQL =
  'INSERT INTO audit_events (account_id, bot_id, actor, action, detail) ' +
  "VALUES ($1, $2, $3, 'go-live', $4::jsonb)";

export interface OwnedBotRow {
  prod_spec_id: string | null;
  status: string;
  // octet_length arrives from pg as a string (bigint); accept a number too so
  // pure tests can call this directly.
  token_len: string | number | null;
}

// --- Presence (pure, token bytes never involved) ------------------------------

export function isTokenPresent(tokenLen: string | number | null | undefined): boolean {
  if (tokenLen === null || tokenLen === undefined) {
    return false;
  }
  const length = typeof tokenLen === 'number' ? tokenLen : Number(tokenLen);
  return Number.isFinite(length) && length > 0;
}

// --- Route -------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { botId } = await params;
  if (!isUuid(botId)) {
    return error(404, 'not found');
  }

  const pool = getPool();

  let owned: OwnedBotRow;
  try {
    const result = await pool.query<OwnedBotRow>(OWNED_BOT_SQL, [botId, session.accountId]);
    const row = result.rows[0];
    if (!row) {
      return error(404, 'not found');
    }
    owned = row;
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not go live');
  }

  // Red block (shared with publish): every non-null guild_installs.preflight
  // for the bot is inspected, worst guild wins. No scan at all is allowed —
  // the audit note below records 'unscanned' in that case. The same read also
  // yields the installed guild ids for the post-commit sync fan-out.
  let envelopes: unknown[];
  let guildIds: string[];
  try {
    const scans = await pool.query<{ guild_id: string | null; preflight: unknown }>(
      SCANS_SQL,
      [botId],
    );
    envelopes = scans.rows
      .map((scan) => scan.preflight)
      .filter((preflight) => preflight !== null && preflight !== undefined);
    guildIds = [...new Set(
      scans.rows
        .map((scan) => scan.guild_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    )];
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not go live');
  }

  const failing = detectRedFailing(envelopes);
  if (failing.length > 0) {
    return error(409, 'preflight red', { reason: 'preflight-red', failing });
  }

  if (!isTokenPresent(owned.token_len)) {
    return error(409, 'bot token not saved', { reason: 'missing-token' });
  }

  if (owned.prod_spec_id === null) {
    return error(409, 'no production spec yet', { reason: 'no-prod-spec' });
  }

  const preflight = latestPreflightEnvelope(envelopes) ?? 'unscanned';
  const detail = JSON.stringify({ preflight });

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not go live');
  }
  try {
    await client.query('BEGIN');
    const moved = await client.query(GO_LIVE_SQL, [botId, session.accountId]);
    if (moved.rowCount !== 1) {
      // Deleted between the gate and the write — still 404-shaped, never a leak.
      await client.query('ROLLBACK').catch(() => undefined);
      return error(404, 'not found');
    }
    await client.query(AUDIT_SQL, [
      session.accountId,
      botId,
      `owner:${session.discordId}`,
      detail,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not go live');
  } finally {
    client.release();
  }

  // The status flip is committed; the command sync is a best-effort enqueue
  // after it (a queue send cannot join the DB transaction). The worker
  // requires { botId, guildId } per job (it deadletters jobs without a
  // guildId), so one job fans out per installed guild read above. Zero
  // installed guilds is still 200 live — no boss is even started; commands
  // sync on first install via the guildCreate path. If a send fails the bot
  // IS live — the 500 names that, with a reason the caller can retry on
  // (re-POST is idempotent: same status, new audit row, new job attempts;
  // per-guild singleton keys dedupe still-pending jobs).
  if (guildIds.length === 0) {
    return Response.json({ botId, status: 'live', jobId: null, jobIds: [] }, { status: 200 });
  }

  let boss: GoLiveBoss;
  try {
    boss = bossFactory();
  } catch (err) {
    const message =
      err instanceof DatabaseNotConfiguredError ? 'database not configured' : 'could not sync commands';
    return error(500, message, { reason: 'sync-enqueue-failed', status: 'live', botId });
  }
  try {
    await boss.start();
    await boss.createQueue(SYNC_COMMANDS_QUEUE);
    const jobIds: string[] = [];
    for (const guildId of guildIds) {
      const jobId = await boss.send(
        SYNC_COMMANDS_QUEUE,
        { botId, guildId },
        {
          singletonKey: `${botId}:${guildId}`,
          retryLimit: 3,
          retryDelay: 30,
          expireInSeconds: 3600,
          deleteAfterSeconds: 604800,
        },
      );
      if (!jobId) {
        return error(500, 'could not sync commands', {
          reason: 'sync-enqueue-failed',
          status: 'live',
          botId,
        });
      }
      jobIds.push(jobId);
    }
    // jobId (first) is kept so the pre-fan-out success shape still parses;
    // jobIds carries the full fan-out.
    return Response.json({ botId, status: 'live', jobId: jobIds[0] ?? null, jobIds }, { status: 200 });
  } catch {
    return error(500, 'could not sync commands', {
      reason: 'sync-enqueue-failed',
      status: 'live',
      botId,
    });
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the send result above stands; never mask it.
    }
  }
}
