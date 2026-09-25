# Task Report: reviewer-fixwave-batch

## Status
PARTIAL — **all 9 fix areas PASS**; the merged-tree gate is **RED** on 5 pre-existing failures that this batch provably did not cause (proof in §4).

Reviewed: the 9-fix overnight batch, excluding the verdict route+page pair (sibling reviewer).
Tree: `master` @ `d9cf8d7`, uncommitted 17-file `fix-wave`. Reviewer did not write any reviewed file.

---

## Verdict per fix area

| # | Area | Artifacts on disk | Scope | Gates | Quality | Verdict |
|---|---|---|---|---|---|---|
| 1 | gallery fork message | ✅ | ✅ | ✅ | ✅ | **PASS** |
| 2 | RUNBOOK migrate loop | ✅ | ✅ | ✅ | ✅ | **PASS** |
| 3 | gateway giveaway cap | ✅ | ✅ | ✅ | ✅ | **PASS** |
| 4 | testbot giveaway cap | ✅ | ✅ | ✅ | ✅ | **PASS** |
| 5 | rollback runtime sync | ✅ | ✅ | ✅ | ✅ (with note, §5) | **PASS** |
| 6 | chat readHttpError | ✅ | ✅ | ✅ | ✅ | **PASS** |
| 7 | interview readErrorMessage | ✅ | ✅ | ✅ | ✅ | **PASS** |
| 8 | botdetail draft wipe | ✅ | ✅ | ✅ | ✅ (deviation OK, §6) | **PASS** |
| 9 | gateway start latch | ✅ | ✅ | ✅ | ✅ (adversarial, §5) | **PASS** |
| — | **merged gates** | — | — | **❌ 5 pre-existing** | — | **RED, not this batch** |

---

## 1. Artifacts exist — every claim matches disk

All 17 claimed paths exist and are modified. `git status --short` + `git ls-files`:

```
 M apps/web/app/gallery/page.tsx            M apps/web/app/gallery/page.test.tsx
 M infra/RUNBOOK.md
?? apps/gateway/src/runtime/games/giveaway.ts   ?? .../giveaway.test.ts
?? apps/testbot/src/games/giveaway.ts           ?? apps/testbot/src/games/xp.test.ts
 M apps/web/app/api/spec/rollback/route.ts  M .../rollback.test.ts
 M apps/web/lib/chat/thread.ts              M apps/web/lib/chat/thread.test.ts
 M apps/web/app/interview/page.tsx          M apps/web/app/interview/page.test.tsx
 M apps/web/app/dashboard/bots/[id]/page.tsx  M .../page.test.tsx
 M apps/gateway/src/start.ts                M apps/gateway/src/start.test.ts
```

**No false artifact claim.** `??` (untracked) for the giveaways and all of `apps/testbot/` is a
repo-wide condition, not per-agent untidiness: `git ls-files apps/gateway/src/runtime/` → **empty**,
`git ls-files apps/testbot/` → **0 files**. The whole runtime/testbot tree has never been committed.
`fix-runbook-loop`'s report correctly identified this and correctly refused to claim it as its diff.

Mtimes independently corroborate the claim window (01:34:55 → 01:51:06, all 2026-09-23), consistent
with the 01:31/01:38 report slugs.

## 2. Scope discipline — clean

- **Files touched in the batch window (01:25–01:55), excluding `Agent Reports/`:** exactly the 17
  declared source files plus `apps/web/.next/**` build cache (a dev server running, not an edit).
  Nothing else. Verified with `find -newermt` over the whole repo.
- **No manifest/lockfile/.env edit by this batch.** `package-lock.json` shows an 18-line diff adding
  the `apps/testbot` workspace entry — **mtimes `2026-09-20 11:09:56`, three days before this batch**,
  and `apps/testbot/package.json` is `2026-09-20 11:06:29`. Pre-existing dirt, correctly dated out.
  No `.env`/`.env.local` changed; no install run.
