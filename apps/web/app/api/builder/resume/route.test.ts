// Tests for POST /api/builder/resume (Wave 3 — a failed run resumes as a FRESH
// audited run; terminal rows are immutable).
//
// The pool, the pg-boss client and the session are stubbed through the route's
// seams, so every test is hermetic: no live provider, no live DB.

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SendOptions } from 'pg-boss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseNotConfiguredError, __resetPool, __setPool } from '../../../../lib/db/pool';
import {
  BUILDER_QUEUE,
  POST,
  __resetBossFactory,
  __resetSessionReader,
  __setBossFactory,
  __setSessionReader,
  type BuilderBoss,
  type ResumeSessionReader,
} from './route';

const BOT = '11111111-2222-4333-8444-555555555555';
const SRC = '22222222-3333-4444-8555-666666666666';
const FOREIGN_RUN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const CHECKPOINT_BRIEF = 'Welcome message on join';
const FALLBACK_BRIEF = 'Approved brief from the plan';

// The refusal sentences the route writes — re-declared here, not imported, so a
// route-side copy drift fails this suite (same second-copy idiom as the
// verdict suite's message pins).
const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';
const TRIAL_BUDGET_MESSAGE =
  'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.';
const PAID_BUDGET_MESSAGE = "This month's 2000 AI credits are used up. Nothing is deleted.";
const RESUME_FRESH_NOTICE =
  'Starting a fresh build from the last checkpoint — the failed run is kept for audit.';
const RESUME_NO_CHECKPOINT_NOTICE = 'Checkpoint unavailable — starting from the approved brief.';

const SIGNED_IN: ResumeSessionReader = {
  getSession: async () => ({ accountId: 'acct-1', discordId: 'disc-1' }),
};

const SIGNED_OUT: ResumeSessionReader = {
  getSession: async () => null,
};

const EXPIRED_TRIAL: ResumeSessionReader = {
  getSession: async () => ({
    accountId: 'acct-1',
    discordId: 'disc-1',
    trialEndsAt: new Date(Date.now() - 1),
  }),
};

const EXPIRED_PAID: ResumeSessionReader = {
  getSession: async () => ({
    accountId: 'acct-1',
    discordId: 'disc-1',
    trialEndsAt: new Date(Date.now() - 1),
    tier: 'pro',
  }),
};

afterEach(() => {
  __resetSessionReader();
  __resetBossFactory();
  __resetPool();
});

// --- Fakes ---

interface SeedRun {
  id: string;
  phase: string;
  detail: unknown;
}

interface FakeConfig {
  /** Month-to-date credits the allowance read returns (Postgres numeric reads
   *  back as a STRING, which the route must parse). */
  spent?: number | string;
  /** Reject the allowance read, to prove the route fails honestly rather than
   *  treating an unreadable meter as zero. */
  failSpent?: boolean;
  /** Reject the source read with the unconfigured-DB error. */
  dbNotConfiguredOnSource?: boolean;
  /** Reject the allowance read with the unconfigured-DB error. */
  dbNotConfiguredOnSpent?: boolean;
  /** Reject the source read with a generic failure. */
  failSource?: boolean;
  /** Reject the fresh-row INSERT. */
  failInsert?: boolean;
}

