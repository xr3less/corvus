// KI-021: one shared mapping for `DatabaseNotConfiguredError`.
//
// The builder and preflight routes already answer a missing DATABASE_URL
// honestly — `{ error: 'database not configured' }` with status 500 — while
// ~10 sibling routes re-implemented that branch (or dropped it into a
// misleading generic message). This helper is the single source of truth.
//
// It is dependency-free on purpose: no `next/server` import, so it stays
// unit-testable in isolation and usable outside a route. Callers do:
//
//   const mapped = mapDbError(err);
//   if (mapped) {
//     return NextResponse.json({ error: mapped.error }, { status: mapped.status });
//   }
//   // ...caller's own fallback for the unknown error
//
// Unknown errors are passed through untouched: the helper returns `null`
// rather than inventing a response, so the caller's fallback still runs. It
// never swallows an error and never converts an unrelated failure into a
// false 'database not configured'.

import { DatabaseNotConfiguredError } from './pool';

/** Canonical route response descriptor for a DB-misconfiguration failure. */
export interface DbErrorResponse {
  error: string;
  status: number;
}

/**
 * Map a caught error to the canonical route response, or `null` when the error
 * is not a `DatabaseNotConfiguredError` (the caller keeps its own fallback).
 *
 * The literal `'database not configured'` string and the `500` status match the
 * builder/preflight routes exactly — changing either here silently changes
 * every consumer, so change them there first.
 */
export function mapDbError(err: unknown): DbErrorResponse | null {
  if (err instanceof DatabaseNotConfiguredError) {
    return { error: 'database not configured', status: 500 };
  }
  return null;
}
