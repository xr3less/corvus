# Task Report: reviewer-refusal-unify

## Status
PARTIAL

## Verdict
PASS (with stated HEAD-drift caveat — not a clean SUCCESS)

## Files Touched
- CREATED: Agent Reports/2026-09-23-0402_reviewer_REVIEW_refusal-unify.md
- MODIFIED: (none, permanent)
- DELETED: (none)
- TRANSIENT (restored byte-identically, backup outside repo, deleted afterwards): apps/web/lib/http/refusal.ts (one-word guard mutation `Fork failed` -> `Fork broke`, then restored; hash-verified before/after)

## Dependencies Added
- None. No manifest, lockfile, version, or config was touched, and no install was run.

## Assumptions Made
- Timestamp 2026-09-23-0402 is the real system clock value (`date +%Y-%m-%d-%H%M` returned 2026-09-23-0402; `date` returned Wed, Sep 23, 2026 03:57 AM at session start).
- Toolchain detected from disk, not assumed: `package-lock.json` exists; `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` do not. Package manager is npm. Real scripts from `apps/web/package.json`: `typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check --ignore-unknown .`, `test: vitest run`. Root scripts delegate via `npm run <cmd> --workspaces --if-present`.
- The author's PARTIAL scope note is accepted as fact and was independently confirmed: HEAD vs working-tree drift exists from parallel uncommitted waves. This review therefore judges the refusal hunks in isolation (import + local-delete + option arg), not whole-file HEAD diffs.
- No live-path / running-app evidence is in scope for this refactor review (hermetic suites by design); the owed live-path evidence belongs to the earlier waves.

