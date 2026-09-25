// Tests for POST /api/builder/verdict (AI verdict + AI-written brief).
//
// The pool, the pg-boss client and the persona lane are all stubbed through
// the route's seams, so every test is hermetic: no live provider, no live DB.

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SendOptions } from 'pg-boss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseNotConfiguredError, __resetPool, __setPool } from '../../../../lib/db/pool';
import {
  POST,
  BUILDER_QUEUE,
  __resetBossFactory,
  __resetPersonaCaller,
  __resetSessionReader,
  __setBossFactory,
  __setPersonaCaller,
  __setSessionReader,
  type BuilderBoss,
  type VerdictSessionReader,
} from './route';
import { ELLIPSIS, REPLY_MAX, REPLY_TAIL_MAX as REPLY_TAIL } from '../../../../lib/verdict/bounds';

const BOT = '11111111-2222-4333-8444-555555555555';
const FOREIGN_BOT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const ASK = 'Here is the plan. Can I start? Reply yes to build.';

/* Turkish plan endings: the persona prompt locks the English line, but the
   model answers a Turkish owner in Turkish, so the gate must read these too.
   `Başlayalım mı?` is the "shall we start" sibling the model also writes. */
const ASK_TR = 'Plan hazır. Başlayayım mı?';
const ASK_TR_ASCII = 'Plan hazir. Baslayayim mi?';
const ASK_TR_ALT = 'Plan hazır. Başlayalım mı?';
/* The model sometimes uppercases the closing question and reaches for a dotted
   capital İ where Turkish proper case uses the dotless I. Lowercasing İ yields
   'i' plus a combining dot (U+0307), so the gate must strip that mark or this
   realistic drift is refused. This pin is what keeps the strip alive. */
const ASK_TR_DOTTED_CAPS = 'Plan hazır. BAŞLAYAYİM Mİ?';

/* The refusal sentences the route writes — re-declared here, not imported, so a
   route-side copy drift fails this suite. Same idiom as the chat suite's
   TRIAL_ENDED_MESSAGE pin: the assertion is the second, independent copy. */
const MSG_UNAUTHORIZED = 'Oturum bulunamadı — tekrar giriş yap.';
const MSG_INVALID_BOT = 'Bot kimliği geçersiz — sayfayı yenileyip tekrar dene.';
const MSG_BOT_NOT_FOUND = 'Bot bulunamadı — sayfayı yenileyip tekrar dene.';
const MSG_NO_PLAN =
  'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.';
const MSG_EMPTY_BRIEF = 'Kurulum metni boş çıktı — tekrar dene.';
const MSG_START_FAILED = 'Kurulum başlatılamadı — tekrar dene.';
const MSG_CREDITS_CHECK = 'AI kredisi kontrol edilemedi — sonra tekrar dene.';
const MSG_DB_NOT_CONFIGURED = 'Sunucu şu an veritabanına bağlanamıyor.';

const SIGNED_IN: VerdictSessionReader = {
  getSession: async () => ({ accountId: 'acct-1', discordId: 'disc-1' }),
};

const EXPIRED_TRIAL: VerdictSessionReader = {
  getSession: async () => ({
    accountId: 'acct-1',
    discordId: 'disc-1',
    trialEndsAt: new Date(Date.now() - 1),
  }),
};

const EXPIRED_PAID: VerdictSessionReader = {
  getSession: async () => ({
    accountId: 'acct-1',
    discordId: 'disc-1',
    trialEndsAt: new Date(Date.now() - 1),
    tier: 'pro',
  }),
};

const SIGNED_OUT: VerdictSessionReader = {
  getSession: async () => null,
};

function planTurns(reply = 'yes, go ahead'): { role: 'assistant' | 'user'; content: string }[] {
  return [
    { role: 'user', content: 'I want a welcome bot' },
    { role: 'assistant', content: ASK },
    { role: 'user', content: reply },
  ];
}

afterEach(() => {
  __resetSessionReader();
  __resetBossFactory();
  __resetPersonaCaller();
  __resetPool();
});

// --- Fakes ---

interface RunRow {
  id: string;
  botId: string;
  phase: string;
  detail: unknown;
}

