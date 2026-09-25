# Task Report: fix-gateway-smalls-retry

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/db/builder-runs.ts (m-28)
- MODIFIED: apps/gateway/src/db/builder-runs.test.ts (m-28)
- MODIFIED: apps/gateway/src/runtime/connector/index.ts (m-29, m-30)
- MODIFIED: apps/gateway/src/runtime/connector/connector.test.ts (m-29/m-30)
- MODIFIED: apps/gateway/src/runtime/dispatcher.ts (m-31)
- MODIFIED: apps/gateway/src/runtime/dispatcher.test.ts (m-31)
- MODIFIED: apps/gateway/src/runtime/welcome/handler.ts (m-32)
- MODIFIED: apps/gateway/src/runtime/welcome/handler.test.ts (m-32)
- MODIFIED: apps/gateway/src/runtime/loaders.ts (m-33)
- MODIFIED: apps/gateway/src/runtime/registry.test.ts (m-33 + Prettier fix)
- MODIFIED: apps/gateway/src/start.ts (m-34)
- MODIFIED: apps/gateway/src/start.test.ts (m-34)
- MODIFIED: apps/gateway/src/runtime/moderation/automod.ts (m-35)
- MODIFIED: apps/gateway/src/runtime/moderation/moderation.test.ts (m-35)
- CREATED: Agent Reports/2026-09-23-0713_gateway-smalls-m28m35_FIX_gateway-smalls.md
- READ-ONLY (no edit): apps/gateway/src/runtime/boot-modules.ts, apps/gateway/src/runtime/config.ts, apps/gateway/src/runtime/games/xp.ts, apps/gateway/src/store/index.ts (m-36 assessment)

## Dependencies Added
None.

## Assumptions Made
- `apps/gateway/src/runtime/` is untracked in git (`??`) but pre-fix defects were present on disk; edited in place, no git restore used.
- `start.ts` M-diff for F-10/F-11 lifecycle work is pre-existing; left intact, only added m-34 filter.
- No gateway AGENTS.md exists (Glob found none); no discord.js framework API changed, so no AGENTS.md constraint applies.
- User-facing copy kept byte-identical (dispatcher denial, connector status, welcome templates untouched).
- No web research needed: all facts repo-internal (config.ts, BOOT_LIVE_BOTS_SQL, sibling unref idioms).

## Open Questions for Orchestrator
- m-36: XP store stays InMemory (no rewire per scope). Which option to schedule: A (durable Postgres wiring), B (async port), or C (keep in-memory)? See Known Limitations.
- m-33 left BOOT_CONFIG_SQL without ORDER BY (read-side resolution only). Confirm acceptable or schedule SQL ORDER BY follow-up.

## Public Interface Exposed
- `resolveModuleConfig(configs: RuntimeConfigRow[], kind: RuntimeKind, guildId?: string | null): RuntimeConfigRow | null` (apps/gateway/src/runtime/loaders.ts)
- `LoadBotOptions.guildId?: string | null` (default null = legacy first-global-wins)
- `getBadWordsRe(badWords: readonly string[]): RegExp` (apps/gateway/src/runtime/moderation/automod.ts; bounded cache, max 16)
- No other exported signatures changed.

## Known Limitations
- m-28..m-35 fixed minimally per file; D5 `botMissingAfter:2` still expects `step:sync` (correct: 2 reads succeed, 3rd sync finds bot gone).
- m-36 ASSESS ONLY — NOT rewired. Options: (A) Wire durable Postgres store (`createStore` user_records upsert) into `buildXpModule` via new optional async-capable port — survives restart, needs port change since `XpStore` is sync and `store/recordXp/getXp` are async + keyed by (botId,guildId,memberId) not (guildId,userId); medium work. (B) Keep sync `XpStore` shape, add periodic flush/snapshot of InMemoryXpStore to Postgres — smaller diff, still lossy on crash, adds timer lifecycle. (C) Keep in-memory, document trial-only semantics — zero work, restart wipe remains. Recommend A when XP becomes real user state.
- Guard proof done for m-34 only (per spec example); other covering tests assert zero-call/identity semantics but were not each mutation-proven.
- No production contact, no secrets in diff (grep for token/secret/password/KEY in builder diff: clean).

## Verification
- Suites (9 files, run from `apps/gateway`): `npx vitest run src/db/builder-runs.test.ts src/runtime/connector/connector.test.ts src/runtime/dispatcher.test.ts src/runtime/registry.test.ts src/runtime/welcome/handler.test.ts src/runtime/moderation/moderation.test.ts src/runtime/games/xp.test.ts src/start.test.ts src/runtime/boot-modules.test.ts` → `Test Files 9 passed, Tests 161 passed`.
- Typecheck: `npm run typecheck --workspace @corvus/gateway` → `tsc --noEmit`, exit 0. Root `npm run typecheck` → ai + spec clean.
- Lint: `npx eslint apps/gateway/src/db/builder-runs.ts apps/gateway/src/runtime/dispatcher.ts apps/gateway/src/runtime/connector/index.ts apps/gateway/src/runtime/welcome/handler.ts apps/gateway/src/runtime/loaders.ts apps/gateway/src/start.ts apps/gateway/src/runtime/moderation/automod.ts apps/gateway/src/runtime/boot-modules.ts --max-warnings 0` → exit 0.
- Prettier (14 touched files, absolute paths): after `prettier --write apps/gateway/src/runtime/registry.test.ts` → `All matched files use Prettier code style!`
- Guard broken/watched (m-34, no git restore): backup to `/tmp/start.ts.guardbak` + sha256; removed `eq(bots.status, 'live'), ` from vault reader → `npx vitest run src/start.test.ts -t "m-34"` → `1 failed, 23 skipped`; restored via `cp`, `sha256sum -c` OK, grep count 1, re-run → `1 passed`.
- Fixes: m-28 existence before first chat (chatCalls 0, step generate); m-29 `.catch(()=>undefined).finally` on tick; m-30 guarded unref; m-31 post-success stamp + lazy eviction (MAX_COOLDOWN_TRACK_MS 1h); m-32 per-guild join ring Map; m-33 scoped>global>first; m-34 `eq(bots.status,'live')` mirroring BOOT_LIVE_BOTS_SQL; m-35 memoized RegExp.
