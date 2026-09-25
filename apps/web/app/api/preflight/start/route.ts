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
  DEFAULT_CAPABILITIES,
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

// --- Spec-derived capabilities + manifest command count (wave E6) ---
//
// DUPLICATION NOTE (orchestrator will unify): the kind→capability helper is
// canonically owned by the invite route (sibling agent's job). This file keeps
// a minimal local copy so preflight/start never imports route internals.
// Likewise the manifest count mirrors
// buildRegistry(FEATURE_MODULES).commands.size from the gateway — the web
// package must not import gateway internals (no discord.js here; same reason
// the publish route duplicates the translator contract inline), so the count
// is mirrored as data with its derivation. If a gateway module gains or loses
// a slash command, update REGISTRY_COMMAND_NAMES to match.

// Normalized spec behavior kind -> invite capability. Covers the canonical
// runtime names plus the translator's alias vocabulary (translator.ts
// KIND_ALIASES), so derivation matches what publish actually lands as rows.
// Kinds with no permission footprint (giveaway aside — see below, connector,
// status) and still-unknown kinds map to null: skipped, never thrown.
export function capabilityForKind(raw: unknown): Capability | null {
  if (typeof raw !== 'string') return null;
  switch (raw.trim().toLowerCase()) {
    case 'welcome':
    case 'greeting':
    case 'onboarding':
    case 'farewell':
    case 'direct-message':
    case 'direct_message':
    case 'dm':
      return 'welcome';
    case 'moderation':
    case 'filter':
    case 'warn':
    case 'warning':
    case 'mute':
    case 'warn-mute':
    case 'warn_mute':
    case 'timeout':
    case 'verification':
      return 'moderation';
    case 'logging':
    case 'appeal':
    case 'message-log':
    case 'message_log':
    case 'messagelog':
    case 'member-log':
    case 'member_log':
    case 'channel-log':
    case 'channel_log':
    case 'digest':
      // Translator folds the log aliases into moderation ROWS, but for
      // *permissions* they need the logging capability (ViewAuditLog, ...).
      // 'appeal' reads as moderation in the translator yet is the log-every-
      // action behavior, so it derives logging here: mod-shield's
      // {filter, timeout, appeal, verification} set then unions to exactly the
      // seed's {moderation, logging} capabilities.
      return 'logging';
    case 'tickets':
    case 'ticket':
    case 'panel':
    case 'routing':
    case 'transcript':
    case 'sla':
      return 'tickets';
    case 'leveling':
    case 'xp':
    case 'rank-up':
    case 'rank_up':
    case 'rankup':
    case 'level-up':
    case 'leaderboard':
    case 'rewards':
    case 'earn':
    case 'balance':
    case 'shop':
    case 'gamble':
    case 'economy':
      // 'economy' is a template category, not a behavior kind, but coin-cellar
      // proves economy behaviors are xp-family: map it defensively.
      return 'leveling';
    case 'reaction-roles':
    case 'reaction-role':
    case 'reaction_role':
    case 'picker':
    case 'removal':
    case 'groups':
    case 'limits':
      return 'reaction-roles';
    case 'giveaway':
    case 'giveaways':
    case 'entry':
    case 'reroll':
    case 'requirements':
      // No giveaway capability exists; the giveaway-grove seed proves these
      // bots need exactly the welcome permission set, so derive that.
      return 'welcome';
    default:
      return null;
  }
}

// Derive the capability set from a draft-spec envelope
// ({ version: 1, behaviors: [{ kind, ... }] }). Never throws: malformed
// envelopes, non-object entries, and unmappable kinds yield fewer (possibly
// zero) capabilities, never an exception. Order is VALID_CAPABILITIES order,
// not spec order, so payloads are deterministic.
export function capabilitiesFromSpec(spec: unknown): Capability[] {
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) return [];
  const behaviors = (spec as Record<string, unknown>)['behaviors'];
  if (!Array.isArray(behaviors)) return [];
  const found = new Set<Capability>();
  for (const entry of behaviors) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const cap = capabilityForKind((entry as Record<string, unknown>)['kind']);
    if (cap !== null) found.add(cap);
  }
  return VALID_CAPABILITIES.filter((cap) => found.has(cap));
}

// Slash-command names composing the gateway registry manifest
// (apps/gateway/src/runtime/feature-modules.ts FEATURE_MODULES via
// buildRegistry in registry.ts): moderation [warn, timeout], xp
// [rank, balance, leaderboard], giveaway [giveaway], connector [status
// = CONNECTOR_STATUS_COMMAND], tickets [ticket = TICKET_COMMAND_NAME],
// reaction-roles [role = ROLE_COMMAND_NAME]; welcome exposes events only.
const REGISTRY_COMMAND_NAMES: readonly string[] = [
  'warn',
  'timeout',
  'rank',
  'balance',
  'leaderboard',
  'giveaway',
  'status',
  'ticket',
  'role',
];

// The real manifest count the scanner compares the guild's live command count
// against (replaces the required.length wrong-number defect).
export const EXPECTED_COMMANDS = REGISTRY_COMMAND_NAMES.length;

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

  // Capabilities resolution: explicit caller list wins (validated, current
  // behavior preserved); when the caller omits it, derive from the bot's
  // draft spec — the least-privilege set for what the bot actually does.
  let caps: Capability[];
  if (raw.capabilities === undefined) {
    let latest: unknown;
    try {
      const specRow = await getPool().query<{ spec: unknown }>(
        // Ownership is already proven above; this read only needs the spec.
        // No account_id predicate: the caller already proved (botId,
        // account_id) ownership, so re-filtering here adds nothing.
        'SELECT spec FROM spec_versions WHERE bot_id = $1 ORDER BY version DESC LIMIT 1',
        [botId],
      );
      latest = specRow.rows[0]?.spec;
    } catch {
      // A spec-read failure must not break scanning: fall through with
      // latest undefined so the default below applies.
      latest = undefined;
    }
    caps = capabilitiesFromSpec(latest);
    if (caps.length === 0) {
      // No draft yet, empty behaviors, or nothing mappable: the honest
      // default (same set the invite route uses when no capabilities given).
      caps = [...DEFAULT_CAPABILITIES];
    }
  } else {
    const parsed: Capability[] = [];
    if (Array.isArray(raw.capabilities)) {
      for (const entry of raw.capabilities) {
        if (typeof entry !== 'string' || !isCapability(entry)) {
          return NextResponse.json(
            { error: 'unknown capability', valid: [...VALID_CAPABILITIES] },
            { status: 422 },
          );
        }
        parsed.push(entry);
      }
    }
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: 'unknown capability', valid: [...VALID_CAPABILITIES] },
        { status: 422 },
      );
    }
    caps = parsed;
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
        // Real manifest size (buildRegistry(FEATURE_MODULES).commands.size),
        // not required.length — the scanner compares this against the guild's
        // live command count.
        expectedCommands: EXPECTED_COMMANDS,
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
