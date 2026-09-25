# Task Report: reviewer-starttest-wave

## Status
**PASS** — the assigned failure is fixed, the suite collects and passes, and no test opens a live
pg-boss or Discord connection. Three findings, all **inert today** (none flips a verdict): two mock
literals that do not mirror the installed package (F1, F2), and a **scope correction** to the CI-health
statement (F3) — the reproducibility gap is far wider than `deploy-commands.ts` alone.

I fixed nothing. Read-only on all source. I modified no file except this report.

---

## 1. DOES IT WORK — real commands, exits, counts

Toolchain detected from disk, not assumed: npm workspaces (`apps/*`, `packages/*`), single
`package-lock.json`; gateway `typecheck` = `tsc --noEmit`, `test` = `vitest run` (**3.2.7** read from
`node_modules/vitest/package.json`); root `lint` = `eslint . --max-warnings 0`. `discord.js`
**14.27.0** read from `node_modules/discord.js/package.json`. `node_modules` present at root and in
`apps/gateway` — no stop-and-escalate condition.

| Gate | Command | Result |
|---|---|---|
| **Reviewed suite** | `npx vitest run src/start.test.ts` (cwd `apps/gateway`) | **exit 0 — 24/24 pass, 1 file collected** (was: collection failure) |
| **Full gateway suite** | `npx vitest run` (cwd `apps/gateway`) | **exit 0 — 464/464 pass, 35/35 files** |
| Negation check | full-suite log, grep `is defined on the "discord.js" mock` | **0 occurrences** — absent, not merely passing |
| Typecheck (gateway) | `npx tsc --noEmit -p apps/gateway/tsconfig.json` | **exit 0** |
| Typecheck (root) | `npm run typecheck` | **exit 0** (all 5 workspaces) |
| Lint (touched file) | `npx eslint apps/gateway/src/start.test.ts --max-warnings 0` | **exit 0**, zero warnings |
| Lint (root) | `npm run lint` | **exit 0** |
| Format (touched file) | `npx prettier --check apps/gateway/src/start.test.ts` | **pass** |
| Isolation x3 | `npx vitest run src/start.test.ts --sequence.shuffle` ×3 | **exit 0 each** — no order dependence |
| Instrument: no ambient DB | suite with `DATABASE_URL` unset | **24/24 pass** — confirms no boot test needs a real connection |

**Artifacts verified on disk, not taken from the summary.**
- Report file exists: `Agent Reports/2026-09-23-1330_starttest_FIX_slash-builder-mock.md` (14,656 bytes).
- Claimed mock changes are really on disk: `vi.mock` targets found at `start.test.ts:36,38,45,49,54,58,65,69,106`; `startSyncCommandsWorker` in the `vi.hoisted` block at `:22`; `startSweeper` at `:23`; `makeSweeperHandle()` at `:161-169`; `makeGateway()` returns `attachSweeper` at `:155`.
- Diff vs HEAD is the claimed shape: `1 file changed, 306 insertions(+), 9 deletions(-)`, and **every** deletion is confined to the old discord.js stub and the old one-line `makeGateway` (verified by reading the deletion set).

**Instrument validated before trusting the green** (LESSONS §1.1): the loud-skip leg was tested with a
deliberately dead URL —
`DATABASE_URL="postgresql://corvus:x@127.0.0.1:9/corvus_nope" npx vitest run src/start.test.ts` →
printed `[start] SKIP: no Postgres reachable…`, reported **23 passed | 1 skipped**, exit 0. So the leg
is genuinely conditional, not a silently-green always-pass.

---

## 2. DOES IT MATCH

**Collection failure is gone.** The report's chain reproduces hop-for-hop from disk:
`start.ts:38` → `deploy/worker.ts:19` (`import { syncGuildCommands } from '../deploy-commands.js'`) →
`deploy-commands.ts:16` (`FEATURE_MODULES`) → `runtime/feature-modules.ts:18-26` (module-scope
`buildModerationModule()`) → `runtime/moderation/index.ts:586` (`new SlashCommandBuilder()`). The old
stub returned no such export; the fix passes the real module through.

**No live pg-boss / Discord connections.** `pg-boss` is imported by exactly four gateway modules
(`db/builder-runs.ts`, `deploy/worker.ts`, `preflight/redblock.ts`, `preflight/worker.ts`). The three
reachable from `start.ts` are all mocked (`:49`, `:54`, `:58`); `redblock` has **no importer** from
`start.ts`. `deploy/worker.ts:100` (`await boss.start()`) is therefore never reached. The discord.js
mock's `FakeClient.login` is a `vi.fn` no-op (`:111`) — no socket. The `pg` mock's `query()` rejects
unconditionally (`:79-81`).

