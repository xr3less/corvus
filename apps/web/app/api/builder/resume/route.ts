// POST /api/builder/resume — resume a failed builder run as a FRESH audited run.
//
// Gate order mirrors builder/verdict: session 401 (fail-closed) → KI-033
// trial-clock 403 BEFORE body → 422 runId uuid (+ optional brief shape) → 404
// run ownership (same bots soft-delete exclusion as start/verdict, so a
// foreign, deleted, or unknown run reads as missing) → KI-033
// monthly-allowance 403 → 409 when there is nothing to resume.
//
// The source row is NEVER mutated: terminal (live/failed) rows are immutable.
// A FRESH builder_runs row carries the checkpoint forward under the additive
// keys owned by lib/builder/checkpoints.ts, and the pg-boss send reuses the
// frozen args VERBATIM with the NEW runId (never the old one). Enqueue failure
// flips only the fresh row to `failed`, exactly like start/verdict.
//
// No billing hook here: resume itself makes no model call. The monthly
// allowance is pre-authorized with the same checkBudget guard the verdict and
// chat routes use, and the gateway worker bills the fresh run under its own
// runId. The `attempt` counter is carried forward (+1) for timeline display
// only; the fresh run's billing lineage is its own row id.

import { NextResponse } from 'next/server';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import { checkBudget, isPlanTier, toCredits } from '@corvus/ai';
import { DatabaseNotConfiguredError, getPool, requireDatabaseUrl } from '../../../../lib/db/pool';
import {
  defaultSessionReader,
  type InterviewSession,
} from '../../../../lib/interview/session-bind';
import { isTrialExpired } from '../../../../lib/auth/session';
import { isPaidTier } from '../../../../lib/bots';
import {
  checkpointNotice,
  isRecord,
  readCheckpoint,
  writeCheckpoint,
} from '../../../../lib/builder/checkpoints';

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/chat/route.ts and builder/verdict).
export { __setPool } from '../../../../lib/db/pool';

export const BUILDER_QUEUE = 'builder';

// Locked wording (KI-033 SPEC, byte-level): the same sentence the chat route,
// builder/start, verdict and the dashboard banner carry.
const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

// Locked wording (KI-033 SPEC, byte-level): the SAME monthly-allowance refusal
// the chat and verdict routes write (trial branch byte-for-byte).
const TRIAL_BUDGET_MESSAGE =
  'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.';

function budgetRefusalMessage(tier: string | null | undefined, allowance: number): string {
  if (!isPlanTier(tier) || tier === 'trial') {
    return TRIAL_BUDGET_MESSAGE;
  }
  return `This month's ${allowance} AI credits are used up. Nothing is deleted.`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Builder brief bound (1..2000 chars), same clamp the verdict route applies.
const BRIEF_MAX = 2000;

// One builder call's worst-case output cost, mirroring the worker's own
// pre-call estimate (builder-runs.ts): BUILDER_CALL_PARAMS.maxTokens 6000 at
// the lane's most expensive route ($15 / 1M output tokens, lanes.ts). USD ->
// credits through the shared meter; this file states no credit count of its own.
const RESUME_CALL_CREDITS = toCredits((6000 / 1_000_000) * 15);

// Credits already spent this calendar month, scoped to the account. Identical
// arithmetic to the verdict and chat routes (ai_spend has no period column, so
// created_at is the period and the shared allowance is monthly).
const SPENT_CREDITS_SQL =
  'SELECT COALESCE(SUM(credits), 0) AS spent FROM ai_spend ' +
  "WHERE account_id = $1 AND created_at >= date_trunc('month', now())";

// --- Injectable seams (fail-closed, test-only writers) ---

export interface ResumeSession extends InterviewSession {
  trialEndsAt?: Date | string | null;
  tier?: string | null;
}

export interface ResumeSessionReader {
  getSession(req: Request): Promise<ResumeSession | null>;
}

let sessionReader: ResumeSessionReader = defaultSessionReader;

export function __setSessionReader(reader: ResumeSessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = defaultSessionReader;
}

export interface BuilderBoss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
}

function defaultBossFactory(): BuilderBoss {
  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data, options) => boss.send(name, data, options),
  };
}

let bossFactory: () => BuilderBoss = defaultBossFactory;

export function __setBossFactory(factory: () => BuilderBoss): void {
  bossFactory = factory;
}

export function __resetBossFactory(): void {
  bossFactory = defaultBossFactory;
}

// --- Handler ---

interface ResumeInput {
  runId?: unknown;
  brief?: unknown;
}

