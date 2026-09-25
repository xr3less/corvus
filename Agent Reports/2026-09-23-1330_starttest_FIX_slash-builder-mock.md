# Task Report: starttest-slash-builder-mock

## Status
**SUCCESS** — collection failure fixed; full merged-tree gates green. Two additional members of the same defect class were found and closed in the same file; one concurrent-writer hazard is documented below and needs orchestrator awareness.

## Files Touched
- CREATED: `Agent Reports/2026-09-23-1330_starttest_FIX_slash-builder-mock.md` (this file)
- MODIFIED: `apps/gateway/src/start.test.ts` (only source file touched — test-only)
- DELETED: none

**PROD SOURCE UNCHANGED — verified, not asserted.** No edit to `deploy-commands.ts` (untracked, read-only), `runtime/moderation/index.ts`, `start.ts`, `deploy/worker.ts`, or any runtime file. Evidence: mtimes for `deploy-commands.ts` (11:30:27) and `runtime/moderation/index.ts` (10:28:10) both **pre-date this task's start (~13:18)**; `grep` for my test-mock identifiers (`importOriginal`, `vi.mock`) inside `start.ts` returns **NONE**. My only write target was `apps/gateway/src/start.test.ts`.

## Dependencies Added
- None. No manifest/lockfile/env edit, no install. (`package-lock.json` shows as modified in `git status` — mtime **2026-09-20 11:09**, three days before this task; it is a pre-existing `apps/testbot` workspace entry, **not mine**.)

## Assumptions Made
- The two whitelisted reports were the only reports read; no directory scan.
- The concurrent-writer situation below was treated as **out of my authority to resolve** for `start.ts`, but **inside** my authority for `start.test.ts`, since that file is my only declared write scope and the fix class is identical. I did not edit `start.ts` or revert anyone's work; I made my file tolerate the real `boot()` surface.
- "Full gateway suite green" is judged on the **settled** tree (see Concurrency section) — I re-ran after the writer stopped moving and reported the final state, not an intermediate one.

## Open Questions for Orchestrator
1. **CONCURRENT WRITER ON `start.ts` — please confirm intent.** During this task `apps/gateway/src/start.ts` was rewritten by another actor while I worked: mtime advanced 13:28:32 → 13:28:52 → 13:30:42 → 13:31:02 → 13:31:15, and the content changed meaningfully (an E4d sweeper seam appeared: `import { startSweeper }` at `:45`, `const sweeper = startSweeper(pool, gateway, logger)` at `:564`, `gateway.attachSweeper(sweeper)` at `:565`). Two intermediate full-suite runs failed for this reason and are **not** attributable to my change or to the pre-existing F1. The writer appears to have settled (hash `7516cdb8ba08ae04` stable across a 30s and a further 90s+ interval), and I verified against that settled content. **If a sweeper wave is still active, my `attachSweeper`/`startSweeper` additions may collide with its own `start.test.ts` changes** — worth a deconfliction check.
2. **F1 from the landfix review is now CLOSED** (the collection failure). It was routed to "whoever owns the moderation / `bot_runtime_config` wave" — in practice it was a `start.test.ts` mock gap, fixed here.
3. **`startSyncCommandsWorker` was an unmasked second defect** (details below). It predates this task and is fixed here; no further action needed, but it indicates the same class may lurk wherever `boot()`'s dependency surface grows without a matching mock update.

---

## 1. THE ASSIGNED FIX

### Root cause (reproduced from disk, not memory)
`apps/gateway/src/start.test.ts` died at **collection** (0 tests collected) with:
`[vitest] No "SlashCommandBuilder" export is defined on the "discord.js" mock`

Chain, confirmed by reading each hop: `start.ts:37` imports `./deploy/worker.js` → `deploy/worker.ts:19` imports `./deploy-commands.js` → `deploy-commands.ts:15` imports `./runtime/feature-modules.js` → `feature-modules.ts:18-26` calls `buildModerationModule()` **at module scope** → `runtime/moderation/index.ts:586` executes `new SlashCommandBuilder()`. The old mock returned only `Client` / `GatewayIntentBits` / `Events` / `Partials`, so that constructor was `undefined`.

### Fix applied
Converted the bare stub to a **partial mock** using the `importOriginal` idiom already used in the repo at `src/deploy/worker.test.ts:64-83`:
```
vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  ...
  return { ...actual, Client: FakeClient, GatewayIntentBits, Events, Partials };
});
```
`Client` / `GatewayIntentBits` / `Events` / `Partials` are still overridden exactly as before, so **all pre-existing mock behaviour is preserved** — `Client` is still the `EventEmitter`-backed fake the bot-lifecycle suite drives, and the `Events` values still mirror discord.js 14.27.0 (`ClientReady === 'clientReady'`).

