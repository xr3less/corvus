# Task Report: reviewer-shared-bounds-0304

## Status
SUCCESS

## Verdict
PASS — the shared-bounds verdict refactor is approved.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0304_reviewer_REVIEW_shared-bounds.md (this report)
- MODIFIED: (none)
- DELETED: (none)

Review scope (read-only; nothing in scope was modified): apps/web/lib/verdict/bounds.ts, apps/web/app/api/builder/verdict/route.ts, apps/web/app/dashboard/new/page.tsx, apps/web/app/api/builder/verdict/route.test.ts, apps/web/app/dashboard/new/page.test.tsx.

Note on guard procedure: the two guard mutations were applied via file edit and restored from outside-repo backups at %TEMP%\reviewer-guard-route-backup.ts / %TEMP%\reviewer-guard-page-backup.tsx (copies, never git restore/stash/checkout/reset). Both files restored byte-identically (hash-verified, see below) and scratch copies were deleted afterwards. No installs, no commits, no production contact, no secret printed.

## Dependencies Added
- None. No manifest, lockfile, version or config was touched, and no install was run.

## Acceptance Verification (in order)

### 1. Byte contract — PASS
All 9 numeric bounds + ELLIPSIS marker in apps/web/lib/verdict/bounds.ts match the pre-refactor values stated in the task brief exactly as read from disk:
- TURNS_MAX = 12, TURN_MAX = 2000
- PLAN_MAX = 1000, PLAN_TAIL_MAX = 500
- REPLY_MAX = 500, REPLY_TAIL_MAX = 250
- THREAD_MAX = 3000, THREAD_TAIL_MAX = 1000
- BRIEF_MAX = 2000
- ELLIPSIS = '\n…\n'
- boundedView: identity when in-bound; otherwise exactly `max` chars (`head + ELLIPSIS + tail`), matching the described kept-ends shape.

No local duplicates remain in route.ts / page.tsx (grep for local const redeclarations of TURN/PLAN/REPLY/THREAD/BRIEF/TURNS/ELLIPSIS/boundedView/boundedTurn: route.ts has only VERDICT_MAX_TOKENS/BRIEF_MAX_TOKENS + locked copy strings; page.tsx has only ASK_LINE + deriveBotName. Both files import all bounds from lib/verdict/bounds). The only `.slice(0, …)` left in route.ts is the brief clamp `briefRaw.slice(0, BRIEF_MAX)` — via the shared constant, sound. The only `.slice(0, …)` in page.tsx are `deriveBotName` (32-char name) and the turns-tail windowing — unrelated to verdict bounds, sound.

### 2. Behavior — PASS
Route diff reviewed: gate order unchanged (session 401 fail-closed → KI-033 trial-clock 403 BEFORE body → 422 botId uuid + turns shape → 404 ownership incl. soft-deleted exclusion → monthly-allowance 403 → 409 no_plan_asked via boundedView ask-line check → verdict call → no/unclear short-circuit with NO row and NO job → brief call → clamp 1..2000 → INSERT builder_runs + pg-boss send with identical queue/singletonKey/retryLimit shape → spend metering as persona-run with swallowed ledger failures). POST shape, BUILDER_QUEUE, validateTurns, parseVerdict, test seams all untouched; the only logic-adjacent change is boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX) replacing the head slice — the intended fix, covered by tests. Page diff reviewed: verdict effect (adjacency check, once-guards, turns tail, 409-silent / refusal-sentence / transport-fallback handling) unchanged; the only change is boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX) via shared import. No gate reorder, no new billing path, no contract change.

### 3. Project's real gates — PASS
Toolchain detected from disk (not assumed): root package.json (npm workspaces, package-lock.json present → npm) with per-workspace scripts; apps/web/package.json scripts: typecheck = `tsc --noEmit`, lint = `eslint .`, format = `prettier --check`, test = `vitest run`; deps confirm TypeScript 5.9.3 / Next 16.3.4 / Vitest 5.0.0 / ESLint 9.39.5 / Prettier 3.9.6.
- `npm run typecheck --workspace @corvus/web` — exit 0.
- `npx eslint --max-warnings 0` on all 5 touched files — exit 0, 0 warnings.
- `npx prettier --check` on all 5 touched files — clean.
- Focused: route.test.ts 30/30, page.test.tsx 37/37 (combined 67/67), exit 0.
- FULL web suite (`npm run test --workspace @corvus/web`): 58 files, 764 passed | 69 skipped (833 total), exit 0. (One stderr notice about HTMLCanvasElement getContext lacking the canvas package is a pre-existing environment notice, not a failure.)
- No check was invented or silently skipped.

