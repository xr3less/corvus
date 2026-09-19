# Task Report: ki033-e-trial-signal

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/app/api/session/trial/route.ts
- CREATED: apps/web/app/api/session/trial/route.test.ts
- MODIFIED: apps/web/lib/auth/session.ts
- MODIFIED: apps/web/lib/interview/session-bind.ts
- MODIFIED: apps/web/app/api/chat/route.ts
- MODIFIED: apps/web/app/api/builder/start/route.ts
- MODIFIED: apps/web/app/api/builder/start/route.test.ts
- MODIFIED: apps/web/app/dashboard/page.tsx
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.tsx
- MODIFIED: apps/web/app/dashboard/page.test.tsx
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx

## Dependencies Added

- None

## Assumptions Made

- `accounts.tier` defaults to the trial path when missing/unknown: `isPaidTier` returns false for null/undefined/unknown, and chat falls back to `undefined` tier for `checkBudget` (which then resolves the trial allowance). Paid bypass only fires for `pro|studio|scale` via the shared `isPaidTier` predicate. This matches the mint-cap contract from ki033-b.
- Dashboard pages stay `'use client'`: expiry is read via client fetch to the new narrow endpoint, not via a server loader and not from the bare bot rows returned by `fetchBots`. Absent/fetch-fail/malformed resolves to "no banner" (fail-open, never guesses). Only an explicit boolean `true` lights the banner.
- New fields are optional/`undefined`-valued (`SessionInfo.tier?`, `InterviewSession.trialEndsAt?/tier?`, `BuilderSession.tier?`) so existing exact-shape `toEqual({accountId, discordId})` assertions in `auth.test.ts` and `session-bind.test.ts` keep passing (`toEqual` ignores `undefined`). Verified: auth 28 pass, session-bind 8 pass.
- No web research needed: task depended on no current external facts (no versions, model names, APIs, pricing). Stack and helpers are existing-project only per TECH STACK LOCK.

## Open Questions for Orchestrator

- None. Scope stayed inside the 11 listed files. No other file needed changes.

## Public Interface Exposed

- `GET /api/session/trial` -> `401 { error: 'unauthorized' }` with no session, else `200 { trialExpired: boolean }` via the single `isTrialExpired` predicate. No other shape. Test seam: `__setSessionStore(store)` / `__resetSessionStore()`.
- `SessionInfo` gains `trialEndsAt?: Date | string | null` (already present) and `tier?: string | null`; `FoundSession` gains required key `tier: string | null | undefined`; `PgSessionStore.findSessionWithAccount` SELECT now includes `a.tier` alongside `a.trial_ends_at`; memory double passes `account.tier` through; `getSession` returns `tier: found.tier`.
- `InterviewSession` gains `trialEndsAt?: Date | string | null; tier?: string | null`; `createSessionReader` returns `{ accountId, discordId, trialEndsAt, tier }` (was identity-only — this was the root cause of the dormant chat tier path).
- Chat gate (unchanged logic, now live): `if (onTrial(session.tier) && isTrialExpired({ trial_ends_at: session.trialEndsAt }))` -> `403 trial_expired`; budget via `checkBudget` with `tier: isPlanTier(session.tier) ? session.tier : undefined`.
- Builder-start gate (extended): `if (!isPaidTier(session.tier) && isTrialExpired({ trial_ends_at: session.trialEndsAt }))` -> `403 trial_expired`; `BuilderSession` gains `tier?: string | null`.
- Dashboard wiring: both pages accept injected `trialExpired?: boolean` (tests win outright); otherwise one mount-time `fetch('/api/session/trial')` with abort controller, `trialExpired = injected ?? liveTrialExpired`. Banner render unchanged (`role="status"`, existing class, locked `TRIAL_EXPIRED_MESSAGE`).

## Known Limitations

- DB-backed assertions are UNVERIFIED here (no Postgres reachable): `session-db.test.ts` PG clock/join tests loud-skip (5 skips in that file), `auth.test.ts` PG state tests loud-skip (3), `builder/start` live-PG ownership test loud-skips (1). Hermetic coverage stands in: trial endpoint 6/6 via injected memory stores (past/future/null/undefined/401x2); chat 28/28 injected; builder-start 20/20 injected (new: paid bypass 200 even with expired clock, unknown-tier treated as trial 403); dashboard home 22/22 (4 new signal tests); bot detail 44/44 (2 new signal tests).
- Mid-task regression caught and fixed (owned tests only): the new mount-time `/api/session/trial` fetch shifted positional `mockResolvedValueOnce` stubs in `bots/[id]/page.test.tsx`, failing 5 tests (2 chat-history/401-retry, 1 signal-expired render on unknown-id empty shell, 1 stale-feed, 1 inline-error retry). Fixed by adding the trial-signal slot to positional stubs and rendering the signal-expired case with injected fixtures (`bots={[botById('bot-3')]}`) so the banner asserts on the real header. No production change in the fix; 44/44 green after.
- Gates: `npx tsc --noEmit -p apps/web/tsconfig.json` EXIT 0; `eslint --max-warnings 0` on all 11 owned files EXIT 0; `prettier --check` on all 11 clean; touched-area suite 8 files 177 passed; full web suite 558 passed | 57 skipped with 1 failed suite `apps/web/app/pryzm/page.test.tsx` (pre-existing `ENOENT .../app/pryzm/pryzm.module.css` path bug, untouched by this task, out of scope).
- Locked copy verified byte-identical: `TRIAL_EXPIRED_MESSAGE`, `TRIAL_DEAL`, `Trial (live):` not touched; enforcement order `401->422->403` preserved on all five gates (trial endpoint: 401 before 200, no 422 path).
