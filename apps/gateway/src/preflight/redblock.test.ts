import { describe, expect, it } from 'vitest';
import { explainRed, hasRed, type PreflightRedRow } from './redblock.js';

// Rows mirror the two real producers: scanner.ts emits lowercase `tone`,
// the V1-3 contract spells the field `severity` with capitalized values.
function row(overrides: Partial<PreflightRedRow> = {}): PreflightRedRow {
  return { tone: 'green', check: 'installed', detail: 'ok', ...overrides };
}

describe('hasRed', () => {
  it('never-scanned (empty rows) is NOT blocked', () => {
    expect(hasRed([])).toBe(false);
  });

  it('null / undefined / non-array input is NOT blocked', () => {
    expect(hasRed(null)).toBe(false);
    expect(hasRed(undefined)).toBe(false);
    expect(hasRed('not-an-array' as unknown as unknown[])).toBe(false);
  });

  it('green and yellow rows are NOT blocked', () => {
    const rows = [
      row({ tone: 'green' }),
      row({ tone: 'yellow', check: 'channels' }),
      row({ severity: 'Yellow', check: 'intents' }),
    ];
    expect(hasRed(rows)).toBe(false);
  });

  it('a single red tone row blocks', () => {
    expect(hasRed([row({ tone: 'red', check: 'permissions' })])).toBe(true);
  });

  it('a single red severity row (contract spelling) blocks', () => {
    expect(hasRed([row({ severity: 'Red', check: 'permissions' })])).toBe(true);
  });

  it('red matching is case-insensitive on both spellings', () => {
    expect(hasRed([row({ tone: 'RED' })])).toBe(true);
    expect(hasRed([row({ severity: 'red' })])).toBe(true);
    expect(hasRed([row({ severity: 'Red' })])).toBe(true);
  });

  it('severity wins when both spellings are present', () => {
    // A row carrying both is a contract/producer mismatch; the contract field
    // is authoritative and must not be overridden by a stale tone.
    expect(hasRed([row({ severity: 'Red', tone: 'green' })])).toBe(true);
  });

  it('malformed rows do not crash and do not mask a real red', () => {
    const rows = [null, 42, 'nope', {}, row({ tone: 'red', check: 'installed' })];
    expect(hasRed(rows)).toBe(true);
  });
});

describe('explainRed', () => {
  it('is empty when nothing is red', () => {
    expect(explainRed([])).toEqual([]);
    expect(explainRed([row({ tone: 'yellow' })])).toEqual([]);
    expect(explainRed(null)).toEqual([]);
  });

  it('names the failing check of a red row', () => {
    expect(explainRed([row({ tone: 'red', check: 'role-position' })])).toEqual(['role-position']);
  });

  it('names multiple failing checks in scan order', () => {
    const rows = [
      row({ tone: 'red', check: 'installed' }),
      row({ tone: 'green', check: 'intents' }),
      row({ tone: 'red', check: 'channels' }),
    ];
    expect(explainRed(rows)).toEqual(['installed', 'channels']);
  });

  it('collapses duplicate failing checks to one entry', () => {
    const rows = [
      row({ tone: 'red', check: 'permissions' }),
      row({ tone: 'red', check: 'permissions' }),
      row({ tone: 'red', check: 'permissions' }),
    ];
    expect(explainRed(rows)).toEqual(['permissions']);
  });

  it('reads the contract severity spelling too', () => {
    expect(explainRed([row({ severity: 'Red', check: 'permissions' })])).toEqual(['permissions']);
  });

  it('never returns an empty explanation while hasRed is true', () => {
    const rows = [row({ tone: 'red', check: '   ' }), row({ tone: 'red', check: '' })];
    expect(hasRed(rows)).toBe(true);
    const names = explainRed(rows);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual(['unknown-check']);
  });

  it('ignores malformed entries and still explains the red ones', () => {
    const rows = [null, {}, row({ tone: 'red' })];
    expect(explainRed(rows as unknown[])).toEqual(['installed']);
  });
});
