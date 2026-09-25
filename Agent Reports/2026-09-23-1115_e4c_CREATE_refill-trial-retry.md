# Task Report: expansion-e4c-refill-trial

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/api/checkout/refill/route.ts
- MODIFIED: apps/web/lib/auth/session.ts

## Dependencies Added
- None.

## Assumptions Made
- Refill product env name `CREEM_TEST_PRODUCT_REFILL` follows the existing `CREEM_TEST_PRODUCT_PRO` / `CREEM_TEST_PRODUCT_STUDIO` convention; no `.env.example` edit (out of scope, orchestrator owns manifests).
- Trial grant amount 100 credits / reason `trial_grant` per Docs/06 ledger vocabulary + terms "100 AI credits" promise.
- Refill row writing + `refillAllowance`/budget change + credits display belong to sibling E4 agents; this task owns only the refill checkout route and the trial_grant write.
- `xmax = '0'` is Postgres's authoritative INSERT-vs-CONFLICT marker (proven live against the disposable test DB: INSERT yields '0', ON CONFLICT yields a nonzero xid).

## Open Questions for Orchestrator
- None blocking. Two follow-ups for siblings: (1) add `CREEM_TEST_PRODUCT_REFILL` to `.env.example`/CI env; (2) webhook agent should treat `metadata.kind='refill'` purchases as refill ledger rows, not monthly grants.
- Refill route is currently Pro-only by documentation, not by code gate: any signed-in tier can buy it. If the terms require tier gating, say so and I will add it.

## Public Interface Exposed
- `POST /api/checkout/refill` -> `200 { checkoutUrl }` | `401 { error: 'unauthorized' }` | `503 { error: 'refill_unavailable' }` | `502 { error: 'refill_upstream_failed' }`. Test host only (`https://test-api.creem.io/v1/checkouts`), session-first, `metadata: { accountId, kind: 'refill' }`, `request_id: corvus-refill-<accountId>-<epochMs>`. Test seams: `__setFetchFn` / `__resetFetchFn`, `__setSessionReader` / `__resetSessionReader`.
- `buildRefillRequestId(accountId, now)`, `buildRefillPayload(plan, now)`, `readCheckoutUrl(payload)`; constants `REFILL_PRICE_USD=5`, `REFILL_CREDITS=1000`, `REFILL_WINDOW_DAYS=90`, `REFILL_REASON='refill'`.
- `PgSessionStore.upsertAccountByDiscordId` now also writes the trial grant on INSERT (xmax gate); new exports `TRIAL_GRANT_CREDITS=100`, `TRIAL_GRANT_REASON='trial_grant'`, `INSERT_TRIAL_GRANT_SQL`, `writeTrialGrant(pool, accountId)`. AccountRow shape unchanged (xmax stripped before return).

## Known Limitations
- Pro-only limitation is documented, not enforced in code (see Open Questions).
- No persistent test file ships with this task (scope allowed CREATE only for the refill route); trial exactly-once was proven with a temporary live-DB test (signup -> exactly 1x100cr trial_grant row; two re-logins -> still 1 row; scratch ledger dropped afterwards) plus a temporary refill guard-order smoke (401/503/502/200), both removed after passing.
- `session-db.test.ts` SQL-shape block asserts the upsert's INSERT/CONFLICT shape and will need its `RETURNING`-slice expectation extended only if it does exact-match on the RETURNING list (it slices CONFLICT..RETURNING, and the trial_ends_at guard is untouched).
- Grant write is best-effort: failures never break signup; missing `credit_ledger` table (disposable test DBs without 0011) is silently skipped, real DB errors are logged. Webhook still never writes `bots`.
- Production box, Contabo, GHCR, and live keys were never touched. No secret value appears in code, logs, or this report (presence checked by defined-only). No manifest edits, no installs, no git restore commands, no commits.

## Verification (evidence, not claims)
- `tsc --noEmit -p apps/web/tsconfig.json`: 0 errors. `eslint` on both files: 0 warnings. `prettier --check` on both files: clean.
- Adjacent suites green: session-db (21) + auth (28) + checkout/create (30) + session-bind (8) = 87 passed.
- xmax INSERT-vs-CONFLICT distinction proven live: INSERT xmax='0', ON CONFLICT xmax='32613' (disposable test container).
- Pre-existing failure noted, not mine: `apps/web/app/api/webhooks/creem/route.test.ts` (untracked sibling file) fails to load `@/lib/db/pool` alias under vitest — unrelated to this task's scope.
