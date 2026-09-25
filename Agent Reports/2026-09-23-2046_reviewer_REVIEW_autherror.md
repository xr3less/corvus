# Task Report: reviewer-autherror-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2046_reviewer_REVIEW_autherror.md
- MODIFIED: (none — read-only review)
- DELETED: (none)

## Dependencies Added
None. No manifest edited, no install run.

## Assumptions Made
- Test commands were run from `apps/web` (the builder's report named this as the working directory; running from repo root fails with `document is not defined` because the jsdom environment comes from `apps/web/vitest.config.mjs` — an environment quirk, not a task defect).
- The `package-lock.json` modification in the working tree (`apps/testbot` / `discord.js` entry) belongs to a concurrently-running wave, not this task: it has no relationship to auth code and this task's file scope contains no manifest.
- The `apps/web/app/page.tsx` modifications in the working tree (nav labels, copy tweaks) belong to a concurrent wave; the diff confirms they do not touch auth or `?error` handling.
- Guard adequacy was assessed by code read + the builder's documented break experiment, not by re-mutating the tree (per scope: no prod re-mutation). The break experiment's 5/7-fail claim is structurally credible against the test assertions (see Verification row 5).

## Open Questions for Orchestrator
1. **OQ1 (page.module.css follow-up — NOT a FAIL):** Recommend accepting the builder's inline-style approach as a scope consequence and, if the founder wants token-family reuse, opening a small follow-up task granting stylesheet scope so `app/auth/error/page.tsx` can ship a `page.module.css`. The missing `:focus-visible` style is a scoping artifact; `outline: none` is correctly absent so the browser default ring remains.
2. **Full-suite sign-off:** Per LESSONS.md §7, run the full gates on the merged tree once concurrent waves land. This review verifies the auth-error slice only; the two known full-suite failures are attributed to other agents (evidence below), but the merged tree still needs its own green run before shipping.

## Public Interface Exposed
No change from the builder's report (verified by read):
- New route `GET /auth/error?error=<code>` — heading + sentence + retry link to `/api/auth/login`; unknown/absent/array `error` → generic sentence, never reflected.
- `app/api/auth/callback/route.ts` — failure redirect now `307` to `/auth/error?error=<allowlisted code>`; success branch unchanged.
- `app/api/auth/login/route.ts` — failure redirect now `307` to `/auth/error?error=login_unavailable`; success branch unchanged.
- No exported TS symbols added to shared modules.

## Known Limitations
- This review did not start a dev server or run a live browser; real-path HTTP/browser evidence is taken from the builder's report (detailed, endpoint-by-endpoint) and corroborated by code read + unit runs. The unit tests exercise the real `await searchParams` read (Promise shape, matching the bundled Next docs).
- The login route's `login_unavailable` catch branch was not live-fired (requires missing Discord config on a running server); covered by route code read + page unit test.
- `next build` was not run (concurrent uncommitted work in the tree would not describe this task alone); typegen-backed `tsc --noEmit` + eslint + prettier + focused tests were run instead.
- Full web suite was not re-run (moving tree with concurrent waves); attribution of the two known failures was verified by zero-reference checks, not by re-running them.

## Verification table

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | /auth/error route exists, distinct from / | PASS | `apps/web/app/auth/error/page.tsx:128` exports default async `AuthErrorPage`; untracked dir `apps/web/app/auth/` present on disk. `git diff` shows `app/page.tsx` changes are unrelated copy/nav tweaks (concurrent wave), no `?error` handling added or removed there. |
| 2 | Failure redirects target /auth/error?error in both routes | PASS | `apps/web/app/api/auth/callback/route.ts:45-47` → `` `/auth/error?error=${ERROR_CODES[result.error]}` ``; `apps/web/app/api/auth/login/route.ts:19` → `/auth/error?error=login_unavailable`. |
| 3 | Success paths byte-unchanged (diff shows only error branches) | PASS | `git diff HEAD` on both routes: callback diff = added `CallbackErrorCode` import + `ERROR_CODES` const + error-branch redirect only; success branch (`/dashboard` + `Set-Cookie`, lines 49-51) untouched. Login diff = catch-branch redirect only; try-branch (config/mint/authorize) untouched. |
| 4 | Only allowlisted codes rendered; unknown/absent/array → generic, raw never in tree | PASS | Page `page.tsx:131-134`: `code = typeof raw === 'string' ? raw : null` (array → null → generic); lookup `SIGN_IN_PROBLEMS[code] ?? GENERIC_PROBLEM`; JSX renders only `problem.heading`/`problem.sentence`, never `raw`/`code`. Route allowlist `callback/route.ts:22-31` is typed `Record<CallbackErrorCode, string>` covering all 8 members of `CallbackErrorCode` (`lib/auth/session.ts:582-590`), so a future code compiles-error rather than silently widening. |
| 5 | No dangerouslySetInnerHTML / raw reflection | PASS | Grep for `dangerouslySetInnerHTML\|__html\|innerHTML` over `page.tsx`: zero matches. Only interpolation points are own-copy strings. |
| 6 | XSS probe inert by MY OWN focused run (7/7) + code read | PASS | `npx vitest run app/auth/error/page.test.tsx` from `apps/web`: **7 passed / 7** (my run, 20:48 UTC). Tests `page.test.tsx:137-162` assert no `<script>` text, no `alert` in textContent, `querySelector('script'/'img')` null, generic heading, for both string and string[] probes. |
| 7 | Focused auth suites green by MY runs (exact numbers) | PASS | `npx vitest run lib/auth/auth.test.ts app/api/auth app/auth/error` from `apps/web`: **3 files, 42 passed / 42** (my run) — matches builder's 42/42 claim exactly. |
| 8 | tsc exit 0 | PASS | `npx tsc --noEmit` from `apps/web`: **exit 0** (my run). |
| 9 | eslint --max-warnings 0 exit 0 | PASS | `npx eslint app/auth/error/page.tsx app/auth/error/page.test.tsx app/api/auth/callback/route.ts app/api/auth/login/route.ts --max-warnings 0`: **exit 0** (my run). |
| 10 | prettier clean on the four files | PASS | `npx prettier --check` on the same four files: "All matched files use Prettier code style!" (my run). |
| 11 | Guard adequacy by code read (break → 5/7 fail incl. XSS), no re-mutation | PASS (structural) | Tests pin: known-code headings/sentences (tests 1-2), generic+raw-absent for unknown (test 3), generic for absent (test 4), XSS inert string + string[] (tests 5-6), jargon-free + console-silent on every test. Rendering raw `code` breaks tests 1, 2, 3, 5 (and the jargon assertion trips on codes containing e.g. `callback`); collapsing the table breaks tests 1-2. Either guard class is caught. No tree mutation performed by reviewer. |
| 12 | Full-suite failures attributed honestly, not blamed on this task | PASS | `page.test.tsx` error-refs are only jsdom/WebGL-noise comments + console-error spy (no `auth/error` import); bots `[id]` page test has zero `auth/error`/`error` matches. Repo-wide grep for `auth/error` hits only the two modified routes (+ comments). `app/page.tsx` diff is nav/copy from a concurrent wave. Builder's attribution stands. |
| 13 | searchParams-await per AGENTS.md caution | PASS (resolved, non-blocking) | Repo-root `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` lines 11-14: `searchParams: Promise<{ [key: string]: string \| string[] \| undefined }>` — matches page prop type `page.tsx:125` and test's `Promise.resolve({ error })` harness (`page.test.tsx:68`). |
| 14 | Inline-style/:focus-visible deviation assessed fairly, not a FAIL | PASS (scope consequence) | `outline: none` correctly absent (`page.tsx:107-109` comment); browser default ring retained. Escalated as OQ1 follow-up, not a failure. |
| 15 | No secrets in new files | PASS | Grep for `sk-\|BEGIN.*PRIVATE\|ghp_\|xox` over both new files: zero matches. |
| 16 | No manifest/lockfile edits by this task; no commit | PASS | Task scope contains no manifest; the working-tree `package-lock.json` delta is an `apps/testbot`/`discord.js` entry from a concurrent wave. Reviewer ran no git state-changing command (only `diff`/`status` reads), no installs, no commits. |
