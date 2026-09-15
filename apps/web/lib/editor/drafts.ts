// Pure draft/patch validation helpers for the V1-2 round-trip editor.
// Zero I/O: fully unit-testable without a database or a session.
//
// The `{ version: 1, behaviors: [...] }` envelope mirrors BehaviorSpecV0 from
// packages/spec/src/index.ts (BehaviorSpecV0Schema / SPEC_VERSION there).
// @corvus/spec is NOT imported: its dist is not built in this workspace and
// the import does not resolve, so the shape is mirrored inline and
// runtime-guarded (V1-1 precedent in app/api/interview/answer/route.ts).
// Behavior entries stay opaque here — never interpreted, only carried.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_SUMMARY_CHARS = 500;

export interface DraftEnvelope {
  version: 1;
  behaviors: unknown[];
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// botId values are 404-class (never 403): a malformed id reads as foreign so
// callers cannot probe for other accounts' bots.
export function parseBotId(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

export function isEnvelope(value: unknown): value is DraftEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.version === 1 && Array.isArray(record.behaviors);
}

export function trimSummary(summary: string): string {
  return summary.trim().slice(0, MAX_SUMMARY_CHARS);
}

export interface ValidPatch {
  botId: string;
  baseVersion: number;
  behaviors: unknown[];
  summary: string;
}

export type PatchValidation =
  { ok: true; value: ValidPatch } | { ok: false; status: 404 | 422; error: string };

// Full-replacement patch body: `{ botId, baseVersion, behaviors, summary }`.
// Malformed botId is 404 (indistinguishable from foreign); every other shape
// problem is 422. An empty behaviors array is 422 — a full wipe is almost
// certainly a client bug, and the mint path (interview done) owns creation.
export function validatePatchBody(body: unknown): PatchValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 422, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;

  const rawBotId: unknown = record.botId;
  if (!isUuid(rawBotId)) {
    return { ok: false, status: 404, error: 'not found' };
  }

  const rawBase: unknown = record.baseVersion;
  if (typeof rawBase !== 'number' || !Number.isInteger(rawBase) || rawBase < 1) {
    return { ok: false, status: 422, error: 'baseVersion must be a positive integer' };
  }

  const rawBehaviors: unknown = record.behaviors;
  if (!Array.isArray(rawBehaviors) || rawBehaviors.length === 0) {
    return { ok: false, status: 422, error: 'behaviors must be a non-empty array' };
  }

  const rawSummary: unknown = record.summary;
  if (typeof rawSummary !== 'string' || rawSummary.trim().length === 0) {
    return { ok: false, status: 422, error: 'summary must be a non-empty string' };
  }

  return {
    ok: true,
    value: {
      botId: rawBotId,
      baseVersion: rawBase,
      behaviors: rawBehaviors,
      summary: trimSummary(rawSummary),
    },
  };
}
