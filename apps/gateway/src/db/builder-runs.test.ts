// Tests for the V1-7 builder worker with a REAL generate/sync over a fake pool.
//
// The model call is the only injected seam: `createBuilderDeps` takes the chat
// function so the router is never hit on the network here (its own behaviour is
// covered by @corvus/ai). Everything else — the fenced-JSON extraction, the
// @corvus/spec validation, the spend ledger write, and the single-transaction
// version + pointer + spend write — runs for real against the fake pool below.
import { chat, RouterError } from '@corvus/ai';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createBuilderDeps, runBuilderJob } from './builder-runs.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const BOT_ID = '22222222-2222-4222-8222-222222222222';

interface QueryLog {
  text: string;
  params: unknown[];
}

interface FakeDb {
  pool: unknown;
  log: QueryLog[];
  phases: { phase: string; detail: unknown }[];
}

function fakeDb(
  config: {
    botAccount?: string | null;
    nextVersion?: number;
    failVersionInsert?: boolean;
    failSpend?: boolean;
  } = {},
): FakeDb {
  const log: QueryLog[] = [];
  const phases: { phase: string; detail: unknown }[] = [];

  function handle(text: string, params: unknown[]): { rows: unknown[] } {
    log.push({ text, params });
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [] };
    }
    if (text.includes('UPDATE builder_runs')) {
      phases.push({ phase: String(params[1]), detail: JSON.parse(String(params[2])) });
      return { rows: [] };
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
      return { rows: [{ id: 'spend-id-1' }] };
    }
    if (text.includes('FROM bots')) {
      if (config.botAccount === null || config.botAccount === undefined) return { rows: [] };
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
  return { pool, log, phases };
}

function artifactText(text: string, model = 'glm/5-2', cost: number | null = 0.02): typeof chat {
  return async () => ({ text, model, providerCostUsd: cost, lane: 'builder', attempts: [] });
}

function find(db: FakeDb, needle: string): QueryLog | undefined {
  return db.log.find((entry) => entry.text.includes(needle));
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
    for (const index of [versionInsert, pointerUpdate, spendInsert]) {
      expect(index).toBeGreaterThan(begin);
      expect(index).toBeLessThan(commit);
    }
    expect(versionInsert).toBeLessThan(pointerUpdate);
    expect(pointerUpdate).toBeLessThan(spendInsert);
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
    expect(spend?.params).toEqual(['acct-1', 'glm/5-2', 0.02, 4, 'burn:builder', RUN_ID]);
  });

  it('records the spend but leaves the pointer untouched when the model JSON is unparseable', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const chatFn = artifactText('not json at all', 'glm/5-2', 0.03);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'bad_model_json', step: 'generate' });
    const spend = find(db, 'INSERT INTO ai_spend');
    expect(spend?.params).toEqual(['acct-1', 'glm/5-2', 0.03, 6, 'burn:builder', RUN_ID]);
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'UPDATE bots SET draft_spec_id')).toBeUndefined();
    expect(db.log.some((entry) => entry.text === 'BEGIN')).toBe(false);
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
    expect(failedDetail(db)).toEqual({ error: 'bad_spec', step: 'generate' });
    expect(find(db, 'INSERT INTO ai_spend')).toBeDefined();
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

  it('fails bot_gone with nothing written when the bot row is missing at sync', async () => {
    const db = fakeDb({ botAccount: null });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'sync' });
    expect(find(db, 'INSERT INTO spec_versions')).toBeUndefined();
    expect(find(db, 'UPDATE bots SET draft_spec_id')).toBeUndefined();
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
    expect(db.log.some((entry) => entry.text === 'ROLLBACK')).toBe(true);
  });

  it('fails bot_gone before writing anything when the bot is missing on a parse failure', async () => {
    const db = fakeDb({ botAccount: null });
    const chatFn = artifactText('garbage', 'glm/5-2', 0.05);
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'bot_gone', step: 'generate' });
    expect(find(db, 'INSERT INTO ai_spend')).toBeUndefined();
  });

  it('deadletters a brief-less job without touching the database', async () => {
    const db = fakeDb({ botAccount: 'acct-1' });
    const deps = createBuilderDeps(db.pool as unknown as Pool, artifactText('{}'));

    const result = await runBuilderJob(deps, { runId: RUN_ID, botId: BOT_ID });

    expect(result).toEqual({ error: 'bad_job' });
    expect(db.log).toHaveLength(0);
    expect(db.phases).toHaveLength(0);
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
    expect(spend?.params).toEqual(['acct-1', 'deepseek-chat', null, null, 'burn:builder', RUN_ID]);
  });

  it('rolls back the version and pointer when the spend insert fails', async () => {
    const db = fakeDb({ botAccount: 'acct-1', failSpend: true });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'spend_failed', step: 'sync' });
    expect(db.log.some((entry) => entry.text === 'ROLLBACK')).toBe(true);
    expect(db.log.some((entry) => entry.text === 'COMMIT')).toBe(false);
  });

  it('fails sync_failed and rolls back on a version conflict', async () => {
    const db = fakeDb({ botAccount: 'acct-1', failVersionInsert: true });
    const chatFn = artifactText('{"version":1,"behaviors":[]}');
    const deps = createBuilderDeps(db.pool as unknown as Pool, chatFn);

    const result = await runBuilderJob(deps, {
      runId: RUN_ID,
      botId: BOT_ID,
      brief: 'welcome bot',
    });

    expect(result).toEqual({ error: 'builder_failed' });
    expect(failedDetail(db)).toEqual({ error: 'sync_failed', step: 'sync' });
    expect(db.log.some((entry) => entry.text === 'ROLLBACK')).toBe(true);
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
});
