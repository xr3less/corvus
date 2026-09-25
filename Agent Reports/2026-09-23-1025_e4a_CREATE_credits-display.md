# Task Report: expansion-e4a-credits

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/api/credits/route.ts
- MODIFIED: apps/web/app/dashboard/page.tsx
- DELETED: none

## Dependencies Added
None.

## Assumptions Made
- Session/tier resolution mirrors the chat and verdict routes: an absent or unknown `session.tier` reads as `'trial'` (via `isPlanTier` pre-gate), never as a paid bypass.
- The refill read is absence-tolerant per SPEC ("tolerate their absence — sibling agent owns refill rows"): any refill-query failure (including a not-yet-existing `credit_ledger` table) reads as zero refills rather than failing the whole balance. Only a genuine positive number widens the allowance.
- Unreadable month-to-date spend (non-numeric SUM) answers 500, never a fabricated 0 — mirroring the chat/verdict `readSpentCredits` fail-closed rule at a billing boundary.
- Warn threshold uses `BUDGET_WARN_RATIO` (0.8) imported from `@corvus/ai`, surfacing as `spent >= allowance * BUDGET_WARN_RATIO`.
- Dashboard copy "X of Y credits" on the existing Credits-left stat card satisfies "credits display"; no new card chrome or CSS was added.
- `credit_ledger.refills` uses `reason = 'refill'` within a 90-day window per the terms promise ($5 / 1,000 credits / 90 days); no new ledger vocabulary introduced.

## Open Questions for Orchestrator
- None. Scope stayed inside the two files; no other file needed changes.

## Public Interface Exposed
- `GET /api/credits` → `200 { tier: string, allowance: number, spent: number, remaining: number, warn: boolean }`; `401 { error: 'unauthorized' }` with no session; `500 { error: 'database not configured' }` (via shared `mapDbError`) or `500 { error: 'could not check your AI credits' }` on unreadable meter. Never writes.
- Exported seams/constants for tests: `SPENT_CREDITS_SQL`, `REFILL_CREDITS_SQL`, `REFILL_REASON`, `REFILL_WINDOW_DAYS`, `CreditsPayload`, `__setSessionReader`, `__resetSessionReader` (plus `__setPool` re-export).
- Dashboard: Credits stat card shows "`{remaining} of {allowance} credits`" when `/api/credits` answers with finite numbers, "No data yet" on fetch fail (replaces the hardcoded `No data yet`), and "—" when there are no bots.

## Known Limitations
- This task does NOT cover: the refill checkout route, `refillAllowance`/budget.ts changes, webhook refill rows, the trial_grant ledger row, or the sleep/wake sweeper — those remain sibling E4 scope.
- `refill` rows are read, not written, here; if the sibling's vocabulary differs from `reason = 'refill'`, only the `REFILL_REASON` constant needs updating.
- Verification performed: `tsc --noEmit` zero errors (web package), `eslint` zero warnings on both touched files, `prettier --check` clean, existing `app/dashboard/page.test.tsx` 22/22 green, warn-boundary arithmetic sanity-checked (0.8 ratio trips at 80/100 trial and 1600/2000 pro). No new test file was added; no human-flow run in a live app was performed (hermetic gates only).