function fakeDb(
  config: {
    owned?: boolean;
    failInsert?: boolean;
    deleted?: boolean;
    /** Month-to-date credits the allowance read returns (a Postgres numeric
     *  comes back as a STRING, which the route must parse). */
    spent?: number | string;
    /** Reject the allowance read, to prove the route fails honestly rather
     *  than treating an unreadable meter as zero. */
    failSpent?: boolean;
    /** Reject the allowance read with the unconfigured-DB error, so the
     *  mapDbError arm of the same catch is exercised too. */
    dbNotConfigured?: boolean;
    /** Reject the allowance read with the unconfigured-DB error, so the
     *  ownership read's mapDbError twin stays pinned. */
    dbNotConfiguredOnOwnership?: boolean;
  } = {},
): {
  pool: Pool;
  runs: Map<string, RunRow>;
  calls: { text: string; params: unknown[] }[];
} {
  const runs = new Map<string, RunRow>();
  const calls: { text: string; params: unknown[] }[] = [];
  const pool = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      if (text.includes('SUM(credits)')) {
        if (config.dbNotConfigured) throw new DatabaseNotConfiguredError();
        if (config.failSpent) throw new Error('db down');
        return { rows: [{ spent: config.spent ?? '0' }] };
      }
      if (text.includes('INSERT INTO ai_spend')) {
        return { rows: [{ id: 'spend-1' }] };
      }
      if (text.includes('INSERT INTO builder_runs')) {
        if (config.failInsert) throw new Error('insert failed');
        const id = randomUUID();
        runs.set(id, { id, botId: String(params[0]), phase: 'queued', detail: {} });
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
      if (text.includes('FROM bots')) {
        if (config.dbNotConfiguredOnOwnership) throw new DatabaseNotConfiguredError();
        const missing = config.owned === false || config.deleted === true;
        return { rows: missing ? [] : [{ id: String(params[0]) }] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  } as unknown as Pool;
  return { pool, runs, calls };
}

// The allowance read is a SELECT, so it must never be counted as a ledger
// write: an assertion about "zero spend rows" has to mean zero.
function allowanceReads(calls: { text: string }[]): { text: string }[] {
  return calls.filter((call) => call.text.includes('SUM(credits)'));
}

function builderInserts(calls: { text: string }[]): { text: string }[] {
  return calls.filter((call) => call.text.includes('INSERT INTO builder_runs'));
}

function spendInserts(calls: { text: string }[]): { text: string }[] {
  return calls.filter((call) => call.text.includes('INSERT INTO ai_spend'));
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

interface PersonaCall {
  messages: { role: string; content: string }[];
  maxTokens: number;
}

function stubPersona(script: ({ text: string } | Error)[]): {
  calls: PersonaCall[];
} {
  const calls: PersonaCall[] = [];
  let index = 0;
  __setPersonaCaller(async (messages, maxTokens) => {
    calls.push({ messages, maxTokens });
    const step = script[Math.min(index, script.length - 1)];
    index += 1;
    if (step instanceof Error) throw step;
    return { text: step.text, providerCostUsd: null };
  });
  return { calls };
}

function postVerdict(body: unknown): Request {
  return new Request('http://localhost/api/builder/verdict', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// The route's reply bound (REPLY_MAX / REPLY_TAIL_MAX / ELLIPSIS in
// lib/verdict/bounds.ts), imported from the shared module — the constants debt
// is closed by sharing one source, not by holding a second copy here.

// A judge that reads the prompt the way the real one is asked to: it approves
// only when the acceptance is visible in the reply it was handed. A head-sliced
// prompt therefore cannot produce a `yes`, which makes the verdict itself the
// assertion — not just the prompt text.
function judgingPersona(
  accept: string,
  brief = 'Welcome message on join',
): { calls: PersonaCall[] } {
  const calls: PersonaCall[] = [];
  let index = 0;
  __setPersonaCaller(async (messages, maxTokens) => {
    calls.push({ messages, maxTokens });
    const prompt = messages[0]?.content ?? '';
    const text =
      index === 0
        ? prompt.includes(accept)
          ? '{"verdict":"yes"}'
          : '{"verdict":"unclear"}'
        : brief;
    index += 1;
    return { text, providerCostUsd: null };
  });
  return { calls };
}

// The judge is handed `Reply:` + the view + `Answer with EXACTLY ...` joined by
// newlines, so the slice between those two labels, minus the one join newline on
// each side, is the exact bytes the judge read. Extracting it lets a test assert
// bytes rather than a substring that could also live in the plan.
function replyView(prompt: string): string {
  const block = prompt.slice(
    prompt.indexOf('Reply:') + 'Reply:'.length,
    prompt.indexOf('Answer with EXACTLY'),
  );
  return block.slice(1, -1);
}

/* The two guidance needles, re-declared here rather than imported, so a package
   side copy drift fails this suite — the same second-independent-copy idiom the
   refusal sentences above use. They are ASCII substrings of
   `TURKISH_VERDICT_GUIDANCE` / `TURKISH_BRIEF_GUIDANCE`
   (packages/ai/src/persona-prompt.ts), and they appear in NO other prompt: an
   English thread must stay byte-identical to the pre-F3 output, so their
   absence is asserted too. */
const VERDICT_GUIDANCE_NEEDLE = 'a Turkish yes is a yes';
const BRIEF_GUIDANCE_NEEDLE = 'write the requirement lines in Turkish';

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// --- Gate order: 401 → 403 (before body) → 422 → 404 ---

describe('POST /api/builder/verdict - gates', () => {
  it('returns 401 first when there is no session, without touching pool, boss or lane', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_OUT);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns() }));

    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({
      error: 'unauthorized',
      message: MSG_UNAUTHORIZED,
    });
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
    expect(persona.calls).toHaveLength(0);
  });

  it('checks the trial clock before the body, so a malformed request cannot mask it', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(EXPIRED_TRIAL);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: 'not-a-bot-id' }));

    expect(res.status).toBe(403);
    expect(await readBody(res)).toMatchObject({ error: 'trial_expired' });
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
    expect(persona.calls).toHaveLength(0);
  });

  it('returns 422 for a missing or malformed botId, without touching pool or boss', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }]);

    for (const body of [{}, { botId: 'not-a-bot-id' }, { botId: 42 }, { botId: null }]) {
      const res = await POST(postVerdict(body));
      expect(res.status).toBe(422);
      expect(await readBody(res)).toEqual({
        error: 'invalid bot id',
        message: MSG_INVALID_BOT,
      });
    }
    expect(db.calls).toHaveLength(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 422 for a malformed turns tail', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }]);

    const longTurns = Array.from({ length: 13 }, () => ({ role: 'user', content: 'hi' }));
    for (const turns of [
      longTurns,
      'not-an-array',
      [{ role: 'user', content: '' }],
      [{ role: 'user', content: 'x'.repeat(2001) }],
      [{ role: 'moderator', content: 'hi' }],
    ]) {
      const res = await POST(postVerdict({ botId: BOT, turns }));
      expect(res.status).toBe(422);
    }
    // Body validation runs before the ownership read: no pool query at all.
    expect(db.calls).toHaveLength(0);
  });

  it('returns 404 - never 403 - for a bot owned by someone else, without calling the lane', async () => {
    const db = fakeDb({ owned: false });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: FOREIGN_BOT, turns: planTurns() }));

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(await readBody(res)).toEqual({
      error: 'bot not found',
      message: MSG_BOT_NOT_FOUND,
    });
    expect(persona.calls).toHaveLength(0);
    expect(db.runs.size).toBe(0);
    expect(boss.record.startCalls).toBe(0);
  });

  it('returns 404 for a soft-deleted bot with the same predicate the worker uses', async () => {
    const db = fakeDb({ deleted: true });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns() }));

    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({
      error: 'bot not found',
      message: MSG_BOT_NOT_FOUND,
    });
    expect(persona.calls).toHaveLength(0);
    expect(db.runs.size).toBe(0);
    expect(boss.record.startCalls).toBe(0);
    const ownership = db.calls.find((call) => call.text.includes('FROM bots'));
    expect(ownership?.text).toContain('deleted_at IS NULL');
  });
});

