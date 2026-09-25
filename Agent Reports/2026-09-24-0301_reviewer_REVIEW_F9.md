# Reviewer Report: review-F9

## Status
**PASS** — the gate works on the real path, in both the dev server and a production standalone
server I built and booted myself. I found **no defect in F9's own code**. Three things deserve the
orchestrator's attention, and none of them is reviewable inside this task's scope:

- **F1 (pre-existing, HIGH, blocks the whole point of the wave):** `apps/web/Dockerfile` ships
  `apps/web/proxy.ts` **to nowhere**. The Dockerfile copy list is explicit and does not name it, so
  the gate exists in dev and vanishes in the image. The builder flagged this; it is still open, and
  nothing in CI catches it.
- **F2 (foreign, in-flight):** three test files fail on the merged tree. None of them mentions the
  gate.
- **F3 (scope, informational):** the builder's two escalations were accurate. Its "production
  build unverified" limitation is now closed by me.

- Reviewer: independent (`review-F9`), did not write the code.
- Tree: merged working tree, `master` @ `d9cf8d7`, reviewed 2026-09-24 02:33–02:41.
- Artifacts under review (untracked, as the report states):
  - `apps/web/proxy.ts` md5 `35cf87dfb7075c946ce101bc2fc73fd9`
  - `apps/web/proxy.test.ts` md5 `e83e132231a672729abd7f989004a946`
  - `Agent Reports/2026-09-24-0301_F9_CREATE_proxy-gate.md` md5 `623e8d6a745ee42ccdf1ef686e9286e5`
- **No edits were made by this reviewer to any tracked source.** No git restore/stash/commit/push/
  deploy/migrate/secrets. `.next/` build output was regenerated (gitignored) and a temporary
  standalone server was started on port 3399 and stopped again; the pre-existing dev server on
  `127.0.0.1:3000` (PID 10836) was left running and is still healthy.

---

## Step 1 — Real typecheck + lint (zero warnings)

Toolchain detected from the project, not assumed: npm workspaces (`package.json` → `workspaces:
["apps/*","packages/*"]`), per-workspace scripts, ESLint 9 flat config, Prettier 3.

| Command (cwd) | Result |
|---|---|
| `npm run typecheck` (repo root) | **exit 0** |
| `npm run lint` (repo root, `eslint . --max-warnings 0`) | **exit 0** |
| `npx tsc --noEmit` (`apps/web`) | **exit 0** |
| `npx tsc --noEmit --incremental false` (`apps/web`) | **exit 0** |
| `npx eslint proxy.ts proxy.test.ts --max-warnings 0` (`apps/web`) | **exit 0**, zero output |
| `npx prettier --check proxy.ts proxy.test.ts` (`apps/web`) | "All matched files use Prettier code style!" |

**Instrument check on the typecheck**, because a cached green is not a green (`LESSONS.md` §1): I
re-ran with `--incremental false` — also exit 0. The builder's Open Question 2 reported one repo-wide
error (`app/dashboard/bots/[id]/page.tsx(1043,16): Cannot find name 'CREDITS_PER_CHANGE'`). That
error is **gone now**: the file no longer references `CREDITS_PER_CHANGE` at all
(`grep -c` → 0), so a peer fixed it while this wave was in flight. Its blank line at `page.tsx:1043`
is the residue.

Workspace-wide prettier (`npm run format`) exits 1 on `apps/web` — **not F9's doing**: the failing
files are `.vitest/json/output.json`, `app/api/bots/[botId]/go-live/route.ts`,
`app/api/bots/[botId]/token/route.ts`, `app/dashboard/bots/[id]/token/page.tsx`,
`app/gallery/[slug]/page.tsx`, `app/gallery/page.tsx`. Both F9 files pass. This is a **foreign
CI-red** on the merged tree and belongs to whoever owns those files.

---

## Step 2 — Focused tests

```
npx vitest run proxy.test.ts   (cwd apps/web)
→ Test Files  1 passed (1)
  Tests       14 passed (14)
```

Re-run twice, identical. The suite has 14 tests, no mocks of the unit under test
(`grep -c "vi.mock|vi.fn|vi.spyOn"` → 0), and drives the real `proxy()` export with real
`NextRequest` objects.

**I independently validated the matcher instrument rather than trusting the builder's claim about
it.** The suite measures matcher coverage through Next's own
`unstable_doesMiddlewareMatch` (`node_modules/next/dist/experimental/testing/server/middleware-testing-utils.js:15`),
so I fed that same function the real config and five mutants and compared fingerprints across the
12 paths the suite names:

