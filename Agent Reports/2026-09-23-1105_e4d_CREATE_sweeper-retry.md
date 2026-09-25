# Task Report: expansion-e4d-sweeper

## Status
SUCCESS

## Files Touched
- CREATED: apps/gateway/src/runtime/sweeper.ts
- CREATED: apps/gateway/src/runtime/sweeper.test.ts
- MODIFIED: apps/gateway/src/gateway.ts (attachSweeper handle lifecycle + stop-on-shutdown only)

## Dependencies Added
None.

## Assumptions Made
- No partial sweeper work existed: `git status` showed only unrelated `sweep-ci`/`sweep` REVIEW reports and no `sweeper*` source file, so this was a fresh CREATE (not a MODIFY continuation).
- Placed the module at `apps/gateway/src/runtime/sweeper.ts` per the task scope, not the `apps/gateway/src/sleep/sweeper.ts` path named in the SPEC wave text; the task scope governs.
- Grace default is 24h (`SWEEP_GRACE_MS = 86400000`) per SPEC open question 4 recommendation and the task objective; overridable via `StartSweeperOptions.graceMs`.
- Sleep destroys the in-memory client via the existing `Gateway.removeBot`; wake is a DB flip only (`status='sleeping'` -> `'live'`), picked up by the existing `BOOT_LIVE_BOTS_SQL` live-only boot reader — no gateway-notify plumbing, per SPEC.
- `gateway.ts` exposes only `attachSweeper(handle)` + stop-on-shutdown; the actual `startSweeper(pool, gateway, logger)` call at boot belongs in `start.ts`, which is E6-owned and out of scope for this task, so it was deliberately NOT wired.
- Token presence is checked by cipher length (`octet_length(token_cipher) > 1`), same placeholder rule as the boot reader; no token bytes are read, logged, or compared.

## Open Questions for Orchestrator
- Boot wiring (`start.ts` calling `startSweeper` with the real pool + gateway) is still open and belongs to whoever owns `start.ts` (E6) — this task only provides the module and the `attachSweeper` seam.
- Sleep strictness (strict vs 24h grace) followed the SPEC recommendation (24h grace); if the founder overrides, only `SWEEP_GRACE_MS`/call-site changes.

## Public Interface Exposed
- `SWEEP_GRACE_MS = 86400000`, `SWEEPER_POLL_MS = 60000`
- `SWEEP_CANDIDATES_SQL`, `SWEEP_SLEEP_SQL` (guarded `AND status = 'live'`), `SWEEP_WAKE_SQL` (guarded `AND status = 'sleeping'`)
- `isPaidTier(tier): boolean` — true only for `pro` | `studio`
- `parseSweepExpiryMs(trialEndsAt): number | null` — fail-open clock reader (null/missing/garbage -> null)
- `decideSweep(row, nowMs, graceMs = SWEEP_GRACE_MS): 'sleep' | 'wake' | 'keep'`
- `reconcileSweep(rows, nowMs, graceMs = SWEEP_GRACE_MS): { sleep: string[]; wake: string[] }`
- `startSweeper(pool, target, logger, opts?): { stop(): void; sweepNow(): Promise<SweepDecisions> }` — `SweeperPool`, `SweeperTarget` (narrowed to `removeBot`), `SweeperLogger`, `StartSweeperOptions { graceMs?, intervalMs?, now? }`, `SweeperRow`, `SweepDecisions`
- `Gateway.attachSweeper(handle: { stop(): void }): void` — replaces (stopping) any previous handle; `shutdown()` stops and clears it first.

## Known Limitations
- This task does NOT cover: credits route, refill checkout, budget.ts refill allowance, webhook refill rows, trial_grant ledger row, or the `start.ts` boot wiring — those remain sibling E4/E6 scope.
- Wake requires paid tier + prod spec + real token present, else stays sleeping (honest, per SPEC).
- Verification performed: `tsc --noEmit` zero errors (gateway package), `eslint --max-warnings 0` clean on all three touched files, `prettier --check` clean, `sweeper.test.ts` 23/23 green (incl. break-the-guard 23h-keep/25h-sleep proof), existing `gateway.test.ts` + `start.test.ts` 56/56 green. No live-Discord or live-DB run; no secrets read or printed; no production contact; no manifest edits; no installs; no git restore/commit commands.
