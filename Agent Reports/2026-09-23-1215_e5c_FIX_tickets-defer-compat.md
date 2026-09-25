# Task Report: expansion-e5c-tickets-compat

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/runtime/tickets/handler.ts
- MODIFIED: apps/gateway/src/runtime/reaction-roles/handler.ts
- MODIFIED: apps/gateway/src/runtime/tickets/tickets.test.ts
- MODIFIED: apps/gateway/src/runtime/reaction-roles/reaction-roles.test.ts

## Dependencies Added
None.

## Assumptions Made
- Copied the proven E5a2 respondCompat shape exactly (module-local exported helper per file; followUp when deferred||replied else reply; no shared util, no dispatcher.ts touch), per review-e5-safety scoping.
- Fakes mirror real discord.js ack semantics: reply() throws InteractionAlreadyReplied when deferred, so the deferred tests genuinely prove the fix rather than passing vacuously.
- Prettier --write only reformatted (import line-width, multiline call wrapping); no logic change.

## Open Questions for Orchestrator
None. No scope expansion needed; no other file must change.

## Public Interface Exposed
- `respondCompat(interaction, payload)` — exported from both `tickets/handler.ts` and `reaction-roles/handler.ts`; sends exactly one response (followUp when acked, reply otherwise), preserving Ephemeral flags.
- Converted call sites (transport only, zero logic change):
  - tickets: onTicketOpen (guild-missing, missing-perms, no-channel, open-failed, plain-channel success, thread success = 6), onTicketClose (guild-missing, success = 2), onTicketTranscript (guild-missing, success = 2), onTicket unknown-subcommand (1). Total 11 sites.
  - reaction-roles: onRolePost (guild-missing, denied, non-text-channel, post-failed, success = 5), onRoleRemove (guild-missing, denied, missing-perms, member-fetch-failed, member-null, remove-failed, success = 7), onRole unknown-subcommand (1). Total 13 sites.
- No new BotEvents. No command renames or signature changes.

## Known Limitations
- Verification (merged working tree, gateway workspace): `npm run typecheck --workspace @corvus/gateway` clean; `npx vitest run` tickets (12) + reaction-roles (11) = 23/23 passed (2 new deferred tests: deferred /ticket close via followUp, deferred /role post via followUp; all pre-existing tests still pass on the undeferred reply path); eslint --max-warnings 0 clean on all 4 files; prettier clean after --write pass.
- Grep-proof: no bare `interaction.reply(` remains outside respondCompat internals and the already-safe per-handler catch fallbacks (which check replied||deferred first).
- Live-Discord verification not performed (fakes only); production box out of scope per constraints. No secrets read, printed, or transmitted.
