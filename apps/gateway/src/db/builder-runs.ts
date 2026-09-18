// V1-7 async builder-run progress (the piece D-099 deferred as needing its own
// design): the `builder_runs` row, the pg-boss `builder` queue worker, and the
// honest phase machine queued -> generating -> syncing -> live|failed.
//
// Why the worker lives in this file: the task's write scope allowed exactly one
// new gateway module (this one) plus an append-only start.ts export, so the
// table, its repository write, and the queue worker ship together. The web
// routes own row creation + enqueue; this worker owns phase advancement.
//
// The build step is real now: `generate` runs ONE metered builder-lane call
// through the shared @corvus/ai router, parses the fenced spec JSON with the
// @corvus/spec validator, and `sync` writes the version row + moves the bot's
// draft pointer in ONE transaction. The old stubbed pipeline (and its
// `stub:true` detail marker) is gone.
//
// Resilience: one malformed model response no longer kills a run. The generate
// step retries a bad_model_json/bad_spec up to BUILDER_BILLABLE_CEILING (3
// total: initial + 1 retry + 1 repair); the last attempt carries a repair instruction
// plus a bounded slice of the previous raw output. Every attempt is billed and
// spend-recorded exactly as before — the retry changes how many calls a bad run
// makes, never how a call is charged. Exhausting the attempts writes `failed`
// with {error, step, attempts, rawPreview, spanCalls, spanCredits}; rawPreview
// is a bounded, internal-only debugging slice, never rendered to users, and the
// span pair is an in-memory observability summary of that one brief.
//
// Cost bound (seam H4): before the first chat() call of a generate step the
// account's month-to-date credits are read and the job's worst case
// (BUILDER_BILLABLE_CEILING × BUILDER_CALL_CREDITS) is pre-authorized through the
// shared budget guard. A job that would cross the monthly grant writes
// `failed`/budget_exceeded with attempts:0 and makes ZERO billable calls. The
// worker also creates its queue before work() (L4), mirroring the preflight
// worker.
//
// Honesty rules baked in:
// - No FK by design (same convention as interview_progress): a run row is keyed
//   by its own uuid and must never couple to the bot row's lifecycle.
// - D5: the ai_spend ledger row is written at generate time for EVERY billable
//   response — success and parse-failure alike — before sync's bot check and
//   transaction. The money moved when `chat()` returned; deferring the write
//   into sync's transaction lost the row whenever sync later failed. A
//   RouterError means the provider returned nothing billable, so it writes no
//   spend row. Without a live bot there is no account to attribute to.
// - D1: a bad job flips its pre-created run row to `failed`, so it never polls
//   `queued` forever.
// - D2: every phase write checks its affected row count; a 0-row write means the
//   run is gone and is reported as `run_gone`, never swallowed into a live.
// - D3: `sync` binds this runId to the version it minted (an internal
//   `detail._builder` marker, written in the same transaction). A pg-boss retry
//   reuses that version instead of calling the model again or minting twice.
// - Failure details carry coded error classes only — never provider text, key
//   bytes, or more than a bounded slice of the brief.
// - A run that cannot advance is written as `failed`; the phase write is never
//   swallowed into a fake success.

import {
  BUILDER_CALL_PARAMS,
  buildBuilderPrompt,
  chat,
  checkBudget,
  isPlanTier,
  recordSpend,
  RouterError,
  startSpan,
  toCredits,
  type PlanTier,
} from '@corvus/ai';
import { parseSpec, type BehaviorSpecV0 } from '@corvus/spec';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { PgBoss, type JobResult } from 'pg-boss';

export const BUILDER_QUEUE = 'builder';

// Terminal phases are live|failed; the UI stops polling on either.
export const BUILDER_PHASES = ['queued', 'generating', 'syncing', 'live', 'failed'] as const;
export type BuilderPhase = (typeof BUILDER_PHASES)[number];

// One row per builder run. `phase` is the state the progress UI polls; `detail`
// defaults to an empty object and carries the latest per-phase facts.
// `bot_id` has no FK (see header) and is indexed for per-bot history reads.
export const builderRuns = pgTable(
  'builder_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    botId: uuid('bot_id').notNull(),
    phase: text('phase').notNull().default('queued'),
    detail: jsonb('detail').$type<unknown>().notNull().default({}),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('builder_runs_bot_id_idx').on(t.botId)],
);