| Config | Fingerprint over `/dashboard,/dashboard/bots,/dashboard/bots/x/token,/dashboard.rsc,/_next/data/B/dashboard.json,/,/gallery,/dashboardx,/dashboard-notes,/api/credits,/pryzm,/auth/error` | |
|---|---|---|
| **real** `['/dashboard','/dashboard/:path*']` | `111110000000` | baseline |
| `[]` | `000000000000` | differs — has teeth |
| `['/dashboard']` | `100110000000` | differs — has teeth |
| `['/dashboard/:path*']` | `111110000000` | **same as real** |
| `['/dash','/dash/:path*']` | `000000000000` | differs — has teeth |
| non-literal construction | `100110000000` | differs — has teeth |

The near-blind entry is honest and already disclosed: the suite pins a *different* mutant
(`matcher` reduced to `['/dashboard']`), and its public-route block does catch the prefix-bleed cases
the fingerprint cannot (`/dashboardx`, `/dashboard-notes` → `false`). The instrument is sound.

### The gate itself, exercised live (dev server, `127.0.0.1:3000`)

Anonymous — redirected, as claimed:

```
/dashboard                => 307  http://127.0.0.1:3000/api/auth/login
/dashboard/               => 308  (Next's own trailing-slash normalisation, then 307)
/dashboard/bots           => 307  → /api/auth/login
/dashboard/new            => 307  → /api/auth/login
/dashboard/bots/abc       => 307  → /api/auth/login
/dashboard/bots/abc/token => 307  → /api/auth/login
/dashboard?runId=1        => 307  → /api/auth/login
/dashboard?_rsc=abc123    => 307  → /api/auth/login
/dashboard + RSC: 1       => 307  → /api/auth/login
/dashboard + Next-Router-Prefetch: 1 => 307 → /api/auth/login
/dashboard + Next-Router-State-Tree  => 307 → /api/auth/login
```

Cookie-bearing — passed through, no redirect, no `Location`, no `Set-Cookie`:

```
corvus_session=<real>       /dashboard,/dashboard/bots,/dashboard/new => 200
corvus_session=             (empty value)                            => 200
corvus_session= (space)                                               => 200
corvus_session (bare, no '=')                                         => 200
corvus_session=!!!junk!!!   (forged)                                  => 200
theme=dark; corvus_session=abc; locale=tr (among others)              => 200
```

Near-misses and public surfaces — rejected/open exactly as claimed:

```
corvus_session_other=abc => 307    xcorvus_session=abc => 307    CORVUS_SESSION=abc => 307
corvus_session=%ZZ       => 307    (parser drops the undecodable pair — test line 116)
/dashboardx => 404    /dashboard-notes => 404    /DASHBOARD => 404    /dashboard. => 404
/ /gallery /demo /pick /interview /privacy /terms /auth/error /pryzm => 200
/api/credits anon => 401            /api/bots anon => 401
```

**No redirect loop.** Following the anonymous chain end-to-end:
`curl -L /dashboard` → `final=https://discord.com/oauth2/authorize?...&state=… code=200 redirects=2`,
i.e. the gate hands the visitor to the real Discord login flow, which proceeds. The target
`/api/auth/login` is outside the matcher, and `app/dashboard/**` contains no competing `redirect(`
(`grep -rn "redirect(" apps/web/app/dashboard` excluding tests → empty), so the gate is the only
redirect source on that path.

### The signed-in journey, on a real session

`POST /api/auth/dev-login` minted a real 36-char session id against local Postgres
(`set-cookie: corvus_session=7bcf3188-…; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`). That
cookie through the gate:

```
/dashboard  => 200 (no redirect)     /dashboard?_rsc=x + RSC:1 => 200
curl -L -H "Cookie: corvus_session=…" /dashboard => final=/dashboard code=200 redirects=0
```

And the body is the real page, not an error shell (`grep` on the response → `Kurulum`, the dashboard
shell). **Both halves of the flow — anonymous visitor and signed-in visitor — completed in the
running app**, which is the bar `LESSONS.md` §2.3 sets.

---

## Step 3 — Residue grep

- **Probe residue:** `grep -rn "f9-gate-ran|x-proxy-probe"` over the tree (excluding `node_modules`,
  `.next`) returns **only the report's own quotation of it** at
  `Agent Reports/2026-09-24-0301_F9_CREATE_proxy-gate.md:147`. No marker survives in generated code.
