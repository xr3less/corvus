// Server-side session + OAuth state for Discord login (SPEC section 4).
// Cookie carries a random session id only; the session row lives in Postgres.
// Shape borrowed from the Next.js App Router auth guide (HttpOnly / Secure /
// SameSite=Lax cookie + a server-only session helper that never throws).
// Row types mirror the SPEC section 4 contract structurally (snake_case
// column names exactly); the web package must not import gateway internals.

import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  DiscordApiError,
  exchangeCodeForToken,
  fetchDiscordUser,
  getDiscordConfig,
} from './discord';
import type { DiscordOAuthConfig, DiscordUser } from './discord';

export const SESSION_COOKIE = 'corvus_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
// Rolling expiry: touch expires_at once more than half the TTL is consumed.
export const SESSION_TOUCH_AFTER_MS = SESSION_TTL_MS / 2;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface AccountRow {
  id: string;
  discord_id: string;
  email: string | null;
  creem_id: string | null;
  credits: string;
  created_at: string;
  // Account plan tier (accounts.tier, default 'trial'). Optional on purpose:
  // hand-rolled doubles and selects that predate the tier read carry no tier,
  // which resolves to the trial path (fail-closed on the free path) via
  // isPaidTier — never to a paid bypass.
  tier?: string | null;
  // KI-033 trial clock (0010_accounts_trial_ends.sql). Optional on purpose:
  // the memory double below keeps the row shape it always had (type-only
  // compat, no behaviour change), and a row that predates the migration may
  // legitimately carry no clock. null / undefined = no clock = NOT expired —
  // that fail-open direction is the locked semantic, so an absent value can
  // never be mistaken for "expired". The value is a union because pg returns
  // a Date for timestamptz while JSON and other paths hand back an ISO string;
  // isTrialExpired accepts both, and consumers must go through it rather than
  // comparing dates by hand.
  trial_ends_at?: string | Date | null;
}

export interface SessionRow {
  id: string;
  account_id: string;
  expires_at: string;
  created_at: string;
}

export interface SessionInfo {
  accountId: string;
  discordId: string;
  // KI-033: the account's trial clock, carried on the session so a route can
  // gate on expiry without a second query. The join in findSessionWithAccount
  // selects it; a row with no clock surfaces as null (a real store) or is
  // absent (a hand-rolled double) — isTrialExpired reads both as "not expired".
  trialEndsAt?: Date | string | null;
  // KI-033: the account's plan tier, carried on the session so routes can
  // bypass the trial gates for paid tiers without a second query. Optional on
  // purpose: absent/null/unknown resolves to the trial path (never to a paid
  // bypass) — see isPaidTier in lib/bots.ts.
  tier?: string | null;
}

export interface FoundSession {
  session: SessionRow;
  discordId: string;
  // REQUIRED key (every SessionStore implementation must state what clock it
  // yields), but the VALUE may be undefined as well as null. The two are kept
  // distinct on purpose:
  //   - null      = the database was asked and answered "no clock" (SQL NULL)
  //   - undefined = this store has no clock concept at all (a hand-rolled test
  //                 double), or the key predates the migration
  // Both mean "not expired" — isTrialExpired treats them identically (tested).
  // Collapsing undefined into null here would erase that distinction, and would
  // also force every existing exact-shape session assertion in the suite to
  // change. The REQUIRED key still fails the build for a new implementation that
  // forgets the clock entirely.
  trialEndsAt: Date | string | null | undefined;
  // KI-033: the account's plan tier (accounts.tier). REQUIRED key so a new
  // SessionStore implementation states what tier it yields, but the VALUE may be
  // null/undefined: both resolve to the trial path (never to a paid bypass).
  // Kept symmetric with trialEndsAt so implementations never silently widen a
  // hand-rolled double into a paid account.
  tier: string | null | undefined;
}

export interface SessionStore {
  findSessionWithAccount(sessionId: string): Promise<FoundSession | null>;
  touchSession(sessionId: string, expiresAt: Date): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  upsertAccountByDiscordId(discordId: string, email: string | null): Promise<AccountRow>;
  createSession(accountId: string, expiresAt: Date): Promise<SessionRow>;
}

