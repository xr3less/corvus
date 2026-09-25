# Review Report: review-F15 (F15-unify-readers)

## Status

**PASS** — all four in-scope edits verified correct at source on the merged tree. The class the prior reviewer failed as 1-of-4 is now 4-of-4. The only red (two `thread.test.ts` `busy` assertions) is in an explicitly out-of-scope file and pins the exact leak this task removes; the builder correctly left it red rather than expanding scope. Follow-up required, not a defect in this task's code.

I did not write this code. Independent review, clean context. No source edits, no git restore/commit/push/deploy/migrate, no secrets touched. Probes ran from /tmp (outside the repo).

## Independent Verification (commands + results)

Toolchain detected, not assumed: npm workspaces + package-lock.json, `tsc --noEmit`, repo-root eslint flat config `--max-warnings 0`, prettier 3.9.6, vitest 5.0.0 via `apps/web/vitest.config.mjs`.

| Gate | Command (cwd) | Result |
|---|---|---|
| Typecheck | `cd apps/web && npx tsc --noEmit` | exit 0, zero output |
| Lint | `npx eslint --max-warnings 0` on the 4 in-scope files (repo root) | exit 0, clean |
| Format | `npx prettier --check` on the 4 in-scope files | clean |
| Gallery | `npx vitest run app/gallery/page.test.tsx` | 20/20 pass |
| Interview + slug | `npx vitest run app/interview/page.test.tsx "app/gallery/[slug]/page.test.tsx"` | 24/24 pass |
| Builder-progress | `npx vitest run components/ui/builder-progress.test.tsx` | 8/8 pass |
| Dashboard new + bot-detail | `npx vitest run app/dashboard/new/page.test.tsx "app/dashboard/bots/[id]/page.test.tsx"` | 108/108 pass (single run; report claimed twice) |
| Thread unit | `npx vitest run lib/chat/thread.test.ts` | 16 pass / 2 fail — the two `busy` assertions at :94-99 and :129-136, failing by design (see Findings) |

Exit codes captured directly, never through a pipe.

## Findings

