# Task Report: expansion-e6a2-preflight

## Status
PARTIAL

## Files Touched
- MODIFIED: apps/web/app/api/preflight/start/route.ts

## Dependencies Added
- None. No manifest edits, no installs (node_modules present on disk; orchestrator installs centrally).

## Assumptions Made
- `git status --short` + `git diff` on entry showed the target file untouched (no partial work to continue); edits applied fresh. File was pristine at start.
- When caller omits `capabilities`, derivation reads the bot's LATEST `spec_versions` row (`ORDER BY version DESC LIMIT 1`), not specifically `draft_spec_id`. Rationale: draft pointer is the freshest working spec; latest-version read is the honest superset. Ownership needs no re-check (proven by the bots query one block above).
- `capabilityForKind` maps translator log-aliases (`message-log`, `member-log`, `channel-log`, `digest`, `appeal`) to the `logging` capability (not `moderation`): translator folds them into moderation ROWS, but their *permission* footprint (ViewAuditLog, ReadMessageHistory) is logging. Verified: mod-shield's {filter, timeout, appeal, verification} then derives exactly {moderation, logging}, matching the seed's declared capabilities.
- `giveaway`/`entry`/`reroll`/`requirements` derive `welcome`: no giveaway capability exists and the giveaway-grove seed proves those bots need exactly the welcome permission set.
- `connector`/`status`/`xp` handled: `status` maps to null (informational, no perms); `xp`-family and `economy` (defensive, coin-cellar precedent) map to `leveling`. `tickets` + `reaction-roles` families map 1:1 (final E1 kind list copied verbatim from E1 report: tickets canonical + panel/routing/transcript/sla/ticket aliases; reaction-roles canonical + picker/removal/groups/limits/reaction-role/reaction_role aliases).
- `EXPECTED_COMMANDS = 9` mirrors `buildRegistry(FEATURE_MODULES).commands.size` as data: warn, timeout, rank, balance, leaderboard, giveaway, status, ticket, role (welcome is events-only). Derivation documented inline at the constant.
- Explicit caller-supplied `capabilities` path keeps old semantics exactly (validate each entry, 422 on unknown/empty, caller list wins when present).
- Spec-read failure or empty/unmappable spec falls back to `DEFAULT_CAPABILITIES` (same honest default the invite route uses).
- No probe of discriminator: localhost route tests exercise the real path.

## Open Questions for Orchestrator
1. Test file `apps/web/app/api/preflight/preflight.test.ts` was intentionally NOT touched (out of scope: sibling wave owns it, and the SCOPE GUARD forbids touching files outside the one listed). It now has 3 red tests BY DESIGN: (a) missing/empty capabilities test still expects 422, but the new behavior derives from spec + defaults (spec change, not a bug); (b+c) the two enqueue-shape tests assert `expectedCommands: required.length` (the wrong-number defect this task fixes — real value is now 9). Which wave owns updating that test file to the new contract?
2. `capabilityForKind` + `capabilitiesFromSpec` duplicate the kind→capability helper that canonically belongs in the invite route (sibling agent's job, per task note). This file exports both helpers so the sibling can import/replace; please unify (make one canonical home, re-export or import) and confirm which file owns it.

## Public Interface Exposed
- `route.ts`: `capabilityForKind(raw: unknown) => Capability | null` (exported pure helper; normalized lowercased kind/alias -> capability, null = skip-no-throw).
- `route.ts`: `capabilitiesFromSpec(spec: unknown) => Capability[]` (exported pure helper; envelope -> VALID_CAPABILITIES-ordered deduped set; never throws; [] on malformed/unknown).
- `route.ts`: `EXPECTED_COMMANDS = 9` (exported const; real manifest size).
- `POST /api/preflight/start`: accepts `{ botId, guildId, capabilities? }`. When `capabilities` is omitted (undefined only — null/empty-string/non-array still 422 as before), derives from latest spec_versions row with DEFAULT fallback. Enqueued job now carries `expectedCommands: 9` (manifest count) instead of `required.length`. All prior status shapes unchanged: 401 unauthorized, 404 bot-not-found (malformed/foreign/deleted), 422 invalid-guild/unknown-capability, 500 db/boss failures.

## Known Limitations
- Gates: `tsc --noEmit` full web tree exit 0 (zero errors); `eslint .` full web tree exit 0 (zero warnings); `eslint` on the touched file exit 0. Preflight suite: 20/23 pass; the 3 failures are the expected contract-drift reds described in OQ1 (missing-capabilities-422 test + two expectedCommands-shape tests), NOT regressions — every other test including all 401/404/422-shape, mapper-payload, boss-failure and live-PG paths passes unchanged.
- Scan semantics unchanged beyond the two fixes: same queue/key/retry options, same required/bitfield/intents derivation, same Red/Yellow/Green interpretation in the gateway scanner (no scanner change).
- No live-Discord human flow run in this pass (no staging guild/session provisioned here); reviewer should run: bot with moderation draft -> POST start with botId only -> required covers moderation perms, expectedCommands = 9, scan rows green.
- Security: no secrets printed/copied (token presence never touched in this file), no package.json/lockfile/.env edits, no npm install, no git restore/commit, no SSH/Contabo/GHCR/production contact. Env values never in logs or this report.
- Break-the-guard proof for reviewer: delete one entry from REGISTRY_COMMAND_NAMES -> EXPECTED_COMMANDS changes -> scanner commands-sync row goes yellow on a synced guild (expected 8 vs found 9). Post an unknown-only capabilities array -> 422 with valid list. Post no capabilities with no spec_versions row -> DEFAULT_CAPABILITIES derived.
