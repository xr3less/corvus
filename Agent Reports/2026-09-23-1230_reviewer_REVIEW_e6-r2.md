# Task Report: review-e6-install-2

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-1230_reviewer_REVIEW_e6-r2.md (this report)
- MODIFIED: none (read-only re-review; no source file touched)
- DELETED: none

## Dependencies Added
- None. No manifest edits, no installs, no git restore/commit, no production contact, no secret values printed or transmitted (presence by length/defined-only throughout).

## Artifact Existence (all confirmed on the merged tree)
- `apps/web/app/api/bots/[botId]/go-live/route.ts` exists (untracked-new vs HEAD: `??` in git status — still uncommitted, same as prior pass).
- `apps/gateway/src/deploy/worker.ts` exists (untracked-new vs HEAD: `??`).
- `apps/web/app/dashboard/bots/[id]/page.tsx` exists (modified on disk: `M`).
- `apps/web/app/dashboard/bots/[id]/page.test.tsx` exists (modified on disk: `M`, the pagetest-fix).
- Prior narrow FAIL's blocking defect (go-live `{ botId }` vs worker `{ botId, guildId }`) is the exact seam re-checked below; E6b detail wiring included in this pass per task.

## Blocking-Defect Re-check (prior FAIL cause → FIXED)
- Interface (a) from the prior report is CLOSED. `go-live/route.ts:282-293` now fans out one `boss.send(SYNC_COMMANDS_QUEUE, { botId, guildId }, { singletonKey: \`${botId}:${guildId}\`, ... })` per installed guild, derived from the extended `SCANS_SQL` (`SELECT guild_id, preflight ...`, line 115-116) with null/empty-id filtering + dedupe (lines 192-196). Queue name `sync-commands` matches `worker.ts` `SYNC_COMMANDS_QUEUE` on both sides.
- Worker happy path: `runSyncCommandsJob` (worker.ts:58-64) returns `bad_job` only when `botId`/`guildId` is missing/empty; every fan-out job now carries both ids, so no deadletter on the happy path. `bad_job → deadletter`, `transient → failed/retry` mapping untouched.
- Zero-guild case: `guildIds.length === 0` returns `200 { botId, status: 'live', jobId: null, jobIds: [] }` (lines 266-268) without starting a boss — commands sync later via the guildCreate path. Gates (401 → 404-shape → Red 409 → token 409 → prod-spec 409), single transaction (status flip + audit row), and retryable 500 shapes are byte-identical in structure to the prior pass; `jobId` (first) kept for shape compatibility, `jobIds` carries the full fan-out.

## Slice / Detail-Wiring Verdicts
- E6c1 go-live: PASS (fan-out correct, gates + audit + response shapes preserved as above). Still no dedicated `go-live/route.test.ts` — confirmed only `activity/route.test.ts` + `bots/route.test.ts` exist under `app/api/bots`; carried as OQ3, not a fail.
- E6c2 sync worker: PASS, unchanged since prior pass (guild-scoped PUT via `syncGuildCommands`, `Routes.applicationGuildCommands` only — see instant-FAIL checks).
- E6b detail wiring: PASS. `runOpen` fetches `/api/invite?botId=${encodeURIComponent(botId)}` (page.tsx:719); `runScan` POSTs `{ botId: writeBotId, guildId: trimmedGuild }` with no `capabilities` key (page.tsx:764-767, verified by direct read); token sub-page anchor `Bot token → /dashboard/bots/<id>/token` rendered in the header action row (page.tsx:1152-1157); `toScanRow` + `ErrorCard` red/yellow/green rendering intact (lines 144-157, 1278-1308). Page suite green: 60/60 (see Gates).

