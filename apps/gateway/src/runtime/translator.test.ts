// Site-engine bridge A1: translator + row-validation tests.
//
// No Postgres, no Discord, no secrets: envelopes are inline data, the logger
// is a recording fake, and every assertion checks that token-like values never
// reach a log line.

import { describe, expect, it, vi } from 'vitest';
import { isRuntimeKind, RUNTIME_KINDS, validateRuntimeConfigRow } from './config.js';
import {
  KIND_ALIASES,
  TRANSLATOR_SKIP_EVENT,
  translateProdSpec,
  type TranslatorLogger,
} from './translator.js';

interface Recording {
  logger: TranslatorLogger;
  events: string[];
  reasons: string[];
}

function recordingLogger(): Recording {
  const events: string[] = [];
  const reasons: string[] = [];
  const logger: TranslatorLogger = {
    info: (record) => {
      events.push(record.event);
      reasons.push(record.reason ?? '');
    },
  };
  return { logger, events, reasons };
}

function silentLogger(): TranslatorLogger {
  return { info: () => undefined };
}

describe('validateRuntimeConfigRow', () => {
  it('accepts a well-formed row verbatim', () => {
    const result = validateRuntimeConfigRow({
      botId: 'bot-a',
      guildId: null,
      kind: 'welcome',
      params: { items: [] },
      specVersion: 1,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        botId: 'bot-a',
        guildId: null,
        kind: 'welcome',
        params: { items: [] },
        specVersion: 1,
      },
    });
  });

  it('accepts a guild-scoped row', () => {
    const result = validateRuntimeConfigRow({
      botId: 'bot-a',
      guildId: '123',
      kind: 'xp',
      params: {},
      specVersion: 3,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects every malformed shape with a coded reason', () => {
    const bad: unknown[] = [
      null,
      'row',
      [],
      {},
      { botId: '', guildId: null, kind: 'welcome', params: {}, specVersion: 1 },
      { botId: 'b', guildId: 42, kind: 'welcome', params: {}, specVersion: 1 },
      { botId: 'b', guildId: null, kind: 'teleport', params: {}, specVersion: 1 },
      { botId: 'b', guildId: null, kind: 'welcome', params: [], specVersion: 1 },
      { botId: 'b', guildId: null, kind: 'welcome', params: {}, specVersion: 0 },
      { botId: 'b', guildId: null, kind: 'welcome', params: {}, specVersion: 1.5 },
    ];
    for (const row of bad) {
      const result = validateRuntimeConfigRow(row);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes exactly the eight table kinds', () => {
    expect([...RUNTIME_KINDS].sort()).toEqual(
      ['connector', 'giveaway', 'moderation', 'status', 'welcome', 'xp', 'tickets', 'reaction-roles'].sort(),
    );
    for (const kind of RUNTIME_KINDS) {
      expect(isRuntimeKind(kind)).toBe(true);
    }
    expect(isRuntimeKind('teleport')).toBe(false);
    expect(isRuntimeKind(undefined)).toBe(false);
  });
});

describe('translateProdSpec', () => {
  it('maps all eight known kinds (canonical plus aliases) into eight rows', () => {
    const rows = translateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'welcome', title: 'Greet newcomers', channel: 'welcome' },
          { kind: 'greeting', title: 'Alias greeting' },
          { kind: 'filter', title: 'Delete banned words' },
          { kind: 'xp', title: 'Award XP', xpPerMessage: 1 },
          { kind: 'giveaway', title: 'Run draws' },
          { kind: 'connector', title: 'Weather poll', intervalSec: 30 },
          { kind: 'status', title: 'Status command' },
          { kind: 'panel', title: 'Ticket panel' },
          { kind: 'picker', title: 'Role picker' },
        ],
      },
      'bot-a',
      silentLogger(),
    );

    expect(rows.map((row) => row.kind).sort()).toEqual(
      ['connector', 'giveaway', 'moderation', 'status', 'welcome', 'xp', 'tickets', 'reaction-roles'].sort(),
    );
    for (const row of rows) {
      expect(row.botId).toBe('bot-a');
      expect(row.guildId).toBeNull();
      expect(row.specVersion).toBe(1);
    }
    const welcome = rows.find((row) => row.kind === 'welcome');
    // Canonical + alias merge into one row carrying the item list.
    expect(welcome?.params).toMatchObject({ count: 2 });
    expect(welcome?.params['items']).toHaveLength(2);
    // The 60s connector floor normalizes a stale 30s spec value.
    const connector = rows.find((row) => row.kind === 'connector');
    expect(connector?.params['intervalSec']).toBe(60);
  });

  it('covers every declared alias without throwing', () => {
    const behaviors = Object.keys(KIND_ALIASES).map((kind, index) => ({
      kind,
      title: `alias ${index}`,
    }));
    const rows = translateProdSpec({ version: 1, behaviors }, 'bot-a', silentLogger());
    const kinds = new Set(rows.map((row) => row.kind));
    // Aliases resolve into the seven alias-bearing kinds (status has no alias).
    expect(kinds.has('welcome')).toBe(true);
    expect(kinds.has('moderation')).toBe(true);
    expect(kinds.has('xp')).toBe(true);
    expect(kinds.has('giveaway')).toBe(true);
    expect(kinds.has('connector')).toBe(true);
    expect(kinds.has('tickets')).toBe(true);
    expect(kinds.has('reaction-roles')).toBe(true);
  });

  it('folds ticket and reaction-role aliases into their canonical kinds', () => {
    const rows = translateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'panel', title: 'Ticket panel' },
          { kind: 'routing', title: 'Ticket routing' },
          { kind: 'transcript', title: 'Ticket transcript' },
          { kind: 'sla', title: 'Ticket SLA' },
          { kind: 'ticket', title: 'Ticket canonical alias' },
          { kind: 'tickets', title: 'Tickets canonical' },
          { kind: 'picker', title: 'Role picker' },
          { kind: 'removal', title: 'Role removal' },
          { kind: 'groups', title: 'Role groups' },
          { kind: 'limits', title: 'Role limits' },
          { kind: 'reaction-role', title: 'Reaction role dash' },
          { kind: 'reaction_role', title: 'Reaction role underscore' },
          { kind: 'reaction-roles', title: 'Reaction roles canonical' },
        ],
      },
      'bot-a',
      silentLogger(),
    );
    expect(rows.map((row) => row.kind).sort()).toEqual(['reaction-roles', 'tickets']);
    const tickets = rows.find((row) => row.kind === 'tickets');
    expect(tickets?.params).toMatchObject({ count: 6 });
    const reactionRoles = rows.find((row) => row.kind === 'reaction-roles');
    expect(reactionRoles?.params).toMatchObject({ count: 7 });
  });

  it('skips unknown kinds with a translator-skip line and keeps the known rows', () => {
    const { logger, events, reasons } = recordingLogger();
    const rows = translateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'teleport', title: 'Beam me up' },
          { kind: 'xp', title: 'Award XP' },
        ],
      },
      'bot-a',
      logger,
    );

    expect(rows.map((row) => row.kind)).toEqual(['xp']);
    expect(events).toEqual([TRANSLATOR_SKIP_EVENT]);
    expect(reasons[0]).toContain('unknown-kind');
  });

  it('skips non-object entries with a translator-skip line, never a throw', () => {
    const { logger, events } = recordingLogger();
    const rows = translateProdSpec(
      { version: 1, behaviors: ['just a string', 42, null, { kind: 'status' }] },
      'bot-a',
      logger,
    );

    expect(rows.map((row) => row.kind)).toEqual(['status']);
    expect(events).toEqual([TRANSLATOR_SKIP_EVENT, TRANSLATOR_SKIP_EVENT, TRANSLATOR_SKIP_EVENT]);
  });

  it('skips token-carrying entries without echoing the value anywhere', () => {
    const secret = 's3cret-token-value-abcdef';
    const { logger, events, reasons } = recordingLogger();
    const rows = translateProdSpec(
      {
        version: 1,
        behaviors: [
          { kind: 'welcome', title: 'Poisoned', token: secret },
          { kind: 'welcome', title: 'Clean' },
        ],
      },
      'bot-a',
      logger,
    );

    expect(rows).toHaveLength(1);
    expect(events).toEqual([TRANSLATOR_SKIP_EVENT]);
    expect(JSON.stringify(reasons)).not.toContain(secret);
    expect(JSON.stringify(rows)).not.toContain(secret);
  });

  it('rejects malformed envelopes via parseSpec instead of returning partial rows', () => {
    const malformed: unknown[] = [
      null,
      'envelope',
      [],
      {},
      { version: 2, behaviors: [] },
      { version: 1, behaviors: 'nope' },
      { version: 1, behaviors: [{ kind: 'xp' }], extra: 'ignored-ok' },
    ];
    // The last entry is well-formed (unknown top-level keys are tolerated by
    // the schema); everything before it must throw.
    for (const spec of malformed.slice(0, -1)) {
      expect(() => translateProdSpec(spec, 'bot-a', silentLogger())).toThrow();
    }
    const ok = translateProdSpec(malformed[malformed.length - 1], 'bot-a', silentLogger());
    expect(ok.map((row) => row.kind)).toEqual(['xp']);
  });

  it('requires a non-empty botId', () => {
    expect(() => translateProdSpec({ version: 1, behaviors: [] }, '', silentLogger())).toThrow();
  });

  it('emits no log lines for a clean envelope when the logger records', () => {
    const info = vi.fn();
    translateProdSpec({ version: 1, behaviors: [{ kind: 'xp', title: 'Award XP' }] }, 'bot-a', {
      info,
    });
    expect(info).not.toHaveBeenCalled();
  });
});
