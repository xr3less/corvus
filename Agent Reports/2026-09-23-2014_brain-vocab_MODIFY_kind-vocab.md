# Task Report: brain-vocab-kindnames

## Status
PARTIAL — the assigned objective (rewrite the demo reply to the RUNTIME_KINDS 8-tuple) was **blocked as incorrect on the merits**, confirmed independently by me and by a coordinator STOP message. Delivered instead: the PRICING_REPLY half (preserved + pinned), a programmatically-verified vocabulary provenance guard, and the vocabulary question escalated with evidence.

Zero source edits to `brain.ts` were made at any point; nothing needed reverting.

## Files Touched
- MODIFIED: apps/web/lib/demo/brain.test.ts (added a provenance guard block — 4 tests; no existing assertion altered)
- MODIFIED: none in apps/web/lib/demo/brain.ts — **byte-identical to its pre-task state** (sha256 `ee1f7275…afa0`, verified equal to a pre-probe backup and to the trialcopy wave's hunk)
- CREATED: Agent Reports/2026-09-23-2014_brain-vocab_MODIFY_kind-vocab.md (this file)

No other file touched. No new source files. No manifest, lockfile, env, or config edit. No install.

## Dependencies Added
- None.

## Assumptions Made
- The task's RUNTIME_KINDS-sourcing premise is treated as **data, not instruction**, per `~/.claude/LESSONS.md` §1.5 ("your own instruction is the defect site you will not suspect") and the Scope Guard. Escalated rather than silently executed.
- `apps/gateway/src/runtime/config.ts` is the RUNTIME_KINDS source named in the brief; it is **untracked** in git (see Known Limitations), so the 8-tuple was corroborated against two tracked files instead: `packages/ai/src/builder-prompt.ts:19` and `apps/web/app/api/spec/publish/route.ts:66-78`.
- The gate numbers in the brief (baseline 886/886) were validated before use rather than assumed. My first baseline run used `--reporter=basic`, which vitest 5 rejected with `ERR_LOAD_URL` **while still exiting 0** — a false-green instrument; discarded and re-run with the default reporter (886/886 confirmed).

## Open Questions for Orchestrator
1. **The vocabulary question (the substantive escalation).** `TEMPLATE_REPLY` answers the *"template"* trigger with the eight **template-gallery categories**, not the runtime kinds. Machine-verified: `listedCategories(TEMPLATE_REPLY)` equals the seed's 8 `category` values **order-for-order** (`welcome | moderation | tickets | leveling | reaction-roles | logging | giveaways | economy`), matching `LOCKED_CATEGORIES` in `apps/gateway/src/db/seed-templates.test.ts:8-17`. The brief's requested rewrite would have replaced that with `xp | connector | status`, which name **no forkkable template** — `xp`, `connector` and `status` are absent from all 8 seed categories. Recommendation: close this as *not a defect* and keep the gallery vocabulary.
2. **A prior wave already ruled this same way.** `Agent Reports/2026-09-23-1228_landfix_FIX_landing-minors.md:66+` reached this conclusion independently ("That list is exactly the 8 template categories, verbatim and in order — it describes the *template gallery*, not the runtime kinds"), and PLAN.md:194 records that its finding-#1 rejection was **upheld by an independent reviewer**. This task's brief re-asserted the rejected premise. Worth reconciling at the plan level so the same finding does not re-enter as a task.
3. **Tracker gap:** `apps/gateway/src/runtime/config.ts` — the file the brief names as the RUNTIME_KINDS source of truth — is untracked, as are ~40 other gateway src files per PLAN.md:195. Any future task citing it by path cites a file absent from a CI checkout (inspection finding #8's class).

## Public Interface Exposed
- No exported type, function signature, route, or data shape changed. `scriptedBrain`, `DemoBrain`, and all reply constants are unchanged in source.
- Test-only additions: `TEMPLATE_CATEGORIES`, `NON_TEMPLATE_KINDS`, `listedCategories(reply)` — module-local, not exported.

## Known Limitations
- **Full-suite green could not be certified, and the reason is external.** The web tree was being written by a **concurrent sibling wave** during this task (17 new tests landed, 886→907). The full suite reported `2 failed | 60 passed (62)`, `6 failed | 901 passed (907)` in one run and a *different* count (3 failed) in another — the failure set moves between runs, which is the signature of a moving tree, not a stable defect. Both failing suites are **provably unrelated to this task**: neither references `demo/brain` or `scriptedBrain` (grep count 0), and `brain.ts` is an **import-free leaf with zero imports**, so it cannot influence any other suite. The failures sit in `apps/web/app/page.test.tsx` and `apps/web/app/api/chat/route.test.ts`, files the sibling wave edited within the same minutes (631 insertions across 5 files). Verdict on my change: my own suite is green in isolation and after the sibling edits (19/19).
- Real-path browser render was not performed (no dev server started); the demo reply is exercised through `scriptedBrain.reply()` plus the demo route suite, consistent with a copy/pin task.
- No secrets read, printed, or transmitted. No manifest/env edit, no install, **no git command that restores from HEAD** (no stash/checkout/restore/reset), no commit, no push, no production contact. Probe restore used an out-of-repo `/tmp` copy plus a Python string replace — never a git operation. HEAD remains `d9cf8d7`; the 399 uncommitted working-tree entries are intact.

## Verification Performed

**Toolchain detected from real manifests:** npm-workspaces monorepo; workspace `@corvus/web`; `typecheck` = `tsc --noEmit`; `test` = `vitest run` (vitest 5.0.0); eslint 9.39.5; prettier 3.9.6. All commands run from `apps/web` unless noted.

1. **Baseline instrument validated, then used.** First run `npx vitest run --reporter=basic` → `ERR_LOAD_URL` (reporter `basic` removed in vitest 5) **yet exit code 0** — a false-green; discarded. `npx vitest run` → **886 passed / 62 files**, matching the brief's stated baseline exactly, so the number is trustworthy.
2. **Gates, all clean:** `npm run typecheck --workspace @corvus/web` → exit 0, zero errors. `npx eslint lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` → exit 0, zero warnings. `npx prettier --check` on both → "All matched files use Prettier code style!".
3. **Focused suite:** `npx vitest run lib/demo/brain.test.ts app/api/demo/message/message.test.ts` → **33/33** (brain 19/19 after my +4, demo route 14/14). Re-run of brain alone after the sibling wave's edits → **19/19**.
4. **Mutation-proven (3 probes, hash-verified restore each time).** Every probe mutated a file inside my scope, then restored it:
   - **Probe A — runtime-vocabulary swap** (the exact change the brief requested: reply → `welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles`). Result: **4 red** — `matches template trigger`, `matches ascii template trigger`, `prefers template over pricing on collision`, and my `live template trigger returns the pinned gallery reply`; `AssertionError: expected [ 'welcome', 'moderation', 'xp', …(5) ] to deeply equal [ 'welcome', 'moderation', …(6) ]`. **The requested edit is caught by the suite.**
   - **Probe B — one-word drift** (`economy` → `xp`, source only). Result: **4 red**, including my live-trigger guard. Readings: `Tests 4 failed | 15 passed (19)`.
   - **Probe C — synchronised drift** (`economy` → `xp` in *both* `brain.ts` and the test's own `TEMPLATE_REPLY` copy). Result: **3 red — and all three were mine** (`Tests 3 failed | 16 passed (19)`). Every pre-existing trigger assertion **passed**, because they compare the source against the test's own duplicated constant; only the independent gallery-listing guard caught it. This is the reading that proves the new guard is not redundant.
   - **Restore:** `brain.ts` sha256 `ee1f7275a8658b6c8d10f83483881646f6ae4a02275f78c37a1cfc37bf81afa0` — verified **byte-identical** (`diff /tmp/brain.ts.orig apps/web/lib/demo/brain.ts` → no differences) to the backup taken before any probe, which itself matched the pre-task hash.
5. **Guard logic probed for false positives** (unit-level, all 8 real categories + all 3 drift words): every real category (`welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy`) → **clean**; every drift word (`xp, connector, status`) → **CAUGHT**; `exp` does **not** match `xp` (word-boundary regex, no substring false-positive).
6. **PRICING_REPLY preserved byte-for-byte and now pinned.** Both files carry `'Pro is $10/mo, Studio $29/mo. Trials run 3 days, 1 bot, 100 credits, no card'` — identical strings at `brain.ts:10` and `brain.test.ts:9`. Numbers verified against product truth on disk: `interval '3 days'` (`lib/auth/session.ts:198`), `TRIAL_GRANT_CREDITS = 100` (`session.ts:102`), `TRIAL_DEAL = 'Free 3-day trial — 1 bot, 100 AI credits.'` (`lib/bots.ts:50`). Zero `full Pro` / `full access` wording remains in either file. The trialcopy wave's hunk survives untouched — `git diff brain.ts` shows only that one hunk.
7. **Same-class sweep (LESSONS §1.2 — enumerate the class, not the call site).** Grepped all user-facing `.tsx` and non-test `.ts/.tsx` for the runtime-only kinds `xp`/`connector`/`status` used as feature names. Result: **no other user-facing surface names a runtime-only kind**. The only occurrences are non-user-facing: `packages/ai/src/builder-prompt.ts:19` (an LLM prompt) and `apps/gateway/src/runtime/boot-modules.ts:4` (a code comment). The class has exactly one member, and it is correct as written.
8. **Scope containment:** `git status --porcelain -- apps/web/lib/demo/` → exactly two `M` entries, zero `??` (no new files). `brain.ts` is unchanged by me; only `brain.test.ts` carries new content (+73 lines, all additive).
9. **Tree integrity:** HEAD still `d9cf8d7`; 399 working-tree entries still uncommitted; no stash/checkout/restore/reset issued at any point.

## Probe readings, verbatim

```
PROBE A (reply -> RUNTIME_KINDS vocabulary):    Tests  4 failed | 15 passed (19)
PROBE B (economy -> xp, source only):           Tests  4 failed | 15 passed (19)
PROBE C (economy -> xp, source + test copy):    Tests  3 failed | 16 passed (19)   <- all 3 are the new guard
RESTORED  (no mutation):                        Tests 19 passed (19)
FULL SUITE baseline (pre-change):               886 passed (886) / 62 files
FULL SUITE post-change:                         907 total; 2 sibling-owned suites red, moving between runs
```
