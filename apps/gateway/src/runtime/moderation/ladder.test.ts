// Site-engine bridge A5: ladder unit tests (pure functions, no Discord).

import { describe, expect, it } from 'vitest';
import { describePunishment, nextPunishment } from './ladder.js';

describe('nextPunishment exact rungs', () => {
  it.each([
    { strikes: 1, kind: 'mute', durationMs: 5 * 60_000, reason: 'mute 5m' },
    { strikes: 2, kind: 'mute', durationMs: 30 * 60_000, reason: 'mute 30m' },
    { strikes: 3, kind: 'mute', durationMs: 3 * 3_600_000, reason: 'mute 3h' },
    { strikes: 5, kind: 'ban', durationMs: 86_400_000, reason: 'ban 1d' },
    { strikes: 6, kind: 'ban', durationMs: 7 * 86_400_000, reason: 'ban 7d' },
    { strikes: 7, kind: 'ban', durationMs: 14 * 86_400_000, reason: 'ban 14d' },
    { strikes: 8, kind: 'ban', durationMs: 60 * 86_400_000, reason: 'ban 60d' },
    { strikes: 9, kind: 'ban', durationMs: 180 * 86_400_000, reason: 'ban 180d' },
    { strikes: 11, kind: 'ban', durationMs: null, reason: 'permanent ban' },
  ])('strike $strikes resolves exactly', (row) => {
    expect(nextPunishment(row.strikes)).toEqual({
      strikes: row.strikes,
      kind: row.kind,
      durationMs: row.durationMs,
      reason: row.reason,
    });
  });
});

describe('nextPunishment gap tolerance (downward)', () => {
  it('strike 4 resolves as the 3-strike rung', () => {
    expect(nextPunishment(4)).toEqual({
      strikes: 3,
      kind: 'mute',
      durationMs: 3 * 3_600_000,
      reason: 'mute 3h',
    });
  });

  it('strike 10 resolves as the 9-strike rung', () => {
    const p = nextPunishment(10);
    expect(p?.strikes).toBe(9);
    expect(p?.reason).toBe('ban 180d');
  });

  it.each([12, 25, 100])('strike %i resolves as permaban', (n) => {
    expect(nextPunishment(n)).toEqual({
      strikes: 11,
      kind: 'ban',
      durationMs: null,
      reason: 'permanent ban',
    });
  });
});

describe('nextPunishment invalid input', () => {
  it.each([0, -1, -100, Number.NaN])('strike %s returns null', (n) => {
    expect(nextPunishment(n)).toBeNull();
  });
});

describe('describePunishment', () => {
  it('mirrors the resolved reason', () => {
    const p = nextPunishment(2);
    expect(p).not.toBeNull();
    if (p) expect(describePunishment(p)).toBe('mute 30m');
    const perm = nextPunishment(11);
    expect(perm).not.toBeNull();
    if (perm) expect(describePunishment(perm)).toBe('permanent ban');
  });
});
