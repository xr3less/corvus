# Task Report: review-e6-install

## Status
FAILED (narrow: one blocking cross-slice contract defect; every other check green)

## Files Touched
- CREATED: Agent Reports/2026-09-23-1155_reviewer_REVIEW_e6.md (this report)
- MODIFIED: none (read-only review; no source file touched)
- DELETED: none

## Dependencies Added
- None. No manifest edits, no installs, no git restore/commit, no production contact, no secret values printed or transmitted (presence by length/defined-only throughout).

## Artifact Existence (all confirmed on the merged tree)
- MODIFIED: apps/web/app/api/invite/route.ts + CREATED apps/web/app/api/invite/kind-to-capabilities.test.ts
- MODIFIED: apps/web/app/api/preflight/start/route.ts + MODIFIED apps/web/app/api/preflight/preflight.test.ts
- CREATED: apps/web/app/api/bots/[botId]/token/route.ts + CREATED apps/web/app/dashboard/bots/[id]/token/page.tsx
- CREATED: apps/web/app/api/bots/[botId]/go-live/route.ts
- MODIFIED: apps/gateway/src/deploy-commands.ts (untracked-new vs HEAD) + CREATED apps/gateway/src/deploy/worker.ts + CREATED apps/gateway/src/deploy/worker.test.ts + MODIFIED apps/gateway/src/start.ts (staged) + apps/gateway/src/runtime/loaders.ts (untracked-new vs HEAD)
- E6b target apps/web/app/dashboard/bots/[id]/token/page.tsx exists; E6b wiring file apps/web/app/dashboard/bots/[id]/page.tsx is modified on disk (see Open Questions).

