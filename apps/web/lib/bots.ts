// Shared bot data (D-118, KI-010): the dashboard pages read the caller's own
// bots from GET /api/bots, live-first. When the list cannot be read
// (401/500/network/malformed), fetchBots() returns an empty list so pages
// render an honest empty state — example rows are never passed off as the
// account's bots (KI-030). The example rows below stay exported for compat
// and tests; no page renders them as real data. The explainer sentences over
// these specs are produced live by explain().
//
// KI-033: this module also owns the trial gate shared by all three bot-mint
// entry points (POST /api/bots, POST /api/interview/start, POST
// /api/templates/[slug]/fork). The DECISION lives in mintGate() here; the
// routes only do the reads and shape the 403. The clock predicate itself is
// isTrialExpired() from ./trial — never re-derive a date comparison.

import { isUuid } from './editor/drafts';
import { isTrialExpired } from './trial';

export type BotStatus = 'online' | 'trial' | 'offline';

export interface MockBot {
  id: string;
  name: string;
  status: BotStatus;
  /* A live row carries only id/name/status from the server, so these stay
     undefined for real bots and the card omits the line instead of printing a
     fabricated 0. Mock rows keep the example counts. */
  members?: number;
  servers?: number;
}

export const STATUS_LABEL: Record<BotStatus, string> = {
  online: 'Live',
  trial: 'Trial',
  offline: 'Offline',
};

/* Offline needs the owner first, then trial, then live — stable within a group. */
export const STATUS_RANK: Record<BotStatus, number> = {
  offline: 0,
  trial: 1,
  online: 2,
};

export const MOCK_BOTS: MockBot[] = [
  { id: 'bot-1', name: 'Study Hall', status: 'online', members: 1240, servers: 3 },
  { id: 'bot-2', name: 'Draft Arena', status: 'trial', members: 86, servers: 1 },
  { id: 'bot-3', name: 'Night Market mods', status: 'offline', members: 2013, servers: 2 },
];

export const TRIAL_DEAL = 'Free 3-day trial — 1 bot, 100 AI credits.';

/* Shared KI-033 copy locks. Both strings are byte-level law from the SPEC;
   they appear in API bodies and on screen, so they live here once rather than
   being retyped (and drifting) per surface. */
export const TRIAL_EXPIRED_MESSAGE =
  'Your 3-day trial ended — your bots are paused. Nothing is deleted.';
export const TRIAL_BOT_LIMIT_MESSAGE = 'Free 3-day trial — 1 bot, 100 AI credits.';

/* --- Mint cap (KI-033) ---------------------------------------------------- */

/* The account columns the cap reads. `trial_ends_at` is the clock (null = no
   clock = NOT expired, fail-open — never compared by hand, see ./trial);
   `tier` decides whether the cap applies at all. */
export interface MintAccountRow {
  tier: string | null;
  trial_ends_at?: Date | string | null;
}

export interface MintGateResult {
  /* `tier` is carried through so callers can label a refusal without a second
     read, and so the gate stays a pure function of one row. */
  tier: string | null;
  /* Exactly one of these is set when the mint must be refused. Both are null
     when the mint may proceed. */
  expired: string | null;
  botLimit: string | null;
}

/* The paid tiers bypass BOTH gates (no cap, no clock). The tiers are not for
   sale yet, but the bypass is coded now so the gate cannot quietly become a
   wall once they are — that would be a behavior change discovered in
   production instead of here. */
const PAID_TIERS = new Set(['pro', 'studio', 'scale']);

export function isPaidTier(tier: string | null | undefined): boolean {
  return typeof tier === 'string' && PAID_TIERS.has(tier);
}

/* A tier outside the paid set is treated as trial — including the database
   default ('trial'), an unexpected value, and null/undefined (a hand-rolled
   session double that carries no tier). The gate fails CLOSED for the free
   path: an unknown tier gets the trial's limits, never a free pass. */
export function isTrialTier(tier: string | null | undefined): boolean {
  return !isPaidTier(tier);
}

/* Both mint refusals, and the whole tier decision, in one place. Order matters
   and is locked: an expired clock refuses regardless of how many bots exist
   (the account's bots are paused, so "1 bot limit" would be a confusing reason
   on a second mint), and the bot cap is only consulted for a still-running
   trial. `liveBotCount` counts live rows only (deleted_at IS NULL) — the count
   is the caller's read, the decision is this function's. */
