// Unit tests for the moderation content checks.
// Pure logic — no network, no token, no discord.js gateway connection.

import { describe, expect, it } from 'vitest';
import { TRIAL_BAD_WORDS } from '../config.js';
import { checkContent, CooldownTracker, SpamRing, truncateForLog } from './checks.js';

describe('checkContent badword', () => {
  it('a listed bad word hits', () => {
    expect(checkContent(`you are a ${TRIAL_BAD_WORDS[0]} fool`)).toBe('badword');
  });

  it('an embedded substring inside a longer word does not hit', () => {
    // 'class' contains 'ass'; 'shell' contains 'hell' — none must match,
    // and none of the listed words appear as standalone words here.
    const words = TRIAL_BAD_WORDS.map((w) => `pre${w}post`);
    expect(checkContent(`class shell ${words.join(' ')}`)).toBeNull();
  });

  it('matching is case-insensitive', () => {
    expect(checkContent(TRIAL_BAD_WORDS[1].toUpperCase())).toBe('badword');
  });
});

describe('checkContent invite', () => {
  it('discord.gg invite hits', () => {
    expect(checkContent('join discord.gg/abc')).toBe('invite');
  });

  it('discord.com/invite invite hits', () => {
    expect(checkContent('join https://discord.com/invite/xyz')).toBe('invite');
  });

  it('percent-encoded invite hits after decoding', () => {
    expect(checkContent('join discord.gg%2Fabc')).toBe('invite');
  });

  it('a part that fails decodeURIComponent is treated as-is', () => {
    expect(checkContent('lone %E0%A4%A word')).toBeNull();
  });

  it('plain "discord" word does not hit', () => {
    expect(checkContent('i love discord bots')).toBeNull();
  });
});

describe('checkContent link and attachment', () => {
  it('https URL hits', () => {
    expect(checkContent('see https://example.com')).toBe('link');
  });

  it('attachment flag with clean text hits', () => {
    expect(checkContent('hello world', { hasAttachment: true })).toBe('attachment');
  });

  it('clean text without attachment returns null', () => {
    expect(checkContent('hello world', { hasAttachment: false })).toBeNull();
    expect(checkContent('hello world')).toBeNull();
  });
});

describe('checkContent first-hit-wins', () => {
  it('badword beats link', () => {
    expect(checkContent(`${TRIAL_BAD_WORDS[2]} see https://example.com`)).toBe('badword');
  });

  it('invite beats link', () => {
    expect(checkContent('join discord.gg/abc see https://example.com')).toBe('invite');
  });

  it('link beats attachment', () => {
    expect(checkContent('see https://example.com', { hasAttachment: true })).toBe('link');
  });
});

describe('CooldownTracker', () => {
  it('first mark returns false, immediate re-mark returns true, after window returns false', () => {
    const t = new CooldownTracker(1000);
    expect(t.mark('k', 0)).toBe(false);
    expect(t.mark('k', 500)).toBe(true);
    expect(t.mark('k', 1000)).toBe(false);
  });

  it('keys are independent', () => {
    const t = new CooldownTracker(1000);
    expect(t.mark('a', 0)).toBe(false);
    expect(t.mark('b', 0)).toBe(false);
    expect(t.mark('a', 500)).toBe(true);
    expect(t.mark('b', 500)).toBe(true);
  });
});

describe('SpamRing', () => {
  it('10 rapid pushes return true on the 10th', () => {
    const r = new SpamRing();
    let last = false;
    for (let i = 0; i < 10; i += 1) {
      last = r.push('u1', `totally different message number ${i} zebra qux`, i * 100);
    }
    expect(last).toBe(true);
  });

  it('near-duplicate (>=0.85 similar) returns true', () => {
    const r = new SpamRing();
    const base = 'the quick brown fox jumps over the lazy dog near the river bank today indeed';
    expect(r.push('u2', base, 0)).toBe(false);
    expect(r.push('u2', `${base}!`, 1000)).toBe(true);
  });

  it('distinct texts return false', () => {
    const r = new SpamRing();
    expect(r.push('u3', 'apples oranges bananas grapes mango', 0)).toBe(false);
    expect(r.push('u3', 'quantum physics relativity thermodynamics optics', 1000)).toBe(false);
  });

  it('old entries are pruned (nine at t=0, one at t=61s → false)', () => {
    const r = new SpamRing();
    for (let i = 0; i < 9; i += 1) {
      r.push('u4', `unique seed text variant ${i} alpha beta`, 0);
    }
    expect(r.push('u4', 'completely different closing sentence gamma delta', 61_000)).toBe(false);
  });

  it('users are independent', () => {
    const r = new SpamRing();
    const text = 'identical repeated message for similarity check purposes here';
    r.push('u5', text, 0);
    expect(r.push('u6', text, 100)).toBe(false);
  });
});

describe('truncateForLog', () => {
  it('short text is unchanged', () => {
    expect(truncateForLog('hello')).toBe('hello');
  });

  it('long text is clamped with an ellipsis', () => {
    const out = truncateForLog('x'.repeat(200));
    expect(out).toBe(`${'x'.repeat(120)}…`);
  });

  it('custom max is honored', () => {
    expect(truncateForLog('abcdef', 3)).toBe('abc…');
  });
});
