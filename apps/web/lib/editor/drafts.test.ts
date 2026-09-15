import { describe, expect, it } from 'vitest';
import {
  MAX_SUMMARY_CHARS,
  isEnvelope,
  isUuid,
  parseBotId,
  trimSummary,
  validatePatchBody,
} from './drafts';

const BOT_ID = '11111111-1111-4111-8111-111111111111';

function patchBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    botId: BOT_ID,
    baseVersion: 1,
    behaviors: [{ question: 'purpose', answer: 'study' }],
    summary: 'first edit',
    ...overrides,
  };
}

describe('isUuid', () => {
  it('accepts canonical uuids', () => {
    expect(isUuid(BOT_ID)).toBe(true);
    expect(isUuid('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(true);
    expect(isUuid('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('rejects non-uuid values', () => {
    const bad: unknown[] = [
      '',
      'not-a-uuid',
      '11111111-1111-4111-8111',
      '11111111-1111-4111-8111-11111111111x',
      42,
      null,
      undefined,
      {},
      [],
    ];
    for (const value of bad) {
      expect(isUuid(value)).toBe(false);
    }
  });
});

describe('parseBotId', () => {
  it('returns the id when valid and null otherwise', () => {
    expect(parseBotId(BOT_ID)).toBe(BOT_ID);
    expect(parseBotId('nope')).toBeNull();
    expect(parseBotId(null)).toBeNull();
    expect(parseBotId(undefined)).toBeNull();
  });
});

describe('isEnvelope', () => {
  it('accepts the mirrored BehaviorSpecV0 shape with opaque entries', () => {
    expect(isEnvelope({ version: 1, behaviors: [] })).toBe(true);
    expect(isEnvelope({ version: 1, behaviors: [1, 'a', null, { x: 1 }] })).toBe(true);
  });

  it('rejects anything else', () => {
    const bad: unknown[] = [
      null,
      'x',
      42,
      [],
      {},
      { version: 2, behaviors: [] },
      { version: 1 },
      { behaviors: [] },
      { version: 1, behaviors: {} },
      { version: '1', behaviors: [] },
    ];
    for (const value of bad) {
      expect(isEnvelope(value)).toBe(false);
    }
  });
});

describe('trimSummary', () => {
  it('trims surrounding whitespace', () => {
    expect(trimSummary('  hello  ')).toBe('hello');
  });

  it('caps at MAX_SUMMARY_CHARS', () => {
    expect(MAX_SUMMARY_CHARS).toBe(500);
    expect(trimSummary('y'.repeat(600))).toHaveLength(500);
    expect(trimSummary('y'.repeat(600))).toBe('y'.repeat(500));
  });
});

describe('validatePatchBody', () => {
  it('accepts a well-formed body and trims the summary', () => {
    const parsed = validatePatchBody(patchBody({ summary: '  did things  ' }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.botId).toBe(BOT_ID);
      expect(parsed.value.baseVersion).toBe(1);
      expect(parsed.value.behaviors).toEqual([{ question: 'purpose', answer: 'study' }]);
      expect(parsed.value.summary).toBe('did things');
    }
  });

  it('preserves opaque behavior entries verbatim', () => {
    const behaviors: unknown[] = [null, 7, 'free text', { nested: [1, { two: 2 }] }];
    const parsed = validatePatchBody(patchBody({ behaviors }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.behaviors).toEqual(behaviors);
    }
  });

  it('trims an over-long summary to 500 chars instead of rejecting', () => {
    const parsed = validatePatchBody(patchBody({ summary: `  ${'z'.repeat(600)}  ` }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.summary).toHaveLength(500);
    }
  });

  it('maps a malformed botId to 404 (never 403, never 422)', () => {
    for (const botId of ['not-a-uuid', '', 42, null, undefined]) {
      const parsed = validatePatchBody(patchBody({ botId }));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.status).toBe(404);
      }
    }
  });

  it('rejects non-object bodies with 422', () => {
    const bad: unknown[] = [null, 'x', 42, [], [{ botId: BOT_ID }]];
    for (const body of bad) {
      const parsed = validatePatchBody(body);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.status).toBe(422);
      }
    }
  });

  it('rejects bad baseVersion values with 422', () => {
    const bad: unknown[] = [0, -1, 1.5, Number.NaN, '1', null, undefined, {}];
    for (const baseVersion of bad) {
      const parsed = validatePatchBody(patchBody({ baseVersion }));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.status).toBe(422);
      }
    }
  });

  it('rejects missing, non-array, or empty behaviors with 422', () => {
    const bad: unknown[] = [undefined, 'x', 42, {}, []];
    for (const behaviors of bad) {
      const parsed = validatePatchBody(patchBody({ behaviors }));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.status).toBe(422);
      }
    }
  });

  it('rejects missing, non-string, or blank summaries with 422', () => {
    const bad: unknown[] = [undefined, 42, null, '', '   '];
    for (const summary of bad) {
      const parsed = validatePatchBody(patchBody({ summary }));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.status).toBe(422);
      }
    }
  });
});
