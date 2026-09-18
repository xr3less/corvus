// Golden-brief spec-quality eval — offline, key-free, deterministic.
//
// Every case runs against a stubbed chat(): no provider SDK, no fetch, no
// API key. The suite gates the PROMPT + SCHEMA CONTRACT (does the builder
// prompt still demand one fenced v1 envelope, and does the contract still
// reject hostile/vague drafts safely), NOT model quality. A live
// model-quality eval is explicitly out of scope for this harness.
//
// The fetch tripwire below makes the "no network" claim testable rather than
// asserted in a comment: any accidental network call fails the suite.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSpec } from '@corvus/spec';
import type { BehaviorSpecV0 } from '@corvus/spec';
import { buildBuilderPrompt } from '../builder-prompt.js';
import type { LaneName } from '../lanes.js';
import type { ChatMessage, ChatResult } from '../router.js';
import {
  GOLDEN_BRIEFS,
  MAX_BEHAVIORS,
  MIN_BEHAVIORS,
  RAMBLE_BRIEF,
  checkDraft,
  checkProductDraft,
  extractFencedJson,
} from './golden-briefs.js';
import type { DraftCheckResult, GoldenBrief } from './golden-briefs.js';

/**
 * The validity contract under test, expressed independently of the harness:
 * the same extract -> JSON.parse -> parseSpec path the live worker runs. The
 * golden expectations are derived from THIS verdict, never hardcoded, so the
 * eval and parseSpec cannot drift apart silently.
 */
type ParseSpecVerdict =
  | { readonly ok: true; readonly spec: BehaviorSpecV0 }
  | { readonly ok: false; readonly reason: 'bad_model_json' | 'bad_spec' };

function parseSpecVerdict(text: string): ParseSpecVerdict {
  let raw: unknown;
  try {
    raw = JSON.parse(extractFencedJson(text)) as unknown;
  } catch {
    return { ok: false, reason: 'bad_model_json' };
  }
  try {
    return { ok: true, spec: parseSpec(raw) };
  } catch {
    return { ok: false, reason: 'bad_spec' };
  }
}

const PROVIDER_KEY_ENVS = [
  'WIRO_API_KEY',
  'OPENROUTER_API_KEY',
  'ZAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'WIRO_BASE_URL',
] as const;

let savedEnv: Record<string, string | undefined> = {};
let savedFetch: typeof fetch | undefined;
let stubCalls = 0;

beforeAll(() => {
  savedEnv = {};
  for (const key of PROVIDER_KEY_ENVS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  savedFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('spec-eval attempted a network call — the eval must stay offline');
  }) as unknown as typeof fetch;
});

