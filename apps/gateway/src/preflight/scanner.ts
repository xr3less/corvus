import { PermissionFlagsBits } from 'discord.js';

export interface PreflightRow {
  tone: 'red' | 'yellow' | 'green';
  check: string;
  detail: string;
  fix?: string;
}

export interface ScanInput {
  guildId: string;
  botUserId: string;
  required: { perm: string; why: string }[];
  requiredBitfield: string;
  intents: string[];
  expectedCommands: number;
}

export interface ScanDeps {
  getRoles(): Promise<{ id: string; name: string; position: number }[]>;
  getChannels(): Promise<
    {
      id: string;
      name: string;
      type: string;
      overwrites: { roleId: string; allow: string; deny: string }[];
    }[]
  >;
  getBotMember(): Promise<{ roles: string[]; permissions: string } | null>;
  probeIntents(): Promise<{ intent: string; ok: boolean }[]>;
  getCommandCount(): Promise<number>;
}

interface RoleInfo {
  id: string;
  name: string;
  position: number;
}

// Flag VALUES only (discord.js is a declared dep of @corvus/gateway).
// Names from input are resolved against this table at runtime; an unknown
// name degrades to a Yellow row, never a throw.
const flagTable: Record<string, unknown> = PermissionFlagsBits as unknown as Record<
  string,
  unknown
>;

function flagValue(name: string): bigint | undefined {
  const value: unknown = flagTable[name];
  return typeof value === 'bigint' ? value : undefined;
}

function parseBitfield(raw: unknown): bigint | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

// The bot's top role = the highest-position role in the guild role list that
// the member actually holds. Returns undefined when the data cannot support
// that resolution (missing lists, no overlap) - callers degrade to Yellow.
function resolveTopRole(memberRoles: unknown, roles: unknown): RoleInfo | undefined {
  if (!Array.isArray(memberRoles) || !Array.isArray(roles)) return undefined;
  let top: RoleInfo | undefined;
  for (const entry of roles) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record['id'] !== 'string' || typeof record['position'] !== 'number') continue;
    if (!memberRoles.includes(record['id'])) continue;
    const position = record['position'] as number;
    if (top === undefined || position > top.position) {
      top = {
        id: record['id'] as string,
        name: typeof record['name'] === 'string' ? (record['name'] as string) : '',
        position,
      };
    }
  }
  return top;
}

function rolePositionRow(memberRoles: unknown, roles: unknown): PreflightRow {
  const check = 'role-position';
  const moveFix = 'Drag the bot role above the roles it manages, then re-run the scan.';
  if (!Array.isArray(roles) || roles.length === 0) {
    return {
      tone: 'yellow',
      check,
      detail: 'Cannot assess role position - no role data was returned.',
    };
  }
  const top = resolveTopRole(memberRoles, roles);
  if (top === undefined) {
    return {
      tone: 'yellow',
      check,
      detail: 'Cannot assess role position - my roles were not found in the role list.',
    };
  }
  const count = roles.length;
  const pos = top.position;
  if (count <= 1 || pos <= 1) {
    return {
      tone: 'red',
      check,
      detail: 'my highest role sits at the bottom - I cannot act on anyone with a higher role.',
      fix: moveFix,
    };
  }
  if (pos >= Math.ceil((3 * count) / 4)) {
    return {
      tone: 'green',
      check,
      detail:
        `My highest role is at position ${pos} of ${count} roles - ` +
        'near the top, so I can act on the roles below me.',
    };
  }
  return {
    tone: 'yellow',
    check,
    detail:
      `My highest role is at position ${pos} of ${count} roles - ` +
      'below the top quarter, so some roles outrank me.',
    fix: moveFix,
  };
}