## Gates Run (real toolchain, detected from package.json scripts)
- Toolchain: npm workspaces; web `typecheck` = `tsc --noEmit`, `lint` = `eslint .`, `test` = `vitest run`; gateway same. Node v24.15.0, npm 11.12.1. Gateway has no local node_modules (deps hoisted to root; discord.js/pg/pg-boss present at root).
- `npm run typecheck --workspace @corvus/web` → exit 0, zero errors.
- `npm run typecheck --workspace @corvus/gateway` → exit 0, zero errors.
- `npx eslint` on all 7 E6 web files (invite route + kind test, preflight start route + preflight test, token route, go-live route, token page) → clean, zero warnings.
- `npx vitest run apps/web/app/api/invite/kind-to-capabilities.test.ts apps/web/app/api/preflight/preflight.test.ts` → 2 files, 34/34 green (10 kind + 24 preflight).
- `npx vitest run apps/gateway/src/deploy/worker.test.ts apps/gateway/src/runtime/registry.test.ts` → 2 files, 13/13 green (8 worker + 5 registry).
- `npx vitest run apps/gateway/src/start.test.ts` → FAILS at collect (see OQ2; pre-existing mock gap, newly triggered by E6's import chain).

## Security / Instant-FAIL Checks (all PASS)
- Token custody: token route GET answers `{ saved, length }` only; POST answers `{ saved: true, length }` only; panel renders `Saved · N characters.` / `No token saved yet.`, input `type="password"`, cleared after every save. Zero `console.*` calls in either token file (grep-verified). No cipher/plaintext in responses, errors, or logs. Presence via `octet_length` / decrypt-length-only. PASS.
- Admin refusal: `buildInvite` Administrator-bit throw untouched (apps/web/lib/invite/permissions.ts unmodified on disk); `kindToCapabilities` never returns Administrator (unknown → DEFAULT); test asserts `not.toContain('Administrator')`. PASS.
- Global commands: `syncGuildCommands` uses `Routes.applicationGuildCommands(app.id, guildId)` only; no `applicationCommands(`/global route anywhere in apps/gateway/src/deploy (grep-verified). Worker comment and code guild-scoped. PASS.
- New BotEvents: none. deploy/worker.ts is REST PUT only; loaders.ts adds `recordGuildInstall` + SQL + interfaces, dispatcher registry untouched (grep-verified: no BotEvent in deploy/). PASS.
- Second writer of `status='live'`: go-live `GO_LIVE_SQL` is the only ARBITRARY writer in E6 scope — BUT see Interface (c) re the E4 sweeper wake path. Not counted as E6 FAIL (different wave, guarded path), spec claim needs narrowing.
- Secrets: none printed, copied, or transmitted; no package.json/lockfile/.env edits; no installs; no git restore/commit; no SSH/Contabo/GHCR/production contact.

## Slice Verdicts (landed files only)
- E6a1 invite: PASS. `?botId` path derives via `capabilitiesForBotDraft` (draft_spec_id join, fail → DEFAULT); caller-CSV/default path byte-identical incl. 422/500 branches; `?botId` blank falls through to old path. 10/10 tests green.
- E6a2 preflight: PASS. Omitted-`capabilities` derives from latest spec_versions row with DEFAULT fallback; null/empty/non-array still 422 (preserved); `expectedCommands` = `EXPECTED_COMMANDS` = 9. All 9 names verified against runtime sources on disk (warn/timeout in moderation/index.ts; rank/balance/leaderboard in games/xp.ts; giveaway in games/giveaway.ts; status = CONNECTOR_STATUS_COMMAND in connector/index.ts; ticket = TICKET_COMMAND_NAME in tickets/handler.ts; role = ROLE_COMMAND_NAME in reaction-roles/handler.ts). 24/24 tests green.
- E6b token custody: PASS (files landed, gates green). No route/panel test file exists — hermetic seams exported but unexercised; reviewer did not create one (out of scope).
- E6c1 go-live: PASS in isolation (404-shape via isUuid + owned + soft-delete → 404 never 403; Red → 409 preflight-red; missing-token → 409; no-prod-spec → 409; status flip + audit in one transaction; sync send best-effort post-commit with retryable 500 shape). No dedicated test file — recorded as limitation (glob confirms only activity/route.test.ts and bots/route.test.ts exist under app/api/bots).
- E6c2 sync worker: PASS in isolation (guild-scoped PUT from `buildSlashCommandBody`, bad_job/transient codes, singleton start, GuildCreate → `recordGuildInstall` edge in start.ts, `GUILD_INSTALL_SQL` touches joined_at only). CLI path guarded by argv-identity; typecheck clean.
- deploy-commands header note: header still reads "NEVER imported at boot or by any runtime file" — this remains literally true (worker lives in deploy/, not runtime/), so no finding; worker import is side-effect-free via the argv guard.

## Interface Verdicts
- (a) go-live send `{ botId }` vs worker contract `{ botId, guildId }` → MISMATCH (BLOCKING, cause of FAIL). Evidence: go-live/route.ts:258-261 sends `{ botId }` with `singletonKey: botId`; worker.ts `runSyncCommandsJob` (lines 58-64) returns `{ error: 'bad_job' }` when `guildId` is missing, and the work handler maps `bad_job` → `deadletter`. Queue names match (`sync-commands` both sides). Net effect: every go-live sync job deadletters on first touch — the "guild commands appear in Discord" acceptance cannot pass despite the caller receiving 200 `{ status: 'live', jobId }`. Neither slice is wrong in isolation; the contract was never locked between them (E6c1 assumed `{ botId }`; E6c2 defined `{ botId, guildId }` and noted "nothing enqueues yet"). Fix options (orchestrator picks one): (1) go-live fans out one `{ botId, guildId }` job per installed guild (it already reads guild_installs rows — extend the read to guild ids); (2) worker accepts botId-only jobs and fans out per guild_installs itself. Option 1 is recommended (keeps the worker's single-guild contract pure; no worker change).
- (b) `kindToCapabilities` (invite) vs `capabilityForKind` (preflight) → DIVERGE, minor (OQ, not fail). Agree on 6 of 8 canonical kinds (welcome, moderation→moderation, xp→leveling, giveaway→welcome, tickets, reaction-roles). Diverge on connector/status: E6a1 → `welcome`; E6a2 → null (skipped, comment says "no permission footprint"). E6a2 additionally carries ~40 translator aliases E6a1 lacks. End-state often coincides via DEFAULT fallback, but a mixed spec (e.g. moderation+connector) yields invite [moderation, welcome] vs scan [moderation]. Also different spec pointers: invite reads the `draft_spec_id` join, preflight reads latest spec_versions row. Pending unification per E6a2 report OQ2.
- (c) "go-live is the ONLY non-test writer of status='live'" → OVERBROAD as written (clarify, not fail). `apps/gateway/src/runtime/sweeper.ts` (E4, untracked on disk) contains `SWEEP_WAKE_SQL = "UPDATE bots SET status = 'live' ... WHERE ... status = 'sleeping'"` — a second non-test DB writer, narrowly guarded to sleeping→live wake. Correct claim: go-live is the only arbitrary writer; the E4 sweeper holds a guarded sleeping→live wake path. No other writers found (publish route does not write status; builder-runs writes phase='live' to builder_runs, a different table; gateway in-memory status is not a DB write). Related observation: `startSweeper` is defined and tested but nothing in start.ts boots it (no `startSweeper` reference in start.ts; sweeper seam `attachSweeper` exists in gateway.ts only) — E4 concern, informational.

## Open Questions for Orchestrator
1. (Blocking) Sync-commands payload contract: pick fix option (1) go-live fans out per-guild `{ botId, guildId }` (recommended) or (2) worker accepts botId-only. Re-review the touched side after the fix; no other E6 file needs to change.
2. (OQ, not fail) `start.test.ts` collect failure: mock gap is pre-existing (mock never provided SlashCommandBuilder), but the BREAKAGE is caused by E6's new import chain (start.ts → deploy/worker.ts → deploy-commands.ts → feature-modules → moderation → SlashCommandBuilder). Verified error: `No "SlashCommandBuilder" export is defined on the "discord.js" mock`, chain shown in stack. Fix is test-only (add `importOriginal` spread to the discord.js mock, exactly as worker.test.ts already does); left untouched as out of E6 file scope. Gateway suite is not fully green until this lands.
3. (OQ, not fail) No dedicated `go-live/route.test.ts` (E6c1 scope allowed one CREATE) and no token route/panel test file (E6b scope). Hermetic seams exist for both; authorize follow-up suites if "route tests green" must cover them.
4. (OQ, not fail) kind→capability duplication (verdict b) pending unification: nominate canonical home (recommend invite route's helper extended with the alias table, preflight imports or re-exports) and align the spec pointer (draft_spec_id join vs latest row).
5. (Pending per task, with observation) E6b detail wiring: the three behaviors are OBSERVABLE on disk already — `runOpen` fetches `/api/invite?botId=` (page.tsx:719), `runScan` posts `{ botId, guildId }` with no `capabilities` key (page.tsx:761-768), token sub-page link rendered (page.tsx:1154) — likely landed via the same-file E5 edit (page.tsx diff is 375 lines, staged). Confirm whether E6b is already satisfied or still needs its own pass; review did not re-verify E5's lines beyond presence.

## Assumptions Made
- E6b wiring lines observed in page.tsx attributed to the same-file E5 edit, not claimed as E6 work; E6b recorded pending per task instructions.
- sweeper.ts / start.test.ts staged-or-untracked states read from `git status --short`; HEAD comparisons via `git show HEAD:<path>` (deploy-commands.ts and loaders.ts absent from HEAD = new files, consistent with their reports).
- Registry command count (9) verified by name against runtime sources + green registry/worker suites, not by booting Discord.

## Public Interface Exposed
- None (review adds no interface; contract findings are in Interface Verdicts above).

## Known Limitations
- No live-DB human flows run (no session/DB provisioned); no live Discord verification;pg-boss sends verified by shape/contract on disk only.
- Token route/panel and go-live route exercised by code-reading + gates, not by dedicated suites (none exist; none created per scope).
- Full web/gateway suites not run (scoped to touched/adjacent test files per task); repo-wide lint not run (scoped eslint on 7 web files clean; gateway lint not run — typecheck + scoped tests green).
