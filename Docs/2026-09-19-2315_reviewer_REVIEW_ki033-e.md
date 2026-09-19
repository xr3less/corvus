# Task Report: ki033-e-reviewer

## Status

SUCCESS — ki033-e wires the trial signal end-to-end and matches its brief plus the KI-033 spec locks. All acceptance criteria met by reading + executed gates; DB-backed assertions are listed as UNVERIFIED (no Postgres reachable here), and the full-suite failures classify as pre-existing by file reference. One precision note on the e report's enforcement-order sentence (observation, not a defect — see Verdict 4).

## Files Touched

- CREATED: `Docs/2026-09-19-2315_reviewer_REVIEW_ki033-e.md` (this report)
- MODIFIED: none (read-only review; no production file edited)
- DELETED: none

## Dependencies Added

None.

## Assumptions Made

- No live-source research was needed: every fact under review is pinned by the repo itself (SPEC locks, `packages/ai/src/budget.ts`, migration files, in-tree copy). No current-fact claim is made from memory.
- The `<= now` boundary in `isTrialExpired` (`trial.ts:34`) is treated as an observation, not a failure — same ruling as the wave review: the SPEC contract does not pin the boundary and all tests use `now ± 1h` clocks.
- `chat/route.ts` `onTrial` (chat-local, `!isPlanTier(tier) || tier === 'trial'`) and `lib/bots.ts` `isPaidTier` agree on every tier value (`trial`/unknown → trial path; `pro|studio|scale` → bypass). The two predicates are intentionally different functions with identical verdicts; drift risk is noted but both are unit-pinned.

## Open Questions for Orchestrator

