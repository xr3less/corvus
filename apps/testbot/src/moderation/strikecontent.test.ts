// Strike-only content classification tests (checkStrikeContent).
// Links and bare attachments are NOT strikes — they belong to the 10s
// cooldown path (delete + log, no strike) — so they must return null here.

import { describe, expect, it } from 'vitest';
import { TRIAL_BAD_WORDS } from '../config.js';
import { checkStrikeContent } from './checks.js';

describe('checkStrikeContent', () => {
  it('a listed bad word hits', () => {
    expect(checkStrikeContent(`you are a ${TRIAL_BAD_WORDS[0]} fool`)).toBe('badword');
  });

  it('an invite hits (badword+invite resolves badword first)', () => {
    expect(checkStrikeContent('join discord.gg/abc')).toBe('invite');
    expect(checkStrikeContent(`${TRIAL_BAD_WORDS[2]} join discord.gg/abc`)).toBe('badword');
  });

  it('a plain link returns null (cooldown path owns it)', () => {
    expect(checkStrikeContent('see https://example.com')).toBeNull();
  });

  it('clean text returns null', () => {
    expect(checkStrikeContent('hello world')).toBeNull();
  });

  it('badword plus link still strikes as badword', () => {
    expect(checkStrikeContent(`${TRIAL_BAD_WORDS[1]} see https://example.com`)).toBe('badword');
  });
});