export type BuilderRun = typeof builderRuns.$inferSelect;
export type NewBuilderRun = typeof builderRuns.$inferInsert;

// --- Job contract v2 ---

export interface BuilderJob {
  runId: string;
  botId: string;
  /** The user's job brief; required (1..2000 chars) and fed to the lane. */
  brief: string;
}

export type BuilderJobError =
  'bad_job' | 'builder_failed' | 'budget_exceeded' | 'run_gone' | 'version_conflict';

export interface BuilderJobSuccess {
  ok: true;
  phase: 'live';
}

export interface BuilderJobFailure {
  error: BuilderJobError;
}

export type BuilderJobResult = BuilderJobSuccess | BuilderJobFailure;

/** The step a failure was raised in; written into the run's `failed` detail. */
export type BuilderStep = 'generate' | 'sync';

/**
 * Coded failure classes written into the run row. Classes only — a provider
 * message, a brief, or a key never reaches the detail.
 */
export type BuilderFailureCode =
  | 'router_failed'
  | 'bad_model_json'
  | 'bad_spec'
  | 'budget_exceeded'
  | 'bot_gone'
  | 'spend_failed'
  | 'sync_failed'
  | 'version_conflict'
  | 'run_gone'
  | 'builder_failed';

/** The (already validated) spec plus the metered facts of its generation. */
export interface BuilderArtifact {
  readonly specJson: BehaviorSpecV0;
  readonly model: string;
  readonly usdCost: number | null;
}

/** What a re-run needs to know about an existing run row. */
export interface BuilderRunState {
  /** The persisted phase, or null when the column holds an unknown value. */
  readonly phase: BuilderPhase | null;
  /** A version this run already committed in a previous attempt, or null. */
  readonly mintedVersion: number | null;
  /** The model that produced the minted version, or null. */
  readonly mintedModel: string | null;
}

export interface BuilderWorkerDeps {
  /** Persist a phase; resolves false when no run row matched (run gone). */
  setPhase(runId: string, phase: BuilderPhase, detail: unknown): Promise<boolean>;
  /** Read the run's phase plus any version it already minted, or null if gone. */
  readRun(runId: string): Promise<BuilderRunState | null>;
  generate(job: BuilderJob): Promise<BuilderArtifact>;
  sync(job: BuilderJob, artifact: BuilderArtifact): Promise<{ version: number }>;
}

/**
 * Resolves the account's plan tier for the pre-call allowance. Returns null or
 * undefined when the tier is unknown — the pre-check then falls back to the
 * trial allowance, which is exactly today's behaviour. Injected so KI-020's
 * tier wiring lands here without coupling this module to a billing schema that
 * does not exist yet (accounts has no `tier` column in the current migrations).
 */
export type BuilderTierResolver = (accountId: string) => Promise<PlanTier | null | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Internal run marker key inside builder_runs.detail. It binds a run to the
// version it minted so a retry cannot mint twice (D3).
const RUN_MARKER_KEY = '_builder';

// One row shape for the bot lookup, used by both steps so a missing/deleted bot
// is classified identically wherever it is detected.
const SELECT_BOT_SQL =
  'SELECT id, account_id FROM bots WHERE id = $1 AND deleted_at IS NULL LIMIT 1';

// The run row is read once at job start: a missing row is `run_gone`, and a
// present marker means a previous attempt already committed its sync (D2/D3).
const SELECT_RUN_SQL = 'SELECT phase, detail FROM builder_runs WHERE id = $1 LIMIT 1';

// Phase write. The CASE carries the D3 marker across a later `failed` write so a
// retry can still reuse the minted version; the terminal `live` write drops it,
// keeping the documented live detail exactly {version, model, stub}.
const SET_PHASE_SQL =
  'UPDATE builder_runs SET phase = $2, ' +
  "detail = $3::jsonb || CASE WHEN $2 <> 'live' AND builder_runs.detail ? '_builder' " +
  "THEN jsonb_build_object('_builder', builder_runs.detail -> '_builder') " +
  "ELSE '{}'::jsonb END, " +
  'updated_at = now() WHERE id = $1 RETURNING id';

