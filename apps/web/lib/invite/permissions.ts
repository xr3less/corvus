// Capability → Discord permission mapping, v1 (least privilege).
//
// Mapping approach borrowed from discord.js `PermissionsBitField.Flags`
// (combine named flags with BigInt OR, never raw numbers) and the
// least-privilege preset/trim pattern of OSS invite calculators such as
// discorder.tools' permissions calculator (flags Administrator as dangerous).
// Flag VALUES below mirror discord-api-types `PermissionFlagsBits` and were
// verified against the current Discord docs (developers/topics/permissions);
// discord-api-types is DECLARED as a future source of truth, not installed.

export const VALID_CAPABILITIES = [
  'welcome',
  'moderation',
  'tickets',
  'leveling',
  'reaction-roles',
  'logging',
] as const;

export type Capability = (typeof VALID_CAPABILITIES)[number];

export const DEFAULT_CAPABILITIES: Capability[] = ['welcome'];

export interface PermissionWithWhy {
  perm: string;
  why: string;
}

// Discord permission flag values (verified against current Discord docs;
// discord.js v14 exposes the same set as `PermissionsBitField.Flags`).
const FLAG: Record<string, bigint> = {
  AddReactions: 1n << 6n,
  BanMembers: 1n << 2n,
  EmbedLinks: 1n << 14n,
  KickMembers: 1n << 1n,
  ManageChannels: 1n << 4n,
  ManageMessages: 1n << 13n,
  ManageRoles: 1n << 28n,
  ManageThreads: 1n << 34n,
  ModerateMembers: 1n << 40n,
  ReadMessageHistory: 1n << 16n,
  SendMessages: 1n << 11n,
  AttachFiles: 1n << 15n,
  ViewAuditLog: 1n << 7n,
  ViewChannel: 1n << 10n,
};

// Administrator (bit 3) bypasses ALL channel permission overwrites, so a
// leaked bot token with it owns every channel. V1 never requests it — the
// assertion in buildInvite enforces this structurally, not by convention.
export const ADMINISTRATOR_BIT = 1n << 3n;

interface CapabilityEntry {
  perm: keyof typeof FLAG;
  why: string;
}

export const CAPABILITY_MAP: Record<Capability, CapabilityEntry[]> = {
  welcome: [
    { perm: 'ViewChannel', why: 'View Channels — so the bot can see where to greet' },
    { perm: 'SendMessages', why: 'Send Messages — so it can post welcome messages' },
    { perm: 'EmbedLinks', why: 'Embed Links — so welcome cards render richly' },
  ],
  moderation: [
    { perm: 'KickMembers', why: 'Kick Members — so timeouts actually remove offenders' },
    { perm: 'BanMembers', why: 'Ban Members — so repeat offenders can be banned' },
    { perm: 'ModerateMembers', why: 'Timeout Members — so the bot can time members out' },
    { perm: 'ManageMessages', why: 'Manage Messages — so it can delete rule-breaking messages' },
    {
      perm: 'ReadMessageHistory',
      why: 'Read Message History — so it can review context before acting',
    },
  ],
  tickets: [
    { perm: 'ViewChannel', why: 'View Channels — so the bot can see ticket channels' },
    { perm: 'SendMessages', why: 'Send Messages — so it can reply inside tickets' },
    {
      perm: 'ManageChannels',
      why: 'Manage Channels — so it can create private ticket channels',
    },
    {
      perm: 'ManageThreads',
      why: 'Manage Threads — so it can open and archive ticket threads',
    },
    { perm: 'EmbedLinks', why: 'Embed Links — so ticket panels render richly' },
  ],
  leveling: [
    { perm: 'ViewChannel', why: 'View Channels — so the bot can watch chat activity' },
    { perm: 'SendMessages', why: 'Send Messages — so it can announce rank-ups' },
    {
      perm: 'ReadMessageHistory',
      why: 'Read Message History — so it can award XP for past messages',
    },
    { perm: 'EmbedLinks', why: 'Embed Links — so rank cards render richly' },
    { perm: 'AttachFiles', why: 'Attach Files — so it can post rank-card images' },
  ],
  'reaction-roles': [
    { perm: 'AddReactions', why: 'Add Reactions — so it can seed role-picker emojis' },
    {
      perm: 'ManageRoles',
      why: 'Manage Roles — so it can assign roles when members react',
    },
    {
      perm: 'ReadMessageHistory',
      why: 'Read Message History — so it can see reactions on older messages',
    },
    { perm: 'ViewChannel', why: 'View Channels — so the bot can see role-picker channels' },
    { perm: 'SendMessages', why: 'Send Messages — so it can post role-picker instructions' },
  ],
  logging: [
    { perm: 'ViewAuditLog', why: 'View Audit Log — so it can report who changed what' },
    { perm: 'ViewChannel', why: 'View Channels — so the bot can watch logged channels' },
    {
      perm: 'ReadMessageHistory',
      why: 'Read Message History — so it can quote deleted or edited messages',
    },
    { perm: 'EmbedLinks', why: 'Embed Links — so log entries render richly' },
    { perm: 'SendMessages', why: 'Send Messages — so it can post log entries' },
  ],
};

export function isCapability(value: string): value is Capability {
  return (VALID_CAPABILITIES as readonly string[]).includes(value);
}

export function capabilityBitfield(capabilities: Capability[]): bigint {
  let bits = 0n;
  for (const capability of capabilities) {
    for (const entry of CAPABILITY_MAP[capability]) {
      bits |= FLAG[entry.perm];
    }
  }
  return bits;
}

export interface InviteResult {
  url: string;
  permissions: PermissionWithWhy[];
}

export function buildInvite(input: { clientId: string; capabilities: Capability[] }): InviteResult {
  const seen = new Map<string, string>();
  for (const capability of input.capabilities) {
    for (const entry of CAPABILITY_MAP[capability]) {
      if (!seen.has(entry.perm)) {
        seen.set(entry.perm, entry.why);
      }
    }
  }
  const permissions: PermissionWithWhy[] = [...seen].map(([perm, why]) => ({ perm, why }));

  const bitfield = capabilityBitfield(input.capabilities);
  // Administrator bypasses every channel overwrite: a leaked token with it
  // owns the server. Least-privilege means this bit must never be set.
  if ((bitfield & ADMINISTRATOR_BIT) !== 0n) {
    throw new Error('Refusing to build an invite that includes Administrator.');
  }

  const scope = encodeURIComponent('bot applications.commands');
  const url =
    `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(input.clientId)}` +
    `&permissions=${bitfield.toString()}&guild_id=&disable_guild_select=false&scope=${scope}`;
  return { url, permissions };
}
