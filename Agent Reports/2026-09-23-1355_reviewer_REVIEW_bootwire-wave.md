# Task Report: reviewer-bootwire-wave

## Status
**PASS** (with two non-blocking findings — F1 is a **deliverable gap** the orchestrator should close
before declaring the wave done; F2 is a durability gap. Neither is a defect in the wiring itself.)

The gateway boot wiring is correct, load-bearing, and consistent with the web side. Both seams are
genuinely on disk, call the right things in the right order, and are proven by the project's real
gates plus direct runtime evidence from the merged tree. No blocking finding.

---

## Files Touched
- CREATED: Agent Reports/2026-09-23-1355_reviewer_REVIEW_bootwire-wave.md (this report)

**No source file was created, modified, or deleted by this review.** All findings below were
reported, not applied (read-only review; no fix was needed for the wiring).

Files read (read-only, under review):
- `apps/gateway/src/start.ts` — the wiring (`:21` import, `:456` refill setter, `:564-565` sweeper)
- `apps/gateway/src/runtime/sweeper.ts` — interval/grace values and the handle contract
- `apps/gateway/src/gateway.ts` — `attachSweeper` + shutdown ownership
- `apps/gateway/src/start.test.ts` — deconfliction check against the concurrent wave
- `packages/ai/src/budget.ts` — the refill seam and the gate
- `apps/web/lib/db/pool.ts` — web side, consistency only (not re-reviewed)
- `apps/gateway/Dockerfile`, `apps/gateway/package.json`, root `package.json`, `.gitignore`,
  `apps/gateway/vitest.config.mjs` — toolchain + build-path detection

---

## Dependencies Added
None. `@corvus/ai` was already a declared dependency of `@corvus/gateway`
(`apps/gateway/package.json:27`). No manifest, lockfile, or `.env` file was edited — `package.json`
mtime 09-15, `package-lock.json` 09-20, `.env.example` 09-21, `apps/gateway/package.json` 09-15, all
predating this change. No install was run by me.

---

## 1. DOES IT WORK

### Toolchain detected (never assumed)
npm workspaces (`package.json` `workspaces: ["apps/*","packages/*"]` + `package-lock.json`; **no**
pnpm/yarn/bun lockfile present). `@corvus/gateway` scripts are real: `typecheck: tsc --noEmit`,
`test: vitest run`, `build: tsc`. `@corvus/ai` resolves through `exports` → `main: ./dist/index.js`.
`node_modules` and `packages/ai/dist` both exist — no install needed, no escalation required.

### Commands, exits, counts (all run by me, this session, on the merged tree)
| Command | Result |
|---|---|
| `npm run typecheck --workspace @corvus/gateway` | **exit 0** |
| `npx eslint src/start.ts --max-warnings 0` (cwd `apps/gateway`) | **exit 0** |
| `npx prettier --check src/start.ts` | **clean** |
| `npx vitest run src/runtime/sweeper.test.ts` | **23/23** |
| `npx vitest run src/start.test.ts` | **24/24** (0 skipped) |
| `npx vitest run --exclude "**/start.test.ts"` | **34 files, 440/440** |
| `npx vitest run` (full gateway) | **35 files, 464/464** |
| `npx vitest run src/budget.test.ts` (packages/ai) | **39/39** |
| `npx vitest run lib/db/pool.test.ts` (apps/web) | **2/2** |

Counts claimed by both builder reports reproduce exactly (sweeper 23, gateway-minus-start 440,
budget 39, web pool 2). `464 = 440 + 24` — the merged tree is internally consistent, which is the
"run the gates on the merged tree yourself" check (`LESSONS.md` §1.7).

### Artifacts exist on disk (trust artifacts, not summaries)
- Both report files really exist: `2026-09-23-1330_bootwire_FIX_pool-sweeper-boot.md` (13,311 B,
  13:39) and `2026-09-23-1335_webwire_FIX_refill-pool-web.md` (15,379 B, 14:06).
- The claimed wiring really exists, verified by line, not by summary:
  - `apps/gateway/src/start.ts:456` → `__setRefillPool(pool);`
  - `apps/gateway/src/start.ts:564` → `const sweeper: SweeperHandle = startSweeper(pool, gateway, logger);`
  - `apps/gateway/src/start.ts:565` → `gateway.attachSweeper(sweeper);`
  - `apps/web/lib/db/pool.ts:90` → `__setRefillPool(pool);`