**HONEST CAVEAT — I tested whether the passthrough is load-bearing and it is now partly redundant.** With `deploy/worker.js` mocked (see §2), the bare stub *also* passes, because that mock severs the very import path that reached `deploy-commands.ts`. I verified this by temporarily reverting to the bare stub and running the suite: **24/24 passed**. The passthrough therefore protects the rest of the import graph (any module that dereferences a real discord.js export at load, e.g. `loaders.ts:9` `Events`, `dispatcher.ts:12` `MessageFlags`) rather than being the single thing that fixes this failure. I kept it because it is correct, matches the sibling suite's idiom, and is strictly more robust than a stub — but the report should not claim it alone is the fix.

## 2. SECOND MEMBER OF THE SAME CLASS (found, fixed)

With collection fixed, the suite ran for the first time and **12 tests failed** on `password authentication failed for user "corvus"`, traced to `src/deploy/worker.ts:100` (`boss.start()`) via `startSyncCommandsWorker`.

Cause: `start.ts:517` calls `await startSyncCommandsWorker(databaseUrl)` — added by an earlier wave (`HEAD:start.ts` contains **0** occurrences of `SyncCommands`; the working tree has it at `:37/:515/:517/:572/:593`). Every other `boot()` dependency had a mock; this one did not, so boot tests opened a **real pg-boss connection**.

**Correction to my own earlier reading (instrument validation):** I first believed the failure depended on the ambient `DATABASE_URL`. It does not. `boot()` reads the env only to *validate* it (`requireDatabaseUrl`) and the tests pass `DB_URL` explicitly; the pg-boss client then dials a real server regardless. The decisive experiment: with `DATABASE_URL` **unset**, the suite passes **24/24** — proving the worker mock, not the environment, is what fixes it.

Fix: added the missing mock, mirroring the existing `startBuilderWorker` pattern.
- `mocks.startSyncCommandsWorker` added to the `vi.hoisted` block
- `vi.mock('./deploy/worker.js', …)` added beside the sibling worker mocks
- default healthy handle in `beforeEach`, so no boot test opens a real connection

## 3. THIRD MEMBER — SWEEPER SEAM (concurrent writer, absorbed)

After the above, the concurrent `start.ts` writer landed `startSweeper` + `gateway.attachSweeper(sweeper)`, and 12 tests again failed — this time `gateway.attachSweeper is not a function`, because the fake gateway was `{ shutdown }` only.

Fix in my file (no change to `start.ts`):
- `vi.mock('./runtime/sweeper.js', …)` so boot stays timer-free and DB-free
- `makeSweeperHandle()` matching the real `SweeperHandle` contract at `runtime/sweeper.ts:155-159` (`stop(): void` — **sync**, not async; `sweepNow(): Promise<SweepDecisions>`)
- `makeGateway()` now returns `attachSweeper: vi.fn()` alongside `shutdown`, documented as part of the `Gateway` surface `boot()` calls (`gateway.ts:174`)

**HONEST CAVEAT:** I tested necessity by removing the sweeper mock while keeping `attachSweeper`. The suite **still passed 24/24** — because the mocked pool rejects every query (the sweeper logs `sweeper-read-failed` and returns empty) and the interval is `unref()`'d (`sweeper.ts:224-227`), so it neither hangs nor fails the run. The sweeper mock is therefore **hygiene** (no real timers left running, no reliance on an error path) rather than strictly required. The `attachSweeper` addition *is* required.

---

## 4. CONCURRENCY HAZARD (needs orchestrator awareness)

`start.ts` moved under me **during** this task. Two full-suite runs produced failures that were **neither mine nor pre-existing** — they were snapshots of another writer mid-edit:
- one run showed `startSweeper` imported but unused (root `npm run lint` exited 1 with 2 `no-unused-vars` errors at `start.ts:45`)
- the same file minutes later called it at `:564`

I did **not** touch `start.ts`, did not revert, and did not chase the moving target. I confirmed the writer had settled (hash stable over multiple intervals), then ran all final gates against the settled content. Final root gates were run **after** the last observed write.

## 5. GATES — real project commands, detected not assumed

Toolchain read from disk: npm workspaces (`apps/*`, `packages/*`); gateway `typecheck` = `tsc --noEmit`, `test` = `vitest run` (vitest **3.2.7**); root `lint` = `eslint . --max-warnings 0`. `node_modules` present at root and `apps/gateway` — no stop-and-escalate condition. discord.js version **14.27.0 read from `node_modules/discord.js/package.json`**, not memory.

| Gate | Command | Result |
|---|---|---|
| Collection (the assigned failure) | `npx vitest run src/start.test.ts` | **24/24 collect and pass** (was: 0 collected) |
| Full gateway suite | `npx vitest run` (in `apps/gateway`) | **464/464 pass, 35/35 files** |
| Root test gate (all workspaces) | `npm test` | **exit 0** — gateway 464/464, ai 103/103, web 885/885, spec 144/144, testbot 56/56 |
| Root typecheck | `npm run typecheck` | **exit 0** |
| Root lint | `npm run lint` | **exit 0** |
| Lint (touched file) | `npx eslint apps/gateway/src/start.test.ts --max-warnings 0` | **exit 0**, zero warnings |
| Format (touched file) | `npx prettier --check …` | **pass** |
| Gateway typecheck | `npx tsc --noEmit -p apps/gateway/tsconfig.json` | **exit 0** |

