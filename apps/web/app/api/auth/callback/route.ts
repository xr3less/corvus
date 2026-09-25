import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  PgOAuthStateStore,
  PgSessionStore,
  buildSessionCookie,
  handleOAuthCallback,
  type CallbackErrorCode,
} from '../../../../lib/auth/session';
import { getPool } from '../../../../lib/db/pool';

function appBase(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

/* Every code handleOAuthCallback can return (lib/auth/session.ts
   CallbackErrorCode). Naming them here turns a future code that reaches this
   route without a sentence on `/auth/error` into a compile error instead of a
   silent generic page. A code outside this set — which the compiler makes
   impossible to pass — is replaced by a known one rather than reflected, so the
   query string stays a member of a closed set. */
const ERROR_CODES: Record<CallbackErrorCode, string> = {
  missing_code: 'missing_code',
  missing_state: 'missing_state',
  invalid_state: 'invalid_state',
  token_exchange_failed: 'token_exchange_failed',
  profile_fetch_failed: 'profile_fetch_failed',
  account_failed: 'account_failed',
  session_failed: 'session_failed',
  callback_failed: 'callback_failed',
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const pool = getPool();
  const result = await handleOAuthCallback(
    { code, state },
    { stateStore: new PgOAuthStateStore(pool), sessionStore: new PgSessionStore(pool) },
  );
  if (!result.ok) {
    /* The failure lands on the dedicated surface that renders a sentence for
       this code (`app/auth/error/page.tsx`). The homepage reads no query
       parameters, so it used to swallow the reason silently. */
    return NextResponse.redirect(
      new URL(`/auth/error?error=${ERROR_CODES[result.error]}`, appBase()),
    );
  }
  const success = NextResponse.redirect(new URL('/dashboard', appBase()));
  success.headers.set('Set-Cookie', buildSessionCookie(result.sessionId));
  return success;
}
