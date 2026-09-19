# Task Report: ki033-reviewer-wave

## Status

PARTIAL — the wave enforces the trial clock on all five write paths and matches its locked spec, but three spec-known gaps are confirmed live: (1) both expired banners are wired but dormant (no producer passes the prop), (2) the paid-tier bypass is coded but unreachable end-to-end (no store selects `tier`) and builder-start is clock-only, (3) all DB-backed assertions skipped (no Postgres here) and are UNVERIFIED BY EXECUTION. Per the task brief, any confirmed live-unwired gap forces PARTIAL, not SUCCESS.

## Files Touched

- CREATED: `Docs/2026-09-19-2300_reviewer_REVIEW_ki033-wave.md` (this report)
- MODIFIED: none (read-only review; no production file edited)
- DELETED: none

## Dependencies Added

None.

## Assumptions Made

- No live-source research was needed: every version/fact under review is pinned by the repo itself (`apps/web/package.json`, `apps/gateway/package.json`, migration files, SPEC locks). No current-fact claim is made from memory.
- `Docs/PLAN.md` (1-line KI-033 status edit in `git diff`) is orchestrator bookkeeping, not an agent scope violation.
- The `<= now` boundary in `isTrialExpired` (SPEC ruling 5 writes `< now()`) is treated as an observation, not a failure: the SPEC's contract section does not pin the boundary, and all tests use `now ± 1h` relative clocks so the boundary is never load-bearing.
- The pricing-lede sentence (`page.tsx:693-696`, "nothing is enforced") coexisting with the Starter card's "the trial … is enforced" is treated as an observation, not a failure: the lede is outside the SPEC's copy locks and the SPEC ordered those KI-030 `Planned:` lines preserved.

## Open Questions for Orchestrator

1. **Banner producer (shared b+d gap).** Both `DashboardPage` and `BotDetailPage` consume `trialExpired?: boolean` (default `false`), but no production caller passes it, `fetchBots()` reads a bare row array that cannot carry it, `defaultSessionReader` strips `trialEndsAt` (`session-bind.ts:30`), and both pages are `'use client'`. Recommend one small follow-up owning a server loader (or a narrow read-path addition) for both pages — do NOT call the banners done silently.
2. **Tier plumbing (shared b+c gap).** `findSessionWithAccount` selects `trial_ends_at` only — no store selects `tier` — so `session.tier` is `undefined` at runtime and every production account resolves to the trial allowance. The bypass is coded and unit-proven, not live. When billing ships, builder-start (clock-only today, by design) must learn the tier or a paid account with a stale clock will be blocked from queueing. Recommend one change adding `tier` to `findSessionWithAccount` + `SessionInfo` + `InterviewSession`/`ChatSession` together.
3. **DB execution gate.** 34 new wave assertions (5 in a, 8+10+11 in b) plus the pre-existing builder-start live-PG skip never executed here (no Postgres, no Docker). They must run on a machine with `TEST_DATABASE_URL` before this wave is called done — a skip reads identically to a pass.
4. **Pricing-lede honesty (observation, product call).** `page.tsx:693-696` still says "nothing is enforced" while the Starter card now says the trial "is enforced". Both statements' owners are split across SPEC locks (lede preserved per KI-030, card flipped per KI-033). Decide whether the lede needs a minimal true-up ("paid limits are still planned") or stays as-is.

## Public Interface Exposed

No new interface from this review. Verified-as-shipped contract surface (all byte-confirmed in tree):

- `isTrialExpired(account: { trial_ends_at?: Date | string | null } | null | undefined, now?: Date | number): boolean` — defined in `apps/web/lib/trial.ts`, re-exported from `apps/web/lib/auth/session.ts`. `null`/`undefined`/`''`/unparseable → `false` (fail-open); else `endsMs <= nowMs`.
- `apps/web/lib/bots.ts`: `TRIAL_DEAL`, `TRIAL_EXPIRED_MESSAGE`, `TRIAL_BOT_LIMIT_MESSAGE`, `MintAccountRow`, `MintGateResult`, `MintRefusalCode`, `isPaidTier`, `isTrialTier`, `mintGate`, `needsLiveBotCount`, `mintRefusal`, `MINT_ACCOUNT_SQL`, `LIVE_BOT_COUNT_SQL`.
- Locked refusal shape (identical, all three mint routes): `401 { error: 'unauthorized' }` → `422` (unchanged) → `403 { error: 'trial_expired', message }` regardless of count → `403 { error: 'trial_bot_limit', message }` for trial/unknown tier with live bots ≥ 1 → paid tiers bypass both.
- `POST /api/chat`: `403 trial_expired` pre-body, `403 trial_budget_exceeded` pre-model, `500` on allowance-read failure. `POST /api/builder/start`: `403 trial_expired` pre-body/ownership/INSERT/queue.
- `DashboardPage(props: { bots?: MockBot[]; trialExpired?: boolean })`, `BotDetailPage(props: { bots?: MockBot[]; trialExpired?: boolean })` — absent/`false` renders exactly as before.

## Known Limitations

