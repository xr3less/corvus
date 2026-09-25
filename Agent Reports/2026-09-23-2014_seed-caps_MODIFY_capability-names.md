# Task Report: seed-caps-kindnames

## Status
BLOCKED — task premise is factually false; the requested change would break the product. No source file
was modified. Escalated per SCOPE GUARD. Full verification evidence below.

## Files Touched
- CREATED: Agent Reports/2026-09-23-2014_seed-caps_MODIFY_capability-names.md (this report)
- MODIFIED: none
- DELETED: none

`apps/gateway/src/db/seed-templates.ts` is **untouched** — `git diff HEAD --stat` on it is empty.

## Dependencies Added
- None. No manifest read-modify-write, no install commands run.

---

## Why this is BLOCKED (the instrument, not the instance)

The task premise was: *"giveaway-grove (:308) and coin-cellar (:350) capabilities must use
RUNTIME_KINDS vocabulary — remove leveling/logging/economy which are NOT runtime kinds."*

That premise conflates **two deliberately distinct closed vocabularies** that coexist by design in this
codebase. `templates.capabilities` is **not** a RUNTIME_KINDS column.

| Vocabulary | What it describes | Members (on disk) | Truth source | Count |
|---|---|---|---|---|
| `RUNTIME_KINDS` | *executable behavior kinds* on `bot_runtime_config.kind` | welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles | `apps/gateway/src/runtime/config.ts:11-20` (mirrored `apps/web/app/api/spec/publish/route.ts:67`) | 8 |
| `VALID_CAPABILITIES` | *invite permission sets* on `templates.capabilities` | welcome, moderation, tickets, leveling, reaction-roles, logging | `apps/web/lib/invite/permissions.ts:11-18` | 6 |

The two sets are bridged — not merged — by pure mapper functions:
`kindToCapabilities` (`apps/web/app/api/invite/route.ts:18-39`) and `capabilityForKind` /
`capabilitiesFromSpec` (`apps/web/app/api/preflight/start/route.ts:157-192`).

**They are intentionally not equal.** `leveling`, `logging` and `economy` are absent from RUNTIME_KINDS
*because they are not executable behaviors* — they are product-facing capability/permission names. That
is the design, not drift:

