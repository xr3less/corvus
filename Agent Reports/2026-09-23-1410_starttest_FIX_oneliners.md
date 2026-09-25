# Task Report: starttest-oneliners

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/start.test.ts
- CREATED: Agent Reports/2026-09-23-1410_starttest_FIX_oneliners.md

## Dependencies Added
- None. No install, no manifest/lockfile/env edit.

## Assumptions Made
- Review file Agent Reports/2026-09-23-1345_reviewer_REVIEW_starttest-wave.md exists and findings F1/F2 were taken as specified; verified both values independently from the installed discord.js on disk rather than trusting the report text alone.
- start.ts line 225 (`client.once(Events.GuildCreate, ...)`) confirms F2: the GuildCreate arm exists in production code, so the missing mock entry was a real (latent) mismatch.

## Open Questions for Orchestrator
- None. F3 (CI reproducibility gap, untracked runtime/deploy tree) from the review is explicitly out of scope for this task and was not touched.

## Public Interface Exposed
- No production interface changed. Test-only mock literal corrections:
  - `Partials: { GuildMember: 2 }` (was `1`; installed discord.js 14.27.0 defines `Partials = { User:0, Channel:1, GuildMember:2, ... }`, verified via `node -e require('discord.js')` from disk).
  - `Events` mock map now includes `GuildCreate: 'guildCreate'` (verified `Events.GuildCreate === 'guildCreate'` from the installed package; matches `start.ts:225` arm). Full map is now 9 entries: ClientReady, GuildCreate, GuildMemberAdd, GuildMemberRemove, MessageCreate, MessageDelete, MessageUpdate, MessageReactionAdd, InteractionCreate.

## Known Limitations
- Both fixes are inert by design (no test asserts on partials; no test emits `guildCreate`), matching the reviewer's assessment. They close latent mock drift, not a live failure.
- Full-repo `npx vitest run` from root still shows pre-existing failures in `apps/web` (e.g. `@/lib/utils` alias resolution, `HTMLCanvasElement is not defined`) — unrelated to this task and untouched. Scoped acceptance (gateway workspace) is 464/464 green.
- No live connections opened by tests; no other file touched; no git restore/commit/add performed.

## Verification
- `node -e require('discord.js')` from disk: `Partials.GuildMember === 2`, `Events.GuildCreate === 'guildCreate'` — source cited is the installed package itself.
- `npx vitest run src/start.test.ts` (cwd apps/gateway): 24/24 pass.
- `npx vitest run` (cwd apps/gateway): 464/464 pass, 35/35 files.
- `npx tsc --noEmit -p tsconfig.json` (gateway): exit 0.
- `npx eslint src/start.test.ts --max-warnings 0`: exit 0.
