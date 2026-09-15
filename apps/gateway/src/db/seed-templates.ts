// V1-6 template gallery seed content (SPEC section 4, T-seed owned).
//
// Shape borrowed from Payload-style versioned fixtures (JSON content kept
// OUTSIDE migrations so it iterates without DDL) with Postgres-native
// idempotency (single-statement INSERT ... ON CONFLICT, EXCLUDED alias —
// atomic, safe to retry, no check-then-insert race). Unlike drizzle-seed's
// pRNG-generated fake rows, these are 8 hand-curated fixed rows keyed by
// stable `slug`: reseed converges to exactly this content every time.
//
// - `perms_needed` pairs are copied VERBATIM from CAPABILITY_MAP
//   (apps/web/lib/invite/permissions.ts) for the row's capabilities —
//   T-fork's seam test proves the subset structurally, so the copy must
//   stay exact (same perm names, same why strings).
// - `source_spec.behaviors` are opaque plain-language entries the fork
//   copies verbatim into spec_versions v1; `server_pack` is a channel/role
//   layout suggestion, not a separate system.
// - Every name is <=32 chars so it doubles as a default botName.

export interface TemplateBehavior {
  kind: string;
  title: string;
  detail: string;
}

export interface TemplateSourceSpec {
  version: 1;
  behaviors: TemplateBehavior[];
  server_pack: string;
}

export interface TemplatePerm {
  perm: string;
  why: string;
}

