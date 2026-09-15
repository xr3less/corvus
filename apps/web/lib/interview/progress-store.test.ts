// Unit + live-PG tests for the durable interview progress store (V1-2).
// The fake-pool block runs with no database; the live block probes Postgres
// and skips LOUDLY when unreachable (launch-blockers pattern — hooks never
// throw without a DB).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  INTERVIEW_PROGRESS_TTL_MS,
  PgInterviewProgress,
  __resetProgressStore,
  __setProgressStore,
  getDefaultProgressStore,
  type InterviewProgressStore,
} from './progress-store';
import type { QuestionId } from './tree';

interface FakeRow {
  payloadRaw: unknown;
  expiresAtMs: number;
}

function createFakePool() {
  const rows = new Map<string, FakeRow>();
  let now = Date.now();
  const pool = {
    setNow(value: number): void {
      now = value;
    },
    seedRaw(botId: string, payloadRaw: unknown, expiresAtMs: number): void {
      rows.set(botId, { payloadRaw, expiresAtMs });
    },
    rowCount(): number {
      return rows.size;
    },
    async query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      if (text.startsWith('SELECT')) {
        const id = params?.[0] as string;
        const row = rows.get(id);
        if (!row || row.expiresAtMs <= now) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              interview_id: id,
              payload: row.payloadRaw,
              expires_at: new Date(row.expiresAtMs).toISOString(),
            },
          ],
          rowCount: 1,
        };
      }
      if (text.startsWith('INSERT')) {
        const [id, payload, , expiresAt] = params as [string, string, string, string];
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          throw new Error('fake pool expected JSON payload text');
        }
        rows.set(id, { payloadRaw: parsed, expiresAtMs: Number(new Date(expiresAt).getTime()) });
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith('DELETE')) {
        if (params !== undefined && params.length > 0) {
          const deleted = rows.delete(params[0] as string);
          return { rows: [], rowCount: deleted ? 1 : 0 };
        }
        const count = rows.size;
        rows.clear();
        return { rows: [], rowCount: count };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  return pool;
}

describe('pg interview progress with a fake pool (no PG needed)', () => {
  it('records answers in order and reads them back per interview', async () => {
    const pool = createFakePool();
    const store = new PgInterviewProgress(pool as unknown as Pool);
    const bot = randomUUID();
    await expect(store.answeredIdsFor(bot)).resolves.toEqual([]);
    await store.record(bot, 'purpose', 'study group');
    await store.record(bot, 'channels', '#general');
    await expect(store.answeredIdsFor(bot)).resolves.toEqual(['purpose', 'channels']);
    await expect(store.answeredFor(bot)).resolves.toEqual([
      { questionId: 'purpose', answer: 'study group' },
      { questionId: 'channels', answer: '#general' },
    ]);
    // A sibling interview is unaffected.
    await expect(store.answeredIdsFor(randomUUID())).resolves.toEqual([]);
  });

  it('upserts a single row per interview with a rolling ~24h expiry', async () => {
    const pool = createFakePool();
    const store = new PgInterviewProgress(pool as unknown as Pool);
    const bot = randomUUID();
    const before = Date.now();
    await store.record(bot, 'purpose', 'a');
    expect(pool.rowCount()).toBe(1);
    await store.record(bot, 'channels', 'b');
    expect(pool.rowCount()).toBe(1);
    // The second record rolls the expiry forward by the full TTL.
    pool.setNow(before + INTERVIEW_PROGRESS_TTL_MS - 60_000);
    await expect(store.answeredIdsFor(bot)).resolves.toEqual(['purpose', 'channels']);
    pool.setNow(before + 2 * INTERVIEW_PROGRESS_TTL_MS);
    await expect(store.answeredIdsFor(bot)).resolves.toEqual([]);
  });

  it('reads corrupt or foreign-shaped payloads as empty (never throws)', async () => {
    const pool = createFakePool();
    const store = new PgInterviewProgress(pool as unknown as Pool);
    const future = Date.now() + INTERVIEW_PROGRESS_TTL_MS;
    for (const [name, payload] of [
      ['null', null],
      ['string', 'oops'],
      ['missing-answers', { nope: [] }],
      ['ragged-entries', { answers: [null, 42, { questionId: 'purpose' }, { answer: 'x' }] }],
    ] as Array<[string, unknown]>) {
      const bot = randomUUID();
      pool.seedRaw(bot, payload, future);
      await expect(store.answeredFor(bot), name).resolves.toEqual([]);
    }
    const bot = randomUUID();
    pool.seedRaw(
      bot,
      {
        answers: [
          { questionId: 'purpose', answer: 'kept' },
          { questionId: 'nope', answer: 'x' },
        ],
      },
      future,
    );
    await expect(store.answeredFor(bot)).resolves.toEqual([
      { questionId: 'purpose', answer: 'kept' },
    ]);
  });

  it('resets one interview or the whole table', async () => {
    const pool = createFakePool();
    const store = new PgInterviewProgress(pool as unknown as Pool);
    const first = randomUUID();
    const second = randomUUID();
    await store.record(first, 'purpose', 'a');
    await store.record(second, 'purpose', 'b');
    await store.reset(first);
    await expect(store.answeredIdsFor(first)).resolves.toEqual([]);
    await expect(store.answeredIdsFor(second)).resolves.toEqual(['purpose']);
    await store.reset();
    await expect(store.answeredIdsFor(second)).resolves.toEqual([]);
  });

  it('supports an injectable holder for tests', () => {
    const stub: InterviewProgressStore = {
      answeredFor: () => Promise.resolve([]),
      answeredIdsFor: () => Promise.resolve([] as QuestionId[]),
      record: () => Promise.resolve(),
      reset: () => Promise.resolve(),
    };
    __setProgressStore(stub);
    expect(getDefaultProgressStore()).toBe(stub);
    __resetProgressStore();
    // Lazy default resolves through the shared pool; constructing it performs
    // no I/O, so this is safe with no database.
    expect(getDefaultProgressStore()).toBeInstanceOf(PgInterviewProgress);
    __resetProgressStore();
  });
});

