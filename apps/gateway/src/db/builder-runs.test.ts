// Tests for the V1-7 builder worker with a REAL generate/sync over a fake pool.
//
// The model call is the only injected seam: `createBuilderDeps` takes the chat
// function so the router is never hit on the network here (its own behaviour is
// covered by @corvus/ai). Everything else — the fenced-JSON extraction, the
// @corvus/spec validation, the spend ledger write, the phase machine, and the
// run-marker idempotency guard — runs for real against the fake pool below.
import { chat, RouterError, toCredits, type PlanTier } from '@corvus/ai';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBuilderDeps,
  isBuilderWorkerRunning,
  runBuilderJob,
  startBuilderWorker,
  type BuilderTierResolver,
  type BuilderWorkerHandle,
} from './builder-runs.js';

// L4: the builder worker's start path constructs PgBoss + Pool and calls
// start()/createQueue()/work(). Those are mocked so the startup contract — the
// queue is created BEFORE the worker listens — is assertable without a database.
// The runBuilderJob suite below never touches PgBoss or a real Pool.
const bossMock = vi.hoisted(() => ({
  order: [] as string[],
  instances: 0,
  starts: 0,
  stops: 0,
}));

vi.mock('pg-boss', () => {
  class PgBoss {
    constructor(options: unknown) {
      void options;
      bossMock.instances += 1;
    }
    on(): this {
      return this;
    }
    async start(): Promise<this> {
      bossMock.starts += 1;
      bossMock.order.push('start');
      return this;
    }
    async createQueue(): Promise<void> {
      bossMock.order.push('createQueue');
    }
    async work(): Promise<string> {
      bossMock.order.push('work');
      return 'mock-worker-id';
    }
    async stop(): Promise<void> {
      bossMock.stops += 1;
    }
  }
  return { PgBoss };
});

