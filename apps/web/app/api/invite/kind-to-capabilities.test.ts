import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPABILITIES } from '../../../lib/invite/permissions';
import { kindToCapabilities } from './route';

describe('kindToCapabilities', () => {
  it.each([
    ['welcome', ['welcome']],
    ['moderation', ['moderation']],
    ['xp', ['leveling']],
    ['giveaway', ['welcome']],
    ['connector', ['welcome']],
    ['status', ['welcome']],
    ['tickets', ['tickets']],
    ['reaction-roles', ['reaction-roles']],
  ])('maps %s without throwing', (kind, expected) => {
    expect(kindToCapabilities(kind)).toEqual(expected);
  });

  it('returns the minimal default for unknown kinds, never Administrator, never throws', () => {
    for (const kind of ['teleport', '', '   ', 'ADMINISTRATOR', 'greeting']) {
      const caps = kindToCapabilities(kind);
      expect(caps).toEqual([...DEFAULT_CAPABILITIES]);
      expect(caps).not.toContain('Administrator');
    }
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(kindToCapabilities('  XP ')).toEqual(['leveling']);
    expect(kindToCapabilities('Reaction-Roles')).toEqual(['reaction-roles']);
  });
});
