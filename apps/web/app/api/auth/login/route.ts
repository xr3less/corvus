import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, getDiscordConfig } from '../../../../lib/auth/discord';
import { PgOAuthStateStore } from '../../../../lib/auth/session';
import { getPool } from '../../../../lib/db/pool';

function appBase(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

export async function GET(): Promise<NextResponse> {
  try {
    const config = getDiscordConfig();
    const state = await new PgOAuthStateStore(getPool()).mint();
    return NextResponse.redirect(buildAuthorizeUrl(state, config));
  } catch {
    /* Sent to the dedicated failure surface rather than the homepage: nothing
       on `/` reads `?error`, so the reason used to vanish. `/auth/error` has a
       sentence for `login_unavailable` and a retry link back to this route. */
    return NextResponse.redirect(new URL('/auth/error?error=login_unavailable', appBase()));
  }
}
