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
// draft pointer + appends the ai_spend ledger row in ONE transaction. The old
// stubbed pipeline (and its `stub:true` detail marker) is gone.
//
// Honesty rules baked in:
// - No FK by design (same convention as interview_progress): a run row is keyed
//   by its own uuid and must never couple to the bot row's lifecycle.
// - Spend is recorded for every billable response, even when the response fails
//   parsing — the money moved and hiding it would lie to the K1/K3 readers. A
//   RouterError means the provider returned nothing billable, so it writes no
//   spend row.
// - Failure details carry coded error classes only — never provider text, key
//   bytes, or more than a bounded slice of the brief.
// - A run that cannot advance is written as `failed`; the phase write is never
//   swallowed into a fake success.

import { BUILDER_CALL_PARAMS, buildBuilderPrompt, chat, RouterError, toCredits } from '@corvus/ai';
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

export type BuilderJobError = 'bad_job' | 'builder_failed';

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
  | 'bot_gone'
  | 'spend_failed'
  | 'sync_failed'
  | 'builder_failed';

/** The (already validated) spec plus the metered facts of its generation. */
export interface BuilderArtifact {
  readonly specJson: BehaviorSpecV0;
  readonly model: string;
  readonly usdCost: number | null;
}

export interface BuilderWorkerDeps {
  setPhase(runId: string, phase: BuilderPhase, detail: unknown): Promise<void>;
  generate(job: BuilderJob): Promise<BuilderArtifact>;
  sync(job: BuilderJob, artifact: BuilderArtifact): Promise<{ version: number }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One row shape for the bot lookup, used by both steps so a missing/deleted bot
// is classified identically wherever it is detected.
const SELECT_BOT_SQL =
  'SELECT id, account_id FROM bots WHERE id = $1 AND deleted_at IS NULL LIMIT 1';

// The spend ledger write lives in ONE place, shared by generate (parse-failure
// path) and sync (inside its transaction). NULL cost means the provider
// reported none: the NULL is stored, never zeroed.
const INSERT_SPEND_SQL =
  'INSERT INTO ai_spend (account_id, model, usd_cost, credits, reason, ref_id) ' +
  'VALUES ($1, $2, $3, $4, $5, $6)';

const SPEND_REASON = 'burn:builder';

/** Coded failure carrying only a class, never provider or user text. */
class BuilderStepError extends Error {
  readonly code: BuilderFailureCode;
  constructor(code: BuilderFailureCode) {
    super(code);
    this.name = 'BuilderStepError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

// Advances one run through the phase machine, persisting each phase to the row.
// On any failure the row is written `failed` (best effort) with a coded error
// and the step it died in; a bad job can never succeed, so it never touches the
// database.
export async function runBuilderJob(
  deps: BuilderWorkerDeps,
  job: unknown,
): Promise<BuilderJobResult> {
  const valid = validateJob(job);
  if (!valid.ok) return { error: 'bad_job' };
  const { runId } = valid.value;

  let step: BuilderStep = 'generate';
  try {
    await deps.setPhase(runId, 'generating', {});
    const artifact = await deps.generate(valid.value);
    step = 'sync';
    await deps.setPhase(runId, 'syncing', {});
    const { version } = await deps.sync(valid.value, artifact);
    await deps.setPhase(runId, 'live', { version, model: artifact.model, stub: false });
    return { ok: true, phase: 'live' };
  } catch (error) {
    const code = classifyFailure(error);
    try {
      await deps.setPhase(runId, 'failed', { error: code, step });
    } catch {
      // The phase write itself failed; the boss handler still reports the job
      // failed so it retries. Swallowing here is safe because the caller below
      // returns the failure — this is not a fake success.
    }
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

async function insertSpend(
  db: BuilderQueryable,
  input: { accountId: string; model: string; usdCost: number | null; runId: string },
): Promise<void> {
  const credits = input.usdCost === null ? null : toCredits(input.usdCost);
  await db.query(INSERT_SPEND_SQL, [
    input.accountId,
    input.model,
    input.usdCost,
    credits,
    SPEND_REASON,
    input.runId,
  ]);
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

// Real deps: run ONE metered builder-lane call (generate), then persist the
// version + draft pointer + spend ledger row in one transaction (sync).
// `chatFn` is an injectable test seam; production passes the default router.
export function createBuilderDeps(pool: Pool, chatFn: typeof chat = chat): BuilderWorkerDeps {
  return {
    setPhase: async (runId, phase, detail) => {
      await pool.query(
        'UPDATE builder_runs SET phase = $2, detail = $3::jsonb, updated_at = now() WHERE id = $1',
        [runId, phase, JSON.stringify(detail ?? {})],
      );
    },
    generate: async (job) => {
      // RouterError propagates untouched: the provider returned nothing
      // billable, so there is no spend to record.
      const result = await chatFn({
        lane: 'builder',
        messages: [
          { role: 'system', content: buildBuilderPrompt() },
          { role: 'user', content: job.brief },
        ],
        maxTokens: BUILDER_CALL_PARAMS.maxTokens,
      });
      const parsed = parseBuilderOutput(result.text);
      if (!parsed.ok) {
        // The money already moved, so record it before surfacing the parse
        // error. Without a live bot row there is no account to bill, and
        // nothing is written (matching the missing-bot contract).
        const accountId = await loadBotAccount(pool, job.botId);
        if (accountId === null) throw new BuilderStepError('bot_gone');
        try {
          await insertSpend(pool, {
            accountId,
            model: result.model,
            usdCost: result.providerCostUsd,
            runId: job.runId,
          });
        } catch {
          throw new BuilderStepError('spend_failed');
        }
        throw new BuilderStepError(parsed.error);
      }
      return { specJson: parsed.specJson, model: result.model, usdCost: result.providerCostUsd };
    },
    sync: async (job, artifact) => {
      const client: BuilderClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const accountId = await loadBotAccount(client, job.botId);
        if (accountId === null) throw new BuilderStepError('bot_gone');
        // max+1 inside the transaction; a concurrent run for the same bot is
        // settled by the UNIQUE(bot_id, version) constraint (see limitations).
        const next = await client.query(
          'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM spec_versions WHERE bot_id = $1',
          [job.botId],
        );
        const version = readVersion(next.rows[0]);
        const inserted = await client.query(
          'INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state) ' +
            'VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING id',
          [
            job.botId,
            version,
            JSON.stringify(artifact.specJson),
            job.brief.slice(0, 280),
            `ai:${artifact.model}`,
            'draft',
          ],
        );
        const versionId = readInsertedId(inserted.rows[0]);
        // Pointer moves ONLY here, after the version row exists, in the same
        // transaction as the spend row: a spend failure rolls the pointer back.
        await client.query('UPDATE bots SET draft_spec_id = $2, updated_at = now() WHERE id = $1', [
          job.botId,
          versionId,
        ]);
        try {
          await insertSpend(client, {
            accountId,
            model: artifact.model,
            usdCost: artifact.usdCost,
            runId: job.runId,
          });
        } catch {
          throw new BuilderStepError('spend_failed');
        }
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

async function bootBuilderWorker(connectionString: string): Promise<BuilderWorkerHandle> {
  const boss = new PgBoss(connectionString);
  const pool = new Pool({ connectionString });
  // Bare listener: deploy-time wiring observes boss events; this keeps a
  // maintenance error from becoming an unhandled 'error' crash.
  boss.on('error', () => undefined);
  const deps = createBuilderDeps(pool);
  await boss.start();
  // perJobResults:true settles each job on its own outcome. A bad job can never
  // succeed -> deadletter (no retries wasted). A runtime failure -> 'failed'
  // takes the normal retry path.
  const workOptions = { perJobResults: true } as const;
  await boss.work<BuilderJob>(BUILDER_QUEUE, workOptions, async (jobs) => {
    const settled: JobResult[] = await Promise.all(
      jobs.map(async (job): Promise<JobResult> => {
        const result = await runBuilderJob(deps, job.data);
        if ('error' in result) {
          return {
            id: job.id,
            status: result.error === 'bad_job' ? 'deadletter' : 'failed',
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
export async function startBuilderWorker(connectionString: string): Promise<BuilderWorkerHandle> {
  if (runningHandle !== null) return runningHandle;
  if (bootingHandle !== null) return bootingHandle;
  bootingHandle = (async () => {
    const raw = await bootBuilderWorker(connectionString);
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