export const TRIAL_GRANT_CREDITS = 100;
export const TRIAL_GRANT_REASON = 'trial_grant';

/**
 * Trial-grant ledger row for a freshly created account: 100 credits under the
 * `trial_grant` reason (Docs/06 vocabulary, terms "100 AI credits" promise).
 * INSERT-ONLY by contract — the caller must invoke it only when the account
 * row was actually inserted, never on the ON CONFLICT path, so a re-login
 * grants nothing. No ref_id / no attempt: this is a one-per-account grant,
 * not a Creem payment, so it sits OUTSIDE the (ref_id, reason, attempt)
 * partial unique index by construction. A grant failure never breaks signup
 * (the account row already exists at that point), so the caller catches,
 * logs, and moves on.
 */
export const INSERT_TRIAL_GRANT_SQL =
  'INSERT INTO credit_ledger (account_id, reason, amount_cr, meta)' +
  ' VALUES ($1, \'trial_grant\', 100, \'{"credit": "trial"}\')';

export async function writeTrialGrant(
  pool: { query(text: string, params?: unknown[]): Promise<unknown> },
  accountId: string,
): Promise<void> {
  await pool.query(INSERT_TRIAL_GRANT_SQL, [accountId]);
}

/** True when the error is Postgres "relation does not exist" (code 42P01). */
function isMissingRelation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01'
  );
}

