# Task Report: F9-proxy-gate

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/proxy.ts
- CREATED: apps/web/proxy.test.ts
- MODIFIED: none (no pre-existing proxy/middleware file existed — see "First check" below)

Temporary probe files (`apps/web/scratch-probe*.test.ts`) were created during investigation and
deleted; no trace remains in the tree.

## Dependencies Added
None. No manifest was edited and no install command was run.

## First Check (required by the task brief)
Searched for an existing proxy/middleware file before creating anything:

- `apps/web/proxy.ts` — not found
- `apps/web/middleware.ts` — not found
- `apps/web/src/proxy.ts` / `apps/web/src/middleware.ts` — not found (`apps/web` has no `src/`
  directory; `app/` sits at the project root)
- repo-wide `**/middleware.{ts,js}` and `**/proxy.{ts,js}` — only matches inside `node_modules/`

Conclusion: nothing to MODIFY. This is a genuine CREATE.

## What Was Built

`apps/web/proxy.ts` — an optimistic, cookie-presence-only gate in front of `/dashboard*`:

- No session cookie → `307` redirect to `/api/auth/login` (the existing Discord login route).
- Cookie present → `NextResponse.next()`, byte-identical to a no-proxy pass-through (status 200,
  `x-middleware-next: 1`, no `Location`, no `Set-Cookie`).
- `config.matcher` is two literal strings: `['/dashboard', '/dashboard/:path*']`.

Three constraints were honoured deliberately and are documented in the file's header comment:

1. **No database access.** The gate never reads a cookie value — only `cookies.has()`. It does not
   import `lib/auth/session.ts`, because that module imports `pg` and `node:crypto` and would be
   pulled into the proxy bundle. The cookie name is repeated as a literal and **pinned by test** to
   the exported `SESSION_COOKIE` constant, so a rename on either side fails the suite rather than
   silently opening the gate.
2. **Public routes untouched.** `/`, `/gallery`, `/demo`, `/pick`, `/interview`, `/privacy`,
   `/terms`, `/auth/error` and all `/api/*` are absent from the matcher (verified live and in tests).
3. **No redirect loop.** `/api/auth/login` is not under `/dashboard`, so the gate cannot re-trigger
   on its own target.

The redirect base is `request.url` (the request's own origin), never a hardcoded host, so the same
file works locally and behind the deploy host.

## Verification

### Test evidence
`npx vitest run proxy.test.ts` → **14 passed (14)**, 1 file passed.

The suite covers: anonymous redirect on `/dashboard` and three deep paths; pass-through for a
cookie-bearing request (including an exact structural comparison against a fresh
`NextResponse.next()`); bare-name and empty-value cookies; a forged value; a near-miss cookie name
(`corvus_session_other`); the cookie found among other cookies; the absolute redirect target on the
request origin; the cookie-name pin against the auth module's exported constant; matcher coverage
across dashboard, public, and near-miss paths; and the literal-string shape of `config.matcher`.

**Guard validation (added after the first green run).** Three mutations were introduced and the
suite was watched to fail each time, then the file was restored from a byte-identical copy:

| Mutation | Tests that failed |
|---|---|
| Cookie name changed to `corvus_sessionn` | 5 |
| `config.matcher` reduced to `['/dashboard']` | 2 |
| Gate condition inverted (fail-open) | 10 |

The matcher assertions are made through Next.js's own matcher implementation
(`unstable_doesMiddlewareMatch` from `next/experimental/testing/server`, the documented unit-testing
entry point), not a hand-rolled path comparison — so "does `/dashboard/bots` match" is answered by
the same code the build uses, including the transport forms (`/_next/data/…/dashboard.json`,
`/dashboard.rsc`) that the build adds for client-side navigation.

One non-obvious setup step was required. That entry point transitively imports
`dist/server/app-render/work-async-storage-instance.js`, whose `createAsyncLocalStorage()` falls
back to a `FakeAsyncLocalStorage` that **throws on use** when `globalThis.AsyncLocalStorage` is
absent (`dist/server/app-render/async-local-storage.js`). Next.js's own server boot installs the
real one first (`dist/server/node-environment-baseline.js`: "expose AsyncLocalStorage on global for
react usage if it isn't already provided by the environment"). A bare test process has not booted a
Next server, so the test file performs the same one-line installation and imports the entry point
**dynamically** — a static import would be hoisted above the assignment and fail. This was
established by direct experiment, not assumption: the import throws without it, in plain Node as
well as under vitest.

### Gate evidence
- `npx eslint proxy.ts proxy.test.ts` → clean, zero warnings.
- `npx prettier --check proxy.ts proxy.test.ts` → "All matched files use Prettier code style!".
- `npx tsc --noEmit` → **zero errors attributable to my files.** (See "Foreign blocker" below.)

### Running-app evidence (curl, against the dev server on 127.0.0.1:3000)

Anonymous — every dashboard path redirects:

```
/dashboard                 status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard/                status=308 loc=http://127.0.0.1:3000/dashboard   (Next's own trailing-slash normalisation, then 307)
/dashboard/bots            status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard/new             status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard/bots/abc        status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard/bots/abc/token  status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard?runId=1         status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard?_rsc=abc123     status=307 loc=http://127.0.0.1:3000/api/auth/login
/dashboard (RSC header)    status=307 loc=http://127.0.0.1:3000/api/auth/login
```

Cookie-bearing — pass-through, no redirect:

```
/dashboard                 status=200
/dashboard/bots            status=200
/dashboard/new             status=200
```

Public — all still open:

```
/           200     /gallery    200     /demo       200     /pick   200
/interview  200     /privacy    200     /terms      200     /auth/error  200
```

**Full signed-in journey (real path, real database).** `POST /api/auth/dev-login` minted a real
36-character session id against the local Postgres; that cookie was then presented to the gate:

```
minted session id length: 36
/dashboard + real cookie       -> status=200 (no redirect)
/dashboard/bots + real cookie  -> status=200 (no redirect)
```

Following the redirect chain end-to-end (`curl -L /dashboard/`) lands on
`https://discord.com/oauth2/authorize?...&state=…` with 3 redirects — i.e. the gate hands the
visitor to the real login flow, which proceeds normally.

**Instrument check (a measurement is worthless if the instrument is wrong).** The dev server on
port 3000 was already running before this file existed, so "the redirect appeared" could have had
another cause. A marker header was temporarily added to `proxy.ts` and the live response was
re-read:

```
HTTP/1.1 307 Temporary Redirect
location: /api/auth/login
x-proxy-probe: f9-gate-ran
```

The marker proves the running server executed *this* file. The marker was then removed, the file
restored from its byte-identical backup, and the live behaviour re-confirmed unchanged (307 on
`/dashboard`, 200 with a cookie, 200 on `/gallery`).

## Public Interface Exposed

```ts
// apps/web/proxy.ts
export function proxy(request: NextRequest): NextResponse
export const config: { matcher: string[] }   // ['/dashboard', '/dashboard/:path*']
```

No other symbol is exported. Next.js requires exactly one `proxy` (or default) export plus the
optional `config`; the build validates this at `dist/build/analysis/get-page-static-info.js`
(`validateMiddlewareProxyExports`).

## Assumptions Made

- **`proxy.ts` is the correct filename, not `middleware.ts`.** Next.js 16.3.4 has renamed the
  convention; `middleware` is deprecated. Verified against the bundled docs on disk
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, which carries
  the deprecation notice) and against the build's own constants (`PROXY_FILENAME = 'proxy'` in
  `dist/lib/constants.js`) — not from memory.