// --- 409: no plan was ever asked ---

describe('POST /api/builder/verdict - no plan asked', () => {
  it('returns 409 with no row, no job and no model call when no ask line exists', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'user', content: 'I want a welcome bot' },
          { role: 'assistant', content: 'Tell me more about the welcome message.' },
          { role: 'user', content: 'yes' },
        ],
      }),
    );

    expect(res.status).toBe(409);
    expect(await readBody(res)).toEqual({ error: 'no_plan_asked', message: MSG_NO_PLAN });
    // A bare "yes" with no plan asked starts nothing: no lane call, no row,
    // no job — and no spend row, because no model call ran.
    expect(persona.calls).toHaveLength(0);
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(spendInserts(db.calls)).toHaveLength(0);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('returns 409 when the thread has no assistant turn at all', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: [{ role: 'user', content: 'yes' }] }));

    expect(res.status).toBe(409);
    expect(builderInserts(db.calls)).toHaveLength(0);
  });

  // Regression: the plan turn is a normal chat turn, and chat accepts 2000-char
  // history turns. A cap tighter than that rejected the plan outright (422 on a
  // direct call) or, once the ask line fell outside a head-truncated copy, judged
  // it as "no plan asked" — the user said yes and nothing started, silently.
  it('accepts a long plan turn whose END carries the ask line, and judges its end', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    // 1500 chars, ask line at the very end — the shape a real plan has.
    const plan = `${'P'.repeat(1500 - ASK.length - 1)} ${ASK}`;
    expect(plan.length).toBe(1500);
    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'user', content: 'I want a welcome bot' },
          { role: 'assistant', content: plan },
          { role: 'user', content: 'yes, build it' },
        ],
      }),
    );

    // Reached the judge: neither a 422 nor the ask-line 409.
    expect(res.status).not.toBe(422);
    expect(res.status).not.toBe(409);
    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
    // The ask-line check saw the plan's END: the billed plan view carries it.
    expect(persona.calls[0].messages[0].content).toContain(ASK);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('still answers 409 when the ask line is buried outside the kept END', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    // The ask line sits in the dropped MIDDLE of a 1227-char turn — a turn that
    // never was the plan the prompt asks for (the line ends the plan, it does
    // not sit inside it), so the gate must still refuse it.
    const plan = `${'x'.repeat(600)}${ASK}${'y'.repeat(600)}`;
    expect(plan.length).toBeGreaterThan(1000);
    const res = await POST(
      postVerdict({ botId: BOT, turns: [{ role: 'assistant', content: plan }] }),
    );

    expect(res.status).toBe(409);
    expect(await readBody(res)).toEqual({ error: 'no_plan_asked', message: MSG_NO_PLAN });
    expect(persona.calls).toHaveLength(0);
  });

  // The gate is language-independent: the persona prompt locks the English ask
  // line, but the model answers a Turkish owner in Turkish. A plan the owner can
  // plainly read must not be refused for its language — and the refusal has to
  // name the reason when it does refuse.
  it('accepts a Turkish plan ending, with and without diacritics', async () => {
    for (const ask of [ASK_TR, ASK_TR_ASCII]) {
      const db = fakeDb();
      __setPool(db.pool);
      const boss = stubBoss();
      __setBossFactory(boss.factory);
      __setSessionReader(SIGNED_IN);
      const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

      const res = await POST(
        postVerdict({
          botId: BOT,
          turns: [
            { role: 'assistant', content: ask },
            { role: 'user', content: 'evet' },
          ],
        }),
      );

      expect(res.status).toBe(200);
      expect(persona.calls).toHaveLength(1);
      expect(db.runs.size).toBe(0);
      expect(boss.record.sent).toHaveLength(0);
    }
  });

  it('accepts the ask line whatever its letter case', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'assistant', content: ASK_TR_ALT },
          { role: 'user', content: 'evet' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
  });

  it('accepts a Turkish ask line uppercased with a dotted capital İ', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'assistant', content: ASK_TR_DOTTED_CAPS },
          { role: 'user', content: 'evet' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
  });

  it('still refuses a Turkish plan with no ask line at all, and says why', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    // Turkish, plan-shaped, but it never asks the question — the control that
    // keeps the widened gate from degrading into "any Turkish turn passes".
    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'assistant', content: 'Planı hazırladım. İstersen başka bir şey ekleyebilirim.' },
          { role: 'user', content: 'evet' },
        ],
      }),
    );

    expect(res.status).toBe(409);
    expect(await readBody(res)).toEqual({ error: 'no_plan_asked', message: MSG_NO_PLAN });
    expect(persona.calls).toHaveLength(0);
  });

  it('still accepts the locked English ask line', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes, go ahead') }));

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
  });
});

