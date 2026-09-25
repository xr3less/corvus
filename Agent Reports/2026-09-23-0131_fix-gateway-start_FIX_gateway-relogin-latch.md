# Task Report: fix-gateway-start

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/gateway/src/start.ts
- MODIFIED: apps/gateway/src/start.test.ts (colocated test, pre-existing — extended, not created)

## Dependencies Added
None. No dependency, version, or config was changed.

## Objective (as briefed)
Fix two resource-lifecycle defects in `createDiscordClient`:
1. `readyAttached` latched per botId **forever**, so a bot resurrected by `relogin`
   (or removeBot + re-add) never got a `ClientReady` listener — `attachBotModules`
   never ran again and the bot came back with no dispatcher, no slash commands and
   no feature events.
2. `moduleStops` was written on ready but never consumed, so a destroyed client's
   module polls (tempban 60s, giveaway 60s, connector) kept firing against it —
   tempban keeps a row whose guild cannot be fetched, so a scheduled unban never
   drained — while `realClients`/`readyAttached` leaked on every churn.

## What Was Changed

**Fix direction chosen: release the per-botId state at the adapter's own lifecycle
edges, not inside gateway.removeBot/relogin.**

The gateway reaches `destroy()` through exactly one seam — `destroyQuietly` in
`gateway.ts:280` — and funnels *every* lifecycle path through it (verified by
enumerating the call sites: `gateway.ts:319` quarantine, `:424` removeBot, `:451`
relogin swap-out, `:464` relogin failure, `:499` shutdown). Consuming the stored
stop and clearing the latch at that single seam fixes the whole class of call
sites rather than the two named ones, and it leaves `gateway.ts` untouched
(scope guard honoured).

### start.ts
1. **`stopModulesFor(botId, logger)`** (new helper): consumes the recorded module
   stop at most once, deleting the map entry **before** invoking the stop so a
   throwing stop can never leave a stale entry behind. A throwing stop is logged
   as `module-stop-failed` (id only, no error text) and never blocks teardown.
2. **`destroy()`** in the returned adapter: calls `stopModulesFor(botId, logger)`,
   then `readyAttached.delete(botId)`, then destroys the real client. In a
   `finally`, clears `realClients` **only if this client is still the registered
   one** (`realClients.get(botId) === client`), so a slow destroy of an
   already-replaced client can never evict its successor.
3. **`onClientReady`**: clears `readyAttached` for the botId at the point a live
   attach has just happened, and calls `stopModulesFor` first (covers a
   predecessor whose `destroy` **failed** — `destroyQuietly` logs and the gateway
   proceeds with a fresh client). Invariant now holds absolutely: one botId never
   has two live attaches.
4. **Ready listener is identity-guarded**: `client.once(Events.ClientReady, () => {
   if (realClients.get(botId) !== client) return; void onClientReady(...) })`.
   Without this, a late ready from a superseded client would attach its modules to
   a dead client **and** overwrite `moduleStops` — orphaning the live attach's
   polls, i.e. reintroducing defect 2 through a different door. This mirrors
   `gateway.markReady`'s existing "a late ready from a replaced entry must never
   resurrect a bot" rule (`gateway.ts:261-267`).
5. **The stale NOTE (former lines 149-151) was replaced** by a `LIFECYCLE
   OWNERSHIP (follow-up completed)` block stating the completed contract, plus
   inline rationale at each new site.

### start.test.ts (extended; a colocated test file already existed)
- Mocked `./runtime/boot-modules.js` (`attachBotModules` + `BOOT_CONFIG_SQL`) and
  upgraded the `discord.js` mock so `Client` is an `EventEmitter`-backed fake with
  the real listener surface (`once`/`on`/`off`/`emit`) — the real client is no
  longer mocked as an inert `class Client {}`. `beforeEach` resets the fake-client
  and stop-spy registries.
- New suite `discord client lifecycle ownership` (5 tests) drives the **real**
  `createDiscordClient` through `boot()`'s gateway factory:
  1. first ready attaches modules once, one-shot arm consumed, destroy stops them
     exactly once;
  2. relogin shape (destroy then re-create) re-arms ready on the replacement,
     stops the old modules first, and the resurrected bot attaches again;
  3. a late ready from a superseded client is ignored, and the live client keeps
     its single arm;
  4. a predecessor whose `destroy` throws still has its stop consumed (never
     orphaned);
  5. a client destroyed before ready attaches nothing and stops nothing.

## Verification Performed (exact commands and results)

All run in `C:\Users\xr3less\Desktop\corvus\apps\gateway`:

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Lint | `npx eslint apps/gateway/src/start.ts apps/gateway/src/start.test.ts --max-warnings 0` | 0 errors, 0 warnings |
| Format | `npx prettier --check --ignore-unknown apps/gateway/src/start.ts apps/gateway/src/start.test.ts` | clean |
| Colocated suite | `npx vitest run src/start.test.ts` | 23/23 passed |
| Full gateway suite | `npx vitest run` | **397/397 passed, 31/31 files** |

No command was run that edits package.json/lockfiles or installs anything. No git
command that restores from HEAD was run (no stash/checkout/restore/reset), and
nothing was committed.

### Guard verification (a guard is not a guard until it has been broken)
The two defects were **temporarily restored verbatim** in `start.ts` (via a copy
kept OUTSIDE the repo — never `git stash`/`git restore`) and the suite was re-run:

- Stop-consumption removed (destroy no longer consumed `moduleStops`): **3 tests
  failed** (`attaches modules ... on destroy`, `re-arms ready for the replacement
  client`, `never leaves a predecessor attach running`).
