# Task Report: trialcopy-trial-unify

## Status
SUCCESS

All 4 over-reading trial-copy sites unified to the limited wording (3-day, 1 bot, 100 AI credits). Zero `full Pro` / `full access` trial wording remains in the 4 sites (grep-verified). Gates: typecheck exit 0, ESLint exit 0 on all 6 touched files, Prettier clean, touched-area suites 40/40 green (terms 4/4, brain 15/15, pryzm 21/21).

## Files Touched
- MODIFIED: apps/web/app/terms/page.tsx (short-version bullet :44 — `full access` -> `3-day trial of Pro features, limited to one bot and 100 AI credits with no card required`; planned status kept accurate — `Billing isn't live yet` / `is planned` preserved, consistent with the already-fixed :89 `Trial (live)` line)
- MODIFIED: apps/web/app/pryzm/page.tsx (:230 blurb `Full Pro, free for 3 days.` -> `Pro features for 3 days — 1 bot, 100 credits.`; :923 `Start with 3 days of full Pro free — no card required.` -> `Start with 3 days of Pro features — 1 bot and 100 credits, no card required.`; adjacent limits list `1 bot for 1 server` / `100 credits to spend on builds` left intact)
- MODIFIED: apps/web/lib/demo/brain.ts (:9 PRICING_REPLY `Trials run 3 days, full Pro, no card` -> `Trials run 3 days, 1 bot, 100 credits, no card`, same friendly tone; wrapped to two lines for Prettier)
- MODIFIED: apps/web/app/terms/page.test.tsx (added pins: short bullet contains `3-day trial of Pro features` and NOT `full access`; existing :89 pin kept)
- MODIFIED: apps/web/app/pryzm/page.test.tsx (:246 pin now `Start with 3 days of Pro features`; added `not.toContain('full Pro')` guard; trial-card pin now asserts blurb `Pro features for 3 days` alongside existing `1 bot for 1 server` / `100 credits` pins)
- MODIFIED: apps/web/lib/demo/brain.test.ts (:8 PRICING_REPLY constant updated to match source byte-for-byte; Prettier wrap applied)
- CREATED: Agent Reports/2026-09-23-1410_trialcopy_FIX_trial-unify.md (this file)

## Dependencies Added
- None. No manifest, lockfile, or env file touched. No install run.

## Assumptions Made
- `brain.test.ts` path was `apps/web/lib/demo/brain.test.ts` as stated in the task — found it there, so no escalation was needed.
- `apps/web/app/page.tsx:731` (`Planned: full access to all 8 starter templates`) is NOT trial copy — it describes planned template-gallery access, not the trial — so it is out of scope and was deliberately left untouched. Flagged in Known Limitations rather than silently expanded.
- Pryzm "Pro features" blurb keeps `Every Pro feature unlocked` feature-list line intact — that line describes *which* features (scope of features, still gated by 1 bot / 100 credits stated in the same card), not trial duration; the over-read was in the headline, which now names the limits.
- PRICING_REPLY length stays within the 280-char voice gate (new string is ~77 chars); the brain length/voice tests confirm.

## Open Questions for Orchestrator
- None blocking. One FYI: `apps/web/app/page.tsx:731` still contains the words `full access` in a non-trial context (`Planned: full access to all 8 starter templates`). If a future sweep wants zero `full access` wording repo-wide, that line is the next candidate — but it was out of this task's declared scope.

## Public Interface Exposed
- No exported type, function signature, route, or data shape changed. Copy-only edits to `TermsOfServicePage`, `PRICING_PLANS` entries, and the `PRICING_REPLY` string constant; test-expectation updates only.

## Known Limitations
- Full web suite was not re-run; touched-area suites only (terms + pryzm + brain = 40/40). Prior full-suite state per sibling report was 885/885; this task's changes are copy+pin only within those 3 suites.
- No real-path browser render (no dev server); verification is rendered-`textContent` assertions via the real components plus grep checks, consistent with a copy task.
- No secrets read, printed, or transmitted. No manifest/env edit, no install, no git restore/stash/checkout/reset, no commit, no production contact.

## Verification Performed
- Grep (trial class): `full Pro|full access|Full Pro` over each of `apps/web/app/terms/page.tsx`, `apps/web/app/pryzm/page.tsx`, `apps/web/lib/demo/brain.ts` → **no matches** in all three (post-fix).
- Numbers check: `3-day trial|3 days of Pro` in terms/page.tsx → :44 + :89 both limited wording; `Pro features for 3 days|Start with 3 days` in pryzm/page.tsx → :230 + :923 both limited wording; `PRICING_REPLY` in brain.ts → `Trials run 3 days, 1 bot, 100 credits, no card`.
- Typecheck: `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) → **exit 0, zero errors**.
- Lint: `npx eslint app/terms/page.tsx app/terms/page.test.tsx app/pryzm/page.tsx app/pryzm/page.test.tsx lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` (from `apps/web`) → **exit 0, zero warnings**.
- Format: `npx prettier --check` on the same 6 files → **clean** (one wrap-only reflow applied to brain.ts + brain.test.ts).
- Tests: `npx vitest run app/terms/page.test.tsx app/pryzm/page.test.tsx lib/demo/brain.test.ts` → **40/40** (terms 4/4, brain 15/15, pryzm 21/21).