function permissionRows(required: unknown, actualRaw: unknown): PreflightRow[] {
  const check = 'permissions';
  const reinstallFix = 'Re-run the install link, then re-run the scan.';
  if (!Array.isArray(required) || required.length === 0) {
    return [
      { tone: 'green', check, detail: 'No special permissions are required - nothing to check.' },
    ];
  }
  const actual = parseBitfield(actualRaw);
  if (actual === undefined) {
    return [
      {
        tone: 'yellow',
        check,
        detail: 'Cannot assess permissions - my permission bitfield was unreadable.',
      },
    ];
  }
  const rows: PreflightRow[] = [];
  let verified = 0;
  let missing = 0;
  for (const entry of required) {
    if (typeof entry !== 'object' || entry === null) {
      rows.push({
        tone: 'yellow',
        check,
        detail: 'Cannot assess one required permission - the entry was malformed.',
      });
      continue;
    }
    const record = entry as Record<string, unknown>;
    const perm = record['perm'];
    const why = typeof record['why'] === 'string' ? (record['why'] as string) : '';
    if (typeof perm !== 'string' || perm.length === 0) {
      rows.push({
        tone: 'yellow',
        check,
        detail: 'Cannot assess one required permission - the entry was malformed.',
      });
      continue;
    }
    const bit = flagValue(perm);
    if (bit === undefined) {
      rows.push({
        tone: 'yellow',
        check,
        detail: `unknown permission "${perm}" - cannot verify it, so it was skipped.`,
      });
      continue;
    }
    if ((actual & bit) === 0n) {
      missing += 1;
      rows.push({ tone: 'red', check, detail: why, fix: reinstallFix });
    } else {
      verified += 1;
    }
  }
  // Green only when at least one known permission verified present: a list of
  // pure unknowns must not produce a "granted" claim.
  if (missing === 0 && verified > 0) {
    rows.push({
      tone: 'green',
      check,
      detail: `All ${verified} required permissions are granted.`,
    });
  }
  return rows;
}

function channelsRows(memberRoles: unknown, roles: unknown, channels: unknown): PreflightRow[] {
  const check = 'channels';
  if (!Array.isArray(channels) || channels.length === 0) {
    return [
      {
        tone: 'yellow',
        check,
        detail: 'Cannot assess channel access - no channel data was returned.',
      },
    ];
  }
  const top = resolveTopRole(memberRoles, roles);
  if (top === undefined) {
    return [
      {
        tone: 'yellow',
        check,
        detail: 'could not resolve my role - channel overwrites cannot be checked.',
      },
    ];
  }
  const viewBit = flagValue('ViewChannel');
  const sendBit = flagValue('SendMessages');
  if (viewBit === undefined || sendBit === undefined) {
    return [
      {
        tone: 'yellow',
        check,
        detail: 'Cannot assess channel access - channel permission flags are unavailable.',
      },
    ];
  }
  const text: { name: string; denyView: boolean; denySend: boolean }[] = [];
  for (const entry of channels) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record['type'] !== 'string') continue;
    if (!(record['type'] as string).toLowerCase().includes('text')) continue;
    const name = typeof record['name'] === 'string' ? (record['name'] as string) : 'unknown';
    const overwrites: unknown[] = Array.isArray(record['overwrites'])
      ? (record['overwrites'] as unknown[])
      : [];
    let deny = 0n;
    for (const overwrite of overwrites) {
      if (typeof overwrite !== 'object' || overwrite === null) continue;
      const orecord = overwrite as Record<string, unknown>;
      if (orecord['roleId'] !== top.id) continue;
      const parsed = parseBitfield(orecord['deny']);
      if (parsed !== undefined) deny = deny | parsed;
    }
    text.push({ name, denyView: (deny & viewBit) !== 0n, denySend: (deny & sendBit) !== 0n });
  }
  if (text.length === 0) {
    return [{ tone: 'green', check, detail: 'No text channels found - nothing to check.' }];
  }
  const visible = text.filter((channel) => !channel.denyView);
  if (visible.length === 0) {
    return [
      {
        tone: 'red',
        check,
        detail:
          `I cannot see any of the ${text.length} text channels - ` +
          'my role is denied access everywhere.',
        fix: 'Allow my role to view at least one text channel, then re-run the scan.',
      },
    ];
  }
  const blocked = text.filter((channel) => channel.denyView || channel.denySend);
  if (blocked.length === 0) {
    return [
      {
        tone: 'green',
        check,
        detail: `I can read and write in all ${text.length} text channels.`,
      },
    ];
  }
  const rows: PreflightRow[] = blocked.slice(0, 5).map((channel) => ({
    tone: 'yellow' as const,
    check,
    detail: `I cannot fully operate in #${channel.name} - a channel overwrite limits my role.`,
    fix: 'Allow my role to view and send messages in this channel, then re-run the scan.',
  }));
  if (blocked.length > 5) {
    rows.push({
      tone: 'yellow',
      check,
      detail: `+${blocked.length - 5} more channels need attention.`,
    });
  }
  return rows;
}

