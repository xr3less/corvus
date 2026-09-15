// POST /api/simulate { botId, event } — read-only draft simulator (V1-5).
//
// Runs a fake Discord event against the bot's CURRENT DRAFT and reports which
// draft entries would fire, deterministically, with quoted reasons. No Discord
// calls, no AI calls, no state writes: the only statements below are SELECT.
// Session is checked FIRST (401 before any body or database work), ownership
// failures read as 404 (never 403), and the SessionReader seam is identical
// to the interview/spec routes (injectable holder, fail-closed default).
import { parseSpec, simulateDraft, type SimEvent } from '@corvus/spec';
import { getPool, __setPool } from '../../../lib/db/pool';
import { defaultSessionReader } from '../../../lib/interview/session-bind';

export interface SimulateSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<SimulateSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars.
// The pool itself is owned by lib/db/pool; this module never constructs one
// and never reads a database URL.
export { __setPool };

// Production default is the real getSession bind (session-bind.ts);
// closedReader is the test-reset state only.
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

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIM_EVENT_KINDS = ['join', 'message', 'reaction', 'slash'] as const;

const MAX_EVENT_TEXT_CHARS = 500;
const MAX_EVENT_TAG_CHARS = 100;

function isSimEventKind(value: unknown): value is SimEvent['kind'] {
  return typeof value === 'string' && (SIM_EVENT_KINDS as readonly string[]).indexOf(value) !== -1;
}

export interface ValidSimulateBody {
  botId: string;
  event: SimEvent;
}

export type SimulateBodyValidation =
  { ok: true; value: ValidSimulateBody } | { ok: false; status: 404 | 422; error: string };

// Body shape: `{ botId, event }`. A malformed botId is 404-class (reads as
// foreign so callers cannot probe for other accounts' bots); every event
// shape problem is 422. Cheap shape checks run BEFORE any database work.
export function validateSimulateBody(body: unknown): SimulateBodyValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 422, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;

  const rawBotId: unknown = record.botId;
  if (typeof rawBotId !== 'string' || !UUID_RE.test(rawBotId)) {
    return { ok: false, status: 404, error: 'not found' };
  }

  const rawEvent: unknown = record.event;
  if (typeof rawEvent !== 'object' || rawEvent === null || Array.isArray(rawEvent)) {
    return { ok: false, status: 422, error: 'event must be an object' };
  }
  const eventRecord = rawEvent as Record<string, unknown>;

  if (!isSimEventKind(eventRecord.kind)) {
    return {
      ok: false,
      status: 422,
      error: 'event kind must be join, message, reaction, or slash',
    };
  }
  const kind = eventRecord.kind;
  const needsText = kind === 'message' || kind === 'slash';

  let text: string | undefined;
  const rawText: unknown = eventRecord.text;
  if (rawText === undefined || rawText === null) {
    if (needsText) {
      return { ok: false, status: 422, error: 'event text must be a non-empty string' };
    }
  } else if (typeof rawText !== 'string') {
    return { ok: false, status: 422, error: 'event text must be a string' };
  } else {
    const trimmed = rawText.trim();
    if (trimmed.length === 0) {
      if (needsText) {
        return { ok: false, status: 422, error: 'event text must be a non-empty string' };
      }
    } else {
      if (trimmed.length > MAX_EVENT_TEXT_CHARS) {
        return { ok: false, status: 422, error: 'event text must be at most 500 chars' };
      }
      text = trimmed;
    }
  }

  const event: SimEvent = { kind };
  if (text !== undefined) {
    event.text = text;
  }
  for (const key of ['user', 'channel'] as const) {
    const rawTag: unknown = eventRecord[key];
    if (rawTag === undefined || rawTag === null) {
      continue;
    }
    if (typeof rawTag !== 'string' || rawTag.trim().length === 0) {
      return { ok: false, status: 422, error: `event ${key} must be a non-empty string` };
    }
    if (rawTag.length > MAX_EVENT_TAG_CHARS) {
      return { ok: false, status: 422, error: `event ${key} must be at most 100 chars` };
    }
    event[key] = rawTag.trim();
  }

  return { ok: true, value: { botId: rawBotId, event } };
}

// POST /api/simulate { botId, event } ->
//   200 { version, fired } with the draft row's version and the entries the
//   fake event would fire. 401 first; malformed/foreign botId 404 (never 403);
//   invalid event 422; bot with no minted draft 404 { error: 'no draft yet' }.
//   A dangling draft pointer or an unparsable stored spec is 500 (generic) —
//   the data invariant is broken, not the caller's input. Read-only: SELECT
//   only, no transaction, no writes of any kind.
export async function POST(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(422, 'body must be JSON');
  }
  const parsed = validateSimulateBody(body);
  if (!parsed.ok) {
    return error(parsed.status, parsed.error);
  }
  const { botId, event } = parsed.value;

  const pool = getPool();
  let draftSpecId: string | null;
  try {
    const owned = await pool.query<{ draft_spec_id: string | null }>(
      'SELECT draft_spec_id FROM bots WHERE id = $1 AND account_id = $2',
      [botId, session.accountId],
    );
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
    draftSpecId = owned.rows[0].draft_spec_id;
  } catch {
    return error(500, 'could not run simulation');
  }
  if (draftSpecId === null) {
    return error(404, 'no draft yet');
  }

  try {
    const row = await pool.query<{ version: number; spec: unknown }>(
      'SELECT version, spec FROM spec_versions WHERE id = $1',
      [draftSpecId],
    );
    if (row.rowCount !== 1) {
      return error(500, 'could not run simulation');
    }
    const found = row.rows[0];
    let spec;
    try {
      spec = parseSpec(found.spec);
    } catch {
      return error(500, 'could not run simulation');
    }
    const fired = simulateDraft(spec, event);
    return Response.json({ version: found.version, fired }, { status: 200 });
  } catch {
    return error(500, 'could not run simulation');
  }
}