1. `bounds.ts:65` — local `readRefusalMessage` copy (old lines 60-72) is gone; file now holds `export { readRefusalMessage } from '@/lib/http/refusal'`. Confirmed by reading the file. The new-bot page (`app/dashboard/new/page.tsx:29-35`) still imports from `@/lib/verdict/bounds` and calls it at :320-326 and :378-384, so the re-export reaches it with zero caller changes. Direct node import of the re-export was impossible outside the bundler (`@` alias does not resolve under plain node — instrument limitation, named not hidden); the chain is proven instead by `tsc` exit 0 plus the 108/108 dashboard run, which exercises both call sites.
2. `thread.ts:6,136-147` — `import { readRefusalMessage } from '../http/refusal'` added (relative, matching the file's existing style); `readHttpError` keeps the 401 line (:137-139) and the generic fallback (:142, :146, `'The reply stopped unexpectedly. Try again.'`) byte-identical; only the middle now returns `readRefusalMessage(payload) ?? <generic>`. Confirmed by reading the file and its diff.
3. `builder-progress.tsx:13,53-59` — shared-reader import added; `readApiError` resolves via `readRefusalMessage(body)` first, falling back to the existing raw-`error` verbatim path for prose bodies. Confirmed by reading the file and its diff. Order is correct: prose (`{error:'could not fork'}`) passes through unchanged, code-shaped unknowns get the Turkish generic.
4. `gallery/page.test.tsx:377,409-425` — `not.toContain('trial_bot_limit')` kept at :377; the raw-code `it`-block is deleted and replaced by a status-line test (`{} → 'Fork failed (403). Try again.'`) with a two-line `Superseded by F15` comment. Confirmed by reading the file.
5. Independent probe (`node --experimental-strip-types`, /tmp, absolute `file://` import of `refusal.ts`, 9 assertions, all PASS): known code → Turkish sentence; unknown codelike (`busy`) → Turkish generic; prose (`could not fork`) passthrough; `message` wins; `null`/`{}` → null; `constructor` → generic (Map does its job, no proto leak); `forkErrorMessage({},403)` byte-locked line intact; code-only fork body → Turkish sentence.
6. The two failing `thread.test.ts` assertions feed `{error:'busy'}` and assert `toBe('busy')` — they pin the exact leak this task removes, same defect class as the retired gallery block. `thread.test.ts` was explicitly out of scope, so leaving them red and escalating was the correct scope-guard behavior. Recommend the same treatment (update to expect the generic, or retire) in a follow-up — do NOT narrow the reader.

## Accuracy of build report

Accurate on every checkable claim: the four file:line descriptions match what I read; gate numbers reproduce exactly (gallery 20/20, interview 13/13, slug pass, builder-progress 8/8, thread 16/2 with the named cause, dashboard 108/108 on my run); the `busy` open question cites the correct lines; the dashboard flake is not mine to confirm or deny (my single run was green). Two additive notes, neither contradicting the report: (a) `thread.ts` also contains another agent's `stitchBrief` addition (KI-036, in the same diff vs HEAD) which the report does not mention — mixed authorship, not a F15-unify defect; (b) the report's "108/108 twice" I verified once.

## Scope / artifacts / hygiene

- In-scope files confirmed touched: `thread.ts` (M), `builder-progress.tsx` (M), `gallery/page.test.tsx` (M) tracked-modified; `bounds.ts` (?? untracked — new this wave from a sibling, now holding the re-export). `refusal.ts` (?? untracked, mtime 02:05, before this task's 02:42–02:57 window) untouched by this task — correct.
- The merged tree is NOT clean beyond this task: `package-lock.json` is modified (an `apps/testbot` discord.js stanza — a concurrent agent, not F15), `app/dashboard/new/page.tsx` carries a 382-insertion diff (another agent's verdict work; this task read it read-only as instructed), and `gallery/page.test.tsx` contains other agents' additions (loading-shell test, trial-sentence tests, rail Turkish labels) around F15-unify's retired block. None of that is F15-unify's authorship; the "only in-scope files modified" criterion cannot hold on a live wave tree and the report was honest that its claim covers its own edits only.
- No manifest/lockfile/env edit, no install, no git state-changing command attributable to this task. Report file exists at its claimed path.

## Assumptions

- Read the three whitelisted reports only; treated the build summary as a claim to test, not evidence.
- `git status`/`git diff` used read-only; no stash/restore/commit.
- The `@` alias validity is established by `tsc` + suite runs, not by my /tmp probe (which cannot resolve it).

## Open Questions for Orchestrator

1. Retire-or-update the two `thread.test.ts` `busy` assertions (same class as the retired gallery block) — follow-up task, out of this scope.
2. Founder language decision stands (Turkish refusals now reachable on English gallery/interview/new-bot/chat/builder surfaces) — product decision, correctly escalated, not a code defect.
3. `invalid_turns` dead-entry concern from the F15 review is untouched by this task and still open for the sibling-criteria audit.

## Public Interface Exposed

No exported signature changed — verified by reading all three source files: `readRefusalMessage(payload)` re-exported identically via `bounds.ts`; `readHttpError(response)` and `readApiError(body)` keep parameters and returns. Wire-behavior delta exactly as the build report states: known code-only bodies → Turkish table on all four surfaces; prose bodies byte-identical; unknown code-shaped → Turkish generic (was: raw token); `message`-bearing bodies byte-identical, always.

## Known Limitations

- Not verified in the running app — no human completed a refusal flow in the browser (same honest limitation as F15 and its reviewer); evidence is gate-, suite-, and probe-level.
- Dashboard pair verified green once here, not twice; no flake observed.
- Bounds re-export proven via toolchain + suite, not via isolated node import (alias limitation, stated above).