- **Scratch probes:** repo-wide `find -iname "*scratch*"` returns only the cleanup report. No
  `scratch-probe*.test.ts` remains.
- **Turkish/English copy:** not applicable — `proxy.ts` renders no user-facing string (no JSX, no
  `<div>/<span>`; `grep -c` → 0). It emits a redirect and nothing else. The residue class this check
  exists for has no site here.
- **Anonymous access still 200?** No — `/dashboard` answers 307 to `/api/auth/login` for every
  anonymous form I tried, including the RSC/prefetch headers and both `?runId=` / `?_rsc=` variants.
- **Deeper check on the gate's cheapness.** The builder's central design claim — "no `pg` in the
  proxy bundle" — is true where it matters. Compiled proxy chunk
  `.next/dev/server/chunks/[root-of-the-server]__1gei0t7._.js` is **9,268 bytes** and contains
  exactly one app module (`apps/web/proxy.ts`), `PgSessionStore` ×0, `getPool` ×0, `pg-pool` ×0. The
  production gate chunk (`.next/server/chunks/[root-of-the-server]__1n_i60g._.js`, 212 KB) is
  Next's own runtime plus the same single app module: `PgSessionStore` ×0, `getPool` ×0,
  `pg-pool` ×0, `node:crypto` ×0.

---

## Step 4 — Report artifact exists

`Agent Reports/2026-09-24-0301_F9_CREATE_proxy-gate.md` — **12,349 bytes**, mtime
2026-09-24 02:17:38, md5 `623e8d6a745ee42ccdf1ef686e9286e5`. Present on disk, non-empty, schema
complete (Status / Files Touched / Dependencies Added / Assumptions / Open Questions / Public
Interface / Known Limitations).

**Trust artifacts, not summaries.** Every mechanism the report cites, I opened and confirmed:

| Claim | Verified |
|---|---|
| `proxy.ts` is the current convention, `middleware` deprecated | `node_modules/next/dist/lib/constants.js:289` `PROXY_FILENAME = 'proxy'`; bundled `docs/01-app/03-api-reference/03-file-conventions/proxy.md:11` carries the deprecation note and `:806` dates it to v16.0.0 |
| The file must sit at the project root beside `app/` | `next/dist/build/index.js:702-712` — detection accepts only `normalizedFileDir === '/' or '/src'`; `apps/web` has no `src/`, and `proxy.ts` is at the root. Correct placement. |
| The build validates exactly one `proxy`/default export | `next/dist/build/analysis/get-page-static-info.js:245` `function validateMiddlewareProxyExports` exists as described |
| Matcher must be static literals | `next/dist/build/index.js:333-372` `getMiddlewareMatchers` — reads the config, zod-parses each source, `process.exit(1)` on failure |
| The transport forms are added by the build | confirmed twice over — in source at `build/index.js:351-352`, and **in this build's own output** at `.next/server/functions-config-manifest.json`, which registers `/_middleware` with the two expanded regexps, the first literally covering `(_next/data/[^/]{1,})` and `(\.json|\.rsc|\.segments/…\.segment\.rsc)` |
| Cookie name matches the auth module | `apps/web/lib/auth/session.ts:18` `export const SESSION_COOKIE = 'corvus_session'` vs `proxy.ts:35` — **equal**; the suite also pins it (`proxy.test.ts:156`) |
| AsyncLocalStorage setup note in the test file | `next/dist/server/node-environment-baseline.js:1` "expose AsyncLocalStorage on global for react usage…"; `app-render/async-local-storage.js` Fake implementation present |

### The one gap the builder left open, closed by this review

The builder listed **"Production-build behaviour is unverified"** (blocked by the foreign typecheck
error, which has since cleared). I closed it:

1. `npx next build` (`apps/web`) → **exit 0**, and its own route table prints
   `ƒ Proxy (Middleware)`.
2. `.next/server/functions-config-manifest.json` registers `/_middleware` with `runtime: "nodejs"`
   and the two expanded matcher regexps quoted above.
3. I staged `static/` and `public/` into the standalone tree as the Dockerfile does (`COPY --from=builder
   /app/apps/web/.next/static`, `public`), started `apps/web/.next/standalone/apps/web/server.js` on
   port 3399, and probed it:

