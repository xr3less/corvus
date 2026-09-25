// GET /api/credits — the caller's live credit balance, read-only.
//
// Answers 200 { tier, allowance, spent, remaining, warn } where `allowance`
// is MONTHLY_GRANTS[tier] plus active refill grants (credit_ledger `refill`
// rows within 90 days), `spent` is the month-to-date ai_spend SUM for the
// account (the same SPENT_CREDITS_SQL arithmetic the chat and verdict routes
// bill against), `remaining` is allowance − spent, and `warn` trips once
// `spent` reaches BUDGET_WARN_RATIO of the allowance.
//
// Guards mirror the sibling read routes: session first (401, fail-closed — no
// anonymous balance reads), then the ledger reads. A meter the database cannot
// express as a number is a billing-boundary read failure and answers 500 —
// never a fabricated 0 that would silently reset an exhausted month. The
// refill read tolerates absence (the refill rows are a sibling agent's scope,
// and the table may not exist yet): no refill rows reads as zero, never as a
// failure of the whole balance.
//
// This route NEVER writes: no ledger row, no tier change, no checkout.
// Session tier resolution mirrors the chat route: an absent/unknown tier reads
// as 'trial', never as a paid bypass.

import { NextResponse } from 'next/server';
import { BUDGET_WARN_RATIO, MONTHLY_GRANTS, isPlanTier } from '@corvus/ai';
import { getPool, mapDbError, __setPool } from '../../../lib/db/pool';
import { defaultSessionReader } from '../../../lib/interview/session-bind';

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/bots/route.ts).
export { __setPool };

export interface CreditsSession {
  accountId: string;
  discordId: string;
  tier?: string | null;
}

export interface CreditsSessionReader {
  getSession(req: Request): Promise<CreditsSession | null>;
}

const closedReader: CreditsSessionReader = {
  getSession: async () => null,
};

let sessionReader: CreditsSessionReader = defaultSessionReader;

export function __setSessionReader(reader: CreditsSessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = closedReader;
}

export interface CreditsPayload {
  tier: string;
  allowance: number;
  spent: number;
  remaining: number;
  warn: boolean;
}

// Credits already spent this calendar month, scoped to the account. Identical
// arithmetic to the chat route's and verdict route's SPENT_CREDITS_SQL
// (ai_spend has no period column, so created_at is the period and the shared
// allowance is monthly).
export const SPENT_CREDITS_SQL =
  'SELECT COALESCE(SUM(credits), 0) AS spent FROM ai_spend ' +
  "WHERE account_id = $1 AND created_at >= date_trunc('month', now())";

// Active refill grants: credit_ledger `refill` rows within the refill window.
// Matches the terms promise ($5 / 1,000 credits / 90 days).
export const REFILL_REASON = 'refill';
export const REFILL_WINDOW_DAYS = 90;
export const REFILL_CREDITS_SQL =
  'SELECT COALESCE(SUM(amount_cr), 0) AS refills FROM credit_ledger ' +
  "WHERE account_id = $1 AND reason = $2 AND created_at >= now() - interval '90 days'";

// A SUM the database could not express as a number is a billing-boundary read
// failure, so it surfaces as NaN and the caller answers 500. Returning 0
// instead would silently reset an exhausted month. Mirrors the chat route's
// readSpentCredits.
function readSpentCredits(row: unknown): number {
  if (typeof row === 'object' && row !== null) {
    const value = (row as Record<string, unknown>).spent;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
  }
  return Number.NaN;
}

// The refill read is absence-tolerant by contract (sibling scope): anything
// unreadable — missing table, null, garbage — is zero refills, never a
// failure. Only a genuine non-negative number widens the allowance.
function readRefillCredits(row: unknown): number {
  if (typeof row === 'object' && row !== null) {
    const value = (row as Record<string, unknown>).refills;
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

async function loadSpentCredits(accountId: string): Promise<number> {
  const result = await getPool().query(SPENT_CREDITS_SQL, [accountId]);
  const spent = readSpentCredits(result.rows[0]);
  if (!Number.isFinite(spent) || spent < 0) {
    throw new Error('credits: unreadable monthly spend');
  }
  return spent;
}

async function loadRefillCredits(accountId: string): Promise<number> {
  try {
    const result = await getPool().query(REFILL_CREDITS_SQL, [accountId, REFILL_REASON]);
    return readRefillCredits(result.rows[0]);
  } catch {
    // Sibling agent owns the refill rows; the table may not exist yet.
    // Absence reads as zero rather than failing the whole balance read.
    return 0;
  }
}

function error(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  // Unknown/absent tier falls back to the trial grant — the same pre-gate the
  // chat route and the verdict route use, so the guard's prototype-key path
  // can never be reached.
  const tier = isPlanTier(session.tier) ? session.tier : 'trial';

  let spent: number;
  try {
    spent = await loadSpentCredits(session.accountId);
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not check your AI credits');
  }

  const refills = await loadRefillCredits(session.accountId);
  const allowance = MONTHLY_GRANTS[tier] + refills;
  const remaining = allowance - spent;

  const payload: CreditsPayload = {
    tier,
    allowance,
    spent,
    remaining,
    warn: spent >= allowance * BUDGET_WARN_RATIO,
  };
  return NextResponse.json(payload, { status: 200 });
}
