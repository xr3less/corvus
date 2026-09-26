'use client';

/* Per-step build timeline — honest per-phase readout for the V1-7 async builder.
 *
 * Every visible row comes from the server poll (`phase` + the allowlisted
 * `detail` from GET /api/builder). There is no client-side progress estimate:
 * steps the server has not reported stay pending, an empty detail reads
 * `Ayrıntı henüz yok`, and a phase outside the allowlist renders
 * `Unexpected builder phase` instead of a blank stepper. All detail readers
 * are `isRecord`-guarded and tolerate missing keys; `builder/checkpoints.ts`
 * (owned by wave3-resume) is consumed read-only by shape — when it is absent
 * the same guards keep this honest, never stubbed or forked.
 */

import styles from './builder-progress.module.css';

export const RUN_TIMELINE_STEPS = ['queued', 'generating', 'syncing', 'live'] as const;
export type RunTimelineStep = (typeof RUN_TIMELINE_STEPS)[number];
export type RunTimelinePhase = RunTimelineStep | 'failed';

// Mirrors the server's phase allowlist. Anything else (missing, non-string, or
// an unknown name) is a contract violation, not a phase — it renders as the
// error it is, never a blank timeline.
const KNOWN_PHASES: readonly string[] = ['queued', 'generating', 'syncing', 'live', 'failed'];

const STEP_LABELS: Record<RunTimelineStep, string> = {
  queued: 'Queued',
  generating: 'Generating',
  syncing: 'Syncing',
  live: 'Live',
};

/* Checkpoint keys each step may show. The GET route allowlists exactly these
 * additive keys for active phases (the writer lives in wave3-resume's
 * `builder/checkpoints.ts`; this file only reads the shape). Anything else in
 * the detail never renders. Slices stay narrow on purpose: each step shows
 * only the facts that belong to it. */
const STEP_SLICES: Record<RunTimelineStep, readonly string[]> = {
  queued: ['briefChars', 'attempt'],
  generating: ['provider', 'attempt', 'stepStartedAt'],
  syncing: ['lastGoodPhase', 'stepStartedAt'],
  live: ['version', 'model'],
};

/* Failure extras beside the cause: the step the run died in and how many
 * billable attempts it made. Primitives only, like everything else here. */
const FAILURE_EXTRA_KEYS = ['step', 'attempts'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKnownPhase(value: unknown): value is RunTimelinePhase {
  return typeof value === 'string' && (KNOWN_PHASES as readonly string[]).includes(value);
}

type TimelineStepState = 'pending' | 'current' | 'done';

function stepState(index: number, phase: RunTimelinePhase | null): TimelineStepState {
  if (phase === null || phase === 'failed') return 'pending';
  const currentIndex = RUN_TIMELINE_STEPS.indexOf(phase);
  if (currentIndex === -1) return 'pending';
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'pending';
}

/* One allowlisted entry rendered as `key: value`. Values are primitives only —
 * objects and arrays (internal payloads) never render. A blank string is the
 * same as a missing key: the caller shows the honest empty line instead. */
function formatEntry(key: string, detail: Record<string, unknown>): string | null {
  const value = detail[key];
  if (typeof value === 'string') {
    return value.trim().length > 0 ? `${key}: ${value}` : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return `${key}: ${value}`;
  return null;
}

function stepEntries(step: RunTimelineStep, detail: unknown): string[] {
  if (!isRecord(detail)) return [];
  const out: string[] = [];
  for (const key of STEP_SLICES[step]) {
    const entry = formatEntry(key, detail);
    if (entry !== null) out.push(entry);
  }
  return out;
}

/* The real failure cause, verbatim from the server row — never transformed,
 * never guessed. Null when the row carries no usable cause, so the caller can
 * show the honest empty line instead of a blank. */
function readFailureCause(detail: unknown): string | null {
  if (!isRecord(detail)) return null;
  const error = detail['error'];
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return null;
}

function failureExtras(detail: unknown): string[] {
  if (!isRecord(detail)) return [];
  const out: string[] = [];
  for (const key of FAILURE_EXTRA_KEYS) {
    const entry = formatEntry(key, detail);
    if (entry !== null) out.push(entry);
  }
  return out;
}

export interface RunTimelineProps {
  phase: string | null;
  detail: unknown;
  onRetry?: () => void;
}

export function RunTimeline({ phase, detail, onRetry }: RunTimelineProps) {
  // Unknown future phase: an error state, never a blank stepper.
  if (phase !== null && !isKnownPhase(phase)) {
    return (
      <section aria-label="Build timeline" className={styles.timeline}>
        <p role="alert" className={styles.error}>
          Unexpected builder phase
        </p>
        {onRetry !== undefined ? (
          <button type="button" onClick={onRetry} className={styles.retry}>
            Retry check
          </button>
        ) : null}
      </section>
    );
  }
  const known: RunTimelinePhase | null = isKnownPhase(phase) ? phase : null;
  const cause = known === 'failed' ? readFailureCause(detail) : null;
  const extras = known === 'failed' ? failureExtras(detail) : [];

  return (
    <section aria-label="Build timeline" className={styles.timeline}>
      <p className={styles.timelineTitle}>Kurulum adımları</p>
      <ol className={styles.timelineSteps}>
        {RUN_TIMELINE_STEPS.map((step, index) => {
          const kind = stepState(index, known);
          const entries = stepEntries(step, detail);
          return (
            <li
              key={step}
              className={`${styles.timelineStep} ${styles[kind]}`}
              aria-current={kind === 'current' ? 'step' : undefined}
            >
              <span className={styles.timelineStepRow}>
                <span aria-hidden="true" className={styles.dot} />
                <span className={styles.label}>{STEP_LABELS[step]}</span>
              </span>
              <details className={styles.detail}>
                <summary className={styles.summary}>
                  <span className={styles.visuallyHidden}>Step detail </span>
                  <span className={styles.showLabel}>Ayrıntıları göster</span>
                  <span className={styles.hideLabel}>Ayrıntıları gizle</span>
                </summary>
                {entries.length > 0 ? (
                  <div className={styles.detailBody}>
                    {entries.map((entry) => (
                      <p key={entry} className={styles.detailLine}>
                        {entry}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className={styles.detailEmpty}>Ayrıntı henüz yok</p>
                )}
              </details>
            </li>
          );
        })}
      </ol>
      {known === 'failed' ? (
        <div className={styles.failBlock}>
          <p role="status" className={styles.failTitle}>
            Build failed with error
          </p>
          <p className={styles.failCause}>{cause ?? 'Ayrıntı henüz yok'}</p>
          {extras.map((entry) => (
            <p key={entry} className={styles.detailLine}>
              {entry}
            </p>
          ))}
          {onRetry !== undefined ? (
            <button type="button" onClick={onRetry} className={styles.retry}>
              Retry check
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