```
prod anon /dashboard       => 307  http://127.0.0.1:3399/api/auth/login
prod anon /dashboard/bots  => 307  → /api/auth/login
prod anon /dashboard/new   => 307  → /api/auth/login
prod anon /dashboard + RSC: 1        => 307 → /api/auth/login
prod anon /dashboard?_rsc=x          => 307 → /api/auth/login
prod cookie /dashboard     => 200  (no Location, no Set-Cookie)
prod public /              => 200     prod public /gallery => 200
```

The gate behaves identically in the packaged server. Port 3399's server was stopped afterwards; the
pre-existing dev server was untouched.

### Adversarial pass — no bypass found

| Probe | Result |
|---|---|
| `x-middleware-subrequest: proxy:proxy:proxy` (CVE-2025-29927 class) | 307 → login. Not bypassed. |
| `x-middleware-subrequest: middleware:…×5` | 307 → login |
| `//dashboard`, `/./dashboard`, `/dashboard%2F` | 308/307, and the normalised form re-enters the gate |
| `/dashboard.rsc`, `/_next/data/x/dashboard.json` | 307 → login (both are covered by the expanded regex, confirmed above) |
| `/DASHBOARD`, `/dashboard.`, `/dashboardx` | 404 — no gate bypass, no shell |

One benign observation, not a finding: `/_next/data/x/gallery.json` and `/_next/data/x/index.json`
answer 404 (there is no Pages-Router data layer in this App-Router app), so the `/_next/data/…`
prefix inside the matcher is inert here and covered as 307 only by unit test. Harmless.

### The premise the gate exists for is real

`app/dashboard/page.tsx:1` is `'use client'`, and the APIs behind it are fail-closed:
`GET /api/bots` anonymous → 401, `/api/credits` → 401, `/api/session/trial` → 401. Before the gate,
an anonymous visitor reached a client shell whose data all 401'd. The gate is the correct layer, and
the fail-closed check behind it is unchanged (`grep` shows the gate touches no API route).

---

## Findings — none against F9's code

### F1 — HIGH, pre-existing, blocks the wave's purpose (builder's escalation 1, still open)

`apps/web/Dockerfile` copies `apps/web`'s sources as an explicit path list (lines 42–50: `app`,
`components`, `lib`, `public`, plus named config files). **`proxy.ts` is not on it.** I reproduced
the builder's mechanical proof by parsing the COPY lines:

```
apps/web/proxy.ts      => reaches image: false
apps/web/proxy.test.ts => reaches image: false
apps/web/app           => reaches image: true
apps/web/components    => reaches image: true
apps/web/lib           => reaches image: true
```

Consequence: **in dev the gate works; in the deployed image it does not exist.** The image would be
built from a tree where `apps/web/proxy.ts` is absent, so `next build` inside Docker emits no
`/_middleware` entry at all, and anonymous visitors get the old logged-out-looking shell back. Every
test here still passes. This is the exact drift class
`.github/workflows/ci.yml:52-63` says the `docker-build` job exists to catch — and it does not catch
it, because a *missing* COPY line makes the build succeed rather than fail. The job's own comment
("a path gets renamed or deleted and the copy still names it") describes only the other direction.

Fix is one line in the builder stage beside line 50: `COPY apps/web/proxy.ts apps/web/proxy.ts`.
Whether that is CI-verifiable belongs to whoever owns the Dockerfile —
`.github/workflows/deploy.yml:125` files Dockerfiles under the "app-packaging workstream", and
`apps/web/Dockerfile` is untouched in this working tree (`git status` → empty).

### F2 — Three failing tests on the merged tree, none of them F9's

`npx vitest run` (`apps/web`) → **3 failed | 61 passed (64 files) · 3 failed | 982 passed (985 tests)**:

```
FAIL app/privacy/page.test.tsx:104   — expects link name 'Privacy Policy'; copy is now 'Gizlilik Politikası' (app/page.tsx:942)
FAIL app/gallery/page.test.tsx:422   — fork-failure fallback text
FAIL app/dashboard/new/page.test.tsx:490 — expects 'This reply used 1.1 credits'; copy is Turkish
```

All three are **copy-drift left by the Turkish-language wave** (F11/F13/F16 etc.), not by the gate.
Attribution checked, not assumed: the three files reference `proxy`/`dashboard` only incidentally
(`privacy` ×1, `gallery` ×7, `dashboard/new` ×11 — all pre-existing markup/nav text), and none of the
three failing assertions is on a redirect, a cookie, or a matcher path. `proxy.test.ts` is not in the
failing set and does not import them.

