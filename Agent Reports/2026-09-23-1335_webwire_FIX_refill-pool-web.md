# Task Report: webwire-refill-pool

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/lib/db/pool.ts — `git diff --numstat` reports exactly 15 insertions, 0 deletions: **2 code lines** (`import { __setRefillPool } from '@corvus/ai';` and `__setRefillPool(pool);`) plus 13 comment lines explaining the seam and the placement.
- CREATED: Agent Reports/2026-09-23-1335_webwire_FIX_refill-pool-web.md (this report)

No other repository file was created, modified, or deleted. The two proof harnesses were built
outside the repo (in `%TEMP%`) and have been deleted; `git status` confirms no stray file.

One side-effect to record: verifying the wiring survives production bundling required
`npm run build` in the web workspace. That writes only to `apps/web/.next/` (gitignored via
`.gitignore:3`) and left no tracked file changed — `git status --porcelain` still shows exactly
one modified path. The rebuild was necessary because the pre-existing `.next` output predated
this change, and a tree-shaken build cannot be used to prove an export survives bundling.

## Dependencies Added
None. `@corvus/ai` is already a declared dependency of `@corvus/web` (package.json
`dependencies`), and both production routes (`app/api/chat/route.ts:25`,
`app/api/builder/verdict/route.ts:41`) already import the same package — no manifest edit, no
new dependency.

## What Was Wired

`apps/web/lib/db/pool.ts`, inside `getPool()` immediately after the real pool is constructed:

```ts
const pool = new Pool({ connectionString: url });
holder()[POOL_KEY] = pool;
__setRefillPool(pool);   // <-- the wiring
return pool;
```

Plus the import `import { __setRefillPool } from '@corvus/ai';`.

The **same** pool instance every route already reads through `getPool()`. No new pool, no new
env read, no interval/grace change, no route logic change, no config change.

### Why this point, and not module load
The task asked for the call "once, at module init". I placed it at pool **construction** instead,
and that deviation is deliberate and load-bearing. `getPool()` resolves `DATABASE_URL` lazily on
purpose (the KI-021 fix directly above it, pinned by `apps/web/lib/db/pool.test.ts`): when the URL
is absent it returns an uncached stand-in whose `query` rejects. A call at module load would
therefore have run *before* any real pool existed and pinned the seam to that stand-in — a dead
object — so a `DATABASE_URL` supplied later in the same process would leave refills reading zero
for the rest of that process's life. Wiring at construction means the seam always names a real
pool, and because the branch above returns the cached instance, the line runs exactly once per
process. This preserves the lazy-resolution property the KI-021 test pins.

## Acceptance Criteria — Evidence

| Criterion | Result | Proof |
|---|---|---|
| Web pool module calls the existing setter once with its own pool instance | **PASS** | Traced *and* tested — see "How the wiring was proven" |
| No new pool, no new env read, no interval/grace change, no route logic change | **PASS** | Diff is 1 import + 1 call + comment. No route file opened for edit |
| Web-scoped tests pass | **PASS** | Full web suite: 62 files, **885/885** (baseline 885/885 before the change). Refill/credits-adjacent, each run individually: chat 33/33, verdict 30/30, pool 2/2, creem webhook 65/65. Exact counts below |
| Typecheck zero errors, project's real command | **PASS** | `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) exit 0 |
| Linter zero warnings on the touched file | **PASS** | `npx eslint lib/db/pool.ts --max-warnings 0` exit 0; whole-package `npm run lint` exit 0; `prettier --check` clean |
| No live DB / live Discord / network side effects | **PASS** | In-memory fakes + a real pool object whose `query` is intercepted; see below |
| No secrets / manifest edits / installs / git restore / commit / production contact | **PASS** | No manifest touched, no install, no git restore/stash/checkout/reset, no commit, no SSH/Contabo/GHCR/live keys |

### How the wiring was proven (positive AND negative, plus instrument validation)

The suites alone cannot prove this wiring: they inject a pool via `__setPool`, which assigns the
cached slot directly and **never enters the `new Pool(...)` branch where the wiring lives**. A
green run would have been compatible with the call being absent. So the wiring was proven
separately, in two places.

**A. Out-of-repo seam harness — 8/8, run against the real `pool.ts`.**
It imports the real module with only its three bare specifiers rewritten to absolute URLs (proven
to differ from the repo file on exactly those 3 lines; the wiring line is byte-identical), and
mocks only the pool's own `query`.

The harness opens with **instrument validation** (probe 0): the harness and the module under test
must share ONE `@corvus/ai` instance. That check exists because the first version of this harness
ran *outside* the repo, where the bare specifier resolved to a second module instance, and it
reported 5 failures that said nothing about the product. Probe 0 makes that failure mode
impossible to mistake for a defect — and it is the reason the harness's verdict is trustworthy.

