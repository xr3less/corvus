// SHARED HOME: @corvus/ai — moved verbatim from apps/web/lib/ai/cost.ts.
// The web copy is now a re-export shim.
//
// Live-cost meter for the AI router (D-013/D-021/D-032).
//
// Cost always comes from the provider-reported response total (`usage.cost`
// on OpenRouter-style bodies), never from token math. A NULL cost means the
// provider reported none — callers must store the NULL, never zero it.

export const USD_PER_CREDIT = 0.005;

export function toCredits(usdCost: number): number {
  return usdCost / USD_PER_CREDIT;
}

function firstFiniteNumber(values: readonly unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

/** Provider-reported total cost in USD, or null when the body carries none. */
export function extractCost(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const root = body as Record<string, unknown>;
  const usage = root.usage;
  if (typeof usage === 'object' && usage !== null) {
    const nested = usage as Record<string, unknown>;
    const direct = firstFiniteNumber([nested.cost, nested.totalcost]);
    if (direct !== null) {
      return direct;
    }
  }
  return firstFiniteNumber([root.totalcost]);
}

export interface SpendPool {
  query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface RecordSpendInput {
  accountId: string;
  model: string;
  usdCost: number | null;
  reason: string;
  refId?: string;
  /** KI-026: run-global billable attempt number (integer >= 1). Absent means NULL (chat path). */
  attempt?: number | null;
}

export class SpendError extends Error {
  readonly code = 'spend_error';
  constructor(message: string) {
    super(message);
    this.name = 'SpendError';
  }
}

const INSERT_SPEND_SQL = `INSERT INTO ai_spend (account_id, model, usd_cost, credits, reason, ref_id, attempt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`;

/**
 * Append-only ledger write. Billing must never silently drop, so every
 * invalid input and every missing RETURNING id throws `SpendError`.
 */
export async function recordSpend(pool: SpendPool, input: RecordSpendInput): Promise<string> {
  if (!input || typeof input !== 'object') {
    throw new SpendError('recordSpend: input must be an object');
  }
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : '';
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (accountId === '') {
    throw new SpendError('recordSpend: accountId must be a non-empty string');
  }
  if (model === '') {
    throw new SpendError('recordSpend: model must be a non-empty string');
  }
  if (reason === '') {
    throw new SpendError('recordSpend: reason must be a non-empty string');
  }
  const { usdCost } = input;
  if (
    usdCost !== null &&
    (typeof usdCost !== 'number' || !Number.isFinite(usdCost) || usdCost < 0)
  ) {
    throw new SpendError('recordSpend: usdCost must be null or a finite non-negative number');
  }
  const credits = usdCost === null ? null : toCredits(usdCost);
  const attempt = input.attempt ?? null;
  if (attempt !== null && (!Number.isInteger(attempt) || attempt < 1)) {
    throw new SpendError('recordSpend: attempt must be an integer >= 1 when present');
  }
  const result = await pool.query(INSERT_SPEND_SQL, [
    accountId,
    model,
    usdCost,
    credits,
    reason,
    input.refId ?? null,
    attempt,
  ]);
  const firstRow = Array.isArray(result.rows) ? result.rows[0] : undefined;
  const id =
    typeof firstRow === 'object' && firstRow !== null
      ? (firstRow as { id?: unknown }).id
      : undefined;
  if (typeof id !== 'string' || id === '') {
    throw new SpendError('recordSpend: database did not return a spend id');
  }
  return id;
}
