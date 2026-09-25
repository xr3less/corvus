# Task Report: reviewer-webwire-wave

## Status
PASS

The web-process refill-pool wiring is correct, load-bearing, and complete. The builder's
placement deviation (pool construction rather than module init) is **CORRECT** — adjudicated
from the code below with file:line evidence. No blocking findings.

---

## Files Touched
- CREATED: Agent Reports/2026-09-23-1350_reviewer_REVIEW_webwire-wave.md (this report)

**No source file was created, modified, or deleted by this review.** Verified after all checks:
`git diff --numstat -- apps/web/lib/db/pool.ts` still reports exactly `15  0`. No fix was applied
(review is read-only; none was needed).

Files read (read-only, under review):
- `apps/web/lib/db/pool.ts` — the wiring
- `packages/ai/src/budget.ts` — the seam and the gate
- `packages/ai/src/index.ts` — barrel (import-time surface)
- `apps/web/app/api/chat/route.ts`, `apps/web/app/api/builder/verdict/route.ts` — gate call sites
- `apps/web/app/api/credits/route.ts` — the display read
- `apps/web/app/api/webhooks/creem/route.ts` — refill row writer (vocabulary)
- `apps/web/lib/auth/session.ts` — the second pool (see F2)
- `apps/gateway/src/start.ts` — gateway side, consistency only
- `apps/web/lib/db/pool.test.ts`, `apps/web/.next/server/chunks/*` — proofs

## Dependencies Added
None. `@corvus/ai` was already a declared dependency of `@corvus/web` (`apps/web/package.json`),
and no manifest, lockfile, or `.env` file was edited (`package.json` mtime 09-15, `package-lock.json`
09-20, `.env.example` 09-21 — all predate this change). No install was run.

---

## 1. DOES IT WORK — verified, not taken on report

### Toolchain detected (never assumed)
npm workspaces (`package.json` `workspaces: ["apps/*", "packages/*"]`, `package-lock.json`; **no**
pnpm/yarn/bun lockfile). `@corvus/web` scripts are real: `typecheck: tsc --noEmit`, `lint: eslint .`,
`test: vitest run`. `@corvus/ai` builds to `dist/` via `tsc` and resolves through `exports` →
`main: ./dist/index.js`.

### Commands, exits, counts (all run by me, this session)
| Command | Result |
|---|---|
| `npm run typecheck --workspace @corvus/web` | **exit 0** |
| `npx eslint lib/db/pool.ts --max-warnings 0` (cwd `apps/web`) | **exit 0** |
| `npx prettier --check lib/db/pool.ts` | **clean** |
| `npx vitest run lib/db/pool.test.ts` | **2/2** |
| `npx vitest run app/api/chat/route.test.ts` | **33/33** |
| `npx vitest run app/api/builder/verdict/route.test.ts` | **30/30** |
| `npx vitest run app/api/webhooks/creem/route.test.ts` | **65/65** |
| the four together | **4 files, 130/130, exit 0** |
| full web suite `npx vitest run` | **62 files, 885/885, exit 0** |
| `npx vitest run` (cwd `packages/ai`) | **6 files, 144/144, exit 0** |

Every count the webwire report claimed reproduces **exactly** (130 = 33+30+2+65; 885; 144). No
check the report named is missing or renamed.

Note on the suites: they inject via `__setPool`, which assigns the cached slot directly and never
enters the `new Pool(...)` branch — so the green suites are compatible with the wiring being
absent. The builder said so, and it is true (`apps/web/lib/db/pool.ts:94-96` vs `:75-91`). I did
therefore not treat the suites as the proof; §5 and §6 below are.

### Artifacts exist on disk (trust artifacts, not summaries)
- The report really exists: `Agent Reports/2026-09-23-1335_webwire_FIX_refill-pool-web.md`.
- The claimed wiring really exists: `apps/web/lib/db/pool.ts:90` is `__setRefillPool(pool);`,
  inside `getPool()` between the cache assignment (`:76`) and the return (`:91`), with the import
  at `:7`. Diff is `15 insertions, 0 deletions`: 1 import + 1 call + 13 comment lines. Nothing else.
- The stale-artifact trap the report warned about is not present: `packages/ai/dist/budget.js`
  mtime **13:27:38** is newer than `packages/ai/src/budget.ts` **11:21:56**, and dist carries
  `__setRefillPool`. So the typecheck read a fresh seam, not a misleading stale one.
- `import('@corvus/ai')` from `apps/web` resolves and loads with no throw (node, exit 0;
  `__setRefillPool: function`, `checkBudget: function`).

