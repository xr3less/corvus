# Task Report: review-e3-gallery

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-1155_reviewer_REVIEW_e3.md (this report; read-only review, no source files modified)

## Dependencies Added
None.

## Verdict Summary
Wave E3 (gallery truth) verified on the merged tree. All artifacts exist, copy is fork-first and grep-proof, cards link to the detail route, the fork-success trio includes Customize with AI, the detail page consumes only the existing GET /api/templates/[slug], the ?template= prefill is a static chip-like fill, and verdict/min-trial gates are untouched. Typecheck clean, lint clean on all four E3 files, 32/32 gallery+detail tests and 41/41 new-page tests green. No new API, no fork-behavior change, no secrets.

## Evidence

### 1. Artifacts exist (confirmed on disk)
- `apps/web/app/gallery/page.tsx` (modified)
- `apps/web/app/gallery/[slug]/page.tsx` (new — contains only `page.tsx` + `page.test.tsx`, no `route.ts`, so no new API)
- `apps/web/app/gallery/[slug]/page.test.tsx` (new, 11 tests)
- `apps/web/app/dashboard/new/page.tsx` (modified)

### 2. Gallery copy — fork-first, grep-proof
- Sub-copy now reads `Fork a template to your bots, then customize it with AI.` (`gallery/page.tsx:265`). Old inverted line (`describe the diff, then fork it`) gone.
- Case-insensitive grep for `describe` across `gallery/page.tsx` and `gallery/[slug]/page.tsx`: zero matches in source (only vitest `describe(` blocks in test files, which are test-harness vocabulary, not page copy).
- `fork/route.ts:62-66` documents the handoff as POST /api/spec/patch `{ botId, baseVersion, ... }` ("describe the diff" = the Customize-with-AI entry point). Both pages link `Customize with AI` to `/dashboard/bots/[botId]` (gallery `page.tsx:396-398`, detail `page.tsx:321`), matching that contract. Same destination as `Open your bot` today, as E3a declared.

### 3. Cards link to detail route
- Card titles wrap in `<a href={/gallery/${encodeURIComponent(template.id)}}>` (`gallery/page.tsx:377`).

### 4. Fork behavior unchanged (no instant-FAIL)
- `forkTemplate` core is byte-identical in logic: 401 logged-out path, payload parse, `botId`/`inviteUrl` validation, `forked`/`forkResults` state, in-flight guard. The only fork-adjacent change is moving `forkErrorMessage` to the shared `lib/http/refusal.ts` import — semantics identical (message-preferred, error fallback, `Fork failed (<status>)` fallback; verified against `refusal.ts:52-54`). Loading-shell `null` state and `?? []` guards are additive and covered by the new loading-shell test.

### 5. Detail page consumes existing API only
- Detail fetches existing `GET /api/templates/<slug>` (`[slug]/page.tsx:146`), validates slug `^[a-z0-9-]{1,64}$` with no-fetch on malformed, forks via existing `POST .../fork`, renders behavior preview / capabilities / perms why-lines / fork count / `Start in chat` link.
- Start-in-chat href assertion exists: `expect(start.getAttribute('href')).toBe('/dashboard/new?template=ticket-desk')` (`[slug]/page.test.tsx:118-119`).
- Preview-before-fork assertion exists: viewing fires no `/fork` POST (`[slug]/page.test.tsx:84-96`).

### 6. Template-in-chat prefill is static, gates untouched
- `new/page.tsx:66-110`: reads `?template=`, validates slug shape, fetches the existing detail endpoint once, fills composer via `setBrief(current => current === '' ? starter : current)` — empty-only, never overwrites, never sends, no model call. Same idiom as the suggestion chips.
- Verdict auto-start block (`new/page.tsx:191-274`, ASK_LINE gate, exactly-once POST to `/api/builder/verdict`) is intact and unmodified by E3. No min-trial/server-gate code touched; no files under `apps/web/app/api/` belong to E3 (untracked api dirs on the tree are other waves' scopes).

### 7. Toolchain (detected, not assumed) + results
- Project uses npm workspaces; web workspace `@corvus/web` scripts: `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`.
- `npm run typecheck --workspace @corvus/web`: clean, zero errors.
- `npx eslint app/gallery/page.tsx "app/gallery/[slug]/page.tsx" "app/gallery/[slug]/page.test.tsx" app/dashboard/new/page.tsx --max-warnings 0` (run from `apps/web`): clean, zero warnings.
- `npx vitest run app/gallery/page.test.tsx "app/gallery/[slug]/page.test.tsx"`: 2 files, 32/32 passed.
- `npx vitest run app/dashboard/new/page.test.tsx`: 1 file, 41/41 passed.

### 8. Security / scope guards
- Grep for `process.env`, `SECRET`, `API_KEY` in both pages and the detail dir: no matches. No secret values printed, copied, or transmitted.
- E3 reports declare no manifest edits, no installs, no git commands; E3 file set contains no `package.json`/lockfile/`.env` changes. Reviewer ran no git restore/commit, touched no production, ran only local typecheck/lint/tests.

## Known Limitations (not fails)
- Template-in-chat seeding on `new/page.tsx` has no dedicated test (legacy `new/page.test.tsx` lacks a `next/navigation` mock for `useSearchParams`); pinned only by the detail suite's `Start in chat` href assertion plus identical fetch logic. Flagged by E3b; recommend a follow-up test-only task if the orchestrator wants it pinned.
- Gallery list page has no test asserting the card-title `/gallery/[slug]` href or the third `Customize with AI` CTA (grep for `Customize|gallery/` in `gallery/page.test.tsx` returns nothing). Verified by code read; recommend adding href assertions in a follow-up test-only task.
- `new/page.tsx` working-tree diff also contains non-E3 changes (verdict auto-start M-8/M-9 blocks from another wave); this review confirms the E3 hunk is additive and the verdict block still passes its 41 tests, but ownership of those hunks belongs to their own wave's review.

## Assumptions Made
- Test-file `describe(` occurrences are vitest harness vocabulary, not page-copy claims; excluded from the grep-proof check.
- Untracked `apps/web/app/api/*` directories (verdict, credits, checkout, webhooks, etc.) belong to sibling waves, not E3; E3's CREATE/MODIFY scope contains no API route.

## Open Questions for Orchestrator
- None blocking. Two optional follow-ups: (1) dedicated `?template=` seeding test on the new-bot page, (2) card-link + third-CTA href assertions on the gallery list page. Both are test-only tasks with disjoint scope from E3 source files.
