# Task Report: shared-bounds-verdict-0245

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/lib/verdict/bounds.ts
- MODIFIED: apps/web/app/api/builder/verdict/route.ts
- MODIFIED: apps/web/app/dashboard/new/page.tsx
- MODIFIED: apps/web/app/api/builder/verdict/route.test.ts
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx
- DELETED: (none)

No other file was created, modified or deleted. No git restore/stash/checkout/reset was run, no commit, no install, no manifest/lockfile/config change. Scratch baselines live outside the repo at `%TEMP%\shared-bounds-av-route.ts` / `%TEMP%\shared-bounds-av-page.tsx` (restored byte-identically, hash-verified).

## Dependencies Added
- None. No manifest, lockfile, version or config was touched, and no install was run.

## Assumptions Made
- One shared name wins: the module exports `boundedView` (route's name). The page imports it aliased as `boundedTurn` (`boundedView as boundedTurn`), so the page's single call site (`boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX)`) is byte-identical in behavior with zero logic churn. The page's `VERDICT_TURN_MAX` / `VERDICT_TURN_TAIL_MAX` / `VERDICT_TURNS_MAX` names are kept as import aliases (`TURN_MAX as VERDICT_TURN_MAX`, `PLAN_TAIL_MAX as VERDICT_TURN_TAIL_MAX`, `TURNS_MAX as VERDICT_TURNS_MAX`) so every consumer line keeps its existing identifier.
- `readRefusalMessage` is shared from the new module only for the verdict route + new-chat page pair. The identical readers in `app/dashboard/bots/[id]/page.tsx`, `app/interview/page.tsx`, and `app/gallery/page.tsx` are deliberately NOT unified here — the brief scopes this task to route+page, and the follow-up owns the wider unification.
- Test mirrors become imports, not second copies: both test files previously held their own constant literals; they now import from the shared module. The route test's `REPLY_TAIL` name is kept as an import alias (`REPLY_TAIL_MAX as REPLY_TAIL`), so downstream assertions are untouched. This is the correct end state of the debt (one source, impossible to drift) rather than the old pattern (two copies that tests pin).
- Import style follows each file's existing convention: route + route test use the file's relative `../../../../lib/verdict/bounds` path (same as their existing `lib/db/pool` imports); page + page test use the `@/lib/verdict/bounds` alias (same as the page's existing `@/components/ui/*` imports).
- The route file's trial/budget refusal copy (`TRIAL_BUDGET_MESSAGE`, `budgetRefusalMessage`) is intentionally NOT moved — it mirrors the chat route's wording, not the verdict page's bounds, and belongs to a different unification (if any).

## Open Questions for Orchestrator
1. Wider `readRefusalMessage` unification is still open: `bots/[id]/page.tsx`, `interview/page.tsx`, and `gallery/page.tsx` each hold their own copy (verified by grep). Same-class, excluded with reason (out of this task's route+page scope), flagged for the follow-up wave.
2. Live-path evidence remains owed from the earlier waves (dev server -> /dashboard/new -> long plan -> yes -> inline progress, named human). All tests here are hermetic by design; nothing in this refactor substitutes for it.

## Public Interface Exposed
New module `apps/web/lib/verdict/bounds.ts` (pure, no React, no I/O, no secrets):
- `TURNS_MAX = 12`, `TURN_MAX = 2000`
- `PLAN_MAX = 1000`, `REPLY_MAX = 500`, `THREAD_MAX = 3000`, `BRIEF_MAX = 2000`
- `PLAN_TAIL_MAX = 500`, `THREAD_TAIL_MAX = 1000`, `REPLY_TAIL_MAX = 250`
- `ELLIPSIS = '\n…\n'` (byte contract preserved)
- `boundedView(text, max, tailMax): string` — kept-ends view, exactly `max` chars when over-long, identity when in-bound
- `readRefusalMessage(payload: unknown): string | null` — message-preferred, error-fallback refusal reader

No route export, request/response shape, gate order, metering, POST shape, or verdict flow changed. `validateTurns`, `parseVerdict`, `POST`, `BUILDER_QUEUE`, and all test seams are untouched. `NewBotPage` props and rendered surface are unchanged.

## Known Limitations
- No live-path evidence (hermetic suites only; see Open Question 2).
- The page-mutation guard run shows 4 failed / 33 passed (not the 1 failure a pure head-only regression would give): the `Set-Content -NoNewline` rewrite stripped the file's trailing newline, so 3 unrelated render tests failed on an encoding artifact of the harness, not on the mutation. The one load-bearing failure (`a plan turn capped at the bound keeps both ends...`) is the kept-ends guard, and the route-mutation run is clean (2 failed / 28 passed, exactly the 2 over-bound reply tests). Both files were restored byte-identically (route `CDBACAFD...`, page `34E3418F...`, hash-verified) and both suites re-run green.
- Full web suite was not re-run; focused suites (30/30 route + 37/37 page = 67/67) plus workspace typecheck, ESLint zero-warnings, and Prettier clean are the gates exercised. A full-suite run belongs to the review gate.

## Verification (evidence, not self-report)
- `npm run typecheck --workspace @corvus/web` — exit 0.
- `npx eslint --max-warnings 0` on all 5 touched files (from repo root) — exit 0, 0 warnings.
- `npx prettier --check` on all 5 touched files — clean.
- `npm run test --workspace @corvus/web -- app/api/builder/verdict/route.test.ts app/dashboard/new/page.test.tsx` — 2 files, 67 passed (30 route + 37 page), 0 failed.
- Guard validation (LESSONS section 8): route head-only mutation (`boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX)` -> `reply.slice(0, REPLY_MAX)`) fails exactly 2/30; page head-only mutation (`boundedTurn(...)` -> `row.text.slice(0, VERDICT_TURN_MAX)`) fails the kept-ends test (4 failed / 33 passed, 3 of the 4 being the harness newline artifact noted above). Both files restored hash-identical, suites re-run green. Failing counts named.
- No secret/token/key/connection-string in the diff (route owns no keys; the lane does). No prod/box/SSH/GHCR/Contabo/`.env` contact.