function intentRows(expected: unknown, probes: unknown): PreflightRow[] {
  const check = 'intents';
  if (!Array.isArray(expected) || expected.length === 0) {
    return [
      { tone: 'green', check, detail: 'No privileged intents are required - nothing to check.' },
    ];
  }
  const byIntent = new Map<string, boolean>();
  if (Array.isArray(probes)) {
    for (const probe of probes) {
      if (typeof probe !== 'object' || probe === null) continue;
      const record = probe as Record<string, unknown>;
      if (typeof record['intent'] === 'string' && typeof record['ok'] === 'boolean') {
        byIntent.set(record['intent'] as string, record['ok'] as boolean);
      }
    }
  }
  const rows: PreflightRow[] = [];
  // NEVER Red here: intent toggles are OUR portal action (SPEC custody lock,
  // Prime Directive) - a missing intent is never the user's fault, so it can
  // never block them. Yellow asks for a retry; we flip the toggle ourselves.
  for (const intent of expected) {
    if (typeof intent !== 'string' || intent.length === 0) {
      rows.push({
        tone: 'yellow',
        check,
        detail: 'Cannot assess one intent - the entry was malformed.',
      });
      continue;
    }
    const ok = byIntent.get(intent);
    if (ok === true) continue;
    if (ok === undefined) {
      rows.push({
        tone: 'yellow',
        check,
        detail: `No probe result for "${intent}" - retry in a minute; nothing you need to do.`,
      });
    } else {
      rows.push({
        tone: 'yellow',
        check,
        detail: `${intent} is not enabled on our side yet - retry in a minute; nothing you need to do.`,
      });
    }
  }
  if (rows.length === 0) {
    rows.push({
      tone: 'green',
      check,
      detail: 'All required intents are enabled on our side.',
    });
  }
  return rows;
}

function commandsRow(expectedRaw: unknown, countRaw: unknown): PreflightRow {
  const check = 'commands-sync';
  // NEVER Red in v1: a mismatch is sync lag (transient, our side), not a user
  // fault - Yellow asks for a short retry instead of blocking.
  if (
    typeof expectedRaw !== 'number' ||
    typeof countRaw !== 'number' ||
    !Number.isInteger(expectedRaw) ||
    !Number.isInteger(countRaw)
  ) {
    return {
      tone: 'yellow',
      check,
      detail: 'Cannot assess command sync - the counts were unreadable.',
    };
  }
  if (countRaw !== expectedRaw) {
    return {
      tone: 'yellow',
      check,
      detail: `command sync pending - retry shortly. (expected ${expectedRaw}, found ${countRaw})`,
    };
  }
  return { tone: 'green', check, detail: `All ${expectedRaw} commands are synced.` };
}

// Rate-limit/shard posture is deliberately NOT scanned in v1: those are
// fleet-level concerns (SPEC section 4 item 7), so this scanner emits no row
// for them. The absence is intentional and documented here, not silence.
//
// NOTE: input.requiredBitfield is carried for the queue/worker envelope - the
// scan itself resolves each required perm NAME against live discord.js flag
// values, so the bitfield is intentionally unused here. scanned_at stamping is
// the CALLER's job (the worker stamps it); this function returns rows only.
export async function scanGuild(input: ScanInput, deps: ScanDeps): Promise<PreflightRow[]> {
  const rows: PreflightRow[] = [];

  const member = await deps.getBotMember();
  if (!member) {
    rows.push({
      tone: 'red',
      check: 'installed',
      detail: 'The bot is not a member of this guild.',
      fix: 'Install the bot from the dashboard, then re-run the scan.',
    });
    // Without a member the member-dependent checks cannot be assessed.
    // Degrade to Yellow (never Red, never throw): missing data is not a fault.
    rows.push({
      tone: 'yellow',
      check: 'role-position',
      detail: 'Cannot assess role position - the bot is not installed.',
    });
    rows.push({
      tone: 'yellow',
      check: 'permissions',
      detail: 'Cannot assess permissions - the bot is not installed.',
    });
    rows.push({
      tone: 'yellow',
      check: 'channels',
      detail: 'Cannot assess channel access - the bot is not installed.',
    });
  } else {
    rows.push({ tone: 'green', check: 'installed', detail: 'The bot is a member of this guild.' });
    const roles = await deps.getRoles();
    rows.push(rolePositionRow(member.roles, roles));
    for (const row of permissionRows(input.required, member.permissions)) rows.push(row);
    for (const row of channelsRows(member.roles, roles, await deps.getChannels())) rows.push(row);
  }

  for (const row of intentRows(input.intents, await deps.probeIntents())) rows.push(row);
  rows.push(commandsRow(input.expectedCommands, await deps.getCommandCount()));
  return rows;
}