// Written inside sync's transaction, atomically with the version it names.
const MARK_RUN_SQL =
  'UPDATE builder_runs SET detail = builder_runs.detail || $2::jsonb, updated_at = now() ' +
  'WHERE id = $1 RETURNING id';

const SELECT_NEXT_VERSION_SQL =
  'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM spec_versions WHERE bot_id = $1';

const INSERT_SPEC_VERSION_SQL =
  'INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state) ' +
  'VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING id';

const UPDATE_BOT_DRAFT_SQL = 'UPDATE bots SET draft_spec_id = $2, updated_at = now() WHERE id = $1';

const SPEND_REASON = 'burn:builder';

// The account's credit spend for the current calendar month. `ai_spend` has no
// period column, so `created_at` is the period, and the shared budget allowance
// (budget.ts) is monthly: the read is scoped to date_trunc('month', now()).
// SUM ignores NULL credits (the provider reported none); COALESCE keeps an empty
// month at 0 rather than NULL.
const SPENT_CREDITS_SQL =
  'SELECT COALESCE(SUM(credits), 0) AS spent FROM ai_spend ' +
  "WHERE account_id = $1 AND created_at >= date_trunc('month', now())";

// KI-020: billable attempts already recorded for THIS run. The ledger is the
// durable attempt record (reason + ref_id), so a pg-boss re-execution resumes
// from it rather than re-billing attempt 1. Scoped by both ref_id and reason so
// unrelated spend that happens to share the run id is never counted.
const COUNT_RUN_ATTEMPTS_SQL =
  'SELECT COUNT(*) AS attempts FROM ai_spend WHERE ref_id = $1 AND reason = $2';

// Billable-retry ceiling (KI-020): the maximum number of billable model calls
// ONE run may ever make across EVERY pg-boss execution of its job. The in-job
// validation retry (initial + 1 retry + 1 repair) is exactly this budget, so
// the ceiling and the in-job attempt count are the same number by product rule.
// A boss re-execution resumes from the attempts already recorded in the ledger
// instead of restarting at attempt 1, so an already-billed attempt is never
// re-billed (see COUNT_RUN_ATTEMPTS_SQL + generate()). Attempts beyond the
// ceiling fail honestly as `budget_exceeded`.
//
// Pattern provenance (ideas only, Apache-2.0): MukundaKatta/agent-budget's
// per-call cost cap plus adversarial-loop kill-switch after 3 identical
// failures + structured per-attempt events. Reimplemented, no code copied.
const BUILDER_BILLABLE_CEILING = 3;

// Pre-call budget estimate (seam H4). One builder call's output is capped at
// BUILDER_CALL_PARAMS.maxTokens, and the output term dominates its input cost;
// the most expensive route the builder lane can fall through to is wiro
// `sonnet-5`, budgeted at $15 / 1M output tokens (documented in lanes.ts and
// DECISIONS). That product bounds ONE call, and `toCredits` (cost.ts) converts
// USD -> credits, so this file never states a credit count of its own.
const BUILDER_MAX_OUTPUT_USD_PER_MTOKEN = 15;
const BUILDER_CALL_CREDITS = toCredits(
  (BUILDER_CALL_PARAMS.maxTokens / 1_000_000) * BUILDER_MAX_OUTPUT_USD_PER_MTOKEN,
);
// Worst case for the attempts a run has LEFT: remaining × BUILDER_CALL_CREDITS.
// Pre-authorized once per generate step; a boss-level retry re-runs the same
// check against only its remaining attempts before it can spend again.

// How much of the previous raw output the repair prompt may carry back.
const REPAIR_RAW_CHARS = 2000;
// Bounded, internal-only debugging slice kept in the failed detail. Provider
// text is never rendered to users; the coded error class stays the primary field.
const FAILURE_RAW_PREVIEW_CHARS = 500;
const REPAIR_INSTRUCTION =
  'Your previous output was not valid JSON against the spec. ' +
  'Here is what you returned (truncated):\n' +
  '<previous_output>\n';
const REPAIR_INSTRUCTION_TAIL =
  '\n</previous_output>\nOutput ONLY the corrected fenced JSON, no prose.';

/**
 * Coded failure carrying a class plus optional bounded internals. The `code` is
 * the primary, user-facing taxonomy; `detail` may add non-provider debug fields
 * (attempt count, a bounded raw-output preview) and is never rendered raw.
 */
