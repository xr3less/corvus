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
    return NextResponse.redirect(new URL('/?error=login_unavailable', appBase()));
  }
}
