# Task Report: pool-guard-refill-pin

## Status

SUCCESS

The permanent regression guard exists, is mutation-proven on three independent
production mutations, and the wiring it protects (`apps/web/lib/db/pool.ts:90`)
is byte-identical to the reviewed PASS state. One AC line is reported as PARTIAL:
the sibling agent that owns the same file (`2026-09-23-1410_poolguard_FIX_pool-guard.md`)
had already added overlapping coverage by the time this task opened, so the
"KI-021 tests untouched" criterion is reported against the sibling's baseline
rather than against the file this task was briefed on — see OQ-1 and the
"Concurrent writer" section.

## Files Touched

- MODIFIED: `apps/web/lib/db/pool.test.ts` — `git diff --numstat` reports exactly
  `272 2`. Of that total, **my additive contribution is 107 insertions and 1
  deletion**; the other 165 insertions belong to the sibling task that had
  already written this file before I opened it (see "Concurrent writer"). Both
  figures are measured, not estimated: I reconstructed the sibling's baseline
  byte-exactly (223 lines, SHA-256 `c8c9ddbf…` — verified equal to the hash on
  disk when I started editing) and diffed it against the final file. The single
  deletion is an import line. Independently, `git diff -U0 | grep "^-"` against
  HEAD lists exactly two import lines and no test content.
- CREATED: `Agent Reports/2026-09-23-2014_pool-guard_CREATE_refill-guard.md` (this report)
- DELETED: none

**PRODUCTION SOURCE: NOT TOUCHED.** `apps/web/lib/db/pool.ts` is byte-identical to
its pre-task state, verified by SHA-256 before and after every mutation:
`0f4f6ca1405817917684e4d20cb550dcd530659d8aceb04b09774d0bbff123bf`, with
`git diff --numstat` still exactly `15 0`. The `+2`-line wiring at `:90`
(`__setRefillPool(pool);`) is preserved byte-for-byte. Mutation backups were held
**outside the repo** (`%TEMP%\corvus-poolguard`) and that directory has been
deleted; `git status --porcelain` shows no stray file from this task.

## Dependencies Added

None. `@corvus/ai` and `pg` were already declared dependencies of `@corvus/web`;
`vitest` 5.0.0 and its `vi.mock`/`vi.hoisted` are already in use in this
workspace. No manifest, lockfile, `.env`, or config file was edited; no install
was run.

## Concurrent Writer (read this first — it changes how the diff reads)

**This task's scoped file was being rewritten by another agent while I worked.**
Recorded as fact, not as an excuse.

Timeline, from `git diff --numstat`, `sha256sum` and mtime sampling (local time).
Hashes are given for the states I actually hashed; the 20:19 snapshot I read but
did not hash, so no hash is claimed for it.

| Time | `pool.test.ts` | Event |
|---|---|---|
| 20:19 | 59 lines (no hash taken) | my first read: the 2-test KI-021 file the brief described |
| 20:22:25 | 229 lines | sibling write #1 — mtime observed, content differs from my read |
| 20:24:02 | 225 lines | sibling write #2 |
| 20:27:51 | 218 lines | sibling write #3 |
| 20:31:30 → 20:45 | 223 lines, SHA-256 `c8c9ddbf…` | sibling write #4; file then stable for 60s+ (12 samples) |
| 20:33:18 → 20:45 | `c8c9ddbf…` | I re-read and began editing against this state |
| 20:38:06 | — | sibling's report lands: `2026-09-23-1410_poolguard_FIX_pool-guard.md` |
| 20:49 | 329 lines, `04221cc2…`, numstat `272 2` | final state, all gates green |

**The split is measured two independent ways and they agree.** Final numstat vs
HEAD is `272 2`; my delta vs the inherited file is `+107 / −1`; so the sibling's
contribution was `165 1`. Line-count check: `59 − 1 + 165 = 223`, which is exactly
the inherited file's length.

**One discrepancy to record (a finding, not a criticism of the work).** The
sibling's report states its `pool.test.ts` numstat as `167 1`, but `167` insertions
against a 59-line HEAD implies a **225**-line file — the state that existed on disk
at **20:24:02**, not the 223-line state it left at 20:31:30. So that report's
numstat is stale by 2 insertions relative to its own final artifact (the code
itself is fine and green; only the number in the report is off). Not fixed — it is
another agent's report, outside my write-scope. Flagged so the wave closeout does
not reconcile the wave total from that figure.

