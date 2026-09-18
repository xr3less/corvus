import type { Pool, PoolClient } from 'pg';
import { parseSpec } from '@corvus/spec';
import { getPool, mapDbError, __setPool as setSharedPool } from '../../../../lib/db/pool';
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
    return Response.json({ done: true, draftSpecId, version: 1 }, { status: 200 });
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