- `apps/gateway/src/db/v13.ts:10-11` (the column's own contract comment): *"`capabilities` is a
  non-empty subset of the **invite** vocabulary (welcome|moderation|tickets|leveling|reaction-roles|logging)."*
- `apps/gateway/src/db/seed-templates.ts:10-13`: `perms_needed` pairs are *"copied VERBATIM from
  CAPABILITY_MAP … T-fork's seam test proves the subset structurally, so the copy must stay exact."*

### The change would break two working flows

**1. Fork route returns HTTP 500 for both templates.** `apps/web/app/api/templates/[slug]/fork/route.ts:165-174`
validates the row with `isCapability` and 500s (`'template data invalid'`) on any unknown token — a
deliberate quality gate ("this is the runtime proof of seed quality"). Probe run on the **real imported
predicate**, not a re-implementation:

```
RUNTIME_KINDS      = welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles
VALID_CAPABILITIES = welcome, moderation, tickets, leveling, reaction-roles, logging
intersection       = welcome, moderation, tickets, reaction-roles

[TARGET   ] giveaway-grove
             current  caps=["welcome"]   fork=OK 200
             proposed caps=["giveaway"]  fork=FAIL 500  <-- BREAKS
[TARGET   ] coin-cellar
             current  caps=["leveling"]  fork=OK 200
             proposed caps=["xp"]        fork=FAIL 500  <-- BREAKS
```

Because the change **removes the only valid capability** from each row, the fork route's `null` branch
fires and both template forks fail 500 (a silently uninstallable bot if it ever did mint).

**2. The seam test goes red.** `apps/web/app/api/templates/templates.test.ts:681-708` filters each
stored row's capabilities through `isCapability` and then asserts
`capabilities.length > 0` (line 697) and that every `perms_needed.perm` is in the mapped `allowed` set.
With only `giveaway`/`xp` present, the filter empties the array → `expect(0).toBeGreaterThan(0)` fails.

**3. The seed unit test goes red.** `apps/gateway/src/db/seed-templates.test.ts:22-45` pins capabilities
as `giveaway-grove → ['welcome']` and `coin-cellar → ['leveling']` (the SPEC-locked 8-template table),
and lines 73-80 assert every capability is a member of the 6-member `INVITE_VOCAB`.

### The current values are the least-privilege-correct ones (not arbitrary)

- `giveaway-grove → ['welcome']` is deliberate: `kindToCapabilities('giveaway')` returns `['welcome']`
  (`invite/route.ts:26-27`) — single-posting behaviors need only post + embed.
  `capabilityForKind` documents the same reasoning verbatim at `preflight/start/route.ts:186-187`:
  *"No giveaway capability exists; the giveaway-grove seed proves these bots need exactly the welcome
  permission set, so derive that."*
- `coin-cellar → ['leveling']` is deliberate: `kindToCapabilities('xp')` returns `['leveling']`
  (`invite/route.ts:24-25`), and `capabilityForKind` maps the whole economy family
  (`earn, balance, shop, gamble, economy`) to `leveling` with coin-cellar named as the proof at
  `preflight/start/route.ts:157-172`.

This independently reproduces the earlier finding in
`Agent Reports/2026-09-23-1228_landfix_FIX_landing-minors.md:150` — *"finding #1's premise — that
`templates.capabilities` must hold RUNTIME_KINDS — is false"* — and the reviewer's PASS at
`Agent Reports/2026-09-23-1305_reviewer_REVIEW_landfix-wave.md:152-157`. This task is the third
instance of the same false premise. Per LESSONS §1 (fix the harness, not the instance), the *task-issuing
template* — not the seed file — is the defect site.

## OSS research (live sources, cited)

10-minute scan of OSS Discord-bot projects for capability-naming practice. Every catalog found names
**public capabilities in product vocabulary**, while reserving its internal runtime/behavior identifiers
for code — exactly this codebase's split. No OSS project found that publishes internal runtime-kind
tokens to end users.

| Repo | Observed practice |
|---|---|
| `ihrz/ihrz` (iHorizon, TS + discord.js, 340+ commands) | Public feature taxonomy: "Moderation & Security", "**Leveling** & Progression", "**Economy**", "**Logging**". Internal "module" concept kept separate from user-facing naming. |
| `aloushomar2013-oss/TitanBot` (discord.js v14 + Postgres) | README sections: "**Leveling** & XP System", "**Economy**", "**Logging**"; `XP Tracking` is a *sub-feature label*, not the category name. |
| `luckav-dev/BotOnyxApplications` (discord.js v14) | "**Advanced Logging System**", "**Economy**"/payment, "Giveaway System" as public categories; runtime internals never surfaced. |
| `rushinski/Discord-Bot-Unity` | "**Leveling** & Leaderboards", "**Logging**" (channel `logs`, `events/logging`) — folder naming mirrors product taxonomy. |

Conclusion: the repo already follows the dominant OSS convention (`leveling`/`logging`/`economy` as the
public capability names). The requested edit would move it *away* from best practice.

## Verification (commands run, real output)

| Check | Command | Result |
|---|---|---|
| Target file untouched | `git status --porcelain apps/gateway/src/db/seed-templates.ts` | empty (clean at HEAD) |
| HEAD matches brief | `git rev-parse HEAD` | `d9cf8d77c162b06ca9f312fa59a850b6d60f5c56` ✓ matches `d9cf8d7` |
| Grep (acceptance item) | `grep -nE "leveling\|logging\|economy" apps/gateway/src/db/seed-templates.ts` | 7 lines: 92, 177, 178, 263, 264, 348, 349 — **all valid**: L92/178/264/349 are `capabilities` entries, all ∈ VALID_CAPABILITIES; L177/263/348 are `category`, whose 8 locked names legitimately include leveling/logging/economy (`v13.ts:6-8`). Zero genuine drift. |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` (apps/gateway) | **exit 0** |
| Full gateway suite | `npx vitest run` (apps/gateway) | **35 files passed / 464 tests passed / 464** — baseline reproduced exactly |
| Fork-route predicate | `npx tsx` probe importing real `isCapability` + `VALID_CAPABILITIES` + `TEMPLATE_SEEDS` | see table above — proposed values → 500 |

Did not run (not applicable — no file modified): eslint on touched file, prettier on touched file.

## What I did NOT do (SCOPE GUARD compliance)
- Did not modify any file in or out of scope.
- Did not rename any slug.
- Did not touch `apps/web/**`, `config.ts`, `permissions.ts`, `v13.ts`, or any test.
- No git stash / checkout / restore / reset (LESSONS §6). No commit, no push.
- No secrets read or printed. No production/build box contact. No install, no manifest edit.
- Did not delete `AGENTS.md`.

## The real finding #4 (redirect target for the orchestrator)

The genuine 6-vs-8 drift named by `2026-09-23-1240_inspect-docs-ci_REVIEW_docs.md:23` lives **only** in
these places — none of which is the seed file:

1. `Docs/PLAN.md:197` — "her şablon **6-kind** çevirmene oturan" → should read 8-kind.
2. `apps/web/app/api/spec/rollback/route.ts:18` — comment names the 6-kind list, missing tickets/reaction-roles.
3. `rollback.test.ts:115-116` — `FALLBACK_DDL` CHECK constraint still lists 6 kinds.
4. `rollback.test.ts:132-137` — `ensurePg` sources omit `0013`.
5. `apps/web/app/api/spec/publish/route.ts` (mirror) — per the E1b report, already widened to 8; verify still true.

`apps/gateway/drizzle/0013_runtime_kinds_tickets.sql:14` already carries the correct 8-kind CHECK; the
catalog in `apps/gateway/src/db/schema.ts:111-114` already lists 8. Those are the RUNTIME_KINDS sites and
they are correct.

## Assumptions Made
- Read finding #4 and SPEC E1 scope as whitelisted; both were used only to establish that no
  `templates.capabilities`→RUNTIME_KINDS requirement exists in the locked plan. It does not.
- Treated `title`/`detail` prose, `category`, and `kind` fields (e.g. `kind: 'xp'`, `kind: 'earn'`) as
  out of scope for the grep — `source_spec.behaviors[].kind` is explicitly "opaque plain-language"
  (`seed-templates.ts:14-16`) and legitimately uses free-form tokens like `earn`/`shop`/`gamble`.
- The evidence above was gathered read-only; no production or DB contact.

## Open Questions for Orchestrator
1. **The false premise has now recurred 3×** (`landfix` fix report, `landfix` reviewer, this task). Per
   LESSONS §1 this is a harness defect, not an instance defect. Recommend the SPEC/task templates stop
   asserting a `templates.capabilities ⊆ RUNTIME_KINDS` invariant and instead cite the two-vocabulary
   bridge. Shall I draft that amendment?
2. Confirm the redirect: should the real finding-#4 fixes (items 1–4 above, all docs/test-only, low risk)
   be re-scoped as one atomic task? Note `rollback.route.ts:18` and `rollback.test.ts` are in
   `apps/web`, and PLAN.md is founder-owned living documentation — three different owners.
3. Does any *other* open task in this wave carry the same false `capabilities ⊆ RUNTIME_KINDS` premise?
   If so it should be cancelled before spawning, not after.

## Public Interface Exposed
None — no code changed.

## Known Limitations
- The gateway runtime behavior behind `RUNTIME_KINDS` was not exercised (out of scope; no production contact).
- The fork route was proven broken **by its own predicate in a probe**, not by driving the live HTTP
  endpoint against a seeded DB (would need a live Postgres + session; the predicate at
  `fork/route.ts:166-171` is the exact gate, and `templates.test.ts:681-708` covers it in CI).
- OSS survey covered 4 repos surfaced by one live search plus README fetches; it is a directional
  convention check, not an exhaustive catalog census.

## Acceptance Criteria — actual outcome

| Criterion | Outcome |
|---|---|
| giveaway-grove + coin-cellar capabilities contain only RUNTIME_KINDS; grep returns zero | **NOT DONE — and must not be done.** Premise false; change would 500 both forks. Grep reported above: 7 lines, all legitimately in `category` or `capabilities` position; zero real drift. |
| `npx tsc --noEmit -p tsconfig.json` exit 0; eslint + prettier clean on touched file | tsc **exit 0** ✓. No touched file, so eslint/prettier N/A. |
| Seed suite + full gateway suite green (baseline 464/464) | **464/464 green** ✓ (35 files), baseline reproduced. |
| No secrets/prod/git-restore/commit; no slug renames | ✓ compliant. |
