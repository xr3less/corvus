// Pre-call budget enforcement + per-brief cost spans for the AI layer.
//
// Pattern provenance: a reimplementation, not a copy, of the llm-cost-guard
// pre-flight guard shape (MIT): the guard is consulted BEFORE a billable call
// is made and refuses when the projected spend would cross the monthly
// allowance, warning as the ceiling approaches. The span groups the builder's
// multi-attempt drafts for one brief so that brief's total is observable as a
// single number instead of scattered per-attempt costs.
//
// Deliberately dependency-free and DB-free: `getSpent` is injected by the
// caller, so the ledger read (and the account scope it owns) stays with the
// caller and this module stays pure and unit-testable. Refill reads go through
// the same injection idea via a module-level pool seam (`__setRefillPool`,
// test-only): production wires a pool once, tests inject a fake, and absence
// (no pool, missing table) reads as zero refills — never as a failure.

export type PlanTier = 'trial' | 'pro' | 'studio' | 'scale';

/**
 * Monthly credit allowance per plan tier — THE single config table (KI-020).
 * Credits are USD / USD_PER_CREDIT (see cost.ts); these values are product
 * config, not provider prices. 'trial' is the fallback when no tier is known.
 */
export const MONTHLY_GRANT_TRIAL = 100;
export const MONTHLY_GRANT_PRO = 2000;
export const MONTHLY_GRANT_STUDIO = 6000;
export const MONTHLY_GRANT_SCALE = 20000;

export const MONTHLY_GRANTS: Record<PlanTier, number> = {
  trial: MONTHLY_GRANT_TRIAL,
  pro: MONTHLY_GRANT_PRO,
  studio: MONTHLY_GRANT_STUDIO,
  scale: MONTHLY_GRANT_SCALE,
};

/**
 * True only for a key that is genuinely one of the plan tiers. It reads own
 * properties only, so a prototype member ('toString') or a future/unknown plan
 * never turns into an allowance — unknown tiers fall back to 'trial' at the
 * call site rather than silently widening a budget.
 */
export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MONTHLY_GRANTS, value);
}

/** Warn once the projected spend reaches this share of the allowance. */
export const BUDGET_WARN_RATIO = 0.8;

/** Ledger reason for refill packs (Docs/06 vocabulary, terms $5 / 1,000 / 90-day promise). */
export const REFILL_REASON = 'refill';

/** Refill packs extend the allowance for this many days (terms promise). */
export const REFILL_WINDOW_DAYS = 90;

/**
 * Active refill grants: SUM of `refill` rows within the window, scoped to the
 * account. Mirrors the credits route's REFILL_CREDITS_SQL — same table, same
 * reason, same window — so the budget gate and the balance read agree on what
 * "active refills" means.
 */
export const REFILL_CREDITS_SQL =
  'SELECT COALESCE(SUM(amount_cr), 0) AS refills FROM credit_ledger ' +
  "WHERE account_id = $1 AND reason = $2 AND created_at >= now() - interval '90 days'";

interface RefillQueryable {
  query(text: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

let refillPool: RefillQueryable | null = null;

/** Test-only seam (mirrors the webhook's __setPool): production wires a real pool, tests inject a fake. */
export function __setRefillPool(pool: RefillQueryable | null): void {
  refillPool = pool;
}

export function __resetRefillPool(): void {
  refillPool = null;
}

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

/**
 * Active refill allowance for one account: SUM of `credit_ledger` refill rows
 * within the last 90 days. Absence-tolerant by contract (the refill rows are a
 * sibling writer's scope and the table may not exist yet): anything unreadable —
 * no pool, missing table, null, garbage — reads as zero refills, never as a
 * failure. Only a genuine positive number widens the allowance.
 */
export async function refillAllowance(accountId: string): Promise<number> {
  if (typeof accountId !== 'string' || accountId.trim() === '') {
    throw new TypeError('refillAllowance: accountId must be a non-empty string');
  }
  if (refillPool === null) return 0;
  try {
    const result = await refillPool.query(REFILL_CREDITS_SQL, [accountId, REFILL_REASON]);
    return readRefillCredits(result.rows[0]);
  } catch {
    return 0;
  }
}

export interface CheckBudgetInput {
  readonly accountId: string;
  /** Estimated credits this call will cost (caller-supplied, pre-call). */
  readonly estimatedCredits: number;
  /** Injected ledger read: credits already spent this month. */
  readonly getSpent: () => Promise<number>;
  /** Plan tier used to resolve the default allowance. Defaults to 'trial'. */
  readonly tier?: PlanTier;
  /** Explicit allowance, overrides the tier lookup when present. */
  readonly allowance?: number;
  /** Warn threshold as a share of the allowance in [0, 1]. Defaults to 0.8. */
  readonly warnRatio?: number;
}

export interface BudgetAllowed {
  readonly ok: true;
  readonly warn: boolean;
  readonly spent: number;
  readonly projected: number;
  readonly allowance: number;
}

export interface BudgetBlocked {
  readonly ok: false;
  readonly reason: 'budget_exceeded';
  readonly spent: number;
  readonly projected: number;
  readonly allowance: number;
}

export type BudgetDecision = BudgetAllowed | BudgetBlocked;

function requireFiniteNonNegative(value: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`checkBudget: ${field} must be a finite non-negative number`);
  }
  return value;
}