- **Redirect goes to `/api/auth/login`, not a new `/login` page.** The task named
  `/api/auth/login`; it already exists and starts the Discord flow. No new route was invented.
- **Cookie presence means "signed in at some point", so a stale cookie passes.** This is the
  intended optimistic-check trade-off, matching the bundled guidance ("Optimistic checks with Proxy
  (Optional)", `docs/01-app/02-guides/authentication.md`); the fail-closed checks stay in the API
  routes, which were not modified.
- **`proxy.test.ts` sits beside `proxy.ts` at the project root**, matching the repo's existing
  co-located convention (`app/dashboard/layout.test.tsx` beside `page.tsx`). The task permitted "its
  test file".

## Open Questions for Orchestrator

1. **BLOCKER for deploy (outside my scope — Dockerfile is not in my file scope).**
   `apps/web/Dockerfile` copies apps/web's sources as an explicit path list (`app`, `components`,
   `lib`, `public`, plus named config files). **`proxy.ts` is not on that list**, so the gate will
   exist in dev and be **absent from the deployed image** — the anonymous `/dashboard` shell would
   return in production while every test here still passes. Proven mechanically (parsed the
   Dockerfile's COPY lines): `proxy.ts => REACHES IMAGE: false`.

   The fix is one line in the builder stage, beside the existing copies:
   `COPY apps/web/proxy.ts apps/web/proxy.ts`.
   The repo already knows this failure class — the CI `docker-build` job exists precisely because
   that explicit list can drift. I did not touch the Dockerfile, per the scope guard.

2. **A foreign, in-flight typecheck error blocks `next build`.** `npx tsc --noEmit` reports exactly
   one error repo-wide, and it is not mine:
   `app/dashboard/bots/[id]/page.tsx(1043,16): error TS2304: Cannot find name 'CREDITS_PER_CHANGE'.`
   The constant exists at `lib/bots.ts:182` but is not imported by that file. It is another agent's
   uncommitted work (the file, `page.module.css`, `page.test.tsx` and a new `token/` route are all
   modified/untracked in the working tree concurrently). Because `next build` runs TypeScript, the
   production build currently fails on it — so I could not obtain a *production* build screenshot.
   I did not touch that file, and I ran no git command that restores from HEAD.

3. **Pre-existing test failures in the working tree are unrelated to this task.** The full suite is
   at 4 failed files / 52 failed tests, all in foreign in-flight files
   (`app/dashboard/bots/[id]/page.test.tsx`, `app/dashboard/new/page.test.tsx`,
   `app/gallery/page.test.tsx`, `app/privacy/page.test.tsx`). Verified as unrelated rather than
   assumed: with `proxy.ts` and `proxy.test.ts` temporarily moved aside, those same files fail
   identically. For reference, my own session's baseline run (before writing anything) showed 1
   failed file / 3 failed tests — the extra failures arrived with the concurrent agents' work.

## Known Limitations

- **Optimistic only.** The gate proves a cookie is *present*, never that it is valid, unexpired, or
  belongs to a real account. A forged cookie reaches the shell; the API routes then answer 401 and
  the pages render their existing honest logged-out states. This is by design and stated in the
  file header.
- **`/dashboard` gate covers the UI shell only.** It does not gate any `/api/*` route, and the task
  did not ask it to. Per the bundled docs' own warning, a proxy matcher change can silently remove
  coverage, so API-side auth must not be assumed to depend on this file.
- **Production-build behaviour is unverified** for the reason in Open Question 2 — the running-app
  evidence above is from the dev server (which executes the same `proxy.ts` and the same Next
  matcher machinery).
- **Documentation not updated.** `PLAN.md` / `00_START_HERE.md` were not touched: registering a new
  top-level runtime file is an orchestrator-level change, and both files are outside my declared
  scope.