export interface TemplateSeed {
  slug: string;
  name: string;
  category: string;
  capabilities: string[];
  sourceSpec: TemplateSourceSpec;
  semver: string;
  permsNeeded: TemplatePerm[];
}

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    slug: 'welcome-wagon',
    name: 'Welcome Wagon',
    category: 'welcome',
    capabilities: ['welcome'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'greeting',
          title: 'Greet every newcomer',
          detail:
            'Post a friendly welcome message naming the new member within a minute of joining.',
        },
        {
          kind: 'onboarding',
          title: 'Point to the rules',
          detail: 'Link the rules and introduction channels in every welcome message.',
        },
        {
          kind: 'farewell',
          title: 'Say goodbye on leave',
          detail:
            'Post a brief farewell note when a member leaves, without naming or shaming anyone.',
        },
        {
          kind: 'direct-message',
          title: 'Offer help privately',
          detail: 'Send each newcomer a direct message offering help and naming who to contact.',
        },
      ],
      server_pack:
        'Suggested layout: #welcome channel for greetings, #rules channel linked from every message, Greeters role may edit the greeting text.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'ViewChannel', why: 'View Channels — so the bot can see where to greet' },
      { perm: 'SendMessages', why: 'Send Messages — so it can post welcome messages' },
      { perm: 'EmbedLinks', why: 'Embed Links — so welcome cards render richly' },
    ],
  },
  {
    slug: 'mod-shield',
    name: 'Mod Shield',
    category: 'moderation',
    capabilities: ['moderation', 'logging'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'filter',
          title: 'Delete banned words',
          detail:
            'Delete messages with server-banned words and warn the author privately on first offense.',
        },
        {
          kind: 'timeout',
          title: 'Time out repeat offenders',
          detail:
            'Time out members who break rules twice within ten minutes, escalating the duration.',
        },
        {
          kind: 'appeal',
          title: 'Log every action',
          detail:
            'Record every moderation action with reason and moderator so appeals stay reviewable.',
        },
        {
          kind: 'verification',
          title: 'Gate new accounts',
          detail:
            'Hold very new accounts behind a short verification step before they can post links.',
        },
      ],
      server_pack:
        'Suggested layout: #mod-log channel for action records, Moderator role owning timeouts, verification gate for brand-new accounts.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'ModerateMembers', why: 'Timeout Members — so the bot can time members out' },
      { perm: 'ManageMessages', why: 'Manage Messages — so it can delete rule-breaking messages' },
      { perm: 'ViewAuditLog', why: 'View Audit Log — so it can report who changed what' },
    ],
  },
  {
    slug: 'ticket-desk',
    name: 'Ticket Desk',
    category: 'tickets',
    capabilities: ['tickets'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'panel',
          title: 'Open tickets from a panel',
          detail:
            'Post a support panel with a button so members open a private ticket with one click.',
        },
        {
          kind: 'routing',
          title: 'Route by topic',
          detail:
            'Ask the opener to pick a topic and tag the right helper role for it automatically.',
        },
        {
          kind: 'transcript',
          title: 'Save transcripts on close',
          detail:
            'Save a plain-text transcript and post it to the archive channel when a ticket closes.',
        },
        {
          kind: 'sla',
          title: 'Nudge stale tickets',
          detail:
            'Remind helpers about tickets idle over a day and auto-close ones idle for a week.',
        },
      ],
      server_pack:
        'Suggested layout: #support panel channel, ticket category with private per-user channels, #ticket-archive for transcripts, Helper role.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'ManageChannels', why: 'Manage Channels — so it can create private ticket channels' },
      { perm: 'SendMessages', why: 'Send Messages — so it can reply inside tickets' },
      { perm: 'ManageThreads', why: 'Manage Threads — so it can open and archive ticket threads' },
    ],
  },
  {
    slug: 'level-lounge',
    name: 'Level Lounge',
    category: 'leveling',
    capabilities: ['leveling'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'xp',
          title: 'Award XP for chat',
          detail:
            'Award experience for regular chat with a short cooldown so spam never farms levels.',
        },
        {
          kind: 'rank-up',
          title: 'Announce rank-ups',
          detail: 'Celebrate each level-up publicly with the member name and newly unlocked perks.',
        },
        {
          kind: 'leaderboard',
          title: 'Keep a leaderboard',
          detail: 'Maintain a weekly leaderboard of the most active members and their levels.',
        },
        {
          kind: 'rewards',
          title: 'Grant rank roles',
          detail:
            'Assign a cosmetic role at milestone levels and remove it if the member falls behind.',
        },
      ],
      server_pack:
        'Suggested layout: #rank-ups channel for announcements, #leaderboard channel, milestone roles named by level (Level 5, Level 10, ...).',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'SendMessages', why: 'Send Messages — so it can announce rank-ups' },
      {
        perm: 'ReadMessageHistory',
        why: 'Read Message History — so it can award XP for past messages',
      },
      { perm: 'EmbedLinks', why: 'Embed Links — so rank cards render richly' },
    ],
  },
  {
    slug: 'role-reactor',
    name: 'Role Reactor',
    category: 'reaction-roles',
    capabilities: ['reaction-roles'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'picker',
          title: 'Self-serve role picker',
          detail:
            'Post a role-picker message where reacting with an emoji grants the matching role.',
        },
        {
          kind: 'removal',
          title: 'Remove on un-react',
          detail: 'Remove the role when the member removes their reaction, keeping roles accurate.',
        },
        {
          kind: 'groups',
          title: 'Exclusive groups',
          detail:
            'Support exclusive groups where picking one option automatically drops the others.',
        },
        {
          kind: 'limits',
          title: 'Cap cosmetic roles',
          detail:
            'Limit how many cosmetic roles one member can hold so lists stay readable and fair.',
        },
      ],
      server_pack:
        'Suggested layout: #pick-your-roles channel with one picker message per group, color and interest roles below the bot role.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'AddReactions', why: 'Add Reactions — so it can seed role-picker emojis' },
      { perm: 'ManageRoles', why: 'Manage Roles — so it can assign roles when members react' },
      { perm: 'SendMessages', why: 'Send Messages — so it can post role-picker instructions' },
    ],
  },
  {
    slug: 'mod-log',
    name: 'Mod Log',
    category: 'logging',
    capabilities: ['logging'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'message-log',
          title: 'Log edits and deletes',
          detail:
            'Record edited and deleted messages with author, channel, and content for review.',
        },
        {
          kind: 'member-log',
          title: 'Track joins and leaves',
          detail: 'Log every join, leave, nickname change, and role change with timestamps.',
        },
        {
          kind: 'channel-log',
          title: 'Watch channel changes',
          detail:
            'Note channel creates, deletes, and permission changes so nothing shifts silently.',
        },
        {
          kind: 'digest',
          title: 'Post a daily digest',
          detail: 'Summarize the last day of logged events in one morning digest for the mod team.',
        },
      ],
      server_pack:
        'Suggested layout: #audit-log channel readable by moderators only, plus #daily-digest for the morning summary.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'ViewAuditLog', why: 'View Audit Log — so it can report who changed what' },
      {
        perm: 'ReadMessageHistory',
        why: 'Read Message History — so it can quote deleted or edited messages',
      },
      { perm: 'SendMessages', why: 'Send Messages — so it can post log entries' },
    ],
  },
  {
    slug: 'giveaway-grove',
    name: 'Giveaway Grove',
    category: 'giveaways',
    capabilities: ['welcome'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'giveaway',
          title: 'Run timed giveaways',
          detail:
            'Start giveaways with a prize, duration, and winner count, then draw fairly at the end.',
        },
        {
          kind: 'entry',
          title: 'One entry per member',
          detail:
            'Count one emoji-reaction entry per member, ignoring bots and duplicate accounts.',
        },
        {
          kind: 'reroll',
          title: 'Reroll missing winners',
          detail: 'Redraw automatically when a winner misses the prize-claim window.',
        },
        {
          kind: 'requirements',
          title: 'Gate entries fairly',
          detail: 'Optionally require a minimum account age or role before a member can enter.',
        },
      ],
      server_pack:
        'Suggested layout: #giveaways channel for active draws, #winners channel for results, Giveaway Host role allowed to start draws.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'ViewChannel', why: 'View Channels — so the bot can see where to greet' },
      { perm: 'SendMessages', why: 'Send Messages — so it can post welcome messages' },
      { perm: 'EmbedLinks', why: 'Embed Links — so welcome cards render richly' },
    ],
  },
  {
    slug: 'coin-cellar',
    name: 'Coin Cellar',
    category: 'economy',
    capabilities: ['leveling'],
    sourceSpec: {
      version: 1,
      behaviors: [
        {
          kind: 'earn',
          title: 'Earn coins by chatting',
          detail: 'Grant coins for regular chat activity with a cooldown so idle spam never earns.',
        },
        {
          kind: 'balance',
          title: 'Check balances',
          detail:
            'Let any member check their own coin balance and the richest-members list anytime.',
        },
        {
          kind: 'shop',
          title: 'Spend in a simple shop',
          detail: 'Offer a small shop where coins buy cosmetic roles and fun perks, never power.',
        },
        {
          kind: 'gamble',
          title: 'Cap risky games',
          detail:
            'Allow small coin games with strict daily loss caps so nobody loses everything at once.',
        },
      ],
      server_pack:
        'Suggested layout: #coin-balance channel for balance checks, #shop channel listing perks, Shopkeeper role managing stock.',
    },
    semver: '1.0.0',
    permsNeeded: [
      { perm: 'ViewChannel', why: 'View Channels — so the bot can watch chat activity' },
      { perm: 'SendMessages', why: 'Send Messages — so it can announce rank-ups' },
      {
        perm: 'ReadMessageHistory',
        why: 'Read Message History — so it can award XP for past messages',
      },
    ],
  },
];