I detected this on my own (the file I read at 20:19 was not the file on disk at
20:22) and **stopped and re-read before writing** rather than editing the stale
snapshot from my context. Consequences, stated plainly:

1. **Hard Rule 14 (disjoint write-scopes) was violated by the two tasks as
   briefed, not by either agent's execution.** Both my brief and the sibling's
   name `apps/web/lib/db/pool.test.ts` as the file in scope. I could not know
   this from my own prompt. Escalated as OQ-1, not silently absorbed.
2. **I did not overwrite the sibling's work.** Every edit I made was additive and
   targeted at the post-sibling content; I re-read the file immediately before
   writing and edited against what was actually there.
3. **The sibling's 3 tests and the live-PG suite are intact and green** under my
   change — verified by name, not by count (8/8 listed individually below).
4. **My guard is not a duplicate of the sibling's**, and the difference is
   load-bearing. Their positive test observes the seam *through its effect* (it
   reads via `refillAllowance` and sees 1000). Mine counts the call and checks
   the argument's **identity**. Mutation M2 below is the proof this matters: a
   lookalike pool handed to the seam satisfies an effect-based test in some
   shapes but fails an identity check. The three tests I added and their
   coverage relationship to the existing suite are set out in "What Was Added".

## What Was Added

Three tests in one new `describe('refill-pool wiring call shape (guard)')` block
(`pool.test.ts:165-246`), plus a module-boundary mock of `@corvus/ai`
(`:25-33`). File goes 5 → 8 tests.

**The mechanism.** `@corvus/ai` is mocked with a spy that **delegates to the real
setter**:

```
const seamSpy = vi.hoisted(() => vi.fn());
vi.mock('@corvus/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@corvus/ai')>();
  seamSpy.mockImplementation((pool) => { actual.__setRefillPool(pool); });
  return { ...actual, __setRefillPool: seamSpy };
});
```

Delegation, not replacement, is what makes this safe: production behaviour is
unchanged for every other test in the file, so the sibling's effect-based guard
and the **live-Postgres 90-day boundary suite** still run against the real seam
and stay green (confirmed — the live test is executed, not skipped, and still
reads exactly 1000). Only the seam `getPool()` writes into is observed;
`getPool()` itself is the real function on the real module.

**Test 1 — `instruments the real seam (the mock actually intercepts pool.ts)`.**
Instrument validation, not a product claim: asserts the named import **is** the
spy. If `vi.mock` silently stops intercepting — a wrong specifier, a second copy
of `@corvus/ai` in the module graph — the identity fails and every count
assertion in the block is exposed as meaningless. **Mutation M4 below proves this
test works**, which is why I did not treat it as ceremony.

**Test 2 — `calls the refill seam exactly once per real-pool construction, with
that pool`.** The AC's core. Asserts `toHaveBeenCalledTimes(1)`; **identity**
against the cached pool (`toHaveBeenCalledTimes` plus `toBe(pool)` and
`toBe(getPool())`, which is what survives a lookalike); then calls `getPool()`
twice more and asserts the count is **still 1** (cached re-entry does not
re-wire — this is what makes "once per process" true rather than incidental);
then resets the holder and constructs again, asserting the count reaches **2**
with the new instance. That last step is deliberate: it proves the count tracks
*real construction* and is not a one-shot that would pass while broken.

**Test 3 — `does not call the refill seam on the unconfigured stand-in path
(KI-021)`.** Asserts `not.toHaveBeenCalled()` on the stand-in path, that
`refillAllowance` still reads 0, and then that a later `DATABASE_URL` in the
**same process** constructs a real pool which *is* wired (count 1, identity
checked). This pins the reviewer's F4/KI-021 property from the call side: the dead
stand-in must never become the seam, because `refillAllowance` swallows a
rejecting pool into `0` — silently zeroing a paying customer's refills for the
process's life.

## Acceptance Criteria — Evidence

