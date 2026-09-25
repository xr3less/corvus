# Task Report: bootwire-pool-sweeper

## Status
SUCCESS (with one escalated finding — see Open Questions OQ-1)

## Files Touched
- MODIFIED: apps/gateway/src/start.ts (only file in scope; both seams wired)
- CREATED: Agent Reports/2026-09-23-1330_bootwire_FIX_pool-sweeper-boot.md (this report)

No other repository file was created, modified, or deleted. The proof harness used to
verify the seams was built in an OS temp directory (`%TEMP%\bootwire-harness`) and has been
deleted; `git status` confirms no stray file in the repo.

## Dependencies Added
None. `@corvus/ai` was already a declared dependency of `apps/gateway` (package.json
`dependencies`), so the new import adds no dependency and no manifest edit.

## What Was Wired

### 1. Refill pool seam (`__setRefillPool`)
`apps/gateway/src/start.ts` — immediately after `const pool = new Pool(...)` / `const db = drizzle(pool)`:

```ts
__setRefillPool(pool);
```

The **same** `pool` instance the rest of boot uses. No second pool, no new env read, no
config change. Placed before any worker starts, because `startBuilderWorker` runs
`checkBudget` from its first job — a later call site could bill a refill-less grant.

### 2. Sweeper seam (`startSweeper` + `gateway.attachSweeper`)
Same file, after `await bootLiveBots(...)`:

```ts
const sweeper: SweeperHandle = startSweeper(pool, gateway, logger);
gateway.attachSweeper(sweeper);
logger.info({ level: 'info', event: 'sweeper-started', botId: SYSTEM_BOT_ID });
```

- Used the seam exactly as exported. **No opts object is passed**, so the poll interval
  (`SWEEPER_POLL_MS` = 60000) and the trial grace (`SWEEP_GRACE_MS` = 24h) stay exactly the
  values `sweeper.ts` exports and its suite proves — this call cannot drift them.
- Started **after** `bootLiveBots` so the first tick can never observe a mid-boot fleet.
- The handle is given to the gateway, not added as a separate shutdown leg:
  `Gateway.attachSweeper` already owns the lifecycle (a later attach stops the previous
  handle, and `Gateway.shutdown` stops it **first** — before `store.flush` and before the
  pool closes). A second stop leg here would be redundant, not safer.

### 3. No-op-in-shape when dependencies are absent
Both wirings follow the file's existing idioms and invent no new error swallowing:
- The refill setter is a plain synchronous assignment; `budget.ts` is already
  absence-tolerant by contract (no pool / missing table / unreadable row reads as 0).
- The sweeper's own driver already swallows read failures into a `sweeper-read-failed`
  log line and returns `{sleep: [], wake: []}` — unchanged, not re-implemented here.
- Neither call can throw at boot, so neither adds a failure surface to `boot()`.

## Acceptance Criteria — Evidence

| Criterion | Result | Proof |
|---|---|---|
| Refill setter called at boot with the live pool | **PASS** | Traced *and* tested — see "How the seams were proven" below |
| Sweeper attach/start called via its existing seam, interval/grace unchanged | **PASS** | No `opts` passed; assert on the real handle surface + a real tick |
| Gateway-scoped tests pass | **PASS** | sweeper 23/23; gateway minus `start.test.ts` 440/440 (34 files). Details below |
| Typecheck zero errors, project's real command | **PASS** | `npm run typecheck --workspace @corvus/gateway` exit 0; also exit 0 for `@corvus/ai` |
| Linter zero warnings on the touched file | **PASS** | `npx eslint apps/gateway/src/start.ts --max-warnings 0` exit 0. Also `prettier --check` clean |
| No live DB / live Discord / network side effects | **PASS** | Fakes only — mocked `pg`, mocked workers, mocked discord.js. No connection string, no socket |
| No secrets / manifest edits / installs / git restore / production contact | **PASS** | No manifest touched, no install run, no git restore/stash/checkout/reset, no commit. No secret value read, printed or logged |

### How the seams were proven (positive AND negative)
Because creating a repo test file was outside this task's declared file scope, the proof was
built as a **temporary out-of-repo harness** (`%TEMP%`) that imports the **real** `start.ts`
and mocks only its external edges (pg, the three pg-boss-backed workers, discord.js). 8
assertions, written to fail if either seam regresses:

