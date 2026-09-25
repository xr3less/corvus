# Task Report: expansion-e1b-drift

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/runtime/translator.test.ts
- MODIFIED: apps/gateway/src/runtime/registry.test.ts
- MODIFIED: apps/gateway/src/runtime/boot-modules.test.ts
- MODIFIED: apps/web/app/api/spec/publish/route.ts
- MODIFIED: apps/web/app/api/spec/publish/publish.test.ts (OUT-OF-SCOPE — see Open Questions; required to keep the web suite green)

## Dependencies Added
- None. No manifest edits, no installs.

## Assumptions Made
- E1's report (Agent Reports/2026-09-23-0915_e1_CREATE_tickets-runtime.md) plus on-disk apps/gateway/src/runtime/config.ts is the verbatim source of truth for the 8-kind vocabulary: welcome|moderation|xp|giveaway|connector|status|tickets|reaction-roles. Copied verbatim, never guessed.
- KIND_ALIASES mirror copied verbatim from on-disk apps/gateway/src/runtime/translator.ts:40-90 (panel/routing/transcript/sla/ticket->tickets; picker/removal/groups/limits/reaction-role/reaction_role->reaction-roles). Only the stale line-number comment was updated (41-79 -> 40-90).
- boot-modules.test.ts asserts module composition (kind order), not a numeric kind count: updated the expected order array 5->7 entries (appended 'tickets','reaction-roles'), matching composeBotModules() on disk. registry.test.ts asserts FEATURE_MODULES length 5->7. translator.test.ts asserts the 6-kind list 6->8.
- publish.test.ts (out-of-scope file) encoded the same 6-kind drift and HAD to move with the mirror, otherwise the route sync alone leaves the web suite red (proven: 3 failures after the route-only change). Changes: FALLBACK_DDL CHECK widened to 8 kinds + idempotent re-assert ALTER (mirrors 0013, because the fallback CREATE TABLE pins the old 6-kind CHECK on first creation); 0013 added to ensurePg sources; 'panel'/'picker'-as-unknown fixtures replaced with 'teleport' (still-unknown control); RuntimeWriter expectations 2->4 rows with canonical tickets/reaction-roles assertions; RuntimeEmpty now uses teleport for the zero-row case; added pure + Postgres round-trip tests proving tickets/reaction-roles survive the DELETE-then-INSERT sync and re-publish idempotence.
- No new kinds, no new events, SPEC_VERSION untouched (stays 1), no behavior-logic changes — sync only.
- No current/external facts used; all values from E1 report + on-disk files. No web research needed, no sources to cite.

## Open Questions for Orchestrator
1. RETROACTIVE SCOPE APPROVAL NEEDED: apps/web/app/api/spec/publish/publish.test.ts was NOT in the declared MODIFY scope, but it duplicated the same 6-kind contract (CHECK text, unknown-kind fixtures, runtimeRows counts) and failed 3/27 once route.ts was synced. Options: (a) accept the test update as part of E1b (recommended — it asserts only the synced contract, no product change), or (b) revert it and accept a red web suite. Awaiting ruling; file is uncommitted so either path is cheap.

## Public Interface Exposed
- apps/web/app/api/spec/publish/route.ts: RUNTIME_KINDS 8-tuple (+'tickets','reaction-roles'); KIND_ALIASES += 11 E1 entries verbatim (panel/routing/transcript/sla/ticket; picker/removal/groups/limits/reaction-role/reaction_role). defaultTranslateProdSpec now emits tickets/reaction-roles rows; syncRuntimeRows DELETE-then-INSERT preserves them (previously would have dropped them at publish time).
- No new exports, no signature changes, no new events, no global commands.

## Known Limitations
- Verification is gates + suites, not a live-Discord human flow (production box/SSH/Contabo/GHCR/live keys out of scope per constraints; no secrets printed, presence-by-defined-only, no package.json/lockfile/.env edits, no npm install, no git restore/commit).
- Evidence (all run, all green): gateway full suite 33 files / 427 tests pass (incl. translator 13, registry 5, boot-modules 3); web publish suite 29/29 pass (incl. 2 new tickets/reaction-roles sync tests, pure + Postgres paths); tsc --noEmit clean in apps/gateway and apps/web; eslint clean on all touched files.
- Pre-existing note: git status shows the three gateway test files as untracked (E1 created, never committed) — content is synced regardless; committing is the orchestrator's call.
- Does NOT cover: E2 builder-prompt kind list, E6 capability derivation (both whitelist E1's report per SPEC); MessageReactionRemove (SPEC-deferred follow-up); any pricing/refill/sleep/go-live work.