Probes: seam empty before any pool exists (blocked at 100) · refill read goes through the pool
`getPool()` built · the read is the shared `REFILL_CREDITS_SQL` with `[accountId, 'refill']` ·
`checkBudget` widens trial 100 → 1100 (the customer-visible lift) · a second `getPool()` returns
the same cached instance (one construction, one wiring) · **cold start**: with no pool yet, the
route's `getSpent` read constructs it and the *first request* still gets the lift · break-the-guard.

**Break-the-guard (the necessary second half).** Commenting out only `__setRefillPool(pool);` —
a minimal break that leaves boot working — flipped **exactly the 5 wiring-dependent probes to
FAIL** while probe 0 (instrument) and the break-the-guard control still PASSed. Restored ⇒ 8/8.
The wiring line is therefore independently load-bearing and independently detected.

**B. The production path, in the real deployed build — the strongest evidence.**
This mattered because the seam is a *module-level* singleton, so it only works if Next hands every
server route the same module instance. Verified on the built output, not by reasoning:

- `apps/web/.next/server/app/api/chat/route.js` and `.../builder/verdict/route.js` both require the
  **same** `chunks/[turbopack]_runtime.js` singleton, whose `moduleCache` is a top-level
  process-wide `const`, keyed by module id (`getOrInstantiateModuleFromParent` reads
  `moduleCache[id]` first).
- In the fresh build, `packages/ai/src/budget.ts` registers under **one id (44378)** in all 6 chunks
  that carry it, and `apps/web/lib/db/pool.ts` under **one id (51977)** in all 6 — no id maps to
  two different sources.
- Loading both routes' chunk sets through the real runtime and resolving id 44378 gives
  **the identical module object and the identical exports object**.
- The post-change build now exports the seam: the compiled table reads
  `"__setRefillPool",0,function(e){r=e}` — it was tree-shaken out of the pre-change build, which is
  exactly why it had to be rebuilt.
- Driving the **built** `checkBudget`: before wiring `ok=false allowance=100`; after
  `__setRefillPool(...)` `ok=true allowance=1100`. The compiled gate really does read the seam.
- The compiled `getPool` body reads `let r=new n.Pool({connectionString:t}); return o()[u]=r,(0,s.__setRefillPool)(r),r`
  — construction, cache, wire, return — and the unconfigured stand-in branch above it does **not**
  call the setter, so the KI-021 lazy-resolution property is intact in the shipped code.

### Test counts (exact)
- Full web suite: **62 files, 885/885 passed** — identical to the pre-change baseline (885/885),
  so this change broke nothing and leaked nothing across suites.
- Named refill/credits-adjacent suites, each run individually after the change:
  `app/api/chat/route.test.ts` **33/33** · `app/api/builder/verdict/route.test.ts` **30/30** ·
  `lib/db/pool.test.ts` **2/2** · `app/api/webhooks/creem/route.test.ts` **65/65**.
- `packages/ai` (the seam's own package, its 39 budget cases among them): **6 files, 144/144 passed**.

### No live DB / no network
Every probe used an in-memory fake or a real `pg` Pool object whose `query` was intercepted before
use (`pg` opens sockets lazily on first query, never at construction). No `DATABASE_URL` from
`.env.local` was read or used; the harness set an obviously fake, unroutable
`postgresql://corvus:corvus_ci@127.0.0.1:59999/corvus_ci` literal that never left `%TEMP%`. No
connection was opened, no Discord, no HTTP.

## Assumptions Made
- **The web process's pool owner is `getPool()`, not a boot hook.** The web app has no boot entry
  analogous to the gateway's `start.ts` (`next.config.js` is `output: 'standalone'` and nothing
  else); `lib/db/pool.ts` is the module that constructs this process's single pool, and it already
  owns the `globalThis` slot so all routes share one instance. Wiring there is therefore the only
  place that satisfies "the same pool" without adding a pool or an env read. Flagged as an
  interpretation of "at module init" in "What Was Wired" above.
- `Pool` structurally satisfies `RefillQueryable` (`query(text, params)`), so no type assertion or
  cast was needed. Verified by typecheck.
- Importing `@corvus/ai` from `pool.ts` widens that module graph. Checked: the package's barrel
  (`packages/ai/src/index.ts` → lanes/router/cost/budget/builder-prompt/persona-prompt) performs no
  import-time work — `router.ts` reads `process.env` only inside functions, not at load — and no
  client component imports `lib/db/pool` (checked every `'use client'` file), so nothing new
  reaches a browser bundle. The web build succeeded, confirming this.
- An existing `packages/ai/dist` is required for the import to resolve (`main: ./dist/index.js`);
  confirmed fresh (10:27:38, newer than `src/budget.ts` 08:21:56) and carrying the seam. A stale
  dist would have produced a misleading "no exported member" error — the same trap recorded in the
  bootwire report's OQ-3.

## Open Questions for Orchestrator

