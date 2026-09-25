/*
 * DEV-ONLY founder sign-in — GET /dev-login.
 *
 * What it does: renders a single button inside a plain HTML form
 * (`method="POST" action="/api/auth/dev-login"`), so the founder can sign in
 * locally with one click and land on /dashboard with the session cookie set.
 * No client JavaScript: the form posts straight to the existing dev-login
 * route handler, which mints the session and redirects.
 *
 * Guard conditions (same class as `app/api/auth/dev-login/route.ts`): the
 * page calls `notFound()` when `NODE_ENV === 'production'` OR when
 * `CORVUS_DEV_LOGIN !== '1'`, so it is never reachable in production.
 * Never link to this page from any navigation.
 *
 * Styling reuses the auth error page's inline-style pattern
 * (`app/auth/error/page.tsx`) — no new design system, no stylesheet.
 */

import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';

/* Read the env guard on every request, never bake it in at build time. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dev sign-in - Corvus',
  description: 'Local-only one-click sign-in for development.',
  // A dev-only page carries nothing worth indexing.
  robots: { index: false, follow: false },
};

const SHELL: CSSProperties = {
  minHeight: '100vh',
  background: '#000000',
  color: '#fafafa',
  colorScheme: 'dark',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 16px',
  fontFamily: 'var(--font-sans)',
};

const PANEL: CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  background: '#0b0b0d',
  border: '1px solid rgba(255, 255, 255, 0.09)',
  borderRadius: '18px',
  padding: '32px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const BRAND: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  color: '#a1a1aa',
};

const HEADING: CSSProperties = {
  margin: 0,
  fontSize: '28px',
  lineHeight: '36px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

const SENTENCE: CSSProperties = {
  margin: 0,
  fontSize: '16px',
  lineHeight: '24px',
  color: '#a1a1aa',
};

/* Same look as the error page's retry action, adapted for a <button>:
   buttons neither inherit fonts nor drop their native border, so both are
   set explicitly. The focus ring stays the browser default (no outline:none)
   because inline styles cannot express `:focus-visible`. */
const SUBMIT: CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: '8px',
  background: '#fafafa',
  color: '#000000',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: '999px',
  padding: '12px 20px',
  fontSize: '16px',
  lineHeight: '20px',
  fontWeight: 600,
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function devLoginEnabled(): boolean {
  return process.env.CORVUS_DEV_LOGIN === '1';
}

export default function DevLoginPage(): React.JSX.Element {
  if (isProduction() || !devLoginEnabled()) {
    notFound();
  }

  return (
    <div style={SHELL}>
      <main style={PANEL}>
        <p style={BRAND}>CORVUS</p>
        <h1 style={HEADING}>Dev sign-in</h1>
        <p style={SENTENCE}>Local development only. One click signs in the dev founder.</p>
        <form method="POST" action="/api/auth/dev-login">
          <button type="submit" style={SUBMIT}>
            Sign in as dev founder
          </button>
        </form>
      </main>
    </div>
  );
}
