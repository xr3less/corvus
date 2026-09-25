/* The sign-in failure surface — the destination of every `?error=<code>`
 * redirect in `app/api/auth/callback/route.ts` and
 * `app/api/auth/login/route.ts`. Before this page existed nothing read that
 * parameter, so a failed sign-in landed on the marketing homepage looking
 * exactly like a successful one.
 *
 * THE QUERY STRING IS ATTACKER-SUPPLIED. Anyone can send a link carrying any
 * `error` value they like, so the raw value is never rendered: it only selects
 * a sentence from the table below, and anything not in that table renders the
 * generic sentence. An unknown code can change *which* of our sentences shows;
 * it can never put words of its own on the page.
 *
 * The mapping lives in this file (rather than a shared module) because the task
 * scope is this page plus its test; the test asserts the same pairings through
 * the rendered output, so the table cannot drift unnoticed.
 *
 * Server Component (the default), so `searchParams` arrives as a Promise and is
 * awaited — verified against the bundled Next.js 16.3.4 docs on disk
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`,
 * "searchParams (optional) ... A promise that resolves to an object"), not from
 * memory.
 */
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Sign-in problem - Corvus',
  description: 'What went wrong on the way in, and the one link that fixes it.',
  // A failure page carries nothing worth indexing.
  robots: { index: false, follow: false },
};

const LOGIN_HREF = '/api/auth/login';

/* Codes that can really arrive here: `login_unavailable` is what the login
   route redirects with, and the rest are the codes `handleOAuthCallback` can
   return (`lib/auth/session.ts` CallbackErrorCode). Copy rules: plain verbs,
   no jargon, no exclamation marks, and a reason only where we actually know it
   — `invalid_state` is also what a re-used or mismatched link produces, so its
   sentence states the allowed window instead of inventing a diagnosis. */
const SIGN_IN_PROBLEMS: Record<string, { heading: string; sentence: string }> = {
  invalid_state: {
    heading: 'We could not verify that sign-in.',
    sentence:
      'The response did not match the request that started it. Sign-in links are good for ten minutes, so start a fresh one below.',
  },
  login_unavailable: {
    heading: 'Sign-in is not available right now.',
    sentence:
      'Nothing is wrong with your account. The sign-in step is briefly unavailable, so try it again in a moment.',
  },
};

const GENERIC_PROBLEM = {
  heading: 'We could not finish that sign-in.',
  sentence: 'Nothing was changed on your account. The link below starts a fresh one.',
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

/* The one action on the page. Its focus ring is the browser default: this file
   may not ship a stylesheet (task scope), and inline styles cannot express
   `:focus-visible`. `outline: none` is deliberately absent so the ring stays. */
const RETRY: CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: '8px',
  background: '#fafafa',
  color: '#000000',
  borderRadius: '999px',
  padding: '12px 20px',
  fontSize: '16px',
  lineHeight: '20px',
  fontWeight: 600,
  textDecoration: 'none',
};

interface AuthErrorPageProps {
  /* Next passes the raw query: a repeated parameter arrives as string[]. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const raw = params.error;
  const code = typeof raw === 'string' ? raw : null;
  const problem = (code !== null ? SIGN_IN_PROBLEMS[code] : undefined) ?? GENERIC_PROBLEM;

  return (
    <div style={SHELL}>
      <main style={PANEL}>
        <p style={BRAND}>CORVUS</p>
        <h1 style={HEADING}>{problem.heading}</h1>
        <p style={SENTENCE}>{problem.sentence}</p>
        <a href={LOGIN_HREF} style={RETRY}>
          Try signing in again
        </a>
      </main>
    </div>
  );
}