export class PgSessionStore implements SessionStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findSessionWithAccount(sessionId: string): Promise<FoundSession | null> {
    const result = await this.pool.query<
      SessionRow & { discord_id: string; trial_ends_at: Date | string | null; tier: string | null }
    >(
      'SELECT s.id, s.account_id, s.expires_at, s.created_at, a.discord_id, a.trial_ends_at, a.tier' +
        ' FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = $1',
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      session: {
        id: row.id,
        account_id: row.account_id,
        expires_at: row.expires_at,
        created_at: row.created_at,
      },
      discordId: row.discord_id,
      // Carried straight through: SQL NULL (no clock) stays null. No COALESCE
      // or default — an absent clock must reach isTrialExpired's fail-open
      // branch rather than being silently reinterpreted here.
      trialEndsAt: row.trial_ends_at,
      // Carried straight through: the tier column is NOT NULL in production
      // ('trial' default), so a real row always yields a string here. Passed
      // as-is — unknown values resolve to the trial path at the gate.
      tier: row.tier,
    };
  }

  async touchSession(sessionId: string, expiresAt: Date): Promise<void> {
    await this.pool.query('UPDATE sessions SET expires_at = $2 WHERE id = $1', [
      sessionId,
      expiresAt.toISOString(),
    ]);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  async upsertAccountByDiscordId(discordId: string, email: string | null): Promise<AccountRow> {
    // KI-033: trial_ends_at is set on INSERT ONLY. The ON CONFLICT branch
    // deliberately does not mention it — re-login must never extend a trial,
    // and a returning account keeps the clock it was given at creation (or
    // the fresh one the 0010 backfill gave it). DO NOT add trial_ends_at to
    // the DO UPDATE SET list.
    //
    // Wave E4 trial_grant (same INSERT-ONLY idiom): the second statement below
    // writes the 100-credit trial row gated on `xmax = '0'` — Postgres's own
    // "this statement INSERTed" marker, readable from the RETURNING row. The
    // ON CONFLICT branch therefore writes nothing: re-login grants nothing.
    // A grant failure never breaks signup (the account already exists), so it
    // is caught and logged, and the account is returned unchanged.
    const result = await this.pool.query<AccountRow & { xmax?: string }>(
      'INSERT INTO accounts (discord_id, email, trial_ends_at)' +
        " VALUES ($1, $2, now() + interval '3 days')" +
        ' ON CONFLICT (discord_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, accounts.email)' +
        ' RETURNING id, discord_id, email, creem_id, credits, created_at,' +
        ' trial_ends_at, xmax::text AS xmax',
      [discordId, email],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('account_upsert_returned_no_row');
    }
    if (row.xmax === '0') {
      // Absence-tolerant: the sibling live suites (session-db, checkout/create)
      // run against a disposable database that may not have the 0011
      // credit_ledger table. The test database is NOT the product, so a missing
      // table is a skip, not a failure — swallowed HERE so the suite log stays
      // clean, while a REAL database failure (connection, permissions) is still
      // logged for the reconciler.
      try {
        await writeTrialGrant(this.pool, row.id);
      } catch (error) {
        if (!isMissingRelation(error)) {
          console.error(
            'session: trial_grant write failed',
            error instanceof Error ? error.message : 'unknown error',
          );
        }
      }
    }
    // Strip the xmax probe before returning: callers own the AccountRow shape
    // and must never learn about the exactly-once marker.
    const { xmax: _xmax, ...account } = row;
    void _xmax;
    return account;
  }

  async createSession(accountId: string, expiresAt: Date): Promise<SessionRow> {
    const result = await this.pool.query<SessionRow>(
      'INSERT INTO sessions (id, account_id, expires_at) VALUES ($1, $2, $3)' +
        ' RETURNING id, account_id, expires_at, created_at',
      [randomUUID(), accountId, expiresAt.toISOString()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('session_insert_returned_no_row');
    }
    return row;
  }
}

// In-memory store for unit tests (and local dev without a database).
// Same method contract as PgSessionStore; expiry is enforced by getSession,
// not by find, exactly like the SQL version.
export function createMemorySessionStore(now: () => number = Date.now): SessionStore {
  const accounts = new Map<string, AccountRow>();
  const byDiscordId = new Map<string, string>();
  const sessions = new Map<string, SessionRow>();

  return {
    findSessionWithAccount(sessionId: string): Promise<FoundSession | null> {
      const session = sessions.get(sessionId) ?? null;
      if (!session) {
        return Promise.resolve(null);
      }
      const account = accounts.get(session.account_id) ?? null;
      if (!account) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        session,
        discordId: account.discord_id,
        // Mirrors the SQL store: the clock is passed straight through, so a
        // double-created account (which has none) yields undefined, exactly as
        // a pre-migration row would. Never silently backfilled here.
        trialEndsAt: account.trial_ends_at,
        // Mirrors the SQL store: the double-created row carries no tier, so it
        // yields undefined — which resolves to the trial path at the gates.
        tier: account.tier,
      });
    },
    touchSession(sessionId: string, expiresAt: Date): Promise<void> {
      const session = sessions.get(sessionId);
      if (session) {
        session.expires_at = expiresAt.toISOString();
      }
      return Promise.resolve();
    },
    deleteSession(sessionId: string): Promise<void> {
      sessions.delete(sessionId);
      return Promise.resolve();
    },
    upsertAccountByDiscordId(discordId: string, email: string | null): Promise<AccountRow> {
      const existingId = byDiscordId.get(discordId);
      if (existingId) {
        const existing = accounts.get(existingId);
        if (existing) {
          if (email !== null) {
            existing.email = email;
          }
          // KI-033: deliberately does NOT touch trial_ends_at — the memory
          // double must mirror the SQL store's "re-login never extends the
          // trial" rule, not diverge from it.
          return Promise.resolve(existing);
        }
      }
      // KI-033, type-only compat: the literal below deliberately carries NO
      // trial_ends_at (undefined = fail-open = not expired). The double must
      // NOT mint `now() + 3 days` here: this store shares its injectable
      // `now()` with tests that seed accounts in the PAST (e.g. a 20-day-old
      // signup), so a derived clock would silently come out already-expired and
      // change those tests' behaviour. Accounts created through the double are
      // therefore never trial-expired — a suite that needs an expired session
      // injects its own SessionReader with a past `trialEndsAt`, or uses
      // PgSessionStore against the real database.
      const row: AccountRow = {
        id: randomUUID(),
        discord_id: discordId,
        email,
        creem_id: null,
        credits: '0',
        created_at: new Date(now()).toISOString(),
      };
      accounts.set(row.id, row);
      byDiscordId.set(discordId, row.id);
      return Promise.resolve(row);
    },
    createSession(accountId: string, expiresAt: Date): Promise<SessionRow> {
      const row: SessionRow = {
        id: randomUUID(),
        account_id: accountId,
        expires_at: expiresAt.toISOString(),
        created_at: new Date(now()).toISOString(),
      };
      sessions.set(row.id, row);
      return Promise.resolve(row);
    },
  };
}

