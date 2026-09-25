/*
 * DEV-ONLY founder login — POST /api/auth/dev-login.
 *
 * What it does: mints a real trial account (discord_id 'dev-founder') plus a
 * 30-day session row through the existing PgSessionStore path, sets the
 * `corvus_session` cookie, and redirects to /dashboard — so the founder can
 * sign in locally without Discord OAuth (whose Authorize step needs a
 * registered redirect URI). No Discord network calls, no body reads.
 *
 * Guard conditions (KI-034 class): every handler answers 404 with an empty
 * body when `NODE_ENV === 'production'` OR when `CORVUS_DEV_LOGIN !== '1'`.
 * The endpoint is dead unless explicitly enabled in dev.
 *
 * Never link from production navigation. Never set trial_ends_at by hand —
 * the trial clock comes from the upsert's INSERT-only default.
 */
import { NextResponse } from 'next/server';
import {
  PgSessionStore,
  SESSION_TTL_MS,
  buildSessionCookie,
  type SessionStore,
} from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';

const DEV_FOUNDER_DISCORD_ID = 'dev-founder';

function appBase(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function devLoginEnabled(): boolean {
  return process.env.CORVUS_DEV_LOGIN === '1';
}

function prodNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

// Injectable store seam (test-only writer): production leaves this unset so
// the handler resolves the default Postgres store; tests inject a memory
// store. Mirrors the __setSessionStore seam the sibling routes carry.
let sessionStore: SessionStore | undefined;

export function __setSessionStore(store: SessionStore): void {
  sessionStore = store;
}

export function __resetSessionStore(): void {
  sessionStore = undefined;
}

function resolveStore(): SessionStore {
  return sessionStore ?? new PgSessionStore(getPool());
}

export async function POST(): Promise<NextResponse> {
  if (isProduction() || !devLoginEnabled()) {
    return prodNotFound();
  }
  try {
    const store = resolveStore();
    const account = await store.upsertAccountByDiscordId(DEV_FOUNDER_DISCORD_ID, null);
    const session = await store.createSession(account.id, new Date(Date.now() + SESSION_TTL_MS));
    const success = NextResponse.redirect(new URL('/dashboard', appBase()));
    success.headers.set('Set-Cookie', buildSessionCookie(session.id));
    return success;
  } catch {
    return NextResponse.json({ error: 'dev login failed' }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  if (isProduction() || !devLoginEnabled()) {
    return prodNotFound();
  }
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