- Diff shape matches the claims: `git diff --numstat` → `start.ts` **355/8**, `pool.ts` **15/0**
  (the web figure is exactly the 15/0 the webwire report and its reviewer both recorded).
- **Runtime evidence, not just static.** Running `start.test.ts` emits the real boot log through the
  real `boot()`: `{"level":"info","event":"sweeper-started","botId":"system"}` appears for every boot
  test. The wiring executes on the real path; `startSweeper` is reached from `boot()`.
- The stale-dist trap both reports warned about is **absent for `@corvus/ai`**:
  `packages/ai/dist/index.js` (13:27) carries `__setRefillPool` (2 occurrences in `budget.js`), and
  `node -e "require('@corvus/ai')"` from `apps/gateway` resolves to
  `packages/ai/dist/index.js` with `__setRefillPool: function`. So typecheck read a fresh seam.

### No live DB / Discord / network side effects
Gateway verification used the repo's hermetic suites (mocked `pg`, mocked workers, mocked discord.js).
The only live-Postgres leg is the pre-existing `supervisor audit write (real Postgres)` test at
`start.test.ts:783`, which is outside this change; it **passed here** (it resolved
`resolveLiveDatabaseUrl()` → the defined `DATABASE_URL`, else the CI container URL) — that is a local
CI-identical container, not production, and touches only its own throwaway schema. No Discord, no
HTTP, no production contact.

---

## 2. DOES IT MATCH

### Refill setter: same pool instance, before workers start — **CONFIRMED**
- `start.ts:439` constructs the boot pool; `:456` hands **that** instance to the seam. No second
  `Pool` is constructed in `boot()` (grep for `new Pool(` in `apps/gateway/src`: `start.ts:439` is the
  only one in the boot path; the others are `db/index.ts`/`seed.ts`/worker-local — none reachable
  from `boot()`). One pool instance, one wiring.
- Ordering is right and load-bearing: `__setRefillPool` at `:456` precedes `startPreflightWorker`
  (`:506`), `startBuilderWorker` (`:520`), `startSyncCommandsWorker` (`:533`) and `bootLiveBots`
  (`:550`). The builder worker's `checkBudget` (`apps/gateway/src/db/builder-runs.ts:608`) is
  therefore always reached with the seam already set — the builder's own stated rationale.
- The gateway process is wired correctly: `builder-runs.ts` imports `checkBudget` from the same
  `@corvus/ai` specifier `start.ts` imports `__setRefillPool` from, and I confirmed `require`
  resolution lands on a single `packages/ai/dist/index.js`, i.e. one module instance per process.
- `refillAllowance` is a module-level singleton (`packages/ai/src/budget.ts:69`), so this is the
  correct and only place for the gateway.

### Sweeper: attached after `bootLiveBots`, unchanged interval/grace — **CONFIRMED**
- Placement: `await bootLiveBots(pool, gateway, logger)` at `:550`, then `startSweeper` at `:564`.
  The first tick can never observe a mid-boot fleet.
- **Interval and grace are provably unchanged.** `startSweeper(pool, gateway, logger)` passes **no
  4th argument**, so `opts = {}` and `sweeper.ts:167-168` take `opts.graceMs ?? SWEEP_GRACE_MS` /
  `opts.intervalMs ?? SWEEPER_POLL_MS`. The exported constants are `SWEEP_GRACE_MS = 24*60*60*1000`
  (`sweeper.ts:25`) and `SWEEPER_POLL_MS = 60*1000` (`sweeper.ts:27`), and
  `sweeper.test.ts:42-43` pins both literally. This call cannot drift them — it is a bare 3-arg call.
- The gateway's `SweeperTarget` is satisfied structurally by `removeBot(id: string): Promise<void>`
  (`gateway.ts:106`) — no `gateway.ts` edit was needed, and the diff confirms none was made to it.

### Handle lifecycle owned by the gateway, no second shutdown leg — **CONFIRMED**
- `gateway.ts:243-246` `attachSweeper` stops any predecessor before replacing, so a re-attach cannot
  leave two intervals running.
- `gateway.ts:499-501` `shutdown()` stops the sweeper **first**, before `store.flush()` (`:505`) and
  before the pool close, and nulls the handle — so no tick can race teardown or query a closed pool.