class BuilderStepError extends Error {
  readonly code: BuilderFailureCode;
  readonly detail: Record<string, unknown>;
  constructor(code: BuilderFailureCode, detail: Record<string, unknown> = {}) {
    super(code);
    this.name = 'BuilderStepError';
    this.code = code;
    this.detail = detail;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBuilderPhase(value: unknown): value is BuilderPhase {
  return typeof value === 'string' && (BUILDER_PHASES as readonly string[]).includes(value);
}

/** Postgres unique-violation (SQLSTATE 23505) — the bot_id/version backstop. */
function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error['code'] === '23505';
}

function validateJob(job: unknown): { ok: true; value: BuilderJob } | { ok: false } {
  if (!isRecord(job)) return { ok: false };
  const runId = job['runId'];
  const botId = job['botId'];
  const brief = job['brief'];
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) return { ok: false };
  if (typeof botId !== 'string' || !UUID_RE.test(botId)) return { ok: false };
  if (typeof brief !== 'string' || brief.trim().length === 0 || brief.length > 2000) {
    return { ok: false };
  }
  return { ok: true, value: { runId, botId, brief } };
}

// D1: a malformed job can still name a real run row (e.g. a missing brief), so
// the run id is recovered on its own for the failed-write. No valid id means
// there is nothing to mark.
function extractRunId(job: unknown): string | null {
  if (!isRecord(job)) return null;
  const runId = job['runId'];
  return typeof runId === 'string' && UUID_RE.test(runId) ? runId : null;
}

function classifyFailure(error: unknown): BuilderFailureCode {
  if (error instanceof BuilderStepError) return error.code;
  if (error instanceof RouterError) return 'router_failed';
  return 'builder_failed';
}

/** First fenced block (```json, else ```, else the trimmed body). */
function extractFencedJson(text: string): string {
  const fencedJson = /```json\s*([\s\S]*?)```/i.exec(text);
  if (fencedJson && typeof fencedJson[1] === 'string') return fencedJson[1].trim();
  const fenced = /```\s*([\s\S]*?)```/.exec(text);
  if (fenced && typeof fenced[1] === 'string') return fenced[1].trim();
  return text.trim();
}

type ParseOutcome =
  { ok: true; specJson: BehaviorSpecV0 } | { ok: false; error: 'bad_model_json' | 'bad_spec' };

// The model's raw text is untrusted: JSON.parse owns structural validity and
// parseSpec (Zod) owns contract validity. Each failure maps to its own class.
function parseBuilderOutput(text: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(extractFencedJson(text)) as unknown;
  } catch {
    return { ok: false, error: 'bad_model_json' };
  }
  try {
    return { ok: true, specJson: parseSpec(raw) };
  } catch {
    return { ok: false, error: 'bad_spec' };
  }
}

// D9: the tenant brief is untrusted input and stays a single, delimited user
// turn. The repair attempt appends the previous raw output — bounded — inside
// its own block so the model can correct the exact response it produced.
function buildUserContent(brief: string, repairFrom?: string): string {
  const briefBlock = `<brief>\n${brief}\n</brief>`;
  if (repairFrom === undefined) return briefBlock;
  const previous = repairFrom.slice(0, REPAIR_RAW_CHARS);
  return (
    `${briefBlock}\n<repair>\n` +
    `${REPAIR_INSTRUCTION}${previous}${REPAIR_INSTRUCTION_TAIL}\n</repair>`
  );
}