- **No dependency/version/config change.** `git diff --stat` for `package.json` (all workspaces) is
  empty. The only new exports are the two `REACTION_PAGE_SIZE`/`MAX_REACTION_PAGES` pairs plus the
  promotion of `fetchEntrantIds` from private to exported — all declared in §Public Interface.
- No `git stash/checkout --/restore/reset` was run by any builder. Two builders
  (`fix-interview-readerror`, `fix-gateway-start`) explicitly documented out-of-repo backups instead;
  both were confirmed to have restored byte-identically (their focused suites are green, §3).

## 3. Gates on the merged tree — exact commands and results

Run by me, on the merged tree, with `node_modules` present (no install performed).

| Gate | Command | Result |
|---|---|---|
| Typecheck (all 5 workspaces) | `npm run typecheck` | **exit 0** |
| Lint (repo-wide) | `npx eslint . --max-warnings 0` | **exit 0** |
| Format (root scope) | `npx prettier --check --ignore-unknown package.json tsconfig.base.json eslint.config.mjs .prettierrc README.md .env.example .nvmrc .github infra .husky` | **exit 0** |
| Format (17 touched files) | `npx prettier --check --ignore-unknown <17 files>` | **exit 0** |
| Gateway suite | `npx vitest run` (apps/gateway) | **397/397, 31 files** |
| Testbot suite | `npx vitest run` (apps/testbot) | **103/103, 9 files** |
| Gateway focused | `npx vitest run src/start.test.ts src/runtime/games/giveaway.test.ts` | **40 passed, 1 skipped** |
| Web focused (4 batch suites) | `npx vitest run lib/chat/thread.test.ts app/gallery/page.test.tsx app/interview/page.test.tsx "app/dashboard/bots/[id]/page.test.tsx"` | **105/105, 4 files** |
| Rollback (real Postgres) | `npx vitest run app/api/spec/rollback/rollback.test.ts` | **16/16** — was `6 passed / 10 skipped` without a DB |
| **CI-equivalent full** | `DATABASE_URL=postgresql://corvus:corvus_ci@localhost:5434/corvus_ci npm test` | **exit 1** — 5 failures, all pre-existing (§4) |

Postgres for the DB-backed run was a throwaway `postgres:17` container matching the `ci.yml` fixture
(`corvus/corvus_ci`/`corvus_ci`) bound to 5434 — CI's *default* port for these suites. Removed
afterwards; `docker ps -a` confirms gone. No production/SSH/box/GHCR/live key was touched.

## 4. The 5 merged-gate failures are PRE-EXISTING — proof, not assertion

```
FAIL app/api/interview/interview.test.ts > rejects unknown questionIds and invalid answers with 422
FAIL app/api/interview/interview.test.ts > rejects out-of-order answers with 422 naming the expected question
FAIL app/api/interview/interview.test.ts > walks the full tree and mints spec_versions v1 with the draft pointer
FAIL app/api/templates/templates.test.ts > fork honors a botName override and bare POSTs use the template name
FAIL app/api/templates/templates.test.ts > double fork of one template yields two independent drafts
Test Files  2 failed | 56 passed (58)      Tests  5 failed | 825 passed (830)
```

**Four independent proofs that this batch is not the cause:**

1. **Dependency closure — mechanical.** I walked each failing suite's full transitive local-import
   graph by hand (`from './…'` resolution, .ts/.tsx/.mts/index). Result:
   `interview.test.ts` 13 local modules, `templates.test.ts` 15, `creem/route.test.ts` 2 —
   **BATCH-IMPORTS: NONE** for all three. No batch file is reachable from any failing suite.
   External packages in their closure are only `pg`, `vitest`, `node:crypto`, `node:fs/promises`,
   `@corvus/spec`.
2. **Every input is byte-identical to HEAD.** `git diff --quiet HEAD --` returns IDENTICAL for
   `interview.test.ts`, `templates.test.ts`, `interview/start/route.ts`, `interview/answer/route.ts`,
   `templates/[slug]/fork/route.ts`, `lib/bots.ts`, `lib/db/pool.ts`, `lib/interview/tree.ts`,
   `lib/interview/progress-store.ts`, `lib/invite/permissions.ts`, `lib/trial.ts`,
   `lib/interview/session-bind.ts`. Nothing the failing suites execute is in the batch diff.
