# Task Report: expansion-e5a2-handlers

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/runtime/connector/index.ts
- MODIFIED: apps/gateway/src/runtime/games/xp.ts
- MODIFIED: apps/gateway/src/runtime/moderation/index.ts
- MODIFIED: apps/gateway/src/runtime/games/giveaway.ts

## Dependencies Added
None.

## Assumptions Made
- The sibling dispatcher agent owns the defer-first change in `apps/gateway/src/runtime/dispatcher.ts`; per task instructions that file was NOT touched. Handlers were written defensively so they are correct whether or not the interaction arrives already deferred.
- Deferred-safe pattern chosen: `respondCompat(interaction, payload)` → `followUp()` when `interaction.deferred || interaction.replied`, else `reply()`. Rationale, verified against live sources (see below): `editReply()` cannot set the Ephemeral flag (its options type `InteractionEditReplyOptions` only allows SuppressEmbeds/IsComponentsV2) and several handler replies are ephemeral (permission denials, guild-only guards, validation errors). `followUp()` accepts full `InteractionReplyOptions` including Ephemeral, works after either a defer or a prior reply, and throws `InteractionNotReplied` only when nothing was acked — a state unreachable here because the undeferred branch calls `reply()` first. Each call site still sends exactly one message per branch; only the transport method changed.
- One `respondCompat` helper was added per module (module-local, exported) rather than a shared util, to keep the four files' scopes disjoint and avoid touching any shared file outside the declared scope.
- Pre-existing defensive branch in connector's `executeStatus` catch block (`replied || deferred → followUp else reply`) left as-is; it was already defer-safe.

## Open Questions for Orchestrator
None. No scope expansion was needed; no other file must change.

## Public Interface Exposed
- `respondCompat(interaction: ChatInputCommandInteraction, payload: InteractionReplyOptions & { fetchReply?: never; withResponse?: never }): Promise<void>` — exported from each of the four modified modules (connector, xp, moderation, giveaway). Sends exactly one response: `followUp` when already acked (deferred or replied), `reply` otherwise.
- Converted call sites (behavior unchanged, transport only):
  - connector `executeStatus`: not-yet-polled notice + status embed (2 sites).
  - xp: `guildOnly` guard, `onRank`, `onBalance`, `onLeaderboard` empty + embed (5 sites).
  - moderation: `denied`, `onWarn` (guild-missing, user-missing, recorded-strike, warned), `onTimeout` (guild-missing, over-limit, missing-perms, user-missing, failed, success) (11 sites).
  - giveaway: `requireManageGuild` (guild-missing, denied), `executeStart` (winners-range, hours-range, non-text-channel, started), `executeEnd` (not-found, already-ended, gone, ended-early), `executeReroll` (not-found, not-ended, channel-gone, message-gone, rerolled), `onGiveaway` unknown-subcommand (14 sites).
- No new BotEvents. No command renames. No signature changes to existing exports.

## Known Limitations
- Does NOT touch `dispatcher.ts` (sibling agent's scope); defer-first dispatch itself is not part of this task.
- Existing handler unit tests exercise the undeferred path (fakes have `replied:false, deferred:false` and only stub `reply`); they prove no behavior-logic change (95/95 green) but do not exercise the deferred branch. Deferred-ack proof (mocked-clock 10062 test) belongs to the dispatcher/error-card side of wave E5.
- Live-Discord verification not performed (no login, fakes only); production box out of scope per constraints.
- Verification (all on merged working tree, gateway workspace):
  - `npm run typecheck --workspace @corvus/gateway` → clean (one iteration: first attempt used editReply-first and failed on Ephemeral flags type error; switched to followUp-safe pattern, now zero errors).
  - `npx eslint <4 files> --max-warnings 0` → clean, zero warnings.
  - `npx prettier --check <4 files>` → clean (after one `--write` pass for import/line-width formatting).
  - `npx vitest run` on connector (27) + xp (18) + giveaway (18) + moderation (32) suites → 4 files, 95 tests, all passed.
  - Grep-proof: no bare `interaction.reply(` remains outside `respondCompat` internals and the already-safe connector catch fallback.
  - Live sources consulted (Principle 5b): discord.js guide "Command Responses" (response-methods: defer → 15-min window; editReply cannot change ephemeral state; followUp after deferReply edits-or-follows) retrieved via web search; installed discord.js 14.27.0 `InteractionResponses.js` read on disk confirming `reply()` throws `InteractionAlreadyReplied` when deferred/replied, `editReply`/`followUp` throw `InteractionNotReplied` when unacked, and the `InteractionEditReplyOptions` flags restriction. No secrets read, printed, or transmitted (presence-by-shape only; nothing secret-adjacent in these files).