// Advances one run through the phase machine, persisting each phase to the row.
// On any failure the row is written `failed` (best effort) with a coded error
// and the step it died in.
//
// Idempotency (D3): before spending a model call, the run is read. A run that
// already minted a version (a retry after a committed sync whose live write
// failed) is finished from that marker. A run that no longer exists is
// `run_gone` (D2). A bad job flips its pre-created row to `failed` (D1).
export async function runBuilderJob(
  deps: BuilderWorkerDeps,
  job: unknown,
): Promise<BuilderJobResult> {
  const valid = validateJob(job);
  if (!valid.ok) {
    const runId = extractRunId(job);
    if (runId !== null) {
      try {
        await deps.setPhase(runId, 'failed', { error: 'bad_job' });
      } catch {
        // Best effort: the boss handler still dead-letters the job below.
      }
    }
    return { error: 'bad_job' };
  }
  const { runId } = valid.value;

  let step: BuilderStep = 'generate';
  try {
    const prior = await deps.readRun(runId);
    if (prior === null) return { error: 'run_gone' };
    if (prior.phase === 'live') return { ok: true, phase: 'live' };
    if (prior.mintedVersion !== null) {
      const wrote = await deps.setPhase(runId, 'live', {
        version: prior.mintedVersion,
        model: prior.mintedModel ?? 'unknown',
        stub: false,
      });
      return wrote ? { ok: true, phase: 'live' } : { error: 'run_gone' };
    }

    const claimed = await deps.setPhase(runId, 'generating', {});
    if (!claimed) return { error: 'run_gone' };
    const artifact = await deps.generate(valid.value);
    step = 'sync';
    const syncing = await deps.setPhase(runId, 'syncing', {});
    if (!syncing) return { error: 'run_gone' };
    const { version } = await deps.sync(valid.value, artifact);
    const live = await deps.setPhase(runId, 'live', {
      version,
      model: artifact.model,
      stub: false,
    });
    if (!live) return { error: 'run_gone' };
    return { ok: true, phase: 'live' };
  } catch (error) {
    const code = classifyFailure(error);
    // `error`/`step` stay authoritative; a coded BuilderStepError may add
    // bounded internals (attempts, rawPreview) that are never rendered raw.
    const extra = error instanceof BuilderStepError ? error.detail : {};
    try {
      await deps.setPhase(runId, 'failed', { ...extra, error: code, step });
    } catch {
      // The phase write itself failed; the coded failure below still reports it
      // and the boss handler retries (or dead-letters). Not a fake success.
    }
    if (code === 'run_gone') return { error: 'run_gone' };
    if (code === 'version_conflict') return { error: 'version_conflict' };
    // Budget block is terminal for the period; the worker dead-letters it.
    if (code === 'budget_exceeded') return { error: 'budget_exceeded' };
    return { error: 'builder_failed' };
  }
}

// --- Real deps ---

interface BuilderQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface BuilderClient extends BuilderQueryable {
  release(): void;
}

async function loadBotAccount(db: BuilderQueryable, botId: string): Promise<string | null> {
  const found = await db.query(SELECT_BOT_SQL, [botId]);
  const row: unknown = found.rows[0];
  if (!isRecord(row)) return null;
  const accountId = row['account_id'];
  return typeof accountId === 'string' && accountId !== '' ? accountId : null;
}

// Postgres returns a numeric SUM as a string; a missing row (impossible for a
// COALESCE aggregate, but guarded) counts as zero spend. A non-numeric value is
// returned as NaN so checkBudget throws instead of silently allowing the call.
function readSpentCredits(row: unknown): number {
  if (isRecord(row)) {
    const value = row['spent'];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
  }
  return 0;
}

async function loadSpentCredits(db: BuilderQueryable, accountId: string): Promise<number> {
  const result = await db.query(SPENT_CREDITS_SQL, [accountId]);
  return readSpentCredits(result.rows[0]);
}

// Postgres returns COUNT(*) as a string (bigint). A malformed/absent count is a
// billing-boundary read failure, so it throws instead of silently becoming 0
// (a silent 0 would reset the ceiling and re-bill an already-billed attempt).
function readAttemptCount(row: unknown): number {
  if (isRecord(row)) {
    const value = row['attempts'];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }
  throw new BuilderStepError('builder_failed');
}

async function loadAttemptCount(db: BuilderQueryable, runId: string): Promise<number> {
  const result = await db.query(COUNT_RUN_ATTEMPTS_SQL, [runId, SPEND_REASON]);
  return readAttemptCount(result.rows[0]);
}

