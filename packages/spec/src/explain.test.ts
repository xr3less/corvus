import { describe, expect, it } from 'vitest';
import { explain, MAX_SENTENCES, NO_BEHAVIORS_SENTENCE } from './explain.js';
import type { BehaviorSpecV0 } from './index.js';

function spec(behaviors: unknown[]): BehaviorSpecV0 {
  return { version: 1, behaviors };
}

// The 17-term forbidden list from Docs/04_design_language.md section 6.
// User-facing copy must not contain any of these.
const FORBIDDEN = [
  'oauth',
  'pkce',
  'acid',
  'postgres',
  'websocket',
  'multi-guild',
  'dispatch',
  'compilation',
  'self-healing',
  'behavior spec',
  'sandbox',
  'backend',
  'api',
  'production-grade',
  'built from first principles',
  'enterprise-grade',
  'architectural breakthroughs',
];

describe('explain — sentence register', () => {
  it('welcomes new members, naming the channel only when present', () => {
    expect(explain(spec([{ kind: 'greeting', channel: 'welcome' }]))).toEqual([
      'Welcomes new members in #welcome.',
    ]);
    expect(explain(spec([{ kind: 'welcome', channel: '#general' }]))).toEqual([
      'Welcomes new members in #general.',
    ]);
    expect(explain(spec([{ kind: 'greeting' }]))).toEqual(['Welcomes new members.']);
  });

  it('gives XP per message, using the input number when present', () => {
    expect(explain(spec([{ kind: 'xp', amount: 15 }]))).toEqual(['Gives 15 XP per message.']);
    expect(explain(spec([{ kind: 'xp', count: 3 }]))).toEqual(['Gives 3 XP per message.']);
    expect(explain(spec([{ kind: 'xp' }]))).toEqual(['Gives XP per message.']);
  });

  it('renders the warn/mute chain, using the input threshold when present', () => {
    expect(explain(spec([{ kind: 'warn', times: 3 }]))).toEqual([
      'Warns rule-breakers 3 times, then mutes them.',
    ]);
    expect(explain(spec([{ kind: 'mute' }]))).toEqual(['Warns rule-breakers, then mutes them.']);
  });

  it('hands out roles from a menu, naming the channel only when present', () => {
    expect(explain(spec([{ kind: 'picker', channel: 'roles' }]))).toEqual([
      'Hands out roles from a menu in #roles.',
    ]);
    expect(explain(spec([{ kind: 'reaction-role', channel: '#pick' }]))).toEqual([
      'Hands out roles from a menu in #pick.',
    ]);
    expect(explain(spec([{ kind: 'picker' }]))).toEqual(['Hands out roles from a menu.']);
  });

  it('emits one sentence per behavior, in order', () => {
    expect(
      explain(spec([{ kind: 'greeting' }, { kind: 'xp', amount: 10 }, { kind: 'leaderboard' }])),
    ).toEqual([
      'Welcomes new members.',
      'Gives 10 XP per message.',
      'Keeps a leaderboard of the most active members.',
    ]);
  });
});

describe('explain — unknown and missing kinds', () => {
  it('uses the custom-setup sentence for an unrecognized kind, echoing it verbatim', () => {
    expect(explain(spec([{ kind: 'teleport' }]))).toEqual(['Does "teleport" (custom setup).']);
  });

  it('uses a label for a kind-less object, and a bare line for an empty one', () => {
    expect(explain(spec([{ question: 'goal', answer: 'a study bot' }]))).toEqual([
      'Does "goal" (custom setup).',
    ]);
    expect(explain(spec([{ title: 'Something odd' }]))).toEqual([
      'Does "Something odd" (custom setup).',
    ]);
    expect(explain(spec([{}]))).toEqual(['Does a custom setup.']);
  });
});

describe('explain — honesty (never invents, never throws)', () => {
  it('returns the fallback for garbage input, without throwing', () => {
    for (const input of [null, undefined, 42, 'nonsense', true, [], {}, { version: 1 }]) {
      expect(() => explain(input)).not.toThrow();
      expect(explain(input)).toEqual([NO_BEHAVIORS_SENTENCE]);
    }
  });

  it('returns the fallback when behaviors is present but not an array', () => {
    expect(explain({ version: 1, behaviors: 'not-an-array' })).toEqual([NO_BEHAVIORS_SENTENCE]);
  });

  it('returns the fallback for an empty behaviors list', () => {
    expect(explain(spec([]))).toEqual([NO_BEHAVIORS_SENTENCE]);
  });

  it('does not print a channel or number that is not in the spec', () => {
    const [welcome] = explain(spec([{ kind: 'greeting' }]));
    expect(welcome).not.toContain('#');
    expect(welcome).not.toMatch(/\d/);

    const [xp] = explain(spec([{ kind: 'xp' }]));
    expect(xp).not.toMatch(/\d/);

    const [warn] = explain(spec([{ kind: 'warn' }]));
    expect(warn).not.toMatch(/\d/);

    const [roles] = explain(spec([{ kind: 'picker' }]));
    expect(roles).not.toContain('#');
  });

  it('ignores non-object entries and falls back when nothing is explainable', () => {
    expect(explain(spec([42, null, 'a string', ['nested']]))).toEqual([NO_BEHAVIORS_SENTENCE]);
    // A mix explains the object and silently drops the rest.
    expect(explain(spec([42, { kind: 'greeting' }, null]))).toEqual(['Welcomes new members.']);
  });

  it('is deterministic: two runs deep-equal', () => {
    const input = spec([
      { kind: 'greeting', channel: 'welcome' },
      { kind: 'xp', amount: 7 },
      { kind: 'warn', times: 2 },
      { kind: 'teleport' },
    ]);
    expect(explain(input)).toEqual(explain(input));
  });
});

describe('explain — caps and voice rules', () => {
  it('caps output at MAX_SENTENCES', () => {
    const many = Array.from({ length: 25 }, () => ({ kind: 'greeting' }));
    const result = explain(spec(many));
    expect(result).toHaveLength(MAX_SENTENCES);
    expect(MAX_SENTENCES).toBe(20);
    expect(result.every((line) => line === 'Welcomes new members.')).toBe(true);
  });

  it('avoids the 17-term forbidden jargon across every covered kind', () => {
    const kinds = [
      'greeting',
      'onboarding',
      'farewell',
      'direct-message',
      'filter',
      'warn',
      'timeout',
      'appeal',
      'verification',
      'panel',
      'routing',
      'transcript',
      'sla',
      'xp',
      'rank-up',
      'leaderboard',
      'rewards',
      'picker',
      'removal',
      'groups',
      'limits',
      'message-log',
      'member-log',
      'channel-log',
      'digest',
      'giveaway',
      'entry',
      'reroll',
      'requirements',
      'earn',
      'balance',
      'shop',
      'gamble',
    ];
    const lines = explain(spec(kinds.map((kind) => ({ kind }))));
    const joined = lines.join(' ').toLowerCase();
    for (const term of FORBIDDEN) {
      expect(joined).not.toContain(term);
    }
  });

  it('contains no emoji and no exclamation marks', () => {
    const lines = explain(
      spec([{ kind: 'greeting', channel: 'welcome' }, { kind: 'warn', times: 3 }, { kind: 'xp' }]),
    );
    for (const line of lines) {
      expect(line).not.toContain('!');
      expect(/\p{Extended_Pictographic}/u.test(line)).toBe(false);
    }
  });
});
