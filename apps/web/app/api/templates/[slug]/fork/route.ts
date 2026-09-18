import type { Pool } from 'pg';
import { parseSpec } from '@corvus/spec';
import { getPool, mapDbError, __setPool as setSharedPool } from '../../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../../lib/interview/session-bind';
import { buildInvite, isCapability, type Capability } from '../../../../../lib/invite/permissions';
import { validateBotName } from '../../../../../lib/interview/tree';
import {
  buildForkName,
  validateSlug,
  type TemplateRow,
} from '../../../../../lib/templates/templates';

export interface ForkSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<ForkSession | null>;
}

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

// Pool lives in lib/db/pool (single shared helper, V1-2). This re-export
// keeps the historical __setPool injection name working by delegating.
export function __setPool(pool: Pool): void {
  setSharedPool(pool);
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// POST /api/templates/[slug]/fork { botName? } ->
//   200 { botId, draftSpecId, version: 1, inviteUrl }.
// One transaction: SELECT template -> INSERT bots (draft, empty token
// placeholder per V1-1 precedent) -> INSERT spec_versions v1 (source_spec
// copied verbatim, validated by the REAL parseSpec boundary) -> point
// bots.draft_spec_id -> UPDATE templates SET forks = forks + 1.
//
// HANDOFF (no new code): the 200 payload plugs directly into
// POST /api/spec/patch as { botId, baseVersion: <version>, ... }
// ("describe the diff" — the Customize-with-AI entry point).
//
// Check order is deliberate: session (401) -> malformed slug (404, pure) ->
// botName override (422, pure — validatable without touching the DB, so the
// 422 path stays testable without PG) -> unknown slug (404) -> template-data
// guards (500). A 422 therefore reveals nothing about slug existence.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { slug } = await params;
  if (!validateSlug(slug).ok) {
    // Malformed slugs are indistinguishable from unknown ones: 404, no leak.
    return error(404, 'not found');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // No body means no override: fork under the template's own name.
    body = {};
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return error(422, 'body must be a JSON object');
  }
  const override = (body as { botName?: unknown }).botName;
  if (override !== undefined) {
    const pre = validateBotName(override);
    if (!pre.ok) {
      return error(422, pre.error);
    }
  }

  const pool = getPool();
  let template: TemplateRow;
  try {
    // NOTE: `templates` has no `deleted_at` column, so no soft-delete
    // predicate is added to this read.
    const found = await pool.query<TemplateRow>(
      `SELECT slug, name, category, capabilities, perms_needed, forks, semver, source_spec
       FROM templates WHERE slug = $1`,
      [slug],
    );
    if (found.rowCount !== 1) {
      return error(404, 'not found');
    }
    template = found.rows[0];
  } catch (err) {
    // A missing DATABASE_URL is an unconfigured process, not a fork failure
    // (KI-021) — return the honest canonical shape.
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not fork');
  }

  const forkName = buildForkName(template.name, override);
  if (!forkName.ok) {
    // The seed guarantees template names fit; reaching here means bad data.
    return error(500, 'template data invalid');
  }

  const rawCaps = template.capabilities;
  const capabilities: Capability[] | null =
    Array.isArray(rawCaps) &&
    rawCaps.length > 0 &&
    rawCaps.every((c): c is Capability => typeof c === 'string' && isCapability(c))
      ? [...rawCaps]
      : null;
  if (capabilities === null) {
    return error(500, 'template data invalid');
  }

  try {
    parseSpec(template.source_spec);
  } catch {
    // Seeded data passes; this is the runtime proof of seed quality.
    return error(500, 'template data invalid');
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    // Invite-route precedent: 500 with no leakage. Checked BEFORE the
    // transaction so a missing env never mints an uninstallable bot.
    return error(500, 'Invite links are not configured.');
  }

  const diffSummary = `Forked from ${slug} v${template.semver}`.slice(0, 500);
  const author = `owner:${session.discordId}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bot = await client.query<{ id: string }>(
      `INSERT INTO bots (account_id, name, token_cipher, status)
       VALUES ($1, $2, '\\x'::bytea, 'draft')
       RETURNING id`,
      [session.accountId, forkName.value],
    );
    const botId: string = bot.rows[0].id;
    const spec = await client.query<{ id: string }>(
      `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
       VALUES ($1, 1, $2::jsonb, $3, $4, 'draft')
       RETURNING id`,
      [botId, JSON.stringify(template.source_spec), diffSummary, author],
    );
    const draftSpecId: string = spec.rows[0].id;
    await client.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
      draftSpecId,
      botId,
    ]);
    await client.query('UPDATE templates SET forks = forks + 1 WHERE slug = $1', [slug]);
    await client.query('COMMIT');
    const inviteUrl = buildInvite({ clientId, capabilities }).url;
    return Response.json({ botId, draftSpecId, version: 1, inviteUrl }, { status: 200 });
  } catch (err) {
    await client.query('ROLLBACK');
    // Same honest mapping as the pre-transaction read (KI-021).
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not fork');
  } finally {
    client.release();
  }
}