1. **DB execution gate (residual, environmental).** The `a.tier` SELECT addition (`session.ts:113`) and the PG join/touch behavior are verified by reading only — the PG suites loud-skip here (5 + 3 + 1, listed below). They must run on a machine with `TEST_DATABASE_URL` before the wave is called fully done. Everything e added that _can_ run without PG is green.
2. **Two gate-order shapes now exist side by side (observation, no action proposed).** Mint routes are `401 → 422 → 403`; chat and builder-start are `401 → 403 → 422` (403 sits ahead of body parsing deliberately, so an expired trial cannot be masked as 422 — that order predates e, per the e report's "unchanged logic" note, and satisfies SPEC contract 3). The e report's blanket "401->422->403 preserved on all five gates" sentence is imprecise; the behavior itself is correct in both shapes. Recommend only that any future contract restatement name the two orders explicitly.

## Public Interface Exposed

No new interface from this review. Verified-as-shipped surface (all confirmed in tree):

- `GET /api/session/trial` → `401 { error: 'unauthorized' }` (no session) else `200 { trialExpired: boolean }` via the single `isTrialExpired` predicate. No other shape. Test seam: `__setSessionStore(store)` / `__resetSessionStore()`.
- `SessionInfo.tier?: string | null`; `FoundSession.tier: string | null | undefined` (REQUIRED key, null/undefined both → trial path); `PgSessionStore.findSessionWithAccount` SELECT now includes `a.tier` alongside `a.trial_ends_at`; memory double passes `account.tier` through; `getSession` returns `tier: found.tier`.
- `InterviewSession.trialEndsAt?/tier?`; `createSessionReader` returns `{ accountId, discordId, trialEndsAt, tier }` (previously identity-only).
- Chat gate (live): `onTrial(session.tier) && isTrialExpired(...)` → `403 trial_expired`; budget via `checkBudget` with `tier: isPlanTier(session.tier) ? session.tier : undefined`.
- Builder-start gate (live): `!isPaidTier(session.tier) && isTrialExpired(...)` → `403 trial_expired`; `BuilderSession` gains `tier?`.
- Dashboard wiring: both pages accept injected `trialExpired?: boolean` (wins outright); otherwise one mount-time `fetch('/api/session/trial')` with abort controller; only an explicit boolean `true` lights the banner; both pages stay `'use client'`.

## Known Limitations

1. **DB-backed assertions UNVERIFIED (environmental, listed per brief):** `session-db.test.ts` PG trial-clock tests loud-skip (5: INSERT stamp, grandfathered NULL, expired/active join, plus 2 pre-existing session round-trip/touch skips in the same file); `auth.test.ts` PG state tests loud-skip (3); `builder/start` live-PG ownership test loud-skips (1). Hermetic stand-ins are green (trial endpoint 6/6 injected; chat 28/28; builder-start 20/20; dashboard home 22/22; bot detail 44/44; auth 28/28 non-PG; session-bind 8/8).
2. **Full-suite failures are pre-existing, classified by file reference (no stash performed):** 4 failed suites / 1 failed test — `launch-blockers.test.ts`, `guilds.test.ts` (vitest-3 `import.meta.url` Windows path issue), `pryzm/page.test.tsx` (`ENOENT .../app/pryzm/pryzm.module.css` path bug), `start.test.ts` 1 failing test (`fileURLToPath(new URL('..', import.meta.url))` scheme error). Grep-confirmed: none of the four files references any wave symbol (`isTrialExpired`, `trial_ends_at`, `isPaidTier`, `session/trial`, `TRIAL_EXPIRED` — zero matches). The `pryzm` "trial" grep hits are pre-existing pricing-page copy (`data-od-id="pricing-trial"`), untouched by e. Same failing set the wave reviewer documented.
3. **No browser E2E run here;** "done" for the human-visible flow (expired account seeing the banner/403 in the running app on a migrated DB) still needs a human on a migrated DB.
4. **Gateway still out of scope** (SPEC ruling 4, KI-035 follow-up): expired = cannot mint/build/chat; an installed Discord bot keeps its state.

## Verdict detail (acceptance-criteria check)

1. **Tier flows end-to-end — MET (code-verified; PG execution UNVERIFIED).** SELECT includes `a.tier` (`session.ts:113`); `SessionInfo`/`FoundSession` carry `tier`; memory double passes it through; `getSession` returns it; `session-bind.ts:44-45` passes both fields straight through (no longer stripped); chat bypass live (`onTrial` false for paid → no 403, paid tier forwarded to `checkBudget`); builder-start paid bypass live (`!isPaidTier` guard). Builder-start test pins paid-bypass-200-with-expired-clock and unknown-tier-as-trial-403; chat test pins paid bypass. The PG join itself only loud-skips here (Limitation 1).
2. **GET /api/session/trial — MET.** 401 with no cookie and 401 for unknown session id (2 tests); 200 `{ trialExpired }` for past/future/null/undefined clocks (4 tests); single `isTrialExpired` predicate; no other shape in code or tests.
3. **Dashboard banners — MET.** Both pages `'use client'` (line 1), mount-time fetch with abort controller, injected prop wins, fail-open on absent/fetch-fail/malformed (only `typeof flag === 'boolean' && flag` sets the banner). Banner render unchanged (`role="status"`, existing class, locked message). Home: 4 new signal tests; bot detail: 2 new signal tests; the positional-stub regression the e report discloses was fixed in-scope (44/44 green, confirmed by rerun).
4. **Locked copy + enforcement order — MET with the OQ2 precision note.** `TRIAL_EXPIRED_MESSAGE`, `TRIAL_DEAL`, `Trial (live):` byte-match the SPEC locks; privacy untouched (out of e scope). Actual gate orders: mint routes `401 → 422 → 403`; chat/builder-start `401 → 403 → 422` (403 ahead of body parse, pre-existing design, SPEC-compliant); trial endpoint 401-before-200 with no 422 path. E introduced no reorder.
5. **Artifacts on disk — MET.** All 11 e-report files exist; grep-confirmed symbols: `trialExpired` (route + both pages + tests), `tier` (session/store/bind/chat/builder), `__setSessionStore` (route + test), `isPaidTier` (bots lib + builder-start + tests).
6. **Gates rerun — MET.** `npx tsc --noEmit -p apps/web/tsconfig.json` EXIT 0; `eslint --max-warnings 0` on all 11 owned files EXIT 0; `prettier --check` on all 11 clean; owned suites green (trial 6/6, chat 28/28, builder-start 20/20, dashboard home 22/22, bot detail 44/44, session-db file 21 run incl. 5 loud PG skips, auth 28, session-bind 8); full web suite 927 passed | 62 skipped with only the pre-existing failures in Limitation 2.
7. **Secrecy + safety — MET.** Grep sweep over the trial route dir and `session.ts` for secret patterns clean; no values, tokens, or real URLs in diffs; never read `/opt/corvus/.env`. This review ran read-only checks only (tsc/eslint/prettier/vitest) — no edits, no git restore/install/push/migration/deploy.