## Open Questions for Orchestrator
1. HEAD-drift caveat (carried forward, not resolved): `apps/web/app/dashboard/bots/[id]/page.tsx` carries ~183 changed lines vs HEAD from parallel uncommitted waves (draft-read rework, stitchBrief, verdict-adjacent copy). The refusal hunk inside it (import line 27 + comment lines 104-111 + call site lines 892-893) verifies in isolation, but the file cannot be reviewed as a pure import-swap against HEAD. Same structural note, smaller scale, for interview/gallery (17/18-line hunks are pure refusal swaps; the behavior-vs-HEAD delta described below comes from the pre-existing working-tree copies, not from this task's swap).
2. Behavior-vs-HEAD note: HEAD's interview/gallery locals were error-only twins; the working-tree copies this task unified were already message-preferred/error-fallback (parallel-wave work). So vs the working tree this task preserves behavior; vs HEAD, interview/gallery gain message-preference. This is the parallel wave's behavior change riding along in the same working tree, not a logic change introduced by the unification swap itself. Orchestrator should attribute it accordingly at integration.
3. Wider class still open (deliberately excluded, confirmed correct to exclude here): `lib/verdict/bounds.ts` readRefusalMessage now duplicates the core of `lib/http/refusal.ts` readRefusalMessage across a forbidden-touch boundary. A follow-up wave could re-export one from the other once the freeze lifts.

## Public Interface Exposed
No new interface from this review. Verified the author's claimed interface exists on disk in `apps/web/lib/http/refusal.ts`:
- `readRefusalMessage(payload: unknown, options?: { allowErrorFallback?: boolean }): string | null`
- `readErrorMessage(res: Response, fallback: string): Promise<string>`
- `forkErrorMessage(payload: unknown, status: number): string`
- Call sites verified: `bots/[id]/page.tsx:892` uses `readRefusalMessage(payload, { allowErrorFallback: false }) ?? 'Could not start the build — try again.'`; `interview/page.tsx:135,181,268` use `readErrorMessage(res, \`error ${res.status}\`)` with unchanged per-site fallbacks; `gallery/page.tsx:196` uses `forkErrorMessage(payload, response.status)`.

## Known Limitations
- Status is PARTIAL, not SUCCESS, for exactly the reason the author stated: the bots/[id] hunk cannot be reviewed as a pure import-swap against HEAD because the file carries parallel-wave uncommitted work. The refusal hunks verify in isolation; the whole-file HEAD diff does not belong to this task.
- No live-path evidence (running app flow, named human). All gates here are hermetic suites + static gates.
- I changed no product behavior; my only product-file write was the transient guard mutation, restored byte-identically (hash-verified, backup outside repo, deleted).
- Current-facts research was not needed: this review touches no versions, model names, APIs, or pricing. No web search performed; nothing guessed.

## Verification evidence (exact commands and results)
All commands run from `C:\Users\xr3less\Desktop\corvus` (Bash/POSIX syntax). Toolchain: npm (package-lock.json present; pnpm/yarn/bun lockfiles absent — verified via ls).

1. Artifacts exist on disk (trust artifacts, not summaries):
   - `ls` confirmed all four files exist: `apps/web/lib/http/refusal.ts`, `apps/web/app/dashboard/bots/[id]/page.tsx`, `apps/web/app/interview/page.tsx`, `apps/web/app/gallery/page.tsx`.

2. Shared module + import swaps verified on disk:
   - `apps/web/lib/http/refusal.ts` (54 lines) exports all three functions with the specified signatures; `allowErrorFallback` gate at lines 33-34; interview twin at lines 41-48; gallery twin byte-locked fallback at line 53: `` `Fork failed (${status}). Try again.` ``.
   - `bots/[id]/page.tsx:27` — `import { readRefusalMessage } from '@/lib/http/refusal';`; comment lines 104-111; call site lines 892-893 with `{ allowErrorFallback: false }`.
   - `interview/page.tsx:14` — `import { readErrorMessage } from '@/lib/http/refusal';`; three call sites (lines 135, 181, 268) unchanged with `error ${res.status}` fallbacks.
   - `gallery/page.tsx:10` — `import { forkErrorMessage } from '@/lib/http/refusal';`; comment lines 70-77; call site line 196 unchanged.

3. Local copies gone (grep):
   - `grep "function readRefusalMessage|function readErrorMessage|function forkErrorMessage|const readRefusalMessage|..." apps/web` returns definitions ONLY in `apps/web/lib/http/refusal.ts` (3x), `apps/web/lib/verdict/bounds.ts:66` (verdict lane, forbidden, out of scope), `apps/web/components/ui/builder-progress.tsx:56` (transport Error-object reader, different class, out of scope). Zero local definitions remain on the three pages. `grep` for `readRefusalMessage|...` on each page returns only the import + comment + call-site lines listed above.

4. Behavior contract:
   - bots/[id] message-only difference preserved via explicit option `{ allowErrorFallback: false }` at call site (line 892) + explanatory comment (lines 104-111). Shared core returns `message` first, returns null before the error fallback when the option is false (lines 32-33), else error fallback (line 34), else null (line 35).
   - Interview async shape preserved: shared `readErrorMessage(res, fallback)` tries `res.json()`, returns shared-reader result or caller fallback, catches non-JSON to fallback (lines 41-48). Caller fallbacks byte-identical (`error ${status}` x3, plus kept suffixes at lines 135/181/268).
   - Gallery fallback byte-identical: line 53 `` `Fork failed (${status}). Try again.` `` matches the asserted string in `gallery/page.test.tsx:422`.
   - No test file imports the helpers (grep across the three suites returns zero hits) — the "mirror-to-import" criterion is vacuous as the author claimed; suites assert through rendered UI.
   - Verdict trio carries no change FROM THIS TASK: `lib/http/refusal.ts` does not import from `@/lib/verdict/bounds`; `new/page.tsx` imports `readRefusalMessage` from `@/lib/verdict/bounds` (line 28, verdict auto-start wave); its 313-line HEAD diff is verdict auto-start work, not refusal; `bounds.ts` and `api/builder/verdict/route.ts` are untracked parallel-wave files; `git diff HEAD -- new/page.tsx` refusal grep shows only the verdict-lane import/usage. `package-lock.json` 18-line diff is an `apps/testbot` entry from another wave, not this task. `lib/chat/thread.ts` message-preference drift is a parallel-wave change to the chat lane (`readHttpError`), not this task.

5. Static gates (real commands):
   - `cd apps/web && npx tsc --noEmit` — exit 0.
   - `npx eslint "apps/web/lib/http/refusal.ts" "apps/web/app/dashboard/bots/[id]/page.tsx" "apps/web/app/interview/page.tsx" "apps/web/app/gallery/page.tsx" --max-warnings 0` (repo root) — exit 0, 0 warnings.
   - `npx prettier --check` on the same four files — clean ("All matched files use Prettier code style!").

6. Test gates (real commands):
   - Focused: `npm run test --workspace @corvus/web -- "app/gallery/page.test.tsx" "app/interview/page.test.tsx" "app/dashboard/bots/[id]/page.test.tsx"` — 3 files, 87 passed (20 gallery + 13 interview + 54 bots/[id]), 0 failed. Matches the 87/87 claim.
   - Full web suite: `npm run test --workspace @corvus/web` — 58 files passed, 764 passed | 69 skipped (833 total), 0 failed. Duration ~19s. (Note: jsdom `getContext()` canvas notice is environmental, not a failure.)

7. Guard broken and watched with MY OWN mutation (not the author's):
   - Hashed before: `sha256sum apps/web/lib/http/refusal.ts` = `6ad588acd74e2443633ecc2dc2a5311f12661a5cb9f127a73ec5ed62c2a90313`; copied to `/tmp/reviewer-refusal-guard-backup.ts` (outside repo, never git restore/stash/checkout/reset).
   - Mutation: `sed -i 's/Fork failed (/Fork broke (/' apps/web/lib/http/refusal.ts` (one-word copy change, same class as author's but my own edit).
   - Failing run: `npm run test --workspace @corvus/web -- "app/gallery/page.test.tsx"` — 1 failed | 19 passed (20). Failing test: `gallery page > falls back to the status line when a fork failure carries neither field`, `AssertionError: expected 'Fork broke (403). Try again.' to contain 'Fork failed (403). Try again.'` at `app/gallery/page.test.tsx:422:31`.
   - Restore: `cp /tmp/reviewer-refusal-guard-backup.ts apps/web/lib/http/refusal.ts`; both hashes `6ad588...` identical; `rm` backup; `git status --porcelain -- apps/web/lib/http/refusal.ts` still `??` (untracked new file from the task, as before — restore did not stage/commit anything); `grep Fork failed` confirms line 53 restored.
   - Re-run focused suites after restore: 3 files, 87 passed, 0 failed.

8. Security/scope:
   - Secret scan over the four files for `secret|api-key|token|password|PRIVATE_KEY|BEGIN` (case-insensitive) returns only the code comment "no secrets" in `refusal.ts:10`. No secret/token/key/connection-string in the refusal hunks; no prod/box/SSH/GHCR/Contabo/.env contact.
   - No manifest/lockfile/.env edits, no installs, no commits, no git restore commands run by this reviewer. Verdict trio and CSS read-only (grep/diff only). `git status --porcelain` on `package.json`, `apps/web/package.json`, `package-lock.json` shows only the pre-existing parallel-wave `package-lock.json` modification.

## Class enumeration (remaining local refusal-reader copies, file:line, in/out of scope)
1. `apps/web/lib/verdict/bounds.ts:66` — `export function readRefusalMessage(payload: unknown): string | null` (message-preferred, error-fallback, no option). OUT OF SCOPE (verdict lane; brief forbids touching the verdict trio; consumer `apps/web/app/dashboard/new/page.tsx:28` imports from there). Confirmed it now duplicates the core of `lib/http/refusal.ts` — legitimate follow-up once the freeze lifts, as the author noted. Not a miss.
2. `apps/web/app/dashboard/new/page.tsx:28,151,229 (approx)` — verdict-lane consumer importing from `bounds.ts`. OUT OF SCOPE (forbidden trio; verdict auto-start wave owns this file's HEAD diff).
3. `apps/web/components/ui/builder-progress.tsx:56` — `function readErrorMessage(err: unknown): string` (Error-object transport reader, `err.message` or `'Could not reach the builder'`), plus `readApiError` at line 50. OUT OF SCOPE — different class (transport Error object, not refusal payload `{message, error}`); author's exclusion confirmed correct.
4. `apps/web/lib/chat/thread.ts:135` — `export async function readHttpError(response: Response): Promise<string>` (message-preferred/error-fallback + 401 + generic `'The reply stopped unexpectedly. Try again.'`; consumer `use-chat-stream.ts:12,84`). OUT OF SCOPE — chat/SSE lane with its own 401/generic contract; unifying it here would change locked chat copy. Note: its HEAD diff shows a parallel wave just added message-preference to this lane too — same direction, separate lane, needs its own contract decision, not a silent merge here.
5. `apps/web/lib/chat/thread.ts:52,141-142` — inline `record.message` fallbacks inside `toChatStreamEvent`/`readHttpError` body parsing (stream-frame field reads, not refusal-payload readers). OUT OF SCOPE — SSE frame parsing, not the refusal class.
6. `apps/web/lib/bots.ts:139,148` — `MintRefusalCode` type + gate (`trial_bot_limit`), and `trial_expired`-style code strings across API tests. OUT OF SCOPE — server-side gate/type and test fixtures, not client reader copies.
