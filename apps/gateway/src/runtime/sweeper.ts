// Wave E4: sleep/wake sweeper — trial-expiry reconcile + interval driver.
//
// Parks idle bots and wakes them on demand:
// - live bots on an unpaid tier whose trial clock expired more than the grace
//   window ago (default 24h) transition to status='sleeping';
// - sleeping bots whose tier is now paid (and that still have a prod spec and
//   a real token) transition back to status='live'. Wake is a DB flip only —
//   pickup rides the existing boot reader, which already filters to live, so
//   no gateway-notify plumbing is needed.
//
// Fail-open is deliberate (mirrors apps/web/lib/trial.ts): a null, missing,
// or unparseable trial clock never sleeps a bot — a corrupt value must never
// become a lockout. Unknown tiers count as unpaid for sleep but never as paid
// for wake, so a corrupt tier can park nothing it should not and wake nothing
// it should not.
//
// Pure core (decideSweep/reconcileSweep) has no I/O and is unit-tested;
// startSweeper adds the raw-pg pool driver on the TEMPBAN_POLL_MS interval
// idiom (one setInterval, guarded unref, { stop } handle). Sleep destroys the
// in-memory client through the gateway's existing removeBot; wake touches no
// client. Secret policy: ids and counts only in logs, never tokens or
// connection text; token presence is checked by cipher length (placeholder
// ciphers are zero/one-byte, same rule as the boot reader).

export const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

export const SWEEPER_POLL_MS = 60 * 1000;

export const SWEEP_CANDIDATES_SQL =
  'SELECT b.id AS "id", b.status AS "status", a.tier AS "tier", ' +
  'a.trial_ends_at AS "trialEndsAt", ' +
  '(b.prod_spec_id IS NOT NULL) AS "hasProdSpec", ' +
  '(octet_length(b.token_cipher) > 1) AS "hasToken" ' +
  'FROM bots b JOIN accounts a ON a.id = b.account_id ' +
  "WHERE b.deleted_at IS NULL AND b.status IN ('live', 'sleeping') " +
  'ORDER BY b.created_at ASC, b.id ASC';

export const SWEEP_SLEEP_SQL =
  "UPDATE bots SET status = 'sleeping', updated_at = now() WHERE id = $1 AND status = 'live'";

export const SWEEP_WAKE_SQL =
  "UPDATE bots SET status = 'live', updated_at = now() WHERE id = $1 AND status = 'sleeping'";

export interface SweeperRow {
  id: string;
  status: string;
  tier: string | null;
  trialEndsAt: Date | string | null;
  hasProdSpec: boolean;
  hasToken: boolean;
}

export type SweeperDecision = 'sleep' | 'wake' | 'keep';

export interface SweepDecisions {
  sleep: string[];
  wake: string[];
}

/** Paid vocabulary mirrors the billing tables (trial | pro | studio). */
export function isPaidTier(tier: string | null | undefined): boolean {
  return tier === 'pro' || tier === 'studio';
}

/**
 * Trial-clock reader with fail-open semantics: null/missing/unparseable
 * returns null (never sleep), otherwise the expiry epoch-ms. Accepts both
 * the pg Date form and the JSON ISO-string form.
 */
export function parseSweepExpiryMs(trialEndsAt: Date | string | null | undefined): number | null {
  if (trialEndsAt === null || trialEndsAt === undefined || trialEndsAt === '') {
    return null;
  }
  const ms = trialEndsAt instanceof Date ? trialEndsAt.getTime() : Date.parse(trialEndsAt);
  return Number.isFinite(ms) ? ms : null;
}

export function decideSweep(
  row: SweeperRow,
  nowMs: number,
  graceMs: number = SWEEP_GRACE_MS,
): SweeperDecision {
  if (row.id.length === 0) {
    return 'keep';
  }
  if (row.status === 'live' && !isPaidTier(row.tier)) {
    const expiryMs = parseSweepExpiryMs(row.trialEndsAt);
    if (expiryMs !== null && expiryMs + graceMs <= nowMs) {
      return 'sleep';
    }
    return 'keep';
  }
  if (
    row.status === 'sleeping' &&
    isPaidTier(row.tier) &&
    row.hasProdSpec === true &&
    row.hasToken === true
  ) {
    return 'wake';
  }
  return 'keep';
}

