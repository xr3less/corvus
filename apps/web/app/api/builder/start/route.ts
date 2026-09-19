// POST /api/builder/start — enqueue an async builder run (V1-7).
//
// Flow: session first (401), then body shape (422), then bot ownership (404,
// never 403, so a foreign bot is indistinguishable from a missing one). The
// route creates the `builder_runs` row (phase queued) and enqueues one pg-boss
// job on the `builder` queue carrying the job brief; the gateway's builder
// worker owns phase advancement and persists it back to the same row.
//
// Job contract v2: { runId, botId, brief }. `brief` is required (1..2000 chars)
// and is what the builder lane drafts the spec from.
//
// pg-boss client policy matches the preflight relay: one client per request,
// started and stopped in a finally — no shared boss, no leaked pools.
// createQueue-before-send is mandatory: pg-boss v12 does not auto-create the
// queue on send (L-011), so the first-ever run cannot 500 on a fresh DB.
//
// No billing hook: a builder run is free to retry; no credits are consumed
// here. The monthly allowance is enforced one layer down, in the gateway
// worker's pre-call gate (builder-runs.ts), which refuses before the first
// billable model call — this route deliberately does not duplicate it.
//
// KI-033: an expired trial account is refused with 403 before any row or job
// exists. The check is on the session's own trial clock, so it needs no
// database read and runs ahead of the body validation.

import { NextResponse } from 'next/server';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import { DatabaseNotConfiguredError, getPool, requireDatabaseUrl } from '../../../../lib/db/pool';
import {
  defaultSessionReader,
  type InterviewSession,
} from '../../../../lib/interview/session-bind';
import { isTrialExpired } from '../../../../lib/auth/session';
import { isPaidTier } from '../../../../lib/bots';

export const BUILDER_QUEUE = 'builder';

// Locked wording (KI-033 SPEC, byte-level): the same sentence the chat route and
// the dashboard banner carry, so a blocked build says what happened and what was
// not lost instead of leaving the caller with a code.
const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Injectable seams (fail-closed, test-only writers) ---

// The session this route consumes. A local extension of session-bind's
// InterviewSession (accountId + discordId) rather than an edit to that shared
// module: the KI-033 clock and tier are optional, so the real production reader
// still satisfies this type, while a reader that carries neither is simply a
// trial-path account (fail-open on the clock, fail-closed on the free path).
export interface BuilderSession extends InterviewSession {
  trialEndsAt?: Date | string | null;
  tier?: string | null;
}

export interface BuilderSessionReader {
  getSession(req: Request): Promise<BuilderSession | null>;
}

let sessionReader: BuilderSessionReader = defaultSessionReader;

export function __setSessionReader(reader: BuilderSessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = defaultSessionReader;
}

export interface BuilderBoss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
}

function defaultBossFactory(): BuilderBoss {
  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data, options) => boss.send(name, data, options),
  };
}

let bossFactory: () => BuilderBoss = defaultBossFactory;

export function __setBossFactory(factory: () => BuilderBoss): void {
  bossFactory = factory;
}

export function __resetBossFactory(): void {
  bossFactory = defaultBossFactory;
}

// --- Handler ---

interface StartInput {
  botId?: unknown;
  brief?: unknown;
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

  // KI-033: the trial clock gates the WRITE (SPEC ruling 4). This runs before
  // the body check, the ownership read, the run INSERT and the pg-boss send, so
  // an expired account leaves no trace at all — no row to poll, no queued job
  // for the worker to pick up. A paid tier bypasses the clock: the tiers are not
  // sold yet, but the bypass is coded now so the gate cannot become a wall. A
  // missing/unknown tier resolves to the trial path (never to a bypass).
  if (!isPaidTier(session.tier) && isTrialExpired({ trial_ends_at: session.trialEndsAt })) {
    return NextResponse.json(
      { error: 'trial_expired', message: TRIAL_ENDED_MESSAGE },
      { status: 403 },
    );
  }

  let raw: StartInput = {};
  try {
    raw = (await req.json()) as StartInput;
  } catch {
    raw = {};
  }

  const botId = typeof raw.botId === 'string' ? raw.botId : '';
  if (!UUID_RE.test(botId)) {
    return NextResponse.json({ error: 'invalid bot id' }, { status: 422 });
  }

  const brief = typeof raw.brief === 'string' ? raw.brief : '';
  if (brief.trim().length === 0 || brief.length > 2000) {
    return NextResponse.json({ error: 'invalid brief' }, { status: 422 });
  }

  let owned = false;
  try {
    // Soft-deleted bots are excluded here exactly as the worker excludes them
    // (builder-runs.ts SELECT_BOT_SQL): a deleted bot must not be enqueued (or
    // billed) even if its row is still owned by the caller.
    const found = await getPool().query(
      'SELECT id FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1',
      [botId, session.accountId],
    );
    owned = found.rows.length > 0;
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: 'database not configured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'could not start build' }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: 'bot not found' }, { status: 404 });
  }

  let runId: string;
  try {
    const inserted = await getPool().query<{ id: string }>(
      'INSERT INTO builder_runs (bot_id) VALUES ($1) RETURNING id',
      [botId],
    );
    const id = inserted.rows[0]?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'could not start build' }, { status: 500 });
    }
    runId = id;
  } catch {
    return NextResponse.json({ error: 'could not start build' }, { status: 500 });
  }

  let boss: BuilderBoss;
  try {
    boss = bossFactory();
  } catch (err) {
    await markEnqueueFailed(runId);
    const error =
      err instanceof DatabaseNotConfiguredError
        ? 'database not configured'
        : 'could not start build';
    return NextResponse.json({ error }, { status: 500 });
  }
  try {
    await boss.start();
    await boss.createQueue(BUILDER_QUEUE);
    const jobId = await boss.send(
      BUILDER_QUEUE,
      { runId, botId, brief },
      {
        singletonKey: runId,
        retryLimit: 3,
        retryDelay: 30,
        expireInSeconds: 3600,
        deleteAfterSeconds: 604800,
      },
    );
    if (!jobId) {
      await markEnqueueFailed(runId);
      return NextResponse.json({ error: 'could not start build' }, { status: 500 });
    }
    return NextResponse.json({ runId, phase: 'queued' }, { status: 200 });
  } catch {
    await markEnqueueFailed(runId);
    return NextResponse.json({ error: 'could not start build' }, { status: 500 });
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the outcome above stands; never mask it.
    }
  }
}

// The row exists before the job does. If enqueueing fails the row would sit
// `queued` forever, so it is flipped to `failed` — the poll route then tells
// the truth instead of leaving a ghost run. Best-effort: a failed flip must not
// replace the caller-visible 500.
async function markEnqueueFailed(runId: string): Promise<void> {
  try {
    await getPool().query(
      "UPDATE builder_runs SET phase = 'failed', detail = $2::jsonb, updated_at = now() WHERE id = $1",
      [runId, JSON.stringify({ error: 'enqueue_failed' })],
    );
  } catch {
    // Caller still receives the generic 500.
  }
}