## Gates Run (real toolchain, detected from package.json scripts)
- Toolchain: npm workspaces; web `typecheck` = `tsc --noEmit`, `lint` = `eslint .`, `test` = `vitest run`; gateway same. Node v24.15.0, npm 11.12.1.
- `npm run typecheck --workspace @corvus/web` → exit 0, zero errors.
- `npm run typecheck --workspace @corvus/gateway` → exit 0, zero errors.
- `npx eslint` on go-live route + detail page + detail page test (`--max-warnings 0`) → exit 0. `npx eslint` on gateway `worker.ts` + `worker.test.ts` → exit 0.
- Detail-page files from `apps/web`: `npx vitest run "app/dashboard/bots/[id]/page.test.tsx" "app/dashboard/bots/[id]/page-disabled-guard.test.tsx"` → 2 files, 60/60 green. (Running the same paths from repo root fails at collect on `@/lib/bots` alias resolution — pre-existing config scoping already recorded in the pagetest-fix report, not a regression; the supported invocation is from `apps/web`.)
- Regression per task scope (invite + preflight + worker + sibling bots/spec), from `apps/web`: `kind-to-capabilities.test.ts` + `preflight.test.ts` + `app/api/bots` + `app/api/spec/publish` → 5 files, 117/117 green (10 kind + 24 preflight + 23 activity + 31 bots + 29 publish).
- Gateway worker + registry (repo root): `src/deploy/worker.test.ts` + `src/runtime/registry.test.ts` → 2 files, 13/13 green (8 worker + 5 registry).
- `start.test.ts` NOT re-run (outside this pass's named scope; prior OQ2 standing by — see Open Questions).

## Security / Instant-FAIL Checks (all PASS — none triggered)
- Token value rendered/logged: FAIL trigger absent. Token route answers presence-only `{ saved, length }` (GET measures the cipher row, POST answers `{ saved: true, length }` of the checked value); panel renders `Saved · N characters.` / `No token saved yet.`, input `type="password"`, `setToken('')` clears after save; zero `console.*` in token route, token panel, go-live route, and worker (grep-verified). Go-live never reads token bytes (`octet_length` presence only).
- Second arbitrary writer of `status='live'`: FAIL trigger absent. `GO_LIVE_SQL` remains the only arbitrary writer in E6 scope. `sweeper.ts` (E4) holds `SWEEP_WAKE_SQL` (sleeping→live) and `SWEEP_SLEEP_SQL` (live→sleeping) — guarded transitions, not arbitrary writes; the route comment's "FIRST and only non-test writer" phrasing is still overbroad as written (carried as OQ4, clarify-not-fail per prior pass).
- Global commands: PASS. `deploy-commands.ts` uses `Routes.applicationGuildCommands` only (lines 49, 80); zero `Routes.applicationCommands(` matches repo-wide in gateway src.
- New BotEvents: PASS. No `BotEvent` in `deploy/` except the worker's own "No new BotEvents" comment; registry union untouched by E6 files.
- Admin refusal weakened: PASS. `buildInvite` Administrator-bit throw intact (`permissions.ts:153-156`); `kindToCapabilities` never returns Administrator.
- Secrets: none printed, copied, or transmitted; no package.json/lockfile/.env edits; no installs; no git restore/commit; no SSH/Contabo/GHCR/production contact.

## Open Questions for Orchestrator
1. (Carried, not fail) `start.test.ts` collect failure (discord.js mock lacks `SlashCommandBuilder`, newly triggered by E6's start.ts → deploy/worker.ts → deploy-commands.ts import chain). Test-only fix (add `importOriginal` spread to the mock, as `worker.test.ts` already does). Gateway suite is not fully green until this lands.
2. (Carried, not fail) No dedicated `go-live/route.test.ts` and no token route/panel test file. Hermetic seams exist for both; authorize follow-up suites if route-test coverage must include them.
3. (Carried, not fail) `kindToCapabilities` (invite) vs `capabilityForKind` (preflight) divergence on connector/status + alias table + spec pointer (draft_spec_id join vs latest row). Nominate a canonical home and align.
4. (Carried, clarify-not-fail) Narrow the "only non-test writer of status='live'" claim to "only arbitrary writer" (E4 sweeper holds the guarded sleeping→live wake path).

## Assumptions Made
- Untracked-new states (`??` for go-live route + worker) read from `git status --short`; no HEAD comparison re-run (unchanged from prior pass's finding that both are new files).
- Registry 9-command count not re-verified by name (unchanged files since prior green pass; registry suite 5/5 green here).
- No live-DB human flows run (no session/DB provisioned); no live Discord verification; pg-boss fan-out verified by contract match on disk + sibling suites, not a live enqueue.

## Public Interface Exposed
- None (review adds no interface).

## Known Limitations
- Go-live handler exercised by code-reading + contract match + gates, not by a dedicated suite (none exists; none created per scope).
- Full web/gateway suites not run (scoped to the task-named test files + sibling regression per instructions); repo-wide lint not run (scoped eslint clean on all touched files; both typechecks exit 0).
