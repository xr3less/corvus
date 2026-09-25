# Task Report: refusal-unify-0338

## Status
PARTIAL

## Files Touched
- CREATED: apps/web/lib/http/refusal.ts
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.tsx
- MODIFIED: apps/web/app/interview/page.tsx
- MODIFIED: apps/web/app/gallery/page.tsx
- DELETED: (none)

No test file was created, modified, or deleted. No manifest, lockfile, .env, config, CSS, Docs, or CI file was touched. No git restore/stash/checkout/reset was run, no commit, no install. The guard mutation was applied via file edit and restored from an outside-repo backup at %TEMP%/refusal-guard-gallery-backup.tsx (copy, hash-verified, deleted afterwards).

## Dependencies Added
- None. No manifest, lockfile, version, or config was touched, and no install was run.

## Assumptions Made
- The brief's CURRENT STATE section describes uncommitted working-tree content (message-preferred/error-fallback readers on all three pages, incl. the bots/[id] message-only difference) rather than HEAD: HEAD still holds the older error-only twins for interview/gallery and no refusal reader at all on bots/[id]. The working tree matched the brief, so the unification proceeded against the working-tree copies instead of escalating on a stale-HEAD mismatch.
- builder-progress.tsx readErrorMessage(err: unknown) (transport error object, 'Could not reach the builder') is a different class (Error-object transport reader, not a refusal-payload reader) and is deliberately NOT unified here; it keeps its local copy.
- lib/verdict/bounds.ts readRefusalMessage is deliberately NOT re-exported or wrapped: the brief forbids touching it, so lib/http/refusal.ts owns its own identical message-preferred/error-fallback core instead of importing from the verdict lane.
- Bots/[id] message-only difference is preserved via an explicit call-site option (readRefusalMessage(payload, { allowErrorFallback: false })), never by silently merging to the shared error-fallback behavior.
- Interview's async Response shape and caller fallbacks (`error ${status}` per call site, three call sites untouched) are preserved by the shared readErrorMessage(res, fallback) twin. Gallery's `Fork failed (${status}). Try again.` fallback is preserved byte-identical in shared forkErrorMessage.
- Test files needed no mirror-to-import change: none of the three suites import the local helpers (they assert through rendered UI), so there was nothing to re-point.

## Open Questions for Orchestrator
1. Scope finding (escalation, resolved by proceeding narrowly): HEAD vs working tree drift. HEAD has error-only twins on interview/gallery and zero refusal logic on bots/[id]; the message-preferred/error-fallback copies, the bots/[id] message-only block, and the bots/[id] trial-sentence call site all live in UNCOMMITTED working-tree changes from parallel waves (bots/[id] page.test.tsx +458 lines, interview +101, gallery +85 vs HEAD). I unified the working-tree copies and touched nothing else; the diff vs HEAD therefore also shows those waves' uncommitted work. Recommend the reviewer verify the refusal hunks in isolation, not the whole-file diff.
2. Live-path evidence remains owed from the earlier waves (running app flow, named human). All tests here are hermetic by design; nothing in this refactor substitutes for it.
3. Wider class still open and deliberately excluded: lib/verdict/bounds.ts readRefusalMessage (verdict route + new-page pair, reviewed PASS) now duplicates the core of lib/http/refusal.ts readRefusalMessage by one forbidden-touch boundary. A follow-up wave could re-export one from the other once the freeze lifts.

## Public Interface Exposed
New pure module apps/web/lib/http/refusal.ts (no React, no fetch, no I/O, no secrets):
- readRefusalMessage(payload: unknown, options?: { allowErrorFallback?: boolean }): string | null — message-preferred, error-fallback; { allowErrorFallback: false } preserves the bots/[id] message-only difference.
- readErrorMessage(res: Response, fallback: string): Promise<string> — async Response twin; returns shared reader result or the caller's fallback (incl. non-JSON body).
- forkErrorMessage(payload: unknown, status: number): string — payload+status twin; falls back to `Fork failed (${status}). Try again.` byte-identical.

Call-site changes (import swap + local delete + one option arg, no copy/logic change):
- bots/[id]/page.tsx: imports readRefusalMessage from @/lib/http/refusal; local 6-line message-only copy deleted; call site is readRefusalMessage(payload, { allowErrorFallback: false }) ?? 'Could not start the build — try again.'
- interview/page.tsx: imports readErrorMessage from @/lib/http/refusal; local 13-line async copy deleted; three call sites unchanged.
- gallery/page.tsx: imports forkErrorMessage from @/lib/http/refusal; local 8-line copy deleted; call site unchanged.

## Known Limitations
- Status is PARTIAL, not SUCCESS: the brief's acceptance criterion "each page imports and deletes its local copy" holds for the working-tree copies, but HEAD drift (see Open Question 1) means the bots/[id] hunk cannot be reviewed as a pure import-swap against HEAD — the file carries 183 changed lines from parallel uncommitted waves, of which mine are the import + comment + one option arg. Interview/gallery hunks are pure (17/18 lines, import + comment only).
- No test file needed a change, so the "mirror-to-import only" criterion was vacuous — verified by grep (no suite imports the helpers).
- Full web suite was not re-run; focused suites (20 gallery + 13 interview + 54 bots/[id] = 87/87) plus workspace typecheck, ESLint zero-warnings, and Prettier clean are the gates exercised. A full-suite run belongs to the review gate.
- No live-path evidence (hermetic suites only; see Open Question 2).

## Verification (evidence, not self-report)
- `npx tsc --noEmit` from apps/web — exit 0.
- `npx eslint --max-warnings 0` on all 4 touched files (from repo root) — exit 0, 0 warnings.
- `npx prettier --check` on all 4 touched files — clean.
- `npm run test --workspace @corvus/web -- app/gallery/page.test.tsx app/interview/page.test.tsx "app/dashboard/bots/[id]/page.test.tsx"` — 3 files, 87 passed (20 gallery + 13 interview + 54 bots/[id]), 0 failed.
- Guard validation (LESSONS section 8): gallery reverted to an inline copy with a one-word change (`Fork failed` -> `Fork broke`) fails exactly 1/20: `falls back to the status line when a fork failure carries neither field` (expected 'Fork broke (403). Try again.' to contain 'Fork failed (403). Try again.'). Restored byte-identically (hash 83ECFAFE... re-verified), suite re-run green 87/87.
- No secret/token/key/connection-string in the diff (refusal lane owns no keys). No prod/box/SSH/GHCR/Contabo/.env contact. Forbidden files untouched: git diff on apps/web/lib/verdict/bounds.ts, apps/web/app/dashboard/new/page.tsx, apps/web/app/api/builder/verdict/route.ts shows only the parallel waves' pre-existing uncommitted changes — none from this task (verified: my grep of the bots diff for refusal hunks shows only my import + comment + option arg).