export function mintGate(account: MintAccountRow, liveBotCount: number): MintGateResult {
  const tier = account?.tier ?? null;
  if (isPaidTier(tier)) {
    return { tier, expired: null, botLimit: null };
  }
  if (isTrialExpired(account)) {
    return { tier, expired: TRIAL_EXPIRED_MESSAGE, botLimit: null };
  }
  if (liveBotCount >= 1) {
    return { tier, expired: null, botLimit: TRIAL_BOT_LIMIT_MESSAGE };
  }
  return { tier, expired: null, botLimit: null };
}

/* Whether the bot count is worth reading at all: only a still-running trial can
   be refused BY THE CAP. A paid tier is never capped, and an expired clock is
   already refused on its own, so both skip the count read entirely. The routes
   ask this before the second SELECT — the expiry answer never depends on how
   many bots exist, so paying for the count to reach it would be work with no
   effect on the outcome. */
export function needsLiveBotCount(account: MintAccountRow | null | undefined): boolean {
  return isTrialTier(account?.tier ?? null) && !isTrialExpired(account);
}

/* The one extra read each mint path makes before writing: the account's clock
   and tier, by primary key. One row, one query — never a COUNT plus a second
   lookup for the same fact. */
export const MINT_ACCOUNT_SQL = 'SELECT tier, trial_ends_at FROM accounts WHERE id = $1';

/* Live bots owned by the account (soft-deleted rows never count). Used only
   when the tier says the cap applies. */
export const LIVE_BOT_COUNT_SQL =
  'SELECT count(*)::int AS count FROM bots WHERE account_id = $1 AND deleted_at IS NULL';

/* Route-level refusal codes. The message is the honest sentence a person
   reads; the code is what a client (or a test) branches on. */
export type MintRefusalCode = 'trial_expired' | 'trial_bot_limit';

export function mintRefusal(
  gate: MintGateResult,
): { code: MintRefusalCode; message: string } | null {
  if (gate.expired !== null) {
    return { code: 'trial_expired', message: gate.expired };
  }
  if (gate.botLimit !== null) {
    return { code: 'trial_bot_limit', message: gate.botLimit };
  }
  return null;
}

export interface ActivityItem {
  id: string;
  text: string;
  suffix: string;
  time: string;
}

/* One builder run costs about this much; a simulation bills nothing. */
export const CREDITS_PER_CHANGE = 1.1;

export function activityFor(bot: MockBot): ActivityItem[] {
  const rows: { id: string; text: string; billed: boolean; time: string }[] = [
    { id: `${bot.id}-a1`, text: `Published ${bot.name} v12`, billed: true, time: '2h ago' },
    { id: `${bot.id}-a2`, text: 'Simulated welcome flow', billed: false, time: '5h ago' },
    { id: `${bot.id}-a3`, text: `Rolled back ${bot.name} to v11`, billed: true, time: 'yesterday' },
    { id: `${bot.id}-a4`, text: `Published ${bot.name} v11`, billed: true, time: '3d ago' },
  ];
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    suffix: row.billed ? ` · ${CREDITS_PER_CHANGE} credits` : ' · no charge',
    time: row.time,
  }));
}

export const PREFLIGHT_ROWS: { id: string; tone: 'pass' | 'warn'; text: string }[] = [
  { id: 'pf-1', tone: 'pass', text: 'Token and permissions look right' },
  { id: 'pf-2', tone: 'pass', text: 'Rate limits within caps' },
  { id: 'pf-3', tone: 'warn', text: 'Welcome reply targets a hidden channel' },
];

/* Kept exported for compat only (KI-030): no page renders these as a real
   balance. Real credit balances are not wired yet. */
export const CREDITS_USED = 82;
export const CREDITS_TOTAL = 100;

