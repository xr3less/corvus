import { describe, expect, it } from 'vitest';
import {
  QUESTIONS,
  checkOrder,
  createProgressStore,
  expectedNext,
  firstQuestion,
  getQuestion,
  isQuestionId,
  nextQuestion,
  validateAnswer,
  validateBotName,
} from './tree';

describe('question tree shape', () => {
  it('walks purpose -> channels -> welcome -> moderation -> done', () => {
    expect(QUESTIONS.map((question) => question.id)).toEqual([
      'purpose',
      'channels',
      'welcome',
      'moderation',
    ]);
    expect(firstQuestion().id).toBe('purpose');
    expect(nextQuestion('purpose')?.id).toBe('channels');
    expect(nextQuestion('channels')?.id).toBe('welcome');
    expect(nextQuestion('welcome')?.id).toBe('moderation');
    expect(nextQuestion('moderation')).toBeNull();
  });

  it('reports the expected next question from any answered prefix', () => {
    expect(expectedNext([])?.id).toBe('purpose');
    expect(expectedNext(['purpose'])?.id).toBe('channels');
    expect(expectedNext(['purpose', 'channels', 'welcome'])?.id).toBe('moderation');
    expect(expectedNext(['purpose', 'channels', 'welcome', 'moderation'])).toBeNull();
  });

  it('accepts the exact next question and rejects skipped, repeated, or late ones', () => {
    expect(checkOrder([], 'purpose')).toEqual({ ok: true });
    // Skipped: answering channels before purpose.
    expect(checkOrder([], 'channels')).toEqual({ ok: false, expected: 'purpose' });
    // Repeated: purpose answered twice.
    expect(checkOrder(['purpose'], 'purpose')).toEqual({ ok: false, expected: 'channels' });
    // Late: answering an earlier question after moving on.
    expect(checkOrder(['purpose', 'channels'], 'purpose')).toEqual({
      ok: false,
      expected: 'welcome',
    });
    // Fully done: nothing further is in order.
    expect(checkOrder(['purpose', 'channels', 'welcome', 'moderation'], 'moderation')).toEqual({
      ok: false,
      expected: null,
    });
  });

  it('guards question ids', () => {
    expect(isQuestionId('purpose')).toBe(true);
    expect(isQuestionId('nope')).toBe(false);
    expect(isQuestionId(42)).toBe(false);
    expect(isQuestionId(null)).toBe(false);
    expect(getQuestion('welcome').prompt.length).toBeGreaterThan(0);
    expect(() => getQuestion('nope' as never)).toThrow();
  });
});

describe('validation limits', () => {
  it('accepts a 32-char bot name and rejects empty, blank, long, and non-string names', () => {
    expect(validateBotName('Study Hall')).toEqual({ ok: true, value: 'Study Hall' });
    expect(validateBotName('  Study Hall  ')).toEqual({ ok: true, value: 'Study Hall' });
    expect(validateBotName('x'.repeat(32)).ok).toBe(true);
    expect(validateBotName('').ok).toBe(false);
    expect(validateBotName('   ').ok).toBe(false);
    expect(validateBotName('x'.repeat(33)).ok).toBe(false);
    expect(validateBotName(42).ok).toBe(false);
    expect(validateBotName(null).ok).toBe(false);
    expect(validateBotName(undefined).ok).toBe(false);
  });

  it('accepts a 500-char answer and rejects empty, blank, long, and non-string answers', () => {
    expect(validateAnswer('hello').ok).toBe(true);
    expect(validateAnswer('x'.repeat(500)).ok).toBe(true);
    expect(validateAnswer('').ok).toBe(false);
    expect(validateAnswer('   ').ok).toBe(false);
    expect(validateAnswer('x'.repeat(501)).ok).toBe(false);
    expect(validateAnswer(42).ok).toBe(false);
    expect(validateAnswer(null).ok).toBe(false);
  });
});

describe('progress store', () => {
  it('tracks answers per interview and resets independently', () => {
    const store = createProgressStore();
    store.record('bot-a', 'purpose', 'study group');
    expect(store.answeredIdsFor('bot-a')).toEqual(['purpose']);
    expect(expectedNext(store.answeredIdsFor('bot-a'))?.id).toBe('channels');
    // A sibling interview is unaffected.
    expect(store.answeredIdsFor('bot-b')).toEqual([]);
    store.reset('bot-a');
    expect(store.answeredIdsFor('bot-a')).toEqual([]);
    store.record('bot-a', 'purpose', 'again');
    store.reset();
    expect(store.answeredIdsFor('bot-a')).toEqual([]);
  });
});
