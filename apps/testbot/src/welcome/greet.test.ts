// Unit tests for the welcome feature.
// Fakes only — no network, no token, no discord.js gateway connection.

import { Events } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { guildMemberAddEvent, isRaidMode, parse, shortenText } from './greet.js';
import { commands } from './index.js';

describe('parse', () => {
  it('substitutes every placeholder', () => {
    const out = parse('Hi {member:mention} in {server} #{count}!', {
      memberMention: '<@123>',
      serverName: 'Trial Guild',
      memberCount: 42,
    });
    expect(out).toBe('Hi <@123> in Trial Guild #42!');
  });

  it('converts backslash-n sequences into real newlines', () => {
    const out = parse('line one\\nline two', {
      memberMention: '<@1>',
      serverName: 'S',
      memberCount: 1,
    });
    expect(out).toBe('line one\nline two');
  });

  it('handles placeholders and newlines together', () => {
    const out = parse('Welcome {member:mention}\\nto {server} (#{count})', {
      memberMention: '<@9>',
      serverName: 'Guild',
      memberCount: 7,
    });
    expect(out).toBe('Welcome <@9>\nto Guild (#7)');
  });
});

describe('shortenText', () => {
  it('leaves short strings untouched', () => {
    expect(shortenText('hello', 2040)).toBe('hello');
  });

  it('clamps at the limit', () => {
    const long = 'x'.repeat(3000);
    const clamped = shortenText(long, 2040);
    expect(clamped).toHaveLength(2040);
  });
});

describe('isRaidMode', () => {
  it('is false at exactly 10 joins inside the window', () => {
    const now = 1_000_000;
    const joins = Array.from({ length: 10 }, (_, i) => now - i * 1000);
    expect(isRaidMode(joins, now)).toBe(false);
  });

  it('is true at 11 joins inside the window', () => {
    const now = 2_000_000;
    const joins = Array.from({ length: 11 }, (_, i) => now - i * 1000);
    expect(isRaidMode(joins, now)).toBe(true);
  });

  it('is false when 11 joins are spread outside the window', () => {
    const now = 3_000_000;
    const joins = Array.from({ length: 11 }, (_, i) => now - i * 60_000);
    expect(isRaidMode(joins, now)).toBe(false);
  });
});

describe('module shape', () => {
  it('exports no commands and one GuildMemberAdd event (enum member)', () => {
    expect(commands).toEqual([]);
    expect(guildMemberAddEvent.name).toBe(Events.GuildMemberAdd);
  });
});