// Inline DDL matching 0003_v12.sql verbatim (interview_progress has no FK
// deps, so it applies standalone). IF NOT EXISTS: no-op once the sibling
// migration lands.
const PROGRESS_DDL = `
CREATE TABLE IF NOT EXISTS interview_progress (
  interview_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS interview_progress_expires_at_idx ON interview_progress (expires_at);
`;

const PROGRESS_FALLBACK_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

describe('pg interview progress (live PG when reachable, loud skip otherwise)', () => {
  let pool: Pool | null = null;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? PROGRESS_FALLBACK_URL;
    if (!process.env.DATABASE_URL) {
      console.warn(
        'progress-store.test: DATABASE_URL is unset, falling back to the disposable test container URL.',
      );
    }
    const candidate = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      await candidate.query('SELECT 1');
    } catch (error) {
      console.warn(
        `progress-store.test: SKIP pg progress tests — no Postgres reachable. Cause: ${(error as Error).message}`,
      );
      await candidate.end().catch(() => undefined);
      return;
    }
    try {
      await candidate.query(PROGRESS_DDL);
    } catch (error) {
      console.warn(
        `progress-store.test: SKIP pg progress tests — schema setup failed. Cause: ${(error as Error).message}`,
      );
      await candidate.end().catch(() => undefined);
      return;
    }
    pool = candidate;
    console.log('progress-store.test: schema ready via inline DDL (0003_v12.sql columns)');
  }, 30_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    pool = null;
  });

  function guard(): boolean {
    if (!pool) {
      console.warn('progress-store.test: SKIP — no database; set DATABASE_URL to run PG tests.');
      return true;
    }
    return false;
  }

  it('round-trips record/read/reset with a rolling expiry', async () => {
    if (guard()) {
      return;
    }
    const db = pool as Pool;
    const store = new PgInterviewProgress(db);
    const bot = randomUUID();
    const before = Date.now();
    await store.record(bot, 'purpose', 'study group');
    await store.record(bot, 'channels', '#general');
    await expect(store.answeredIdsFor(bot)).resolves.toEqual(['purpose', 'channels']);

    const row = await db.query<{ expires_at: string }>(
      'SELECT expires_at FROM interview_progress WHERE interview_id = $1',
      [bot],
    );
    expect(row.rowCount).toBe(1);
    const expiresMs = Number(new Date(row.rows[0].expires_at).getTime());
    expect(expiresMs).toBeGreaterThanOrEqual(before + INTERVIEW_PROGRESS_TTL_MS - 5000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + INTERVIEW_PROGRESS_TTL_MS + 5000);

    await store.reset(bot);
    await expect(store.answeredIdsFor(bot)).resolves.toEqual([]);
  });

  it('hides expired rows (TTL enforced in SQL)', async () => {
    if (guard()) {
      return;
    }
    const db = pool as Pool;
    const store = new PgInterviewProgress(db);
    const bot = randomUUID();
    await store.record(bot, 'purpose', 'stale');
    await db.query(
      "UPDATE interview_progress SET expires_at = now() - interval '1 second' WHERE interview_id = $1",
      [bot],
    );
    await expect(store.answeredFor(bot)).resolves.toEqual([]);
    await db.query('DELETE FROM interview_progress WHERE interview_id = $1', [bot]);
  });
});
