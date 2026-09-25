# Task Report: fix-giveaway-cap

## Status
SUCCESS

## Objective
Fix the silent 100-entrant cap in the giveaway draw. `fetchEntrantIds` called
`reaction.users.fetch()` with no options; the installed `ReactionUserManager`
defaults to `limit = 100` with no pagination, so giveaways with more than 100
reactions drew winners from only the first 100 entrants.

## Files Touched
- MODIFIED: apps/gateway/src/runtime/games/giveaway.ts
- MODIFIED: apps/gateway/src/runtime/games/giveaway.test.ts

Both paths are inside the declared scope. No other file was touched. No manifest,
lockfile, `.env`, or config was modified; no install was run; no git command that
restores from HEAD was run; nothing was committed.

## Dependencies Added
None.

## Installed-API Truth (verified, not from memory)
Read `node_modules/discord.js/src/managers/ReactionUserManager.js` (lines 31-58):

```js
// @property {number} [limit=100] The maximum amount of users to fetch, defaults to `100`
// @property {Snowflake} [after] Limit fetching users to those with an id greater than the supplied id
async fetch({ type = ReactionType.Normal, limit = 100, after } = {}) {
  const query = makeURLSearchParams({ limit, after, type });
  ...
}
```

Confirmed against the published typings
(`node_modules/discord.js/typings/index.d.ts:5346`, `:6645`):
`fetch(options?: FetchReactionUsersOptions): Promise<Collection<Snowflake, User>>`
with `interface FetchReactionUsersOptions { type?: ReactionType; limit?: number; after?: Snowflake }`.
The contract is `{ limit, after }` and `after` is exclusive. No pagination loop
exists inside the manager — the caller owns pagination.

## The Fix
A new `collectReactants(users)` walks the reaction list page by page:

- `limit: REACTION_PAGE_SIZE` (100, the endpoint cap) with the cursor taken from
  the highest id seen, so `after` is always the documented "id greater than"
  bound. Snowflake ids sort lexicographically, so the max is the correct cursor.
- Terminates on a short page (`batch.size < REACTION_PAGE_SIZE`) — the normal
  exhaustion signal.
- Bounded by `MAX_REACTION_PAGES` (100 pages x 100 = 10 000 entrants) so an API
  that ignores `after` and keeps returning full pages cannot loop forever.
- A second, tighter guard: a full page that yields no usable id at all breaks
  immediately instead of re-fetching the identical page until the cap.
- Entrant identity is still read from the user record (`view.id`), with the
  collection key only as a fallback, and non-bot filtering is unchanged.
  **Dedup by id was added** (`Set`) because repeated ids across pages are now
  possible; the previous code had no dedup, so this is a strict tightening of the
  draw pool, never a widening — no entrant can be added or removed by it.

Draw semantics are untouched: `drawWinners` (partial Fisher-Yates, bot exclusion,
prior-winner exclusion, uniform pick) is byte-for-byte unchanged. Only the entrant
collection became complete.

### Verified detail the unit fake cannot prove
The real REST layer drops an `undefined` `after` rather than sending
`after=undefined`. Ran `makeURLSearchParams` from the installed
`@discordjs/rest`:

```
page1 ({limit:100, after: undefined, type:0}) -> "limit=100&type=0"          (no after param)
page2 ({limit:100, after: '000099', type:0})  -> "limit=100&after=000099&type=0"
```

So page 1 is a clean first page and page 2 onward is properly cursored.

## Tests Added
Existing fakes were upgraded rather than replaced: `fakeMessageWithReactants` now
serves the real `{ limit, after }` contract via `pagedUsersFetcher`, which honours
`limit`, the exclusive `after` cursor, and ascending-id order, and records each
cursor it was called with. This was necessary — the old fake ignored its argument
entirely, so it could not have detected the cap.

New tests (6, in `fetchEntrantIds pagination (the 100-entrant cap)`) plus 1
end-to-end test on the real poll path:

1. 137 entrants => 137 returned; cursors asserted as `[undefined, ids[99]]`
   (proves exactly two pages, correctly resumed).
2. Winners drawn from the full 137-set — the 5th pick reaches `ids[136]`, an
   entrant a 100-cap draw cannot reach.
