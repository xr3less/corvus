# Task Report: F15-unify-readers

## Status
PARTIAL — all four in-scope edits are complete and their target suites pass; two `thread.test.ts` assertions pinning the old `busy` passthrough now fail by design (out of scope to fix), and the dashboard suites are flaky (green twice, red once — pre-existing, not mine).

## Files Touched
- MODIFIED: apps/web/lib/verdict/bounds.ts — deleted the local `readRefusalMessage` copy (lines 60-72); now `export { readRefusalMessage } from '@/lib/http/refusal'` with an updated comment. Exported name and null contract identical; `app/dashboard/new/page.tsx` imports unchanged and still resolves.
- MODIFIED: apps/web/lib/chat/thread.ts — added `import { readRefusalMessage } from '../http/refusal'` (relative; `@` alias covers `lib` but this file already imports relatively, so kept the local style); `readHttpError` keeps the 401 line and the generic fallback line byte-identical and replaces only the middle with `return readRefusalMessage(payload) ?? 'The reply stopped unexpectedly. Try again.'`
- MODIFIED: apps/web/components/ui/builder-progress.tsx — added `import { readRefusalMessage } from '@/lib/http/refusal'`; `readApiError` resolves via `readRefusalMessage(body)` first, falling back to the existing raw-`error` verbatim path for prose bodies.
- MODIFIED: apps/web/app/gallery/page.test.tsx — deleted the `it('falls back to the raw error code …')` block (old lines 409-423); kept the `not.toContain('trial_bot_limit')` assertion at line 377; left a two-line comment citing superseded-by F15 above the status-line test.
- No other file created, modified, or deleted. No manifest, lockfile, env, refusal.ts, gallery/page.tsx, interview or bot-detail page touched. No git restore/commit/push/deploy/migrate/secrets/.env command run.

## Dependencies Added
None.

## Assumptions Made
- No web research was performed, per the task's explicit guardrail — stated here as instructed.
- The `@` alias covers `lib` (`apps/web/tsconfig.json` maps `@/*` to `./*`), so `@/lib/http/refusal` is valid; used it in `bounds.ts` and `builder-progress.tsx`, and a relative `../http/refusal` in `thread.ts` to match that file's existing import style.
- `new-bot page import confirmed read-only`: `app/dashboard/new/page.tsx` lines 30-35 import `readRefusalMessage` from `@/lib/verdict/bounds` (not from `refusal.ts` directly), and uses it at lines 320-326 (`START_FALLBACK_ERROR`) and 378-384 (`MINT_FALLBACK_ERROR`). The bounds re-export therefore reaches the new-bot page with zero caller changes — deliberately left the page's import path untouched to keep the diff to the four scoped files.
- `builder-progress.tsx` prose contract: `{ error: 'could not fork' }`-style values pass through the reader unchanged (whitespace = server sentence), so the reader-first order preserves the existing verbatim behavior for prose; only code-shaped unknowns now resolve to the Turkish generic instead of the raw token. That is the intended AC3 behavior, not a regression.
- `thread.test.ts` `busy` expectations were treated as the same defect class as the retired gallery raw-code test (wave-authored, pins the leak), but that test file is OUT of scope so it was left failing rather than edited.

