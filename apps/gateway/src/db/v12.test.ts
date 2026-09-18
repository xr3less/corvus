import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { aiSpend, interviewProgress, oauthStates } from './v12.js';

// No live DB required: assert the Drizzle definitions against SPEC section 4
// (+ ADDENDUM 2026-09-09) and diff them against the shipped SQL text (v12.ts
// and 0003_v12.sql must agree column-for-column).
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', '..', 'drizzle', '0003_v12.sql'), 'utf8');

describe('gateway db v12 tables (SPEC section 4 + ADDENDUM)', () => {
  it('uses the exact SPEC table names', () => {
    expect(getTableName(oauthStates)).toBe('oauth_states');
    expect(getTableName(interviewProgress)).toBe('interview_progress');
    expect(getTableName(aiSpend)).toBe('ai_spend');
  });

  it('defines every SPEC oauth_states column in snake_case', () => {
    const names = Object.values(getTableColumns(oauthStates)).map(
      (c) => (c as { name: string }).name,
    );
    expect([...names].sort()).toEqual(
      ['code_verifier', 'created_at', 'expires_at', 'return_to', 'state'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('defines every SPEC interview_progress column in snake_case', () => {
    const names = Object.values(getTableColumns(interviewProgress)).map(
      (c) => (c as { name: string }).name,
    );
    expect([...names].sort()).toEqual(
      ['expires_at', 'interview_id', 'payload', 'updated_at'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('defines every SPEC ai_spend column in snake_case', () => {
    const names = Object.values(getTableColumns(aiSpend)).map((c) => (c as { name: string }).name);
    expect([...names].sort()).toEqual(
      [
        'account_id',
        'attempt',
        'created_at',
        'credits',
        'id',
        'model',
        'reason',
        'ref_id',
        'usd_cost',
      ].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('marks SPEC-required columns NOT NULL in the schema definition', () => {
    const o = getTableColumns(oauthStates);
    expect(o.state.notNull).toBe(true);
    expect(o.codeVerifier.notNull).toBe(true);
    expect(o.createdAt.notNull).toBe(true);
    expect(o.expiresAt.notNull).toBe(true);
    expect(o.returnTo.notNull).toBe(false);

    const p = getTableColumns(interviewProgress);
    expect(p.interviewId.notNull).toBe(true);
    expect(p.payload.notNull).toBe(true);
    expect(p.updatedAt.notNull).toBe(true);
    expect(p.expiresAt.notNull).toBe(true);

    const s = getTableColumns(aiSpend);
    expect(s.accountId.notNull).toBe(true);
    expect(s.model.notNull).toBe(true);
    expect(s.reason.notNull).toBe(true);
    expect(s.createdAt.notNull).toBe(true);
    // NULL cost = provider reported none (ADDENDUM) — never silently zeroed.
    expect(s.usdCost.notNull).toBe(false);
    expect(s.credits.notNull).toBe(false);
    expect(s.refId.notNull).toBe(false);
    // KI-026: builder attempt number, nullable so chat rows (no attempt) keep working.
    expect(s.attempt.notNull).toBe(false);
  });

  it('migration creates all three tables with PKs + FK cascade + defaults + indexes', () => {
    expect(sql).toContain('"oauth_states"');
    expect(sql).toContain('"interview_progress"');
    expect(sql).toContain('"ai_spend"');
    expect(sql).toContain('"state" text PRIMARY KEY');
    expect(sql).toContain('"interview_id" uuid PRIMARY KEY');
    expect(sql).toContain('REFERENCES "accounts" ("id") ON DELETE CASCADE');
    expect(sql).toContain('DEFAULT gen_random_uuid()');
    expect(sql).toContain('DEFAULT now()');
    expect(sql).toContain('"oauth_states_expires_at_idx"');
    expect(sql).toContain('"interview_progress_expires_at_idx"');
    expect(sql).toContain('"ai_spend_account_created_idx"');
    expect(sql).toContain('ON "ai_spend" ("account_id", "created_at")');
  });
});