3. A 30-entrant reaction costs exactly one request (short page ends the walk).
4. A never-short-paging API stops at exactly `MAX_REACTION_PAGES` calls.
5. Bot filtering and cross-page dedup hold (100 humans + 1 bot + 1 duplicate).
6. No reaction on the message => `[]`.
7. End-to-end `pollGiveaways` on a 137-entrant giveaway: asserts cursors
   `[undefined, ids[99]]` and 20 winners all drawn from the full set.

## Verification Evidence (all commands run on the merged tree, not per-agent)
- Guard-break check (Scar Tissue rule 8 — broke the guard and watched it fail):
  the original buggy `reaction.users.fetch()` was temporarily reintroduced and
  **exactly the 3 cap-specific tests failed**, with the reported symptom visible
  in the assertion output: `expected [ '000000', …(97) ] to have a length of 137
  but got 100`. The fix was then restored and re-verified as identical to the
  pre-break file, with no `TEMP-BREAK` marker remaining.
- `npx vitest run` (apps/gateway, full suite): **31 files, 392 tests passed**.
  Pre-existing giveaway tests all still pass (18 in that file, up from 12).
- `npx tsc --noEmit -p apps/gateway/tsconfig.json`: exit 0, zero errors.
- `npx eslint <both files> --max-warnings 0`: exit 0, zero warnings.
- `npx prettier --check <both files>`: "All matched files use Prettier code style!"

## Assumptions Made
- `REACTION_PAGE_SIZE = 100` and `MAX_REACTION_PAGES = 100` are exported so the
  tests assert against the real constants instead of duplicating literals. 10 000
  entrants is far above any realistic giveaway while keeping the poll bounded.
- Dedup was added (see above); justified as a strict tightening because
  pagination makes repeated ids reachable.
- `fetchEntrantIds` was changed from module-private to exported so pagination
  could be tested directly. It is additive to the module's public surface and no
  existing export changed.

## Open Questions for Orchestrator
1. **A second instance of the same defect exists outside my scope.**
   `apps/testbot/src/games/giveaway.ts:170` has the identical call:
   `const users = await reaction.users.fetch();` with no options and no
   pagination. It is the same class of defect and is NOT fixed by this task
   because testbot was not in my write scope (Scar Tissue rule 2 — enumerate
   every site sharing the class). A repo-wide grep for `users.fetch|reaction.users`
   across `**/*.ts` returns exactly these two sites; the gateway one is fixed and
   testbot is the only remaining one. Recommend a follow-up task to port the same
   `collectReactants` walk to testbot. Note testbot's line also lacks the id
   fallback and has no dedup, so it needs the full treatment, not just the paging.
2. The end-to-end test asserts the winner count and pool membership but draws with
   real `Math.random`; the deterministic paging proof is the cursor assertion, not
   the winner identities. Flagging so the reviewer does not read that test as
   asserting a specific winner set.

## Public Interface Exposed
New exports from `apps/gateway/src/runtime/games/giveaway.ts`:

```ts
export const REACTION_PAGE_SIZE = 100;   // Discord's per-request cap
export const MAX_REACTION_PAGES = 100;   // 100 x 100 = 10 000 entrants max

export async function fetchEntrantIds(
  message: Message,
  emoji: string,
): Promise<string[] | null>;             // was module-private; now exported
```

All pre-existing exports are unchanged in name, signature, and behaviour.

## Known Limitations
- This task fixes the gateway module only. The testbot duplicate remains (see
  Open Question 1).
- If a giveaway exceeds 10 000 reactions, entrants past that point are silently
  omitted. The cap is deliberate (infinite-loop protection) and 10 000 is far
  above the realistic case; no log line is emitted when the cap is hit.
- The paging walk is sequential rather than concurrent, so a very large reaction
  list adds one round-trip per 100 users. The giveaway poll runs on a 60s tick
  and expires each row sequentially already, so this matches the existing design;
  no timeout or backoff was added.
- Not exercised against a live Discord reaction endpoint (no production touch
  permitted). The contract was verified against the installed package source and
  its typings, and against the installed REST query serializer.
