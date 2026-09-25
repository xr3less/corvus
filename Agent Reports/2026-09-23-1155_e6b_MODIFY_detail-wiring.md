# Task Report: expansion-e6b-wiring

## Status
PARTIAL

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.tsx (exactly 3 hunks; ErrorCard/toScanRow untouched)
- CREATED: Agent Reports/2026-09-23-1155_e6b_MODIFY_detail-wiring.md (this report)

## Dependencies Added
- none

## Assumptions Made
- `runOpen` uses `bot.id` for `?botId=` (same identifier the page already passes to `refreshDraft(botId)`); server falls back to the default/caller-CSV path on lookup failure per the e6a1 contract, so no new error branch was added.
- `runScan` keeps `botId: writeBotId` (null for local-only bots preserves the honest-404 path) and drops only the `capabilities` key, so the start route derives capabilities server-side (`apps/web/app/api/preflight/start/route.ts:287-311`: undefined capabilities derive from spec, else the invite-route default set).
- Token link path `/dashboard/bots/<id>/token` taken verbatim from the e6b token-custody report; `bot.id` is URL-encoded; styled as `ghostAction` anchor in the existing header action row.

## Open Questions for Orchestrator
- `apps/web/app/dashboard/bots/[id]/page.test.tsx` (NOT in my scope, so untouched) has 2 assertions that encode the PRE-change contract and now fail against the intended wiring. Request the test owner update them: (1) invite test line ~869 uses `apiCallsTo(calls, '/api/invite')` with exact-equality matching, so the new `/api/invite?botId=bot-3` URL counts 0 — the stub itself matched via `startsWith` and the link + why-lines rendered fine, only the count assertion is stale; (2) scan test line ~926 expects body `{ botId, guildId, capabilities: ['welcome'] }` but the locked contract is `{ botId, guildId }` with server-derived capabilities. Both failures are stale expectations, not regressions: the flows render (install link + why-lines shown; scan rows rendered) and 58/60 page tests pass.

## Public Interface Exposed
- No new exports or endpoints. One new anchor in the detail header: `Bot token` linking to `/dashboard/bots/<botId>/token`.
- `runOpen` now fetches `/api/invite?botId=<id>`; `runScan` POSTs `{ botId, guildId }` (no `capabilities` key).

## Known Limitations
- Token link has no test coverage (no token references exist in either page test file); verified by typecheck + lint + prettier only.
- No live-DB round-trip run here; invite ?botId and capability derivation rely on the e6a1 unit tests and the start-route logic cited above.
- `toScanRow`/ErrorCard region untouched (verified by grep: `row.fix` reads and both render branches intact).
- Verification: `npx tsc --noEmit -p apps/web/tsconfig.json` exit 0; `eslint` on page.tsx with `--max-warnings 0` exit 0; `prettier --check` clean; `vitest run` on the two page test files from `apps/web`: 58 passed / 2 failed, both failures the stale assertions escalated above. Disabled-guard file fully green.
- No secrets touched, printed, or transmitted (no env/key/token reads added; only bot id + guild id already handled by these functions).
