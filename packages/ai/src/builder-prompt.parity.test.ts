// Parity net for the builder prompt's executable-kind vocabulary (wave E2).
//
// The literal list below is copied verbatim from E1's final vocabulary
// (Agent Reports/2026-09-23-0915_e1_CREATE_tickets-runtime.md: config.ts
// RUNTIME_KINDS 8-tuple, growth 6->8 with 'tickets' + 'reaction-roles').
// Source of truth on disk: apps/gateway/src/runtime/config.ts (RUNTIME_KINDS).
// This file deliberately does NOT import that module — @corvus/ai must not
// depend on the gateway package, so the duplication is intentional and this
// test is the drift net. If either side changes, update both together.
//
// Break-the-guard proof (verified 2026-09-23): deleting one kind from the
// prompt's "Executable behavior kinds:" line turns this suite red.
import { describe, expect, it } from 'vitest';
import { buildBuilderPrompt } from './builder-prompt.js';

// Verbatim copy of E1's final RUNTIME_KINDS (order preserved).
const EXECUTABLE_KINDS = [
  'welcome',
  'moderation',
  'xp',
  'giveaway',
  'connector',
  'status',
  'tickets',
  'reaction-roles',
] as const;

const KINDS_LINE_PREFIX = 'Executable behavior kinds:';

function kindsLineOf(prompt: string): string {
  const line = prompt.split('\n').find((entry) => entry.startsWith(KINDS_LINE_PREFIX));
  if (line === undefined) {
    throw new Error(`builder prompt is missing the "${KINDS_LINE_PREFIX}" line`);
  }
  return line;
}

function listedKindsOf(line: string): string[] {
  const segment = line.slice(KINDS_LINE_PREFIX.length).split('.')[0] ?? '';
  return segment
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

describe('builder prompt kind parity (E1 vocabulary)', () => {
  it('names every executable kind on the kinds line', () => {
    const line = kindsLineOf(buildBuilderPrompt());
    for (const kind of EXECUTABLE_KINDS) {
      expect(line).toContain(kind);
    }
  });

  it('lists exactly the executable kinds — no more, no fewer', () => {
    expect(listedKindsOf(kindsLineOf(buildBuilderPrompt()))).toEqual([...EXECUTABLE_KINDS]);
  });

  it('keeps the honest runtime-drop line', () => {
    expect(buildBuilderPrompt()).toContain('dropped at runtime');
  });
});
