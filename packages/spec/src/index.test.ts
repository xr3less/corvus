import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { BehaviorSpecV0Schema, createDraft, parseSpec, SPEC_VERSION } from './index.js';

describe('BehaviorSpecV0', () => {
  it('exposes SPEC_VERSION = 1', () => {
    expect(SPEC_VERSION).toBe(1);
  });

  it('parses a valid empty v0 spec', () => {
    expect(parseSpec({ version: 1, behaviors: [] })).toEqual({
      version: 1,
      behaviors: [],
    });
  });

  it('preserves opaque behavior entries round-trip', () => {
    const input = {
      version: 1,
      behaviors: [{ anything: 'goes', nested: [1, 2, 3] }, 42, 'a string', null],
    };
    const parsed = parseSpec(input);
    expect(parsed).toEqual(input);
    // Re-serialising must not lose or reshape entries.
    expect(BehaviorSpecV0Schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(input);
  });

  it('defaults missing behaviors to []', () => {
    expect(parseSpec({ version: 1 })).toEqual({ version: 1, behaviors: [] });
  });

  it('rejects a wrong version', () => {
    expect(() => parseSpec({ version: 2, behaviors: [] })).toThrow(ZodError);
    expect(() => parseSpec({ version: 0, behaviors: [] })).toThrow(ZodError);
  });

  it('rejects a missing version', () => {
    expect(() => parseSpec({ behaviors: [] })).toThrow(ZodError);
    expect(() => parseSpec({})).toThrow(ZodError);
  });

  it('rejects non-object input', () => {
    for (const bad of [null, undefined, 42, 'spec', true, []]) {
      expect(() => parseSpec(bad)).toThrow(ZodError);
    }
  });

  it('never returns partial on invalid input', () => {
    let returned = false;
    try {
      parseSpec({ version: 999, behaviors: 'not-an-array' });
      returned = true;
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
    }
    expect(returned).toBe(false);
  });

  it('createDraft returns a fresh { version: 1, behaviors: [] } each call', () => {
    expect(createDraft()).toEqual({ version: 1, behaviors: [] });
    const a = createDraft();
    const b = createDraft();
    expect(a).not.toBe(b);
    expect(a.behaviors).not.toBe(b.behaviors);
  });
});