## 2. DOES IT MATCH — the specified properties

**Setter called exactly once per process, with the live pool.** `getPool()` returns the cached
instance at `apps/web/lib/db/pool.ts:59-62` before reaching the construction branch, so `:75-90`
runs once per real pool. `__resetPool()` (`:98`) has **no production caller** — the only non-test
occurrences are its own definition and a re-export in the webhook route (`creem/route.ts:73`); every
call site is a `.test.ts`. So nothing can un-wire the seam mid-process.

**The live pool, not the stand-in.** `:75` constructs the real `Pool`; the unconfigured stand-in
branch (`:64-74`) returns at `:73` and **does not** call the setter. Confirmed in the shipped
bundle (below): the call sits only on the `new Pool` path.

**No new pool, no new env read, no route logic change.** `process.env.DATABASE_URL` is read once,
at `:63`, pre-existing; the change adds no env var. Searched the three routes and the gateway for
any refill-related edit: none — neither route mentions `__setRefillPool`, `refillAllowance`, or a
refill constant; both only import `checkBudget` (`chat/route.ts:25`,
`verdict/route.ts:41-45`). (The chat route *does* carry unrelated concurrent edits for the
m-23/m-24 reservation work — `PERSONA_MAX_OUTPUT_USD_PER_MTOKEN`, `PERSONA_RESERVE_CREDITS`,
`reserveChatSpend` — none of which touch refills. Not a deviation of this task.)

**Gate and display read the same pool on all three `checkBudget` call sites.**
- The gate reads through the seam: `packages/ai/src/budget.ts:107`
  `refillPool.query(REFILL_CREDITS_SQL, [accountId, REFILL_REASON])`.
- The display reads through `getPool()`: `apps/web/app/api/credits/route.ts:120`
  `getPool().query(REFILL_CREDITS_SQL, [accountId, REFILL_REASON])`.
- `pool.ts:90` hands the **same object** `getPool()` returns to the seam. Both use the identical
  SQL constant and the identical `['refill']` reason.
- Call sites: web `chat/route.ts:380` and `verdict/route.ts:387` (both satisfied by this wiring,
  in this process); gateway `builder-runs.ts:608` (satisfied by `start.ts:456`, already wired —
  consistency confirmed, not re-reviewed).

**Same pool instance across routes in production.** The seam is a *module-level* singleton, so this
is only true if Next hands every server route one `@corvus/ai` instance. Verified on the **fresh
build** (`.next` rebuilt 14:02:58, after `pool.ts` mtime 13:56:35):
- `apps/web/.next/server/chunks/[turbopack]_runtime.js` declares `moduleCache = Object.create(null)`
  and the runtime source comment states `moduleCache and moduleFactories are declared in
  runtime-base.ts` — one process-wide cache, read before instantiation.
- Six chunks carry `__setRefillPool`; the compiled gate in
  `[root-of-the-server]__0nq3a2w._.js` reads a variable initialised `r=null`, its setter compiles to
  `"__setRefillPool",0,function(e){r=e}`, and `refillAllowance` reads `if(null===r)return 0; try{
  (await r.query("SELECT COALESCE(SUM(amount_cr), 0) AS refills FROM credit_ledger WHERE
  account_id = $1 AND reason = $2 AND created_at >= now() - interval '90 days'",[e,"refill"]))...`
  — **the same `r`**, and the same SQL text the display route uses.

## 3. DEVIATION ADJUDICATION — **CORRECT**

The builder placed the call at pool **construction** instead of module init, arguing a module-load
call would pin the seam to the unconfigured stand-in. **The code says the builder is right.**

Evidence:
1. `apps/web/lib/db/pool.ts:63-74` — when `DATABASE_URL` is empty, `getPool()` returns
   `unconfiguredPool()`, and the comment at `:65-72` states it is **deliberately not cached**.
   `pool.test.ts:34-48` pins exactly that: `configured !== unconfigured`, with the failure before
   the fix being that the stand-in *was* cached.
