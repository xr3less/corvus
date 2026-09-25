// Unit tests for the strike ladder.
// Fakes only — no network, no token, no discord.js gateway connection.

import { describe, expect, it } from 'vitest';
import { describeAction, lookupAction } from './ladder.js';
import type { StrikeAction } from './ladder.js';

describe('lookupAction exact hits', () => {
  it('1 → 5-minute mute', () => {
    expect(lookupAction(1)).toEqual({
      strikes: 1,
      kind: 'mute',
      durationMs: 5 * 60 * 1000,
      reason: 'mute 5m',
    });
  });

  it('2 → 30-minute mute', () => {
    const a = lookupAction(2);
    expect(a?.kind).toBe('mute');
    expect(a?.durationMs).toBe(30 * 60 * 1000);
  });

  it('3 → 3-hour mute', () => {
    const a = lookupAction(3);
    expect(a?.kind).toBe('mute');
    expect(a?.durationMs).toBe(3 * 60 * 60 * 1000);
  });

  it('5 → 1-day ban', () => {
    const a = lookupAction(5);
    expect(a?.kind).toBe('ban');
    expect(a?.durationMs).toBe(24 * 60 * 60 * 1000);
  });

  it('11 → permaban (durationMs null)', () => {
    const a = lookupAction(11);
    expect(a?.kind).toBe('ban');
    expect(a?.durationMs).toBeNull();
  });
});

describe('lookupAction gap fallbacks', () => {
  it('4 → 3-hour mute (nearest rung at or below)', () => {
    const a = lookupAction(4);
    expect(a?.strikes).toBe(3);
    expect(a?.kind).toBe('mute');
    expect(a?.durationMs).toBe(3 * 60 * 60 * 1000);
  });

  it('10 → 180-day ban', () => {
    const a = lookupAction(10);
    expect(a?.strikes).toBe(9);
    expect(a?.kind).toBe('ban');
    expect(a?.durationMs).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it('12 → permaban (highest rung holds)', () => {
    const a = lookupAction(12);
    expect(a?.strikes).toBe(11);
    expect(a?.durationMs).toBeNull();
  });
});

describe('lookupAction rejects non-positive input', () => {
  it('0 → null', () => {
    expect(lookupAction(0)).toBeNull();
  });

  it('-1 → null', () => {
    expect(lookupAction(-1)).toBeNull();
  });
});

describe('describeAction', () => {
  it('describes a mute in compact form', () => {
    const a = lookupAction(2);
    expect(a).not.toBeNull();
    expect(describeAction(a as StrikeAction)).toBe('mute 30m');
  });

  it('describes a ban in compact form', () => {
    const a = lookupAction(6);
    expect(describeAction(a as StrikeAction)).toBe('ban 7d');
  });

  it('describes a permaban', () => {
    const a = lookupAction(11);
    expect(describeAction(a as StrikeAction)).toBe('permanent ban');
  });
});
