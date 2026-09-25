import { NextResponse } from 'next/server';
import {
  DEFAULT_CAPABILITIES,
  VALID_CAPABILITIES,
  buildInvite,
  isCapability,
  type Capability,
} from '../../../lib/invite/permissions';
import { getPool } from '../../../lib/db/pool';

// Behavior kind → capabilities, least privilege (pure, colocated).
// Executable behavior kinds (builder-prompt contract): welcome, moderation,
// xp, giveaway, connector, status, tickets, reaction-roles. Each maps to the
// smallest capability set that lets it function; single-posting behaviors
// (giveaway, connector, status) need only post + embed, i.e. 'welcome'.
// Unknown kinds fall back to the minimal default. Never returns
// Administrator (no VALID_CAPABILITIES value is Administrator), never throws.
export function kindToCapabilities(kind: string): string[] {
  switch (kind.trim().toLowerCase()) {
    case 'welcome':
      return ['welcome'];
    case 'moderation':
      return ['moderation'];
    case 'xp':
      return ['leveling'];
    case 'giveaway':
      return ['welcome'];
    case 'connector':
      return ['welcome'];
    case 'status':
      return ['welcome'];
    case 'tickets':
      return ['tickets'];
    case 'reaction-roles':
      return ['reaction-roles'];
    default:
      return [...DEFAULT_CAPABILITIES];
  }
}

// Load the bot's draft spec behaviors and derive capabilities via
// kindToCapabilities. Any lookup failure (unknown bot, no draft, malformed
// spec, DB unavailable) falls back to the minimal default so invite
// generation never breaks and never over-grants.
async function capabilitiesForBotDraft(botId: string): Promise<Capability[]> {
  try {
    const pool = getPool();
    const row = await pool.query<{ spec: unknown }>(
      'SELECT sv.spec FROM bots b JOIN spec_versions sv ON sv.id = b.draft_spec_id WHERE b.id = $1',
      [botId],
    );
    if (row.rowCount !== 1) {
      return [...DEFAULT_CAPABILITIES];
    }
    const spec = row.rows[0].spec as { behaviors?: unknown };
    if (typeof spec !== 'object' || spec === null || !Array.isArray(spec.behaviors)) {
      return [...DEFAULT_CAPABILITIES];
    }
    const out: Capability[] = [];
    for (const entry of spec.behaviors) {
      const kind =
        typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>)['kind']
          : undefined;
      if (typeof kind !== 'string') {
        continue;
      }
      for (const cap of kindToCapabilities(kind)) {
        if (isCapability(cap) && !out.includes(cap)) {
          out.push(cap);
        }
      }
    }
    return out.length > 0 ? out : [...DEFAULT_CAPABILITIES];
  } catch {
    return [...DEFAULT_CAPABILITIES];
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  const botId = params.get('botId');
  if (botId !== null && botId.trim() !== '') {
    const capabilities = await capabilitiesForBotDraft(botId.trim());
    const botClientId = process.env.DISCORD_CLIENT_ID;
    if (!botClientId) {
      return NextResponse.json({ error: 'Invite links are not configured.' }, { status: 500 });
    }
    return NextResponse.json(buildInvite({ clientId: botClientId, capabilities }));
  }

  const raw = params.get('capabilities');

  let capabilities: Capability[];
  if (raw === null || raw.trim() === '') {
    capabilities = [...DEFAULT_CAPABILITIES];
  } else {
    const parsed = [...new Set(raw.split(',').map((part) => part.trim().toLowerCase()))].filter(
      (part) => part !== '',
    );
    const unknown = parsed.filter((part) => !isCapability(part));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown capability: ${unknown.join(', ')}`, valid: [...VALID_CAPABILITIES] },
        { status: 422 },
      );
    }
    capabilities = (parsed.length > 0 ? parsed : [...DEFAULT_CAPABILITIES]) as Capability[];
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Invite links are not configured.' }, { status: 500 });
  }

  return NextResponse.json(buildInvite({ clientId, capabilities }));
}
