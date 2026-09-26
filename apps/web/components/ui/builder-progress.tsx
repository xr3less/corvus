'use client';

/* Builder-run progress — honest phase readout for the V1-7 async builder.
 *
 * useBuilderProgress polls the REAL GET /api/builder route every 2s while the
 * run is non-terminal. There is no client-side timer that fakes progress
 * (D-104, dead): every visible phase comes from the server row. Empty and error
 * states are honest — "No run started" when there is no run, and the API's
 * error text verbatim when the poll fails.
 */

import { useCallback, useEffect, useState } from 'react';
import { readRefusalMessage } from '@/lib/http/refusal';
import { RUN_TIMELINE_STEPS, RunTimeline, type RunTimelinePhase } from './run-timeline';
import styles from './builder-progress.module.css';

export const BUILDER_STEPS = RUN_TIMELINE_STEPS;
export type BuilderStep = (typeof BUILDER_STEPS)[number];
export type BuilderPhase = RunTimelinePhase;

const TERMINAL_PHASES: readonly BuilderPhase[] = ['live', 'failed'];

// The full allowlist the server may ever report. Anything else (missing,
// non-string, or an unknown name) is a contract violation, not a phase — it is
// surfaced as an error instead of freezing the stepper on a blank, dead state.
const ALL_PHASES: readonly BuilderPhase[] = ['queued', 'generating', 'syncing', 'live', 'failed'];

export interface BuilderProgressState {
  phase: BuilderPhase | null;
  detail: unknown;
  error: string | null;
  // Carries an unknown future phase string verbatim so the caller can render
  // the `Unexpected builder phase` error state inside the timeline instead of
  // the hook-level alert. Null for every known or missing phase.
  unknownPhase: string | null;
}

const IDLE_STATE: BuilderProgressState = {
  phase: null,
  detail: null,
  error: null,
  unknownPhase: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBuilderPhase(value: unknown): value is BuilderPhase {
  return typeof value === 'string' && (ALL_PHASES as readonly string[]).includes(value);
}

// The route's error text, resolved through the shared refusal reader first so
// a code-only body shows a sentence instead of a raw token. Values the reader
// does not resolve (prose bodies) fall back to the raw `error` verbatim.
function readApiError(body: unknown): string | null {
  const resolved = readRefusalMessage(body);
  if (resolved !== null) return resolved;
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
  retryNonce = 0,
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
        if (!cancelled)
          setState({ phase: null, detail: null, error: readErrorMessage(err), unknownPhase: null });
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
          unknownPhase: null,
        });
        return;
      }
      const phaseValue = isRecord(body) ? body['phase'] : undefined;
      // A 200 carrying a phase outside the allowlist can never be rendered as
      // progress. Carry it in `unknownPhase` so RunTimeline shows it as the
      // error it is (`Unexpected builder phase`), and stop — never a blank
      // stepper that has silently stopped polling (D7). A missing/non-string
      // phase stays the hook-level error it always was.
      if (typeof phaseValue === 'string' && !isBuilderPhase(phaseValue)) {
        setState({ phase: null, detail: null, error: null, unknownPhase: phaseValue });
        return;
      }
      if (!isBuilderPhase(phaseValue)) {
        setState({
          phase: null,
          detail: null,
          error: 'Unexpected builder phase',
          unknownPhase: null,
        });
        return;
      }
      setState({
        phase: phaseValue,
        detail: isRecord(body) ? body['detail'] : null,
        error: null,
        unknownPhase: null,
      });
      // Keep polling only while the phase is genuinely non-terminal. An unknown
      // phase name is treated as terminal here (it renders the error state, so
      // the retry button re-polls instead of the timer).
      if (!TERMINAL_PHASES.includes(phaseValue)) {
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
    /* retryNonce is an intentional re-poll trigger: the hook re-runs its
       effect (fresh poll, same contract) when the timeline's Retry check
       button bumps it. */
  }, [runId, intervalMs, retryNonce]);

  return state;
}

export interface BuilderProgressProps {
  runId?: string | null;
  intervalMs?: number;
}

export function BuilderProgress({ runId, intervalMs = 2000 }: BuilderProgressProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const state = useBuilderProgress(runId, intervalMs, retryNonce);
  const retry = useCallback(() => {
    setRetryNonce((nonce) => nonce + 1);
  }, []);

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

  // `unknownPhase` (a future phase string the server may one day report)
  // renders inside the timeline as `Unexpected builder phase` with a
  // `Retry check` re-poll — the error state, not a blank stepper.
  return (
    <div className={styles.root}>
      <RunTimeline
        key={`${runId}:${retryNonce}`}
        phase={state.unknownPhase ?? state.phase}
        detail={state.detail}
        onRetry={retry}
      />
    </div>
  );
}
