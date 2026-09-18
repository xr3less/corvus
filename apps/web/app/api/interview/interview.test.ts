import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { __resetPool } from '../../../lib/db/pool';
import { __resetProgressStore } from '../../../lib/interview/progress-store';
import { interviewProgress } from '../../../lib/interview/tree';
import {
  POST as startInterview,
  __resetSessionReader as resetStartReader,
  __setPool as setStartPool,
  __setSessionReader as setStartReader,
  type InterviewSession,
} from './start/route';
import {
  POST as answerInterview,
  __resetSessionReader as resetAnswerReader,
  __setPool as setAnswerPool,
  __setSessionReader as setAnswerReader,
} from './answer/route';

const TEST_DATABASE_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';
const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  } finally {
    await pool.end().catch(() => {});
  }
}

const probe = await probeDatabase();
if (!probe.ok) {
  console.warn(
    `[interview.test] LOUD SKIP: Postgres test database unreachable at ${connectionString}. ` +
      `Reason: ${probe.reason}. Start the orchestrator-owned test container, then re-run.`,
  );
}

// Inline fallback DDL matching SPEC section 4 verbatim. Runs when the sibling
// migrations are not present yet; every statement is IF NOT EXISTS so it is a
// no-op once they land. It must be SUFFICIENT ON ITS OWN — the live routes
// touch bots (start route) and interview_progress (answer route's durable
// progress store, V1-2), neither of which the sibling files alone guarantee on
// an empty CI database. Order matters: bots before spec_versions (FK).
const FALLBACK_DDL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  name text NOT NULL,
  token_cipher bytea NOT NULL,
  prod_spec_id uuid,
  draft_spec_id uuid,
  status text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  email text,
  creem_id text,
  credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS spec_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  version int NOT NULL,
  spec jsonb NOT NULL,
  diff_summary text NOT NULL DEFAULT '',
  author text NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, version)
);
CREATE TABLE IF NOT EXISTS interview_progress (
  interview_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS interview_progress_expires_at_idx ON interview_progress (expires_at);`;

let migrationSource = 'none (database unreachable)';

async function ensureSchema(pool: Pool): Promise<void> {
  // Four levels up from app/api/interview/ lands on apps/, where the gateway
  // package lives (apps/gateway/drizzle/...). Five levels overshot to the repo
  // root, where no gateway/ directory exists, so the sibling was never read.
  // Applied in dependency order (bots before spec_versions' FK, accounts before
  // ai_spend's FK) and each file individually try/caught: a file that cannot
  // apply on its own must not abort the setup, because the fallback DDL below
  // is self-sufficient.
  const sources = [
    '../../../../gateway/drizzle/0001_init.sql',
    '../../../../gateway/drizzle/0002_v11.sql',
    '../../../../gateway/drizzle/0003_v12.sql',
  ];
  let applied = 0;
  for (const relative of sources) {
    try {
      const sql = await readFile(new URL(relative, import.meta.url), 'utf8');
      await pool.query(sql);
      applied += 1;
    } catch {
      // Sibling migration not readable/applicable yet — fallback path below.
    }
  }
  migrationSource =
    applied === sources.length
      ? '0001_init.sql + 0002_v11.sql + 0003_v12.sql (sibling migrations)'
      : `inline-fallback (${applied}/${sources.length} sibling files applied)`;
  await pool.query(FALLBACK_DDL);
  console.info(`[interview.test] schema ready via ${migrationSource}`);
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function actAs(session: InterviewSession | null): void {
  const reader = { getSession: async () => session };
  setStartReader(reader);
  setAnswerReader(reader);
}

describe('interview routes without a session', () => {
  beforeEach(() => {
    resetStartReader();
    resetAnswerReader();
  });

  it('start returns 401 when unauthenticated', async () => {
    const res = await startInterview(jsonRequest('/api/interview/start', { botName: 'X' }));
    expect(res.status).toBe(401);
  });

  it('answer returns 401 when unauthenticated', async () => {
    const res = await answerInterview(
      jsonRequest('/api/interview/answer', {
        interviewId: '00000000-0000-0000-0000-000000000000',
        questionId: 'purpose',
        answer: 'hi',
      }),
    );
    expect(res.status).toBe(401);
  });
});

// KI-021 slice: when DATABASE_URL is unset the shared pool is the stand-in
// whose every method rejects with DatabaseNotConfiguredError. Both interview
// routes must answer with the canonical honest 500 shape, not their generic
// "something went wrong" message. Env is deleted + the pool reset so the REAL
// unconfigured-pool path is exercised (never a hand-fed error instance).
describe('interview routes fail honestly when the database is not configured', () => {
  const owner: InterviewSession = { accountId: 'acct-1', discordId: 'disc-1' };
  let savedUrl: string | undefined;

  beforeEach(() => {
    savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetPool();
    __resetProgressStore();
    actAs(owner);
  });

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    __resetPool();
    __resetProgressStore();
    resetStartReader();
    resetAnswerReader();
  });

  it('start returns the canonical honest 500, never a misleading one', async () => {
    const res = await startInterview(
      jsonRequest('/api/interview/start', { botName: 'Study Hall' }),
    );
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'database not configured' });
  });

  it('answer returns the canonical honest 500, never a misleading one', async () => {
    const res = await answerInterview(
      jsonRequest('/api/interview/answer', {
        interviewId: '00000000-0000-0000-0000-000000000000',
        questionId: 'purpose',
        answer: 'study',
      }),
    );
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'database not configured' });
  });
});

(probe.ok ? describe : describe.skip)('interview routes with Postgres', () => {
  let pool: Pool;
  let owner: InterviewSession;
  let intruder: InterviewSession;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    setStartPool(pool);
    setAnswerPool(pool);
    await ensureSchema(pool);
    const tag = `interview-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerRow = await pool.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [`${tag}-owner`],
    );
    const intruderRow = await pool.query<{ id: string }>(
      'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
      [`${tag}-intruder`],
    );
    owner = { accountId: ownerRow.rows[0].id, discordId: `${tag}-owner` };
    intruder = { accountId: intruderRow.rows[0].id, discordId: `${tag}-intruder` };
  }, 30000);

  afterAll(async () => {
    resetStartReader();
    resetAnswerReader();
    interviewProgress.reset();
    await pool?.end().catch(() => {});
  });

  beforeEach(() => {
    interviewProgress.reset();
    actAs(owner);
  });

  async function startBot(
    botName: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await startInterview(jsonRequest('/api/interview/start', { botName }));
    return { status: res.status, body: await readJson(res) };
  }

  it('rejects invalid bot names with 422', async () => {
    for (const bad of ['', '   ', 'x'.repeat(33), 42, null]) {
      const { status } = await startBot(bad);
      expect(status).toBe(422);
    }
    const res = await startInterview(
      new Request('http://localhost/api/interview/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('starts an interview with the first question', async () => {
    const { status, body } = await startBot('Study Hall');
    expect(status).toBe(200);
    expect(typeof body.interviewId).toBe('string');
    expect((body.question as { id: string }).id).toBe('purpose');
    const row = await pool.query<{ status: string }>('SELECT status FROM bots WHERE id = $1', [
      body.interviewId as string,
    ]);
    expect(row.rows[0].status).toBe('draft');
  });

  it('returns 404 for foreign, missing, and malformed interview ids (never leaks existence)', async () => {
    const { body } = await startBot('Arena');
    const interviewId = body.interviewId as string;
    actAs(intruder);
    const foreign = await answerInterview(
      jsonRequest('/api/interview/answer', { interviewId, questionId: 'purpose', answer: 'x' }),
    );
    expect(foreign.status).toBe(404);
    const missing = await answerInterview(
      jsonRequest('/api/interview/answer', {
        interviewId: '00000000-0000-0000-0000-000000000000',
        questionId: 'purpose',
        answer: 'x',
      }),
    );
    expect(missing.status).toBe(404);
    const malformed = await answerInterview(
      jsonRequest('/api/interview/answer', {
        interviewId: 'not-a-uuid',
        questionId: 'purpose',
        answer: 'x',
      }),
    );
    expect(malformed.status).toBe(404);
  });

  it('rejects unknown questionIds and invalid answers with 422', async () => {
    const { body } = await startBot('Arena');
    const interviewId = body.interviewId as string;
    for (const payload of [
      { interviewId, questionId: 'nope', answer: 'x' },
      { interviewId, questionId: 'purpose', answer: '' },
      { interviewId, questionId: 'purpose', answer: '   ' },
      { interviewId, questionId: 'purpose', answer: 'x'.repeat(501) },
      { interviewId, questionId: 'purpose', answer: 42 },
    ]) {
      const res = await answerInterview(jsonRequest('/api/interview/answer', payload));
      expect(res.status).toBe(422);
    }
  });

  it('rejects out-of-order answers with 422 naming the expected question', async () => {
    const { body } = await startBot('Arena');
    const interviewId = body.interviewId as string;
    const skipped = await answerInterview(
      jsonRequest('/api/interview/answer', {
        interviewId,
        questionId: 'channels',
        answer: '#general',
      }),
    );
    expect(skipped.status).toBe(422);
    expect(await readJson(skipped)).toMatchObject({ expected: 'purpose' });
  });

  it(
    'walks the full tree and mints spec_versions v1 with the draft pointer',
    { timeout: 30_000 },
    async () => {
      const started = await startBot('Study Hall');
      expect(started.status).toBe(200);
      const interviewId = started.body.interviewId as string;
      const answers: Array<[string, string, string | null]> = [
        ['purpose', 'A study-group bot', 'channels'],
        ['channels', '#general and #announcements', 'welcome'],
        ['welcome', 'Read the rules first.', 'moderation'],
        ['moderation', 'strict', null],
      ];
      for (const [questionId, answer, expectedNextId] of answers) {
        const res = await answerInterview(
          jsonRequest('/api/interview/answer', { interviewId, questionId, answer }),
        );
        expect(res.status).toBe(200);
        const body = await readJson(res);
        if (expectedNextId !== null) {
          expect((body.nextQuestion as { id: string }).id).toBe(expectedNextId);
        } else {
          expect(body.done).toBe(true);
          expect(body.version).toBe(1);
          expect(typeof body.draftSpecId).toBe('string');

          const versionRow = await pool.query<{
            version: number;
            author: string;
            state: string;
            spec: { version: number; behaviors: unknown[] };
          }>('SELECT version, author, state, spec FROM spec_versions WHERE id = $1', [
            body.draftSpecId as string,
          ]);
          expect(versionRow.rowCount).toBe(1);
          expect(versionRow.rows[0].version).toBe(1);
          expect(versionRow.rows[0].author).toBe(`owner:${owner.discordId}`);
          expect(versionRow.rows[0].state).toBe('draft');
          expect(versionRow.rows[0].spec.version).toBe(1);
          expect(versionRow.rows[0].spec.behaviors).toHaveLength(4);

          const botRow = await pool.query<{ draft_spec_id: string }>(
            'SELECT draft_spec_id FROM bots WHERE id = $1',
            [interviewId],
          );
          expect(botRow.rows[0].draft_spec_id).toBe(body.draftSpecId);

          // Replaying the final answer is out of order (already answered): 422.
          const replay = await answerInterview(
            jsonRequest('/api/interview/answer', { interviewId, questionId, answer }),
          );
          expect(replay.status).toBe(422);

          // Durability backstop: even if in-memory progress is lost (restart),
          // UNIQUE(bot_id, version) stops a second v1 row from being minted.
          interviewProgress.reset(interviewId);
          for (const [retryId, retryAnswer] of answers) {
            const retry = await answerInterview(
              jsonRequest('/api/interview/answer', {
                interviewId,
                questionId: retryId,
                answer: retryAnswer,
              }),
            );
            if (retryId !== 'moderation') {
              expect(retry.status).toBe(200);
            } else {
              expect(retry.status).toBe(422);
              expect(await readJson(retry)).toMatchObject({
                error: 'interview already completed',
              });
            }
          }
        }
      }
    },
  );
});
