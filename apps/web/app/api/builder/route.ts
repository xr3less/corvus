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
import { DatabaseNotConfiguredError, getPool } from '../../../lib/db/pool';
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

// Poll responses are an allowlist, never a passthrough. `detail` is worker-owned
// jsonb and may carry internal diagnostics (raw provider text, a `_builder`
// provenance marker, per-attempt internals). Only the fields below are public
// API; everything else is dropped by construction, so a new internal key added
// to the worker's detail can never leak through this route. A missing or
// malformed detail degrades to `{}` — the same shape the row defaulted to.
function allowlistedDetail(phase: unknown, detail: unknown): Record<string, unknown> {
  if (!isRecord(detail)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  if (phase === 'live') {
    for (const key of ['version', 'model', 'stub'] as const) {
      if (detail[key] !== undefined) {
        out[key] = detail[key];
      }
    }
    return out;
  }
  if (phase === 'failed') {
    for (const key of ['error', 'step'] as const) {
      if (detail[key] !== undefined) {
        out[key] = detail[key];
      }
    }
    // `attempts` is public only as a count; any richer attempts payload stays in.
    const attempts = detail['attempts'];
    if (typeof attempts === 'number') {
      out['attempts'] = attempts;
    }
    return out;
  }
  // Unknown phase: forward nothing rather than guessing at its internals.
  return {};
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
    // missing, soft-deleted, or foreign yields no matching row -> the same 404
    // as unknown. `b.deleted_at IS NULL` matches the worker's own filter so a
    // deleted bot's run is never readable.
    const found = await getPool().query(
      'SELECT r.id, r.phase, r.detail, b.account_id FROM builder_runs r ' +
        'JOIN bots b ON b.id = r.bot_id WHERE r.id = $1 AND b.deleted_at IS NULL LIMIT 1',
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
        detail: allowlistedDetail(row['phase'], row['detail']),
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: 'database not configured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'could not fetch run' }, { status: 500 });
  }
}
