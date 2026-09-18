// GET /api/preflight?jobId= — poll a bot-eye guild scan (V1-4 T-relay).
//
// Session-gated like the start route (fail-closed, injectable holder).
// Unknown, missing, and malformed ids all answer the same 404 shape so job
// ids stay unguessable. Terminal states never leak job internals: completed
// passes the worker's persisted result object through, failed answers a
// generic error. `cancelled` has no SPEC mapping — it is fail-closed into
// the failed-generic shape (flagged in-report).
//
// Same per-request pg-boss client policy as the start route: start, use,
// stop in a finally — no shared boss, no leaked pools.

import { NextResponse } from 'next/server';
import { PgBoss } from 'pg-boss';
import type { JobWithMetadata, SendOptions } from 'pg-boss';
import { DatabaseNotConfiguredError, requireDatabaseUrl } from '../../../lib/db/pool';
import { defaultSessionReader, type SessionReader } from '../../../lib/interview/session-bind';

export const PREFLIGHT_QUEUE = 'preflight';

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Unused on the read path (queue creation belongs to the POST writer);
  // present so one test double satisfies both handlers.
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

export async function GET(req: Request): Promise<NextResponse> {
  let session = null;
  try {
    session = await sessionReader.getSession(req);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  if (!JOB_ID_RE.test(jobId)) {
    return NextResponse.json({ error: 'scan not found' }, { status: 404 });
  }

  let boss: PreflightBoss;
  try {
    boss = bossFactory();
  } catch (err) {
    const error =
      err instanceof DatabaseNotConfiguredError
        ? 'database not configured'
        : 'could not fetch scan';
    return NextResponse.json({ error }, { status: 500 });
  }
  try {
    await boss.start();
    const job = await boss.getJobById(PREFLIGHT_QUEUE, jobId);
    if (!job) {
      return NextResponse.json({ error: 'scan not found' }, { status: 404 });
    }
    if (job.state === 'created' || job.state === 'retry' || job.state === 'active') {
      return NextResponse.json({ state: job.state }, { status: 200 });
    }
    if (job.state === 'completed') {
      return NextResponse.json({ state: 'done', preflight: job.output }, { status: 200 });
    }
    return NextResponse.json({ state: 'failed', error: 'scan failed' }, { status: 200 });
  } catch (fetchError) {
    // A missing queue means no scan was ever enqueued: indistinguishable 404.
    // (pg-boss v12 throws on getJobById for never-created queues; verified live.)
    if (fetchError instanceof Error && /does not exist/i.test(fetchError.message)) {
      return NextResponse.json({ error: 'scan not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'could not fetch scan' }, { status: 500 });
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the status result above stands; never mask it.
    }
  }
}