// A SUM the database could not express as a number is a billing-boundary read
// failure, so it surfaces as NaN and checkBudget throws on it. Returning 0
// instead would silently reset an exhausted month. Mirrors the verdict route's
// readSpentCredits.
function readSpentCredits(row: unknown): number {
  if (isRecord(row)) {
    const value = row.spent;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
  }
  return Number.NaN;
}

async function loadSpentCredits(accountId: string): Promise<number> {
  const result = await getPool().query(SPENT_CREDITS_SQL, [accountId]);
  return readSpentCredits(result.rows[0]);
}

export async function POST(req: Request): Promise<NextResponse> {
  let session: ResumeSession | null = null;
  try {
    session = await sessionReader.getSession(req);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const accountId = session.accountId;
  const tier = session.tier ?? null;

  // KI-033: the trial clock gates the WRITE, before the body check — a
  // malformed body must not be able to mask an expired trial as 422, and vice
  // versa. A paid tier bypasses the clock; a missing/unknown tier resolves to
  // the trial path (never to a bypass).
  if (!isPaidTier(tier) && isTrialExpired({ trial_ends_at: session.trialEndsAt })) {
    return NextResponse.json(
      { error: 'trial_expired', message: TRIAL_ENDED_MESSAGE },
      { status: 403 },
    );
  }

  let raw: ResumeInput = {};
  try {
    raw = (await req.json()) as ResumeInput;
  } catch {
    raw = {};
  }

  const runId = typeof raw.runId === 'string' ? raw.runId : '';
  if (!UUID_RE.test(runId)) {
    return NextResponse.json({ error: 'invalid run id' }, { status: 422 });
  }

  // Optional fallback brief (the approved brief): used ONLY when the source run
  // carries no checkpoint. Shape-checked here so 422 stays ahead of the reads.
  const fallbackBrief = typeof raw.brief === 'string' ? raw.brief : null;
  if (
    fallbackBrief !== null &&
    (fallbackBrief.trim().length === 0 || fallbackBrief.length > BRIEF_MAX)
  ) {
    return NextResponse.json({ error: 'invalid brief' }, { status: 422 });
  }

  // Source run + ownership in one read. The JOIN keeps the verdict/start
  // predicate: a run whose bot is missing, soft-deleted, or foreign yields no
  // row → the same 404 as unknown, so run ids stay unguessable.
  let source: Record<string, unknown> | null;
  try {
    const found = await getPool().query(
      'SELECT r.id, r.phase, r.detail, r.bot_id FROM builder_runs r ' +
        'JOIN bots b ON b.id = r.bot_id WHERE r.id = $1 AND b.account_id = $2 ' +
        'AND b.deleted_at IS NULL LIMIT 1',
      [runId, accountId],
    );
    const row: unknown = found.rows[0];
    source = isRecord(row) ? row : null;
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: 'database not configured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'could not resume build' }, { status: 500 });
  }
  if (!source) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  const botId = typeof source.bot_id === 'string' ? source.bot_id : '';
  const sourcePhase = typeof source.phase === 'string' ? source.phase : '';
  const checkpoint = readCheckpoint(source.detail);

  // KI-033, allowance: the fresh run will make billable builder calls, so it is
  // pre-authorized exactly as a chat turn is — same guard, same estimate shape,
  // same refusal code and sentence. It sits with the other pre-model gates
  // (after ownership, before any write): a refused request makes NO model call
  // and writes NO spend row and NO fresh run row.
  let budget: Awaited<ReturnType<typeof checkBudget>>;
  try {
    budget = await checkBudget({
      accountId,
      estimatedCredits: RESUME_CALL_CREDITS,
      getSpent: () => loadSpentCredits(accountId),
      // Unknown/absent tier falls back to the guard's own trial default — the
      // same isPlanTier pre-gate the verdict route uses.
      tier: isPlanTier(tier) ? tier : undefined,
    });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: 'database not configured' }, { status: 500 });
    }
    console.error('resume: cannot read the monthly allowance', error);
    return NextResponse.json({ error: 'could not check your AI credits' }, { status: 500 });
  }
  if (!budget.ok) {
    return NextResponse.json(
      {
        error: 'trial_budget_exceeded',
        message: budgetRefusalMessage(tier, budget.allowance),
      },
      { status: 403 },
    );
  }

  // 409: only a failed source can be resumed. Live rows keep running and
  // active rows are still owned by the worker — minting a fresh run from either
  // would fork one build into two. Terminal rows are never mutated either way.
  if (sourcePhase !== 'failed') {
    return NextResponse.json({ error: 'run_not_failed' }, { status: 409 });
  }

  // 409: one build per bot at a time. A second POST while the first fresh run
  // is still active is refused instead of enqueued, so a double-click (or a
  // double-POST retry) yields exactly ONE enqueue.
  try {
    const active = await getPool().query(
      "SELECT id FROM builder_runs WHERE bot_id = $1 AND phase IN ('queued', 'generating', 'syncing') LIMIT 1",
      [botId],
    );
    if (active.rows.length > 0) {
      return NextResponse.json({ error: 'build_in_progress' }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: 'could not resume build' }, { status: 500 });
  }

  // The checkpoint brief wins; the approved brief from the caller is the
  // fallback for runs killed before any checkpoint was written. Neither means
  // there is nothing to build from.
  const candidate =
    checkpoint.checkpointBrief !== null && checkpoint.checkpointBrief.length > 0
      ? checkpoint.checkpointBrief
      : (fallbackBrief ?? '');
  const brief = candidate.slice(0, BRIEF_MAX).trim();
  if (brief.length === 0) {
    return NextResponse.json({ error: 'invalid brief' }, { status: 422 });
  }

  // Owner-facing notice: the checkpoint sentence when a checkpoint backs the
  // fresh run, the unavailable sentence otherwise (Wave 3 copy freeze).
  const notice = checkpointNotice(source.detail);

  // Fresh-row detail: additive keys only, carried forward from the checkpoint.
  // `attempt` continues the display count; the fresh run's billing lineage is
  // its own new row id, so no ceiling is enforced here.
  const freshDetail = writeCheckpoint(
    {},
    {
      briefChars: brief.length,
      attempt: (checkpoint.attempt ?? 0) + 1,
      stepStartedAt: new Date().toISOString(),
      lastGoodPhase: checkpoint.lastGoodPhase,
      checkpointBrief: brief,
      error: null,
      provider: checkpoint.provider,
    },
  );

  // Fresh row first, job second — the row exists before the job does, exactly
  // like start/verdict. The source row is untouched by construction (no UPDATE
  // against it anywhere in this route).
  let newRunId: string;
  try {
    const inserted = await getPool().query<{ id: string }>(
      'INSERT INTO builder_runs (bot_id, detail) VALUES ($1, $2::jsonb) RETURNING id',
      [botId, JSON.stringify(freshDetail)],
    );
    const id = inserted.rows[0]?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'could not resume build' }, { status: 500 });
    }
    newRunId = id;
  } catch {
    return NextResponse.json({ error: 'could not resume build' }, { status: 500 });
  }

  let boss: BuilderBoss;
  try {
    boss = bossFactory();
  } catch (err) {
    await markEnqueueFailed(newRunId);
    const error =
      err instanceof DatabaseNotConfiguredError
        ? 'database not configured'
        : 'could not resume build';
    return NextResponse.json({ error }, { status: 500 });
  }
  try {
    await boss.start();
    await boss.createQueue(BUILDER_QUEUE);
    const jobId = await boss.send(
      BUILDER_QUEUE,
      { runId: newRunId, botId, brief },
      {
        singletonKey: newRunId,
        retryLimit: 3,
        retryDelay: 30,
        expireInSeconds: 3600,
        deleteAfterSeconds: 604800,
      },
    );
    if (!jobId) {
      await markEnqueueFailed(newRunId);
      return NextResponse.json({ error: 'could not resume build' }, { status: 500 });
    }
    return NextResponse.json(
      {
        runId: newRunId,
        phase: 'queued',
        resumedFrom: runId,
        notice,
        briefChars: brief.length,
      },
      { status: 200 },
    );
  } catch {
    await markEnqueueFailed(newRunId);
    return NextResponse.json({ error: 'could not resume build' }, { status: 500 });
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the outcome above stands; never mask it.
    }
  }
}

// The fresh row exists before the job does. If enqueueing fails the row would
// sit `queued` forever, so it is flipped to `failed` — the poll route then
// tells the truth instead of leaving a ghost run. Best-effort: a failed flip
// must not replace the caller-visible 500. The SOURCE row is never touched.
async function markEnqueueFailed(freshRunId: string): Promise<void> {
  try {
    await getPool().query(
      "UPDATE builder_runs SET phase = 'failed', detail = $2::jsonb, updated_at = now() WHERE id = $1",
      [freshRunId, JSON.stringify({ error: 'enqueue_failed' })],
    );
  } catch {
    // Caller still receives the generic 500.
  }
}
