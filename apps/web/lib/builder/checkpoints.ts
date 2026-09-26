// Builder-run checkpoint helpers — SOLE OWNER: wave3-resume.
// wave2-time + wave4-hub consume this module read-only (never import gates.ts).
//
// PUBLIC INTERFACE (frozen for sibling waves):
//   CheckpointDetail        additive jsonb shape stored in builder_runs.detail.
//   CHECKPOINT_KEYS         the additive key vocabulary (readers tolerate absence).
//   isRecord(value)         narrowing guard for unknown jsonb payloads.
//   readCheckpoint(detail)  tolerant read → CheckpointDetail (missing keys → defaults).
//   writeCheckpoint(prev, patch)  additive merge → new detail record for UPDATE.
//   checkpointAvailable(detail)   true when a resume can start from a checkpoint
//                           (non-terminal lastGoodPhase + checkpointBrief present).
//   checkpointNotice(detail)      owner-facing notice for the resume response.
//   RESUME_FRESH_NOTICE / RESUME_CHECKPOINT_NOTICE  the two Wave 3 copy strings.
//
// STORAGE CONTRACT (frozen):
// - Keys are ADDITIVE in builder_runs.detail jsonb; never rename/remove.
// - Readers tolerate missing keys (defaults, never throw).
// - No `any` anywhere; all unknown payloads pass through isRecord.
// - Terminal rows (phase live|failed) are immutable — the resume route creates a
//   FRESH builder_runs row and never mutates them.

export type CheckpointPhase = 'queued' | 'generating' | 'syncing';

export interface CheckpointDetail {
  briefChars: number | null;
  attempt: number | null;
  stepStartedAt: string | null;
  lastGoodPhase: CheckpointPhase | null;
  checkpointBrief: string | null;
  error: string | null;
  provider: string | null;
}

// Additive key vocabulary for builder_runs.detail jsonb. Readers tolerate
// absence of any of these; writers only ever ADD.
export const CHECKPOINT_KEYS = [
  'briefChars',
  'attempt',
  'stepStartedAt',
  'lastGoodPhase',
  'checkpointBrief',
  'error',
  'provider',
] as const;

export type CheckpointKey = (typeof CHECKPOINT_KEYS)[number];

// New strings (Wave 3 copy freeze — byte-identical, no emoji, no exclamation).
export const RESUME_FRESH_NOTICE =
  'Starting a fresh build from the last checkpoint — the failed run is kept for audit.';
export const RESUME_NO_CHECKPOINT_NOTICE =
  'Checkpoint unavailable — starting from the approved brief.';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readPhase(value: unknown): CheckpointPhase | null {
  return value === 'queued' || value === 'generating' || value === 'syncing' ? value : null;
}

// Tolerant read of a builder_runs.detail payload: missing or misshaped keys
// fall back to null rather than throwing. `detail` arrives as unknown because
// pg returns jsonb untyped.
export function readCheckpoint(detail: unknown): CheckpointDetail {
  if (!isRecord(detail)) {
    return {
      briefChars: null,
      attempt: null,
      stepStartedAt: null,
      lastGoodPhase: null,
      checkpointBrief: null,
      error: null,
      provider: null,
    };
  }
  return {
    briefChars: readNumber(detail.briefChars),
    attempt: readNumber(detail.attempt),
    stepStartedAt: readString(detail.stepStartedAt),
    lastGoodPhase: readPhase(detail.lastGoodPhase),
    checkpointBrief: readString(detail.checkpointBrief),
    error: readString(detail.error),
    provider: readString(detail.provider),
  };
}

export type CheckpointPatch = Partial<Pick<CheckpointDetail, CheckpointKey>>;

// Additive merge: returns a NEW detail record with the patch applied over the
// previous payload. Unknown pre-existing keys pass through untouched (never
// dropped); patch fields set to undefined leave the previous value in place.
export function writeCheckpoint(prev: unknown, patch: CheckpointPatch): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(prev) ? { ...prev } : {};
  for (const key of CHECKPOINT_KEYS) {
    const value = patch[key];
    if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

// A checkpoint is resumable only when it names a non-terminal phase reached
// with a brief worth restarting from. Terminal-phase rows are never mutated;
// the resume route mints a FRESH row carrying these values forward.
export function checkpointAvailable(detail: unknown): boolean {
  const checkpoint = readCheckpoint(detail);
  return (
    checkpoint.lastGoodPhase !== null &&
    checkpoint.checkpointBrief !== null &&
    checkpoint.checkpointBrief.length > 0
  );
}

// Owner-facing notice for the resume response: the checkpoint sentence when a
// checkpoint backs the fresh run, the unavailable sentence otherwise.
export function checkpointNotice(detail: unknown): string {
  return checkpointAvailable(detail) ? RESUME_FRESH_NOTICE : RESUME_NO_CHECKPOINT_NOTICE;
}
