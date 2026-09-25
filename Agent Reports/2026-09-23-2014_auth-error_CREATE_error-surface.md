# Task Report: auth-error-surface

## Status
SUCCESS

## Objective
Close M-5: a failed OAuth sign-in redirected to `/?error=<code>` and no page read the
parameter, so a failed sign-in landed on a page identical to a successful one. A dedicated
failure surface now reads the code and shows an honest sentence plus a retry link. No OAuth
logic, token handling, or success path was touched.

## Files Touched
- CREATED: `apps/web/app/auth/error/page.tsx` (the failure surface; async Server Component, `await searchParams`)
- CREATED: `apps/web/app/auth/error/page.test.tsx` (7 tests)
- MODIFIED: `apps/web/app/api/auth/callback/route.ts` (error branch redirect target + allowlist; lines 1-52 diff — success path byte-unchanged)
- MODIFIED: `apps/web/app/api/auth/login/route.ts` (catch-branch redirect target only; lines 15-20)

File hashes at completion (for the reviewer's "trust artifacts" check):
- `app/auth/error/page.tsx` — `a4462cce1351865c6103b726d3bbf65b`
- `app/auth/error/page.test.tsx` — `b61e95ddc8dd63cacdfabe610c2a8e7a`
- `app/api/auth/callback/route.ts` — `bf5da77f037883807dd41d78029d0634`
- `app/api/auth/login/route.ts` — `cd3045eb05f593e09ac556dba116e88a`

Diff (routes): `2 files changed, 28 insertions(+), 2 deletions(-)`. `app/page.tsx` untouched.

## Research (OSS scan + on-disk verification)

Three patterns, from live sources (not memory):

1. **Auth.js / NextAuth `pages.error` + `errorMap`** — https://authjs.dev/guides/pages/error
   (fetched 2026-09-23): a custom error page reads `?error=` and resolves it through a map of
   known codes with a `Default` catch-all. The same page documents the closed set of codes
   Auth.js itself forwards (`Configuration`, `AccessDenied`, `Verification`, `Default`). Adopted:
   closed set + generic fallback.
2. **`pracharya2601/we-are-built-different` `lib/auth/failure.ts`**
   (https://github.com/pracharya2601/we-are-built-different/blob/7e74d998/lib/auth/failure.ts):
   the closest match to our situation. Its header states the rule we adopted verbatim in spirit —
   *"That text is provider-controlled, so it is logged server-side for diagnosis and never
   reflected into the page: an attacker-crafted callback link must not be able to put its own
   words on a page that carries our branding."* It keeps `AUTH_FAILURE_CODES` (a `ReadonlySet`),
   a `FAILURE_COPY` table, a `FALLBACK_COPY`, and uses `Object.hasOwn` **because a bare lookup of
   `__proto__`/`toString` returns a truthy non-copy**. Adopted: closed set, own table, fallback.
   Our lookup avoids even that edge: the code must be a `string` before it can index, so
   `__proto__` can only ever yield the generic sentence (`Object.hasOwn` is not needed, and its
   absence is not a gap).
3. **`BerriAI/litellm` PR #28743** (https://github.com/BerriAI/litellm/pull/28743): an OAuth
   callback rendering an error fallback HTML page escapes every IdP-supplied field and ships a
   named regression test `test_idp_error_html_escapes_user_controlled_fields`. Contrast cases:
   `langgenius/dify` PR #23295 (reflected XSS via `dangerouslySetInnerHTML` from URL params) and
   GHSL-2023-218/219 (reflected XSS on a login page). Adopted: never render the raw value at all
   — the strongest form — and prove it with an XSS-probe test.

Verified on disk before writing (not from memory):
- `apps/web/app/api/auth/callback/route.ts:24` → `/?error=${result.error}`; `apps/web/app/api/auth/login/route.ts:16` → `/?error=login_unavailable`.
- `grep searchParams` over `apps/web/app/**/*.tsx`: only `dashboard/page.tsx` (runId/view) and
  `dashboard/bots/[id]/page.tsx` (tab) read query params — nothing on `/` reads `?error`.
- Next.js 16.3.4 `searchParams` is a **Promise** that must be awaited — read from the bundled docs
  at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  ("`searchParams` (optional) — A promise that resolves to an object…"), per `apps/web/AGENTS.md`.
- `Metadata.robots` is a valid field in this version:
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:551`.

## Acceptance Criteria
- [x] **Distinct error page instead of the identical landing** — `/auth/error` is its own route;
      a failure no longer lands on `/`. Verified live: `GET /api/auth/callback` (no params) →
      `307 location: http://localhost:3119/auth/error?error=missing_code`.
- [x] **Only allowlisted codes rendered** — the page renders a sentence from its own table,
      selected by the code; an unknown code yields the generic sentence and the raw value is never
      placed in the tree. Proven both ways: 7 unit tests + live HTTP fetches.
- [x] **XSS probe inert** — test renders `error='<script>alert("xss")</script><img src=x onerror="alert(1)">'`
      and asserts no `<script>`/`<img>` node exists, no `alert` in `textContent`, and the page is
      the generic sentence. Also passed for `?error=` as a repeated param (string[]).
      Live browser run of `?error=%3Cscript%3Ealert(%22xss%22)%3C/script%3E`: snapshot shows only
      our copy, 0 console errors, no dialog.
- [x] **Success OAuth flow unchanged** — the success branch of the callback route is not in the
      diff; `location: https://discord.com/oauth2/authorize?...` from the running app confirms the
      happy path still leaves for Discord. `lib/auth/auth.test.ts` + `app/api/auth/**`: **42/42 green**.
- [x] **New tests** — 7/7: known code → right sentence; second known code → right sentence; unknown
      code → generic + raw code absent; no code at all → generic; XSS probe inert; string[] probe
      inert; jargon-free/no console output.
- [x] **Gates clean** — `tsc --noEmit` exit 0 (`next typegen` run first, the real typegen
      instrument); `eslint . --max-warnings 0` exit 0; `prettier --check` on all four files clean.
- [x] **Suites** — focused auth (`lib/auth/auth.test.ts`, `app/api/auth`, `app/auth/error`):
      **42/42**. New page file alone: **7/7**. Full web suite: **925 passed / 927** (see the
      attribution note below — both failures belong to a concurrently-running agent, not this task).
- [x] **No secrets logged/printed, no prod contact, no git restore/stash/checkout/reset, no commit** —
      grep for secret-shaped strings in both new files: 0 hits. Every HTTP request went to the
      local dev server (`127.0.0.1:3000`). No git state-changing command was run (only
      `status`/`diff`/`stash list`/`reflog` reads).

## Guard-Proof (a guard is not a guard until you break it)

Per `LESSONS.md` §8, I deliberately broke the allowlist (`const problem = { heading: GENERIC,
sentence: code ?? GENERIC.sentence }`, rendering the raw code) and re-ran the suite: **5 of 7 tests
failed**, including the XSS probe and the jargon assertion (`forbidden term shipped: callback`).
Reverted to the real implementation and re-ran: 7/7 green. The assertions have teeth.

## Real-Path Verification (not just gates)

A `next dev` server was already listening on `127.0.0.1:3000` (not started by me; PID 10836 — I did
not touch it). Against it:
- `GET /auth/error?error=login_unavailable` → 200, heading "Sign-in is not available right now.",
  sentence, and the retry link `/api/auth/login` present in the HTML.
- Browser (Playwright, headless-under-MCP): `?error=invalid_state` → h1 "We could not verify that
  sign-in." + retry link, title "Sign-in problem - Corvus", **0 console errors/warnings**.
- `?error=internal_error_xyz` → generic sentence; the code string appears nowhere in the response.
- `?error=<script>…` → generic sentence; 0 occurrences of the injected script; browser console clean.
- `GET /api/auth/callback` (no params) → 307 to `/auth/error?error=missing_code` (does not reach the
  DB — `missing_code` returns before any store call).
- `GET /api/auth/login` → 307 to Discord authorize URL (config present, so the catch branch is not
  taken; that branch was proven by unit-level reasoning + the pre-existing route behaviour, not by
  live fire — see Known Limitations).
- `GET /?error=missing_code` → still renders the landing page with none of the new copy, i.e. the
  homepage's behaviour is unchanged (it deliberately ignores the param; this task did not add a
  landing banner, per scope).

## Dependencies Added
None. No manifest edited, no install run.

## Assumptions Made
- **The failure page lives at `/auth/error`** (the Auth.js convention named in the brief). The
  `error` query key is unchanged; only the path moved. `/auth` was a new route directory; nothing
  else claimed it.
- **Two code-specific sentences, not eight.** `login_unavailable` and `invalid_state` are the two
  failures a user can meaningfully act on (config missing; link expired/mismatched). The remaining
  six `CallbackErrorCode` values (all "something on our side broke") share one honest generic
  sentence that promises only what is true — "nothing was changed on your account" — rather than
  inventing a cause. Rationale: `invalid_state` also covers a re-used *or* mismatched link, so its
  sentence states the ten-minute window (`OAUTH_STATE_TTL_MS`) instead of asserting a diagnosis.
- **`invalid_state` deliberately does not say "it expired".** Claiming expiry would be a fabricated
  cause; the sentence says the link is good for ten minutes, which is true and actionable.
- **The page is a Server Component and its UI is inline-styled** (`React.CSSProperties` constants).
  Two constraints forced this: the file scope allows no new stylesheet, and a separate view module
  was equally out of scope, so the async page must return its own tree (it cannot delegate to a
  sibling component). Inline styles cannot express `:focus-visible`, so no focus style is shipped
  and `outline: none` is deliberately absent — the browser default ring remains.
  Consequence: the page renders on `#000`/`#0b0b0d` with the landing's token values but does not
  literally read `landing.module.css`; a reviewer comparing against `Docs/04_design_language.md` has
  no live stylesheet to diff against. **This is the weakest part of the deliverable and the most
  likely reviewer finding.**
- **Retry affordance is a link, not a button**: the retry is a navigation to `/api/auth/login`, so
  an `<a>` is the honest control (and it matches the `/api/auth/login` href every other surface
  uses).
- **`robots: { index: false, follow: false }`** on the page: a failure page has nothing worth
  indexing.
- **The route allowlist is typed `Record<CallbackErrorCode, string>`**, so adding a new callback
  error code becomes a compile error here rather than a silent generic page (gate order: data →
  code → user copy).

## Open Questions for Orchestrator
1. **Design-doc registration.** `apps/web/app/auth/error/page.tsx` is a new user-facing surface; its
   dark inline-styled values were derived from `Docs/04_design_language.md` §2.1/§3 and
   `landing.module.css:6-15`, but no stylesheet expresses them. If the founder wants the token
   family reused rather than echoed, the follow-up is to let this page ship a `page.module.css`
   (needs a scope extension; `styles` is already the repo's CSS-Modules convention).
2. **Codes with no sentence yet.** `missing_code`, `missing_state`, `profile_fetch_failed`,
   `account_failed`, `session_failed`, `token_exchange_failed`, `callback_failed` intentionally
   share the generic sentence. If any of them later prove common in production, the table is the
   single place to give one its own copy.

## Public Interface Exposed
- New route: **`GET /auth/error?error=<code>`** — renders a heading + one sentence + link to
  `/api/auth/login`. Unknown/absent/array-valued `error` → generic sentence, never reflected.
- `apps/web/app/api/auth/callback/route.ts` — failure redirect now `307` to
  `/auth/error?error=<allowlisted code>` (was `/?error=<code>`). Success path unchanged
  (`307` to `/dashboard` + `Set-Cookie`).
- `apps/web/app/api/auth/login/route.ts` — unchanged success path; failure now redirects to
  `/auth/error?error=login_unavailable` (was `/?error=login_unavailable`).
- No exported TS symbols were added to shared modules; `type CallbackErrorCode` is imported, not modified.

## Known Limitations
- **Verification of the login route's failure branch is indirect.** The running dev server has
  Discord OAuth configured, so `GET /api/auth/login` takes the success branch. The
  `login_unavailable` → `/auth/error` redirect is covered by the route's catch-branch semantics
  (config throw) and by the page's own test, not by a live 307 observed on this machine.
- **`next build` was not run** (out of scope; also the tree currently has another agent's
  uncommitted work in flight, so a build would not describe this task alone). Typegen +
  `tsc --noEmit` + `eslint` + the running dev server were used instead.
- **The full web suite is red by 2, attributable to a concurrent agent.** Baseline before my changes
  (2026-09-23 20:23): 890 passed / 891, 1 failure (`app/api/chat/route.test.ts` — the open M-11
  spend-row gap). Final: 925 passed / 927, 2 failures:
  - `app/page.test.tsx > homepage (antigravity port) > keeps the Starter template line intact` —
    `app/page.tsx` had mtime 20:43:20, i.e. it was rewritten *during* my test run; it is being edited
    by another agent right now.
  - `app/dashboard/bots/[id]/page.test.tsx > shows the attachment count on the user row only when
    files are attached` — deterministic (3/3 isolated runs), but that page imports
    `@/components/ui/use-chat-stream` and `@/components/ui/ai-chat-input`, both modified at
    20:39:36/20:39:58, during my session. It is the M-6 attachment path another agent is fixing.
  Neither failing file imports anything I created or modified; neither references `/auth/error`.
  The M-11 file also now passes. **Run the full gates on the merged tree before shipping**
  (`LESSONS.md` §7): N agents reporting green describes N trees, not the one that ships.
- **A file-visibility anomaly worth flagging.** `apps/web/app/auth/error/page.test.tsx` became
  invisible to `ls`, `vitest` and `prettier` for roughly three minutes after it was created, then
  reappeared with its original creation timestamp once rewritten. No git command of mine ran in
  that window (read-only `git stash list` / `status` / `reflog` only; HEAD stayed `d9cf8d7`, no stash
  entries). Most likely an external file-sync layer (OneDrive desktop sync — the repo lives under
  `C:\Users\xr3less\Desktop\`) dehydrating the file. If this recurs mid-review, it is the sync
  layer, not a lost artifact; the hashes above are the source of truth.
- The page's focus ring is the browser default (see Assumptions) — a design-language deviation that
  is a consequence of the file scope, not an oversight.