function fakeDb(
  seeds: SeedRun[] = [],
  config: FakeConfig = {},
): {
  pool: Pool;
  runs: Map<string, SeedRun & { botId: string }>;
  calls: { text: string; params: unknown[] }[];
} {
  const runs = new Map<string, SeedRun & { botId: string }>();
  for (const seed of seeds) {
    runs.set(seed.id, { ...seed, botId: BOT });
  }
  const calls: { text: string; params: unknown[] }[] = [];
  const pool = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      if (text.includes('SUM(credits)')) {
        if (config.dbNotConfiguredOnSpent) throw new DatabaseNotConfiguredError();
        if (config.failSpent) throw new Error('meter down');
        return { rows: [{ spent: config.spent ?? '0' }] };
      }
      if (text.includes('INSERT INTO builder_runs')) {
        if (config.failInsert) throw new Error('insert failed');
        const id = randomUUID();
        let detail: unknown = {};
        try {
          detail = JSON.parse(String(params[1]));
        } catch {
          detail = {};
        }
        runs.set(id, { id, botId: String(params[0]), phase: 'queued', detail });
        return { rows: [{ id }] };
      }
      if (text.includes('UPDATE builder_runs')) {
        const row = runs.get(String(params[0]));
        if (row) {
          row.phase = 'failed';
          row.detail = JSON.parse(String(params[1]));
        }
        return { rows: [] };
      }
      if (text.includes('JOIN bots')) {
        if (config.dbNotConfiguredOnSource) throw new DatabaseNotConfiguredError();
        if (config.failSource) throw new Error('db down');
        const row = runs.get(String(params[0]));
        // Unseeded ids (unknown, foreign, soft-deleted-bot runs) read as
        // missing — the same 404 the production JOIN yields.
        if (!row) return { rows: [] };
        return {
          rows: [{ id: row.id, phase: row.phase, detail: row.detail, bot_id: row.botId }],
        };
      }
      if (text.includes('phase IN (')) {
        const botId = String(params[0]);
        const active = [...runs.values()].filter(
          (row) =>
            row.botId === botId &&
            (row.phase === 'queued' || row.phase === 'generating' || row.phase === 'syncing'),
        );
        return { rows: active.map((row) => ({ id: row.id })) };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  } as unknown as Pool;
  return { pool, runs, calls };
}

function stubBoss(config: { send?: string | null | Error } = {}): {
  factory: () => BuilderBoss;
  record: {
    startCalls: number;
    stopCalls: number;
    created: string[];
    sent: { name: string; data: unknown; options: unknown }[];
  };
} {
  const record = {
    startCalls: 0,
    stopCalls: 0,
    created: [] as string[],
    sent: [] as { name: string; data: unknown; options: unknown }[],
  };
  const factory = (): BuilderBoss => ({
    start: async () => {
      record.startCalls += 1;
    },
    stop: async () => {
      record.stopCalls += 1;
    },
    createQueue: async (name: string) => {
      record.created.push(name);
    },
    send: async (name: string, data: object, options?: SendOptions) => {
      record.sent.push({ name, data, options });
      if (config.send instanceof Error) throw config.send;
      if (config.send === undefined) return 'job-1';
      return config.send;
    },
  });
  return { record, factory };
}

function checkpointedSource(): SeedRun {
  return {
    id: SRC,
    phase: 'failed',
    detail: {
      briefChars: CHECKPOINT_BRIEF.length,
      attempt: 2,
      stepStartedAt: '2026-09-25T18:00:00.000Z',
      lastGoodPhase: 'generating',
      checkpointBrief: CHECKPOINT_BRIEF,
      error: 'builder crashed',
      provider: 'wiro sonnet-5',
    },
  };
}

