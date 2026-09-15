// Red-block decision for V1-3 publish enforcement (V1-3b calls these).
//
// L-008 grounding (sources read before design):
//   - Installed pg-boss v12 types: node_modules/pg-boss/dist/index.d.ts
//     (v12.30.0) -> `class PgBoss extends EventEmitter`, `start(): Promise<this>`,
//     `stop(options?): Promise<void>`, `work<ReqData, ResData>(...)`.
//     Live: https://github.com/timgit/pg-boss/blob/master/docs/api/workers.md
//     ("each call to work() will add a new worker") and
//     https://github.com/timgit/pg-boss/blob/master/src/index.ts (PgBoss
//     serialises racing start()/stop() itself via #startingPromise /
//     #stoppingPromise). Implication: pg-boss does NOT stop a process from
//     calling start() twice and registering the polling worker twice, so the
//     one-worker-per-process guard must live at our layer (worker.ts).
//   - scanner.ts (producer) emits `tone: 'red'|'yellow'|'green'` (lowercase);
//     worker.ts persists that exact shape into guild_installs.preflight. Docs/06
//     §2 names the stored envelope `{ scannedAt, rows[], summary }` with
//     "Red/Yellow/Green rows". The locked V1-3 contract spells the row field
//     `severity` with capitalized values.
//
// Seam rule (cross-project L-008 §5.2 — two modules classify the same artifact,
// so diff the definitions and make them agree at the boundary): the REAL
// persisted field is `tone` (lowercase) per scanner.ts; the V1-3 contract spells
// it `severity` (capitalized). This module accepts EITHER spelling,
// case-insensitively, so a row written by the real scanner can never be
// mis-read as non-Red by V1-3b. Zero IO, zero imports.

export interface PreflightRedRow {
  /** V1-3 contract spelling ('Red' | 'Yellow' | 'Green'). */
  severity?: string;
  /** scanner.ts / persisted spelling ('red' | 'yellow' | 'green'). */
  tone?: string;
  check?: string;
  detail?: string;
  fix?: string;
}

function rowLevel(row: unknown): string {
  if (typeof row !== 'object' || row === null) return '';
  const record = row as Record<string, unknown>;
  const raw = record['severity'] ?? record['tone'];
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function rowCheck(row: unknown): string {
  if (typeof row === 'object' && row !== null) {
    const check = (row as Record<string, unknown>)['check'];
    if (typeof check === 'string' && check.trim().length > 0) return check.trim();
  }
  return 'unknown-check';
}

// RED = at least one row whose severity/tone is 'red' (case-insensitive).
// No rows at all (never scanned) => false == publish ALLOWED. That is the
// first-publish bootstrap: a bot with no scan row is not blocked, and V1-3b
// records the 'unscanned' audit note (this rule makes no such note itself).
export function hasRed(rows: readonly unknown[] | null | undefined): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => rowLevel(row) === 'red');
}

// Names the failing checks so a publish-block message can say why. Order
// follows the scan; duplicate check names collapse to a single entry. A Red row
// with no usable `check` yields 'unknown-check' rather than vanishing, so the
// explanation can never be empty while hasRed() is true.
export function explainRed(rows: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(rows)) return [];
  const names: string[] = [];
  for (const row of rows) {
    if (rowLevel(row) !== 'red') continue;
    const name = rowCheck(row);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