2. `apps/web/lib/db/pool.ts:49-56` — the stand-in's `query` is `() => Promise.reject(new
   DatabaseNotConfiguredError())`. It is a dead object; it can never answer a refill read.
3. `packages/ai/src/budget.ts:105-111` — `refillAllowance` returns `0` when the seam is null, and
   swallows a throwing pool into `catch { return 0 }`. So a seam pinned to the stand-in yields
   **0 refills silently, forever** — no error, no log, just a paying customer's pack never lifting
   the ceiling. This is precisely the customer-visible failure the wiring exists to prevent.
4. Therefore a module-load call would be strictly worse than the deviation: at import time no env
   has been read, so the seam would hold the dead stand-in for the process's life even though a
   later-supplied `DATABASE_URL` correctly built a real pool for the routes. The builder traded a
   literal reading of "at module init" for the property that matters — the seam always names a
   **real** pool — and preserved the KI-021 lazy-resolution property that
   `apps/web/lib/db/pool.test.ts` pins.

The once-per-process requirement is still met by the early return at `:59-62`, so the deviation
costs nothing it was supposed to guarantee. **Deviation accepted; not a finding.**

**Bonus property I checked because it makes the cold start sufficient.** `checkBudget` calls
`getSpent()` at `budget.ts:196` **before** `refillAllowance()` at `:197`. In chat and verdict,
`getSpent` is `loadSpentCredits` → `getPool()` (`chat/route.ts:151`, `verdict/route.ts:270`). So on
a cold process the first request constructs the pool (wiring the seam) and *then* reads refills —
the very first turn already sees the lift. Verified in source and in the compiled order
(`let c=s(await e.getSpent(),...)` precedes `l=i+await n(r)`). The report's cold-start claim is
therefore structurally true, not merely asserted.

## 4. QUALITY / SECURITY

- **No live DB, Discord, or network side effects.** Verification used the repo's own hermetic
  suites (`__setPool` fakes) plus source and build-artifact inspection. `pool.test.ts` constructs a
  real `Pool` object with an unroutable fixture URL and never queries it (`pg` opens sockets lazily
  on first query). No `.env.local` read; no connection opened.
- **No secrets** in the diff, the reports, or this review. No key/token/connection-string value
  read, printed, or transmitted; presence checked only by definedness/length.
- **No manifest, lockfile, or `.env` edits; no installs; no git restore/stash/checkout/reset; no
  commit.** Confirmed by mtimes and by `git status` on the reviewed paths.
- **No production contact.** No SSH, no box `.env`, no Contabo, no GHCR, no live keys.
- **No residue.** `pool.ts` numstat still `15 0` after this review; `git status` shows no file this
  review created apart from its own report.
- **No new client-bundle reachability.** No `.tsx`/`.ts` that imports `lib/db/pool` carries a
  `'use client'` header (checked every referencing file), so `pg` and `@corvus/ai` do not enter a
  browser bundle through this import. The web build succeeded.
- **No import-time work added to the web process.** The `@corvus/ai` barrel resolves to
  lanes/router/cost/budget/builder-prompt/persona-prompt; grepped for top-level `process.env`
  assignments — none exist (imports and consts only), and the live `import()` above loads clean.

---

## Assumptions Made
- I read the production-behaviour claims from the **compiled artifacts on disk** rather than
  re-running the builder's out-of-repo harness (it was deleted, as the report says) or its
  built-chunk runtime probe. I reproduced the equivalent facts independently: the compiled `getPool`
  body, the seam variable identity, the SQL text identity, and the process-wide `moduleCache`. This
  is direct artifact evidence, not a summary check — but it is static + compiled inspection, not a
  booted server (see Known Limitations).
- I treated "the display" as `apps/web/app/api/credits/route.ts`, which is the route the E4a/e4b
  reports and the credits payload use for the refill line. If another surface displays refills, it
  was not named in my required context.
- The gateway side was read for consistency only, per instructions — I did not re-review it.

## Open Questions for Orchestrator

**OQ-1 (report precision, non-blocking — F1).** The webwire report states: "No other repository file
was created, modified, or deleted … `git status --porcelain` still shows exactly one modified path."
At tree level this session reports **111 modified paths and 156 untracked paths** (the concurrent
wave). The claim is true **of this task** — I confirmed via numstat plus content that the only
webwire change is `pool.ts` — but as written it describes a clean tree that does not exist. Worth
correcting the phrasing in the wave closeout so the next reader does not mistrust the diff. Not a
code defect and not grounds for a fix agent.

**OQ-2 (pre-existing; recording so it is not mistaken for an invariant — F2).** The web process
contains a **second** Postgres pool: `apps/web/lib/auth/session.ts:346`
(`defaultStore = new PgSessionStore(new Pool({ connectionString }))`). It is a session store, is not
the pool the credits display reads, and is correctly **not** wired to the refill seam. The invariant
that matters — *the pool the display reads is the pool the gate reads* — holds. Flagging only
because "one pool per process" is not literally true here.

**OQ-3 (informational, inherited — F3).** No live-Postgres 90-day boundary test exists (E4b's own
known limitation, restated in the webwire report as OQ-2). This wiring passes the pool through
unchanged and adds no new gap, but the end-to-end "insert an aged refill row, assert it is excluded"
proof remains unowned. Recommend as a separate task if the 90-day promise is to be proven rather
than asserted.

**OQ-4 (recommend a follow-up — F4).** The wiring's positive proof and its break-the-guard run both
lived in a deleted temp harness, so nothing permanent fails if `pool.ts:90` is removed tomorrow. The
natural home, `apps/web/lib/db/pool.test.ts`, currently avoids the `new Pool(...)` branch by design
(it proves the KI-021 property with an unroutable fixture URL). A guard could be added without a
live DB by intercepting the constructed pool's `query` and asserting the seam names it. Per the
repo's own scar-tissue rule, a guard is only a guard once broken-and-watched-to-fail — which the
builder did do here, so this is a durability gap, not a validity gap.

**OQ-5 (scope note).** `pool.ts` now imports `@corvus/ai` into the web process's DB module. I
verified this is harmless today (no import-time side effects, no client reachability, build green),
but it widens that module graph. No action requested — recording the coupling.

## Public Interface Exposed
No new exports, and none changed. `apps/web/lib/db/pool.ts` keeps its exact surface:
`TEST_DATABASE_URL`, `DatabaseNotConfiguredError`, `requireDatabaseUrl`, `getPool`, `__setPool`,
`__resetPool`, and the `mapDbError` / `DbErrorResponse` re-exports. `getPool()`'s signature and
return type are unchanged.

The one behavioural change: after a real pool is constructed, this process's `@corvus/ai` refill
seam names that pool, so `refillAllowance()` stops returning 0 and `checkBudget` widens the
allowance by the account's active refill credits (base tier grant + refills). Verified in the
compiled gate: `allowance = baseAllowance + refillAllowance(accountId)`.

## Known Limitations
- **Not** proven by me: a live-Postgres run or a real HTTP request against a booted server. My
  evidence is hermetic suites (130 targeted, 885 web, 144 ai) plus static and compiled-artifact
  inspection. I did not boot the web server; the builder's built-chunk runtime probe is the
  strongest link in the chain and I corroborated its *facts* from the artifacts rather than
  re-executing it.
- The `apps/gateway` suite was **not** re-run here (that workspace was not in scope; its
  modifications predate this task). `start.ts:456` was read for consistency only.
- `apps/gateway/src/start.test.ts` is known to fail for a pre-existing stale-fake reason (the
  bootwire report's OQ-2, `attachSweeper` missing from `makeGateway()`). I did not re-run or
  re-adjudicate it; it does not touch the wiring under review.
- No repo-wide lint/format run was performed. The touched file was checked individually (`eslint
  --max-warnings 0` exit 0, `prettier --check` clean) plus workspace typecheck exit 0.
- F1–F5 above are recorded findings but **none blocks**: the wiring is on disk, exactly once, with
  the live pool, and the gate and display agree on all three call sites.

## VERDICT

| # | Check | Result |
|---|---|---|
| 1 | Does it work (typecheck, lint, suites, artifacts on disk) | **PASS** — exit 0, 130/130 targeted, 885/885 web, 144/144 ai; report + wiring verified on disk |
| 2 | Does it match (once per process, live pool, no new pool/env/route logic, gate == display) | **PASS** — all four properties confirmed, compiled evidence included |
| 3 | Deviation adjudication (construction vs module init) | **CORRECT** — `pool.ts:63-74` + `budget.ts:105-111` make the deviation the only correct placement |
| 4 | Quality (side effects, secrets, manifests, git, prod, residue) | **PASS** — none found |

**Status: PASS.** No fix agent required. Recommended follow-ups are OQ-3 (live-PG boundary test) and
OQ-4 (permanent regression guard) — both pre-existing or durability items, neither a defect in this
change.

## SECURITY
Production box, Contabo, GHCR and live keys were never touched. No SSH, no box `.env`, no registry
push, no deploy. No `package.json` / lockfile / `.env` edit, no install, no commit, and no git
command that restores from HEAD (no stash/checkout/restore/reset). No secret value was read,
printed, copied or transmitted anywhere — presence was checked only by definedness, and no
credential or connection string appears in this report. All tests ran hermetically; no live
database, Discord, or network call was made. This review modified no source file.