// D10: the canonical @corvus/ai ledger write (RETURNING id + row verification +
// input validation). A failure to persist a billable call is surfaced as the
// coded `spend_failed` class, never swallowed.
// KI-026: a unique violation (23505) on (ref_id, reason, attempt) means another
// execution already billed this attempt, so it is an idempotent skip — return
// normally to keep the global per-run total at or under the ceiling. Any other
// error still surfaces as `spend_failed`.
async function insertSpend(
  db: BuilderQueryable,
  input: {
    accountId: string;
    model: string;
    usdCost: number | null;
    runId: string;
    attempt: number;
  },
): Promise<void> {
  try {
    await recordSpend(db, {
      accountId: input.accountId,
      model: input.model,
      usdCost: input.usdCost,
      reason: SPEND_REASON,
      refId: input.runId,
      attempt: input.attempt,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw new BuilderStepError('spend_failed');
  }
}

function readRunState(row: unknown): BuilderRunState | null {
  if (!isRecord(row)) return null;
  const phase = isBuilderPhase(row['phase']) ? row['phase'] : null;
  const detail = isRecord(row['detail']) ? row['detail'] : {};
  const marker = isRecord(detail[RUN_MARKER_KEY]) ? detail[RUN_MARKER_KEY] : {};
  const version = marker['version'];
  const model = marker['model'];
  return {
    phase,
    mintedVersion:
      typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null,
    mintedModel: typeof model === 'string' && model !== '' ? model : null,
  };
}

function readVersion(row: unknown): number {
  if (isRecord(row)) {
    const version = row['version'];
    if (typeof version === 'number' && Number.isInteger(version) && version > 0) return version;
    if (typeof version === 'string' && /^\d+$/.test(version)) return Number(version);
  }
  throw new BuilderStepError('sync_failed');
}

function readInsertedId(row: unknown): string {
  if (!isRecord(row)) throw new BuilderStepError('sync_failed');
  const id = row['id'];
  if (typeof id !== 'string' || id === '') throw new BuilderStepError('sync_failed');
  return id;
}

// Real deps: run ONE metered builder-lane call (generate, which records the
// spend), then persist the version + draft pointer in one transaction (sync)
// and bind this run to the minted version.
// `chatFn` is an injectable test seam; production passes the default router.
// `getTier` is an optional account-tier resolver for the pre-check allowance;
// production passes none until a tier source exists, so the trial default holds.
export function createBuilderDeps(
  pool: Pool,
  chatFn: typeof chat = chat,
  getTier?: BuilderTierResolver,
): BuilderWorkerDeps {
  return {
    setPhase: async (runId, phase, detail) => {
      const result = await pool.query(SET_PHASE_SQL, [runId, phase, JSON.stringify(detail ?? {})]);
      return result.rows.length > 0;
    },
    readRun: async (runId) => {
      const found = await pool.query(SELECT_RUN_SQL, [runId]);
      return readRunState(found.rows[0]);
    },
    generate: async (job) => {
      // KI-020 billable-retry ceiling. The ledger is the durable record of
      // attempts already billed for this run; count them and spend only what is
      // left. A run that already exhausted its budget fails honestly as
      // budget_exceeded with ZERO chat calls, so a boss retry can never re-bill
      // an already-billed attempt. The ceiling is per RUN, not per execution.
      const billedSoFar = await loadAttemptCount(pool, job.runId);
      if (billedSoFar >= BUILDER_BILLABLE_CEILING) {
        throw new BuilderStepError('budget_exceeded', { attempts: 0 });
      }
      const remainingAttempts = BUILDER_BILLABLE_CEILING - billedSoFar;

      // Seam H4 pre-call budget gate. Refuse BEFORE the first billable call
      // when the remaining attempts' worst case would cross the account's
      // monthly grant. The grant is the account tier's allowance when a tier is
      // resolvable; otherwise it stays the trial allowance, exactly as before
      // KI-020. A blocked job writes failed/budget_exceeded with attempts:0 and
      // makes ZERO chat() calls; the worker dead-letters it.
      const accountId = await loadBotAccount(pool, job.botId);
      if (accountId !== null) {
        const resolvedTier = getTier === undefined ? undefined : await getTier(accountId);
        const decision = await checkBudget({
          accountId,
          estimatedCredits: remainingAttempts * BUILDER_CALL_CREDITS,
          getSpent: () => loadSpentCredits(pool, accountId),
          // Unknown/absent tier falls back to the guard's own trial default.
          tier: isPlanTier(resolvedTier) ? resolvedTier : undefined,
        });
        if (!decision.ok) {
          throw new BuilderStepError('budget_exceeded', { attempts: 0 });
        }
      }

      // One span per brief: every billable attempt folds its credits into this
      // in-memory summary, which rides the FAILED detail when the attempts are
      // exhausted. It never touches the live detail — that contract is fixed at
      // {version, model, stub:false}.
      const span = startSpan(job.brief);
      // A validation miss is retried in-job (initial + 1 retry + 1 repair). The
      // router itself already falls through its own lanes on transport errors;
      // a RouterError means nothing billable came back, so it propagates
      // untouched and costs no attempt here. Attempt numbers are GLOBAL to the
      // run: they continue from `billedSoFar`, so the repair pass is always the
      // run's final attempt, never a re-run of one already billed.
      let lastRaw = '';
      let lastError: 'bad_model_json' | 'bad_spec' = 'bad_model_json';
      for (let local = 1; local <= remainingAttempts; local += 1) {
        const attempt = billedSoFar + local;
        const result = await chatFn({
          lane: 'builder',
          messages: [
            { role: 'system', content: buildBuilderPrompt() },
            // D9: the tenant brief is untrusted input; the delimiters keep it a
            // single, bounded user turn (still capped at 2000 chars in
            // validateJob). The last attempt appends the repair block.
            {
              role: 'user',
              content: buildUserContent(
                job.brief,
                attempt === BUILDER_BILLABLE_CEILING ? lastRaw : undefined,
              ),
            },
          ],
          maxTokens: BUILDER_CALL_PARAMS.maxTokens,
        });
        // The call returned, so it is on the span whatever the provider
        // reported. NULL/odd cost still counts as a call, at 0 credits — the
        // span is observability, the ai_spend row is the ledger.
        const callCost = result.providerCostUsd;
        span.addCall(
          callCost !== null && Number.isFinite(callCost) && callCost >= 0 ? toCredits(callCost) : 0,
        );
        const parsed = parseBuilderOutput(result.text);
        // The money moved the moment chat() returned. Load the account the call
        // is attributed to; without a live bot row there is no account to bill.
        const callAccountId = await loadBotAccount(pool, job.botId);
        if (!parsed.ok) {
          lastRaw = result.text;
          lastError = parsed.error;
          if (callAccountId === null) throw new BuilderStepError('bot_gone');
          // Every attempt that returned is billable, parse failure included.
          await insertSpend(pool, {
            accountId: callAccountId,
            model: result.model,
            usdCost: result.providerCostUsd,
            runId: job.runId,
            attempt,
          });
          continue;
        }
        // D5: record the spend for a successful parse too, BEFORE sync's bot
        // check and transaction, so a later sync failure can never lose the
        // ledger row. No account -> nothing to attribute; sync surfaces bot_gone.
        if (callAccountId !== null) {
          await insertSpend(pool, {
            accountId: callAccountId,
            model: result.model,
            usdCost: result.providerCostUsd,
            runId: job.runId,
            attempt,
          });
        }
        return { specJson: parsed.specJson, model: result.model, usdCost: result.providerCostUsd };
      }
      // Every attempt left to this run returned unusable text. Keep the coded
      // class primary and add the run's total attempt count, a bounded
      // internal-only raw preview, and the brief's in-memory cost span.
      const summary = span.summary();
      throw new BuilderStepError(lastError, {
        attempts: billedSoFar + remainingAttempts,
        rawPreview: lastRaw.slice(0, FAILURE_RAW_PREVIEW_CHARS),
        spanCalls: summary.calls,
        spanCredits: summary.credits,
      });
    },
    sync: async (job, artifact) => {
      const client: BuilderClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const accountId = await loadBotAccount(client, job.botId);
        if (accountId === null) throw new BuilderStepError('bot_gone');
        // max+1 inside the transaction; a concurrent run for the same bot is
        // settled by the UNIQUE(bot_id, version) constraint (see limitations).
        const next = await client.query(SELECT_NEXT_VERSION_SQL, [job.botId]);
        const version = readVersion(next.rows[0]);
        let inserted: { rows: unknown[] };
        try {
          inserted = await client.query(INSERT_SPEC_VERSION_SQL, [
            job.botId,
            version,
            JSON.stringify(artifact.specJson),
            job.brief.slice(0, 280),
            `ai:${artifact.model}`,
            'draft',
          ]);
        } catch (error) {
          // M7: the bot_id/version UNIQUE backstop is a distinct, retryable
          // signal, not the generic sync_failed.
          if (isUniqueViolation(error)) throw new BuilderStepError('version_conflict');
          throw error;
        }
        const versionId = readInsertedId(inserted.rows[0]);
        // Pointer moves ONLY here, after the version row exists, in the same
        // transaction that binds the run to it.
        await client.query(UPDATE_BOT_DRAFT_SQL, [job.botId, versionId]);
        // D3: bind this runId to the minted version atomically. A pg-boss retry
        // reads this marker and reuses the version instead of minting again.
        const marked = await client.query(MARK_RUN_SQL, [
          job.runId,
          JSON.stringify({ [RUN_MARKER_KEY]: { version, model: artifact.model } }),
        ]);
        if (marked.rows.length === 0) throw new BuilderStepError('run_gone');
        await client.query('COMMIT');
        return { version };
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Rollback is best-effort; the connection is released below and the
          // coded failure is what the caller sees.
        }
        throw error instanceof BuilderStepError ? error : new BuilderStepError('sync_failed');
      } finally {
        client.release();
      }
    },
  };
}