- Boot's own `shutdown()` has exactly four legs — `worker.stop()`, `builderWorker.stop()`,
  `syncCommandsWorker.stop()`, `gateway.shutdown()`, `pool.end()` (`start.ts:594-617`) — and **no
  sweeper leg**. That is correct, not an omission: the gateway already owns the stop, and a second
  leg would be a redundant double-stop. Verified by reading the closure, not the comment.

### Web side consistent — **CONFIRMED (not re-reviewed)**
Both processes wire the same seam from their own pool owner: gateway `start.ts:456` (boot pool),
web `pool.ts:90` (the cached `getPool()` instance, returned at `:59-62` before the construction
branch, so it runs once per process). `__resetPool()` has **no production caller** (only its own
definition at `pool.ts:98` and a re-export at `apps/web/app/api/webhooks/creem/route.ts:73`), so
nothing can un-wire the seam mid-process. Both sides hand over an object satisfying
`RefillQueryable` (`budget.ts:65-67`) structurally — `Pool` needs no cast. Consistent.

---

## 3. DECONFLICTION — the `starttest` wave

**Current `start.test.ts` is consistent with the wiring. No drift.**

- The file now carries `attachSweeper` on the fake:
  `start.test.ts:155` → `return { shutdown: vi.fn(async () => undefined), attachSweeper: vi.fn() };`
  and the whole file passes **24/24**. The bootwire report's OQ-2 (12 failures,
  `gateway.attachSweeper is not a function`) is **resolved** — it was written against the file mid-edit
  (13:37) and the owner landed the fake at 13:44. The `sweeper-started` log line proves
  `attachSweeper` is genuinely reached on every boot test.
- **Finding F1 (deliverable gap, file:line evidence).** The concurrent wave's fake is a **two-method
  stub** and the suite never proves the wiring. Concretely, all 10 `createGateway` fakes are
  `makeGateway()` (`start.test.ts:255,284,301,322,342,356,382,414,502,740`), whose type annotation
  (`:147-150`) and body (`:155`) carry **only** `shutdown` and `attachSweeper`. `Gateway.startAll`
  (`gateway.ts:166`) is **absent** — `grep -n "startAll" src/start.test.ts` → no matches. And the
  mocked `pg` `Pool.query()` **rejects** (`start.test.ts:79-81`).
  Consequence: in every boot test, `bootLiveBots` catches the rejected query at `start.ts:362` and
  returns `{started:[],failed:[]}` at `:366` — **before** reaching `gateway.startAll(ids, …)` at
  `:408`. The missing method is therefore never called, which is exactly why the file is green.
  This is masked-by-shape, not proven-safe: a future edit that lets the reader reach `startAll`
  (a resolved-query fake) would throw `gateway.startAll is not a function` on all 10 boot tests.
  This is pre-existing (the boot reader predates this wave) and is **not** part of the sweeper/refill
  wiring under review, so it does not block — but the bootwire report's OQ-2 recommendation
  ("add `startAll` + `attachSweeper`") was only **half** implemented: `attachSweeper` landed,
  `startAll` did not.

- **Finding F2 (durability gap).** Neither seam has a permanent regression guard. `start.test.ts`
  contains **zero** occurrences of `__setRefillPool`, zero `expect(mocks.startSweeper…)`, zero
  `expect(gateway.attachSweeper…)`, and zero `sweeper-started` assertions — `startSweeper` is only
  *stubbed* at `:66`/`:240` so boot stays timer-free. `attachSweeper` appears in a test only as the
  gateway's own lifecycle contract (`sweeper.test.ts:355-356`, which tests the gateway, not boot).
  Both builders proved their seams with **deleted `%TEMP%` harnesses** (correctly disclosed in both
  reports and both 8/8 break-the-guard runs), so nothing in the repo fails if `start.ts:456` or
  `:565` is removed tomorrow. This matches the webwire reviewer's OQ-4 verdict ("a durability gap,
  not a validity gap"). Per `LESSONS.md` §1.8 a guard is only a guard once broken-and-watched-to-fail
  — both builders **did** do that, so validity is established; only permanence is missing.

`start.test.ts` was indeed edited concurrently during the bootwire run (mtime 13:44, after
`start.ts` 13:31) — consistent with the bootwire report's own account and with the wave ordering.

---

## 4. QUALITY / SECURITY

