// Production bind for the interview routes' injectable SessionReader (review
// follow-up F1): delegates to the real lib/auth getSession with the request's
// cookie header. getSession never throws — missing/bad cookie, missing row,
// expired row, DB error, and missing DATABASE_URL all resolve to null — and
// this adapter adds its own never-throw boundary, so both routes keep failing
// closed (401) on any failure.
import { getSession, type SessionStore } from '../auth/session';

export interface InterviewSession {
  accountId: string;
  discordId: string;
  // KI-033: the account's trial clock + plan tier, carried on the session so
  // routes can gate on expiry / bypass paid tiers without a second query.
  // Optional on purpose: absent/null/unknown resolve to the trial path at the
  // gates (fail-open on the clock, fail-closed on the free path) — never to a
  // paid bypass. null = the DB was asked and answered "none"; undefined = the
  // store has no such concept (a hand-rolled double).
  trialEndsAt?: Date | string | null;
  tier?: string | null;
}

export interface SessionReader {
  getSession(req: Request): Promise<InterviewSession | null>;
}

// The optional store is getSession's own injection point: production uses the
// default (Postgres via DATABASE_URL); tests pass a memory store. The shapes
// above are intentionally structural duplicates of the routes' SessionReader
// so the bind is checked by assignment, not by importing route modules here.
export function createSessionReader(store?: SessionStore): SessionReader {
  return {
    async getSession(req: Request): Promise<InterviewSession | null> {
      try {
        const session = await getSession(req.headers.get('cookie'), store);
        if (!session) {
          return null;
        }
        return {
          accountId: session.accountId,
          discordId: session.discordId,
          // Passed straight through (same undefined-stays-undefined rule as
          // getSession): stripping either field would re-dormant the dashboard
          // banners and unwire the paid-tier bypass.
          trialEndsAt: session.trialEndsAt,
          tier: session.tier,
        };
      } catch {
        return null;
      }
    },
  };
}

export const defaultSessionReader: SessionReader = createSessionReader();
