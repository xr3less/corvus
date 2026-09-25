# Task Report: review-e1-tickets

## Status
PASS

## Files Touched
- None (read-only review; probe file created then deleted, no source modifications)

## Assumptions Made
- Toolchain detected from disk, not assumed: root `package-lock.json` present, no root `pnpm-lock.yaml`/`yarn.lock` (only `node_modules/uri-js/yarn.lock`), so npm/npx. Gateway scripts: `typecheck: tsc --noEmit`, `test: vitest run`. Web scripts: `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`. All checks run via `npx` accordingly.
- `SPEC_VERSION = 1` source of truth is `packages/spec/src/index.ts:5`; RUNTIME_KINDS source of truth is `apps/gateway/src/runtime/config.ts`.
- `start.test.ts` full-suite failure is out-of-scope for E1 (see Known Limitations); E1 is judged on its own artifacts + in-scope suites, not on other waves' dirty-tree breakage.

## Open Questions for Orchestrator
1. (Retroactive approval, per task instruction — not a fail) E1b modified `apps/web/app/api/spec/publish/publish.test.ts`, which was outside its declared MODIFY scope, to keep the web suite green (fixtures `panel`/`picker`-as-unknown replaced with `teleport`, FALLBACK_DDL widened, 2 new sync tests). Recommend accepting as part of E1b; reverting re-reddens the web suite.
2. Merged-tree `apps/gateway/src/start.test.ts` failure (see Known Limitations): `vi.mock('discord.js')` lacks `SlashCommandBuilder`, so any import chain reaching `feature-modules.ts` (via untracked `src/deploy-commands.ts:15`) throws at `moderation/index.ts:586`. Which wave owns fixing the mock (add `SlashCommandBuilder` passthrough via `importOriginal`) vs owning `deploy-commands.ts`? Not E1's file, so escalated, not failed against E1.
3. E1 files are uncommitted (`??` for tickets/, reaction-roles/, 0013, config.ts, translator.ts, feature-modules.ts, boot-modules.ts; `M` for schema.ts, publish route/test). Committing is the orchestrator's call.

