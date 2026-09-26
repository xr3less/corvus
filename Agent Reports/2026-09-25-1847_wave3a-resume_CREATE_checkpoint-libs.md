# Task Report: wave3a-checkpoint-libs

## Status

SUCCESS

## Files Touched

- CREATED: apps/gateway/drizzle/0015_builder_checkpoint.sql
- CREATED: apps/web/lib/builder/checkpoints.ts
- CREATED: apps/web/lib/builder/gates.ts

## Dependencies Added

- None. gates.ts imports `isPlanTier` from the already-present `@corvus/ai` workspace package (same import the verdict route uses). No manifest edit, no install run.

## Assumptions Made

- Migration style follows drizzle journal convention (`--> statement-breakpoint`, `IF EXISTS` / `IF NOT EXISTS` guards) per 0013 (read once for style; 0014 not present on disk yet, so 0015 numbering assumes it lands first per SPEC migration order).
- `attempt` (integer, nullable) and `checkpoint_at` (timestamptz, nullable) are lookup aids only; the jsonb keys in checkpoints.ts remain the source of truth.
- `onTrial` in gates.ts uses `!isPlanTier(tier) || tier === 'trial'`, mirroring the verdict route's local `onTrial` helper while reusing the shared `isPlanTier` import.
- Nothing imports gates.ts (per task); the follow-up route task wires it.

## Open Questions for Orchestrator

- None. Resume route + builder-runs modify + tests are the follow-up task's scope.

## Public Interface Exposed

```ts
// checkpoints.ts
type CheckpointPhase = 'queued' | 'generating' | 'syncing';
interface CheckpointDetail {
  briefChars: number | null;
  attempt: number | null;
  stepStartedAt: string | null;
  lastGoodPhase: CheckpointPhase | null;
  checkpointBrief: string | null;
  error: string | null;
  provider: string | null;
}
const CHECKPOINT_KEYS: readonly [
  'briefChars',
  'attempt',
  'stepStartedAt',
  'lastGoodPhase',
  'checkpointBrief',
  'error',
  'provider',
];
const RESUME_FRESH_NOTICE: string; // 'Starting a fresh build from the last checkpoint — the failed run is kept for audit.'
const RESUME_NO_CHECKPOINT_NOTICE: string; // 'Checkpoint unavailable — starting from the approved brief.'
function isRecord(value: unknown): value is Record<string, unknown>;
function readCheckpoint(detail: unknown): CheckpointDetail;
type CheckpointPatch = Partial<Pick<CheckpointDetail, CheckpointKey>>;
function writeCheckpoint(prev: unknown, patch: CheckpointPatch): Record<string, unknown>;
function checkpointAvailable(detail: unknown): boolean;
function checkpointNotice(detail: unknown): string;
// gates.ts
const GATE_ORDER: readonly [
  'unauthorized',
  'trial_expired',
  'invalid-bot-id',
  'turns-shape',
  'bot-not-found',
  'trial-budget-exceeded',
  'no-plan-asked',
];
function budgetRefusalMessage(tier: string | null | undefined, allowance: number): string;
function gateSession(session: GateSession | null): GateDecision | null; // 401
function gateTrialClock(args: {
  isPaidTier: boolean;
  isTrialExpired: boolean;
}): GateDecision | null; // 403 trial_expired
function gateBotId(botId: unknown): GateDecision | null; // 422
function gateOwnershipMiss(): GateDecision; // 404
function gateBudgetRefusal(tier: string | null | undefined, allowance: number): GateDecision; // 403 trial_budget_exceeded
function gateNoPlan(): GateDecision; // 409
```

Sibling waves (wave2-time, wave4-hub) consume checkpoints.ts read-only; gates.ts is consumed read-only by the follow-up route task.

## Known Limitations

- The 0015 SQL was not applied to a live database (local checks only, per task).
- gates.ts is not imported anywhere yet, so its byte-identity with the verdict route is by review, not by test.
- Typecheck ran full-project (`EXIT:0`); eslint on the two lib files clean. No vitest in this slice.
- Copy check: only the two Wave 3 checkpoint strings plus `Resume build` (not needed in lib code; owner surface consumes the notices) — no frozen string altered, no emoji, no exclamation.

## Shared gates excerpt (SPEC-shaped, DESIGN-FIRST)

Canonical gate block for all builder routes, mirroring `apps/web/app/api/builder/verdict/route.ts` (read once). Gate order frozen: `401 unauthorized` → `403 trial_expired` → `422 botId uuid + turns shape` → `404 ownership with deleted_at IS NULL` → `403 trial_budget_exceeded` → `409 no_plan_asked`. Emitted in `apps/web/lib/builder/gates.ts`; NOT imported into any route in this wave; parallel reviewers must NOT rewrite it. On PARTIAL-or-drift verdicts, accuse the SPEC (§6 build-then-review here is the SUSPECT), never the robots.

- 401: `gateSession` — null session → `{ error: 'unauthorized', message: 'Oturum bulunamadı — tekrar giriş yap.', status: 401 }`.
- 403 trial: `gateTrialClock({isPaidTier, isTrialExpired})` — before body check; paid bypasses, unknown tier resolves to trial → `{ error: 'trial_expired', message: 'Your 3-day trial ended — your bots are paused. Nothing is deleted.', status: 403 }`.
- 422: `gateBotId` — uuid test; turns-shape bound lives in `validateTurns` + bounds module, same step → `{ error: 'invalid bot id', message: 'Bot kimliği geçersiz — sayfayı yenileyip tekrar dene.', status: 422 }`.
- 404: `SELECT id FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`; `gateOwnershipMiss()` → `{ error: 'bot not found', message: 'Bot bulunamadı — sayfayı yenileyip tekrar dene.', status: 404 }`.
- 403 budget: `gateBudgetRefusal(tier, allowance)` after ownership, before model; no model call, no spend row on refusal → `{ error: 'trial_budget_exceeded', message: budgetRefusalMessage(tier, allowance), status: 403 }` where trial branch is `'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.'` and paid branch is `` `This month's ${allowance} AI credits are used up. Nothing is deleted.` ``.
- 409: `gateNoPlan()` — fires only when the posted tail carries no assistant turn → `{ error: 'no_plan_asked', message: 'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.', status: 409 }`.
