# Task Report: wave3b1b-resume-slim

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/app/api/builder/resume/route.ts

## Dependencies Added

- None. Reuses already-present `@corvus/ai` exports (`checkBudget`, `isPlanTier`, `toCredits`), `pg-boss`, and sibling checkpoint helpers. No manifest edit, no install run.

## Assumptions Made

- Fresh-run INSERT uses `INSERT INTO builder_runs (bot_id, detail) VALUES ($1, $2::jsonb) RETURNING id` (detail column is jsonb with `{}` default per worker schema; plain INSERT mirrors start/verdict style).
- `bot_id` for the fresh row comes from the source run's `bot_id` (read, never trusted from the caller).
- Resume brief precedence: checkpoint `checkpointBrief` wins; caller's optional approved `brief` is the fallback; empty-after-clamp falls back to 422 (mirrors the verdict brief clamp).
- 409 covers two cases with distinct codes: `run_not_failed` (source not failed — live/active rows never fork) and `build_in_progress` (double-click/double-POST guard: one active queued/generating/syncing row per bot refuses the second enqueue).
- Budget pre-authorization uses the worker's own per-call estimate (6000 max tokens at $15/1M via `toCredits`), same shape as the verdict route's `checkBudget` call.
- No Turkish `message` sentences on refusals: the pack/SPEC froze only the two English resume notices + `Resume build` (owner surface), and existing routes differ (verdict carries Turkish messages, start does not). Machine `error` codes stay stable for the follow-up test task.
- Injectable `__setPool` re-export plus `__setSessionReader`/`__setBossFactory` seams mirror start/verdict so the follow-up test task needs no route edit.

## Open Questions for Orchestrator

- None. Route tests (gate order 401→403→422→404→403→409, fresh-runId + frozen boss args, terminal-row immutability, no-checkpoint notice, double-POST single enqueue) are the follow-up task's scope; seams are in place for it.

## Public Interface Exposed

```ts
// POST /api/builder/resume  body { runId: uuid, brief?: string(1..2000, fallback only) }
// 200 { runId: string(fresh), phase: 'queued', resumedFrom: string(source), notice: string, briefChars: number }
// 401 { error: 'unauthorized' }
// 403 { error: 'trial_expired' | 'trial_budget_exceeded', message: string }
// 404 { error: 'run not found' }            // unknown, foreign, or soft-deleted-bot run — indistinguishable
// 409 { error: 'run_not_failed' | 'build_in_progress' }
// 422 { error: 'invalid run id' | 'invalid brief' }
// 500 { error: 'database not configured' | 'could not resume build' | 'could not check your AI credits' }
export const BUILDER_QUEUE = 'builder';
export interface ResumeSession extends InterviewSession {
  trialEndsAt?: Date | string | null;
  tier?: string | null;
}
export interface ResumeSessionReader {
  getSession(req: Request): Promise<ResumeSession | null>;
}
export function __setSessionReader(reader: ResumeSessionReader): void;
export function __resetSessionReader(): void;
export interface BuilderBoss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
}
export function __setBossFactory(factory: () => BuilderBoss): void;
export function __resetBossFactory(): void;
export { __setPool } from '../../../../lib/db/pool';
export async function POST(req: Request): Promise<NextResponse>;
```

## Known Limitations

- No route tests in this slice (per task); gate order, boss-arg identity, and immutability are by review until the follow-up test task lands.
- The unused-but-required `brief` fallback means POSTs for pre-checkpoint kills need the caller to supply the approved brief; pure `{runId}` resumes of checkpointed runs carry the checkpoint brief.
- `attempt` on the fresh row continues the display count (+1); its billing lineage is the new row id (worker bills per runId), so no cross-run ceiling is enforced here.
