// GET /api/session/trial — the trial-expiry signal for the dashboard banners.
//
// KI-033: the trial clock is server truth (accounts.trial_ends_at) and the
// dashboard pages are 'use client', so they cannot call getSession server-side
// and fetchBots reads a bare row array that cannot carry the flag. This narrow
// read endpoint closes that last hop: 401 { error: 'unauthorized' } with no
// session, else 200 { trialExpired: boolean } via the single isTrialExpired
// predicate. No other shape: the client treats absent/fetch-fail as "no banner"
// (fail-open, never guesses).
import { getSession, isTrialExpired, type SessionStore } from '@/lib/auth/session';

// Injectable store seam (test-only writer): production leaves this unset so
// getSession resolves its default Postgres store; tests inject a memory store
// seeded with explicit clocks. Mirrors the __setSessionReader seam the sibling
// routes carry — the HTTP shape is unchanged by it.
let sessionStore: SessionStore | undefined;

export function __setSessionStore(store: SessionStore): void {
  sessionStore = store;
}

export function __resetSessionStore(): void {
  sessionStore = undefined;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getSession(req.headers.get('cookie'), sessionStore);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(
    { trialExpired: isTrialExpired({ trial_ends_at: session.trialEndsAt }) },
    { status: 200 },
  );
}