function resolveAllowance(input: CheckBudgetInput): number {
  if (input.allowance !== undefined) {
    return requireFiniteNonNegative(input.allowance, 'allowance');
  }
  const tier = input.tier ?? 'trial';
  const allowance = MONTHLY_GRANTS[tier];
  if (allowance === undefined) {
    throw new TypeError(`checkBudget: unknown tier "${String(tier)}"`);
  }
  return allowance;
}

/**
 * Pre-call budget gate. Resolves `{ok: true, warn}` when the projected spend
 * (already-spent + this call's estimate) stays within the allowance
 * (monthly grant for the tier — or the explicit override — PLUS active refill
 * grants from the last 90 days), and `{ok: false, reason: 'budget_exceeded'}`
 * when it would cross it. A call landing exactly on the allowance is allowed;
 * one credit over is blocked. Invalid input and a failing/negative `getSpent()`
 * throw rather than degrade into a silent allow (a fake success at a billing
 * boundary is the one failure mode this guard exists to prevent). Refill reads
 * are absence-tolerant and contribute zero when unreadable.
 */
export async function checkBudget(input: CheckBudgetInput): Promise<BudgetDecision> {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('checkBudget: input must be an object');
  }
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : '';
  if (accountId === '') {
    throw new TypeError('checkBudget: accountId must be a non-empty string');
  }
  if (typeof input.getSpent !== 'function') {
    throw new TypeError('checkBudget: getSpent must be a function');
  }
  const estimatedCredits = requireFiniteNonNegative(input.estimatedCredits, 'estimatedCredits');
  const baseAllowance = resolveAllowance(input);
  let warnRatio = BUDGET_WARN_RATIO;
  if (input.warnRatio !== undefined) {
    warnRatio = requireFiniteNonNegative(input.warnRatio, 'warnRatio');
    if (warnRatio > 1) {
      throw new TypeError('checkBudget: warnRatio must be within [0, 1]');
    }
  }
  const spent = requireFiniteNonNegative(await input.getSpent(), 'getSpent() result');
  const allowance = baseAllowance + (await refillAllowance(accountId));
  const projected = spent + estimatedCredits;
  const base = { spent, projected, allowance };
  if (projected > allowance) {
    return { ok: false, reason: 'budget_exceeded', ...base };
  }
  return { ok: true, warn: projected >= allowance * warnRatio, ...base };
}

/** Immutable snapshot of what one brief has spent so far. */
export interface CostSpanSummary {
  readonly calls: number;
  readonly credits: number;
}

export interface CostSpan {
  /** Process-unique span id; correlation only, never a secret. */
  readonly id: string;
  /** Non-crypto hash of the brief text; correlation only. */
  readonly briefHash: string;
  calls: number;
  credits: number;
  addCall(credits: number): void;
  summary(): CostSpanSummary;
}

let spanCounter = 0;

/**
 * FNV-1a 32-bit hash of the brief, as 8-char zero-padded hex.
 *
 * Non-cryptographic by design (no new deps): it exists to group the attempts
 * of one brief, not to authenticate it. It walks UTF-16 code units, so it is
 * stable for a given JS string and is NOT a byte hash of a UTF-8 encoding.
 */
export function briefHash(brief: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < brief.length; index += 1) {
    hash ^= brief.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Open a cost span for one brief. The builder's retry attempts each call
 * `addCall(credits)`, so `summary()` reports the brief's total calls and
 * credits even when the draft took several tries.
 */
export function startSpan(brief: string): CostSpan {
  if (typeof brief !== 'string') {
    throw new TypeError('startSpan: brief must be a string');
  }
  spanCounter += 1;
  const span: CostSpan = {
    id: `span-${spanCounter}`,
    briefHash: briefHash(brief),
    calls: 0,
    credits: 0,
    addCall(credits: number): void {
      if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) {
        throw new TypeError('addCall: credits must be a finite non-negative number');
      }
      span.calls += 1;
      span.credits += credits;
    },
    summary(): CostSpanSummary {
      return { calls: span.calls, credits: span.credits };
    },
  };
  return span;
}
