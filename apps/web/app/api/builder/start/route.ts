// POST /api/builder/start — enqueue an async builder run (V1-7).
//
// Flow: session first (401), then body shape (422), then bot ownership (404,
// never 403, so a foreign bot is indistinguishable from a missing one). The
// route creates the `builder_runs` row (phase queued) and enqueues one pg-boss
// job on the `builder` queue; the gateway's builder worker owns phase
// advancement and persists it back to the same row.
//
// pg-boss client policy matches the preflight relay: one client per request,
// started and stopped in a finally — no shared boss, no leaked pools.
// createQueue-before-send is mandatory: pg-boss v12 does not auto-create the
// queue on send (L-011), so the first-ever run cannot 500 on a fresh DB.
//
// No billing hook: a builder run is free to retry; no credits are consumed
// here.

import { NextResponse } from 'next/server';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import { getPool, TEST_DATABASE_URL } from '../../../../lib/db/pool';
import { defaultSessionReader, type SessionReader } from '../../../../lib/interview/session-bind';

export const BUILDER_QUEUE = 'builder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Injectable seams (fail-closed, test-only writers) ---

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
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

function defaultBossFactory(connectionString: string): BuilderBoss {
  const boss = new PgBoss({ connectionString });
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data, options) => boss.send(name, data, options),
  };
}

let bossFactory: (connectionString: string) => BuilderBoss = defaultBossFactory;

export function __setBossFactory(factory: (connectionString: string) => BuilderBoss): void {
  bossFactory = factory;
}

export function __resetBossFactory(): void {
  bossFactory = defaultBossFactory;
}

// --- Handler ---

interface StartInput {
  botId?: unknown;
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

  const botId = typeof raw.botId === 'string' ? raw.botId : '';
  if (!UUID_RE.test(botId)) {
    return NextResponse.json({ error: 'invalid bot id' }, { status: 422 });
  }

  let owned = false;
  try {
    const found = await getPool().query(
      'SELECT id FROM bots WHERE id = $1 AND account_id = $2 LIMIT 1',
      [botId, session.accountId],
    );
    owned = found.rows.length > 0;
  } catch {
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

  const boss = bossFactory(process.env.DATABASE_URL ?? TEST_DATABASE_URL);
  try {
    await boss.start();
    await boss.createQueue(BUILDER_QUEUE);
    const jobId = await boss.send(
      BUILDER_QUEUE,
      { runId, botId },
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