3. **The defect is in a commit 2 days older than this batch.** `git show --stat d9cf8d7` (2026-09-19
   23:50:39, "trial enforcement DONE — option A, 5 gates live") — and `git show HEAD:apps/web/app/api/interview/start/route.ts`
   already contains `mintGate`/`mintRefusal`/403 at lines 93-94. `git log -1 -- interview.test.ts`
   and `-- templates.test.ts` both return **`d9cf8d7`**. Those suites were last edited by the trial-cap
   commit and have not been touched since. **No fix-wave commit or edit is in their history.**
4. **Reproduces on a pristine database.** On a fresh `CREATE DATABASE` the suite goes from 3 failures
   to **8** (`expected 500 to be 200` ×5 — the tables don't exist; the `FALLBACK_DDL` self-heal is
   incomplete). The failure count is a function of *database state*, not of any code in the batch.

**Root cause (named, not guessed).** The KI-033 trial cap (`d9cf8d7`, 2026-09-19) added a
`mintGate` + `LIVE_BOT_COUNT_SQL` check to `interview/start` and `templates/[slug]/fork`, while the
two Pre-KI-033 suites kept their original shared-account fixtures:

- `apps/web/app/api/interview/interview.test.ts:279-295` — **one** `owner` account created in
  `beforeAll`, shared by every test; five tests call `startBot()` against it (lines 393, 404, 430,
  445, 462). `templates.test.ts:342-344` documents the hazard verbatim: *"the shared `session`
  account carries the file's other assertions, and mutating its clock or tier would reach across
  tests."* The KI-033 cap now refuses the second mint — deterministic 403 → the observed
  `expected 403 to be 200` at `interview.test.ts:463` and `templates.test.ts:513`.
- `expected undefined not to be undefined` at `templates.test.ts:543` is the downstream symptom:
  the second fork was refused, so `first`/`second` have no `botId`.

**Named as flaky-under-load, not batch-caused:** `app/api/webhooks/creem/route.test.ts` failed in
full-suite runs 1 and 3 (with `column "tier" of relation "accounts" does not exist`) and **passes
60/60 in isolation** — shared-DB contention, not a gate. This is a second, distinct pre-existing
issue (its inline `FALLBACK_DDL` does not reach `accounts.tier`, added by
`apps/gateway/drizzle/0008_accounts_tier.sql`). Two full-suite runs of byte-identical code produced
**6 then 5** failures — the instrument is order-dependent, so full-suite counts here are a lower
bound on flakiness, not a stable number.

**Not fixed by me** (out of scope, and the fix is a real task: per-test account seeding for the two
suites, mirroring the `gateAccount()` helper `templates.test.ts` already grew for its own gate tests).

## 5. Quality spot-checks