*Distinction worth recording:* the file **does** contain one deliberately-live leg —
`supervisor audit write (real Postgres)` (`:783`), which uses `vi.importActual('pg')` and loud-skips.
It is **pre-existing at HEAD** (verified: `git show HEAD:…` contains it and `FALLBACK_DB_URL`), it is a
drizzle insert, **not** a pg-boss or Discord connection, and its skip is loud (L-009). It is outside
the "no live connections" claim's scope, and correctly so.

**Overrides.** `GatewayIntentBits: { Guilds: 1 }` is byte-identical to HEAD. All **8** `Events` values
in the map (`:126-135`) were compared against the installed package and **match exactly** —
`ClientReady='clientReady'`, `GuildMemberAdd`, `GuildMemberRemove`, `MessageCreate`, `MessageDelete`,
`MessageUpdate`, `MessageReactionAdd`, `InteractionCreate`. `Client` legitimately changed from
`class Client {}` to an `EventEmitter`-backed fake; the new bot-lifecycle tests assert
`listenerCount('clientReady')` semantics, which the old empty class cannot express. I re-ran the
`EventEmitter` semantics the suite depends on out-of-band and they hold.

See **F1/F2** for two members of the same literal that do *not* match.

---

## 3. DECONFLICTION — the reviewed file vs the CURRENT `start.ts`

**Consistent. No defect.** Verified, not assumed:

- `start.ts` hash is **`7516cdb8ba08ae04`** (sha256, truncated 16) — **exactly** the hash the builder
  pinned its conclusions to. The file has not moved since that claim.
- Every `boot()` dependency the current `start.ts` touches is covered: `createGateway` (`:497`),
  `createSupervisor` (`:478`), `startPreflightWorker` (`:506`), `startBuilderWorker` (`:520`),
  `startSyncCommandsWorker` (`:533`), `startSweeper` (`:564`), `gateway.attachSweeper` (`:565`),
  `pg.Pool` (`:439`). Each has a matching `vi.mock` or fake — confirmed by checking every `from './…'`
  specifier in `start.ts` against the mock targets (all 7 exact-match, none missing).
- Contracts the fakes pin match the real source: `SweeperHandle` = `{ stop(): void; sweepNow(): Promise<SweepDecisions> }` with **sync** `stop()` (`runtime/sweeper.ts:155-159`, `:232-237` — `clearInterval`, no promise); `Gateway.attachSweeper(handle: { stop(): void }): void` (`gateway.ts:174`); `SweepDecisions` = `{ sleep: string[]; wake: string[] }` (`sweeper.ts:55-58`), which `makeSweeperHandle()` returns as `{ sleep: [], wake: [] }`.
- The builder's "I did not touch `start.ts`" claim holds: `git diff -- start.ts` contains **0**
  occurrences of `importOriginal`, `vi.mock`, or `start.test`.

The concurrent-writer hazard the builder escalated is **real and now settled** — I confirm `start.ts`
was rewritten by another actor inside the task window (mtime `13:31:15`), and that the reviewed test
file (`mtime 13:44:35`) was written *after* it settled. That ordering is the good case, and the hash
match proves it.

---

## 4. CI-HEALTH SCOPE — finding #8 is wider than stated

`apps/gateway/src/deploy-commands.ts` is **still untracked** (`??`), so the fix cannot reproduce in CI
until it is committed. That stands on its own.

**But the blocker is materially larger than `deploy-commands.ts`.** Measured on disk:

