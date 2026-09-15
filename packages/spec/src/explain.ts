// explain — deterministic plain-English explainer (V1-7 "what does my bot do?").
//
// What it does: turns the opaque behavior entries in a spec into short,
// non-coder sentences ("Welcomes new members in #welcome."). Purely derived
// from the spec bytes: zero I/O, no Date, no randomness, and NEVER a model
// call — the same spec always yields the same sentences, for free.
//
// Schema note: behaviors are `z.array(z.unknown())` in ./index.ts, so no field
// names are declared there. The real entry shapes the repo actually emits are
// discovered elsewhere and honored here:
//   - TemplateBehavior (apps/gateway/src/db/seed-templates.ts):
//     { kind: string; title: string; detail: string }
//   - interview entries (apps/web/lib/ai/builder-prompt.test.ts):
//     { question: string; answer: string }
// `kind` is the semantic signal; `title`/`question` are only used as a label
// for an entry that carries no recognizable kind.
//
// LIMITS (read before trusting a sentence):
// - A curated kind -> sentence table, NOT understanding. A kind it does not
//   recognize falls back to `Does "<kind>" (custom setup).`; it never guesses.
// - Optional companion fields (`channel`, `count`/`times`/`amount`/...) are read
//   defensively and only echoed when present. The explainer never invents a
//   channel name or a number that is not in the spec.
// - Non-object entries (numbers, strings, null, arrays) carry no explainable
//   behavior and are skipped. If nothing is explainable, one honest fallback
//   line is returned — this function never throws.
// - At most MAX_SENTENCES sentences are returned (20).

export const MAX_SENTENCES = 20;

// The one honest line for an empty, missing, or unparseable spec.
export const NO_BEHAVIORS_SENTENCE = 'This bot has no behaviors yet.';

// Optional companion fields read only when present. `channel` names the place;
// the count aliases cover the ways a spec may carry a threshold or amount.
const CHANNEL_KEYS = ['channel', 'channelName'] as const;
const COUNT_KEYS = ['count', 'times', 'warnings', 'amount', 'xp', 'xpPerMessage'] as const;

function behaviorsOf(spec: unknown): unknown[] {
  const candidate = (spec as { behaviors?: unknown } | null | undefined)?.behaviors;
  return Array.isArray(candidate) ? candidate : [];
}

function readChannel(entry: Record<string, unknown>): string | null {
  for (const key of CHANNEL_KEYS) {
    const value = entry[key];
    if (typeof value === 'string') {
      const name = value.trim().replace(/^#+/, '');
      if (name.length > 0) return `#${name}`;
    }
  }
  return null;
}

function readCount(entry: Record<string, unknown>): number | null {
  for (const key of COUNT_KEYS) {
    const value = entry[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function firstNonEmptyString(
  entry: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

// Curated kind -> sentence table. Returns null for an unrecognized kind so the
// caller can emit the honest custom-setup fallback instead of guessing.
function sentenceForKind(
  kind: string,
  channel: string | null,
  count: number | null,
): string | null {
  const inChannel = channel === null ? '' : ` in ${channel}`;
  const times = count === null ? '' : ` ${count} times`;
  switch (kind) {
    case 'welcome':
    case 'greeting':
      return `Welcomes new members${inChannel}.`;
    case 'onboarding':
      return `Points new members to the rules${inChannel}.`;
    case 'farewell':
      return `Says goodbye when members leave${inChannel}.`;
    case 'direct-message':
    case 'direct_message':
    case 'dm':
      return 'Sends new members a private message offering help.';
    case 'filter':
      return 'Deletes messages with banned words and warns the author.';
    case 'warn':
    case 'warning':
    case 'mute':
    case 'warn-mute':
    case 'warn_mute':
      return `Warns rule-breakers${times}, then mutes them.`;
    case 'timeout':
      return 'Times out repeat rule-breakers, then escalates the length.';
    case 'appeal':
      return 'Logs every moderation action so appeals stay reviewable.';
    case 'verification':
      return 'Holds brand-new accounts behind a short verification step.';
    case 'panel':
      return 'Lets members open a private ticket from a panel.';
    case 'routing':
      return 'Routes each ticket to the right helper role.';
    case 'transcript':
      return 'Saves a transcript when a ticket closes.';
    case 'sla':
      return 'Reminds helpers about stale tickets and closes idle ones.';
    case 'xp':
      return count === null ? 'Gives XP per message.' : `Gives ${count} XP per message.`;
    case 'rank-up':
    case 'rank_up':
    case 'rankup':
    case 'level-up':
      return 'Announces each rank-up.';
    case 'leaderboard':
      return 'Keeps a leaderboard of the most active members.';
    case 'rewards':
      return 'Gives milestone roles.';
    case 'picker':
    case 'reaction-role':
    case 'reaction_role':
    case 'reaction-roles':
    case 'reaction_roles':
      return `Hands out roles from a menu${inChannel}.`;
    case 'removal':
      return 'Removes a role when the member un-reacts.';
    case 'groups':
      return 'Lets members pick only one role from a group.';
    case 'limits':
      return 'Caps how many roles one member can hold.';
    case 'message-log':
    case 'message_log':
    case 'messagelog':
      return 'Logs edited and deleted messages.';
    case 'member-log':
    case 'member_log':
      return 'Logs joins, leaves, and role changes.';
    case 'channel-log':
    case 'channel_log':
      return 'Logs channel changes.';
    case 'digest':
      return 'Posts a daily summary for the mod team.';
    case 'giveaway':
      return 'Runs timed giveaways and draws winners.';
    case 'entry':
      return 'Counts one entry per member.';
    case 'reroll':
      return 'Redraws when a winner misses the prize.';
    case 'requirements':
      return 'Requires a minimum account age or role to enter.';
    case 'earn':
      return 'Gives coins for chatting.';
    case 'balance':
      return 'Lets members check their coin balance.';
    case 'shop':
      return 'Runs a small shop for cosmetic perks.';
    case 'gamble':
      return 'Allows small coin games with daily loss caps.';
    default:
      return null;
  }
}

function explainOne(entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    // Not a behavior object (number, string, null, array): nothing to explain.
    return null;
  }
  const record = entry as Record<string, unknown>;
  const channel = readChannel(record);
  const count = readCount(record);
  const kind = typeof record.kind === 'string' ? record.kind.trim() : '';
  if (kind.length === 0) {
    const label = firstNonEmptyString(record, ['title', 'question']);
    return label === null ? 'Does a custom setup.' : `Does "${label}" (custom setup).`;
  }
  const known = sentenceForKind(kind.toLowerCase(), channel, count);
  return known === null ? `Does "${kind}" (custom setup).` : known;
}

export function explain(spec: unknown): string[] {
  const behaviors = behaviorsOf(spec);
  if (behaviors.length === 0) return [NO_BEHAVIORS_SENTENCE];

  const sentences: string[] = [];
  for (const entry of behaviors) {
    const sentence = explainOne(entry);
    if (sentence !== null) sentences.push(sentence);
  }

  if (sentences.length === 0) return [NO_BEHAVIORS_SENTENCE];
  return sentences.slice(0, MAX_SENTENCES);
}
