// GET /api/builder?runId= — poll one async builder run's phase (V1-7).
//
// Session-gated like the start route (fail-closed, injectable holder). Missing,
// malformed, unknown, and foreign runs all answer the same 404 shape so run ids
// stay unguessable and a foreign run never leaks. The row is the single source
// of truth for `phase`, so a missing row and a missing queue are
// indistinguishable by construction (KI-004): a run row only exists after the
// start route created it, and a failed enqueue flips that same row to `failed`.
//
// No billing hook: polling is free.

import { NextResponse } from 'next/server';
import { getPool } from '../../../lib/db/pool';
import { defaultSessionReader, type SessionReader } from '../../../lib/interview/session-bind';

const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Injectable seams (fail-closed, test-only writers) ---

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = defaultSessionReader;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

  const runId = new URL(req.url).searchParams.get('runId') ?? '';
  if (!RUN_ID_RE.test(runId)) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  try {
    // JOIN bots so ownership is checked in the same read; a run whose bot is
    // missing or foreign yields no matching row -> the same 404 as unknown.
    const found = await getPool().query(
      'SELECT r.id, r.phase, r.detail, b.account_id FROM builder_runs r ' +
        'JOIN bots b ON b.id = r.bot_id WHERE r.id = $1 LIMIT 1',
      [runId],
    );
    const row: unknown = found.rows[0];
    if (!isRecord(row) || row['account_id'] !== session.accountId) {
      return NextResponse.json({ error: 'run not found' }, { status: 404 });
    }
    return NextResponse.json(
      {
        runId: row['id'],
        phase: row['phase'],
        detail: row['detail'] ?? {},
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: 'could not fetch run' }, { status: 500 });
  }
}
