# Task Report: fix-trial-signal

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/page.tsx
- MODIFIED: apps/web/app/gallery/page.tsx
- MODIFIED: apps/web/app/dashboard/bots/page.test.tsx
- MODIFIED: apps/web/app/gallery/page.test.tsx

## Dependencies Added
None.

## Assumptions Made
- Locked copy reused verbatim: LOGGED_OUT_LINE/LOGIN_HREF from the [id] detail page, TRIAL_EXPIRED_MESSAGE + fail-open trial fetch from home/[id]; loading shells ("Loading your bots…", "Loading templates…") are neutral status text, not marketing copy.
- m-4 scope is the bots list + gallery per the task brief (home page.tsx loading left to its owner; the list is the surface named in the defect).
- Injected `bots` prop (tests) stays authoritative and skips fetch, matching existing list behavior; banner also accepts an injected `trialExpired` prop mirroring home/[id].

## Open Questions for Orchestrator
None.

## Public Interface Exposed
- `BotsPage({ bots?, trialExpired? })` — new optional `trialExpired` prop (test injection; live path reads GET /api/session/trial).
- Gallery state type change: `templates` is `GalleryTemplate[] | null` (`null` = in flight). No exported API change.

## Known Limitations
- Does not cover m-1 (code-only refusal strings), m-6 gallery retry, or home-page loading states — out of scope per brief.
- Banner is fail-open: an unreadable trial endpoint shows no banner (same as home/[id]).

## Verification
- `Set-Location apps/web; npx vitest run app/dashboard/bots/page.test.tsx app/gallery/page.test.tsx` → 2 files, 45 tests, all pass.
- `npx tsc --noEmit -p tsconfig.json` (from apps/web) → exit 0.
- `npx eslint <4 touched files> --max-warnings 0` → exit 0.
- `npx prettier --check <4 touched files>` → clean (one --write applied to bots page.test.tsx only).
- Guard/mutant: backed up bots page.tsx outside repo ($env:TEMP, SHA256 51CE1B0A…48BEA0), dropped the `unauthorized` branch, `vitest -t "logged-out"` → 1 failed / 23 skipped; restored via Copy-Item (no git restore), hash verified byte-identical, full suites re-run green. Failing count: 1.
- Secret scan of the diff (private-key/AKIA/token/password patterns) → no hits; `git status --porcelain` shows only the 4 intended files.
