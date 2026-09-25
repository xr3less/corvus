// Shared verdict kept-ends bounds — the single source of truth for the caps
// the verdict route and the new-bot page both enforce.
//
// History: the same numbers, the same marker, and the same kept-ends helper
// used to live as literals in two files (`boundedView` + `ELLIPSIS` in
// app/api/builder/verdict/route.ts, `boundedTurn` + `TURN_ELLIPSIS` in
// app/dashboard/new/page.tsx, plus the refusal reader in the page). A change
// to one side without the other dropped the plan's trailing ask line and
// silently broke the verdict, so both callers import from here now.
// Pure module: no React, no I/O, no secrets.

// Client-owned turns tail (mirrors POST /api/chat's history bounds; a verdict
// needs the plan + the reply, not a full transcript).
export const TURNS_MAX = 12;

// Per-turn bound. The persona prompt ends the plan turn with the ask line, and
// a plan turn is a normal chat turn — so this equals POST /api/chat's
// MESSAGE_MAX (2000). A tighter cap dropped a legitimate plan turn here (422
// for direct callers; the dashboard's head-sliced copy lost the ask line and
// answered 409, so "yes" started nothing and said nothing). The ask line is
// judged through the same kept-ends view the judge sees (boundedView), so
// length can no longer hide it — this bound is now shape validation, not token
// control.
export const TURN_MAX = 2000;

// Verdict input caps (token discipline — the prompts bill on every call).
export const PLAN_MAX = 1000;
export const REPLY_MAX = 500;
export const THREAD_MAX = 3000;
export const BRIEF_MAX = 2000;

// How much of a long text's END a bounded view keeps. The plan turn ends with
// the ask line and the thread ends with the plan plus the user's confirmation,
// so the tail is the part both prompts are actually about.
export const PLAN_TAIL_MAX = 500;
export const THREAD_TAIL_MAX = 1000;
// The reply tells the same story, so it gets the same treatment: a person
// explains their reasoning first and decides last, which puts the acceptance
// the judge is asked to find at the END of the reply. Half of REPLY_MAX,
// mirroring the plan's head/tail split, and comfortably above
// `ELLIPSIS.length` so the view can still hold a head — the result is exactly
// REPLY_MAX characters, so the billed input does not grow.
export const REPLY_TAIL_MAX = 250;

// Marks where a bounded view dropped the middle. Plain text, never a token.
// Byte contract: exactly '\n…\n' — both callers and both suites pin this shape.
export const ELLIPSIS = '\n…\n';

// A capped view of a long text that keeps BOTH ends. A head-only slice silently
// drops exactly what these prompts are about — the ask line that ends the plan
// turn, and the confirmed plan that ends the thread — so the middle is what gets
// dropped instead. The view is still exactly `max` characters, so the billed
// prompt cannot grow. Precondition: tailMax + ELLIPSIS.length < max.
export function boundedView(text: string, max: number, tailMax: number): string {
  if (text.length <= max) return text;
  const tail = text.slice(-tailMax);
  return `${text.slice(0, max - tailMax - ELLIPSIS.length)}${ELLIPSIS}${tail}`;
}

// A KI-033 trial refusal arrives as { error: <code>, message: <the honest
// sentence> }. This module re-exports the shared reader so the new-bot page
// resolves code-only bodies through the same Turkish table as every other
// surface; a body with neither field still returns null so the caller keeps
// its honest fallback rather than printing an empty alert.
export { readRefusalMessage } from '@/lib/http/refusal';