// --- Verdict no / unclear: 200, started:false, NO row, NO job ---

describe('POST /api/builder/verdict - no and unclear start nothing', () => {
  it('answers unclear with started:false and zero builder INSERTs', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"unclear"}' }]);

    const res = await POST(
      postVerdict({ botId: BOT, turns: planTurns('maybe, what would it cost?') }),
    );

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ verdict: 'unclear', started: false });
    expect(persona.calls).toHaveLength(1);
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(boss.record.sent).toHaveLength(0);
    // The verdict call itself is metered as persona-run spend.
    expect(spendInserts(db.calls)).toHaveLength(1);
  });

  it('answers no with started:false and zero builder INSERTs', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(
      postVerdict({ botId: BOT, turns: planTurns('no, let me change the plan') }),
    );

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ verdict: 'no', started: false });
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('reads garbage model JSON as unclear without throwing', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);

    for (const garbage of [
      'Sure, sounds good!',
      '{"verdict": "maybe"}',
      '{"verdict":"yes"',
      '```json\n{"verdict":"yes"}\n```',
      '',
    ]) {
      stubPersona([{ text: garbage }]);
      const res = await POST(postVerdict({ botId: BOT, turns: planTurns() }));
      expect(res.status).toBe(200);
      expect(await readBody(res)).toEqual({ verdict: 'unclear', started: false });
    }
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('caps the billed verdict input: plan to 1000 chars, reply to 500', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    // Boundary: a turn at the body's own limit (2000 chars — the same bound
    // POST /api/chat accepts for history) is billed as exactly PLAN_MAX chars,
    // and the ask line at its end survives into the prompt.
    const plan = `${'P'.repeat(2000 - ASK.length - 1)} ${ASK}`;
    const reply = 'R'.repeat(500);
    expect(plan.length).toBe(2000);
    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'assistant', content: plan },
          { role: 'user', content: reply },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
    const prompt = persona.calls[0].messages[0].content;
    expect(prompt).toContain(ASK);
    expect(prompt).toContain(reply);
    // The billed plan text is the 1000-char kept-ends view, never the raw turn.
    const planBlock = prompt.slice(
      prompt.indexOf('Plan:') + 'Plan:'.length,
      prompt.indexOf('Reply:'),
    );
    expect(planBlock.trim().length).toBe(1000);
  });
});