**OQ-1 (informational — the E4b gap is now closed on both sides).**
`@corvus/ai` is a module-level singleton, so each process needs its own wiring. Both are now done:
the gateway's `apps/gateway/src/start.ts:456` (bootwire) and the web's
`apps/web/lib/db/pool.ts` (this task). Together these cover **all three** production `checkBudget`
call sites — `apps/gateway/src/db/builder-runs.ts:608`, `apps/web/app/api/chat/route.ts:380`, and
`apps/web/app/api/builder/verdict/route.ts:387`. No further wiring is outstanding; `refillAllowance`
now returns a real number wherever the gate is consulted. The credits **display** route
(`app/api/credits/route.ts:120`) already read refills independently through the same
`REFILL_CREDITS_SQL`, so the gate and the display now agree — which was the point of the seam.

**OQ-2 (scope note, not a request).**
The 90-day window is enforced in SQL in `budget.ts`'s `REFILL_CREDITS_SQL`, and this wiring passes
the pool through unchanged, so it inherits E4b's existing limitation: no live-Postgres
date-boundary test exists (E4b's report says so too). This task adds no new gap — the read was
already absence-tolerant and the window already expressed in SQL — but the end-to-end
"insert an aged row, assert it is excluded" proof is still unowned. Per the acceptance criteria,
verification here was unit/in-memory only.

## Public Interface Exposed
No new exports. `pool.ts`'s public surface is unchanged: `TEST_DATABASE_URL`,
`DatabaseNotConfiguredError`, `requireDatabaseUrl`, `getPool`, `__setPool`, `__resetPool`, and the
`mapDbError` / `DbErrorResponse` re-exports all keep their exact signatures. `getPool()`'s
signature and return type are unchanged.

The one behavioral change: after a real pool is constructed, the `@corvus/ai` refill seam in this
process names that pool, so `refillAllowance()` stops returning 0 and `checkBudget` widens the
allowance by the account's active refill credits.

## Known Limitations
- **Not** proven: a live-Postgres end-to-end run, or a real HTTP request against a running server.
  Verification is unit/in-memory plus static+runtime analysis of the production build, per the
  acceptance criteria's "no live DB, no network" constraint. The production-identity proof loads
  the real deployed chunks through the real runtime and drives the real compiled `checkBudget`,
  but it does not boot the server or open a socket.
- The proof harnesses were temporary and outside the repo, so they are not a permanent regression
  guard. A permanent guard is worth adding — but the natural home, `lib/db/pool.test.ts`, would
  have to assert against the `new Pool(...)` branch, which the current hermetic suites deliberately
  avoid. Recommend a follow-up task rather than expanding this one's scope.
- This task rebuilt `apps/web/.next` (gitignored). Anyone who built before 14:02 should not trust
  that tree — and, as the bootwire report warns for the gateway, a stale `packages/ai/dist` will
  produce a misleading typecheck error; `npm run build --workspace @corvus/ai` first.
- Per the task budget: no repo-wide lint/format run outside the web workspace, and no gateway
  suite re-run (that workspace was not touched — `git status` confirms its modifications predate
  this task).
- The web build emitted its usual route table with no new warnings, but Next's own
  `apps/web/AGENTS.md` / `CLAUDE.md` (untracked, mtime 00:35, re-added by `next dev`) are
  pre-existing untracked files, not produced by this task.

## Verification Commands (exact)
- `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) → exit 0
- `npx eslint lib/db/pool.ts --max-warnings 0` → exit 0
- `npm run lint` (whole `@corvus/web`, root config, `--max-warnings 0` in the root script) → exit 0
- `npx prettier --check lib/db/pool.ts` → clean
- `npx vitest run` (`@corvus/web`, full) → 62 files, **885/885** passed
- `npx vitest run app/api/chat/route.test.ts app/api/builder/verdict/route.test.ts lib/db/pool.test.ts` → 3 files, 65/65 (33 + 30 + 2)
- `npx vitest run app/api/webhooks/creem/route.test.ts` → 1 file, 65/65
- `npx vitest run` (`@corvus/ai`) → 6 files, 144/144
- `npm run build` (`@corvus/web`) → succeeded; produced the tree the production-path proof used
- out-of-repo seam harness → 8/8 passed; break-the-guard run failed exactly the 5 wiring probes
- built-output runtime probe → identical module + exports object across chat and verdict routes; built `checkBudget` 100 → 1100 after wiring

## SECURITY
Production box, Contabo, GHCR and live keys were never touched. No SSH, no box `.env`, no registry
push, no deploy. No `package.json` / lockfile / `.env` edit, no install, no git
restore/stash/checkout/reset, no commit. No secret value was read, printed, copied or transmitted
anywhere: key/URL presence was only ever checked by length or definedness, and the only connection
string used was an obviously fake `postgresql://corvus:corvus_ci@127.0.0.1:59999/corvus_ci` literal
that was never dialed and never left the (now deleted) `%TEMP%` harness directory. The app's real
`.env.local` was never read or sourced.
