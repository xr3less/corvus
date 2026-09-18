// Accounts tier resolver (KI-025): reads accounts.tier for the builder
// pre-call budget gate. A billing boundary fails toward the smaller trial
// allowance, never toward a crash or an over-allow — so unknown, missing,
// and error reads all resolve to null (the caller falls back to trial).

import { isPlanTier } from '@corvus/ai';
import type { BuilderTierResolver } from './builder-runs.js';

const SELECT_TIER_SQL = 'SELECT tier FROM accounts WHERE id = $1 LIMIT 1';

export interface TierQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createAccountsTierResolver(pool: TierQueryable): BuilderTierResolver {
  return async (accountId: string) => {
    let rows: unknown[];
    try {
      const result = await pool.query(SELECT_TIER_SQL, [accountId]);
      rows = result.rows;
    } catch {
      return null;
    }
    const row: unknown = rows[0];
    if (!isRecord(row)) return null;
    const tier: unknown = row['tier'];
    return isPlanTier(tier) ? tier : null;
  };
}