- `git ls-tree -r HEAD -- apps/gateway/src/runtime/` → **0 files**; `… -- apps/gateway/src/deploy/` → **0 files**. Neither directory exists in the commit tree at all.
- `git status` reports **40 untracked files** under `apps/gateway/src`, including the entire `runtime/` and `deploy/` trees and `deploy-commands.ts`.
- Meanwhile **tracked** `start.ts` (modified in the working tree) imports from both: `./deploy/worker.js` (`:38`), `./runtime/translator.js` (`:41`), `./runtime/boot-modules.js` (`:43`), `./runtime/loaders.js` (`:44`), `./runtime/sweeper.js` (`:45`), `./runtime/config.js` (`:46`). HEAD's `start.ts` imports **none** of them (verified: 0 matches).
- Also untracked, and depended on by committed tests: `deploy/worker.test.ts` (the `importOriginal` idiom source this fix mirrors), and `drizzle/0011/0012/0013` (inspector finding #8's original half).

**Plainly:** the fix is correct locally and unverifiable in CI by construction. Committing
`deploy-commands.ts` alone does **not** close it — the whole `runtime/` + `deploy/` set plus the three
migrations must land together, or CI will test a tree that cannot even resolve the imports the tracked
`start.ts` and `start.test.ts` reference. Locally the tree is green; CI is not making the same claim.

---

## 5. QUALITY

- **Secrets:** none added or read. Secret-shaped scan over `git diff` added lines → **empty**. The only credential-shaped literal is the pre-existing `DB_URL` constant, whose `supersecret` count is **5 at HEAD and 5 now** — unchanged, and used precisely to assert it is never logged.
- **No manifest/env edits, no installs:** `package.json` mtime 09-15, `package-lock.json` 09-20, `.env.example` 09-21, `apps/gateway/package.json` 09-15 — all pre-date the task window (~13:18). No `npm install` run.
- **No git mutation:** `git log --since 13:00` → empty (no commits). Index state for the reviewed file is ` M` (unstaged-modified); `deploy-commands.ts` remains `??` — **nothing was staged**, as instructed.
- **No production contact:** all verification local. No SSH, no Contabo, no GHCR, no live keys.
- **Scope:** the builder declared one write target and honoured it. `runtime/moderation/index.ts` mtime `10:28:10` and `deploy-commands.ts` `11:30:27` both pre-date the task start — read-only, untouched. `git diff` on `start.ts` shows no test-mock identifiers.
- **No residue in the repo:** root scan for `.final`/`roottest`/`probe`/`.bak`/`~` → none. (Pre-existing `/tmp` backups for *other* waves — `chat-route*` 07:36-08:05, `detail.bak` 09-19 — are unrelated to this task and not attributable to it; they are outside the repo.)
- **No focused/disabled tests:** the sole `.skip` in the file is the deliberate `ctx.skip()` in the loud-skip leg (`:804`). No `.only`.

---

## Findings

### F1 — `Partials.GuildMember` is set to the wrong enum value (inert today, latent)
`apps/gateway/src/start.test.ts:136` — `Partials: { GuildMember: 1 },`

The installed `discord.js` 14.27.0 defines `Partials.GuildMember === 2`; `1` is `Partials.Channel`
(read from the installed package: `{User:0, Channel:1, GuildMember:2, Message:3, …}`). Because
`Partials` is spread-then-overridden, the override *replaces* the real enum entirely, so the production
line `start.ts:197` (`partials: [Partials.GuildMember]`) receives `[1]` in-test where production sends
`[2]`.

The comment immediately above (`:130-135`) asserts the values "must match the installed discord.js
14.27.0 exactly". For `Partials` that claim is false. The `1` looks like a copy of the
`GatewayIntentBits: { Guilds: 1 }` line directly above it.

**Inert today** — no test asserts on partials, and `FakeClient` ignores constructor options, so no
verdict changes. It becomes a real defect the moment anyone asserts on the constructed options or the
fake starts honouring them. Same class as the defect this task fixed: a mock literal that does not
mirror the real surface.

### F2 — `Events` map omits `GuildCreate`, which `start.ts:225` reads (inert today, latent)
`apps/gateway/src/start.test.ts:126-135` lists 8 events. The installed package has
`Events.GuildCreate === 'guildCreate'`, and the current `start.ts` arms a listener with it:

`start.ts:225` — `client.once(Events.GuildCreate, (guild) => {`

In-test `Events.GuildCreate` is `undefined`, so that arm registers under the literal key `"undefined"`.
I reproduced this out-of-band against `node:events`: `once(undefined, fn)` does **not** throw — it
silently stores under `'undefined'` (`listenerCount('undefined') === 1`, `listenerCount('guildCreate') === 0`).
No test emits `guildCreate` (grep over the suite → none), so nothing fails.

Notably, `loaders.ts:23-28` needs 7 event names and all 7 are present — `GuildCreate` is the *single*
omission, and it is precisely the one the join edge the parent wave added actually uses. **Inert
today**; it silently mis-arms a production listener the moment a test emits the join event.

### F3 — CI reproducibility gap is the whole untracked runtime/deploy tree, not one file
See §4. `deploy-commands.ts` untracked **and** `runtime/` + `deploy/` absent from HEAD entirely
(40 untracked files), while tracked `start.ts` imports from both. Routing this as "commit
`deploy-commands.ts`" would under-scope it.

### Verified-necessary mock additions (no finding — recorded for the record)
The builder's own honest caveat is **independently confirmed**: the discord.js `importOriginal`
passthrough and the `runtime/sweeper.js` mock are **not load-bearing** for the green suite; the
`startSyncCommandsWorker` mock and the `attachSweeper` fake **are**. I re-ran with `DATABASE_URL`
unset (24/24) which corroborates the report's decisive experiment that the *worker mock*, not the
ambient environment, is what stops the real pg-boss connection. Keeping a strictly-more-robust
passthrough and timer hygiene is a defensible judgement call, honestly disclosed — I do not treat it
as a defect.

---

## Files Touched
- CREATED: `Agent Reports/2026-09-23-1345_reviewer_REVIEW_starttest-wave.md` (this file)
- MODIFIED: none — read-only review; no source, manifest, env, or config file was changed
- DELETED: none

## Dependencies Added
- None. No install, no manifest/lockfile/env edit.

## Assumptions Made
- The three whitelisted reports were the only reports read (I read the two non-builder ones only at the cited findings: #8/#9 in the inspect-docs-ci review, and F1 in the landfix review). No directory scan.
- "No live connections" is scoped to pg-boss and Discord, per the brief. The pre-existing, loud-skipping real-Postgres drizzle leg is treated as deliberately out of that scope, and I say so explicitly rather than counting it as a pass.
- "Overrides preserved exactly" is read as: the pre-existing `GatewayIntentBits`/`Client` overrides survive, and added `Events` values are value-accurate. `Client` intentionally changed shape to serve the new listener-count assertions; I treat that as in-scope justification, not a violation.
- I did not stage, commit, or restore anything; `deploy-commands.ts` was read only and left untracked.

## Open Questions for Orchestrator
1. **F3 (highest value):** the commit plan for CI reproducibility. Committing `deploy-commands.ts` alone leaves CI unable to resolve tracked `start.ts`'s imports. Recommend one wave that commits `apps/gateway/src/runtime/`, `apps/gateway/src/deploy/`, `apps/gateway/src/deploy-commands.ts`, and `drizzle/0011-0013` together, then a CI run to prove it. Until then, no "CI green" claim in this area is meaningful.
2. **F1/F2:** authorise a one-line-each follow-up in `start.test.ts` (`Partials.GuildMember` → `2`, add `GuildCreate: 'guildCreate'`). Both are inert, so neither blocks this wave. I did **not** apply them — read-only.
3. **Class sweep (LESSONS §1.2):** only two `vi.mock('discord.js')` sites exist in the repo (`start.test.ts:106`, `deploy/worker.test.ts:64`); both already use `importOriginal`, so this defect class is closed at both sites. Worth pinning as a rule: any `Events`/`Partials`/`GatewayIntentBits` override should spread the real enum rather than hand-listing members — that would have prevented F1 and F2 structurally.

## Public Interface Exposed
- No production interface changed. Test-only file.
- Test-local surface added: `mocks.startSyncCommandsWorker`, `mocks.startSweeper`; `makeSweeperHandle()`; `makeGateway()` now returns `attachSweeper` alongside `shutdown`.
- Contracts I verified against on-disk source:
  - `SweeperHandle` = `{ stop(): void; sweepNow(): Promise<SweepDecisions> }`, `stop()` **sync** — `runtime/sweeper.ts:155-159`, `:232-237`
  - `Gateway.attachSweeper(handle: { stop(): void }): void` — `gateway.ts:174`
  - `boot()` dependency surface = `createGateway`, `createSupervisor`, `startPreflightWorker`, `startBuilderWorker`, `startSyncCommandsWorker`, `startSweeper`, `attachSweeper`, `pg.Pool` — each mocked or faked as required
  - `start.ts` reviewed state = sha256 `7516cdb8ba08ae04`; `start.test.ts` reviewed state = sha256 `a1902ef938db7587`

## Known Limitations
- **I did not run the app or a browser.** This is a test-harness fix; the exercised artefact is the suite plus the real `boot()` import graph (which is what now collects). I make no claim about gateway runtime behaviour in production.
- **Not validated on a clean CI checkout** — and per §4 it *cannot* be until the untracked set is committed. All green results describe this merged working tree only.
- **F1/F2 were assessed as inert by reading, not by executing a failing case.** I confirmed no assertion touches partials/intents and that no test emits `guildCreate`; I did not author a test to force the failure, because that would have meant editing the file under review. If the orchestrator wants the failure demonstrated, that belongs to the fix task.
- **Hash pinning:** my deconfliction conclusions hold for `start.ts` sha256 `7516cdb8ba08ae04`. If that file moves again, the `attachSweeper`/`startSweeper` expectations need re-checking.
- **Concurrency context:** `Antigravity/DESIGN-HANDOFF.md` and `DESIGN-MANIFEST.json` were touched inside the task window by another actor; `git status`/`git diff` show no net content change against the index, so they are neither this task's nor a defect. Recorded only so the orchestrator knows other writers were active in that window.
