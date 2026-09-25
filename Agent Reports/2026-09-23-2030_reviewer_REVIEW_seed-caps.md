# Task Report: reviewer-seedcaps-2014

## Status
PASS — builder's BLOCKED refusal was correct. The requested rename (giveaway-grove caps → giveaway, coin-cellar caps → xp) would 500 both forks and red two test suites. Do NOT rename.

## Files Touched
- CREATED: Agent Reports/2026-09-23-2030_reviewer_REVIEW_seed-caps.md (this report)
- MODIFIED: none
- DELETED: none

## Dependencies Added
- None.

## Assumptions Made
- Treated the builder report as a claim and re-verified every cited line on disk at HEAD d9cf8d7 rather than trusting its quotes.
- `tsx` probe run from repo root resolves the real `isCapability` predicate and both vocabularies; no re-implementation.
- gateway typecheck run as `npx tsc --noEmit -p apps/gateway/tsconfig.json` (bare `-p tsconfig.json` does not exist from root — builder's command string assumed cwd apps/gateway).

## Open Questions for Orchestrator
- None blocking. Note: two of the four finding-#4 redirect sites the builder listed as open are already fixed on disk (see Verification rows 9-10); do not re-task them. Only `Docs/PLAN.md:197` wording and the `rollback/route.ts:18` comment remain worth a docs-only touch-up, and they are cosmetic, not drift.

## Public Interface Exposed
None — no code changed. Read-only adjudication.

## Known Limitations
- Fork breakage proven via the route's exact gate predicate (`isCapability` on the real import) plus the route's null-branch code read, not by driving the live HTTP endpoint against a seeded Postgres (would need live DB + session).
- Full gateway suite (464) not re-run; focused seed suite (9/9) + typecheck re-run. Builder's 464/464 claim accepted on the strength of untouched-tree evidence (git clean on the seed path) plus the focused re-run.
- No OSS re-survey; builder's convention table accepted as directional, not re-audited.

## Verification

| # | Claim in BLOCKED report | What I checked | Result |
|---|---|---|---|
| 1 | RUNTIME_KINDS = 8 (welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles) | Read `apps/gateway/src/runtime/config.ts:11-20` | CONFIRMED — exact 8, verbatim |
| 2 | VALID_CAPABILITIES = 6 (welcome, moderation, tickets, leveling, reaction-roles, logging) | Read `apps/web/lib/invite/permissions.ts:11-18` | CONFIRMED — exact 6, verbatim |
| 3 | Column contract: `capabilities` is a non-empty subset of the invite vocabulary | Read `apps/gateway/src/db/v13.ts:10-11` | CONFIRMED — comment states invite vocabulary explicitly |
| 4 | Seed header: perms copied VERBATIM from CAPABILITY_MAP, seam-tested | Read `apps/gateway/src/db/seed-templates.ts:10-13` | CONFIRMED |
| 5 | giveaway-grove caps `['welcome']` (:308), coin-cellar caps `['leveling']` (:350) | Read `seed-templates.ts:304-349` | CONFIRMED — rows match builder's quotes |
| 6 | Fork route 500s on unknown capability token (`fork/route.ts:165-174`) | Read fork route :159-181 | CONFIRMED — `capabilities === null → error(500, 'template data invalid')` when any token fails `isCapability`; comment :179 calls it "the runtime proof of seed quality" |
| 7 | `kindToCapabilities` maps giveaway→welcome, xp→leveling (`invite/route.ts:18-39`) | Read invite route :18-39 | CONFIRMED — :24-27 exact |
| 8 | `capabilityForKind` maps economy family→leveling, giveaway family→welcome, naming both seeds as proof (`preflight/start/route.ts:157-192`) | Read preflight route :157-192 | CONFIRMED — :170-172 and :186-187 carry the coin-cellar / giveaway-grove proof comments verbatim |
| 9 | Seed unit test pins giveaway-grove→welcome, coin-cellar→leveling + INVITE_VOCAB subset (`seed-templates.test.ts:22-45,73-80`) | Read seed test :8-80; ran `npx vitest run src/db/seed-templates.test.ts` in apps/gateway | CONFIRMED — LOCKED_ROWS :38-44 pin exact values; INVITE_VOCAB :19 has 6; re-run: **9/9 passed** |
| 10 | Seam test filters through `isCapability` + asserts non-empty + perms subset (`templates.test.ts:681-708`) | Read templates.test.ts :681-711 | CONFIRMED — :694-697 filter + `toBeGreaterThan(0)`; proposed caps would empty the array → red |
| 11 | Proposed caps fail fork, current caps pass — on REAL predicate | `npx tsx --eval` importing real `isCapability`, `VALID_CAPABILITIES`, `RUNTIME_KINDS` (method: code read + live probe, not re-implementation) | CONFIRMED — output: `["welcome"] -> OK 200`, `["leveling"] -> OK 200`, `["giveaway"] -> FAIL 500`, `["xp"] -> FAIL 500` |
| 12 | `seed-templates.ts` untouched | `git diff HEAD --stat` + `git status --porcelain` on that path; `git rev-parse HEAD` | CONFIRMED — both empty; HEAD `d9cf8d77c162b06ca9f312fa59a850b6d60f5c56` matches builder's `d9cf8d7` |
| 13 | tsc exit 0 | `npx tsc --noEmit -p apps/gateway/tsconfig.json` from root (bare `-p tsconfig.json` does not exist — see Assumptions) | CONFIRMED — exit 0, no output |

## Finding-#4 redirect sites — on-disk state (do not edit)

| Site (builder's list) | On-disk truth | Covered already? |
|---|---|---|
| 1. `Docs/PLAN.md:197` "her şablon 6-kind çevirmene oturan" | Line present verbatim (founder-owned Turkish plan text) | NOT covered — cosmetic wording only; needs "8-kind" if touched at all. Docs-only, low risk. |
| 2. `apps/web/app/api/spec/rollback/route.ts:18` "comment names the 6-kind list" | Inaccurate description: :18 lists 5 kinds (`welcome/moderation/xp/giveaway/connector`), missing status/tickets/reaction-roles. It is an illustrative comment, not a vocabulary fence — the route reuses publish's translator by import (:35-40). | NOT covered — cosmetic comment only; no behavioral drift. |
| 3. `rollback.test.ts:115-116` FALLBACK_DDL 6-kind CHECK | STALE — on-disk FALLBACK_DDL (:125-126, :134-135) already carries the 8-kind CHECK with explicit 0012-vs-0013 commentary (:105-116). | COVERED — already fixed; do not re-task. |
| 4. `rollback.test.ts:132-137` ensurePg omits 0013 | STALE — on-disk `ensurePg` (:149-158) already sources `0013_runtime_kinds_tickets.sql` with a comment naming the widening. | COVERED — already fixed; do not re-task. |
| 5. `publish/route.ts` RUNTIME_KINDS mirror | Confirmed 8-kind at :67-76 with mirror comment :66. `expectKindSet` fence test (:324-349) asserts set AND size. | COVERED — correct; verify-only. |

Net: the genuine 6-vs-8 drift the builder redirected to is **already repaired in code/tests**; what remains is two cosmetic comment/plan-wording spots. No rollback-kinds-test wave is needed for items 3-5.

## Verdict
PASS. BLOCKED was correct: `templates.capabilities` uses the VALID_CAPABILITIES invite vocabulary by column contract, and the proposed RUNTIME_KINDS rename fails the fork gate's real predicate (500) and reds both the seed unit test and the seam test. The current `['welcome']` / `['leveling']` values are least-privilege-correct per both mapper functions' own proof comments. No rename, no edits.

## Acceptance Criteria — actual outcome
- Real-predicate probe (current OK / proposed FAIL): DONE, see row 11.
- Seed file untouched at HEAD: DONE, see row 12.
- Typecheck + focused suite green: DONE (tsc exit 0; seed suite 9/9), see rows 9/13.
- Redirect-site disposition without editing: DONE, see table above.