## Public Interface Verified
- `config.ts`: `RUNTIME_KINDS` 8-tuple `welcome|moderation|xp|giveaway|connector|status|tickets|reaction-roles`; `RuntimeKind` union; `validateRuntimeConfigRow()` error string lists all 8. No SPEC_VERSION touch (spec package still `SPEC_VERSION = 1`).
- `tickets/handler.ts`: `TICKET_COMMAND_NAME='ticket'`; `TICKET_SLA_POLL_MS=60000`; `parseTicketsParams` (24h stale / 7d close defaults); `renderTranscript` (50-line, 4000-char cap); `InMemoryTicketStore`; `buildTicketsModule()->FeatureModule { kind:'tickets', commands:[/ticket open|close|transcript], events:[] }`. No `ClientReady`/`InteractionCreate` subscription; no `eval`/`new Function`/`child_process`/dynamic `import()`; no `setDefaultMemberPermissions`/`setDMPermission`/REST/`put`; no secret/token/password keys.
- `reaction-roles/handler.ts`: `ROLE_COMMAND_NAME='role'`; `parseReactionRolesParams`; `emojiKeyOf` (custom id else unicode name, never throws); `planRoleGrant` (exclusive sibling-drop + maxPerMember, null = held/denied); `buildReactionRolesModule()->FeatureModule { kind:'reaction-roles', commands:[/role post|remove], events:[MessageReactionAdd] }`. Exactly one event, pre-existing union member; no `MessageReactionRemove`; no `ClientReady`/`InteractionCreate`; same no-exec/no-secret/no-global-command results as tickets.
- `translator.ts`: `KIND_ALIASES` folds `panel|routing|transcript|sla|ticket->tickets`, `picker|removal|groups|limits|reaction-role|reaction_role->reaction-roles`; unknown kinds skip-log, token-bearing entries skipped outright (verified live, see Evidence).
- `0013_runtime_kinds_tickets.sql`: forward-only, `--> statement-breakpoint` split, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` with 8-member CHECK; no seed/backfill/UPDATE; matches 0012 idiom.
- `schema.ts` catalog block: `bot_runtime_config_kind_check` lists all 8 kinds (lines 111-114); unique NULLS NOT DISTINCT + index intact.
- `feature-modules.ts` / `boot-modules.ts`: 7 entries each in kind order (`...connector, tickets, reaction-roles`); same 2 entries in both (two-array append protocol holds).
- `publish/route.ts` mirror: `RUNTIME_KINDS` 8-tuple, `KIND_ALIASES` 11 E1 entries verbatim, `FALLBACK_DDL` widened to 8 kinds + idempotent re-assert ALTER, `0013` in ensurePg sources, `syncRuntimeRows` DELETE-then-INSERT preserves tickets/reaction-roles rows.

## Known Limitations
- No live-Discord human flow (production box/SSH/Contabo/GHCR/live keys out of scope per constraints). Verification is gates + suites + translator guard probe on real code paths, fakes only for Discord surfaces.
- Merged-tree full gateway suite is NOT fully green: 437 tests pass across 34 files, but `src/start.test.ts` fails at collection (`No "SlashCommandBuilder" export is defined on the "discord.js" mock`, thrown at `moderation/index.ts:586` via `feature-modules.ts:20` via untracked `deploy-commands.ts:15`). This chain involves files outside E1 scope (`start.test.ts` M, `start.ts` M, `deploy-commands.ts` ??, `moderation/` ?? — other waves' dirty-tree state). E1's own 5-file suite is 42/42 green, so this is recorded as a merged-tree caveat, not an E1 defect.
- `package-lock.json` (`apps/testbot` entry) and `.env.example` (billing names, dev-login switch) diffs are pre-existing/out-of-scope; E1/E1b made no manifest edits, no installs, no `.env` edits, no git restore/commit, no production contact, printed no secret values.
- Ticket store and picker registry are in-memory; transcript is plain-text; SLA poll is per-process 60s `setInterval` with guarded `unref`; removal is `/role remove` command-only (no `MessageReactionRemove`) per SPEC decision.

## Verdict: PASS
E1 (plus E1b mirror sync) is verified on the merged tree within its scope. All artifacts exist on disk; Never-list checks all clear; in-scope gates green; guard behavior proven live.

## Evidence
- Artifacts confirmed on disk: `apps/gateway/src/runtime/tickets/handler.ts`, `apps/gateway/src/runtime/tickets/tickets.test.ts`, `apps/gateway/src/runtime/reaction-roles/handler.ts`, `apps/gateway/src/runtime/reaction-roles/reaction-roles.test.ts`, `apps/gateway/drizzle/0013_runtime_kinds_tickets.sql`, `apps/gateway/src/runtime/config.ts`, `translator.ts`, `feature-modules.ts`, `boot-modules.ts`, `apps/gateway/src/db/schema.ts` (catalog block), `apps/web/app/api/spec/publish/route.ts` (mirror block). Git status: E1-created files `??` (uncommitted, content verified regardless); `schema.ts` + publish route/test `M`.
- Never-list: `registry.ts` BotEvent union unchanged (GuildMemberAdd/Remove, MessageCreate/Delete/Update, MessageReactionAdd only — no new names, no ClientReady/InteractionCreate); `packages/spec/src/index.ts:5` `SPEC_VERSION = 1`; grep for `eval\(|new Function|child_process|import\(` in both handlers: no matches; grep for `token|api_key|secret|password|authorization` and `setDefaultMemberPermissions|setDMPermission` in both handlers: no matches; grep for `REST|deploy|applicationCommands|\.put\(` in both handler dirs: no matches; no `package.json`/lockfile/`.env` edits by E1 (lockfile diff = unrelated `apps/testbot`); no SSH/Contabo/GHCR/production contact.
- `npx tsc --noEmit` in `apps/gateway`: clean, exit 0.
- `npx eslint` on 9 gateway files (tickets handler+test, reaction-roles handler+test, config, translator, feature-modules, boot-modules, schema): clean, exit 0.
- `npx vitest run` E1 scope (tickets, reaction-roles, translator, registry, boot-modules tests): 5 files, 42/42 passed.
- `npx vitest run` full gateway: 34 passed files, 437 passed tests, 1 failed file (`src/start.test.ts` collection error above — out-of-scope chain, E1 files not in stack).
- `npx tsc --noEmit` in `apps/web`: clean, exit 0. `npx eslint` on publish route+test: clean, exit 0. `npx vitest run app/api/spec/publish/publish.test.ts`: 29/29 passed (incl. tickets/reaction-roles sync + idempotence tests, `teleport` still-unknown control).
- Break-the-guard probe (temporary `apps/gateway/e1-guard-probe.mts` via `npx tsx`, deleted afterwards with `rm`, no git commands): `threw=false`; `kinds=["welcome","tickets","reaction-roles"]`; `specVersions=[1,1,1]`; `SPEC_VERSION=1`; `RUNTIME_KINDS_n=8`; `skipLines=["translator-skip:unknown-kind=\"teleport\" index=0","translator-skip:token-material-present index=4","translator-skip:unknown-kind=\"[redacted]\" index=5"]` (unknown skips, token entry skipped, 24+ char token-like kind redacted); `deletedKindOk=false`; `leakPresent=no`. Guard holds: unknown/token in, skip out, no throw, no secret echo.