afterAll(() => {
  for (const key of PROVIDER_KEY_ENVS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (savedFetch !== undefined) {
    globalThis.fetch = savedFetch;
  }
});

/** Stubbed chat(): same shape as the router result, canned text, no transport. */
function stubChat(options: {
  readonly lane: LaneName;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens: number;
  readonly canned: string;
}): ChatResult {
  stubCalls += 1;
  const system = options.messages[0];
  const user = options.messages[1];
  if (system === undefined || user === undefined) {
    throw new Error('stubChat: expected a system prompt and a user brief');
  }
  return {
    text: options.canned,
    model: 'stub-model',
    lane: options.lane,
    providerCostUsd: null,
    attempts: [{ label: 'stub', ok: true, latencyMs: 0 }],
  };
}

function messagesFor(brief: GoldenBrief): ChatMessage[] {
  return [
    { role: 'system', content: buildBuilderPrompt() },
    { role: 'user', content: brief.brief },
  ];
}

function runBrief(brief: GoldenBrief): DraftCheckResult {
  const result = stubChat({
    lane: 'builder',
    messages: messagesFor(brief),
    maxTokens: 6000,
    canned: brief.stubOutput,
  });
  return checkDraft(result.text);
}

describe('golden-brief spec-quality eval (offline, stubbed chat)', () => {
  it('ships exactly 3 valid and 3 adversarial briefs with unique ids', () => {
    const valid = GOLDEN_BRIEFS.filter((brief) => brief.kind === 'valid');
    const adversarial = GOLDEN_BRIEFS.filter((brief) => brief.kind === 'adversarial');
    expect(valid).toHaveLength(3);
    expect(adversarial).toHaveLength(3);
    expect(new Set(GOLDEN_BRIEFS.map((brief) => brief.id)).size).toBe(GOLDEN_BRIEFS.length);
  });

  it('passes the real builder prompt and the brief to the stubbed chat', () => {
    const messages = messagesFor(GOLDEN_BRIEFS[0] as GoldenBrief);
    expect(messages[0]?.content).toBe(buildBuilderPrompt());
    expect(messages[1]?.content).toBe((GOLDEN_BRIEFS[0] as GoldenBrief).brief);
    expect(buildBuilderPrompt()).toContain('```json');
    expect(buildBuilderPrompt()).toContain('"behaviors"');
    expect(buildBuilderPrompt()).toContain('no prose outside the fence');
  });

  it('sends every golden brief through the stub without needing a key', () => {
    for (const key of PROVIDER_KEY_ENVS) {
      expect(process.env[key]).toBeUndefined();
    }
    const before = stubCalls;
    for (const brief of GOLDEN_BRIEFS) {
      runBrief(brief);
    }
    expect(stubCalls).toBe(before + GOLDEN_BRIEFS.length);
  });

  it('really is a 2000+ character ramble', () => {
    expect(RAMBLE_BRIEF.length).toBeGreaterThanOrEqual(2000);
  });

  for (const brief of GOLDEN_BRIEFS) {
    it(`${brief.id} [${brief.kind}] matches parseSpec's verdict`, () => {
      const result = runBrief(brief);
      const verdict = parseSpecVerdict(brief.stubOutput);

      // (1) Harness parity: checkDraft accepts/rejects exactly as parseSpec.
      expect(result.ok).toBe(verdict.ok);
      if (verdict.ok) {
        if (!result.ok) return;
        expect(result.spec).toStrictEqual(verdict.spec);
        expect(result.behaviorCount).toBe(verdict.spec.behaviors.length);
      } else {
        if (result.ok) return;
        expect(result.reason).toBe(verdict.reason);
      }

      // (2) The golden brief's declared expectation matches the real verdict.
      if (verdict.ok) {
        expect(brief.expect.outcome).toBe('accepted');
        if (brief.expect.outcome !== 'accepted') return;
        expect(brief.expect.behaviorCount).toBe(verdict.spec.behaviors.length);
      } else {
        expect(brief.expect.outcome).toBe('rejected');
        if (brief.expect.outcome !== 'rejected') return;
        expect(brief.expect.reason).toBe(verdict.reason);
      }
    });
  }

  it('keeps the injection marker present in the canned output (non-vacuous case)', () => {
    const injection = GOLDEN_BRIEFS.find((brief) => brief.id === 'injection');
    expect(injection).toBeDefined();
    if (injection === undefined) return;
    expect(injection.stubOutput.toLowerCase()).toContain('system prompt');
    const result = checkDraft(injection.stubOutput);
    expect(result).toEqual({ ok: false, reason: 'bad_spec' });
  });

  it('never throws on any golden output, valid or hostile', () => {
    for (const brief of GOLDEN_BRIEFS) {
      expect(() => checkDraft(brief.stubOutput)).not.toThrow();
    }
  });
});

describe('checkDraft mirrors parseSpec (direct, no model)', () => {
  function envelope(behaviors: unknown[]): string {
    return `\`\`\`json\n${JSON.stringify({ version: 1, behaviors })}\n\`\`\``;
  }

  it('accepts a bare JSON body with no fence (gateway fallback)', () => {
    const text = JSON.stringify({ version: 1, behaviors: [{ kind: 'greeting' }] });
    expect(checkDraft(text)).toMatchObject({ ok: true, behaviorCount: 1 });
  });

  it('accepts a plain ``` fence without the json tag', () => {
    const text = `\`\`\`\n${JSON.stringify({ version: 1, behaviors: [{ kind: 'greeting' }] })}\n\`\`\``;
    expect(checkDraft(text)).toMatchObject({ ok: true, behaviorCount: 1 });
  });

  it('rejects prose with no JSON at all', () => {
    expect(checkDraft('Sorry, I need more detail.')).toEqual({
      ok: false,
      reason: 'bad_model_json',
    });
  });

  it('rejects a spec with a wrong version', () => {
    expect(checkDraft(`\`\`\`json\n{"version":2,"behaviors":[{"kind":"x"}]}\n\`\`\``)).toEqual({
      ok: false,
      reason: 'bad_spec',
    });
  });

  it('rejects non-object JSON', () => {
    expect(checkDraft('null')).toEqual({ ok: false, reason: 'bad_spec' });
    expect(checkDraft('42')).toEqual({ ok: false, reason: 'bad_spec' });
  });

  // Failing-first regression: parseSpec ACCEPTS empty/missing behaviors
  // (`behaviors` has `.default([])`), while the old checkDraft rejected both
  // here as `behaviors_out_of_range`.
  it('accepts zero behaviors and missing behaviors (parseSpec default [])', () => {
    expect(checkDraft(envelope([]))).toStrictEqual({
      ok: true,
      behaviorCount: 0,
      spec: { version: 1, behaviors: [] },
    });
    expect(checkDraft('{"version":1}')).toStrictEqual({
      ok: true,
      behaviorCount: 0,
      spec: { version: 1, behaviors: [] },
    });
  });

  // Failing-first regression: parseSpec entries are z.unknown, so entries
  // without a `kind` were mis-rejected by the old checkDraft as
  // `entry_missing_kind`.
  it('accepts opaque entries without a kind (parseSpec z.unknown)', () => {
    expect(checkDraft(envelope([{ title: 'no kind' }]))).toMatchObject({
      ok: true,
      behaviorCount: 1,
    });
    expect(checkDraft(envelope([null]))).toMatchObject({ ok: true, behaviorCount: 1 });
    expect(checkDraft(envelope(['free text']))).toMatchObject({ ok: true, behaviorCount: 1 });
  });

  // Failing-first regression: parseSpec imposes NO upper count bound.
  it('accepts more than 20 behaviors (parseSpec has no count bound)', () => {
    const behaviors = Array.from({ length: 21 }, (_unused, index) => ({ kind: `kind-${index}` }));
    expect(checkDraft(envelope(behaviors))).toMatchObject({ ok: true, behaviorCount: 21 });
  });

  it('rejects a non-array behaviors value (the genuinely invalid shape)', () => {
    expect(checkDraft('{"version":1,"behaviors":"not-an-array"}')).toEqual({
      ok: false,
      reason: 'bad_spec',
    });
  });

  it('rejects a truncated JSON block rather than half-parsing it', () => {
    expect(checkDraft('```json\n{"version":1,"behaviors":[{"kind":"x"}]')).toEqual({
      ok: false,
      reason: 'bad_model_json',
    });
  });

  it('parity holds for every golden fixture (verdict derived, never hardcoded)', () => {
    for (const brief of GOLDEN_BRIEFS) {
      const result = checkDraft(brief.stubOutput);
      const verdict = parseSpecVerdict(brief.stubOutput);
      expect(result.ok).toBe(verdict.ok);
    }
  });
});

// NON-GATING: this documents the stricter *product aspiration* so it stays
// executable and named. The golden briefs deliberately assert checkDraft
// (parseSpec parity); nothing in the pipeline may gate on checkProductDraft.
describe('checkProductDraft is stricter than parseSpec (non-gating aspiration)', () => {
  function envelope(behaviors: unknown[]): string {
    return `\`\`\`json\n${JSON.stringify({ version: 1, behaviors })}\n\`\`\``;
  }

  it('enforces the 1..20 bound that parseSpec does not', () => {
    expect(MIN_BEHAVIORS).toBe(1);
    expect(MAX_BEHAVIORS).toBe(20);
    expect(checkDraft(envelope([]))).toMatchObject({ ok: true });
    expect(checkProductDraft(envelope([]))).toEqual({
      ok: false,
      reason: 'behaviors_out_of_range',
    });
    const twentyOne = Array.from({ length: 21 }, (_unused, index) => ({ kind: `kind-${index}` }));
    expect(checkDraft(envelope(twentyOne))).toMatchObject({ ok: true });
    expect(checkProductDraft(envelope(twentyOne))).toEqual({
      ok: false,
      reason: 'behaviors_out_of_range',
    });
  });

  it('enforces a non-empty kind string that parseSpec does not', () => {
    expect(checkDraft(envelope([{ title: 'no kind' }]))).toMatchObject({ ok: true });
    expect(checkProductDraft(envelope([{ title: 'no kind' }]))).toEqual({
      ok: false,
      reason: 'entry_missing_kind',
    });
    expect(checkProductDraft(envelope([{ kind: '   ' }]))).toEqual({
      ok: false,
      reason: 'entry_missing_kind',
    });
    expect(checkProductDraft(envelope([null]))).toEqual({
      ok: false,
      reason: 'entry_missing_kind',
    });
    expect(checkProductDraft(envelope(['free text']))).toEqual({
      ok: false,
      reason: 'entry_missing_kind',
    });
  });

  it('accepts exactly 20 all-kind behaviors (upper bound inclusive)', () => {
    const behaviors = Array.from({ length: 20 }, (_unused, index) => ({ kind: `kind-${index}` }));
    expect(checkProductDraft(envelope(behaviors))).toMatchObject({ ok: true, behaviorCount: 20 });
  });

  it('passes through the same parseSpec rejections as checkDraft', () => {
    expect(checkProductDraft('null')).toEqual({ ok: false, reason: 'bad_spec' });
    expect(checkProductDraft('not json')).toEqual({ ok: false, reason: 'bad_model_json' });
  });

  it('documents the delta explicitly without leaking it into the gate', () => {
    const draft = envelope([{ title: 'opaque' }]);
    expect(checkDraft(draft)).toMatchObject({ ok: true, behaviorCount: 1 });
    expect(checkProductDraft(draft)).toEqual({ ok: false, reason: 'entry_missing_kind' });
  });
});