// --- Worker lifecycle (one worker per process, mirrors the preflight worker) ---

export interface BuilderWorkerHandle {
  stop(): Promise<void>;
}

let runningHandle: BuilderWorkerHandle | null = null;
let bootingHandle: Promise<BuilderWorkerHandle> | null = null;

export function isBuilderWorkerRunning(): boolean {
  return runningHandle !== null || bootingHandle !== null;
}

async function bootBuilderWorker(
  connectionString: string,
  getTier?: BuilderTierResolver,
): Promise<BuilderWorkerHandle> {
  const boss = new PgBoss(connectionString);
  const pool = new Pool({ connectionString });
  // Bare listener: deploy-time wiring observes boss events; this keeps a
  // maintenance error from becoming an unhandled 'error' crash.
  boss.on('error', () => undefined);
  const deps = createBuilderDeps(pool, chat, getTier);
  await boss.start();
  // L4: pg-boss v12 does not auto-create a queue, so a worker must create it
  // before work() or jobs sent earlier are dropped (the web senders already do
  // this on their side). Idempotent; mirrors the preflight worker fix.
  await boss.createQueue(BUILDER_QUEUE);
  // perJobResults:true settles each job on its own outcome. A bad job can never
  // succeed, and a run whose row is gone can never be advanced -> deadletter
  // (no retries wasted). A runtime failure -> 'failed' takes the normal retry
  // path (a version_conflict is retryable by design).
  const workOptions = { perJobResults: true } as const;
  await boss.work<BuilderJob>(BUILDER_QUEUE, workOptions, async (jobs) => {
    const settled: JobResult[] = await Promise.all(
      jobs.map(async (job): Promise<JobResult> => {
        const result = await runBuilderJob(deps, job.data);
        if ('error' in result) {
          return {
            id: job.id,
            status:
              result.error === 'bad_job' ||
              result.error === 'run_gone' ||
              result.error === 'budget_exceeded'
                ? 'deadletter'
                : 'failed',
            output: result,
          };
        }
        return { id: job.id, status: 'completed', output: result };
      }),
    );
    return settled;
  });
  return {
    stop: async () => {
      await boss.stop();
      await pool.end();
    },
  };
}

// Idempotent by design: a single call, a defensive double call, or a racing
// pair still yields exactly one worker.
export async function startBuilderWorker(
  connectionString: string,
  getTier?: BuilderTierResolver,
): Promise<BuilderWorkerHandle> {
  if (runningHandle !== null) return runningHandle;
  if (bootingHandle !== null) return bootingHandle;
  bootingHandle = (async () => {
    const raw = await bootBuilderWorker(connectionString, getTier);
    const handle: BuilderWorkerHandle = {
      stop: async () => {
        // Clear the singleton before awaiting the raw stop so a restart during
        // shutdown still sees a clean slot.
        runningHandle = null;
        await raw.stop();
      },
    };
    runningHandle = handle;
    return handle;
  })();
  try {
    return await bootingHandle;
  } finally {
    // Cleared on success AND failure: on success `runningHandle` owns the
    // singleton; on failure clearing lets a later call retry.
    bootingHandle = null;
  }
}
