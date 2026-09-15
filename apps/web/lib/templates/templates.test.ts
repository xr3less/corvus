import { describe, expect, it } from 'vitest';
import { buildForkName, toTemplateCard, validateSlug, type TemplateRow } from './templates';

describe('validateSlug', () => {
  it('accepts the locked template slugs', () => {
    for (const slug of ['welcome-wagon', 'mod-shield', 'coin-cellar']) {
      expect(validateSlug(slug)).toEqual({ ok: true, value: slug });
    }
  });

  it('rejects uppercase, spaces, and special characters', () => {
    expect(validateSlug('Welcome-Wagon')).toEqual({ ok: false });
    expect(validateSlug('bad slug')).toEqual({ ok: false });
    expect(validateSlug('bad/slug')).toEqual({ ok: false });
    expect(validateSlug('bad_slug')).toEqual({ ok: false });
  });

  it('rejects empty, over-long, and non-string input', () => {
    expect(validateSlug('')).toEqual({ ok: false });
    expect(validateSlug('a'.repeat(65))).toEqual({ ok: false });
    expect(validateSlug('a'.repeat(64))).toEqual({ ok: true, value: 'a'.repeat(64) });
    expect(validateSlug(undefined)).toEqual({ ok: false });
    expect(validateSlug(null)).toEqual({ ok: false });
    expect(validateSlug(42)).toEqual({ ok: false });
  });
});

describe('buildForkName', () => {
  it('defaults to the template name when no override is given', () => {
    expect(buildForkName('Welcome Wagon', undefined)).toEqual({
      ok: true,
      value: 'Welcome Wagon',
    });
  });

  it('trims a valid override', () => {
    expect(buildForkName('Welcome Wagon', '  My Bot  ')).toEqual({
      ok: true,
      value: 'My Bot',
    });
  });

  it('rejects empty, over-long, and non-string overrides', () => {
    expect(buildForkName('Welcome Wagon', '')).toEqual({
      ok: false,
      error: 'botName must not be empty',
    });
    expect(buildForkName('Welcome Wagon', 'x'.repeat(33)).ok).toBe(false);
    expect(buildForkName('Welcome Wagon', 42).ok).toBe(false);
  });
});

describe('toTemplateCard', () => {
  it('projects card columns and never leaks source_spec', () => {
    const row: TemplateRow = {
      slug: 'welcome-wagon',
      name: 'Welcome Wagon',
      category: 'welcome',
      capabilities: ['welcome'],
      perms_needed: [{ perm: 'SendMessages', why: 'so it can post welcome messages' }],
      forks: 3,
      semver: '1.0.0',
      source_spec: { version: 1, behaviors: ['greet newcomers'] },
    };
    const card = toTemplateCard(row);
    expect(card).toEqual({
      slug: 'welcome-wagon',
      name: 'Welcome Wagon',
      category: 'welcome',
      capabilities: ['welcome'],
      perms_needed: [{ perm: 'SendMessages', why: 'so it can post welcome messages' }],
      forks: 3,
      semver: '1.0.0',
    });
    expect('source_spec' in card).toBe(false);
  });
});