| Criterion | Result | Proof |
|---|---|---|
| Permanent test proving `__setRefillPool` called exactly once per real-pool construction with the live pool; asserts stand-in path does NOT call it | **PASS** | Tests 2 and 3 above; call count + identity via `vi.mock` boundary spy. Live-pool identity is the constructed `Pool` instance itself, intercepted, no socket opened |
| Existing KI-021 tests untouched and still green | **PASS (against the sibling's baseline)** | Both `it()` bodies extracted and compared: **byte-identical to HEAD** (`it#0 identical: True`, `it#1 identical: True`). The sibling had already added one `__resetRefillPool()` cleanup line to that describe's `afterEach` before I opened the file; I made no change to it. I did **not** verify against the 59-line snapshot in my brief, because that snapshot no longer existed on disk |
| `npm run typecheck` (`tsc --noEmit`) exit 0 | **PASS** | exit 0, no output |
| `npx eslint lib/db/pool.test.ts --max-warnings 0` exit 0 | **PASS** | exit 0, clean |
| `npx prettier --check lib/db/pool.test.ts` clean | **PASS** | "All matched files use Prettier code style!" |
| Focused suite green | **PASS** | `npx vitest run lib/db/pool.test.ts` → **1 file, 8/8 passed** |
| Full web `npx vitest run` green, zero failures (record counts) | **PARTIAL — pre-existing unrelated failure** | Full run: **63 files, 926 passed / 1 failed (927)**. The single failure is `app/dashboard/bots/[id]/page.test.tsx`, which **does not import `pool`, `@corvus/ai`, or the refill seam** (grepped) and is heavily modified in the working tree by another task (`513 5` numstat). **Proven pre-existing, not caused by me:** I temporarily restored the pre-task baseline `pool.test.ts`, re-ran that file alone → **still 1 failed / 55 passed**, then restored my version. With it excluded: **62 files, 871/871 passed**. Recorded, not fixed — out of my write-scope |
| Guard is mutation-proven (break, watch red, restore, watch green) | **PASS — 3 mutations** | M1, M2, M3 below; each restored and re-verified green, `pool.ts` hash checked after each restore |
| No secrets, no live connections, no git restore/stash/checkout/reset, no commit | **PASS** | See SECURITY |

### Mutation proofs (each applied to `pool.ts`, run, then restored)

Backups were taken to `%TEMP%\corvus-poolguard` (**outside the repo**), and every
restore was confirmed by SHA-256 equality with
`0f4f6ca1…` plus `git diff --numstat` back to `15 0`. No git command that
restores from HEAD was used at any point.

| # | Mutation to `pool.ts` | What it simulates | Reading |
|---|---|---|---|
| **M1** | `__setRefillPool(pool);` → commented out | the wiring line deleted (the durability gap the reviewer's OQ-4 named) | **RED — 3 failed / 5 passed.** My count guard: `expected "vi.fn()" to be called 1 times, but got 0 times`. My stand-in-path test: same. The sibling's effect guard: `expected +0 to be 1000`. **Different assertions, same defect — detected independently by both.** Restored → 8/8, hash OK |
| **M2** | `__setRefillPool(pool);` → `__setRefillPool(new Pool({ connectionString: url }));` | the seam wired to a **lookalike**: right count, right shape, **wrong instance** — a second pool that is not the one every route reads | **RED — 3 failed / 5 passed.** Fails on *identity*: `expected BoundPool{…} to be BoundPool{…}` — and vitest prints **"Compared values have no visual difference."** That message is the finding: a shape-based assertion cannot see this defect. Restored → 8/8, hash OK |
| **M3** | `return unconfiguredPool();` → construct it, `__setRefillPool(standin);`, return it | the exact defect the reviewer rejected: the seam pinned to the **dead stand-in**, so `refillAllowance` reads 0 forever for a customer who paid | **RED — 1 failed / 7 passed.** Only **my** stand-in-path test fails: `expected "vi.fn()" to not be called at all, but actually been called 1 times`. **The three pre-existing tests all pass under M3** — including the sibling's stand-in pin, which asserts the *effect* (`refillAllowance` reads 0) and is therefore blind to it. This is the concrete evidence that my guard is not redundant. Restored → 8/8, hash OK |
| **M4** (test-side, not production) | `vi.mock('@corvus/ai')` → `vi.mock('@corvus/ai-EFFACED')` | the instrument silently stops intercepting (the failure mode the webwire report's probe 0 was created for) | **RED — 3 failed / 5 passed**, led by `instruments the real seam …`. Proves the instrument-validation test actually fires. Restored → 8/8, no `EFFACED` residue (grepped) |

M1–M3 are production mutations; M4 is the test-side **instrument** mutation. Per
the repo's scar-tissue rule, a guard is only a guard once broken and watched to
fail — and per the same rule, the *instrument* was broken too, because a
mislabelled-loud guard is the more expensive failure.

## OSS Basis (5-minute scan, cited)

Looked at how OSS Node/pg projects pin pool-construction side effects and
module-level state; built in-repo rather than imported (test-only change, no
dependency added):

1. **`prisma/prisma-next` — `.agents/rules/prefer-direct-imports-over-module-mocks.mdc`.**
   The most useful source, because it argues **against** the obvious approach. Its
   rule: prefer extracting a testable core over `vi.mock`/`vi.resetModules`; and
   "never mock our own runtime/class constructor" — a test that asserts "our
   factory called our constructor" proves nothing about behaviour. It names the
   legitimate exception: mock **the third-party boundary**, drive the real code,
   and assert **observable behaviour** ("which SQL was issued, which pool was
   closed"), not "the constructor was invoked". **Adopted and adapted:** I mock
   only the module the seam lives in, delegate to the real setter so all
   behaviour is preserved, drive the real `getPool()`, and assert the observable
   fact — *which pool object the seam was handed*, i.e. identity, which is the
   property that actually breaks in production. I did **not** mock `getPool()`
   or `Pool`. Where the rule says the answer is usually "factor the production
   code first" — I could not: `pool.ts` is reviewed PASS and byte-frozen by my
   brief, so a production refactor was out of scope; the delegation approach is
   the honest way to observe it without touching it.
2. **`brianonbased-dev/HoloScript` — `packages/adapter-postgres/src/__tests__/PostgresHoloAdapter.test.ts`.**
   A vitest suite that mocks the `pg` module with a `constructorSpy` and asserts
   `toHaveBeenCalledTimes(1)` for a singleton pool, plus `pool1).toBe(pool2)`.
   **Adopted:** the count-plus-identity pairing as the shape of the positive
   guard, and resetting singleton state in `beforeEach`
   (their `Pool.instance = undefined`; my `__resetPool()` +
   `seamSpy.mockClear()` in a `beforeEach` for exactly the same reason —
   cross-test state leakage into a call count). **Not copied:** they mock `pool`
   itself; I deliberately did not, because mocking the object under observation
   would make the test unable to catch M2 (a lookalike) or M3.
3. **`vitaly-t/pg-promise` discussion #851** (node-postgres ecosystem).
   A cautionary data point, not a pattern: the reporter hit "creating a duplicate
   database object for the same connection" precisely when module-level DB state
   and mocks interacted. Read as evidence that module-level singletons are a real
   footgun — which is *why* the guard is worth having permanently — and as a
   warning to keep the mocked surface as narrow as possible.

## Assumptions Made

- **The sibling's version of the file is the baseline, not the one in my brief.**
  My brief described a 2-test file; by the time I could write, it was a 5-test
  file with a live-PG suite. I treated the on-disk state as authoritative and
  built additively on it. Had I edited my in-context snapshot instead, I would
  have destroyed a peer's work (scar tissue: "a whole-tree git restore destroying
  another agent's unworked/uncommitted work").
- `importOriginal` inside a `vi.mock` factory resolves through the same module
  graph the test file uses, so delegating to `actual.__setRefillPool` is the
  genuine setter. This is *verified*, not assumed: M4 shows the identity
  assertion fails when interception stops, and M1–M3 show the production call is
  what the spy observes.
- `expect(__setRefillPool).toBe(seamSpy)` is a sound instrument check because
  vitest hoists `vi.mock` above the static imports, so the named import is bound
  to the mocked module. Verified from disk (`vitest/dist/index.d.ts:627-634`,
  vitest 5.0.0 resolved from `apps/web/node_modules`).
- Constructing `new Pool({ connectionString })` opens no socket (clients are
  created lazily on first `query`), so the guard stays hermetic and network-free
  with an unroutable fixture URL. Inherited from the file's own existing
  reasoning; the guard passes with the URL never dialed.
- `vi.fn()` records one call per invocation, so `toHaveBeenCalledTimes(1)` is a
  sound count of constructions in this seam's write path.

## Open Questions for Orchestrator

**OQ-1 (process defect — the harness, not the agent).** Two tasks in this wave
were handed the same file as their sole MODIFY scope: mine and
`2026-09-23-1410_poolguard_FIX_pool-guard.md`. This is Hard Rule 14
(disjoint write-scopes) violated at **spec** time. It did not corrupt anything
here only because I happened to detect the drift and re-read before writing — my
brief's snapshot was already stale by 3 writes when I started. **This is the
"the instruction is the bug" pattern from the scar tissue**: every agent
implemented its brief correctly and the wave was still one careless edit away
from losing a peer's uncommitted work. Recommend the orchestrator's decomposition
step assert write-scope disjointness mechanically across a wave's briefs (a
sorted-path collision check) before spawning — a checklist item does not enforce
it, a check does.

**OQ-2 (coverage relation — informational, no action).** The three wave guards on
this one line now layer as: the sibling's effect-based positive + stand-in pin
(hermetic), the sibling's live-PG 90-day boundary, and my call-shape guard
(count + identity + stand-in call-side). M3 is the evidence the layers are not
redundant — the stand-in wiring defect is invisible to the effect-based pin and
visible only to the call-shape test. Worth recording in the wave closeout so a
future reviewer does not collapse them into "3 tests of the same thing".

**OQ-3 (pre-existing failure, recorded not fixed).**
`app/dashboard/bots/[id]/page.test.tsx` fails 1 case (`findByRole('list', { name:
'Submitted …' })` timing out) in this working tree, standalone and in the full
run, **with and without** my change — proven by re-running it against the
pre-task baseline `pool.test.ts`. That file carries `513 5` of another task's
uncommitted work. Outside my write-scope; needs an owner.

**OQ-4 (inherited, still open).** The webwire reviewer's OQ-3 / sibling's
limitation: there is no test that the credits-display SQL string
(`apps/web/app/api/credits/route.ts`) is *textually identical* to
`REFILL_CREDITS_SQL` — the duplication is intentional and asserted by comment
only, so a one-sided edit would silently desynchronise the gate from the
customer-visible balance. Out of this task's scope (it is a production change).

## Public Interface Exposed

No production interface changed — no production file was touched. Test-only
additions inside `apps/web/lib/db/pool.test.ts`:

- `const seamSpy` (module scope, `vi.hoisted`) — the delegating spy on the
  `@corvus/ai` seam setter.
- `vi.mock('@corvus/ai', …)` factory — spreads `actual` and overrides only
  `__setRefillPool`.
- New `describe('refill-pool wiring call shape (guard)')` with 3 cases.
- Import line broadened from `{ afterEach, describe, expect, it }` to
  `{ afterEach, beforeEach, describe, expect, it, vi }` (the beforeEach is scoped
  to my describe block; the file's other blocks are unaffected).

`apps/web/lib/db/pool.ts` surface unchanged: `TEST_DATABASE_URL`,
`DatabaseNotConfiguredError`, `requireDatabaseUrl`, `getPool`, `__setPool`,
`__resetPool`, and the `mapDbError`/`DbErrorResponse` re-exports all keep their
exact signatures.

## Known Limitations

- **No live-Postgres proof of the call-shape guard, by design** — it is hermetic
  and opens no socket. The live-PG leg of the 90-day promise is the sibling
  test's, and it still runs and passes under my mock (executed, not skipped).
- **No booted server / real HTTP request.** Verification is vitest suites plus
  source-level mutation on the real module. The production-bundling identity
  proof (Next handing every route one `@corvus/ai` instance) remains the webwire
  report's compiled-artifact evidence, which I did not re-derive — this guard
  proves the call happens once per construction in the module, not that Next
  shares the instance across routes.
- **The `beforeEach` insertion is inside my `describe` block only.** I did not
  add a file-level `beforeEach` (that would have been a broader edit to a peer's
  in-flight file), so `seamSpy` call state is cleared only for my block. My three
  tests clear it explicitly; this is why test 1 and test 3 do not depend on
  ordering.
- **`apps/gateway` was not run** (not in scope, its wiring is `start.ts:456`).
  `apps/web` full suite was run.
- **One unrelated pre-existing failure** in the full web suite (OQ-3), proven
  pre-existing by baseline re-run, not fixed.
- **The file carries a peer's 165 insertions.** `git diff --numstat` `272 2` is
  therefore *not* this task's diff; my measured contribution is 107 insertions /
  1 deletion (sibling baseline reconstructed byte-exactly, see "Files Touched").
  Anyone auditing by numstat alone should read the "Concurrent writer" section
  first.
- Per the task budget: no repo-wide lint/format run outside the web workspace.

## Verification Commands (exact, all from `apps/web` unless noted)

| # | Command | Result |
|---|---|---|
| 1 | `npx vitest run lib/db/pool.test.ts --reporter=verbose` | **1 file, 8/8 passed** — all 8 named individually; the live-PG boundary case **executed** (156–169 ms), not skipped |
| 2 | `npx vitest run` (full web) | **63 files, 926 passed / 1 failed (927)** — the 1 failure is the unrelated `bots/[id]/page.test.tsx` (OQ-3) |
| 3 | `npx vitest run --exclude "app/dashboard/bots/[id]/page.test.tsx"` | **62 files, 871/871 passed** |
| 4 | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` (my change present) | 1 failed / 55 passed |
| 5 | same, with pre-task baseline `pool.test.ts` restored (then my version re-restored, hash-verified) | **1 failed / 55 passed — identical. Proves pre-existing** |
| 6 | `npx vitest run app/api/chat/route.test.ts app/api/builder/verdict/route.test.ts` | **2 files, 65/65 passed** (adjacent `checkBudget` call sites unaffected) |
| 7 | `npm run typecheck` (`tsc --noEmit`) | exit 0, no output |
| 8 | `npx eslint lib/db/pool.test.ts --max-warnings 0` | exit 0, clean |
| 9 | `npx prettier --check lib/db/pool.test.ts` | "All matched files use Prettier code style!" |
| 10 | **M1** (wiring commented out) | **3 failed / 5 passed**; restored → 8/8 |
| 11 | **M2** (wired a lookalike `new Pool(...)`) | **3 failed / 5 passed** on identity — "Compared values have no visual difference"; restored → 8/8 |
| 12 | **M3** (wired the stand-in) | **1 failed / 7 passed** — only my test; the 3 pre-existing tests pass; restored → 8/8 |
| 13 | **M4** (`vi.mock` specifier effaced) | **3 failed / 5 passed**; restored → 8/8, no residue |
| 14 | `sha256sum apps/web/lib/db/pool.ts` after **every** restore | `0f4f6ca1405817917684e4d20cb550dcd530659d8aceb04b09774d0bbff123bf` — all four times |
| 15 | `git diff --numstat -- apps/web/lib/db/pool.ts` | `15 0` — the reviewed wiring untouched |
| 16 | `git diff -U0 -- apps/web/lib/db/pool.test.ts \| grep "^-"` | exactly 2 lines, both import lines — no test content deleted |
| 17 | KI-021 `it()` bodies vs `git show HEAD:` | both **byte-identical** (extracted and compared programmatically) |
| 18 | sibling baseline reconstructed and hashed in `%TEMP%` | **223 lines, SHA-256 `c8c9ddbf…` — matches the hash of the file on disk when I began editing.** Delta vs it: **+107 / −1**. This is how the split figure above was measured rather than guessed |
| 19 | `diff -u <sibling baseline> <final>` deleted-line list | 1 line, the vitest import — no test content removed from the peer's work |

## SECURITY

Production box, Contabo, GHCR and live keys were never touched. No SSH, no box
`.env`, no registry push, no deploy. No `package.json` / lockfile / `.env` /
config edit, no install, **no `git stash` / `checkout` / `restore` / `reset`**,
no commit, no push. The only `git` invocations were read-only (`diff`,
`show`, `status`, `log`, `ls-files`). All production mutations were applied with
`sed`/`python` and restored from copies held **outside the repo**
(`%TEMP%\corvus-poolguard`), each restore verified by SHA-256; that directory has
been deleted and `git status` confirms no stray `.orig`/`.bak`. No secret value
was read, printed, copied or transmitted — connection strings used are the repo's
own checked-in CI fixture literals
(`postgresql://corvus:corvus_ci@127.0.0.1:5434/corvus_ci`, declared in
`pool.ts:13`), and no credential appears in this report. My three added tests
open **no** socket and dial **no** connection: the live-PG leg belongs to the
sibling's pre-existing test, which I ran but did not author. No live Discord, no
HTTP.
