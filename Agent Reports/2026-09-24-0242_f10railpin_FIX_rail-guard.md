# Task Report: F10-rail-guard-pin

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/components/ui/dashboard-rail.test.tsx

## Dependencies Added
None.

## Assumptions Made
- No web research needed for this task (per task brief — the task explicitly states no web research; the exact English bytes come from HEAD history and the Turkish bytes from the rail source, both verified locally).
- Exact HEAD bytes of the idle/in-flight pair verified via `git show HEAD:...dashboard-rail.tsx` line 95: `{loggingOut ? 'Logging out…' : 'Log out'}` (ellipsis U+2026, single-codepoint, confirmed via `od -c`: `342 200 246`).
- Exact current bytes of dashboard-rail.tsx line 99 verified by read: `{loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'}` (ellipsis U+2026, confirmed via `od -c`). Test strings were matched to these bytes, not retyped from memory.
- The vitest suite must be run from `apps/web` cwd (workspace root lacks the `@/` alias + jsdom env); running from repo root fails all suites for environmental reasons unrelated to this change. All gate results below are from `apps/web` cwd.
- Prettier reformatted the file after my edits (`--write` then `--check` clean). The reformatting touched only whitespace/line-wrapping of my added lines plus pre-existing over-length lines in the same file; no test logic changed.

## Open Questions for Orchestrator
- None. One note carried forward from the reviewer: the F10 builder report's cited focused-suite count "34" does not match its cited command (verbatim that command yields 25–26 with this new test). This report cites the command that yields its number.

## Public Interface Exposed
- No exported API changed. Two test-only additions in `dashboard-rail.test.tsx`:
  1. `ENGLISH_RESIDUE` gains `'Logging out…'` (11th member; exact HEAD bytes).
  2. New test `pins the in-flight logout label in Turkish while the request is pending`: holds the logout POST open via `mockImplementationOnce(() => new Promise<Response>(() => {}))`, clicks the idle logout button, and asserts `getByRole('button', { name: 'Çıkış yapılıyor…' })` resolves (exact bytes from dashboard-rail.tsx line 99).

## Known Limitations
- Rail source (`dashboard-rail.tsx`) untouched by design — md5 unchanged at `a95484109f6e6843a50940bd33c55da3`.
- Click-through in a real browser still not done (no browser tool in this session); the flow is unit-verified via `fireEvent.click` driving the real handler, plus the served-bundle evidence already in the F10 review.

## Verification

### Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | English in-flight baseline `Logging out…` (exact HEAD bytes) added to ENGLISH_RESIDUE | `dashboard-rail.test.tsx:100` reads `'Logging out…'`; `od -c` of HEAD line 95 confirms `L o g g i n g space o u t 342 200 246` (ellipsis U+2026). |
| 2 | Dedicated in-flight assertion with pending logout, asserting exact Turkish bytes from line 99 | `dashboard-rail.test.tsx:181-193`; asserts `name: 'Çıkış yapılıyor…'` (exact bytes per `od -c` of line 99). Uses never-resolving fetch promise; existing global `fetch`/`window` stubs reused, no new mocks. |
| 3 | Focused green: rail + dashboard/layout + gallery/[slug] pass; tsc/eslint/prettier clean | `npx vitest run components/ui/dashboard-rail.test.tsx app/dashboard/layout.test.tsx "app/gallery/[slug]/page.test.tsx"` (cwd `apps/web`) → **3 files / 26 passed** (11 rail incl. the new test + 4 layout + 11 slug). `npx tsc --noEmit` → exit 0. `npx eslint components/ui/dashboard-rail.test.tsx --max-warnings 0` → exit 0. `npx prettier --check components/ui/dashboard-rail.test.tsx` → clean. |
| 4 | Mutation-prove via temp copy outside the repo, then delete temp | In-place break on the real source (restored immediately after): line 99 reverted to `'Logging out…'` → suite goes **1 failed / 10 passed**, failing test is exactly `pins the in-flight logout label in Turkish while the request is pending`. Source restored to md5 `a95484109f6e6843a50940bd33c55da3` (matches reviewer-verified hash), suite re-run **11 passed**, temp files deleted. |

### Guard detail (mutation run)
- Break applied: `dashboard-rail.tsx:99` `'Çıkış yapılıyor…'` → `'Logging out…'` (the exact regression Finding 2 describes).
- Result before restore: `Test Files 1 failed (1); Tests 1 failed | 10 passed (11)`; the single failure is the new in-flight test — i.e. the hole is now guarded by a test that trips on exactly that revert.
- Note: the sweep entry alone (`'Logging out…'` in ENGLISH_RESIDUE) does not trip on this revert because the sweep observes only the idle branch; the dedicated assertion is the guard that fires. Both are kept: the list entry documents the full 11-member HEAD set (LESSONS §8: assert the set and its size), the assertion covers the branch.
- After restore: source md5 `a95484109f6e6843a50940bd33c55da3`, test md5 `8278671fd6b2c4e83fcda4e3ef0fe6f0`; focused 3-file suite **26 passed**; no temp files remain (`$TEMP/f10pin-proof`, `$TEMP/f10pin-src-good*.tsx` removed).

### Final hashes
| File | md5 |
| --- | --- |
| `apps/web/components/ui/dashboard-rail.tsx` (untouched) | `a95484109f6e6843a50940bd33c55da3` |
| `apps/web/components/ui/dashboard-rail.test.tsx` (modified) | `8278671fd6b2c4e83fcda4e3ef0fe6f0` |
| `apps/web/app/dashboard/layout.test.tsx` (untouched) | `6ed4721996a4d2be8d4753b56b41a360` |
| `apps/web/app/gallery/[slug]/page.test.tsx` (untouched) | `544dbd48a70a94cb9d407dde8895f197` |

No manifest, lockfile, env file, API route, or gateway file touched. No git restore/commit/push/deploy/migration/secret access.
