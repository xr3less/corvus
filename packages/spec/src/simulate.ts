// simulateDraft — pure draft-event matcher (V1-5 simulator, PROTOTYPE semantics).
//
// What it does: predicts which draft behavior entries an event WOULD fire by
// keyword overlap, deterministically, with quoted reasons. Zero I/O, no Date,
// no randomness — same inputs always yield the same output.
//
// LIMITS (read before trusting a result):
// - Keyword overlap, NOT understanding. It counts shared tokens; it does not
//   parse meaning, negation, intent, or phrasing. "never welcome users" still
//   matches a "welcome" rule. Real interpretation is a V2 engine; this is a
//   preview tracer only.
// - Entry text is every string reachable within two hops of the entry
//   (the entry itself, plus one level into objects/arrays). Deeper nesting is
//   skipped, never throws. Numbers/booleans contribute their string form;
//   null/undefined/functions/symbols contribute nothing.
// - The 21-token STOPWORDS list below is a fixed English stoplist, not a
//   linguistic model. Non-English text mostly degrades to raw tokens.
// - A match means "these words overlap", not "this behavior would execute".
//   V1-2 keeps specs opaque by design; nothing here executes bots.
import type { BehaviorSpecV0 } from './index.js';

export type SimEventKind = 'join' | 'message' | 'reaction' | 'slash';

export interface SimEvent {
  kind: SimEventKind;
  text?: string;
  user?: string;
  channel?: string;
}

export interface FiredEntry {
  behaviorIndex: number;
  title: string;
  reason: string;
  score: number;
}

// Fixed English stoplist, locked by contract. (Count is 21 entries as listed;
// the SPEC calls it "20-word" — the listed words win verbatim.)
export const STOPWORDS: readonly string[] = [
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'bot',
  'that',
  'this',
  'from',
  'your',
  'you',
  'are',
  'will',
  'can',
  'not',
];

const STOPWORD_SET: ReadonlySet<string> = new Set(STOPWORDS);

const JOIN_KIND_TOKENS: readonly string[] = ['join', 'welcome', 'member'];
const SLASH_KIND_TOKENS: readonly string[] = ['slash', 'command'];

// How deep collectStrings descends below the entry itself. 2 covers the real
// shapes: a behavior object (depth 1) and arrays of behavior objects
// (depth 2). Anything deeper is skipped, never throws.
const MAX_ENTRY_DEPTH = 2;

export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length <= 2) continue;
    if (STOPWORD_SET.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function collectStrings(value: unknown, out: string[], depth: number): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    out.push(String(value));
    return;
  }
  if (value === null || value === undefined) return;
  if (depth <= 0) return;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth - 1);
    return;
  }
  if (typeof value === 'object') {
    for (const child of Object.values(value)) collectStrings(child, out, depth - 1);
    return;
  }
  // functions, symbols, and anything else: skipped, never throws.
}

function entryText(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  const parts: string[] = [];
  collectStrings(entry, parts, MAX_ENTRY_DEPTH);
  return parts.join(' ');
}

function entryTitle(entry: unknown, index: number): string {
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>;
    for (const key of ['title', 'question', 'kind'] as const) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
  }
  return `#${index}`;
}

// Extra tokens contributed by the event kind. The ONLY kind-specific code:
// join pretends the event also says join/welcome/member; slash pretends it
// also says slash/command plus the command name (first text word, run through
// the same tokenizer). message/reaction contribute nothing extra.
function kindTokens(kind: SimEventKind, text: string): string[] {
  if (kind === 'join') return [...JOIN_KIND_TOKENS];
  if (kind === 'slash') {
    const firstWord = text.trim().split(/\s+/)[0] ?? '';
    const commandName = firstWord.replace(/^\/+/, '');
    return [...SLASH_KIND_TOKENS, ...tokenize(commandName)];
  }
  return [];
}

export function simulateDraft(spec: BehaviorSpecV0, event: SimEvent): FiredEntry[] {
  const behaviors = Array.isArray((spec as { behaviors?: unknown } | null)?.behaviors)
    ? (spec as { behaviors: unknown[] }).behaviors
    : [];
  const kind = event?.kind;
  if (kind !== 'join' && kind !== 'message' && kind !== 'reaction' && kind !== 'slash') {
    return [];
  }
  const text = typeof event.text === 'string' ? event.text : '';
  const eventTokens = [...kindTokens(kind, text), ...tokenize(text)];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of eventTokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    ordered.push(token);
  }
  if (ordered.length === 0) return [];

  const fired: FiredEntry[] = [];
  for (let index = 0; index < behaviors.length; index += 1) {
    const entry = behaviors[index];
    const entryTokenSet = new Set(tokenize(entryText(entry)));
    if (entryTokenSet.size === 0) continue;
    const matched = ordered.filter((token) => entryTokenSet.has(token));
    if (matched.length === 0) continue;
    fired.push({
      behaviorIndex: index,
      title: entryTitle(entry, index),
      reason: `matched: ${matched.join(', ')}`,
      score: matched.length,
    });
  }
  fired.sort((a, b) => b.score - a.score || a.behaviorIndex - b.behaviorIndex);
  return fired;
}