**REFILL (4):** seam is empty before boot → after boot `refillAllowance()` answers from a real
injected pool → the pool queried for `credit_ledger` is the boot pool (same instance, same
`connectionString`) → the wiring changes a real outcome: `checkBudget` with `trial` tier,
spent 50, estimate 60 returns `allowance: 1100` (100 grant + 1000 refill) instead of blocking.

**SWEEPER (4):** `attachSweeper` called exactly once at boot → the attached handle exposes the
real `stop` + `sweepNow` → `sweepNow()` on the boot-attached handle drives a **real tick**
through the boot pool (a 48h-expired trial row ⇒ `sleep: ['bot-1']`, `removeBot('bot-1')`
called, still exactly one pool constructed) → ordering: `bootReader` strictly before
`attachSweeper`.

**Break-the-guard (the necessary second half).** Both guards were broken and watched to fail,
each with a *minimal* break so boot still completed (a throwing break would have proved nothing
about the seam):
- Removed only the `__setRefillPool(pool)` call ⇒ **exactly the 3 refill assertions failed**;
  all 5 sweeper assertions still passed. Restored ⇒ 8/8 green.
- Removed only the `gateway.attachSweeper(sweeper)` call ⇒ **exactly the 4 sweeper assertions
  failed**; the 4 refill assertions still passed. Restored ⇒ 8/8 green.

Each seam is therefore independently load-bearing and independently detected.

## Assumptions Made
- The gateway process is the intended home for the refill seam. `start.ts` is the gateway's
  boot entry and the builder worker (which calls `checkBudget`) runs inside it, so wiring the
  pool here makes the gate and the display read the same pool **within this process**. See
  OQ-1: the chat/verdict routes live in the *web* process and this call does not reach them.
- `startSweeper`'s third parameter accepts the boot `logger`: `GatewayLogger` satisfies
  `SweeperLogger` structurally (both are `{ level, event, botId, reason? }` records, and
  `LogRecord['level']` is the same `'info' | 'error'` union). Verified by typecheck, per the
  repo's established structural-typing convention (the store/boot/preflight layers do the same).
- A `sweeper-started` info line was added to match the four existing `*-started` boot lines.
  It is the only new log record; it carries no new data beyond the synthetic `system` botId
  the sibling lines already use.
- `gateway` satisfies `SweeperTarget` structurally via its existing `removeBot` — no change to
  `gateway.ts` was needed or made.

## Open Questions for Orchestrator

**OQ-1 (needs a decision — the refill gate is only half-live).**
`@corvus/ai` is a module-level singleton, so a pool set in the gateway process reaches only
code running *in that process*. Tracing every `checkBudget` call site:
- **In the gateway process** — `apps/gateway/src/db/builder-runs.ts:608` (the builder worker).
  This one is now live: the refill pack correctly widens the builder's allowance.
- **In the web process** — `apps/web/app/api/chat/route.ts:380` and
  `apps/web/app/api/builder/verdict/route.ts:387`. These are still unwired: the web process
  never calls `__setRefillPool` anywhere (verified by source search), so `refillAllowance`
  returns 0 there and a paying customer's refill pack does **not** lift the chat/verdict
  ceiling.

The two routes are where a customer actually feels the ceiling, so a refill purchase does not
yet do what it promises end-to-end. Closing it is a one-line call in the web process (e.g. in
its existing pool accessor `apps/web/lib/db/pool.ts`, which already owns that process's single
pool) — but **that file is not in this task's scope**, so I stopped and escalated rather than
expanding silently. Recommend a small follow-up task for it; this is a real customer-visible
gap, not a technicality. The e4b report's own open question anticipated exactly this.
Note the literal wiring point is E4b's to confirm (its seam, its contract), not mine.

**OQ-2 (pre-existing, not caused by this task — but now visible).**
`apps/gateway/src/start.test.ts` fails with **12 failures, all one single cause**:
`TypeError: gateway.attachSweeper is not a function` (12/12 identical; verified by counting
distinct error lines). Its `makeGateway()` fake is `{ shutdown }` only, so it is missing both
`attachSweeper` (needed now) and `startAll` (needed since the boot reader task). That fake is
unchanged from `HEAD` (`git show HEAD:...` ⇒ 0 occurrences of `attachSweeper`), i.e. it
predates this task.
Proof this is a stale-test artifact and **not** a product defect: I copied the file to temp and
added **only** those two methods to the fake — 10 of the 12 failures turned green immediately
(22 passed / 24), the 2 remaining failing only because the temp copy lacks `dist/` and a live
Postgres. The product path is sound; the fake is stale.
This file is **not in my scope**, and note it was edited concurrently by another agent during my
run (13:25:44, then 13:37:06) and still lacks both methods, so it appears to be actively owned.
Escalating rather than editing: recommend the owner add `startAll` + `attachSweeper` to
`makeGateway()`.