**Typecheck instrument note:** a first gateway typecheck failed with `src/start.ts(21,10): error TS2305: Module '"@corvus/ai"' has no exported member '__setRefillPool'`. That is a **stale gitignored build artifact**, not a code defect: `@corvus/ai/dist` (gitignored, `.gitignore:2`) predated `src/budget.ts`, which *does* export it (`packages/ai/src/budget.ts:72`, re-exported by `src/index.ts:11`). CI builds that package before typechecking (`ci.yml:41-42`); I did the same (`npm run build --workspace @corvus/ai`) and typecheck then passed **exit 0**. Reported so the orchestrator does not mistake it for a regression.

### Negation check (the CI symptom is actually gone)
`grep -c 'SlashCommandBuilder.*export is defined'` over the full root test log → **0 occurrences**. The failure does not merely pass; it is absent.

## 6. QUALITY

- **Secrets:** no secret added or read. Secret-shaped scan over `git diff` added lines → **NONE**. The only credential-shaped literal, `supersecret` in `DB_URL`, is a **pre-existing test constant** (5 occurrences at HEAD) used precisely to assert it is never logged.
- **Scope:** `apps/gateway/src/start.test.ts` is the sole file I modified. `deploy-commands.ts` and `runtime/moderation/index.ts` read-only; both mtimes pre-date task start. `start.ts` never edited by me (grep for my identifiers inside it → NONE), despite being concurrently rewritten by another actor.
- **No manifest/env/lockfile edits, no installs.** `package-lock.json`'s modification pre-dates this task (mtime 2026-09-20) and is a different change.
- **No git restore / commit / add.** Only read-only `git diff` / `git show` / `git status` / `git check-ignore`. Nothing staged — `deploy-commands.ts` left untracked as instructed.
- **No production contact.** No SSH, no Contabo, no GHCR, no live keys. All verification local.
- **No residue.** Temp backup files were kept **outside the repo** (`/tmp`) and deleted; `.final.txt` / `.roottest.txt` logs created for exit-code capture were deleted; `git status` scan for `probe|tmp|bak|good` → NONE.

## 7. WHAT I DID NOT DO (method disclosure)

Two of my three sub-fixes were **not** validated as strictly necessary by the revert test — the discord.js passthrough and the sweeper mock both turned out to be non-load-bearing once the worker mock was in place. I ran that experiment rather than assuming, and I have reported the results against my own fix (LESSONS §1.1: act on a measurement only after validating the instrument; and §1.2: a guard is not a guard until you break the thing and watch it fail). The `startSyncCommandsWorker` mock and the `attachSweeper` fake **are** load-bearing — both were observed failing before and passing after.

## Public Interface Exposed
- No production interface changed. Test-only file.
- Test-local additions: `mocks.startSyncCommandsWorker`, `mocks.startSweeper`; `makeSweeperHandle()`; `makeGateway()` now also returns `attachSweeper`.
- Contracts this task pins as verified against on-disk source:
  - `SweeperHandle` = `{ stop(): void; sweepNow(): Promise<SweepDecisions> }` — `stop()` is **sync** (`runtime/sweeper.ts:155-159`)
  - `Gateway.attachSweeper(handle: { stop(): void }): void` — `gateway.ts:174`
  - `boot()` dependency surface = `createGateway`, `createSupervisor`, `startPreflightWorker`, `startBuilderWorker`, `startSyncCommandsWorker`, `startSweeper`, `attachBotModules`, `pg.Pool`

## Known Limitations
- **I did not run the app / a browser.** This is a test-harness fix; the exercised artefact is the test suite itself, plus the real `boot()` import graph (which is what collected, and what the tests drive). No UI or HTTP surface is involved. I make no claim about gateway runtime behaviour in production.
- **Not validated on a clean CI checkout.** Verified on this merged working tree. Notably, `deploy-commands.ts` and `0011/0012/0013` remain **untracked**, so a CI checkout does not contain them — the collection failure I fixed will not even reproduce in CI until they are committed (inspector finding #8, still open). Locally the tree is green either way.
- **The two non-load-bearing fixes are retained on judgement, not necessity** (§1, §3). If the orchestrator prefers a minimal diff, the passthrough and the sweeper mock could be dropped without failing the suite today — I would not, because both guard the import graph and timer hygiene rather than the current symptom.
- **Concurrency:** my conclusions hold for `start.ts` hash `7516cdb8ba08ae04`. If that file moves again, the `attachSweeper`/`startSweeper` expectations may need re-checking.