- **Secrets: clean.** `git diff HEAD -- <all batch paths> | grep '^+'` matched only *identifiers* —
  `tokenCipher`, `decryptToken`, `boot-token-decrypt-failed`, `token-redacted` (all in the pre-existing
  `restartBotFromVault` block, which is not this batch's diff). Untracked giveaway files: 0 matches.
  Log fields added by `fix-gateway-start` are `{ event, botId }` only. No secret value was printed,
  copied, or transmitted anywhere in this review.
- **Locked sentences byte-intact — verified programmatically, not by eye.** Extracted from source and
  `String.includes`-checked against each surface:
  - `TRIAL_EXPIRED_MESSAGE` (66 chars) = `Your 3-day trial ended — your bots are paused. Nothing is deleted.`
  - `TRIAL_BOT_LIMIT_MESSAGE` (41 chars) = `Free 3-day trial — 1 bot, 100 AI credits.`
  - Present, correct: `gallery/page.test.tsx` ✓✓, `interview/page.test.tsx` ✓✓,
    `chat/thread.test.ts` (expired) ✓, `api/chat/route.ts:88` (expired) ✓.
  - Correctly **absent** from `gallery/page.tsx` and `interview/page.tsx` — those render the server's
    sentence rather than hardcoding it, which is the intended design.
- **chat 401 precedence intact.** `lib/chat/thread.ts:133-135` — the 401 branch sits *ahead* of the
  body read and is covered by `thread.test.ts:87` ("keeps the logged-out line even when the 401 body
  carries a message"). `message` → `error` → generic generic line byte-unchanged. 7 tests in the
  `readHttpError` describe.
- **interview prefix shape intact.** `page.tsx:147/193/280` still render
  `Could not start interview: `, `Could not record answer: `, `Could not save review: ` — only the
  interpolated value changed.
- **botdetail draft-wipe guard present and load-bearing.** `page.tsx:313-320` discriminated
  `DraftRead`; `refreshDraft` (318-341) reports `loaded`/`absent`/`unreadable` so a false 404 cannot
  invent a head; `page.tsx:772-793` refuses the save on `unreadable` and bases the append on what the
  read *returned*. Four targeted tests: `page.test.tsx:950` (empty-cache append), `:997` (unreadable
  refuses), `:1031` (no-draft says so), `:1066` (loaded still appends). The `error`-leg omission is
  covered below.
  - **Verified gap in the same change (the disabled button has no styling).** `page.module.css:105`
    defines `.ghostAction` with rules at `:127` (`:hover`) and `:132` (`:active`) and **no `:disabled`
    rule anywhere in the file** (`grep -n disabled` → no match). So the new
    `Continue interview · Coming soon` button is disabled to the a11y tree, to the cursor and to
    clicks, but renders **visually identical to an enabled button**. The builder disclosed this
    honestly and correctly refused to reach outside its two-file scope; I confirm it on disk. This is
    user-visible: the whole point of fix #8's DEFECT 2 was to stop the page promising something it
    cannot do, and a control that looks clickable promises it anyway. **Not a code defect and not a
    reason to fail fix #8** (the honest label + disabled semantics are the substance and they are
    correct) — but it is an unfinished edit, so it is an Open Question below, not a closed one.
- **gateway lifecycle ownership present.** `start.ts:110-123` `stopModulesFor` deletes the entry
  *before* invoking the stop; `:238-250` `destroy()` consumes the stop → clears the latch → destroys
  → clears the slot only `if (realClients.get(botId) === client)`; `:141-151` `onClientReady` clears
  the latch and drains a predecessor stop; `:209-213` the ready listener is identity-guarded. The
  stale NOTE was replaced by the `LIFECYCLE OWNERSHIP (follow-up completed)` block at `:180`. The
  adapter seam is the right one: `gateway.ts` funnels every path through `destroyQuietly` (`:319`
  quarantine, `:424` removeBot, `:451` relogin, `:464` failed login, `:499` shutdown).
- **Giveaway caps present in BOTH copies.** Gateway `giveaway.ts:22/29` + `collectReactants:191-210`;
  testbot `giveaway.ts:53/60` + `collectReactants:209-228`. **Byte-identical: I diffed the span from
  `interface ReactantView` through `return out;\n}` — 2079 bytes each, `a === b` true.**
- **RUNBOOK loop removed.** `grep -n "for f in" infra/RUNBOOK.md` → no match. Step 5 now carries the
  once-rule, a single-file command, the negative guard, and the plain-terms consequence
  (`infra/RUNBOOK.md:154-167`). Repo-wide the only remaining `for f in` hits are inside the *agent
  report prose*, not an operator instruction.
- **Rollback runtime sync present with parity test.** `rollback/route.ts:97-110` `syncRuntimeRows`
  (DELETE + INSERT) called at `:297` inside the transaction, after the pointer move and the audit
  row, before `COMMIT`. Parity test `rollback.test.ts:600` ("leaves the database exactly as a publish
  of the target version would") plus `:657` (retired kind dropped) and `:696` (transaction unwind).
  16/16 with a live DB.
- **No i18n infrastructure exists in this repo** (`NO i18n FOUND` — no `next-intl`/`react-intl`, no
  messages dir, no i18n ESLint rule), so "no hardcoded user-facing strings" is not a violation here.

**Adversarial test I ran against fix #9 (and it survived).** Concern: `destroy()` calls
`readyAttached.delete(botId)` unconditionally, so could a slow destroy of a superseded client clear
the *successor's* latch? Walked the only two out-of-factory orderings:
`gateway.addBot` throws synchronously on a duplicate id (`gateway.ts:376-378`) so a second
`createClient` for a live botId cannot occur; and `supervisor.handleCrash`→`attemptRestart` only runs
from a deferred timer (`supervisor.ts:251-253`, `setTimeout`), never in the crash's synchronous stack,
so `relogin`'s `destroy` completes before the replacement is created. Both orderings are
destroy-then-create. **Not exploitable.** Residual (pre-existing, unhardened, not a defect):
`readyAttached`/`moduleStops` carry no client identity, so ordering *is* the invariant — a future
caller that creates before destroying would regress. Worth a one-line comment, not a fix.

## 6. Known deviations — both confirmed acceptable, neither silently failed

1. **botdetail `readRefusalMessage` is message-only (no `error` fallback)** — `page.tsx:113-118`.
   Its builder flagged it against the literal SPEC mirror. **I confirm it satisfies the locked
   tests:** `page.test.tsx:1252` stubs a 500 `{ error: 'could not start build' }` and `:1263` asserts
   `Could not start the build — try again.`; and `:1294/1306` asserts the 403's `message` renders
   byte-identical while `:1310` asserts the generic is absent. The `error` leg would break the first
   test. The deviation is the *correct* reading, not a shortcut. **Orchestrator action: none required
   unless the SPEC intended the literal mirror — in that case the SPEC's own locked test contradicts
   it and the test should be re-examined, not the code.**
2. **testbot pagination tests placed in `xp.test.ts`** — `grep` confirms `xp.test.ts` already imported
   `drawWinners`/`findDue` from `./giveaway.js` and its header reads *"Unit tests for games: XP
   formula, cooldown gate, Fisher-Yates draw"*; no `giveaway.test.ts` exists. Extending it was the
   only in-scope option. Placement is a non-issue (the tests run and pass); renaming would be churn.

## 7. Fix directions exceeded the named defect in two places — both justified

- **`fix-gateway-start` now also stops modules on the quarantine and shutdown paths** (both reach
  `destroyQuietly`). This is the enumerated-class fix, not scope creep: leaving them out would
  reproduce the exact orphaned-poll defect on two paths. Reported in Open Question 2.
- **`fix-giveaway-cap` added `Set`-based dedup.** Strict tightening of the pool (pagination makes
  repeat ids reachable); it can only remove a duplicate, never add or drop an entrant. Reported.

## 8. Instrument validation (I did not take the builders' word)

Each builder claimed to have "broken the guard and watched it fail". I could not re-run those
mutations without writing to reviewed files (out of scope), so I verified the guards *statically*
(assert the set and its size — LESSONS §1.8):

- **Gateway cap (7 tests):** `giveaway.test.ts:42-126` asserts `entrants).toHaveLength(137)`,
  `new Set(entrants)).toEqual(new Set(ids))`, **and the exact cursor sequence
  `expect(afters).toEqual([undefined, ids[99]])`** — the cursor assertion is what proves it *paged*
  rather than coincidentally worked; `:59` drives a 5-winner draw and asserts `toContain(ids[136])`;
  `:86` asserts `calls).toBe(MAX_REACTION_PAGES)` against an API that ignores `after`; `:100` asserts
  100 unique humans with a bot and a duplicate injected on page 2; `:120` the no-reaction control.
  Plus an end-to-end `pollGiveaways` case at `:242`.
- **Testbot cap (6 tests):** same shape at `xp.test.ts:166+`.
- **Rollback (4 new tests, one of which is a genuine parity proof):** the parity test publishes v1
  on a *second* bot through the real publish route as an independent control and requires the
  rolled-back rows to match row-for-row. That is the correct instrument for a mirrored-SQL claim —
  it catches drift, which a self-referential assertion would not.
- **Note:** the giveaway end-to-end test draws with real `Math.random`; its **cursor assertion**, not
  its winner identities, is the deterministic proof. Flagged by its own builder and correctly so —
  do not read it as asserting a winner set.

## 9. Files Touched
- CREATED: `Agent Reports/2026-09-23-0211_reviewer_REVIEW_fixwave-batch.md` (this report)

No reviewed file was modified. Verified after all runs: the 17 batch files still carry their
`M`/`??` state and the batch diff is unchanged. The temporary Postgres container was removed and the
temporary baseline worktree was removed (`git worktree list` → only the main tree).

## Dependencies Added
None. No install, no manifest edit.

## Assumptions Made
- Treated the report slugs `2026-09-23-0131`/`0138` as approximate and corroborated against file
  mtimes (01:34:55–01:51:06) rather than trusting the slug.
- Used CI's *documented default* for the DB suites (`localhost:5434/corvus_ci`, from
  `lib/db/pool.ts:12`) with a throwaway `postgres:17` fixture matching `ci.yml`. Both suites honor
  `process.env.DATABASE_URL ?? TEST_DATABASE_URL`, and CI sets `DATABASE_URL` to a container whose
  image/user/db/password match mine — so the DB *content* is CI-equivalent.
- Did not verify the CI-only step (`npm ci` + `@corvus/spec`/`@corvus/ai` dist builds); `node_modules`
  was present and I was forbidden to install. Workspace resolution worked without the dist rebuild.
- Read the 9 whitelisted reports only; did not open the verdict route/page reports or scan the
  directory.

## Open Questions for Orchestrator
1. **RED merged gate is pre-existing and needs its own task.** `interview.test.ts` (3) +
   `templates.test.ts` (2) fail deterministically on CI-identical config; `creem/route.test.ts` is
   flaky under parallel load. The fix is per-test account seeding (the `gateAccount()` pattern
   `templates.test.ts` already has). Without it, **CI on `master` is red now, and this wave will not
   turn it green** — the wave should not be blamed for it, and should not be gated on it.
2. **`fix-gateway-start` widened behaviour to the quarantine and shutdown paths** (both now stop
   module polls). Intended class fix, but it is a behaviour change beyond the two named defects —
   confirm it is wanted.
3. **`Docs/10_deployment.md:21` is now stale** and factually wrong: it says migrations are applied by
   a *"`psql` loop over `apps/gateway/drizzle/*.sql`"*. The RUNBOOK no longer loops, and looping over
   the folder re-arms 0010's trial clock (`0010_accounts_trial_ends.sql:20` `UPDATE … now() + interval '3 days'`),
   turning a never-expiring account into a 3-day lockout (0011's header warns of exactly this). Fix
   #2 flagged it correctly and did not exceed its scope. **Correcting it is a docs follow-up with
   real operational risk attached** — a reader following that sentence can lock out grandfathered
   accounts.
4. **One real incident-gap found in shipped code (new, not previously flagged).**
   `defaultTranslateProdSpec` deliberately **skips** unknown and token-carrying behavior entries and
   can legitimately return an empty `rows` array (`publish/route.ts:257-263, 271-274, 276-280`).
   `syncRuntimeRows` then DELETEs every existing row and INSERTs none. Combined with
   `boot-modules.ts:35-40` (`attachBotModules` → `loadBot(..., configs)`), a bot booting against a
   config with **zero** runtime rows is handed no dispatcher, no slash commands and no feature
   events — and because it is the boot path, `onClientReady` will not log `boot-modules-failed`
   (nothing throws). That is the same user-visible failure mode `fix-gateway-start` exists to
   prevent, reached through a spec whose entries are all unrecognized. Pre-existing and unchanged by
   this batch (`publish` and the untracked `0012_bot_runtime_config.sql` predicate it; the rollback
   copy faithfully mirrors it), but the rollback path can now reach it too, so it is in scope to
   name rather than fix. **Recommend a separate task to decide whether an empty translation should
   refuse the move instead of writing zero rows.**
5. `fix-gateway-start`'s report notes `launch-blockers.test.ts` test C uses `if (PG_UNREACHABLE) ctx.skip()`
   inside an async callback, which burns its 120s cap instead of skipping (confirmed: with no DB the
   gateway suite still reported 397/397 on that run — the cap is hit, not an error). Pre-existing
   harness wart; their follow-up candidate stands.
6. **Fix #8's disabled button needs a `:disabled` rule to finish the job** (§5). One small edit to
   `apps/web/app/dashboard/bots/[id]/page.module.css` — a different file from the two the builder
   owned, which is exactly why it was left undone. Fix #8 PASSES on substance; this is the honest
   remainder. Recommend folding it into the next docs/CSS task rather than spawning a full wave.
7. `lib/chat/thread.ts:99-120` `stitchBrief`/`BRIEF_MAX_CHARS` appear in this batch's diff hunk but are
   **NOT** this batch's change — the file was touched at 01:40:09 by `fix-chat-readerror` while
   `stitchBrief` (KI-036) was already in the working tree from an earlier wave. Same for
   `botdetail page.tsx` importing it at `:15`, `:754`, `:858`, `:1259`, `:1267`. Do not attribute
   `stitchBrief` to the wave when writing the closeout.

## Public Interface Exposed
Review only; no interface changed by me. Interface deltas introduced by the batch, as declared and
verified:
- `apps/gateway/src/runtime/games/giveaway.ts` — new exports `REACTION_PAGE_SIZE = 100`,
  `MAX_REACTION_PAGES = 100`; `fetchEntrantIds` promoted private → exported
  (`(message: Message, emoji: string) => Promise<string[] | null>`).
- `apps/testbot/src/games/giveaway.ts` — same two constants; `fetchEntrantIds(message: Message)`
  promoted private → exported (no `emoji` param; testbot keeps `ENTRY_EMOJI` module-level).
- `apps/web/app/api/spec/rollback/route.ts` — new test seams `__setTranslator` / `__resetTranslator`;
  imports (does not redefine) `defaultTranslateProdSpec`, `PublishTranslator`, `RuntimeRow` from
  `../publish/route`. Route contract unchanged: 200 `{ version }`, 401/404/409/422/500 unchanged.
- Module-private only (no exported surface): `forkErrorMessage`, `readHttpError`,
  `readErrorMessage`, `DraftRead`/`refreshDraft`/`readRefusalMessage` (botdetail), `stopModulesFor`,
  `syncRuntimeRows`. `createDiscordClient` remains module-private with one caller
  (`start.ts:461`).

## Known Limitations
- I did **not** perform a live browser/app run of any flow. Per LESSONS §2.4 ("done" means a human
  completed the flow in the running app), **every one of these 9 fixes is still owed that check**;
  three builders said so explicitly and the other six did not claim it. The strongest end-to-end
  evidence I could produce is: a real-Postgres rollback suite (16/16), a real-Postgres gateway suite
  leg, and the giveaway end-to-end `pollGiveaways` test — all at the test level, not a running app.
- I could not re-run the builders' mutation ("break the guard, watch it fail") experiments without
  writing to reviewed files. §8 substitutes static proof that each guard is present, specific, and
  size-asserted — weaker than watching it fail.
- No live Discord connection was exercised by anyone in this batch (reaction pagination and the
  client lifecycle are both fake-driven). `discord.js` 14.27.0's `fetch({limit, after})` contract was
  verified by the builder against the installed package source and typings — I did not re-verify it
  against a live endpoint.
- Full-suite web failure counts are not stable (6 then 5 across two runs of identical code). I report
  the failure *names* and their determinism when isolated, not a single authoritative count.
- `apps/web/.next/**` was written during the batch window by a running dev server. I did not
  investigate whether that server is still running; it is gitignored build output.
