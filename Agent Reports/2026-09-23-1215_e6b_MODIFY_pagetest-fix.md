# Task Report: expansion-e6b-testfix

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx

## Dependencies Added
- none

## Assumptions Made
- `runOpen` bot-aware URL is `/api/invite?botId=bot-3` (exact string used in invite assertion to match the page's `encodeURIComponent(bot.id)` fetch).
- Scan POST body contract is `{ botId, guildId }` with no `capabilities` key (server derives capabilities; mock display id coerces to null as in sibling assertions).
- Sibling report's "58/60" count referred to both page test files combined; the colocated page.test.tsx alone holds 56 tests.

## Open Questions for Orchestrator
- none

## Public Interface Exposed
- No new exports or endpoints. Test-only change: invite assertion matches `/api/invite?botId=bot-3`; scan body assertion expects `{ botId: null, guildId: '123456789012345678' }`.

## Known Limitations
- Verification: from `apps/web`, `npx vitest run` on both detail test files — 2 passed / 60 passed; `npx tsc --noEmit -p tsconfig.json` exit 0. Running vitest from repo root fails on `@/lib/bots` alias resolution (pre-existing config scoping, not caused by this change); no full suites run per instructions.
- No prod-code change; page.tsx untouched.
- No secrets touched, printed, or transmitted.
