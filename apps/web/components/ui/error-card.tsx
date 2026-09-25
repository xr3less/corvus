'use client';

import type { CSSProperties } from 'react';

/* Preflight fix card (wave E5): a Red scanner row rendered as plain-language
   guidance instead of a dot. Title names the failing check, what-happened
   carries the scanner detail, fix carries the scanner fix string verbatim, and
   the optional retry button re-runs the scan. No secrets ever render here —
   only check/detail/fix text the scanner already produced. */

export interface ErrorCardProps {
  title: string;
  whatHappened: string;
  fix?: string | null;
  tone?: 'red' | 'yellow';
  retryLabel?: string;
  onRetry?: () => void;
}

const ROOT_BASE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgb(255 255 255 / 0.15)',
  borderLeftWidth: 4,
  background: '#0b0b0d',
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: '#fafafa',
  fontSize: 15,
  lineHeight: '22px',
  fontWeight: 600,
};

const DETAIL_STYLE: CSSProperties = {
  margin: 0,
  color: '#d4d4d8',
  fontSize: 14,
  lineHeight: '20px',
};

const FIX_STYLE: CSSProperties = {
  margin: 0,
  color: '#d4d4d8',
  fontSize: 14,
  lineHeight: '20px',
};

const FIX_LABEL_STYLE: CSSProperties = {
  color: '#fafafa',
  fontWeight: 600,
};

const RETRY_STYLE: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 36,
  padding: '0 14px',
  borderRadius: 8,
  border: '1px solid rgb(255 255 255 / 0.15)',
  background: 'transparent',
  color: '#fafafa',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 500,
  cursor: 'pointer',
};

export function ErrorCard({
  title,
  whatHappened,
  fix,
  tone = 'red',
  retryLabel = 'Run scan again',
  onRetry,
}: ErrorCardProps) {
  const isYellow = tone === 'yellow';
  const rootStyle: CSSProperties = {
    ...ROOT_BASE,
    borderLeftColor: isYellow ? '#f59e0b' : '#f87171',
  };
  const hasFix = typeof fix === 'string' && fix.length > 0;
  return (
    <div role={isYellow ? 'status' : 'alert'} style={rootStyle}>
      <p style={TITLE_STYLE}>{title}</p>
      <p style={DETAIL_STYLE}>{whatHappened}</p>
      {hasFix ? (
        <p style={FIX_STYLE}>
          <span style={FIX_LABEL_STYLE}>What to do next: </span>
          {fix}
        </p>
      ) : null}
      {onRetry !== undefined ? (
        <button type="button" onClick={onRetry} style={RETRY_STYLE}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
