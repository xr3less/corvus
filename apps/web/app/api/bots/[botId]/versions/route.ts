// GET /api/bots/[botId]/versions — read-only version list for one bot
// (Wave 4 compare/undo read side).
//
// Returns `{ versions: [{ id, version, createdAt, isDraft, isProd }] }`, newest first,
// reusing the immutable `spec_versions` rows plus the bot's `draft_spec_id` /
// `prod_spec_id` pointers. Never mutates: this module exports GET only — undo
// reuses the existing pointer-swap in POST /api/spec/rollback
// (rollback/route.ts:277-298 — BEGIN:277, guarded UPDATE prod_spec_id:278-282,
// stale 409:283-285, audit rollback:287-291, COMMIT:298), never a new path.
// The publish twin is publish/route.ts:514-534 (BEGIN:514, guarded UPDATE
// bots SET prod_spec_id:515-519, stale 409:520-523, audit publish:524-528,
// COMMIT:534; preflight Red blocks:494-497).
//
// Ownership: the bot must belong to the session account or the route answers
// 404 — unknown, foreign, malformed and soft-deleted ids share the exact same
// shape, so bot existence never leaks (mirrors the sibling activity route).
//
// Route-handler shape follows node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/route.md (Dynamic Route Segments):
// `params` is a Promise and must be awaited.

import { getPool, mapDbError, __setPool } from '../../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../../lib/interview/session-bind';
import { isUuid } from '../../../../../lib/editor/drafts';

export interface VersionsSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<VersionsSession | null>;
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

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// --- Types -----------------------------------------------------------------

export interface BotPointers {
  draft_spec_id: string | null;
  prod_spec_id: string | null;
}

export interface VersionRow {
  id: string;
  version: number;
  created_at: Date | string;
}

export interface VersionItem {
  id: string;
  version: number;
  createdAt: string;
  isDraft: boolean;
  isProd: boolean;
}

// Ownership probe doubles as the pointer read: one query proves the bot
// belongs to the session account (and is not soft-deleted) and returns both
// spec pointers for flagging.
export const OWNED_BOT_SQL =
  'SELECT draft_spec_id, prod_spec_id FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL';

export const VERSIONS_SQL =
  'SELECT id, version, created_at FROM spec_versions WHERE bot_id = $1 ORDER BY version DESC';

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Pure, DB-free: flags each immutable spec row against the live pointers.
// Newest-first order is the query's job; this only maps and flags.
export function toVersionItems(
  rows: readonly VersionRow[],
  draftSpecId: string | null,
  prodSpecId: string | null,
): VersionItem[] {
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    createdAt: toIso(row.created_at),
    isDraft: row.id === draftSpecId,
    isProd: row.id === prodSpecId,
  }));
}

// --- Route -----------------------------------------------------------------

export async function GET(
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

  try {
    const owned = await pool.query<BotPointers>(OWNED_BOT_SQL, [botId, session.accountId]);
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
    const { draft_spec_id, prod_spec_id } = owned.rows[0];

    const specs = await pool.query<VersionRow>(VERSIONS_SQL, [botId]);
    const versions = toVersionItems(specs.rows, draft_spec_id, prod_spec_id);
    return Response.json({ versions }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not load versions');
  }
}