1. **Banners dormant in production** (Open Question 1). Correct, tested seams with no producer — copy flips are live, banners are not.
2. **Tier bypass not live end-to-end; builder-start clock-only** (Open Question 2). Harmless today (`tier` unpopulated everywhere), a wall for paid accounts once billing ships unless the follow-up lands.
3. **DB-backed assertions UNVERIFIED** (Open Question 3): 5 (session-db trial clock) + 8 (bots) + 10 (interview) + 11 (templates) loud-skipped here, plus 1 pre-existing builder-start live-PG skip.
4. **Two enforcement code paths** (confirmed, both enforce): `mintGate`/`mintRefusal` (3 mint routes) vs inline `onTrial + isTrialExpired` (chat) and unconditional clock check (builder-start). Drift risk if a future edit touches one path only.
5. **`page.module.css` out-of-scope append** (confirmed, disclosed by b): exactly one appended rule (`.trialExpiredBanner`, +17/−0), no other rule touched.
6. **Gateway does not pause anything** (SPEC's explicit scope cut, KI-035 follow-up): expired = cannot mint/build/chat; an installed Discord bot keeps its state. Copy says "paused", not "stopped".
7. **Concurrency soft ceiling** (c's flag, confirmed by reading): `ai_spend` writes after the stream, so in-flight bursts can each pass the allowance gate — same pre-existing shape as the builder worker's pre-check, not a regression.
8. **No browser E2E run here**; "done" for the human-visible flow (expired account seeing the 403/banner in the running app) still needs a human on a migrated DB.

## Verdict detail (acceptance-criteria check)

1. **Contract integrity — MET.** Single `isTrialExpired` definition (`trial.ts`; `session.ts` re-exports; `bots.ts` imports from `./trial`; chat/builder-start import from `@/lib/auth/session`). No hand-rolled date comparison in production code (only test-side `getTime()` equality on stamps). `trial_ends_at`: nullable `timestamptz`, no default/index; INSERT-only `now() + interval '3 days'`; `ON CONFLICT DO UPDATE` omits the column (re-login never extends); migration backfills `now() + 3d` for pre-existing rows. Mint-cap shape, paid bypass, and additive-only HTTP (`message` added on refusals; all pre-existing bodies byte-identical) all confirmed by reading.
2. **Spec adherence per agent — MET (with Q4 observation).** a: clock + helper + session plumbing. b: 3 identical mint gates in locked order + `TRIAL_DEAL` flip + banner. c: chat + builder-start pre-model/queue gates + `checkBudget` monthly allowance + landing flips (FAQ nap, credits FAQ, hero + Starter sub-notes, Starter desc — all byte-matching the locks). d: `Trial (live):` label, privacy byte-identical (empty `git diff`), detail banner + new-bot honest refusal messaging. KI-030 locks intact (Save-version, coming-soon CTAs, `$10`/`$29`, `Planned:` on unsold lines, empty-not-example).
3. **No-regressions scope — MET with two disclosed exceptions.** `git diff --name-only` (26 files) plus 7 untracked (5 reports + migration + `trial.ts`) equals exactly the four agents' SPEC scopes, plus (i) one-rule CSS append disclosed by b and (ii) the 1-line `Docs/PLAN.md` orchestrator edit. No file outside these was modified. Privacy diff is empty as ordered.
4. **Trust artifacts — MET.** All five whitelisted reports exist on disk; every claimed CREATED/MODIFIED file exists and contains its claimed symbol/string (grep-confirmed: `isTrialExpired`, `MINT_ACCOUNT_SQL`, `mintGate`, `trial_expired`, `TRIAL_DEAL`, `TRIAL_EXPIRED_MESSAGE`, `Trial (live):`). No remaining production occurrence of "not enforced yet" (only negative test assertions + historical Docs).
5. **Gates on merged tree — MET on static gates; tests green where executable.** Toolchain detected from real scripts (`apps/web`: `tsc --noEmit`, `eslint .`, `prettier --check`, `vitest run`; gateway `typecheck: tsc --noEmit`). `tsc` web EXIT 0; `tsc` gateway EXIT 0; `eslint --max-warnings 0` on all 15 owned source files EXIT 0; `prettier --check` clean on all owned files (the `.sql` migration has no inferred parser — expected, documented by a, not a failure). Owned suites: **11 files, 188 passed | 29 skipped**. Full suite: **4 failed | 76 passed files; 1 failed | 914 passed | 62 skipped tests** — the 4 files (`launch-blockers`, `guilds`, `pryzm/page`, `start`) fail identically without wave references (vitest-3 `import.meta.url` Windows path issue; `start.test.ts` has the one failing test) and match the pre-existing set all four agents documented. No stash-proof performed (forbidden here); classification is by file reference — none of the four failing files imports any wave symbol.
6. **Known gaps — ALL FIVE CONFIRMED, graded, not re-fixed.** (1) Banner dormancy CONFIRMED (`session-bind.ts:30` strips the clock; only tests pass `trialExpired`). (2) Tier bypass unlive + builder-start clock-only CONFIRMED (no `tier` in the session SELECT; `BuilderSession` carries clock only). (3) DB skips CONFIRMED: 34 wave assertions UNVERIFIED (listed in §Known Limitations 3). (4) CSS append CONFIRMED one-rule-only. (5) Two code paths CONFIRMED both enforcing, drift risk noted.
7. **Secrecy + safety — MET.** No secret values, tokens, passwords, `ENCRYPTION_KEY` values, or real URLs in diffs/reports; only names (`DATABASE_URL` in test/error-mapping code, no values). Never read `/opt/corvus/.env`. No git restore/install/push/migration/deploy action taken; only read-only `git diff`/`status`/`ls-files` plus the allowed test/typecheck/lint/format commands.
8. **Live sources — none needed, stated.** No current-fact claim made; all facts pinned by repo files. No web search required.
