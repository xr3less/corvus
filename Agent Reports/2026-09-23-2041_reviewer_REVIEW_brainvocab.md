# Task Report: reviewer-brainvocab-2014

## Status
PASS

The builder's refusal was correct on the merits, and the delivered guard is sound, additive, and verified by my own independent test runs. No source edits were made by this reviewer.

## Files Touched
- CREATED: Agent Reports/2026-09-23-2041_reviewer_REVIEW_brainvocab.md (this file)
- MODIFIED: nothing
- DELETED: nothing

## Dependencies Added
- None.

## Assumptions Made
- The trialcopy hunk in `brain.ts` vs HEAD (PRICING_REPLY `full Pro` -> `1 bot, 100 credits`) is attributed to the prior trialcopy wave, not this task, because the builder's report states it and the hunk's content matches that wave's product-truth numbers; this reviewer verified the diff contains only that hunk but did not independently check the pre-task hash.
- The builder's Probe A/B/C readings are accepted on the strength of (a) this reviewer's own code-read confirmation that synchronised drift is invisible to the pre-existing pins, plus (b) my own green focused runs proving the suite shape — per the scope guard, no prod mutation was performed by this reviewer to re-prove them.
- `apps/gateway/src/runtime/config.ts` (the brief's named RUNTIME_KINDS source) is untracked, so the runtime 8-tuple was corroborated against the tracked `packages/ai/src/builder-prompt.ts:19` instead, exactly as the builder did.

## Open Questions for Orchestrator
1. **Plan-level premise recurrence (the substantive escalation, upheld).** This task's brief re-asserted a premise already independently rejected twice: `Agent Reports/2026-09-23-1228_landfix_FIX_landing-minors.md` and PLAN.md:194's upheld finding-#1 both concluded TEMPLATE_REPLY names the template gallery, not the runtime kinds. This builder reached the same conclusion a third time with machine verification. Recommend closing the "rewrite template reply to RUNTIME_KINDS" premise permanently at the plan level so it does not re-enter as a fourth task.
2. **Tracker gap (concur).** `apps/gateway/src/runtime/config.ts` is untracked in git; any future brief citing it by path cites a file absent from a CI checkout. Recommend either tracking it or citing the tracked mirror (`packages/ai/src/builder-prompt.ts:19`).

## Public Interface Exposed
- No exported type, function signature, route, or data shape changed by the reviewed task. `scriptedBrain`, `DemoBrain`, and all reply constants are unchanged in source beyond the pre-existing trialcopy hunk.
- Test-only additions under review (module-local, not exported): `TEMPLATE_CATEGORIES`, `NON_TEMPLATE_KINDS`, `listedCategories(reply)`, plus one new `describe` block with 4 tests.

## Known Limitations
- Full suite was not run by this reviewer (moving tree, expensive). Verdict rests on focused suites (19/19, 33/33) plus code-read proof that `brain.ts` is an import-free leaf that cannot influence other suites. The builder's moving-tree account (sibling wave editing `page.test.tsx`, `chat/route.test.ts`) is consistent with what I observe but was not re-proven here.
- Mutation probes were verified by code read, not re-executed (scope guard forbids prod mutation by the reviewer).
- No real-path browser render was performed; the demo reply is exercised through `scriptedBrain.reply()` plus the demo route suite, which is proportionate for a copy/pin task.

## Verification

| # | Claim under review | Result |
|---|---|---|
| 1 | TEMPLATE_REPLY names the 8 template-gallery categories, order-for-order vs `seed-templates.ts` + LOCKED_CATEGORIES | CONFIRMED. On-disk reply lists `welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy`; seed rows (`seed-templates.ts:50-348`) carry `welcome, moderation, tickets, leveling, reaction-roles, logging, giveaways, economy` in that exact order; `LOCKED_CATEGORIES` (`seed-templates.test.ts:8-17`) matches identically. One display normalization: reply renders `reaction roles` (space) vs seed `reaction-roles` (hyphen); the guard's `TEMPLATE_CATEGORIES` correctly uses the display form. `xp`/`connector`/`status` appear in none of the 8 seed categories. |
| 2 | `xp`/`connector`/`status` name no forkkable template | CONFIRMED. The runtime 8-tuple (`builder-prompt.ts:19`: `welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles`) contains exactly three kinds absent from all seed categories: `xp`, `connector`, `status`. Rewriting the gallery reply to that tuple would misdescribe the gallery. The inverse trap noted by the builder is real: `leveling`/`logging`/`economy` are genuine gallery categories. |
| 3 | `brain.ts` carries only the trialcopy hunk vs HEAD | CONFIRMED by own run. `git diff HEAD -- apps/web/lib/demo/brain.ts` shows exactly one hunk: PRICING_REPLY `full Pro` -> `1 bot, 100 credits` (plus line-wrap). `git status --porcelain -- apps/web/lib/demo/` shows exactly two `M` entries (`brain.ts`, `brain.test.ts`), zero `??`. No builder-introduced source edit. |
| 4 | `brain.test.ts` changes are purely additive (+4 tests, no assertion logic altered) | CONFIRMED by own diff read. +73-line block: two constants, `listedCategories`, one `describe` with 4 tests. One expected constant sync: the test's own `PRICING_REPLY` literal follows the trialcopy source change (required — otherwise trigger pins would red); no assertion logic touched. |
| 5 | Synchronised-drift blindness of pre-existing pins (Probe C premise) is real by code read | CONFIRMED. All pre-existing trigger assertions compare live `scriptedBrain.reply()` output against the test file's own duplicated `TEMPLATE_REPLY` constant (e.g. lines 79-81, 83-85, 110-112). A mutation applied to both source and test constant passes every one of them; only the new guard — which compares against the independently-sourced `TEMPLATE_CATEGORIES` list — can catch it. The builder's Probe C reading (3 red, all new guard) follows necessarily from this structure. No prod mutation performed by this reviewer. |
| 6 | PRICING_REPLY preserved + pinned with product-truth numbers | CONFIRMED. `brain.ts:9-10` and `brain.test.ts:8-9` carry byte-identical `'Pro is $10/mo, Studio $29/mo. Trials run 3 days, 1 bot, 100 credits, no card'`. Anchors on disk: `session.ts:102` (`TRIAL_GRANT_CREDITS = 100`), `session.ts:198` (`interval '3 days'`), `lib/bots.ts:50` (`TRIAL_DEAL = 'Free 3-day trial — 1 bot, 100 AI credits.'`). Zero `full Pro` wording remains in either file (own grep-equivalent via Read). |
| 7 | Same-class sweep: no other user-facing surface names a runtime-only kind | CONFIRMED by own grep over `apps/web` `*.{ts,tsx}`. `xp`/`connector`/`status` hits are exclusively: a11y `role="status"`, HTTP `res.status`, `bot.status`/`message.status` state fields, and one `DiffView.test.tsx` fixture id (`xp-rate`). None is user-facing feature copy. The class has exactly one member (TEMPLATE_REPLY) and it is correct as written. |
| 8 | Gates: tsc / eslint / prettier | ALL GREEN by own runs. `tsc --noEmit` exit 0. `eslint lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` exit 0, zero warnings. `prettier --check` on both files: "All matched files use Prettier code style!" |
| 9 | Focused suites | GREEN by own runs. `brain.test.ts` alone: 19 passed / 19. `brain.test.ts` + `app/api/demo/message/message.test.ts`: 33 passed / 33 across 2 files. |

### Verbatim probe readings (this reviewer, 2026-09-23)
```
brain.test.ts alone:                Tests 19 passed (19)
brain + demo message route:         Tests 33 passed (33), 2 files
tsc --noEmit:                       exit 0
eslint --max-warnings 0:            exit 0
prettier --check (both files):      clean
git diff brain.ts vs HEAD:          1 hunk only (trialcopy PRICING_REPLY)
git status apps/web/lib/demo/:      M brain.test.ts, M brain.ts (exactly 2, no untracked)
```