vi.mock('pg', () => {
  class Pool {
    constructor(options: unknown) {
      void options;
    }
    query(): Promise<{ rows: unknown[] }> {
      return Promise.resolve({ rows: [] });
    }
    end(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { Pool };
});

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const BOT_ID = '22222222-2222-4222-8222-222222222222';

interface QueryLog {
  text: string;
  params: unknown[];
}

interface FakeRunState {
  phase: string;
  detail: Record<string, unknown>;
}

interface FakeDb {
  pool: unknown;
  log: QueryLog[];
  phases: { phase: string; detail: unknown }[];
  run: FakeRunState;
}

function fakeDb(
  config: {
    botAccount?: string | null;
    /** Missing after N successful bot reads (models deletion between steps). */
    botMissingAfter?: number;
    nextVersion?: number;
    failVersionInsert?: boolean;
    failSpend?: boolean;
    /** The ledger insert returns no row id (D10 verification path). */
    spendReturnsNoId?: boolean;
    /** Credits already spent this month (H4 budget gate). Defaults to 0. */
    spentCredits?: number | string;
    /**
     * Billable attempts already recorded in the ledger for this run before the
     * job starts (KI-020 retry ceiling). Spend inserts made during the test are
     * added on top, so a second runBuilderJob call observes the first one's rows.
     */
    billedAttempts?: number;
    /** Fail the next N spend inserts with a 23505 unique violation (KI-026 backstop). */
    uniqueConflictSpends?: number;
    /** Fail the next N spend inserts with a generic error (non-unique path). */
    genericFailSpends?: number;
    /** No run row exists at all. */
    runMissing?: boolean;
    /** The run row is visible for the first read only, then gone. */
    deleteRunAfterRead?: boolean;
    /** The first N live-phase writes throw (models a phase-write failure). */
    liveWriteFailures?: number;
  } = {},
): FakeDb {
  const log: QueryLog[] = [];
  const phases: { phase: string; detail: unknown }[] = [];
  const run: FakeRunState = { phase: 'queued', detail: {} };
  let botReads = 0;
  let liveFailures = config.liveWriteFailures ?? 0;
  let runPresent = !config.runMissing;
  let spendInserts = 0;
  let uniqueConflicts = config.uniqueConflictSpends ?? 0;
  let genericFailures = config.genericFailSpends ?? 0;

  function handle(text: string, params: unknown[]): { rows: unknown[] } {
    log.push({ text, params });
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [] };
    }
    if (text.includes('FROM builder_runs')) {
      if (!runPresent) return { rows: [] };
      const snapshot = { rows: [{ phase: run.phase, detail: run.detail }] };
      // The row is visible for this read only, then deleted — the next phase
      // write must observe 0 affected rows.
      if (config.deleteRunAfterRead) runPresent = false;
      return snapshot;
    }
    if (text.includes('SET phase =')) {
      if (!runPresent) return { rows: [] };
      const phase = String(params[1]);
      const detail = JSON.parse(String(params[2])) as Record<string, unknown>;
      if (phase === 'live') {
        if (liveFailures > 0) {
          liveFailures -= 1;
          throw new Error('live write failed');
        }
        // The live detail is exactly what the poll contract documents — the
        // internal run marker is dropped on the terminal write.
        run.phase = phase;
        run.detail = detail;
        phases.push({ phase, detail: run.detail });
        return { rows: [{ id: 'run-id' }] };
      }
      const preserved =
        run.detail['_builder'] === undefined ? {} : { _builder: run.detail['_builder'] };
      run.phase = phase;
      run.detail = { ...preserved, ...detail };
      phases.push({ phase, detail: run.detail });
      return { rows: [{ id: 'run-id' }] };
    }
    if (text.includes('detail = builder_runs.detail ||')) {
      if (!runPresent) return { rows: [] };
      const patch = JSON.parse(String(params[1])) as Record<string, unknown>;
      run.detail = { ...run.detail, ...patch };
      return { rows: [{ id: 'run-id' }] };
    }
    if (text.includes('INSERT INTO spec_versions')) {
      if (config.failVersionInsert) {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        });
      }
      return { rows: [{ id: 'version-id-1' }] };
    }
    if (text.includes('FROM spec_versions')) {
      return { rows: [{ version: config.nextVersion ?? 1 }] };
    }
    if (text.includes('INSERT INTO ai_spend')) {
      if (config.failSpend) throw new Error('spend insert failed');
      if (genericFailures > 0) {
        genericFailures -= 1;
        throw new Error('spend insert failed');
      }
      if (uniqueConflicts > 0) {
        uniqueConflicts -= 1;
        throw Object.assign(
          new Error(
            'duplicate key value violates unique constraint "ai_spend_ref_reason_attempt_uidx"',
          ),
          { code: '23505' },
        );
      }
      if (config.spendReturnsNoId) return { rows: [] };
      spendInserts += 1;
      return { rows: [{ id: 'spend-id-1' }] };
    }
    if (text.includes('COUNT(*)') && text.includes('FROM ai_spend')) {
      // KI-020: attempts already billed for this run (seed + rows written here).
      // pg returns bigint counts as strings.
      const attempts = (config.billedAttempts ?? 0) + spendInserts;
      return { rows: [{ attempts: String(attempts) }] };
    }
    if (text.includes('FROM ai_spend')) {
      // H4: the month-to-date credit read. pg returns numeric as a string.
      return { rows: [{ spent: config.spentCredits ?? '0' }] };
    }
    if (text.includes('FROM bots')) {
      botReads += 1;
      if (config.botAccount === null || config.botAccount === undefined) return { rows: [] };
      if (config.botMissingAfter !== undefined && botReads > config.botMissingAfter) {
        return { rows: [] };
      }
      return { rows: [{ id: params[0], account_id: config.botAccount }] };
    }
    if (text.includes('UPDATE bots SET draft_spec_id')) {
      return { rows: [] };
    }
    throw new Error(`unexpected query: ${text}`);
  }

  const client = {
    query: (text: string, params: unknown[] = []) => Promise.resolve(handle(text, params)),
    release: () => undefined,
  };
  const pool = {
    query: (text: string, params: unknown[] = []) => Promise.resolve(handle(text, params)),
    connect: () => Promise.resolve(client),
  };
  return { pool, log, phases, run };
}

function artifactText(text: string, model = 'glm/5-2', cost: number | null = 0.02): typeof chat {
  return async () => ({ text, model, providerCostUsd: cost, lane: 'builder', attempts: [] });
}

function find(db: FakeDb, needle: string): QueryLog | undefined {
  return db.log.find((entry) => entry.text.includes(needle));
}

function count(db: FakeDb, needle: string): number {
  return db.log.filter((entry) => entry.text.includes(needle)).length;
}

function failedDetail(db: FakeDb): unknown {
  return db.phases.find((entry) => entry.phase === 'failed')?.detail;
}

