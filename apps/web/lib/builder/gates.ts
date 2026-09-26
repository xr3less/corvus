// Shared builder-route gate excerpt — SOLE OWNER: wave3-resume (DESIGN-FIRST).
//
// DO NOT import this module into any route in this wave. It is emitted here as
// the single source of truth for the gate block; route wiring is a FOLLOW-UP
// task. Parallel reviewers must NOT rewrite it. On PARTIAL-or-drift verdicts,
// accuse the SPEC (§6 build-then-review here is the SUSPECT) — never the robots.
//
// MIRROR NOTE (read-cap honored): this excerpt mirrors the gate block of
// apps/web/app/api/builder/verdict/route.ts, read ONCE. It was NOT re-derived
// from any other route. The verdict route keeps its own inline copies; this
// file is the canonical excerpt future builder routes (resume, start) converge
// on. Until a route imports it, both copies must stay byte-identical by review.
//
// GATE ORDER (frozen, SPEC §1 — never reorder):
//   401 unauthorized → 403 trial_expired → 422 botId uuid + turns shape →
//   404 ownership with deleted_at IS NULL → 403 trial_budget_exceeded →
//   409 no_plan_asked.
//
// COPY LOCKS (byte-identical with the verdict route; translating them is a
// cross-route copy wave, not a one-file edit):
// - TRIAL_ENDED_MESSAGE: same sentence the chat route, builder/start and the
//   dashboard banner carry (KI-033 SPEC, byte-level).
// - TRIAL_BUDGET_MESSAGE: the SAME monthly-allowance refusal
//   app/api/chat/route.ts writes (the trial branch of budgetRefusalMessage).
// All other Turkish `message` sentences below are verbatim copies of the
// verdict route's copy block.

import { isPlanTier } from '@corvus/ai';

export const GATE_ORDER = [
  'unauthorized',
  'trial_expired',
  'invalid-bot-id',
  'turns-shape',
  'bot-not-found',
  'trial-budget-exceeded',
  'no-plan-asked',
] as const;

export type GateStep = (typeof GATE_ORDER)[number];

export interface GateDecision {
  error: string;
  message: string;
  status: number;
}

export interface GateSession {
  accountId: string;
  trialEndsAt?: Date | string | null;
  tier?: string | null;
}

// Locked wording (KI-033 SPEC, byte-level) — copies, see header.
export const TRIAL_ENDED_MESSAGE =
  'Your 3-day trial ended — your bots are paused. Nothing is deleted.';
export const TRIAL_BUDGET_MESSAGE =
  'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.';

export const UNAUTHORIZED_MESSAGE = 'Oturum bulunamadı — tekrar giriş yap.';
export const INVALID_BOT_MESSAGE = 'Bot kimliği geçersiz — sayfayı yenileyip tekrar dene.';
export const TURNS_MESSAGE = 'Sohbet geçmişi geçersiz — sayfayı yenileyip tekrar dene.';
export const BOT_NOT_FOUND_MESSAGE = 'Bot bulunamadı — sayfayı yenileyip tekrar dene.';
export const NO_PLAN_MESSAGE =
  'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The allowance gate is tier-aware, so its refusal has to be too (verdict-route
// mirror): tier-blind copy would tell a paying account that its 3-day trial ran
// out. Trial branch names the SPEC-locked "100 credits"; the paid branch takes
// the number the meter resolved rather than a remembered one.
export function budgetRefusalMessage(tier: string | null | undefined, allowance: number): string {
  // Trial path (verdict-route mirror): a missing or unknown tier reads as trial —
  // never as a paid bypass. isPlanTier owns that distinction.
  const onTrial = !isPlanTier(tier) || tier === 'trial';
  if (onTrial) {
    return TRIAL_BUDGET_MESSAGE;
  }
  return `This month's ${allowance} AI credits are used up. Nothing is deleted.`;
}

// --- Pure gate steps (DB reads stay route-side; these decide on values) ---

// 401: fail-closed on any session failure (missing/bad cookie, missing row,
// expired row, DB error all resolve to null upstream — never throws here).
export function gateSession(session: GateSession | null): GateDecision | null {
  if (!session) {
    return { error: 'unauthorized', message: UNAUTHORIZED_MESSAGE, status: 401 };
  }
  return null;
}

// 403 trial_expired: the trial clock gates the WRITE, before the body check —
// a malformed body must not mask an expired trial as 422, and vice versa. A
// paid tier bypasses the clock; a missing/unknown tier resolves to the trial
// path (never to a bypass). `trialExpired` is computed route-side via
// isTrialExpired({ trial_ends_at }) / isPaidTier(tier) so this module stays
// free of auth imports; the ordering rule is what is frozen here.
export function gateTrialClock(args: {
  isPaidTier: boolean;
  isTrialExpired: boolean;
}): GateDecision | null {
  if (!args.isPaidTier && args.isTrialExpired) {
    return { error: 'trial_expired', message: TRIAL_ENDED_MESSAGE, status: 403 };
  }
  return null;
}

// 422: botId must be a uuid string. Turns-shape 422 (turns array bound,
// role/content checks) lives in the verdict route's validateTurns and the
// shared bounds module; it is ordered HERE (same step, same status).
export function gateBotId(botId: unknown): GateDecision | null {
  if (typeof botId !== 'string' || !UUID_RE.test(botId)) {
    return { error: 'invalid bot id', message: INVALID_BOT_MESSAGE, status: 422 };
  }
  return null;
}

// 404: ownership read is `SELECT id FROM bots WHERE id = $1 AND account_id = $2
// AND deleted_at IS NULL LIMIT 1` — soft-deleted bots are excluded exactly as
// builder/start excludes them. The query stays route-side; this builds the
// refusal for the not-owned outcome.
export function gateOwnershipMiss(): GateDecision {
  return { error: 'bot not found', message: BOT_NOT_FOUND_MESSAGE, status: 404 };
}

// 403 trial_budget_exceeded: pre-authorized exactly as a chat turn is — same
// guard, same estimate shape. Sits with the other pre-model gates (after
// ownership, before the model): a refused request makes NO model call and
// writes NO spend row. `allowance` is the number the guard resolved.
export function gateBudgetRefusal(
  tier: string | null | undefined,
  allowance: number,
): GateDecision {
  return {
    error: 'trial_budget_exceeded',
    message: budgetRefusalMessage(tier, allowance),
    status: 403,
  };
}

// 409: the plan trigger is POSITION, not wording (founder lock 2026-09-25,
// option 1) — fires only when the posted tail carries NO assistant turn at
// all, the one case where no plan was ever offered. Sentence is byte-identical
// to the verdict route's copy: one situation, one text.
export function gateNoPlan(): GateDecision {
  return { error: 'no_plan_asked', message: NO_PLAN_MESSAGE, status: 409 };
}