// --- The user's reply: the acceptance at its END must reach the judge ---
//
// Regression: the reply was head-sliced (`reply.slice(0, REPLY_MAX)`), the
// mirror image of the plan-turn defect. A person writes their reasoning first
// and decides last, so a reply longer than the bound handed the judge everything
// except the acceptance it was asked to judge — the verdict came back `unclear`
// and saying yes started nothing. The reply now goes through the same kept-ends
// view as the plan turn.

describe('POST /api/builder/verdict - the reply keeps its END', () => {
  it('judges a >500-char reply whose acceptance is at the END as yes, and starts the run', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    // 560 chars of reasoning, then the acceptance — so the acceptance starts
    // past REPLY_MAX and a head-only view of the reply cannot contain it.
    const accept = 'yes, go ahead';
    const reply = `${'context '.repeat(70)}${accept}`;
    expect(reply.length).toBeGreaterThan(REPLY_MAX);
    expect(reply.indexOf(accept)).toBeGreaterThan(REPLY_MAX);
    const persona = judgingPersona(accept);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns(reply) }));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    // The judge said yes because it could SEE the acceptance, and yes starts
    // the run: a row and a queued job, not a silent no-op.
    expect(body).toMatchObject({ phase: 'queued', verdict: 'yes' });
    expect(typeof body.runId).toBe('string');
    expect(db.runs.size).toBe(1);
    expect(boss.record.sent).toHaveLength(1);
    // Two lane calls: the verdict, then the brief.
    expect(persona.calls).toHaveLength(2);
    // The judge read the acceptance itself, not a truncation of it.
    expect(replyView(persona.calls[0].messages[0].content)).toContain(accept);
  });

  it('bills an over-bound reply as exactly REPLY_MAX chars, acceptance included', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const accept = 'yes, build it';
    const reply = `${'x'.repeat(600)} ${accept}`;
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns(reply) }));

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
    // Exactly REPLY_MAX, so the fix buys the tail by dropping the middle and the
    // billed input does not grow by a character.
    const view = replyView(persona.calls[0].messages[0].content);
    expect(view.length).toBe(REPLY_MAX);
    expect(view).toContain(ELLIPSIS);
    expect(view).toContain(accept);
    // The kept END is the reply's own last REPLY_TAIL chars, verbatim: that is
    // the half of the view the acceptance lives in.
    expect(view.endsWith(reply.slice(-REPLY_TAIL))).toBe(true);
    // The kept head is the view's head, not the reply's whole reasoning.
    expect(view.startsWith('x')).toBe(true);
    expect(view.endsWith(accept)).toBe(true);
  });

  it('sends an in-bound reply to the judge byte-identical, with no marker', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const reply = 'y'.repeat(REPLY_MAX);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns(reply) }));

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
    const view = replyView(persona.calls[0].messages[0].content);
    // At the boundary the view is the raw reply: a view that fits is never
    // rewritten, so an ordinary reply is billed exactly as written.
    expect(view).toBe(reply);
    expect(view).not.toContain(ELLIPSIS);
  });
});