describe('runBuilderJob — real generate + sync over a fake pool', () => {
  it('happy path: version + pointer in one transaction, spend with provider cost, live stub:false', async () => {
    const db = fakeDb({ botAccount: 'acct-1', nextVersion: 7 });
    const chatFn = artifactText('```json\n{"version":1,"behaviors":[{"a":1}]}\n```');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    const live = db.phases.find((entry) => entry.phase === 'live');
    expect(live?.detail).toEqual({ version: 7, model: 'glm/5-2', stub: false });
    expect(db.phases.map((entry) => entry.phase)).toEqual(['generating', 'syncing', 'live']);

    const seq = db.log.map((entry) => entry.text);
    const begin = seq.indexOf('BEGIN');
    const commit = seq.indexOf('COMMIT');
    const versionInsert = seq.findIndex((text) => text.includes('INSERT INTO spec_versions'));
    const pointerUpdate = seq.findIndex((text) => text.includes('UPDATE bots SET draft_spec_id'));
    const spendInsert = seq.findIndex((text) => text.includes('INSERT INTO ai_spend'));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    for (const index of [versionInsert, pointerUpdate]) {
      expect(index).toBeGreaterThan(begin);
      expect(index).toBeLessThan(commit);
    }
    expect(versionInsert).toBeLessThan(pointerUpdate);
    // D5: the ledger row is written at generate time, before sync's transaction,
    // so a later sync failure can never lose a billable call's spend.
    expect(spendInsert).toBeGreaterThanOrEqual(0);
    expect(spendInsert).toBeLessThan(begin);
    expect(seq).not.toContain('ROLLBACK');

    const version = find(db, 'INSERT INTO spec_versions');
    expect(version?.params[0]).toBe(BOT_ID);
    expect(version?.params[1]).toBe(7);
    expect(version?.params[3]).toBe('welcome bot');
    expect(version?.params[4]).toBe('ai:glm/5-2');
    expect(version?.params[5]).toBe('draft');

    const pointer = find(db, 'UPDATE bots SET draft_spec_id');
    expect(pointer?.params).toEqual([BOT_ID, 'version-id-1']);

    const spend = find(db, 'INSERT INTO ai_spend');
    expect(spend?.params).toEqual(['acct-1', 'glm/5-2', 0.02, 4, 'burn:builder', RUN_ID, 1]);
  });

  it('retries a persistently unparseable model 3 times, then leaves the pointer untouched', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('not json at all', 'glm/5-2', 0.03);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    // Every attempt is billed, and the coded class stays the primary field.
    const detail = failedDetail(db) as Record<string, unknown>;
    expect(detail['error']).toBe('bad_model_json');
    expect(detail['step']).toBe('generate');
    expect(detail['attempts']).toBe(3);
    expect(detail['rawPreview']).toBe('not json at all');
    // H4 span: three billable attempts folded into one in-memory summary.
    expect(detail['spanCalls']).toBe(3);
    expect(detail['spanCredits']).toBeCloseTo(3 * toCredits(0.03), 10);
    expect(count(db, 'INSERT INTO ai_spend')).toBe(3);
    const spend = find(db, 'INSERT INTO ai_spend');
    expect(spend?.params).toEqual(['acct-1', 'glm/5-2', 0.03, 6, 'burn:builder', RUN_ID, 1]);
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'UPDATE bots SET draft_spec_id')).toBeUndefined();
    expect(db.log.some((entry) => entry.text === 'BEGIN')).toBe(false);
  });

  it('retries a bad_model_json once: the second attempt parses and the run goes live', async () => {
    const db = fakeDb({ botAccount: 'acct-1', nextVersion: 4 });
    let calls = 0;
    const chatFn: typeof chat = async () => {
      calls += 1;
      return {
        text: calls === 1 ? 'not json' : '{"version":1,"behaviors":[]}',
        model: 'glm/5-2',
        providerCostUsd: 0.02,
        lane: 'builder',
        attempts: [],
      };
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    // 1 failed + 1 successful attempt = 2 metered calls, both ledgered.
    expect(calls).toBe(2);
    expect(count(db, 'INSERT INTO ai_spend')).toBe(2);
    const live = db.phases.find((entry) => entry.phase === 'live');
    expect(live?.detail).toEqual({ version: 4, model: 'glm/5-2', stub: false });
  });

  it('all 3 attempts bad: attempts=3, a bounded rawPreview, and the coded error stays primary', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('q'.repeat(1200), 'glm/5-2', 0.01);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    const detail = failedDetail(db) as Record<string, unknown>;
    expect(detail['error']).toBe('bad_model_json');
    expect(detail['step']).toBe('generate');
    expect(detail['attempts']).toBe(3);
    // First 500 chars of the last raw output — bounded, internal-only.
    expect(detail['rawPreview']).toBe('q'.repeat(500));
  });

  it('the repair attempt carries the previous output truncated to 2000 chars', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const raw = 'z'.repeat(3000);
    const userTurns: string[] = [];
    const chatFn: typeof chat = async (options) => {
      const user = options.messages.find((message) => message.role === 'user');
      userTurns.push(user?.content ?? '');
      return { text: raw, model: 'glm/5-2', providerCostUsd: 0.01, lane: 'builder', attempts: [] };
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    await runBuilderJob(deps, { runId: RUN_ID, botId: BOT_ID, brief: 'welcome bot' });

    expect(userTurns).toHaveLength(3);
    // Attempts 1-2 re-ask the same brief; attempt 3 appends the repair block.
    expect(userTurns[0]).toBe('<brief>\nwelcome bot\n</brief>');
    expect(userTurns[1]).toBe('<brief>\nwelcome bot\n</brief>');
    expect(userTurns[2]).toContain('Your previous output was not valid JSON against the spec.');
    expect(userTurns[2]).toContain('z'.repeat(2000));
    expect(userTurns[2]).not.toContain('z'.repeat(2001));
  });

  it('maps valid JSON with an invalid spec to bad_spec and still records the spend', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('```\n{"version":2}\n```');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    const detail = failedDetail(db) as Record<string, unknown>;
    expect(detail['error']).toBe('bad_spec');
    expect(detail['step']).toBe('generate');
    expect(detail['attempts']).toBe(3);
    expect(detail['rawPreview']).toBe('```\n{"version":2}\n```');
    expect(detail['spanCalls']).toBe(3);
    expect(detail['spanCredits']).toBeCloseTo(3 * toCredits(0.02), 10);
    expect(find(db, 'INSERT INTO ai_spend')).toBeDefined();
    expect(count(db, 'INSERT INTO ai_spend')).toBe(3);
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
  });

  it('records no spend and reports router_failed when every lane route fails', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn: typeof chat = async () => {
      throw new RouterError('builder', [
        { label: 'wiro-glm-5-2', ok: false, latencyMs: 12, status: 500 },
      ]);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'router_failed', step: 'generate' });
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
  });

  it('fails bot_gone with nothing written when the bot row is missing at generate (m-28)', async () => {
    // m-28 moved the existence check before the first chat() call: a missing
    // bot row now fails at generate (was: sync), with zero billable calls.
    const db = fakeDb({ botAccount: null });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(chatCalls).toBe(0);
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'generate' });
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'UPDATE bots SET draft_spec_id')).toBeUndefined();
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
    expect(db.log.some((entry) => entry.text === 'ROLLBACK')).toBe(false);
  });

  it('fails bot_gone before any billable work when the bot row is missing (m-28)', async () => {
    // The pre-generate existence check fires before the first chat() call: the
    // parse outcome no longer matters and no chat call is made.
    const db = fakeDb({ botAccount: null });
    let chatCalls = 0;
    const base = artifactText('garbage', 'glm/5-2', 0.05);
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(chatCalls).toBe(0);
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'generate' });
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
  });

  it('stores NULL credits when the provider reports no cost (never zero)', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('{"version":1,"behaviors":[]}', 'deepseek-chat', null);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    const spend = find(db, 'INSERT INTO ai_spend');
    expect(spend?.params).toEqual([
      'acct-1',
      'deepseek-chat',
      null,
      null,
      'burn:builder',
      RUN_ID,
      1,
    ]);
  });

  it('fails spend_failed with nothing written when the spend insert fails (D5)', async () => {
    const db = fakeDb({ botAccount: 'acct-1', failSpend: true });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'spend_failed', step: 'generate' });
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'UPDATE bots SET draft_spec_id')).toBeUndefined();
    expect(db.log.some((entry) => entry.text === 'COMMIT')).toBe(false);
  });

  // --- KI-026: the partial unique index makes a double-billed attempt a silent skip ---

  it('KI-026: a 23505 unique violation on the spend insert is an idempotent skip, still live', async () => {
    const db = fakeDb({ botAccount: 'acct-1', uniqueConflictSpends: 1, nextVersion: 2 });
    const chatFn = artifactText('{"version":1,"behaviors":[]}', 'glm/5-2', 0.02);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    const live = db.phases.find((entry) => entry.phase === 'live');
    expect(live?.detail).toEqual({ version: 2, model: 'glm/5-2', stub: false });
    // The conflicting attempt carried the run-global number (billedSoFar 0 + local 1).
    const spend = find(db, 'INSERT INTO ai_spend');
    expect(spend?.params[spend.params.length - 1]).toBe(1);
  });

  it('KI-026: a generic spend failure still surfaces spend_failed (only 23505 skips)', async () => {
    const db = fakeDb({ botAccount: 'acct-1', genericFailSpends: 1 });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'spend_failed', step: 'generate' });
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
  });

  it('KI-026: attempts are run-global — a resumed run passes billedSoFar + local', async () => {
    const db = fakeDb({ botAccount: 'acct-1', billedAttempts: 2, nextVersion: 5 });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    const spends = db.log.filter((entry) => entry.text.includes('INSERT INTO ai_spend'));
    expect(spends).toHaveLength(1);
    // billedSoFar (2) + local (1) = global attempt 3.
    expect(spends[0]?.params[spends[0].params.length - 1]).toBe(3);
  });

  it('slices the brief to 280 chars for diff_summary', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);
    const brief = 'x'.repeat(500);

    await runBuilderJob(deps, { runId: RUN_ID, botId: BOT_ID, brief });

    const version = find(db, 'INSERT INTO spec_versions');
    expect(String(version?.params[3])).toHaveLength(280);
  });

  // --- D1: a bad job must not orphan its pre-created run row ---

  it('D1: writes failed/bad_job when the job is invalid but carries a usable run id', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const deps = createBuilderDeps(db.pool as unknown as Pool, artifactText('{}'));

    const result = await runBuilderJob(deps, { runId: RUN_ID, botId: BOT_ID });

    expect(result).toEqual({ error: 'bad_job' });
    expect(failedDetail(db)).toEqual({ error: 'bad_job' });
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
  });

  it('D1: returns bad_job without a database write when no usable run id exists', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const deps = createBuilderDeps(db.pool as unknown as Pool, artifactText('{}'));

    const result = await runBuilderJob(deps, { runId: 'not-a-uuid', botId: BOT_ID, brief: 'x' });

    expect(result).toEqual({ error: 'bad_job' });
    expect(db.log).toHaveLength(0);
    expect(db.phases).toHaveLength(0);
  });

  // --- D2: a 0-row phase write is a run_gone, never a fake success ---

  it('D2: returns run_gone and never calls the model when the run row is already gone', async () => {
    const db = fakeDb({ botAccount: 'acct-1', runMissing: true });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'run_gone' });
    expect(chatCalls).toBe(0);
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
  });

  it('D2: returns run_gone when the run row disappears before the first phase write', async () => {
    const db = fakeDb({ botAccount: 'acct-1', deleteRunAfterRead: true });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'run_gone' });
    expect(chatCalls).toBe(0);
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
  });

  // --- D3: a retry after a committed sync must not re-generate or re-mint ---

  it('D3: a retry reuses the minted version — one model call, one version, one spend', async () => {
    const db = fakeDb({ botAccount: 'acct-1', nextVersion: 7, liveWriteFailures: 1 });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const first = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });
    const second = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(first).toEqual({ error: 'builder_failed' });
    expect(second).toEqual({ ok: true, phase: 'live' });
    expect(chatCalls).toBe(1);
    expect(count(db, 'INSERT INTO spec_versions')).toBe(1);
    expect(count(db, 'INSERT INTO ai_spend')).toBe(1);
    const live = db.phases.filter((entry) => entry.phase === 'live');
    expect(live.at(-1)?.detail).toEqual({ version: 7, model: 'glm/5-2', stub: false });
  });

  // --- D5: every billable chat leaves a ledger row even when sync later fails ---

  it('D5: records the spend when the bot is deleted between generate and sync', async () => {
    // Two successful reads now precede sync: the H4 budget gate's pre-chat
    // account load, then generate's post-chat attribution load (D5 itself). The
    // third read — sync's — is the one that finds the bot gone.
    const db = fakeDb({ botAccount: 'acct-1', botMissingAfter: 2 });
    const chatFn = artifactText('{"version":1,"behaviors":[]}', 'glm/5-2', 0.04);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'sync' });
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'INSERT INTO ai_spend')?.params).toEqual([
      'acct-1',
      'glm/5-2',
      0.04,
      8,
      'burn:builder',
      RUN_ID,
      1,
    ]);
  });

  // --- D9: the tenant brief is delimited as untrusted input ---

  it('D9: wraps the tenant brief in <brief> delimiters', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    let seenMessages: readonly { role: string; content: string }[] = [];
    const chatFn: typeof chat = async (options) => {
      seenMessages = options.messages;
      return {
        text: '{"version":1,"behaviors":[]}',
        model: 'glm/5-2',
        providerCostUsd: 0.01,
        lane: 'builder',
        attempts: [],
      };
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    await runBuilderJob(deps, { runId: RUN_ID, botId: BOT_ID, brief: 'a welcome bot' });

    const user = seenMessages.find((message) => message.role === 'user');
    expect(user?.content).toBe('<brief>\na welcome bot\n</brief>');
  });

  // --- D10: the ledger insert verifies it got a row id back ---

  it('D10: fails spend_failed when the ledger insert returns no id', async () => {
    const db = fakeDb({ botAccount: 'acct-1', spendReturnsNoId: true });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'spend_failed', step: 'generate' });
  });

  // --- M7: a version conflict is its own retryable signal ---

  it('M7: returns version_conflict and rolls back on a UNIQUE(bot_id,version) violation', async () => {
    const db = fakeDb({ botAccount: 'acct-1', failVersionInsert: true });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'version_conflict' });
    expect(failedDetail(db)).toEqual({ error: 'version_conflict', step: 'sync' });
    expect(db.log.some((entry) => entry.text === 'ROLLBACK')).toBe(true);
    // The billable chat is never hidden, even though the mint failed (D5).
    expect(find(db, 'INSERT INTO ai_spend')).toBeDefined();
  });

  // --- H4: the pre-call budget gate ---

  it('H4: a blocked budget writes failed/budget_exceeded with ZERO chat calls', async () => {
    // 100 trial credits already spent: any positive projection crosses the grant.
    const db = fakeDb({ botAccount: 'acct-1', spentCredits: 100 });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'budget_exceeded' });
    expect(chatCalls).toBe(0);
    expect(failedDetail(db)).toEqual({
      error: 'budget_exceeded',
      step: 'generate',
      attempts: 0,
    });
    // Zero billable calls means zero ledger rows and nothing minted.
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'UPDATE bots SET draft_spec_id')).toBeUndefined();
    expect(db.phases.map((entry) => entry.phase)).toEqual(['generating', 'failed']);
  });

  it('H4: reads month-to-date credits before the first chat call when allowed', async () => {
    const db = fakeDb({ botAccount: 'acct-1', spentCredits: 0 });
    let chatCalls = 0;
    let logAtFirstChat = -1;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      if (logAtFirstChat === -1) logAtFirstChat = db.log.length;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    expect(chatCalls).toBe(1);
    // The month-to-date credit read is the SUM aggregate; the KI-020 attempt
    // count is a different query against the same table.
    const spendRead = find(db, 'SUM(credits)');
    expect(spendRead).toBeDefined();
    expect(spendRead?.params).toEqual(['acct-1']);
    const spendReadIndex = db.log.findIndex((entry) => entry.text.includes('SUM(credits)'));
    expect(spendReadIndex).toBeGreaterThanOrEqual(0);
    expect(spendReadIndex).toBeLessThan(logAtFirstChat);
    // The live detail keeps its fixed contract — span fields are failed-only.
    const live = db.phases.find((entry) => entry.phase === 'live');
    expect(live?.detail).toEqual({ version: 1, model: 'glm/5-2', stub: false });
  });

  it('H4: the span summary rides the failed detail alongside attempts', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('not json', 'glm/5-2', 0.01);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    const detail = failedDetail(db) as Record<string, unknown>;
    expect(detail['error']).toBe('bad_model_json');
    expect(detail['attempts']).toBe(3);
    expect(detail['spanCalls']).toBe(3);
    expect(detail['spanCredits']).toBeCloseTo(3 * toCredits(0.01), 10);
  });

  it('m-28: a bot deleted after enqueue fails bot_gone with ZERO chat calls', async () => {
    // Existence is checked before the first billable call: no bot row means no
    // provider call, no budget read, and no ledger row.
    const db = fakeDb({ botAccount: null });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(chatCalls).toBe(0);
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'generate' });
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
    expect(find(db, 'SUM(credits)')).toBeUndefined();
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
  });

  it('H4: a missing account fails bot_gone before the budget read (m-28)', async () => {
    // No bot row -> no account -> the m-28 existence check fires at generate
    // before any billable work: zero chat calls, no budget SUM read, and the
    // KI-020 in-job ceiling never burns a ledger row.
    const db = fakeDb({ botAccount: null });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(chatCalls).toBe(0);
    // No account -> the allowance SUM is never read; the KI-020 attempt count
    // still runs (it is account-independent).
    expect(find(db, 'SUM(credits)')).toBeUndefined();
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'generate' });
  });

  // --- KI-020: billable-retry ceiling + idempotent attempt billing ---

  it('KI-020: a pg-boss re-execution makes ZERO new calls once the ceiling is billed', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    let chatCalls = 0;
    const base = artifactText('not json at all', 'glm/5-2', 0.02);
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const first = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });
    const second = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    // First execution burns the whole per-run budget (3 in-job attempts).
    expect(first).toEqual({ error: 'builder_failed' });
    expect(count(db, 'INSERT INTO ai_spend')).toBe(3);
    // A boss retry must not re-bill an already-billed attempt: it fails honestly
    // as budget_exceeded with ZERO new chat calls.
    expect(second).toEqual({ error: 'budget_exceeded' });
    expect(chatCalls).toBe(3);
    expect(count(db, 'INSERT INTO ai_spend')).toBe(3);
    const failed = db.phases.filter((entry) => entry.phase === 'failed');
    expect(failed.at(-1)?.detail).toEqual({
      error: 'budget_exceeded',
      step: 'generate',
      attempts: 0,
    });
  });

  it('KI-020: a retry with attempts already billed resumes instead of restarting at 1', async () => {
    // One attempt was billed by a previous execution; only the two remaining
    // global attempts (2 and 3) may run, and only one of them is the repair.
    const db = fakeDb({ botAccount: 'acct-1', billedAttempts: 1 });
    let chatCalls = 0;
    const userTurns: string[] = [];
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      const user = options.messages.find((message) => message.role === 'user');
      userTurns.push(user?.content ?? '');
      return {
        text: 'not json',
        model: 'glm/5-2',
        providerCostUsd: 0.02,
        lane: 'builder',
        attempts: [],
      };
    };
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(chatCalls).toBe(2);
    expect(count(db, 'INSERT INTO ai_spend')).toBe(2);
    // Global attempt 2 is a plain retry; global attempt 3 is the repair pass.
    expect(userTurns[0]).toBe('<brief>\nwelcome bot\n</brief>');
    expect(userTurns[1]).toContain('Your previous output was not valid JSON against the spec.');
    const detail = failedDetail(db) as Record<string, unknown>;
    expect(detail['error']).toBe('bad_model_json');
    expect(detail['attempts']).toBe(3);
  });

  // --- KI-020: tier-aware pre-check ---

  it('KI-020: reads the account tier for the pre-check instead of defaulting to trial', async () => {
    // 150 spent credits would cross the trial grant (100) but not Pro (2000).
    const db = fakeDb({ botAccount: 'acct-1', spentCredits: 150, nextVersion: 3 });
    const seenAccounts: string[] = [];
    const getTier = async (accountId: string): Promise<'pro'> => {
      seenAccounts.push(accountId);
      return 'pro';
    };
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn, getTier);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ ok: true, phase: 'live' });
    expect(seenAccounts).toEqual(['acct-1']);
    expect(count(db, 'INSERT INTO ai_spend')).toBe(1);
  });

  it('KI-020: an unknown/absent tier falls back to the trial allowance', async () => {
    const db = fakeDb({ botAccount: 'acct-1', spentCredits: 100 });
    let chatCalls = 0;
    const base = artifactText('{"version":1,"behaviors":[]}');
    const chatFn: typeof chat = async (options) => {
      chatCalls += 1;
      return base(options);
    };
    // A bogus tier string must not become a free pass and must not throw. The
    // cast models an untrusted runtime value reaching the resolver; isPlanTier
    // is the runtime gate that rejects it.
    const getTier: BuilderTierResolver = async () => 'enterprise' as unknown as PlanTier;
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn, getTier);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'budget_exceeded' });
    expect(chatCalls).toBe(0);
    expect(failedDetail(db)).toEqual({
      error: 'budget_exceeded',
      step: 'generate',
      attempts: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Live leg (KI-026): apply 0001 + 0002 + 0003 + 0009 on an empty schema and
// double-insert one (ref_id, reason, attempt) through the real insertSpend
// path — the second is an idempotent no-op and COUNT stays 1. Loud-skip when
// Postgres is unreachable; the suite must prove BOTH states.
// ---------------------------------------------------------------------------

const LIVE_FALLBACK_DB_URL = 'postgresql://corvus:corvus_ci@localhost:5434/corvus_ci';

function resolveLiveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return LIVE_FALLBACK_DB_URL;
}

describe('ledger unique backstop migration (real Postgres)', () => {
  it('double-inserts one attempt through insertSpend: second is a no-op, COUNT = 1', async (ctx) => {
    // NOTE: this file top-level mocks 'pg', so the live leg must bypass the
    // mock with importActual — a plain import('pg') would return the stub Pool.
    const { Pool: LivePool } = await vi.importActual<typeof import('pg')>('pg');
    const { randomUUID } = await import('node:crypto');
    const { readFileSync: readSql } = await import('node:fs');
    const { dirname: dirOf, join: joinPath } = await import('node:path');
    const { fileURLToPath: toPath } = await import('node:url');
    const liveUrl = resolveLiveDatabaseUrl();
    const probe = new LivePool({ connectionString: liveUrl, connectionTimeoutMillis: 5000 });
    try {
      await probe.query('SELECT 1');
    } catch (error) {
      console.warn(
        `[ledger-026] SKIP: no Postgres reachable at the configured URL — ${(error as Error).message}. ` +
          'Start the CI-identical container (postgres:17) or set DATABASE_URL. Skipping loudly, not failing.',
      );
      await probe.end().catch(() => undefined);
      ctx.skip();
      return;
    }
    await probe.end().catch(() => undefined);

    const schema = `ledger_026_${process.pid}_${Date.now()}`;
    // max:1 plus `options: -c search_path=` binds EVERY backend of this pool
    // (including a replacement after a query error discards one) to the test
    // schema — a session SET would be lost when node-postgres reconnects.
    const pool = new LivePool({
      connectionString: liveUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    }) as unknown as Pool;
    const here = dirOf(toPath(import.meta.url));
    // insertSpend is module-private: the live leg reaches it through
    // runBuilderJob's generate, which also needs builder_runs (0007) plus the
    // bots/accounts parents (0001/0002) — hence the wider chain.
    const migrateFiles = [
      '0001_init.sql',
      '0002_v11.sql',
      '0003_v12.sql',
      '0007_builder_runs.sql',
      '0009_ai_spend_attempt.sql',
    ];
    const fallbackDdl = `
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  email text,
  creem_id text,
  credits numeric NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now()
);
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
CREATE TABLE IF NOT EXISTS ai_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  model text NOT NULL,
  usd_cost numeric,
  credits numeric,
  reason text NOT NULL,
  ref_id uuid,
  attempt integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_spend ADD COLUMN IF NOT EXISTS attempt integer;
CREATE UNIQUE INDEX IF NOT EXISTS ai_spend_ref_reason_attempt_uidx ON ai_spend (ref_id, reason, attempt) WHERE ref_id IS NOT NULL AND attempt IS NOT NULL;`;
    try {
      const control = new LivePool({ connectionString: liveUrl, max: 1 });
      await control.query(`CREATE SCHEMA "${schema}"`);
      await control.end().catch(() => undefined);
      for (const file of migrateFiles) {
        try {
          const sql = readSql(joinPath(here, '..', '..', 'drizzle', file), 'utf8');
          const statements = sql
            .split('--> statement-breakpoint')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          for (const statement of statements) {
            await pool.query(statement);
          }
        } catch {
          const statements = fallbackDdl
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          for (const statement of statements) {
            await pool.query(statement);
          }
          break;
        }
      }
      const account = await pool.query<{ id: string }>(
        'INSERT INTO accounts (discord_id) VALUES ($1) RETURNING id',
        [`ledger-026-${randomUUID()}`],
      );
      const accountId = (account.rows[0] as { id: string }).id;
      const runId = randomUUID();
      const deps = createBuilderDeps(pool, async () => ({
        text: '{"version":1,"behaviors":[]}',
        model: 'wiro-glm-5-2',
        providerCostUsd: 0.02,
        lane: 'builder',
        attempts: [],
      }));
      const botRow = await pool.query<{ id: string }>(
        `INSERT INTO bots (account_id, name, token_cipher, status)
         VALUES ($1, 'ledger-026', '\\x'::bytea, 'draft') RETURNING id`,
        [accountId],
      );
      const botId = (botRow.rows[0] as { id: string }).id;
      await pool.query(
        `INSERT INTO builder_runs (id, bot_id, phase, detail) VALUES ($1, $2, 'queued', '{}'::jsonb)`,
        [runId, botId],
      );
      const first = await runBuilderJob(deps, { runId, botId, brief: 'ledger-026 probe' });
      expect(first).toEqual({ ok: true, phase: 'live' });
      const counted = await pool.query<{ attempts: string }>(
        'SELECT COUNT(*) AS attempts FROM ai_spend WHERE ref_id = $1 AND reason = $2',
        [runId, 'burn:builder'],
      );
      expect(Number((counted.rows[0] as { attempts: string }).attempts)).toBe(1);
      // Direct double-insert of the SAME (ref_id, reason, attempt) triple: the
      // unique backstop rejects the second row, so COUNT stays 1.
      await expect(
        pool.query(
          `INSERT INTO ai_spend (account_id, model, usd_cost, credits, reason, ref_id, attempt)
           VALUES ($1, 'wiro-glm-5-2', 0.02, 4, 'burn:builder', $2, 1)`,
          [accountId, runId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      const after = await pool.query<{ attempts: string }>(
        'SELECT COUNT(*) AS attempts FROM ai_spend WHERE ref_id = $1 AND reason = $2',
        [runId, 'burn:builder'],
      );
      expect(Number((after.rows[0] as { attempts: string }).attempts)).toBe(1);
      // NULL-attempt chat rows are untouched by the partial index by construction.
      await pool.query(
        `INSERT INTO ai_spend (account_id, model, usd_cost, credits, reason, ref_id, attempt)
         VALUES ($1, 'persona', NULL, NULL, 'persona-run', $2, NULL)`,
        [accountId, randomUUID()],
      );
      await pool.query(
        `INSERT INTO ai_spend (account_id, model, usd_cost, credits, reason, ref_id, attempt)
         VALUES ($1, 'persona', NULL, NULL, 'persona-run', $2, NULL)`,
        [accountId, randomUUID()],
      );
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end().catch(() => undefined);
    }
  }, 60_000);
});

// The worker lifecycle runs against the mocked PgBoss/Pool above; the singleton
// is stopped after each case so one test never leaks into the next.
describe('builder worker startup (L4)', () => {
  let handle: BuilderWorkerHandle | undefined;

  beforeEach(() => {
    bossMock.order = [];
    bossMock.instances = 0;
    bossMock.starts = 0;
    bossMock.stops = 0;
  });

  afterEach(async () => {
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  it('creates the queue before registering the worker', async () => {
    expect(isBuilderWorkerRunning()).toBe(false);
    handle = await startBuilderWorker('postgresql://mock/db');
    expect(isBuilderWorkerRunning()).toBe(true);
    expect(bossMock.instances).toBe(1);
    expect(bossMock.starts).toBe(1);
    // L4: pg-boss v12 does not auto-create the queue; createQueue must run
    // before work() or jobs sent earlier are dropped.
    expect(bossMock.order).toEqual(['start', 'createQueue', 'work']);
  });
});