- Original permanent latch restored verbatim (`if (!readyAttached.has(botId))` with
  no clear on attach or destroy, plus the unguarded `once`): **4 tests failed**,
  including the relogin re-arm test.

The fixed baseline was then restored from the out-of-repo copy and the suite went
back to 23/23. The guards therefore fail on exactly the defects they target.

### Note on the earlier full-suite run (instrument validation)
An intermediate full-suite run showed 1 failure: `launch-blockers (real Postgres) >
C — 10k-XP storm`, at its exact 120s cap. Two facts rule my change out:
`launch-blockers.test.ts` imports only `./gateway.js`, `./store/index.js` and
`node:child_process` (never `start.ts`), and its only reference to the gateway
package is `../package.json`. The cause was the DB fixture: the repo's local
live-test default is `postgresql://corvus:corvus_ci@localhost:5434/corvus_ci`
(`launch-blockers.test.ts:37`), which was **not running** for that run, so all
10,000 XP writes rejected inside test C and it burned its timeout. Test C's
`if (PG_UNREACHABLE) ctx.skip()` does not abort an async callback, so it times out
rather than skipping — a pre-existing harness wart, outside my scope and reported
below as an observation, not changed.

I started a CI-identical throwaway container (`postgres:17`, `corvus`/`corvus_ci`,
db `corvus_ci`) bound to 5434, re-ran the full suite with every leg actually
executing, and got **397/397 green including all real-Postgres legs**. The
container was removed afterwards (`docker rm -f`), and `docker ps -a` confirms it
is gone. No production system was touched at any point.

## Proof of the Acceptance Criteria

| Criterion | Evidence |
|---|---|
| After removeBot/relogin, the stored stop is invoked; `moduleStops`/`readyAttached`/`realClients` cleared; fresh client for the same botId gets a working `ClientReady` listener that runs `attachBotModules` | Proven by test, not by reasoning-proof: tests 1 and 2 of the new suite. See `start.ts` `destroy()` (stop + latch + slot) and `onClientReady` (latch clear + re-arm on the replacement). |
| Normal first-attach behaviour unchanged (single `ClientReady` listener per live client; no double-attach) | Test 1 asserts exactly one arm and exactly one attach; test 3 asserts the live client still holds exactly one arm and the superseded client attaches nothing. |
| The file's own NOTE (former lines 149-151) updated/removed | Replaced by the `LIFECYCLE OWNERSHIP (follow-up completed)` block above `createDiscordClient`. |
| Typecheck / lint / format / suite | Table above: 0 errors, 0 warnings, clean, 397/397. |
| No secrets in diff or report | Diff scanned: no token/password/secret literals added. No secret values appear in this report; log fields added are `botId` only. |

## Assumptions Made
- **Release at the adapter seam rather than in `gateway.removeBot`/`relogin`.** Justified
  by the enumerate-consumers rule: `destroyQuietly` is the single seam every path
  already funnels through, so the fix covers quarantine and shutdown too, and keeps
  the change inside `start.ts` as the scope guard requires.
- **Clearing `readyAttached` on successful attach** (not only on destroy) is what
  makes the latch mean "an armed listener exists for the client currently in
  `realClients`" rather than "this botId was seen once". Without it, a `once`
  listener consumed by a ready that produced no attach (e.g. a failing config
  query) would permanently strand the bot.
- **Keeping the change behaviour-compatible with the existing harness**: the
  `discord.js` fake was upgraded rather than the production code being bent to fit
  an inert mock.

## Open Questions for Orchestrator
1. **Pre-existing harness wart (not changed, outside scope):** `launch-blockers.test.ts`
   test C calls `if (PG_UNREACHABLE) ctx.skip()` inside an async callback, which
   does not abort — with no Postgres reachable it burns its full 120s and fails
   instead of skipping loudly. The sibling suites (`start.test.ts`, `0011-billing`)
   use the same pattern. Worth a follow-up task if the orchestrator wants
   unreachable-DB runs to skip rather than fail.
2. **`stopModulesFor` also runs on the quarantine and shutdown paths now** (both go
   through `destroyQuietly`). That is the intended class fix — `gateway.shutdown()`
   previously left module poll timers running after disconnect, and quarantine
   (crash-loop) left the quarantined bot's polls running against a destroyed
   client. Flagging it because it is a behaviour change beyond the two named
   defects, in the direction the NOTE described.

## Public Interface Exposed
No exported symbol changed. `createDiscordClient` remains module-private; the
`GatewayClient` it returns still satisfies the same interface
(`on`/`login`/`destroy`). `stopModulesFor` is module-private. The only new log
event name is `module-stop-failed` (`{ level: 'error', event, botId }`).

## Known Limitations
- `moduleStops` is keyed by `botId` and holds at most one stop (last-writer-wins),
  which is now sound because the identity-guarded ready and the attach-time release
  make "one live attach per botId" an enforced invariant rather than an assumption.
- The tempban row-drain behaviour itself was **not** touched (`tempban.ts` is out of
  scope) — the fix stops the orphaned poll so a live client's poll can drain the
  row; it does not make tempban drop rows for unreachable guilds.
- No live Discord connection was exercised: this is a real-`Client`-shaped,
  EventEmitter-backed fake driven through the production adapter path. The
  discord.js semantics the fake relies on were verified against the installed
  package (14.27.0): `Events.ClientReady === 'clientReady'`, `Client.prototype.once`
  exists, and `destroy()` (Client → BaseClient) never removes listeners — so the
  one-shot-consumed state the tests assert matches the real client.
