// Preflight envelope parsing shared by the publish and rollback routes (V1-3).
//
// Extracted from app/api/spec/publish/route.ts so rollback no longer imports
// across a route boundary (`../publish/route`). Only the helpers both routes
// use live here; each route keeps its own body validation and Red-block
// *decision*: publish refuses the move on any Red row, rollback never does
// (04_design_language.md:71 — "rollback is safe"; recovery must always work).
// Both routes still record the latest preflight envelope in their audit note,
// or 'unscanned' when no scan exists.

// --- Preflight envelope -----------------------------------------------------
// The locked shape is { scannedAt, rows[], summary } with rows carrying
// { severity: 'Red'|'Yellow'|'Green', check, detail, fix }. The on-disk V1-4
// worker currently emits the same row under `tone` (lowercase) — verified in
// apps/gateway/src/preflight/worker.ts (rows push { tone }, summary keyed by
// tone). Both spellings are recognised so the Red gate cannot silently miss a
// scan; `severity` is the contract field and wins when both are present.

export interface PreflightRow {
  severity?: unknown;
  tone?: unknown;
  check?: unknown;
  detail?: unknown;
  fix?: unknown;
}

export interface PreflightEnvelope {
  scannedAt?: unknown;
  rows?: unknown;
  summary?: unknown;
}

function rowIsRed(row: unknown): boolean {
  if (typeof row !== 'object' || row === null) {
    return false;
  }
  const record = row as Record<string, unknown>;
  const severity = record.severity;
  if (typeof severity === 'string' && severity.toLowerCase() === 'red') {
    return true;
  }
  const tone = record.tone;
  return typeof tone === 'string' && tone.toLowerCase() === 'red';
}

// Names every distinct `check` whose row is Red across every install's scan.
// Empty array means no Red anywhere (including "never scanned").
export function detectRedFailing(envelopes: readonly unknown[]): string[] {
  const failing: string[] = [];
  for (const raw of envelopes) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const rows = (raw as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) {
      continue;
    }
    for (const row of rows) {
      if (!rowIsRed(row)) {
        continue;
      }
      const check = (row as { check?: unknown }).check;
      const name = typeof check === 'string' && check.length > 0 ? check : 'unknown';
      if (!failing.includes(name)) {
        failing.push(name);
      }
    }
  }
  return failing;
}

// The most recently scanned envelope, for the audit detail snapshot. Null when
// there is no usable scan (the caller records 'unscanned').
export function latestPreflightEnvelope(envelopes: readonly unknown[]): PreflightEnvelope | null {
  let best: PreflightEnvelope | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const raw of envelopes) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const envelope = raw as PreflightEnvelope;
    const parsed = typeof envelope.scannedAt === 'string' ? Date.parse(envelope.scannedAt) : NaN;
    const score = Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    if (best === null || score > bestAt) {
      best = envelope;
      bestAt = score;
    }
  }
  return best;
}
