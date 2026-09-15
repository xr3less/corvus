'use client';

/* Builder-run progress — honest phase readout for the V1-7 async builder.
 *
 * useBuilderProgress polls the REAL GET /api/builder route every 2s while the
 * run is non-terminal. There is no client-side timer that fakes progress
 * (D-104, dead): every visible phase comes from the server row. Empty and error
 * states are honest — "No run started" when there is no run, and the API's
 * error text verbatim when the poll fails.
 */

import { useEffect, useState } from 'react';
import styles from './builder-progress.module.css';

export const BUILDER_STEPS = ['queued', 'generating', 'syncing', 'live'] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];
export type BuilderPhase = BuilderStep | 'failed';

const TERMINAL_PHASES: readonly BuilderPhase[] = ['live', 'failed'];

const STEP_LABELS: Record<BuilderStep, string> = {
  queued: 'Queued',
  generating: 'Generating',
  syncing: 'Syncing',
  live: 'Live',
};

export interface BuilderProgressState {
  phase: BuilderPhase | null;
  detail: unknown;
  error: string | null;
}

const IDLE_STATE: BuilderProgressState = { phase: null, detail: null, error: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readPhase(body: unknown): BuilderPhase | null {
  if (!isRecord(body)) return null;
  const phase = body['phase'];
  return typeof phase === 'string' && phase.length > 0 ? (phase as BuilderPhase) : null;
}

// The route's error text, used verbatim (never reworded, never hidden).
function readApiError(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const error = body['error'];
  return typeof error === 'string' && error.length > 0 ? error : null;
}

function readErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return 'Could not reach the builder';
}

export function useBuilderProgress(
  runId: string | null | undefined,
  intervalMs = 2000,
): BuilderProgressState {
  const [state, setState] = useState<BuilderProgressState>(IDLE_STATE);

  useEffect(() => {
    if (!runId) {
      setState(IDLE_STATE);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const target = runId;

    async function poll(): Promise<void> {
      let response: Response;
      try {
        response = await fetch(`/api/builder?runId=${encodeURIComponent(target)}`);
      } catch (err) {
        if (!cancelled) setState({ phase: null, detail: null, error: readErrorMessage(err) });
        return;
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (cancelled) return;
      if (!response.ok) {
        setState({
          phase: null,
          detail: null,
          error: readApiError(body) ?? `Request failed (${response.status})`,
        });
        return;
      }
      const phase = readPhase(body);
      setState({ phase, detail: isRecord(body) ? body['detail'] : null, error: null });
      // Keep polling only while the phase is genuinely non-terminal.
      if (phase !== null && !TERMINAL_PHASES.includes(phase)) {
        timer = setTimeout(() => {
          void poll();
        }, intervalMs);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [runId, intervalMs]);

  return state;
}

type StepState = 'pending' | 'current' | 'done';

function stepState(index: number, phase: BuilderPhase | null): StepState {
  if (phase === null || phase === 'failed') return 'pending';
  const currentIndex = BUILDER_STEPS.indexOf(phase as BuilderStep);
  if (currentIndex === -1) return 'pending';
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'pending';
}

export interface BuilderProgressProps {
  runId?: string | null;
  intervalMs?: number;
}

export function BuilderProgress({ runId, intervalMs = 2000 }: BuilderProgressProps) {
  const state = useBuilderProgress(runId, intervalMs);

  if (!runId) {
    return (
      <div className={styles.root}>
        <p className={styles.empty}>No run started</p>
      </div>
    );
  }

  if (state.error !== null) {
    return (
      <div className={styles.root}>
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <ol className={styles.steps} aria-label="Builder progress">
        {BUILDER_STEPS.map((step, index) => {
          const kind = stepState(index, state.phase);
          return (
            <li
              key={step}
              className={`${styles.step} ${styles[kind]}`}
              aria-current={kind === 'current' ? 'step' : undefined}
            >
              <span aria-hidden="true" className={styles.dot} />
              <span className={styles.label}>{STEP_LABELS[step]}</span>
            </li>
          );
        })}
      </ol>
      {state.phase === 'failed' ? (
        <p role="status" className={styles.failed}>
          Build failed
        </p>
      ) : null}
    </div>
  );
}
