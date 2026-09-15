import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  buildClearedSessionCookie,
  handleLogout,
} from '../../../../lib/auth/session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  await handleLogout(sessionId);
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', buildClearedSessionCookie());
  return response;
}