export function reconcileSweep(
  rows: SweeperRow[],
  nowMs: number,
  graceMs: number = SWEEP_GRACE_MS,
): SweepDecisions {
  const sleep: string[] = [];
  const wake: string[] = [];
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id.length === 0) {
      continue;
    }
    const decision = decideSweep(row, nowMs, graceMs);
    if (decision === 'sleep') {
      sleep.push(row.id);
    } else if (decision === 'wake') {
      wake.push(row.id);
    }
  }
  return { sleep, wake };
}

// Minimal structural surfaces (same convention as the store/boot layers): the
// real pg Pool and the real Gateway satisfy these without an import; tests
// hand in fakes. The gateway target is narrowed to removeBot on purpose —
// sleep destroys the client through the existing primitive, wake needs none.
export interface SweeperPool {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface SweeperTarget {
  removeBot(id: string): Promise<void>;
}

export interface SweeperLogRecord {
  level: 'info' | 'error';
  event: string;
  botId: string;
  reason?: string;
}

export interface SweeperLogger {
  info(record: SweeperLogRecord): void;
  error(record: SweeperLogRecord): void;
}

export interface StartSweeperOptions {
  graceMs?: number;
  intervalMs?: number;
  now?: () => number;
}

export interface SweeperHandle {
  stop(): void;
  /** On-demand reconcile (the "wake on demand" entry); also the test seam. */
  sweepNow(): Promise<SweepDecisions>;
}

export function startSweeper(
  pool: SweeperPool,
  target: SweeperTarget,
  logger: SweeperLogger,
  opts: StartSweeperOptions = {},
): SweeperHandle {
  const graceMs = opts.graceMs ?? SWEEP_GRACE_MS;
  const intervalMs = opts.intervalMs ?? SWEEPER_POLL_MS;
  const now = opts.now ?? Date.now;
  let stopped = false;

  async function sweepNow(): Promise<SweepDecisions> {
    let rows: SweeperRow[];
    try {
      const result = await pool.query<SweeperRow>(SWEEP_CANDIDATES_SQL);
      rows = result.rows;
    } catch {
      // No error text — it may carry the connection URL.
      logger.error({ level: 'error', event: 'sweeper-read-failed', botId: 'system' });
      return { sleep: [], wake: [] };
    }
    const { sleep, wake } = reconcileSweep(rows, now(), graceMs);
    const slept: string[] = [];
    for (const id of sleep) {
      try {
        // Destroy first, flip second: a failed flip is retried on the next
        // tick (status is still live), while a flipped-but-live bot would
        // never be retried. removeBot on an already-removed id is a harmless
        // unknown-bot log line inside the gateway.
        await target.removeBot(id);
        await pool.query(SWEEP_SLEEP_SQL, [id]);
        slept.push(id);
      } catch {
        logger.error({ level: 'error', event: 'sweeper-sleep-failed', botId: id });
      }
    }
    const woken: string[] = [];
    for (const id of wake) {
      try {
        await pool.query(SWEEP_WAKE_SQL, [id]);
        woken.push(id);
      } catch {
        logger.error({ level: 'error', event: 'sweeper-wake-failed', botId: id });
      }
    }
    // Counts only — ids stay out of the summary line.
    logger.info({
      level: 'info',
      event: 'sweeper-tick',
      botId: 'system',
      reason: `slept=${slept.length} woken=${woken.length}`,
    });
    return { sleep: slept, wake: woken };
  }

  const timer = setInterval(() => {
    if (!stopped) {
      void sweepNow().catch(() => undefined);
    }
  }, intervalMs);
  // Never hold the process open for the sweep alone (same idiom as the
  // tempban poll). Guarded: vitest fake-timer handles may lack unref.
  try {
    const maybeUnref = timer as unknown as { unref?: () => void };
    if (typeof maybeUnref.unref === 'function') {
      maybeUnref.unref();
    }
  } catch {
    // Ignore — stop() still halts the loop.
  }
  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
    sweepNow,
  };
}