### 4. Trust artifacts — PASS
- The claimed author report exists on disk at Agent Reports/2026-09-23-0245_shared-bounds_REFACTOR_verdict-shared.md (read in full; 197121-byte file dated Sep 23 02:59).
- The claimed files were really touched: `git status --porcelain` shows `M apps/web/app/dashboard/new/page.tsx`, `M apps/web/app/dashboard/new/page.test.tsx`, and untracked `?? apps/web/app/api/builder/verdict/route.ts`, `?? apps/web/app/api/builder/verdict/route.test.ts`, `?? apps/web/lib/verdict/bounds.ts`. The route files are new/untracked (hence absent from `git diff --stat`), but present and real on disk with the content reviewed above.
- File hashes at review time: route.ts CDBACAFD91364CD26A31F8FFB2468B546F0BAB376E8A9D3B36C6F6495D53178B, page.tsx 34E3418F4CF822F830281A025011AF38ADC1FFA2904177557A003795FA01ADB3 — identical before and after the guard runs.

### 5. Guard broken and watched (own mutation, not the author's) — PASS
- Route: my own head-only mutation (`boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX)` -> `reply.slice(0, REPLY_MAX)`) fails exactly 2/30: `judges a >500-char reply whose acceptance is at the END as yes, and starts the run` and `bills an over-bound reply as exactly REPLY_MAX chars, acceptance included`. Restored byte-identically (hash CDBACAFD… re-verified), suite re-run green 30/30.
- Page: my own head-only mutation (`boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX)` -> `row.text.slice(0, VERDICT_TURN_MAX)`, applied via Edit so no trailing-newline artifact) fails exactly 1/37: `a plan turn capped at the bound keeps both ends, drops the middle, and never exceeds it`. Restored byte-identically (hash 34E3418F… re-verified), combined suites re-run green 67/67.
- This is cleaner than the author's page run (4 failed / 33 passed, 3 of which the author attributes to a Set-Content -NoNewline harness artifact): my run isolates the single load-bearing kept-ends failure with no encoding noise.

### 6. Class enumeration — PASS (remaining copies named, exclusions sound)
- boundedView/boundedTurn/ELLIPSIS: no remaining local copies anywhere in apps/web or packages (grep). Only bounds.ts defines them; only route.ts, page.tsx, and their two test files import them. Test files import rather than re-declare — correct end state.
- Head-slice duplicates: none remain on the verdict path. Other `.slice(0, N)` hits are unrelated: bots/[id]/page.tsx:807 `summary: text.slice(0, 500)` (a display summary, not a verdict bound) and templates fork route `diffSummary … .slice(0, 500)` (same). Exclusion sound.
- readRefusalMessage class (same-class, deliberately out of this task's route+page scope — author flagged, I confirm each):
  - `apps/web/app/dashboard/bots/[id]/page.tsx:113` — own local copy with a DOCUMENTED deliberate difference (message-only; the `error` leg is not taken because every error value that route can answer is a machine code). Exclusion sound; unifying it into the shared module would change its locked behavior, so it needs its own task, not a silent merge.
  - `apps/web/app/interview/page.tsx:79` `readErrorMessage` — async Response-based twin with caller fallback, mirrors new-page reader per its own comment. Same class, exclusion sound.
  - `apps/web/app/gallery/page.tsx:76` `forkErrorMessage` — payload+status twin, mirrors new-page reader per its own comment. Same class, exclusion sound.
- No secret/token/key/connection-string in any reviewed file or diff (route owns no keys; the lane does). No prod/box/SSH/GHCR/Contabo/.env contact.

## Assumptions Made
- The fix reports' stated pre-refactor values (as quoted in this review's task brief) are taken as the byte-contract baseline; the SPEC file (2026-09-22-1939) does not pin the numeric bounds, so the brief's value list is the authority I checked against. All 9 + marker match it exactly.
- The author's scratch baselines at %TEMP%\shared-bounds-av-route.ts / page.tsx were not inspected (outside-repo scratch, since cleaned or inaccessible); equivalence was instead verified by my own restore-hash checks plus full green re-runs.
- The full-suite canvas getContext stderr notice is treated as a pre-existing environment notice (suite exit 0, no failure attributed).

## Open Questions for Orchestrator
1. Wider refusal-reader unification (bots/[id] readRefusalMessage, interview readErrorMessage, gallery forkErrorMessage) is still open — same class, each with a reason it cannot be silently merged (notably the bots/[id] message-only difference). Recommend one follow-up wave with per-caller behavior pinned by tests before any merge.
2. Live-path evidence (dev server -> /dashboard/new -> long plan -> yes -> inline progress, named human) remains owed from the earlier waves and nothing in this refactor substitutes for it — hermetic suites only, by design.

## Public Interface Exposed
No new public interface from this review. Reviewed module surface (unchanged from author report): apps/web/lib/verdict/bounds.ts exporting TURNS_MAX, TURN_MAX, PLAN_MAX, REPLY_MAX, THREAD_MAX, BRIEF_MAX, PLAN_TAIL_MAX, THREAD_TAIL_MAX, REPLY_TAIL_MAX, ELLIPSIS, boundedView, readRefusalMessage.

## Known Limitations
- No live-path evidence (hermetic suites only; see Open Question 2).
- The review ran no git-modifying, install, commit, or deploy commands; working tree left exactly as found (hashes confirm byte-identical restore of both guard-mutated files).