let defaultStore: SessionStore | null = null;

export function getDefaultStore(): SessionStore {
  if (defaultStore) {
    return defaultStore;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  defaultStore = new PgSessionStore(new Pool({ connectionString }));
  return defaultStore;
}

// OAuth `state`: random, single-use, 10-minute expiry. Stored server-side
// (durable Postgres via PgOAuthStateStore in production; the memory store
// below is the unit-test double). Theft-safe because values are unguessable
// 256-bit tokens validated by exact match, never signed client-side.
// Async because the durable store is a database round-trip.
export interface OAuthStateStore {
  mint(returnTo?: string | null): Promise<string>;
  consume(state: string): Promise<boolean>;
}

export function createMemoryOAuthStateStore(
  now: () => number = Date.now,
): OAuthStateStore & { size: number } {
  const pending = new Map<string, number>();
  const store: OAuthStateStore & { size: number } = {
    get size() {
      return pending.size;
    },
    mint(): Promise<string> {
      if (pending.size > 5000) {
        const at = now();
        for (const [key, expiresAt] of pending) {
          if (expiresAt <= at) {
            pending.delete(key);
          }
        }
      }
      const state = randomBytes(32).toString('hex');
      pending.set(state, now() + OAUTH_STATE_TTL_MS);
      return Promise.resolve(state);
    },
    consume(state: string): Promise<boolean> {
      const expiresAt = pending.get(state);
      pending.delete(state);
      return Promise.resolve(typeof expiresAt === 'number' && expiresAt > now());
    },
  };
  return store;
}

export const defaultOAuthStateStore: OAuthStateStore = createMemoryOAuthStateStore();

export interface OAuthStateRow {
  state: string;
  code_verifier: string;
  return_to: string | null;
  created_at: string;
  expires_at: string;
}

// Durable OAuth state in Postgres (V1-2, KI-002) — the production store the
// auth routes use. Consume shape borrowed from the Auth.js Drizzle adapter's
// useVerificationToken (ISC,
// https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-drizzle/src/lib/pg.ts):
// atomic single-use DELETE ... WHERE ... RETURNING — a replay finds no row.
// Borrowed structure only: our table carries its own expiry predicate in the
// DELETE (expired rows are unconsumable, never a wrong grant) because our
// rows carry expires_at where theirs carry an application-checked expires.
export class PgOAuthStateStore implements OAuthStateStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async mint(returnTo: string | null = null): Promise<string> {
    const state = randomBytes(32).toString('hex');
    // code_verifier is NOT NULL for the future PKCE bind; in V1-2 it carries
    // an unguessable random placeholder that is never sent anywhere (the
    // Discord code exchange is not PKCE-bound yet).
    const codeVerifier = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    await this.pool.query(
      'INSERT INTO oauth_states (state, code_verifier, return_to, expires_at)' +
        ' VALUES ($1, $2, $3, $4)',
      [state, codeVerifier, returnTo, expiresAt.toISOString()],
    );
    return state;
  }

  async consume(state: string): Promise<boolean> {
    const result = await this.pool.query<OAuthStateRow>(
      'DELETE FROM oauth_states WHERE state = $1 AND expires_at > now() RETURNING state',
      [state],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Periodic expiry sweep. Sessions keep their own rolling-touch TTL logic —
  // this sweep touches oauth_states only.
  async sweep(): Promise<number> {
    return sweepExpired(this.pool);
  }
}

// Deletes expired oauth_states rows; resolves with the deleted row count.
// Errors propagate: a sweep that reported 0 while the database was down
// would mask an outage, so background schedulers must see the failure.
// (Sessions keep their own rolling-touch TTL logic — this touches
// oauth_states only.)
export async function sweepExpired(pool: Pool): Promise<number> {
  const result = await pool.query('DELETE FROM oauth_states WHERE expires_at < now()');
  return result.rowCount ?? 0;
}

export type CookieSource =
  { get(name: string): { value: string } | undefined } | string | null | undefined;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function parseCookieHeader(header: string): string | null {
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) {
      continue;
    }
    if (part.slice(0, idx).trim() !== SESSION_COOKIE) {
      continue;
    }
    const raw = part.slice(idx + 1).trim();
    try {
      const value = decodeURIComponent(raw);
      return SESSION_ID_PATTERN.test(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function extractSessionId(source: CookieSource): string | null {
  try {
    if (typeof source === 'string') {
      return parseCookieHeader(source);
    }
    const cookie = source?.get(SESSION_COOKIE);
    const value = cookie?.value;
    if (typeof value !== 'string') {
      return null;
    }
    return SESSION_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

// Reads the session cookie, loads the session row, applies rolling expiry.
// Never throws for bad cookies, missing rows, expired rows, or DB errors:
// every failure mode returns null.
export async function getSession(
  cookies: CookieSource,
  store?: SessionStore,
): Promise<SessionInfo | null> {
  try {
    const sessionId = extractSessionId(cookies);
    if (!sessionId) {
      return null;
    }
    const resolved = store ?? getDefaultStore();
    const found = await resolved.findSessionWithAccount(sessionId);
    if (!found) {
      return null;
    }
    const nowMs = Date.now();
    if (Number(new Date(found.session.expires_at).getTime()) <= nowMs) {
      return null;
    }
    const createdMs = Number(new Date(found.session.created_at).getTime());
    if (Number.isFinite(createdMs) && nowMs - createdMs > SESSION_TOUCH_AFTER_MS) {
      await resolved.touchSession(sessionId, new Date(nowMs + SESSION_TTL_MS));
    }
    return {
      accountId: found.session.account_id,
      discordId: found.discordId,
      // Same pass-through rule as the stores: undefined (double with no clock)
      // stays undefined rather than becoming a null the caller must learn about.
      trialEndsAt: found.trialEndsAt,
      // Same pass-through rule: undefined (double with no tier) stays
      // undefined, which the gates resolve to the trial path — never a bypass.
      tier: found.tier,
    };
  } catch {
    return null;
  }
}

// KI-033 trial clock predicate — re-exported so session consumers get it from
// the same import they already use. The DEFINITION lives in ../trial.ts, which
// is runtime-agnostic (no `pg`, no Node built-ins) so the same predicate can be
// imported by the gateway follow-up or a script without dragging in the session
// module. What it means, and why an absent clock is fail-open, is documented
// there; every gate (mint cap, builder start, chat) must go through it rather
// than hand-rolling `new Date(a) < new Date(b)`.
export { isTrialExpired } from '../trial';

export interface SessionCookieOptions {
  secure?: boolean;
}

// Secure-attribute gating (V1-2): explicit override wins; otherwise secure
// iff the app URL is https, falling back to production mode. Shape borrowed
// from better-auth's cookie rule (MIT,
// https://better-auth.com/docs/concepts/cookies): secure in production,
// forced by an explicit flag elsewhere. Borrowed structure only: our signal
// is APP_URL's scheme (production stays Secure; plain-http localhost works).
// The cookie NAME stays `corvus_session` under both branches — renaming it
// would silently log out every existing session.
export function sessionCookieSecure(opts?: SessionCookieOptions): boolean {
  if (opts?.secure !== undefined) {
    return opts.secure;
  }
  const appUrl = process.env.APP_URL;
  if (typeof appUrl === 'string' && appUrl.length > 0) {
    return appUrl.startsWith('https://');
  }
  return process.env.NODE_ENV === 'production';
}

export function buildSessionCookie(sessionId: string, opts?: SessionCookieOptions): string {
  const securePart = sessionCookieSecure(opts) ? '; Secure' : '';
  return (
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}` +
    `; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly${securePart}; SameSite=Lax`
  );
}

export function buildClearedSessionCookie(opts?: SessionCookieOptions): string {
  const securePart = sessionCookieSecure(opts) ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly${securePart}; SameSite=Lax`;
}

export type CallbackErrorCode =
  | 'missing_code'
  | 'missing_state'
  | 'invalid_state'
  | 'token_exchange_failed'
  | 'profile_fetch_failed'
  | 'account_failed'
  | 'session_failed'
  | 'callback_failed';

export interface CallbackSuccess {
  ok: true;
  accountId: string;
  sessionId: string;
  expiresAt: Date;
}

export interface CallbackFailure {
  ok: false;
  error: CallbackErrorCode;
}

export type CallbackResult = CallbackSuccess | CallbackFailure;

export interface CallbackDeps {
  stateStore?: OAuthStateStore;
  sessionStore?: SessionStore;
  config?: DiscordOAuthConfig;
  exchangeCode?: (code: string, config: DiscordOAuthConfig) => Promise<string>;
  fetchUser?: (accessToken: string) => Promise<DiscordUser>;
}

function failure(error: CallbackErrorCode): CallbackFailure {
  return { ok: false, error };
}

// Full callback orchestration as a pure, total function (no Next.js imports)
// so it can be unit-tested with mocked Discord HTTP. Never throws: every
// failure maps to an allowlisted error code, safe to reflect in `?error=...`.
export async function handleOAuthCallback(
  params: { code?: string | null; state?: string | null },
  deps: CallbackDeps = {},
): Promise<CallbackResult> {
  try {
    if (!params.code) {
      return failure('missing_code');
    }
    if (!params.state) {
      return failure('missing_state');
    }
    const stateStore = deps.stateStore ?? defaultOAuthStateStore;
    if (!(await stateStore.consume(params.state))) {
      return failure('invalid_state');
    }
    let config: DiscordOAuthConfig;
    try {
      config = deps.config ?? getDiscordConfig();
    } catch {
      return failure('callback_failed');
    }
    let store: SessionStore;
    try {
      store = deps.sessionStore ?? getDefaultStore();
    } catch {
      return failure('callback_failed');
    }
    const exchange = deps.exchangeCode ?? exchangeCodeForToken;
    const fetchUser = deps.fetchUser ?? fetchDiscordUser;

    let accessToken: string;
    try {
      accessToken = await exchange(params.code, config);
    } catch (error) {
      return failure(error instanceof DiscordApiError ? error.code : 'token_exchange_failed');
    }
    let user: DiscordUser;
    try {
      user = await fetchUser(accessToken);
    } catch (error) {
      return failure(error instanceof DiscordApiError ? error.code : 'profile_fetch_failed');
    }
    let accountId: string;
    try {
      const account = await store.upsertAccountByDiscordId(user.id, user.email);
      accountId = account.id;
    } catch {
      return failure('account_failed');
    }
    try {
      const session = await store.createSession(accountId, new Date(Date.now() + SESSION_TTL_MS));
      return {
        ok: true,
        accountId,
        sessionId: session.id,
        expiresAt: new Date(session.expires_at),
      };
    } catch {
      return failure('session_failed');
    }
  } catch {
    return failure('callback_failed');
  }
}

// Best-effort session delete for logout. Never throws: a missing id, a
// missing DATABASE_URL, or a DB error all resolve silently — the route
// clears the cookie either way.
export async function handleLogout(
  sessionId: string | null | undefined,
  store?: SessionStore,
): Promise<void> {
  try {
    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
      return;
    }
    const resolved = store ?? getDefaultStore();
    await resolved.deleteSession(sessionId);
  } catch {
    return;
  }
}
