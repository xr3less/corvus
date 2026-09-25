# Task Report: expansion-e1-tickets

## Status
SUCCESS

## Files Touched
- CREATED: apps/gateway/src/runtime/tickets/handler.ts
- CREATED: apps/gateway/src/runtime/tickets/tickets.test.ts
- CREATED: apps/gateway/src/runtime/reaction-roles/handler.ts
- CREATED: apps/gateway/src/runtime/reaction-roles/reaction-roles.test.ts
- CREATED: apps/gateway/drizzle/0013_runtime_kinds_tickets.sql
- MODIFIED: apps/gateway/src/runtime/config.ts
- MODIFIED: apps/gateway/src/db/schema.ts
- MODIFIED: apps/gateway/src/runtime/translator.ts
- MODIFIED: apps/gateway/src/runtime/feature-modules.ts
- MODIFIED: apps/gateway/src/runtime/boot-modules.ts

## Dependencies Added
- None. No manifest edits, no installs (node_modules present on disk; orchestrator installs centrally).

## Assumptions Made
- RUNTIME_KINDS growth 6→8 is intent-preserving runtime-vocabulary amendment per SPEC E1 section 1; SPEC_VERSION stays 1, behaviors stay opaque.
- No new BotEvent: MessageReactionAdd already in closed union with zero consumers; removal ships as /role remove per SPEC reaction-remove decision. ClientReady/InteractionCreate remain dispatcher-owned.
- SLA defaults 24h stale / 7d close from ticket-desk seed template (sla kind); transcript cap 50 msgs / 4000 chars; reaction grant uses exclusive sibling-drop + maxPerMember cap from role-reactor seed template.
- 0013 follows 0012 + migrate.mjs idiom: forward-only, statement-breakpoint split, DROP IF EXISTS + ADD CHECK (re-run no-op in effect, no UPDATE/backfill/seed).
- Publish-route mirror apps/web/app/api/spec/publish/route.ts duplicates RUNTIME_KINDS + KIND_ALIASES inline but is OUT OF SCOPE for E1; left untouched (drift noted below).
- Out-of-scope count-assertion tests left untouched per scope guard (drift escalated, not silently fixed).

## Open Questions for Orchestrator
1. Count-assertion drift (expected, needs sequential follow-up OUT OF SCOPE for E1): translator.test.ts:92-93 expects six kinds, registry.test.ts:79 expects 5 FEATURE_MODULES, boot-modules.test.ts:44 expects 5 kinds. All three now red by design (7 modules, 8 kinds). Which wave owns updating them?
2. Publish-route mirror apps/web/app/api/spec/publish/route.ts:66-123 still lists 6 kinds + old aliases. It will DROP tickets/reaction-roles rows at publish time (DELETE-then-INSERT per its sync). Does E2/E6 own syncing it to E1's final list, or should a follow-up task?
3. config.ts was already at 8 kinds on entry (prior partial application); E1 completed the remaining 4 modifies + 0013 + tests. Confirm no double-count with E2/E6 whitelisting E1's report for the final vocabulary.

## Public Interface Exposed
- config.ts: RUNTIME_KINDS 8-tuple (+'tickets','reaction-roles'); RuntimeKind union; validateRuntimeConfigRow() error string lists 8 kinds.
- tickets/handler.ts: TICKET_COMMAND_NAME='ticket'; TICKET_SLA_POLL_MS=60000; parseTicketsParams(unknown)->TicketsParams { panelChannelId, logChannelId, helperRoleId, staleAfterMs=24h, closeAfterMs=7d }; renderTranscript(lines, ticketName)->string (50-line, 4000-char cap); InMemoryTicketStore get/set/remove/list; buildTicketsModule({logger, now?})->FeatureModule { kind:'tickets', commands:[/ticket open|close|transcript], events:[] }.
- reaction-roles/handler.ts: ROLE_COMMAND_NAME='role'; parseReactionRolesParams(unknown)->{ groups: RoleGroup[], logChannelId }; emojiKeyOf(reaction)->string|null (custom id else unicode name); planRoleGrant(currentIds, group, roleId)->{add,remove}|null (null=held or limit-denied); buildReactionRolesModule({logger?})->FeatureModule { kind:'reaction-roles', commands:[/role post|remove], events:[MessageReactionAdd] }.
- translator.ts: KIND_ALIASES += panel/routing/transcript/sla/ticket->tickets; picker/removal/groups/limits/reaction-role/reaction_role->reaction-roles.
- 0013 SQL: widens bot_runtime_config_kind_check to 8 members.
- Wiring: FEATURE_MODULES 5→7; composeBotModules() 5→7 (same 2 entries, kind order).

## Known Limitations
- Full gateway suite NOT green by design: 3 out-of-scope count tests red (see OQ1); all in-scope gates green (tsc clean, eslint clean on 8 touched files, 21/21 new tests pass).
- Transcript is plain-text (50 msgs, author tag + 500-char/msg slice, 4000-char total); no attachment/file output.
- Ticket store is in-memory (no DB persistence); SLA poll is per-process 60s setInterval with guarded unref.
- Reaction removal is command-only (/role remove); MessageReactionRemove NOT subscribed (SPEC decision, named follow-up).
- Picker registry is in-memory (messageId->group), seeded by /role post; no persistent picker table.
- Guard proofs (live, tsx against real translator/config): unknown kind + token-bearing entries in, skip out, no throw (returned kinds ["tickets","reaction-roles"], specVersion [1,1]); deleted kind validates ok:false.
- Security: no secrets printed/copied (presence by defined-only), no package.json/lockfile/.env edits, no npm install, no git restore/commit, no SSH/Contabo/GHCR/production contact.
- Web research cited (live sources, not memory): discordjs.guide/popular-topics/reactions + partials (partial fetch before read, seeded message.react, member.roles.add) + threads (threads.create + startThread fallback, archiving, member add) against disk-verified discord.js 14.27.0; Node v24.15.0; in-repo shape apps/gateway/src/runtime/moderation/index.ts + registry.ts duplicate-command guard + translator alias-folding idiom.
