// KI-021: one shared `DatabaseNotConfiguredError` -> HTTP mapping.
//
// Reproduction-first. Before `lib/db/map-db-error.ts` existed and before
// `pool.ts` re-exported it, this file could not resolve its imports at all —
// that missing shared helper is the defect KI-021 records: the builder and
// preflight routes map the error honestly (500 + 'database not configured'),
// while ~10 sibling routes re-implement it (or omit it) route by route.
//
// The helper is intentionally dependency-free (no `next/server` import) so it
// is unit-testable in isolation; callers wrap the descriptor in
// `NextResponse.json({ error }, { status })`.
import { describe, expect, it } from 'vitest';
import { DatabaseNotConfiguredError, __resetPool, getPool, mapDbError } from './pool';
import { mapDbError as mapDbErrorDirect } from './map-db-error';

describe('mapDbError (KI-021 shared mapping)', () => {
  it('is exposed from both the helper module and the db module surface', () => {
    expect(typeof mapDbError).toBe('function');
    expect(mapDbError).toBe(mapDbErrorDirect);
  });

  it('maps DatabaseNotConfiguredError to the canonical 500 shape', () => {
    expect(mapDbError(new DatabaseNotConfiguredError())).toEqual({
      error: 'database not configured',
      status: 500,
    });
  });

  it('keeps the exact literal error string the builder route uses', () => {
    const mapped = mapDbError(new DatabaseNotConfiguredError());
    expect(mapped?.error).toBe('database not configured');
    expect(mapped?.status).toBe(500);
  });

  it('passes unknown errors through untouched (returns null, never swallows)', () => {
    const boom = new Error('boom');
    expect(mapDbError(boom)).toBeNull();
    // The original error is neither mutated nor replaced.
    expect(boom.message).toBe('boom');
    expect(boom.name).toBe('Error');
  });

  it('returns null for non-Error unknowns', () => {
    const values: unknown[] = ['nope', 42, null, undefined, { message: 'x' }, Symbol('x')];
    for (const value of values) {
      expect(mapDbError(value)).toBeNull();
    }
  });

  it('maps the real stand-in-pool rejection (no DATABASE_URL) end to end', async () => {
    const previous = process.env.DATABASE_URL;
    __resetPool();
    delete process.env.DATABASE_URL;
    try {
      const caught = await getPool()
        .query('SELECT 1')
        .then(
          () => new Error('stand-in pool unexpectedly resolved'),
          (err: unknown) => err,
        );
      expect(caught).toBeInstanceOf(DatabaseNotConfiguredError);
      expect(mapDbError(caught)).toEqual({
        error: 'database not configured',
        status: 500,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
      __resetPool();
    }
  });
});