// --- Verdict yes: brief, row, job ---

describe('POST /api/builder/verdict - yes starts the build', () => {
  it('writes the brief, inserts the run and sends the locked job shape', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([
      { text: '{"verdict":"yes"}' },
      { text: 'Welcome message on join\nModeration log channel [default]' },
    ]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes, build it') }));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.phase).toBe('queued');
    expect(body.verdict).toBe('yes');
    expect(typeof body.runId).toBe('string');
    const runId = String(body.runId);
    expect(body.briefChars).toBe(
      'Welcome message on join\nModeration log channel [default]'.length,
    );
    expect(db.runs.get(runId)).toMatchObject({ botId: BOT, phase: 'queued' });
    expect(boss.record.startCalls).toBe(1);
    expect(boss.record.stopCalls).toBe(1);
    expect(boss.record.created).toEqual([BUILDER_QUEUE]);
    expect(BUILDER_QUEUE).toBe('builder');
    expect(boss.record.sent).toHaveLength(1);
    const sent = boss.record.sent[0];
    expect(sent.name).toBe(BUILDER_QUEUE);
    expect(sent.data).toEqual({
      runId,
      botId: BOT,
      brief: 'Welcome message on join\nModeration log channel [default]',
    });
    expect(sent.options).toEqual({
      singletonKey: runId,
      retryLimit: 3,
      retryDelay: 30,
      expireInSeconds: 3600,
      deleteAfterSeconds: 604800,
    });
    // Both model calls metered as persona-run spend.
    expect(spendInserts(db.calls)).toHaveLength(2);
  });

  it('clamps the brief to 2000 chars on a long thread', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }, { text: `line\n${'x'.repeat(3000)}` }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(Number(body.briefChars)).toBeLessThanOrEqual(2000);
    const sent = boss.record.sent[0].data as { brief: string };
    expect(sent.brief.length).toBeLessThanOrEqual(2000);
  });

  it('returns 422 empty_brief with no row and no job when the brief clamps to nothing', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }, { text: '   ' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(422);
    expect(await readBody(res)).toEqual({ error: 'empty_brief', message: MSG_EMPTY_BRIEF });
    expect(db.runs.size).toBe(0);
    expect(boss.record.sent).toHaveLength(0);
  });

  it('lets a paid tier past an expired clock', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(EXPIRED_PAID);
    stubPersona([{ text: '{"verdict":"yes"}' }, { text: 'Welcome message on join' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toMatchObject({ phase: 'queued', verdict: 'yes' });
    expect(boss.record.sent).toHaveLength(1);
  });

  it('marks the run failed and returns a generic 500 when send throws', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss({ send: new Error('pg exploded') });
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }, { text: 'Welcome message on join' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({
      error: 'could not start build',
      message: MSG_START_FAILED,
    });
    expect(boss.record.stopCalls).toBe(1);
    const run = [...db.runs.values()][0];
    expect(run?.phase).toBe('failed');
    expect(run?.detail).toEqual({ error: 'enqueue_failed' });
  });

  it('marks the run failed and returns a generic 500 when send resolves to null', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss({ send: null });
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }, { text: 'Welcome message on join' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({
      error: 'could not start build',
      message: MSG_START_FAILED,
    });
    const run = [...db.runs.values()][0];
    expect(run?.phase).toBe('failed');
  });

  it('returns an honest 500 with no row when the lane itself fails', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([new Error('all routes down')]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(500);
    expect(db.runs.size).toBe(0);
    expect(boss.record.sent).toHaveLength(0);
  });
});

// --- KI-033 monthly allowance: the verdict path bills, so it pre-authorizes ---

