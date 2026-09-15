// Durable interview progress (V1-2, KI-002) backed by the interview_progress
// table (see gateway drizzle 0003_v12.sql + src/db/v12.ts).
//
// Shape borrowed from better-auth's Drizzle verification table (MIT,
// https://better-auth.com/docs/adapters/drizzle): a narrow table keyed by a
// single id, value in a payload column, expiry index + sweep. Borrowed
// structure only: our payload is `{ answers: RecordedAnswer[] }`, the row is
// keyed by interview (bot) id with NO FK to bots (documented in v12.ts), and
// expiry rolls ~24h on every record.
//
// Never import this into client components.

import type { Pool } from 'pg';
import { getPool } from '../db/pool';
import type { QuestionId, RecordedAnswer } from './tree';
import { isQuestionId } from './tree';

export const INTERVIEW_PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;

export interface InterviewProgressStore {
  answeredFor(botId: string): Promise<RecordedAnswer[]>;
  answeredIdsFor(botId: string): Promise<QuestionId[]>;
  record(botId: string, questionId: QuestionId, answer: string): Promise<void>;
  reset(botId?: string): Promise<void>;
}

interface ProgressRow {
  interview_id: string;
  payload: unknown;
  expires_at: string;
}

// Corrupt or foreign-shaped payloads read as empty (fail closed on order:
// the caller re-asks from the start of the tree). Never throws.
function parseAnswers(payload: unknown): RecordedAnswer[] {
  try {
    if (typeof payload !== 'object' || payload === null) {
      return [];
    }
    const answers = (payload as { answers?: unknown }).answers;
    if (!Array.isArray(answers)) {
      return [];
    }
    const kept: RecordedAnswer[] = [];
    for (const entry of answers) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const record = entry as { questionId?: unknown; answer?: unknown };
      if (isQuestionId(record.questionId) && typeof record.answer === 'string') {
        kept.push({ questionId: record.questionId, answer: record.answer });
      }
    }
    return kept;
  } catch {
    return [];
  }
}

export class PgInterviewProgress implements InterviewProgressStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async load(botId: string): Promise<RecordedAnswer[]> {
    const result = await this.pool.query<ProgressRow>(
      'SELECT interview_id, payload, expires_at FROM interview_progress' +
        ' WHERE interview_id = $1 AND expires_at > now()',
      [botId],
    );
    const row = result.rows[0];
    if (!row) {
      return [];
    }
    return parseAnswers(row.payload);
  }

  async answeredFor(botId: string): Promise<RecordedAnswer[]> {
    return this.load(botId);
  }

  async answeredIdsFor(botId: string): Promise<QuestionId[]> {
    const entries = await this.load(botId);
    return entries.map((entry) => entry.questionId);
  }

  async record(botId: string, questionId: QuestionId, answer: string): Promise<void> {
    const entries = await this.load(botId);
    entries.push({ questionId, answer });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INTERVIEW_PROGRESS_TTL_MS);
    await this.pool.query(
      'INSERT INTO interview_progress (interview_id, payload, updated_at, expires_at)' +
        ' VALUES ($1, $2::jsonb, $3, $4)' +
        ' ON CONFLICT (interview_id) DO UPDATE SET' +
        ' payload = EXCLUDED.payload,' +
        ' updated_at = EXCLUDED.updated_at,' +
        ' expires_at = EXCLUDED.expires_at',
      [botId, JSON.stringify({ answers: entries }), now.toISOString(), expiresAt.toISOString()],
    );
  }

  async reset(botId?: string): Promise<void> {
    if (botId === undefined) {
      await this.pool.query('DELETE FROM interview_progress');
    } else {
      await this.pool.query('DELETE FROM interview_progress WHERE interview_id = $1', [botId]);
    }
  }
}

// Injectable holder for tests (same shape as the routes' __setPool pattern).
// Production resolves lazily through the shared pool so a test-injected pool
// (via lib/db/pool __setPool) is honored on first use.
let defaultStore: InterviewProgressStore | null = null;

export function getDefaultProgressStore(): InterviewProgressStore {
  if (!defaultStore) {
    defaultStore = new PgInterviewProgress(getPool());
  }
  return defaultStore;
}

export function __setProgressStore(store: InterviewProgressStore | null): void {
  defaultStore = store;
}

export function __resetProgressStore(): void {
  defaultStore = null;
}