function postResume(body: unknown): Request {
  return new Request('http://localhost/api/builder/resume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function builderInserts(calls: { text: string }[]): { text: string }[] {
  return calls.filter((call) => call.text.includes('INSERT INTO builder_runs'));
}

function builderUpdates(calls: { text: string; params: unknown[] }[]): {
  text: string;
  params: unknown[];
}[] {
  return calls.filter((call) => call.text.includes('UPDATE builder_runs'));
}

// --- Gate order: 401 → 403 trial (before body) → 422 → 404 → 403 budget → 409 ---

describe('POST /api/builder/resume - gates', () => {
  it('returns 401 first when there is no session, without touching pool or boss', async () => {
    const db = fakeDb([checkpointedSource()]);
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_OUT);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('fails closed (401) when the session read itself throws', async () => {
    const db = fakeDb([checkpointedSource()]);
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader({
      getSession: async () => {
        throw new Error('cookie store exploded');
      },
    });

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(401);
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('checks the trial clock before the body, so a malformed request cannot mask it', async () => {
    const db = fakeDb([checkpointedSource()]);
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(EXPIRED_TRIAL);

    const res = await POST(postResume({ runId: 'not-a-run-id' }));

    expect(res.status).toBe(403);
    expect(await readBody(res)).toEqual({
      error: 'trial_expired',
      message: TRIAL_ENDED_MESSAGE,
    });
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 422 for a missing or malformed run id, without touching pool or boss', async () => {
    const db = fakeDb([checkpointedSource()]);
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    for (const body of [{}, { runId: 'not-a-run-id' }, { runId: 42 }, { runId: null }]) {
      const res = await POST(postResume(body));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({ error: 'invalid run id' });
    }
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 422 for a malformed fallback brief, before any read', async () => {
    const db = fakeDb([checkpointedSource()]);
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    for (const brief of ['', '   ', 'x'.repeat(2001)]) {
      const res = await POST(postResume({ runId: randomUUID(), brief }));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({ error: 'invalid brief' });
    }
    // Shape-checked ahead of the reads: the pool was never touched.
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 404 - never 403 - for an unknown or foreign run, without inserting', async () => {
    const db = fakeDb([checkpointedSource()]);
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    for (const runId of [randomUUID(), FOREIGN_RUN]) {
      const res = await POST(postResume({ runId }));
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      expect(await readBody(res)).toEqual({ error: 'run not found' });
    }
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(db.runs.size).toBe(1);
    expect(boss.record.startCalls).toBe(0);
    // The ownership read keeps the worker's soft-delete predicate, so a
    // deleted-bot run reads as missing too.
    const ownership = db.calls.find((call) => call.text.includes('JOIN bots'));
    expect(ownership?.text).toContain('deleted_at IS NULL');
  });

  it('refuses an exhausted allowance with the trial sentence, no row and no job', async () => {
    // The resume estimate is 18 credits, so a spent month of 100 leaves no
    // headroom. The SUM reads back as a STRING, as Postgres hands numerics.
    const db = fakeDb([checkpointedSource()], { spent: '100' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(403);
    expect(await readBody(res)).toEqual({
      error: 'trial_budget_exceeded',
      message: TRIAL_BUDGET_MESSAGE,
    });
    // A refused request writes NO fresh row and enqueues NO job.
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(db.runs.size).toBe(1);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('names the resolved paid allowance instead of the trial sentence', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '100000' });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    // A paid account past its grant must not be told its trial ended — and the
    // paid tier still passes the trial CLOCK to reach this gate.
    __setSessionReader(EXPIRED_PAID);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(403);
    expect(await readBody(res)).toEqual({
      error: 'trial_budget_exceeded',
      message: PAID_BUDGET_MESSAGE,
    });
    expect(builderInserts(db.calls)).toHaveLength(0);
  });

  it('returns 409 run_not_failed for a live source, without inserting or sending', async () => {
    // The budget gate sits BEFORE the 409 (a spent month would answer 403
    // first), so this seed keeps spend at zero to reach the phase check.
    const db = fakeDb([{ id: SRC, phase: 'live', detail: {} }], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(409);
    expect(await readBody(res)).toEqual({ error: 'run_not_failed' });
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(db.runs.size).toBe(1);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('lets a paid tier past an expired clock', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(EXPIRED_PAID);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toMatchObject({ phase: 'queued', resumedFrom: SRC });
    expect(boss.record.sent).toHaveLength(1);
  });
});

// --- Happy path: a failed run resumes as a FRESH audited run ---

describe('POST /api/builder/resume - resume from checkpoint', () => {
  it('mints a fresh runId, sends the frozen boss args, and leaves the source byte-identical', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const before = JSON.stringify(db.runs.get(SRC));

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    const newRunId = String(body.runId);
    expect(newRunId).not.toBe(SRC);
    expect(body).toMatchObject({
      phase: 'queued',
      resumedFrom: SRC,
      notice: RESUME_FRESH_NOTICE,
      briefChars: CHECKPOINT_BRIEF.length,
    });
    // The fresh row exists and carries the checkpoint forward: the attempt
    // display count continues, the brief and provider ride along.
    const fresh = db.runs.get(newRunId);
    expect(fresh).toMatchObject({ botId: BOT, phase: 'queued' });
    const freshDetail = fresh?.detail as Record<string, unknown>;
    expect(freshDetail.attempt).toBe(3);
    expect(freshDetail.checkpointBrief).toBe(CHECKPOINT_BRIEF);
    expect(freshDetail.provider).toBe('wiro sonnet-5');
    // The boss send reuses the frozen args VERBATIM with the NEW runId.
    expect(boss.record.startCalls).toBe(1);
    expect(boss.record.stopCalls).toBe(1);
    expect(boss.record.created).toEqual([BUILDER_QUEUE]);
    expect(BUILDER_QUEUE).toBe('builder');
    expect(boss.record.sent).toHaveLength(1);
    const sent = boss.record.sent[0];
    expect(sent.name).toBe(BUILDER_QUEUE);
    expect(sent.data).toEqual({ runId: newRunId, botId: BOT, brief: CHECKPOINT_BRIEF });
    expect(sent.options).toEqual({
      singletonKey: newRunId,
      retryLimit: 3,
      retryDelay: 30,
      expireInSeconds: 3600,
      deleteAfterSeconds: 604800,
    });
    // Terminal rows are immutable: the source row is byte-identical and no
    // UPDATE ever named it.
    expect(JSON.stringify(db.runs.get(SRC))).toBe(before);
    expect(builderUpdates(db.calls).filter((call) => call.params[0] === SRC)).toHaveLength(0);
  });

  it('falls back to the approved brief with the unavailable notice when no checkpoint exists', async () => {
    const db = fakeDb([{ id: SRC, phase: 'failed', detail: {} }], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    const res = await POST(postResume({ runId: SRC, brief: FALLBACK_BRIEF }));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body).toMatchObject({
      phase: 'queued',
      resumedFrom: SRC,
      notice: RESUME_NO_CHECKPOINT_NOTICE,
      briefChars: FALLBACK_BRIEF.length,
    });
    const newRunId = String(body.runId);
    expect(newRunId).not.toBe(SRC);
    const sent = boss.record.sent[0];
    expect(sent.data).toEqual({ runId: newRunId, botId: BOT, brief: FALLBACK_BRIEF });
  });

  it('returns 422 with no fresh row when neither checkpoint nor brief can build one', async () => {
    const db = fakeDb([{ id: SRC, phase: 'failed', detail: {} }], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(422);
    expect(await readBody(res)).toEqual({ error: 'invalid brief' });
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(db.runs.size).toBe(1);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('enqueues exactly once across a double-POST', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    const first = await POST(postResume({ runId: SRC }));
    expect(first.status).toBe(200);
    const second = await POST(postResume({ runId: SRC }));

    // The second POST sees the first fresh run still active and refuses it
    // instead of enqueuing a twin.
    expect(second.status).toBe(409);
    expect(await readBody(second)).toEqual({ error: 'build_in_progress' });
    expect(boss.record.sent).toHaveLength(1);
    expect(builderInserts(db.calls)).toHaveLength(1);
    expect(db.runs.size).toBe(2);
  });
});

// --- Enqueue failure: the fresh row fails, the source is untouched ---

describe('POST /api/builder/resume - enqueue failure', () => {
  it('flips only the fresh row to failed when send throws', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss({ send: new Error('pg exploded') });
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const before = JSON.stringify(db.runs.get(SRC));

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not resume build' });
    expect(boss.record.stopCalls).toBe(1);
    const fresh = [...db.runs.values()].find((row) => row.id !== SRC);
    expect(fresh?.phase).toBe('failed');
    expect(fresh?.detail).toEqual({ error: 'enqueue_failed' });
    expect(JSON.stringify(db.runs.get(SRC))).toBe(before);
  });

  it('flips only the fresh row to failed when send resolves to null', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '0' });
    __setPool(db.pool);
    __setBossFactory(stubBoss({ send: null }).factory);
    __setSessionReader(SIGNED_IN);
    const before = JSON.stringify(db.runs.get(SRC));

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not resume build' });
    const fresh = [...db.runs.values()].find((row) => row.id !== SRC);
    expect(fresh?.phase).toBe('failed');
    expect(JSON.stringify(db.runs.get(SRC))).toBe(before);
  });

  it('returns an honest 500 when the allowance read fails, never a model-adjacent write', async () => {
    const db = fakeDb([checkpointedSource()], { failSpent: true });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(postResume({ runId: SRC }));

      // An unreadable meter is a failure to check, not a refusal: the route
      // never reports "exceeded" for something it could not read, and writes
      // no fresh row on the way out.
      expect(res.status).toBe(500);
      expect(await readBody(res)).toEqual({ error: 'could not check your AI credits' });
      expect(builderInserts(db.calls)).toHaveLength(0);
      expect(db.runs.size).toBe(1);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it('answers the unconfigured-DB source read with the bare code', async () => {
    const db = fakeDb([checkpointedSource()], { dbNotConfiguredOnSource: true });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'database not configured' });
  });

  it('returns a generic 500 without starting the boss when the fresh INSERT fails', async () => {
    const db = fakeDb([checkpointedSource()], { spent: '0', failInsert: true });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    const res = await POST(postResume({ runId: SRC }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({ error: 'could not resume build' });
    expect(boss.record.startCalls).toBe(0);
  });
});
