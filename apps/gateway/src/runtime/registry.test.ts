// Site-engine bridge A3: registry unit tests (no login, no network).

import { SlashCommandBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { FEATURE_MODULES } from './feature-modules.js';
import { buildRegistry } from './registry.js';
import type { FeatureModule } from './registry.js';

function makeModule(kind: FeatureModule['kind'], names: string[]): FeatureModule {
  return {
    kind,
    commands: names.map((name) => ({
      data: new SlashCommandBuilder().setName(name).setDescription('test command'),
      execute: async (): Promise<void> => undefined,
    })),
    events: [],
  };
}

describe('resolveModuleConfig (m-33: per-guild precedence)', () => {
  it('prefers the bot-global row when no guildId is given', async () => {
    const { resolveModuleConfig } = await import('./loaders.js');
    const scoped = {
      botId: 'b',
      guildId: 'g-1',
      kind: 'welcome',
      params: {},
      specVersion: 1,
    } as const;
    const global = {
      botId: 'b',
      guildId: null,
      kind: 'welcome',
      params: {},
      specVersion: 1,
    } as const;
    expect(resolveModuleConfig([scoped, global], 'welcome')).toEqual(global);
  });

  it('prefers the matching guild row over the global when guildId is given', async () => {
    const { resolveModuleConfig } = await import('./loaders.js');
    const scoped = {
      botId: 'b',
      guildId: 'g-1',
      kind: 'welcome',
      params: { message: 'scoped' },
      specVersion: 1,
    } as const;
    const global = {
      botId: 'b',
      guildId: null,
      kind: 'welcome',
      params: {},
      specVersion: 1,
    } as const;
    expect(resolveModuleConfig([global, scoped], 'welcome', 'g-1')).toEqual(scoped);
    expect(resolveModuleConfig([global, scoped], 'welcome', 'g-other')).toEqual(global);
    expect(resolveModuleConfig([scoped], 'welcome')).toEqual(scoped);
    expect(resolveModuleConfig([], 'welcome')).toBeNull();
  });
});

describe('buildRegistry', () => {
  it('throws fail-fast on a duplicate commandName across modules', () => {
    expect(() =>
      buildRegistry([makeModule('status', ['ping']), makeModule('xp', ['ping'])]),
    ).toThrow(/duplicate commandName: ping/);
  });

  it('composes disjoint modules into one command map plus event list', () => {
    const registry = buildRegistry([makeModule('status', ['ping']), makeModule('xp', ['rank'])]);
    expect([...registry.commands.keys()].sort()).toEqual(['ping', 'rank']);
    expect(registry.events).toEqual([]);
  });

  it('deploys the wired FEATURE_MODULES command body without throwing', () => {
    // E1 appends tickets + reaction-roles: 7 modules wired. The empty-body case
    // is covered by buildRegistry([]) serializing to [].
    expect(FEATURE_MODULES).toHaveLength(7);
    const registry = buildRegistry(FEATURE_MODULES);
    const body = [...registry.commands.values()].map((command) => command.data.toJSON());
    expect(body.length).toBeGreaterThan(0);
    const empty = [...buildRegistry([]).commands.values()].map((command) => command.data.toJSON());
    expect(empty).toEqual([]);
  });
});