- **No secrets.** `start.ts` and `pool.ts` contain no key, token, or credential value. The only
  connection string anywhere is `TEST_DATABASE_URL` at `pool.ts:13`, a pre-existing non-secret CI
  fixture (`postgresql://corvus:corvus_ci@localhost:5434/corvus_ci`), unchanged by this wave. The new
  `sweeper-started` record carries only `{level,event,botId}` — no new data. Presence was checked by
  definedness only; nothing sensitive is reproduced in this report.
- **No manifest/env edits, no installs.** mtimes confirm `package.json` 09-15,
  `apps/gateway/package.json` 09-15, `package-lock.json` 09-20, `.env.example` 09-21 — all predate the
  change. No `npm install` was run by me; `node_modules` was already present, so no escalation.
- **No git restore/commit.** HEAD is unchanged at `d9cf8d7` (2026-09-19 23:50). I ran no
  `stash`/`checkout`/`restore`/`reset` and no commit.
- **No production contact.** No SSH, no box `.env`, no Contabo, no GHCR, no live keys. The one
  live-Postgres test (pre-existing) targets the local CI-identical container.
- **No residue.** No stray file from this review; the builders' `%TEMP%` harnesses are gone (checked
  `/tmp` and `%TEMP%` — absent). `find` for `*bootwire*` outside `.git` returns only the report itself.
  The untracked `./.playwright-mcp/` in the working tree is dated 02:50, ~10h before this wave, and is
  not attributable to it.

---

## Assumptions Made
- I treated "the wiring is really on disk" as requiring both a line-level read **and** an execution
  trace; the `sweeper-started` log emitted by the real `boot()` under the real suite is the execution
  evidence, and I relied on it rather than reconstructing the deleted temp harness (which no longer
  exists by either report's account).
- I took the reported break-the-guard runs at their word as *described* (the artifacts were
  deliberately deleted), and therefore treated validity as established by design-review + the
  load-bearing 3-arg call shape rather than by re-running a deleted harness. This is why F2 is framed
  as a durability gap, not a validity gap.
- I read the web side for consistency only, per instructions, and did not re-adjudicate its reviewer's
  findings; I confirmed the four concrete consistency facts independently (single wiring point, same
  seam, no production `__resetPool` caller, structural `RefillQueryable` fit).
- I did not run the web workspace's full suite (not this wave's scope; its own reviewer ran 885/885).
  I ran the two web-touching suites that matter to gateway consistency: `pool.test.ts` 2/2.

---

## Open Questions for Orchestrator

**OQ-1 (recommend closing F1 before declaring the wave done).** The bootwire report's OQ-2 asked for
`startAll` + `attachSweeper` on `makeGateway()`; only `attachSweeper` landed. Recommend a small
follow-up adding `startAll: vi.fn(async () => ({ started: [], failed: [] }))` to the fake at
`start.test.ts:155` so the boot reader's contract is real rather than silently short-circuited by the
rejecting pool mock. Not a blocker for this wave — no production behaviour is affected.

**OQ-2 (recommend as a follow-up, F2).** Neither wiring has a permanent guard. Both natural homes are
writable without a live DB: `apps/gateway/src/start.test.ts` for the gateway (assert
`expect(mocks.startSweeper).toHaveBeenCalledWith(expect.anything(), expect.anything(),
expect.anything())` with **exactly three** args — which also pins "no opts passed", hence interval and
grace unchanged — plus `expect(gateway.attachSweeper).toHaveBeenCalledWith(<that handle>)`), and
`apps/web/lib/db/pool.test.ts` for the web (intercept the constructed pool's `query` and assert the
seam names it). Assert the set *and* its size, per `LESSONS.md` §1.8.

**OQ-3 (informational, pre-existing — not caused by this wave).** The gateway's `dist/` is a stale
build: `apps/gateway/dist/start.js` is dated 09-21 23:32 and carries **0** occurrences of
`__setRefillPool` and **0** of `attachSweeper`, while `src/start.ts` is 09-23 13:31. `dist/` is
gitignored (`.gitignore:2`), and both the Dockerfile (`apps/gateway/Dockerfile:42-44` builds
`@corvus/spec` → `@corvus/ai` → `@corvus/gateway` before packaging `dist`, `CMD ["node",
"./dist/start.js"]`) and CI build fresh — so **the shipped artifact is correct** and this is a local
artifact hazard only. Recorded because it is the same class of trap as the bootwire report's OQ-3 and
would mislead anyone running `node apps/gateway/dist/start.js` locally: the local dist would boot a
gateway with **neither** seam live.

