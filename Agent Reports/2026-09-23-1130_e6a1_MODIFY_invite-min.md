# Task Report: expansion-e6a1-invite-min

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/invite/route.ts
- CREATED: apps/web/app/api/invite/kind-to-capabilities.test.ts

## Dependencies Added
- none

## Assumptions Made
- Bot draft spec lookup uses `bots.draft_spec_id -> spec_versions.spec` join (same pointer pattern as spec/publish route), with account scoping deliberately omitted to keep the handler unauthenticated like the existing invite route; any lookup failure falls back to DEFAULT_CAPABILITIES rather than erroring.
- Behavior kinds are the builder-prompt contract set: welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles. Single-posting kinds (giveaway, connector, status) map to the minimal 'welcome' capability (post + embed); xp maps to 'leveling' (the VALID_CAPABILITIES name for XP behavior).
- Existing buildInvite URL shape (guild-scoped: guild_id + disable_guild_select, scope=bot applications.commands) already satisfies the guild-scoped constraint, so no URL change.
- `npx tsc --noEmit -p apps/web/tsconfig.json` run from repo root cleared the whole web package typecheck (empty output, exit 0); treated as the cheap limited typecheck.

## Open Questions for Orchestrator
- none

## Public Interface Exposed
- `kindToCapabilities(kind: string): string[]` (exported from apps/web/app/api/invite/route.ts): pure, never throws; maps the 8 behavior kinds to capabilities; unknown/blank kinds return `[...DEFAULT_CAPABILITIES]`; never returns Administrator.
- GET /api/invite now accepts optional `?botId=<id>`: when present and non-blank, derives capabilities from the bot's draft spec behaviors (deduped, order-preserving, default on any failure) and returns `buildInvite` result; when absent/blank, the caller-CSV/default path is byte-identical to before (including 422 unknown-capability and 500 missing-client-id branches).

## Known Limitations
- botId path exercised only via unit tests of kindToCapabilities plus the pre-existing invite tests (21/21 green); no live-DB round-trip test of capabilitiesForBotDraft (lookup falls back to default on DB-unavailable, which is the hermetic-test behavior).
- No new BotEvents touched; buildInvite/Admin-refusal logic untouched.