export function formatCount(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? singular : plural}`;
}

/* Example draft specs, one per mock bot, shaped for the real explain() builder
   (behaviors array of { kind, title?, detail?, channel?, count? }). These are
   mock inputs only — the sentences on screen are produced live by explain(). */
const MOCK_SPECS: Record<string, { version: 1; behaviors: Record<string, unknown>[] }> = {
  'bot-1': {
    version: 1,
    behaviors: [
      {
        kind: 'welcome',
        title: 'Welcome new members',
        detail: 'Say hi when someone joins',
        channel: 'welcome',
      },
      { kind: 'xp', title: 'XP for chatting', detail: 'Award points per message', count: 15 },
      { kind: 'warn', title: 'Warn then mute', detail: 'Escalate repeat rule-breakers', times: 3 },
    ],
  },
  'bot-2': {
    version: 1,
    behaviors: [{ kind: 'greeting', title: 'Greeting', detail: 'Say hi to new members' }],
  },
  'bot-3': {
    version: 1,
    behaviors: [
      {
        kind: 'reaction-role',
        title: 'Role menu',
        detail: 'Members pick their roles',
        channel: 'pick',
      },
      { kind: 'auto-mod', title: 'Auto moderation', detail: 'Catch spam and links' },
    ],
  },
};

/* Unknown bots fall back to an empty spec, and explain() returns its one honest line. */
export function mockSpecFor(botId: string): unknown {
  return MOCK_SPECS[botId] ?? { version: 1, behaviors: [] };
}

/* One row from GET /api/bots/[id]/activity ({ items: [{ at, kind, text, credits? }] }). */
export interface LiveActivityItem {
  at: string;
  kind: string;
  text: string;
  credits?: number;
}

/* ISO timestamp from the feed, shown in a fixed UTC format so it is stable. */
export function formatActivityTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/* --- Live binding (KI-010 remainder) -------------------------------------- */

/* Stored status values are app-enforced (apps/gateway/src/db/schema.ts):
   draft|staging|live|sleeping|quarantined. The UI speaks online|trial|offline.
   An unrecognized stored value reads as offline — the conservative label,
   never a fabricated "Live". */
const LIVE_STATUS: Record<string, BotStatus> = {
  live: 'online',
  staging: 'trial',
  draft: 'trial',
  sleeping: 'offline',
  quarantined: 'offline',
};

export function mapLiveStatus(status: string): BotStatus {
  return LIVE_STATUS[status] ?? 'offline';
}

/* One row from GET /api/bots: a bare `{ id, name, status }[]`, newest first. */
export interface LiveBotRow {
  id: string;
  name: string;
  status: string;
}

export type BotSource = 'live' | 'mock';

export interface BotsSnapshot {
  bots: MockBot[];
  source: BotSource;
  isLive: boolean;
  /* The live list answered 401. Pages render an honest empty state and can
     say the session is gone rather than pass examples off as the account's
     bots. */
  unauthorized: boolean;
}

export function mockBotsSnapshot(): BotsSnapshot {
  return { bots: MOCK_BOTS, source: 'mock', isLive: false, unauthorized: false };
}

/* A live row becomes a card with no counts: the server has none to give, and
   an omitted line is honest where a 0 would not be. */
export function toDisplayBot(row: LiveBotRow): MockBot {
  return { id: row.id, name: row.name, status: mapLiveStatus(row.status) };
}

/* Trust the server for values, not shapes: entries missing id/name/status are
   dropped, never guessed. A body that is not an array is a transport problem,
   not an empty account. */
export function readLiveBotRows(payload: unknown): LiveBotRow[] | null {
  if (!Array.isArray(payload)) return null;
  const rows: LiveBotRow[] = [];
  for (const entry of payload) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.name !== 'string' ||
      typeof record.status !== 'string'
    ) {
      continue;
    }
    rows.push({ id: record.id, name: record.name, status: record.status });
  }
  return rows;
}

/* Live-first list. A 2xx with a row array is live — an empty array is a real
   answer (an honest empty state, not a fallback). 401/500/network/malformed
   body return an empty list so pages render an honest empty state (KI-030),
   flagged `isLive: false` (and `unauthorized: true` on 401). Never throws. */
export async function fetchBots(signal?: AbortSignal): Promise<BotsSnapshot> {
  try {
    const response = await fetch('/api/bots', signal === undefined ? {} : { signal });
    if (response.status === 401) {
      return { bots: [], source: 'mock', isLive: false, unauthorized: true };
    }
    if (!response.ok) {
      return { bots: [], source: 'mock', isLive: false, unauthorized: false };
    }
    const rows = readLiveBotRows(await response.json());
    if (rows === null) {
      return { bots: [], source: 'mock', isLive: false, unauthorized: false };
    }
    return { bots: rows.map(toDisplayBot), source: 'live', isLive: true, unauthorized: false };
  } catch {
    return { bots: [], source: 'mock', isLive: false, unauthorized: false };
  }
}

/* A display id is a server id only when it is a real uuid. Mock keys (bot-1…)
   are local, so any WRITE path sends null instead of them (D-112): the API
   answers an honest 404 rather than a uuid-validation 422 no user can fix.
   Reads may still show the examples. */
export function resolveBotId(id: string | null | undefined): string | null {
  return typeof id === 'string' && isUuid(id) ? id : null;
}