**OQ-3 (build artifact, informational).**
This task initially could not typecheck: `packages/ai/dist` (gitignored build output, required
for `@corvus/ai` to resolve — the gateway resolves it through the package's `exports` →
`main: ./dist/index.js`) was **stale and predated the refill seam**, so `__setRefillPool` did
not exist at typecheck or at runtime. Mid-task the dist was rebuilt by another agent (13:27:38)
and the seam resolved. Anyone typechecking or testing the gateway must have a **fresh**
`npm run build --workspace @corvus/ai` first — CI and the Dockerfile both already do this
explicitly. No action needed; recording it because a stale dist produces a misleading
"no exported member" error that looks like a code defect.

## Public Interface Exposed
No new exports. The change is confined to the body of `boot()` and the import list of
`apps/gateway/src/start.ts`. `BootedGateway` is unchanged — deliberately: the sweeper is owned
by the gateway's existing `attachSweeper` handle, so exposing it on `BootedGateway` would create
a second owner for one interval. `boot()`'s signature and return shape are unchanged.

New boot log record: `{ level: 'info', event: 'sweeper-started', botId: 'system' }`.

## Known Limitations
- **Not** proven: a live-Postgres end-to-end run. Per the acceptance criteria, verification is
  unit/in-memory only (no live DB, no live Discord, no network). The `sweepNow()` tick is proven
  against a fake pool with real SQL dispatch, not against Postgres.
- The refill seam is live for the **gateway** process only — see OQ-1. The web process's two
  production `checkBudget` call sites remain unwired.
- `start.test.ts` currently fails (12, one cause) for the pre-existing stale-fake reason in
  OQ-2; that file is out of scope and concurrently owned. All other 34 gateway suites are green
  (440/440), identical to the pre-change baseline.
- One unrelated flake observed once: `src/launch-blockers.test.ts > C — 10k-XP storm...` failed
  once under parallel suite load (15.9s) and passed on both re-runs and in isolation (9.3s).
  That suite does not import `start.ts` at all (grep: no `boot`/`sweeper` reference), so it
  cannot be affected by this change; it is timing-sensitive under load.
- Per the task budget: no repo-wide lint/format run (the touched file was checked
  individually); no full monorepo suite (gateway + the ai budget suite were run).
- The proof harness was temporary and outside the repo, so it is not a permanent regression
  guard. If a permanent guard is wanted, adding those 8 assertions to `start.test.ts` (owned by
  another agent — see OQ-2) is the natural home.

## Verification Commands (exact)
- `npm run typecheck --workspace @corvus/gateway` → exit 0
- `npm run typecheck --workspace @corvus/ai` → exit 0
- `npx eslint apps/gateway/src/start.ts --max-warnings 0` → exit 0
- `npx prettier --check apps/gateway/src/start.ts` → clean
- `npx vitest run src/runtime/sweeper.test.ts` (apps/gateway) → 23/23 passed
- `npx vitest run --exclude "**/start.test.ts"` (apps/gateway) → 34 files, 440/440 passed
  (baseline before the change: 440 passed / 1 collect error — identical test count)
- `npx vitest run src/budget.test.ts` (packages/ai) → 39/39 passed
- out-of-repo seam harness → 8/8 passed; both break-the-guard runs failed exactly and only the
  intended assertions

## SECURITY
Production box, Contabo, GHCR and live keys were never touched. No SSH, no box `.env`, no
registry push. No `package.json` / lockfile / `.env` edit, no install, no git
restore/stash/checkout/reset, no commit. No secret value was read, printed, copied or
transmitted anywhere — `<redacted>`-style: token/URL presence was only ever checked by
definedness, and the only connection string in the harness was an obviously fake
`postgresql://corvus:secret@localhost:5432/corvus` literal that never left the temp directory
(now deleted).