### F3 — The builder's other escalations, adjudicated

- **Foreign typecheck error** — was real, is now **fixed** by a peer (see Step 1). No action.
- **"Production-build behaviour is unverified"** — a fair limitation at the time; **now closed by
  this review** (Step 4).
- **"Optimistic, cookie-presence-only"** — correct, disclosed in both the file header and the
  report, and matches the bundled guidance
  (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Optimistic checks with Proxy").
  A forged cookie reaches the shell and is rejected by the APIs (proved live: forged cookie → 200 at
  the gate, 401 at `/api/bots`). This is the documented trade-off, not a defect.
- **"`/dashboard` gate covers the UI shell only"** — correct; the matcher names no `/api/*` path, and
  the APIs stayed fail-closed (401s above).
- **"Documentation not updated"** — correct and correctly scoped out. `grep` for `F9`, `proxy.ts` or
  `anonymous` in `Docs/PLAN.md` / `Docs/00_START_HERE.md` returns **nothing**, so the new top-level
  runtime file is unregistered in the living documentation. Registering it is orchestrator-level
  (`Principle 7`, `Hard Rule 11`); flagging, not faulting.

### Minor, non-blocking

- `proxy.test.ts` hard-codes how it *expects* Next to seed `globalThis.AsyncLocalStorage`. It cannot
  detect if a future Next installs something else there; the failure mode is a clear import-time
  throw, so this is acceptable, not a finding.
- `app/pryzm/page.tsx` is a real public surface (200) absent from both the matcher and the public-route
  test list. It is correctly *absent* from the matcher — the test simply does not name it as a control.
  Noise only.

---

## Public Interface Exposed (unchanged by review)

- `export function proxy(request: NextRequest): NextResponse` — `proxy.ts:43`
- `export const config: { matcher: string[] }` — `proxy.ts:60-62`, value
  `['/dashboard', '/dashboard/:path*']`

No other export. No API route, component, DB path or env var was touched by F9 — `grep` confirms
`proxy.ts` has no consumer other than its own test, and that the diff is two new untracked files.

## Known Limitations of this review

1. **The production image was not built.** Docker was not run; I verified the *standalone server*
   (what the image runs) instead, plus the COPY-list proof for the packaging step. The inference that
   the image lacks the gate is from the Dockerfile's explicit path list and Next's own root-level-only
   detection (`build/index.js:702`) — mechanical, not executed end-to-end in a container.
2. **`.next/` was regenerated by my `next build`.** That is gitignored build output, not source; both
   F9 source files hash identically before and after (`35cf87df…`, `e83e1322…`), and `git status`
   still shows them as untracked and unmodified.
3. **No fix was applied** for F1 (out of scope) — it is reported, with the one-line change named.
4. Nothing was deployed, migrated, committed, pushed, or read from secrets. The dev-login mint is a
   local dev-only route guarded by `NODE_ENV !== production && CORVUS_DEV_LOGIN === '1'`
   (`app/api/auth/dev-login/route.ts:31-42`).

## Verdict

`{"id":"F9","verdict":"PASS","notes":"Gate verified on the real path in dev AND in a production standalone server I built and booted: anonymous /dashboard,/dashboard/bots,/dashboard/new,?runId=,?_rsc=,RSC:1,prefetch and x-middleware-subrequest all 307 to /api/auth/login; real DB-minted cookie and forged/empty cookies pass through 200 with no Location/Set-Cookie; public routes and /dashboardx 404/200 as intended; no redirect loop; full anonymous chain ends on Discord authorize. Root typecheck and eslint --max-warnings 0 exit 0 (incremental cache invalidated and re-run), 14/14 focused tests green, matcher instrument independently mutant-tested through Next's own unstable_doesMiddlewareMatch, proxy bundle carries no pg (PgSessionStore/getPool/pg-pool all 0; dev chunk 9268 bytes, one app module), report artifact present and every cited Next mechanism confirmed on disk. No finding against F9's code. NOT F9's but blocking the wave's purpose: apps/web/proxy.ts is absent from the apps/web/Dockerfile COPY list (lines 42-50), so the gate works in dev and vanishes in the deployed image, and the CI docker-build job cannot catch a missing COPY - one-line fix COPY apps/web/proxy.ts apps/web/proxy.ts. Also on the merged tree: 3 foreign test failures (privacy/gallery/dashboard-new copy drift) and workspace prettier red on 6 foreign files."}`
