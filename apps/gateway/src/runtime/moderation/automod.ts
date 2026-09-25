// Site-engine bridge A5: pure automod checks (content, cooldown, spam ring).
//
// No discord.js import, no I/O, no timers. Callers map a Message onto
// AutomodMessageView; timestamps are injected so tests stay hermetic.
// Shapes ported from the trial bot; testbot is never imported.

export type ContentHit = 'bad-words' | 'invite' | 'link' | 'attachment' | null;

export interface AutomodMessageView {
  authorBot: boolean;
  authorSystem: boolean;
  inGuild: boolean;
  authorHasManageMessages: boolean;
  authorId: string;
  authorRoleIds: readonly string[];
  text: string;
  hasAttachment: boolean;
}

export interface AutomodParams {
  badWords: readonly string[];
  protectedRoleIds: readonly string[];
  alertOnly: boolean;
}

export type AutomodVerdict =
  | { verdict: 'ignore'; reason: string }
  | { verdict: 'hit'; hit: ContentHit; cooldownActive: boolean }
  | { verdict: 'spam'; bulkDeleteRequested: true };

export const LINK_COOLDOWN_MS = 10_000;
export const SPAM_WINDOW_MS = 60_000;
export const SPAM_RING_CAPACITY = 10;
export const SPAM_SIMILARITY_THRESHOLD = 0.85;

const INVITE_RE = /discord(?:\.gg|(?:app)?\.com\/invite)\/\S+/i;
const LINK_RE = /https?:\/\/\S+/i;

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBadWordsRe(badWords: readonly string[]): RegExp {
  const words = badWords.map((w) => w.trim()).filter((w) => w.length > 0);
  if (words.length === 0) return /(?!)/;
  return new RegExp(`\\b(?:${words.map(escapeRegExp).join('|')})\\b`, 'i');
}

/**
 * m-35: memoized bad-words RegExp. The words list changes only when the
 * moderation config changes, but checkContent runs on every message — compile
 * once per distinct list (bounded cache) instead of once per message.
 * Cache key is the normalized (trimmed, non-empty) join; the cap keeps a
 * pathological churn of distinct lists from growing memory without bound.
 */
const BAD_WORDS_RE_CACHE = new Map<string, RegExp>();
const BAD_WORDS_RE_CACHE_MAX = 16;

export function getBadWordsRe(badWords: readonly string[]): RegExp {
  const words = badWords.map((w) => w.trim()).filter((w) => w.length > 0);
  const key = words.join('\0');
  const cached = BAD_WORDS_RE_CACHE.get(key);
  if (cached !== undefined) return cached;
  const compiled = buildBadWordsRe(badWords);
  if (BAD_WORDS_RE_CACHE.size >= BAD_WORDS_RE_CACHE_MAX) {
    const oldest = BAD_WORDS_RE_CACHE.keys().next();
    if (!oldest.done) BAD_WORDS_RE_CACHE.delete(oldest.value);
  }
  BAD_WORDS_RE_CACHE.set(key, compiled);
  return compiled;
}

function isInvite(text: string): boolean {
  const parts = text.split(/\s+/);
  for (const part of parts) {
    let decoded = part;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      decoded = part;
    }
    if (INVITE_RE.test(decoded)) return true;
  }
  return false;
}

/**
 * First-hit-wins classification: bad-words → invite → link → attachment.
 * Word boundaries keep e.g. 'class' from matching a listed 'ass'.
 */
export function checkContent(
  text: string,
  badWords: readonly string[],
  opts?: { hasAttachment?: boolean },
): ContentHit {
  if (getBadWordsRe(badWords).test(text)) return 'bad-words';
  if (isInvite(text)) return 'invite';
  if (LINK_RE.test(text)) return 'link';
  if (opts?.hasAttachment === true) return 'attachment';
  return null;
}

/**
 * In-memory per-key cooldown. Returns true while `key` is still cooling
 * down (nowMs - last < windowMs); otherwise stamps nowMs and returns false.
 * No internal clock — the caller injects nowMs.
 */
