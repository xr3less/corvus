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
        return { accountId: session.accountId, discordId: session.discordId };
      } catch {
        return null;
      }
    },
  };
}

export const defaultSessionReader: SessionReader = createSessionReader();