describe('POST /api/builder/verdict - monthly allowance', () => {
  it('refuses an exhausted allowance with the chat route copy, no lane call, no rows', async () => {
    // The verdict estimate is 1.1264 credits, so 99.99 leaves no headroom
    // (99.99 + 1.1264 = 101.1164 > 100). The stub returns the SUM as a STRING
    // because Postgres hands a numeric back that way.
    const db = fakeDb({ spent: '99.99' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }, { text: 'Welcome message' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes, build it') }));

    expect(res.status).toBe(403);
    expect(await readBody(res)).toEqual({
      error: 'trial_budget_exceeded',
      // Byte-identical to app/api/chat/route.ts's trial branch.
      message: 'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.',
    });
    // A refused request makes NO model call and writes NO row of either kind.
    expect(persona.calls).toHaveLength(0);
    expect(builderInserts(db.calls)).toHaveLength(0);
    expect(spendInserts(db.calls)).toHaveLength(0);
    expect(boss.record.sent).toHaveLength(0);
    expect(db.runs.size).toBe(0);
  });

  it('reads the allowance BEFORE the ask-line gate, so a refused account never reaches the model', async () => {
    const db = fakeDb({ spent: '100' });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    // No ask line anywhere: with the allowance already written it must still be
    // the allowance refusal the caller sees, because the budget gate sits with
    // the other pre-model gates and not behind the 409.
    const res = await POST(
      postVerdict({ botId: BOT, turns: [{ role: 'user', content: 'hello' }] }),
    );

    expect(res.status).toBe(403);
    expect(await readBody(res)).toMatchObject({ error: 'trial_budget_exceeded' });
    expect(persona.calls).toHaveLength(0);
    expect(allowanceReads(db.calls)).toHaveLength(1);
  });

  it('lets a call landing exactly on the allowance through', async () => {
    // 98.87 + 1.1264 = 99.9964 lands just inside; the boundary is precise:
    // spent + estimate <= allowance is allowed, and 99.99 is not.
    const db = fakeDb({ spent: '98.87' });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('no thanks') }));

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
  });

  it('refuses with a 500 when the allowance read fails, never a model call', async () => {
    const db = fakeDb({ failSpent: true });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

      // An unreadable meter is a failure to check, not a verdict: the route never
      // reports "exceeded" for something it could not read, and never lets the
      // call through unchecked.
      expect(res.status).toBe(500);
      expect(await readBody(res)).toEqual({
        error: 'could not check your AI credits',
        message: MSG_CREDITS_CHECK,
      });
      expect(persona.calls).toHaveLength(0);
      expect(spendInserts(db.calls)).toHaveLength(0);
      // The cause is logged, so an unreadable meter is diagnosable.
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it('answers the unconfigured-DB allowance failure with the Turkish sentence, not the bare code', async () => {
    const db = fakeDb({ dbNotConfigured: true });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    // Same condition the ownership read maps by hand above: code unchanged,
    // sentence in Turkish. A bare 'database not configured' is never what the
    // owner reads.
    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({
      error: 'database not configured',
      message: MSG_DB_NOT_CONFIGURED,
    });
    expect(persona.calls).toHaveLength(0);
  });

  it('answers the unconfigured-DB ownership read with the Turkish sentence', async () => {
    const db = fakeDb({ dbNotConfiguredOnOwnership: true });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(500);
    expect(await readBody(res)).toEqual({
      error: 'database not configured',
      message: MSG_DB_NOT_CONFIGURED,
    });
    expect(persona.calls).toHaveLength(0);
  });

  it('names the resolved paid allowance instead of the trial sentence', async () => {
    const db = fakeDb({ spent: '100000' });
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    // A paid account that is past its grant must not be told its trial ended.
    __setSessionReader(EXPIRED_PAID);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes') }));

    expect(res.status).toBe(403);
    expect(await readBody(res)).toEqual({
      error: 'trial_budget_exceeded',
      message: "This month's 2000 AI credits are used up. Nothing is deleted.",
    });
    expect(persona.calls).toHaveLength(0);
  });

  it('meters both allowed calls and still starts the build', async () => {
    const db = fakeDb({ spent: '0' });
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    stubPersona([{ text: '{"verdict":"yes"}' }, { text: 'Welcome message on join' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes, build it') }));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toMatchObject({ phase: 'queued', verdict: 'yes' });
    // The allowance is consulted once, and both persona calls stay metered.
    expect(allowanceReads(db.calls)).toHaveLength(1);
    expect(spendInserts(db.calls)).toHaveLength(2);
    expect(boss.record.sent).toHaveLength(1);
  });
});

// --- The two persona calls, judged as PAYLOADS ------------------------------
//
// Two defects met at these exact two call sites, so both are pinned from the
// outside, on the bytes a stub captures:
//
// 1. SHAPE: both calls posted a system-only message array. The GLM backend
//    rejects a payload of system turns alone (HTTP 400 / code 1214), so the
//    judge call 500'd on every thread, in every language, before the model ran
//    — and the brief call was queued to 500 the moment a verdict said yes.
//    Every other lane caller in the repo already ends with a user turn; these
//    two were the only ones that did not.
// 2. LANGUAGE: both prompts take an optional language and append their Turkish
//    guidance only for 'turkish' — and neither call site passed it, so the
//    guidance was unreachable in production while a Turkish thread got judged
//    by English rules. The language is derived route-side from the turn text
//    (the body carries `{ botId, turns }` only) and must NOT misfire on an
//    ASCII-only thread: the guidance lands inside the block the reply-view pins
//    above slice between `Reply:` and `Answer with EXACTLY`, so a false
//    'turkish' would grow the billed English view.
describe('POST /api/builder/verdict - the persona calls carry shape and language', () => {
  it('hands the judge Turkish guidance when the owner wrote Turkish', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'user', content: 'Merhaba, bir karsilama botu istiyorum' },
          { role: 'assistant', content: 'Plan hazır. Başlayayım mı?' },
          { role: 'user', content: 'evet' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
    // Derived 'turkish' from the turn text, so the judge is handed the locked
    // acceptance vocabulary (olur / baslayabilirsin / sen karar ver).
    expect(persona.calls[0].messages[0].content).toContain(VERDICT_GUIDANCE_NEEDLE);
    // And the array is closed with a user turn, so the provider accepts it.
    expect(persona.calls[0].messages.at(-1)).toMatchObject({
      role: 'user',
    });
    expect(persona.calls[0].messages.at(-1)?.content.length).toBeGreaterThan(0);
  });

  it('hands the brief writer Turkish guidance on a Turkish yes', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([
      { text: '{"verdict":"yes"}' },
      { text: 'Karsilama mesaji [default]' },
    ]);

    const res = await POST(
      postVerdict({
        botId: BOT,
        turns: [
          { role: 'user', content: 'Merhaba, bir karsilama botu istiyorum' },
          { role: 'assistant', content: 'Plan hazır. Başlayayım mı?' },
          { role: 'user', content: 'evet' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(await readBody(res)).toMatchObject({ phase: 'queued', verdict: 'yes' });
    // Two calls: the verdict, then the brief — and the brief carries the Turkish
    // wording rules, which is the call whose guidance was dropped one call later.
    expect(persona.calls).toHaveLength(2);
    expect(persona.calls[1].messages[0].content).toContain(BRIEF_GUIDANCE_NEEDLE);
    expect(persona.calls[1].messages.at(-1)).toMatchObject({ role: 'user' });
    expect(persona.calls[1].messages.at(-1)?.content.length).toBeGreaterThan(0);
    // The build still starts: the shape fix is what lets `yes` survive.
    expect(boss.record.sent).toHaveLength(1);
  });

  it('keeps an ASCII-only thread on the byte-identical English prompt', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    __setBossFactory(stubBoss().factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"no"}' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns() }));

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(1);
    // The negative half of the derivation: an ASCII English thread is never
    // guided, which is what keeps the reply-view byte pins above green.
    expect(persona.calls[0].messages[0].content).not.toContain(VERDICT_GUIDANCE_NEEDLE);
    expect(persona.calls[0].messages[0].content).not.toContain(BRIEF_GUIDANCE_NEEDLE);
    // The English path also keeps the prompt's own shape: guidance, when it is
    // absent, leaves the two landmarks exactly where they were.
    expect(persona.calls[0].messages[0].content).toContain('Answer with EXACTLY');
  });

  it('closes both message arrays with a non-empty user turn', async () => {
    const db = fakeDb();
    __setPool(db.pool);
    const boss = stubBoss();
    __setBossFactory(boss.factory);
    __setSessionReader(SIGNED_IN);
    const persona = stubPersona([{ text: '{"verdict":"yes"}' }, { text: 'Welcome message' }]);

    const res = await POST(postVerdict({ botId: BOT, turns: planTurns('yes, build it') }));

    expect(res.status).toBe(200);
    expect(persona.calls).toHaveLength(2);
    for (const call of persona.calls) {
      // System first (the prompt), user last (the provider's contract): the
      // system-only shape is what the GLM backend refuses with 400 / 1214.
      expect(call.messages[0].role).toBe('system');
      expect(call.messages.at(-1)).toMatchObject({ role: 'user' });
      expect(call.messages.at(-1)?.content.trim().length).toBeGreaterThan(0);
    }
    expect(boss.record.sent).toHaveLength(1);
  });
});