**OQ-4 (advisory, unrelated).** `apps/gateway/src/launch-blockers.test.ts:65` builds a Pool from a
module-scope `DATABASE_URL` and `:185` writes that into a spawned child process — it has no
`conninfo`-style connection-url guard. Not this wave's scope; noting only because it is adjacent to
the live-PG boundary. The "real Postgres" legs passed here against a local CI container, not production.

---

## Public Interface Exposed
No new exports. `boot()`'s signature and return shape are unchanged; `BootedGateway` deliberately does
**not** expose the sweeper (the gateway's `attachSweeper` handle is its single owner — exposing it
again would create a second owner for one interval). `apps/web/lib/db/pool.ts` keeps its exact surface
(`TEST_DATABASE_URL`, `DatabaseNotConfiguredError`, `requireDatabaseUrl`, `getPool`, `__setPool`,
`__resetPool`, `mapDbError`/`DbErrorResponse` re-exports).

New observable behaviour: one additional boot log record,
`{"level":"info","event":"sweeper-started","botId":"system"}` (`start.ts:566`), matching the four
sibling `*-started` lines already there. In the gateway process the refill seam now names the boot
pool, so `refillAllowance()` stops returning 0 and `checkBudget` widens the allowance by the account's
active refill credits — covering `apps/gateway/src/db/builder-runs.ts:608`.

---

## Known Limitations
- **Not proven by me, and not claimed by either builder:** a live-Postgres end-to-end run, or a real
  HTTP request against a booted server. My strongest evidence is the real `boot()` executing under the
  real suite (the `sweeper-started` line) plus the 464/464 merged-tree run — **not** a booted gateway
  process against a real database. Per `LESSONS.md` §1.3/§2.4, "done" means a human completed the flow
  in the running app; that step is unowned for this wave by both reports' own admission, and I did not
  perform it.
- The sweeper's tick is proven against fakes with real SQL dispatch (`sweeper.test.ts`), never against
  Postgres. The interval/grace values are proven unchanged **structurally** (bare 3-arg call) and by
  the constants suite, not by observing a real 60s tick.
- The 90-day refill window is SQL-side with no live-PG date-boundary test (inherited from E4b, restated
  in both reports). Unchanged by this wave.
- I did not run the web workspace's full 885-test suite or the repo-wide lint/format run; I ran the
  checks the task named plus the two suites that bear on gateway/web consistency.
- F1 and F2 are recorded findings but **neither blocks**: both seams are on disk, in the right order,
  with the right arguments, and are consistent across the two processes.

---

## VERDICT

| # | Check | Result |
|---|---|---|
| 1 | Does it work (typecheck, lint, suites, artifacts on disk) | **PASS** — exit 0, sweeper 23/23, start 24/24, gateway-minus-start 440/440, merged tree 464/464, budget 39/39, pool 2/2; both reports + both wirings verified on disk and in execution |
| 2 | Does it match (same pool, before workers, 60s/24h unchanged, lifecycle gateway-owned, web consistent) | **PASS** — all five properties confirmed with file:line evidence |
| 3 | Deconfliction with the concurrent `starttest` wave | **PASS** — `attachSweeper` present at `start.test.ts:155`, 24/24 green; bootwire OQ-2 resolved. Two non-blocking findings recorded (F1 missing `startAll` on the fake, F2 no permanent guard) |
| 4 | Quality (secrets, manifests, installs, git, prod, residue) | **PASS** — none found |

**Status: PASS.** No fix agent required for the wiring. Recommended follow-ups: **OQ-1** (add
`startAll` to the boot fake — closes F1) and **OQ-2** (permanent regression guards for both seams —
closes F2). OQ-3 is an informational local-artifact hazard; OQ-4 is an unrelated advisory.

---

## SECURITY
Production box, Contabo, GHCR and live keys were never touched. No SSH, no box `.env`, no registry
push, no deploy. No `package.json` / lockfile / `.env` edit, no install, no commit, and no git command
that restores from HEAD (no stash/checkout/restore/reset) — HEAD remains `d9cf8d7`. No secret value was
read, printed, copied or transmitted anywhere; presence was checked only by definedness. All gateway
tests ran hermetically except the pre-existing live-PG leg, which targeted a local CI-identical
container and touched only its own throwaway schema. This review modified no source file.