## Open Questions for Orchestrator
1. **Retired-test follow-up, same class, needs a decision:** `apps/web/lib/chat/thread.test.ts:94-99` (`passes server error text through`) and `:129-136` (`falls back to error when message is absent…`) feed `{ error: 'busy' }` and assert `toBe('busy')`. Under the unified reader `busy` is code-shaped-unknown and now correctly resolves to the Turkish generic `İstek tamamlanamadı — tekrar dene.` These two tests pin the exact leak this task removes, just as the retired gallery block did. They were left red because `thread.test.ts` is outside my four-file scope. Recommend the same treatment: update them to expect the generic (or retire them) in a follow-up task — do NOT narrow the reader to satisfy them.
2. **Deferred language decision for the founder (do NOT decide page language myself):** Turkish refusal sentences are now reachable on English-only surfaces — `app/gallery/page.tsx`, `app/gallery/[slug]/page.tsx`, and `app/interview/page.tsx` contain zero Turkish letters today, and the reviewer (2026-09-24-0201_reviewer_REVIEW_F15) confirmed F15 feeds them Turkish on the code-only path; this task extends that reach to the new-bot page, the chat lane (`readHttpError`), and the builder poller (`readApiError`). A code-only refusal on any of those surfaces now reads a Turkish sentence on an otherwise English page. Whether those pages should stay English (and get English refusal twins), go Turkish, or stay mixed is a product/language decision for the founder — escalating, not choosing.
3. **Dashboard suite flake is pre-existing:** `app/dashboard/bots/[id]/page.test.tsx` (Thinking/stream tests) and `app/dashboard/new/page.test.tsx` (Thinking assertion) each failed once during this task and then passed twice consecutively (108/108 twice), including once with my `thread.ts` change stashed. The failures do not correlate with my edits. Flagging so the wave does not chase it as my regression.

## Verification
Toolchain (detected, not assumed): npm workspaces, `tsc --noEmit`, repo-root eslint flat config `--max-warnings 0`, prettier 3.9.6, vitest 5.0.0 via `apps/web/vitest.config.mjs`.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `cd apps/web && npx tsc --noEmit` | exit 0, zero output |
| Lint | `npx eslint --max-warnings 0` on the four files | exit 0, clean |
| Format | `npx prettier --check` on the four files | clean |
| Gallery | `npx vitest run app/gallery/page.test.tsx` | 20/20 pass (was 20 pass / 1 fail before the test retirement) |
| Interview | `npx vitest run app/interview/page.test.tsx` | 13/13 pass |
| Gallery slug | `npx vitest run "app/gallery/[slug]/page.test.tsx"` | pass (3-file run: 44/44) |
| Builder-progress unit | `npx vitest run components/ui/builder-progress.test.tsx` | 8/8 pass |
| Thread unit | `npx vitest run lib/chat/thread.test.ts` | 16 pass / 2 fail — the two `busy` assertions in Open Question 1, failing by design |
| Dashboard new + bot-detail | `npx vitest run app/dashboard/new/page.test.tsx "app/dashboard/bots/[id]/page.test.tsx"` | 108/108 pass twice consecutively; one earlier run showed 3 bot-detail + 1 new-page failures that reproduce with my `thread.ts` change stashed (pre-existing flake) |
| Baseline probe | stashed all four edits, ran `thread.test.ts` (7 fail / 11 pass) and gallery (2 fail / 14 pass) | confirms the tree was already red without me; my change strictly reduces failures |

Not verified in the running app: no human completed a refusal flow in the browser this task (same honest limitation as F15 and its reviewer).

## Public Interface Exposed
No exported signature changed. `readRefusalMessage(payload)` keeps its `(payload: unknown) => string | null` shape via re-export from `bounds.ts`; `readHttpError(response)` and `readApiError(body)` keep their parameters and returns. Wire-behavior delta, precisely: known code-only bodies now resolve to the Turkish table on all four surfaces; prose bodies pass through byte-identical; unknown code-shaped values resolve to the Turkish generic (was: raw token); `message`-bearing bodies are byte-identical to before, always.

## Known Limitations
- Two `thread.test.ts` `busy` assertions fail by design (Open Question 1); fixing them requires editing a file outside this task's scope.
- `bounds.ts` has no dedicated unit-test file; its coverage is via `app/dashboard/new/page.test.tsx` (49/49 on final runs, flaky once — see above).
- Turkish-on-English-pages reachability is widened by this task and still awaits the founder's language decision (Open Question 2).
- Not verified in the running app; evidence is suite-, gate-, and probe-level.
