// Structured interview question tree (V1-1, SPEC section 4).
//
// A fixed ordered list: purpose -> channels -> welcome -> moderation -> done.
// No AI here; the model router binds in V1-2. This module is pure: no I/O,
// no database, no framework imports, so it is fully unit-testable.
//
// Open-source grounding (L-008):
// - dmnkgrc/wizard-state (MIT, https://github.com/dmnkgrc/wizard-state):
//   borrowed the explicit state-machine transition shape — advance() moves
//   one named step at a time instead of index arithmetic.
// - lukemorales/next-safe-navigation (MIT,
//   https://github.com/lukemorales/next-safe-navigation): borrowed the
//   validate-at-the-boundary habit (schema first, type inferred from it).
//   zod itself is not a declared dep of @corvus/web, so the checks below
//   hand-roll the same trim/min/max semantics with zero dependencies.
// - payloadcms/payload versions/drafts (MIT,
//   https://github.com/payloadcms/payload/blob/main/docs/versions/drafts.mdx):
//   borrowed the immutable-revision + pointer shape the done-path mints
//   (spec_versions rows are append-only; bots.draft_spec_id points at latest).

export const QUESTION_IDS = ['purpose', 'channels', 'welcome', 'moderation'] as const;

export type QuestionId = (typeof QUESTION_IDS)[number];

export interface InterviewQuestion {
  id: QuestionId;
  prompt: string;
  hint: string;
}

export const QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'purpose',
    prompt: 'What is this bot for?',
    hint: 'One or two sentences — e.g. a study group, a gaming clan.',
  },
  {
    id: 'channels',
    prompt: 'Which channels should the bot live in?',
    hint: 'Name the channels, e.g. #general and #announcements.',
  },
  {
    id: 'welcome',
    prompt: 'What should the welcome message say?',
    hint: 'The exact text new members should see when they join.',
  },
  {
    id: 'moderation',
    prompt: 'How strict should moderation be?',
    hint: 'Pick a level: off, light, or strict.',
  },
];

export const MAX_BOT_NAME_LENGTH = 32;
export const MAX_ANSWER_LENGTH = 500;

export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === 'string' && (QUESTION_IDS as readonly string[]).includes(value);
}

export function getQuestion(id: QuestionId): InterviewQuestion {
  const found = QUESTIONS.find((question) => question.id === id);
  if (!found) {
    throw new Error(`unknown question id: ${id}`);
  }
  return found;
}

export function firstQuestion(): InterviewQuestion {
  return QUESTIONS[0];
}

// The question after the one just answered, or null when the tree is done.
export function nextQuestion(answeredId: QuestionId): InterviewQuestion | null {
  const index = QUESTION_IDS.indexOf(answeredId);
  if (index < 0) {
    throw new Error(`unknown question id: ${answeredId}`);
  }
  return QUESTIONS[index + 1] ?? null;
}

// The question the interview expects next, given what was already answered.
// Returns null when every question in the tree has an answer (done).
export function expectedNext(answered: readonly QuestionId[]): InterviewQuestion | null {
  const seen = new Set(answered);
  return QUESTIONS.find((question) => !seen.has(question.id)) ?? null;
}

export type OrderCheck = { ok: true } | { ok: false; expected: QuestionId | null };

// Pure order enforcement: the posted questionId must equal the expected next
// question. Anything else (skipped, repeated, unknown order) is out of order
// and the route layer maps it to 422.
export function checkOrder(answered: readonly QuestionId[], questionId: QuestionId): OrderCheck {
  const expected = expectedNext(answered);
  if (expected !== null && expected.id === questionId) {
    return { ok: true };
  }
  return { ok: false, expected: expected?.id ?? null };
}

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

// Bot names follow the Discord display limit (SPEC section 4): 1-32 chars.
export function validateBotName(input: unknown): ValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, error: 'botName must be a string' };
  }
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, error: 'botName must not be empty' };
  }
  if (value.length > MAX_BOT_NAME_LENGTH) {
    return { ok: false, error: `botName must be at most ${MAX_BOT_NAME_LENGTH} characters` };
  }
  return { ok: true, value };
}

// Every interview answer: non-empty, at most 500 chars (SPEC section 4).
export function validateAnswer(input: unknown): ValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, error: 'answer must be a string' };
  }
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, error: 'answer must not be empty' };
  }
  if (value.length > MAX_ANSWER_LENGTH) {
    return { ok: false, error: `answer must be at most ${MAX_ANSWER_LENGTH} characters` };
  }
  return { ok: true, value };
}

export interface RecordedAnswer {
  questionId: QuestionId;
  answer: string;
}

// In-memory per-interview progress (V1-1 only). SPEC section 4 keeps no
// separate interview table — the draft bot IS the interview — and V1-1 adds
// no progress column to bots, so progress lives in this process until the
// done-path mints spec_versions v1. Single-instance only; V1-2 replaces it
// with durable storage alongside the AI router bind. Never import this into
// client components.
export function createProgressStore() {
  const byInterview = new Map<string, RecordedAnswer[]>();

  function answeredFor(interviewId: string): RecordedAnswer[] {
    return [...(byInterview.get(interviewId) ?? [])];
  }

  function answeredIdsFor(interviewId: string): QuestionId[] {
    return answeredFor(interviewId).map((entry) => entry.questionId);
  }

  function record(interviewId: string, questionId: QuestionId, answer: string): void {
    const entries = byInterview.get(interviewId) ?? [];
    entries.push({ questionId, answer });
    byInterview.set(interviewId, entries);
  }

  function reset(interviewId?: string): void {
    if (interviewId === undefined) {
      byInterview.clear();
    } else {
      byInterview.delete(interviewId);
    }
  }

  return { answeredFor, answeredIdsFor, record, reset };
}

// Process-wide store used by the answer route. Tests reset it between cases.
export const interviewProgress = createProgressStore();
