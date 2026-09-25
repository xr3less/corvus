import type { Pool, PoolClient } from 'pg';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import { parseSpec } from '@corvus/spec';
import {
  getPool,
  mapDbError,
  requireDatabaseUrl,
  __setPool as setSharedPool,
} from '../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../lib/interview/session-bind';
import { getDefaultProgressStore } from '../../../../lib/interview/progress-store';
import {
  checkOrder,
  isQuestionId,
  nextQuestion,
  validateAnswer,
  type QuestionId,
} from '../../../../lib/interview/tree';

export interface InterviewSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<InterviewSession | null>;
}

// Production default is the real getSession bind (session-bind.ts);
// closedReader is the test-reset state only.
const closedReader: SessionReader = {
  getSession: async () => null,
};

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = closedReader;
}

// Pool lives in lib/db/pool (single shared helper, V1-2). This re-export
// keeps the historical __setPool injection name working by delegating.
export function __setPool(pool: Pool): void {
  setSharedPool(pool);
}

export const BUILDER_QUEUE = 'builder';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

// POST /api/interview/answer { interviewId, questionId, answer } ->
//   200 { nextQuestion } while questions remain, or
//   200 { done: true, draftSpecId, version } once the tree is complete.
// Ownership failures return 404 (never 403-with-existence-leak); out-of-order
// questionIds return 422. On done, spec_versions v1 is inserted and
// bots.draft_spec_id is pointed at it in a single transaction.
export async function POST(req: Request): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(422, 'body must be JSON');
  }
  const parsed = (body ?? {}) as { interviewId?: unknown; questionId?: unknown; answer?: unknown };

  if (typeof parsed.interviewId !== 'string' || !UUID_RE.test(parsed.interviewId)) {
    // Malformed ids are indistinguishable from foreign ones: 404, no leak.
    return error(404, 'not found');
  }
  const interviewId: string = parsed.interviewId;

  if (!isQuestionId(parsed.questionId)) {
    return error(422, 'unknown questionId');
  }
  const questionId: QuestionId = parsed.questionId;

  const answer = validateAnswer(parsed.answer);
  if (!answer.ok) {
    return error(422, answer.error);
  }

  const pool = getPool();
  try {
    const owned = await pool.query<{ id: string }>(
      'SELECT id FROM bots WHERE id = $1 AND account_id = $2',
      [interviewId, session.accountId],
    );
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not record answer');
  }

  const progress = getDefaultProgressStore();
  let answered: QuestionId[];
  try {
    answered = await progress.answeredIdsFor(interviewId);
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not record answer');
  }
  const order = checkOrder(answered, questionId);
  if (!order.ok) {
    return error(422, 'question out of order', { expected: order.expected });
  }
  try {
    await progress.record(interviewId, questionId, answer.value);
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not record answer');
  }

  const next = nextQuestion(questionId);
  if (next !== null) {
    return Response.json({ nextQuestion: next }, { status: 200 });
  }

  // Done: mint spec_versions v1. The envelope mirrors createDraft() from
  // @corvus/spec ({ version: 1, behaviors: [] }) with the interview answers
  // recorded as opaque behaviors entries (behaviors stay opaque in V1-1).
  // Guarded by the REAL parseSpec boundary validator (never an inline copy).
  let entries: { questionId: QuestionId; answer: string }[];
  try {
    entries = await progress.answeredFor(interviewId);
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not mint draft spec');
  }
  const spec = {
    version: 1,
    behaviors: entries.map((entry) => ({ question: entry.questionId, answer: entry.answer })),
  };
  try {
    parseSpec(spec);
  } catch {
    return error(500, 'could not mint draft spec');
  }
  const author = `owner:${session.discordId}`;

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not mint draft spec');
  }
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO spec_versions (bot_id, version, spec, diff_summary, author, state)
       VALUES ($1, 1, $2::jsonb, '', $3, 'draft')
       RETURNING id`,
      [interviewId, JSON.stringify(spec), author],
    );
    const draftSpecId: string = inserted.rows[0].id;
    await client.query('UPDATE bots SET draft_spec_id = $1, updated_at = now() WHERE id = $2', [
      draftSpecId,
      interviewId,
    ]);
    await client.query('COMMIT');
    // Done-mint deletes the durable progress row (V1-2): the interview is
    // complete, so the row is stale. Best-effort — a failed delete must not
    // fail the mint; the row expires on its own (~24h) and the
    // UNIQUE(bot_id, version) backstop below stays authoritative either way.
    await progress.reset(interviewId).catch(() => undefined);
    const queued = await enqueueInterviewRun(interviewId, entries);
    if (queued.ok) {
      return Response.json(
        { done: true, draftSpecId, version: 1, runId: queued.runId, phase: 'queued' },
        { status: 200 },
      );
    }
    // Best-effort enqueue: the draft-spec write above is authoritative, so an
    // enqueue failure still answers done with the minted spec and names the
    // enqueue failure honestly (enqueue_failed) for BuilderProgress wiring.
    return Response.json(
      { done: true, draftSpecId, version: 1, enqueue: 'enqueue_failed' },
      { status: 200 },
    );
  } catch (queryError) {
    await client.query('ROLLBACK').catch(() => undefined);
    const mapped = mapDbError(queryError);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    // A second completion of the same interview hits UNIQUE(bot_id, version).
    if ((queryError as { code?: string }).code === '23505') {
      await progress.reset(interviewId).catch(() => undefined);
      return error(422, 'interview already completed');
    }
    return error(500, 'could not mint draft spec');
  } finally {
    client.release();
  }
}

// Panel interviews join the working build paths: after the draft-spec commit,
// INSERT builder_runs (phase queued) + pg-boss `builder` send, IDENTICAL to
// builder/start (same queue, same singleton/retry/expiry options, same
// { runId, botId, brief } job shape). Best-effort — the draft-spec write is
// authoritative, so an enqueue failure never fails the mint; the caller still
// gets done + draftSpecId with an honest enqueue marker. The brief is the
// recorded interview answers stitched deterministically (one line per
// question:answer, clamped to the 1..2000 builder contract).
async function enqueueInterviewRun(
  botId: string,
  entries: { questionId: QuestionId; answer: string }[],
): Promise<{ ok: true; runId: string } | { ok: false }> {
  const brief = interviewBrief(entries);
  if (brief === null) {
    return { ok: false };
  }
  let runId: string;
  try {
    const inserted = await getPool().query<{ id: string }>(
      'INSERT INTO builder_runs (bot_id) VALUES ($1) RETURNING id',
      [botId],
    );
    const id = inserted.rows[0]?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false };
    }
    runId = id;
  } catch {
    return { ok: false };
  }

  let boss: BuilderBoss;
  try {
    boss = bossFactory();
  } catch {
    await markEnqueueFailed(runId);
    return { ok: false };
  }
  try {
    await boss.start();
    await boss.createQueue(BUILDER_QUEUE);
    const jobId = await boss.send(
      BUILDER_QUEUE,
      { runId, botId, brief },
      {
        singletonKey: runId,
        retryLimit: 3,
        retryDelay: 30,
        expireInSeconds: 3600,
        deleteAfterSeconds: 604800,
      },
    );
    if (!jobId) {
      await markEnqueueFailed(runId);
      return { ok: false };
    }
    return { ok: true, runId };
  } catch {
    await markEnqueueFailed(runId);
    return { ok: false };
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the outcome above stands; never mask it.
    }
  }
}

function interviewBrief(entries: { questionId: QuestionId; answer: string }[]): string | null {
  const lines = entries
    .map((entry) => `${entry.questionId}: ${entry.answer}`.trim())
    .filter((line) => line.length > 0);
  const brief = lines.join('\n').slice(0, 2000).trim();
  return brief.length > 0 ? brief : null;
}

// The row exists before the job does. If enqueueing fails the row would sit
// `queued` forever, so it is flipped to `failed` — identical to builder/start.
async function markEnqueueFailed(runId: string): Promise<void> {
  try {
    await getPool().query(
      "UPDATE builder_runs SET phase = 'failed', detail = $2::jsonb, updated_at = now() WHERE id = $1",
      [runId, JSON.stringify({ error: 'enqueue_failed' })],
    );
  } catch {
    // Caller still receives the done mint; the enqueue marker names the failure.
  }
}
