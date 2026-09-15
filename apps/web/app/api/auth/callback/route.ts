import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  PgOAuthStateStore,
  PgSessionStore,
  buildSessionCookie,
  handleOAuthCallback,
} from '../../../../lib/auth/session';
import { getPool } from '../../../../lib/db/pool';

function appBase(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const pool = getPool();
  const result = await handleOAuthCallback(
    { code, state },
    { stateStore: new PgOAuthStateStore(pool), sessionStore: new PgSessionStore(pool) },
  );
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/?error=${result.error}`, appBase()));
  }
  const success = NextResponse.redirect(new URL('/dashboard', appBase()));
  success.headers.set('Set-Cookie', buildSessionCookie(result.sessionId));
  return success;
}
