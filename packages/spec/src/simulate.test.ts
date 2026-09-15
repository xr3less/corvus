import { describe, expect, it } from 'vitest';
import { STOPWORDS, simulateDraft, tokenize } from './simulate.js';
import type { BehaviorSpecV0 } from './index.js';

function spec(behaviors: unknown[]): BehaviorSpecV0 {
  return { version: 1, behaviors };
}

describe('tokenize', () => {
  it('lowercases and splits on punctuation, spaces, and underscores', () => {
    expect(tokenize('Hello, World! foo_bar')).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('drops tokens of length <= 2', () => {
    expect(tokenize('a bb ccc dd e')).toEqual(['ccc']);
  });

  it('drops the locked stoplist words', () => {
    expect(tokenize('the bot will welcome you')).toEqual(['welcome']);
  });

  it('dedupes preserving first-seen order', () => {
    expect(tokenize('hello hello world hello')).toEqual(['hello', 'world']);
  });

  it('keeps numeric tokens longer than 2 chars', () => {
    expect(tokenize('code 123 ok')).toEqual(['code', '123']);
  });

  it('returns [] for empty or tokenless input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('!!! ... a an')).toEqual([]);
  });

  it('locks STOPWORDS to the contracted 21-word list', () => {
    expect([...STOPWORDS]).toEqual([
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
    ]);
  });
});

describe('join kind tokens', () => {
  it('fires on welcome with empty text', () => {
    const fired = simulateDraft(spec([{ title: 'Greeter', text: 'welcome newcomers' }]), {
      kind: 'join',
    });
    expect(fired).toEqual([
      { behaviorIndex: 0, title: 'Greeter', reason: 'matched: welcome', score: 1 },
    ]);
  });

  it('fires on join/member tokens with no text at all', () => {
    const fired = simulateDraft(spec([{ title: 'J', text: 'when a member join event fires' }]), {
      kind: 'join',
      text: '',
    });
    expect(fired).toHaveLength(1);
    expect(fired[0]?.reason).toBe('matched: join, member');
  });

  it('combines kind tokens (first) with text tokens for join events', () => {
    const fired = simulateDraft(spec([{ title: 'Greeter', text: 'welcome hello new members' }]), {
      kind: 'join',
      text: 'hello everyone',
    });
    expect(fired).toEqual([
      { behaviorIndex: 0, title: 'Greeter', reason: 'matched: welcome, hello', score: 2 },
    ]);
  });

  it('does not apply join tokens to message events', () => {
    const fired = simulateDraft(spec([{ title: 'W', text: 'welcome newcomers' }]), {
      kind: 'message',
      text: 'hello there',
    });
    expect(fired).toEqual([]);
  });

  it('message with missing text fires nothing', () => {
    const fired = simulateDraft(spec([{ title: 'W', text: 'welcome newcomers' }]), {
      kind: 'message',
    });
    expect(fired).toEqual([]);
  });

  it('reaction uses raw text only', () => {
    const fired = simulateDraft(spec([{ title: 'Ideas', text: 'great idea channel' }]), {
      kind: 'reaction',
      text: 'love this idea',
    });
    expect(fired).toEqual([
      { behaviorIndex: 0, title: 'Ideas', reason: 'matched: idea', score: 1 },
    ]);
  });

  it('reaction with no text fires nothing', () => {
    expect(
      simulateDraft(spec([{ title: 'Ideas', text: 'great idea channel' }]), {
        kind: 'reaction',
      }),
    ).toEqual([]);
  });
});

describe('slash kind tokens', () => {
  it('matches entries mentioning slash/command', () => {
    const fired = simulateDraft(spec([{ title: 'Help', text: 'use this command wisely' }]), {
      kind: 'slash',
      text: '/dance now',
    });
    expect(fired).toEqual([
      { behaviorIndex: 0, title: 'Help', reason: 'matched: command', score: 1 },
    ]);
  });

  it('matches the command name (first text word, slash stripped)', () => {
    const fired = simulateDraft(spec([{ title: 'Poll', reply: 'create a poll for the team' }]), {
      kind: 'slash',
      text: '/poll best time',
    });
    expect(fired).toEqual([{ behaviorIndex: 0, title: 'Poll', reason: 'matched: poll', score: 1 }]);
  });

  it('slash with empty text still matches slash/command entries', () => {
    const fired = simulateDraft(spec([{ title: 'C', text: 'slash commands list' }]), {
      kind: 'slash',
    });
    expect(fired).toEqual([{ behaviorIndex: 0, title: 'C', reason: 'matched: slash', score: 1 }]);
  });

  it('command name runs through the same tokenizer (short words drop)', () => {
    const fired = simulateDraft(spec([{ title: 'Go', text: 'go somewhere' }]), {
      kind: 'slash',
      text: '/go now',
    });
    expect(fired).toEqual([]);
  });
});

describe('scoring and ordering', () => {
  it('orders by score desc', () => {
    const fired = simulateDraft(
      spec([
        { title: 'Third', text: 'alpha' },
        { title: 'First', text: 'alpha beta gamma' },
        { title: 'Second', text: 'alpha beta' },
      ]),
      { kind: 'message', text: 'alpha beta gamma' },
    );
    expect(fired.map((f) => f.behaviorIndex)).toEqual([1, 2, 0]);
    expect(fired.map((f) => f.score)).toEqual([3, 2, 1]);
  });

  it('breaks score ties by index asc', () => {
    const fired = simulateDraft(
      spec([
        { title: 'Why', text: 'alpha' },
        { title: 'Ex', text: 'alpha beta' },
      ]),
      { kind: 'message', text: 'alpha' },
    );
    expect(fired.map((f) => f.behaviorIndex)).toEqual([0, 1]);
  });

  it('counts each shared token once even when the event repeats it', () => {
    const fired = simulateDraft(spec([{ title: 'H', text: 'say hello' }]), {
      kind: 'message',
      text: 'hello hello hello',
    });
    expect(fired).toEqual([{ behaviorIndex: 0, title: 'H', reason: 'matched: hello', score: 1 }]);
  });

  it('quotes matched tokens comma-space separated in event-token order', () => {
    const fired = simulateDraft(spec([{ title: 'T', text: 'gamma rules and alpha first' }]), {
      kind: 'message',
      text: 'alpha then gamma',
    });
    expect(fired[0]?.reason).toBe('matched: alpha, gamma');
    expect(fired[0]?.score).toBe(2);
  });
});

describe('titles', () => {
  it('prefers title over question over kind', () => {
    const fired = simulateDraft(
      spec([{ title: 'Tea', question: 'Queue', kind: 'Key', text: 'alpha' }]),
      { kind: 'message', text: 'alpha' },
    );
    expect(fired[0]?.title).toBe('Tea');
  });

  it('falls back to question then kind', () => {
    const fired = simulateDraft(
      spec([
        { question: 'Queue', kind: 'Key', text: 'alpha' },
        { kind: 'Key', text: 'alpha' },
      ]),
      { kind: 'message', text: 'alpha' },
    );
    expect(fired.map((f) => f.title)).toEqual(['Queue', 'Key']);
  });

  it('falls back to #<index> for strings, arrays, and titleless objects', () => {
    const fired = simulateDraft(spec(['alpha string', ['alpha', 'beta'], { text: 'alpha' }]), {
      kind: 'message',
      text: 'alpha',
    });
    expect(fired.map((f) => f.title)).toEqual(['#0', '#1', '#2']);
  });
});

describe('empty and odd shapes (never throws)', () => {
  it('returns [] for empty behaviors', () => {
    expect(simulateDraft(spec([]), { kind: 'message', text: 'hello world' })).toEqual([]);
  });

  it('returns [] when behaviors is missing instead of throwing', () => {
    const odd = { version: 1 } as unknown as BehaviorSpecV0;
    expect(simulateDraft(odd, { kind: 'message', text: 'hello world' })).toEqual([]);
  });

  it('returns [] for a null spec, null event, or unknown kind', () => {
    const good = spec([{ title: 'W', text: 'welcome' }]);
    expect(simulateDraft(null as unknown as BehaviorSpecV0, { kind: 'join' })).toEqual([]);
    expect(simulateDraft(good, null as unknown as never)).toEqual([]);
    expect(simulateDraft(good, { kind: 'dm', text: 'hello' } as unknown as never)).toEqual([]);
  });

  it('treats non-string text as missing (message fires nothing, join may still fire)', () => {
    const behaviors: unknown[] = [{ title: 'W', text: 'welcome code 123' }];
    const oddText = 123 as unknown as string;
    expect(simulateDraft(spec(behaviors), { kind: 'message', text: oddText })).toEqual([]);
    expect(simulateDraft(spec(behaviors), { kind: 'join', text: oddText })).toHaveLength(1);
  });

  it('degrades on numbers, nulls, nested objects, and missing fields', () => {
    const fired = simulateDraft(
      spec([42, null, { nested: { deep: 'welcome friends' } }, {}, { count: 123 }]),
      { kind: 'join', text: 'code 123' },
    );
    const byIndex = new Map(fired.map((f) => [f.behaviorIndex, f]));
    expect(byIndex.get(2)?.reason).toBe('matched: welcome');
    expect(byIndex.get(4)?.reason).toBe('matched: 123');
    expect(byIndex.has(0)).toBe(false);
    expect(byIndex.has(1)).toBe(false);
    expect(byIndex.has(3)).toBe(false);
  });

  it('is deterministic: two runs deep-equal', () => {
    const behaviors: unknown[] = [
      { title: 'Greeter', text: 'welcome hello new members' },
      'plain alpha string',
      { question: 'Queue', nested: { deep: 'alpha beta' } },
      42,
      null,
    ];
    const event = { kind: 'join', text: 'hello alpha world' } as const;
    expect(simulateDraft(spec(behaviors), event)).toEqual(simulateDraft(spec(behaviors), event));
  });
});