// Minimal pool surface the upsert needs — structural so unit tests can hand
// in a fake; the real `pg` Pool satisfies it without an import here.
export interface SeedPool {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ inserted: boolean }> }>;
}

export interface SeedCounts {
  inserted: number;
  updated: number;
}

// One atomic statement per row: insert new slugs, refresh every content
// column on conflict. `forks` is deliberately ABSENT from the SET list —
// reseed must never reset the live fork counter. The `(xmax = 0)` RETURNING
// distinguishes a fresh insert (xmax 0) from a conflict-update so the entry
// can report inserted/updated counts.
const UPSERT_SQL = [
  'INSERT INTO templates (slug, name, category, capabilities, source_spec, semver, perms_needed)',
  'VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb)',
  'ON CONFLICT (slug) DO UPDATE SET',
  'name = EXCLUDED.name,',
  'category = EXCLUDED.category,',
  'capabilities = EXCLUDED.capabilities,',
  'source_spec = EXCLUDED.source_spec,',
  'semver = EXCLUDED.semver,',
  'perms_needed = EXCLUDED.perms_needed',
  'RETURNING (xmax = 0) AS inserted',
].join(' ');

export async function seedTemplates(pool: SeedPool): Promise<SeedCounts> {
  let inserted = 0;
  let updated = 0;
  for (const row of TEMPLATE_SEEDS) {
    const result = await pool.query(UPSERT_SQL, [
      row.slug,
      row.name,
      row.category,
      JSON.stringify(row.capabilities),
      JSON.stringify(row.sourceSpec),
      row.semver,
      JSON.stringify(row.permsNeeded),
    ]);
    const first = result.rows[0];
    if (first !== undefined && first.inserted === true) {
      inserted += 1;
    } else {
      updated += 1;
    }
  }
  return { inserted, updated };
}