export class CooldownTracker {
  private readonly windowMs: number;
  private readonly lastByKey = new Map<string, number>();

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  check(key: string, nowMs: number): boolean {
    const last = this.lastByKey.get(key);
    if (last !== undefined && nowMs - last < this.windowMs) return true;
    this.lastByKey.set(key, nowMs);
    return false;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

/**
 * Bigram-Jaccard similarity in [0,1]. Single-token/empty texts have no
 * bigrams, so they fall back to case-insensitive exact match (1 or 0).
 */
export function bigramSimilarity(a: string, b: string): number {
  const setA = bigrams(tokenize(a));
  const setB = bigrams(tokenize(b));
  if (setA.size === 0 || setB.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  }
  let inter = 0;
  for (const g of setA) {
    if (setB.has(g)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
}

interface RingState {
  entries: { text: string; ts: number }[];
  warned: boolean;
}

/**
 * Per-user spam ring: the last `capacity` message texts inside `windowMs`.
 * push() returns true exactly once per full similar ring (warn-once); the
 * flag resets once the ring drains below capacity again.
 */
export class SpamRing {
  private readonly windowMs: number;
  private readonly capacity: number;
  private readonly threshold: number;
  private readonly rings = new Map<string, RingState>();

  constructor(
    windowMs: number = SPAM_WINDOW_MS,
    capacity: number = SPAM_RING_CAPACITY,
    threshold: number = SPAM_SIMILARITY_THRESHOLD,
  ) {
    this.windowMs = windowMs;
    this.capacity = capacity;
    this.threshold = threshold;
  }

  push(userId: string, text: string, nowMs: number): boolean {
    let ring = this.rings.get(userId);
    if (!ring) {
      ring = { entries: [], warned: false };
      this.rings.set(userId, ring);
    }
    ring.entries = ring.entries.filter((e) => nowMs - e.ts < this.windowMs);
    if (ring.entries.length < this.capacity) ring.warned = false;
    ring.entries.push({ text, ts: nowMs });
    if (ring.entries.length < this.capacity || ring.warned) return false;
    const peers = ring.entries.slice(0, -1);
    const similar = peers.some((e) => bigramSimilarity(e.text, text) >= this.threshold);
    if (!similar) return false;
    ring.warned = true;
    return true;
  }
}

export interface AutomodState {
  cooldown: CooldownTracker;
  ring: SpamRing;
}

/**
 * Full automod pipeline: never-fire guards first (each returns ignore),
 * then content, then the link/attachment cooldown, then the spam ring.
 * Content wins over spam: a content hit returns before the ring is fed.
 */
export function checkMessage(
  view: AutomodMessageView,
  params: AutomodParams,
  state: AutomodState,
  nowMs: number,
): AutomodVerdict {
  if (view.authorBot) return { verdict: 'ignore', reason: 'author-bot' };
  if (view.authorSystem) return { verdict: 'ignore', reason: 'author-system' };
  if (!view.inGuild) return { verdict: 'ignore', reason: 'dm' };
  if (view.authorHasManageMessages) return { verdict: 'ignore', reason: 'manage-messages-holder' };
  if (
    params.protectedRoleIds.includes(view.authorId) ||
    params.protectedRoleIds.some((id) => view.authorRoleIds.includes(id))
  ) {
    return { verdict: 'ignore', reason: 'protected' };
  }
  if (params.alertOnly) return { verdict: 'ignore', reason: 'alert-only' };

  const hit = checkContent(view.text, params.badWords, { hasAttachment: view.hasAttachment });
  if (hit !== null) {
    if (hit === 'link' || hit === 'attachment') {
      const active = state.cooldown.check(`link:${view.authorId}`, nowMs);
      return { verdict: 'hit', hit, cooldownActive: active };
    }
    return { verdict: 'hit', hit, cooldownActive: false };
  }

  if (state.ring.push(view.authorId, view.text, nowMs)) {
    return { verdict: 'spam', bulkDeleteRequested: true };
  }
  return { verdict: 'ignore', reason: 'clean' };
}
