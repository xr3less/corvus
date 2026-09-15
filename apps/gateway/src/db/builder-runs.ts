// V1-7 async builder-run progress (the piece D-099 deferred as needing its own
// design): the `builder_runs` row, the pg-boss `builder` queue worker, and the
// honest phase machine queued -> generating -> syncing -> live|failed.
//
// Why the worker lives in this file: the task's write scope allowed exactly one
// new gateway module (this one) plus an append-only start.ts export, so the
// table, its repository write, and the queue worker ship together. The web
// routes own row creation + enqueue; this worker owns phase advancement.
//
// Honesty rules baked in:
// - No FK by design (same convention as interview_progress): a run row is keyed
//   by its own uuid and must never couple to the bot row's lifecycle.
// - The real model/build call is a follow-up. The default generate/sync steps
//   are explicit stubs, and every non-failed phase detail carries `stub: true`
//   plus a plain note, so no reader can mistake a stub run for a real build
//   (LESSONS 10.6: a hand-authored row self-identifies in the data).
// - A run that cannot advance is written as `failed`; the phase write is never
//   swallowed into a fake success.

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

// --- Job contract ---

export interface BuilderJob {
  runId: string;
  botId: string;
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

export interface BuilderWorkerDeps {
  setPhase(runId: string, phase: BuilderPhase, detail: unknown): Promise<void>;
  generate(job: BuilderJob): Promise<void>;
  sync(job: BuilderJob): Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-phase details are deliberately explicit about the stub, so a run row can
// never be read as evidence that a real build happened.
const STUB_DETAILS = {
  generating: {
    stub: true,
    note: 'builder run started — the model/build step is not wired yet',
  },
  syncing: {
    stub: true,
    note: 'nothing to sync yet — no build output was produced',
  },
  live: {
    stub: true,
    note: 'pipeline stub completed — no artifact was produced',
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateJob(job: unknown): { ok: true; value: BuilderJob } | { ok: false } {
  if (!isRecord(job)) return { ok: false };
  const runId = job['runId'];
  const botId = job['botId'];
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) return { ok: false };
  if (typeof botId !== 'string' || !UUID_RE.test(botId)) return { ok: false };
  return { ok: true, value: { runId, botId } };
}

// Advances one run through the phase machine, persisting each phase to the row.
// On any failure the row is written `failed` (best effort) and a coded error is
// returned; a bad job can never succeed, so it never touches the database.
export async function runBuilderJob(
  deps: BuilderWorkerDeps,
  job: unknown,
): Promise<BuilderJobResult> {
  const valid = validateJob(job);
  if (!valid.ok) return { error: 'bad_job' };
  const { runId, botId } = valid.value;

  try {
    await deps.setPhase(runId, 'generating', STUB_DETAILS.generating);
    await deps.generate({ runId, botId });
    await deps.setPhase(runId, 'syncing', STUB_DETAILS.syncing);
    await deps.sync({ runId, botId });
    await deps.setPhase(runId, 'live', STUB_DETAILS.live);
    return { ok: true, phase: 'live' };
  } catch {
    try {
      await deps.setPhase(runId, 'failed', { error: 'builder_failed' });
    } catch {
      // The phase write itself failed; the boss handler still reports the job
      // failed so it retries. Swallowing here is safe because the caller below
      // returns the failure — this is not a fake success.
    }
    return { error: 'builder_failed' };
  }
}

// Real deps: persist phases to Postgres, and keep the build/sync steps as
// explicit no-op stubs until the model call is wired (follow-up).
export function createBuilderDeps(pool: Pool): BuilderWorkerDeps {
  return {
    setPhase: async (runId, phase, detail) => {
      await pool.query(
        'UPDATE builder_runs SET phase = $2, detail = $3::jsonb, updated_at = now() WHERE id = $1',
        [runId, phase, JSON.stringify(detail ?? {})],
      );
    },
    generate: async () => {
      // Stub: the real router/model call is a follow-up. Records no fake work.
    },
    sync: async () => {
      // Stub: there is no artifact to sync yet.
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
