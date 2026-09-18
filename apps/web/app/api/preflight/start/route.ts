// POST /api/preflight/start — enqueue a bot-eye guild scan (V1-4 T-relay).
//
// The owner posts { botId, guildId, capabilities[] }; the route checks the
// session first, then bot ownership, then input shapes, maps capabilities
// through the REAL invite permission mapper, and enqueues one pg-boss job on
// the `preflight` queue. The gateway worker (T-worker) honors the same job
// shape sight-unseen per the V1-4 SPEC.
//
// pg-boss client policy: one client per request (created, started, used,
// stopped in a finally). No shared boss: route handlers are serverless-ish
// (a module-level client would leak pools across invocations), and per-test
// factory injection keeps unit tests hermetic without touching Postgres.

import { NextResponse } from 'next/server';
import { PgBoss } from 'pg-boss';
import type { JobWithMetadata, SendOptions } from 'pg-boss';
import { DatabaseNotConfiguredError, getPool, requireDatabaseUrl } from '../../../../lib/db/pool';
import { defaultSessionReader, type SessionReader } from '../../../../lib/interview/session-bind';
import {
  CAPABILITY_MAP,
  VALID_CAPABILITIES,
  capabilityBitfield,
  isCapability,
  type Capability,
  type PermissionWithWhy,
} from '../../../../lib/invite/permissions';

export const PREFLIGHT_QUEUE = 'preflight';

// Locked v1 gateway intent set (SPEC §4 Worker — Voice/Presence excluded).
export const PREFLIGHT_INTENTS: string[] = [
  'Guilds',
  'GuildMembers',
  'GuildMessages',
  'MessageContent',
  'GuildMessageReactions',
];

const GUILD_ID_RE = /^\d{17,20}$/;
const BOT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Injectable seams (fail-closed, test-only writers) ---

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = defaultSessionReader;
}

export interface PreflightBoss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
  getJobById(name: string, id: string): Promise<JobWithMetadata | null>;
}

// Mirrors builder-start: the connection string is resolved through
// requireDatabaseUrl() (never the CI test-database fallback), so a
// misconfigured process fails fast instead of silently talking to the test DB.
function defaultBossFactory(): PreflightBoss {
  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data, options) => boss.send(name, data, options),
    getJobById: (name, id) => boss.getJobById(name, id),
  };
}

let bossFactory: () => PreflightBoss = defaultBossFactory;

export function __setBossFactory(factory: () => PreflightBoss): void {
  bossFactory = factory;
}

export function __resetBossFactory(): void {
  bossFactory = defaultBossFactory;
}

// --- Handler ---

interface StartInput {
  botId?: unknown;
  guildId?: unknown;
  capabilities?: unknown;
}

export async function POST(req: Request): Promise<NextResponse> {
  let session = null;
  try {
    session = await sessionReader.getSession(req);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: StartInput = {};
  try {
    raw = (await req.json()) as StartInput;
  } catch {
    raw = {};
  }

  // Malformed ids are indistinguishable from foreign ones: 404, never 403.
  // The UUID pre-check also keeps garbage out of the Postgres query.
  const botId = typeof raw.botId === 'string' ? raw.botId : '';
  if (!BOT_ID_RE.test(botId)) {
    return NextResponse.json({ error: 'bot not found' }, { status: 404 });
  }

  let owned = false;
  try {
    // Soft-deleted bots are excluded here exactly as the worker excludes them:
    // a deleted bot must not be enqueued even if its row is still owned.
    const found = await getPool().query(
      'SELECT id FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1',
      [botId, session.accountId],
    );
    owned = found.rows.length > 0;
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: 'database not configured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'could not start scan' }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: 'bot not found' }, { status: 404 });
  }

  const guildId = typeof raw.guildId === 'string' ? raw.guildId : '';
  if (!GUILD_ID_RE.test(guildId)) {
    return NextResponse.json({ error: 'invalid guild id' }, { status: 422 });
  }

  const caps: Capability[] = [];
  if (Array.isArray(raw.capabilities)) {
    for (const entry of raw.capabilities) {
      if (typeof entry !== 'string' || !isCapability(entry)) {
        return NextResponse.json(
          { error: 'unknown capability', valid: [...VALID_CAPABILITIES] },
          { status: 422 },
        );
      }
      caps.push(entry);
    }
  }
  if (caps.length === 0) {
    return NextResponse.json(
      { error: 'unknown capability', valid: [...VALID_CAPABILITIES] },
      { status: 422 },
    );
  }

  // Caller-supplied capabilities are mapped here through the REAL mapper —
  // the worker never trusts a caller-supplied bitfield.
  const seen = new Map<string, string>();
  for (const capability of caps) {
    for (const entry of CAPABILITY_MAP[capability]) {
      if (!seen.has(entry.perm)) {
        seen.set(entry.perm, entry.why);
      }
    }
  }
  const required: PermissionWithWhy[] = [...seen].map(([perm, why]) => ({ perm, why }));
  const bitfield = capabilityBitfield(caps).toString();

  let boss: PreflightBoss;
  try {
    boss = bossFactory();
  } catch (err) {
    const error =
      err instanceof DatabaseNotConfiguredError
        ? 'database not configured'
        : 'could not start scan';
    return NextResponse.json({ error }, { status: 500 });
  }
  try {
    await boss.start();
    // pg-boss v12 does not auto-create queues on send: the write path owns
    // creation (idempotent), so the first-ever scan cannot 500 on a fresh DB.
    await boss.createQueue(PREFLIGHT_QUEUE);
    const jobId = await boss.send(
      PREFLIGHT_QUEUE,
      {
        botId,
        guildId,
        required,
        bitfield,
        intents: PREFLIGHT_INTENTS,
        expectedCommands: required.length,
      },
      {
        singletonKey: `${botId}:${guildId}`,
        retryLimit: 3,
        retryDelay: 30,
        expireInSeconds: 3600,
        deleteAfterSeconds: 604800,
      },
    );
    if (!jobId) {
      return NextResponse.json({ error: 'could not start scan' }, { status: 500 });
    }
    return NextResponse.json({ jobId }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'could not start scan' }, { status: 500 });
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the send result above stands; never mask it.
    }
  }
}
