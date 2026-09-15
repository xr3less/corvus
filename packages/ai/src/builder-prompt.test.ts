// Moved from apps/web/lib/ai/builder-prompt.test.ts with the builder prompt.
// Tests for the builder system prompt + the parseSpec drift net (T-validate).
//
// The drift net below imports parseSpec from @corvus/spec and pins it
// against the EXACT envelope shapes the routes mint:
// - apps/web/app/api/interview/answer/route.ts (~line 132): done-mint builds
//   `{ version: 1, behaviors: entries.map((entry) => ({ question, answer })) }`
// - apps/web/app/api/spec/patch/route.ts (~line 119): patch-mint builds
//   `{ version: 1, behaviors }` from the validated patch body.
// If either side changes shape, this test names both files.
import { describe, expect, it } from 'vitest';
import { parseSpec } from '@corvus/spec';
import { buildBuilderPrompt, BUILDER_CALL_PARAMS } from './builder-prompt.js';

describe('buildBuilderPrompt one-liners', () => {
  it('states the withResponse shape (resource.message, never bare message)', () => {
    const prompt = buildBuilderPrompt();
    expect(prompt).toContain('withResponse');
    expect(prompt).toContain('resource.message');
  });

  it('requires fetching partial channels before reading them', () => {
    const prompt = buildBuilderPrompt();
    expect(prompt).toContain('partial');
    expect(prompt).toContain('fetch');
  });

  it('states the handler-module contract (gateway owns subscription)', () => {
    const prompt = buildBuilderPrompt();
    expect(prompt).toContain('gateway owns');
    expect(prompt).toContain('client.on');
  });

  it('defaults registration to per-guild, never global', () => {
    const prompt = buildBuilderPrompt();
    expect(prompt).toContain('guild');
    expect(prompt).toContain('global');
  });

  it('directs the model to emit one fenced json spec block', () => {
    const prompt = buildBuilderPrompt();
    expect(prompt).toContain('```json');
    expect(prompt).toContain('"behaviors"');
    expect(prompt).toContain('no prose outside the fence');
  });

  it('returns a single non-empty string', () => {
    const prompt = buildBuilderPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.trim().length).toBeGreaterThan(0);
  });
});

describe('BUILDER_CALL_PARAMS (R1 thinking-bloat lock)', () => {
  it('pins temperature, maxTokens, and reasoningEffort', () => {
    expect(BUILDER_CALL_PARAMS.temperature).toBe(0);
    expect(BUILDER_CALL_PARAMS.maxTokens).toBe(6000);
    expect(BUILDER_CALL_PARAMS.reasoningEffort).toBe('low');
  });
});

describe('parseSpec drift net (routes <-> @corvus/spec)', () => {
  it('accepts the exact envelope shape the routes construct', () => {
    const interviewShape = {
      version: 1,
      behaviors: [{ question: 'goal', answer: 'a study bot' }],
    };
    const patchShape = {
      version: 1,
      behaviors: [{ question: 'goal', answer: 'a study bot' }],
    };
    expect(() => parseSpec(interviewShape)).not.toThrow();
    expect(() => parseSpec(patchShape)).not.toThrow();
    expect(parseSpec({ version: 1, behaviors: [] })).toEqual({
      version: 1,
      behaviors: [],
    });
  });

  it('rejects a wrong version', () => {
    expect(() => parseSpec({ version: 2 })).toThrow();
  });

  it('rejects a non-array behaviors value', () => {
    // NOTE (brief-vs-schema delta, flagged in-report): BehaviorSpecV0Schema
    // declares `behaviors` with `.default([])`, so a *missing* key is valid
    // and defaults to []. The invalid-behaviors leg therefore asserts the
    // genuinely-invalid shape: behaviors present with the wrong type.
    expect(() => parseSpec({ version: 1, behaviors: 'not-an-array' })).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => parseSpec(null)).toThrow();
  });
});
