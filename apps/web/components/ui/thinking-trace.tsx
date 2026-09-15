/* Thinking trace — expandable reasoning display for live chat replies.
 *
 * Structure adapted from Beautiful UI's "Thinking" primitive
 * (https://www.beautifului.dev/?component=thinking, MIT (c) 2026 Shane Levine):
 * sparkle mark + shimmer label + chevron header over an expandable trace body.
 * Rebuilt originally in Corvus tokens (no copied bytes, no new dependency).
 * Only ever shows reasoning the provider actually streamed — no fake steps.
 */

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './thinking-trace.module.css';

export interface ThinkingTraceProps {
  /* thinking — stream open, shimmer label, body starts expanded.
     done — stream finished, static label, body starts collapsed. */
  status: 'thinking' | 'done';
  reasoning?: string;
  /* Real clock readings (Date.now() ms). The header shows measured elapsed
     time — never an estimate, never a canned animation. */
  startedAt: number;
  finishedAt?: number;
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

/* One streamed reasoning blob, shown as readable trace lines. */
function traceLines(reasoning: string): string[] {
  return reasoning
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/* Whole seconds, floored so the counter only ever moves forward. */
function formatSecs(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}

export function ThinkingTrace({ status, reasoning = '', startedAt, finishedAt }: ThinkingTraceProps) {
  const [open, setOpen] = useState(status === 'thinking');
  const lines = traceLines(reasoning);
  /* Ticks the elapsed readout twice a second while the stream is genuinely
     open. This is a wall clock, not progress: it proves time is passing. */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'thinking') return;
    const timer = setInterval(() => setTick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [status]);

  /* A finished stream parks itself collapsed; the user reopens it to re-read. */
  useEffect(() => {
    if (status === 'done') setOpen(false);
  }, [status]);

  const end = status === 'thinking' ? Date.now() : (finishedAt ?? startedAt);
  const elapsed = formatSecs(end - startedAt);

  return (
    <div className={styles.trace}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={styles.head}
      >
        <span aria-hidden="true" className={styles.sparkle}>
          <SparkleIcon />
        </span>
        <span role="status" className={styles.headText}>
          <span className={status === 'thinking' ? styles.shimmer : undefined}>
            {status === 'thinking' ? 'Thinking' : 'Thought'}
          </span>{' '}
          {/* Seconds are visual-only: re-announcing every tick would spam
             screen readers, which already heard the label once. */}
          <span aria-hidden="true" className={styles.elapsed}>
            {status === 'thinking' ? `· ${elapsed}` : `· took ${elapsed}`}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          size={14}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
      </button>
      <div className={styles.body} data-open={open ? '' : undefined} aria-hidden={!open}>
        <div className={styles.bodyInner}>
          <div className={styles.rail} aria-hidden="true" />
          <div className={styles.lines}>
            {/* No placeholder while empty: until the first streamed line
               arrives the header (Thinking · Ns) is the whole signal. */}
            {lines.map((line, index) => (
              <p key={`reasoning-${index}`} className={styles.line}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
