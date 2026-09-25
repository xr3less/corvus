# Task Report: reviewer-verdictcombo-1830

**Wave timestamp:** 2026-09-24-1830 · **HEAD:** `d9cf8d7` · **Tree:** uncommitted (nothing committed, nothing pushed, no deploy, no migrate, no secret touched, no live POST, no git write command of any kind)

## Status

SUCCESS — **Verdict: PASS.** Every claim in `2026-09-24-1810_fixverdict_FIX_verdict-combo.md` reproduced from disk with my own instruments: 41/41 focused on the real tree, 925/73 full suite, tsc/eslint/prettier clean with true exit codes, 137-added/0-removed proven by diff, both mutations red on the exact pins claimed, and the English byte-identity hash **independently re-derived and matching**. One author claim I could not reproduce (the full-suite worker aborts) — and it is the *good* direction: 3/3 parallel + 1 serialized full runs green, so I record it as unreproduced, not as a defect.

## Files Touched

- **CREATED:** `Agent Reports/2026-09-24-1830_reviewer_REVIEW_verdictcombo.md` (this report).
- **READ ONLY:** `apps/web/app/api/builder/verdict/route.ts`; `apps/web/app/api/builder/verdict/route.test.ts`; `packages/ai/src/persona-prompt.ts`; `packages/ai/src/index.ts`; `apps/web/app/api/builder/start/route.test.ts`; `apps/web/lib/auth/session-db.test.ts`; `apps/web/vitest.config.mjs`; `apps/web/package.json`; `apps/web/tsconfig.json`; `package.json`; the three whitelisted Agent Reports; `%TEMP%\f523-instrument\corvus\...\verdict\{route.ts,route.test.ts}` (another agent's read-only copy, used as the source of pre-edit bytes).
- **MODIFIED: nothing.** No source, test, manifest, lockfile, env, or config file was written. No git command that writes (`stash`/`checkout --`/`restore`/`reset`) was run; every mutation happened in an out-of-repo copy that was deleted at the end.
- **Both claimed files verified unchanged by me, before and after all work:**
  - `route.ts` SHA256 `acd6411917ab4bc891eedaa29837dfa134ffd425dbe1ae7c288d6f3fac908208` (matches the author's claimed after-hash), 30129 bytes, mtime 2026-09-24 18:43:43.
  - `route.test.ts` SHA256 `4b79cd3d0b560e8da54e678ca3fec92526034c62321d18afda533118ead0e557` (matches), 48545 bytes, mtime 2026-09-24 18:44:16.

## Dependencies Added

None. No install was run. `package.json`/`package-lock.json` mtimes (2026-09-15 22:45 / 2026-09-24 03:31) predate this wave by hours, so no manifest was touched; all four config files checked (`eslint.config.mjs` ×2, `.prettierrc`, `apps/web/tsconfig.json`, `apps/web/vitest.config.mjs`) also predate it.

## What I verified, in the order the brief asked

### 1. Does it actually work? (real tree, true exit codes, no pipes)

Toolchain detected, not assumed: npm (only `package-lock.json` at root), workspaces `apps/*`+`packages/*`, `apps/web` package scripts `typecheck`=`tsc --noEmit`, `lint`=`eslint .`, `format`=`prettier --check --ignore-unknown .`, `test`=`vitest run`. Runners resolved to real entry points and spawned by my own `spawnSync` driver so the **exit code is the child's real status**, never a pipeline's.

| Gate | Command (cwd `apps/web`) | Result |
|---|---|---|
| Focused suite | `node ./node_modules/vitest/vitest.mjs run app/api/builder/verdict/route.test.ts` | `RUN v5.0.0` banner asserted · **41 passed (41)** · **EXIT 0** |
| Full web suite | `node ./node_modules/vitest/vitest.mjs run` | `RUN v5.0.0` · **65 files passed · 925 passed + 73 skipped (998)** · **EXIT 0** (4 independent runs, see §4) |
| Typecheck | `node ../../node_modules/typescript/bin/tsc --noEmit` (TS 5.9.3) | **EXIT 0**, zero output bytes |
| Lint | `node ../../node_modules/eslint/bin/eslint.js <both files> --max-warnings 0 --format json` (ESLint 9.39.5) | **EXIT 0**; JSON parsed: both files `messages=[] suppressedMessages=[] errorCount=0 warningCount=0` |
| Formatter | `node ../../node_modules/prettier/bin/prettier.cjs --check <both files>` (Prettier 3.9.6) | `All matched files use Prettier code style!` **EXIT 0** |

Every number the author reported is reproduced exactly: 41/41, 925+73, exit 0 across the board.

**Diff-derived claims, verified by my own diff** (pre-edit bytes from `%TEMP%\f523-instrument\corvus`, whose two file hashes `46173f3b…e39983` / `30b58815…e51f628` match the author's stated before-hashes verbatim):

- Test file: **137 added, 0 removed**, two pure-insert hunks (`@@ -280,6 +280,16 @@`, `@@ -1130,3 +1140,130 @@`). Additive-only confirmed at the byte level.
- Route file: 5 hunks (`@@ -52,6 +52,7 @@`, `@@ -180,6 +181,91 @@`, `@@ -524,6 +610,13 @@`, `@@ -531,19 +624,21 @@`, `@@ -570,12 +665,18 @@`) — exactly the regions the author listed and **no others**. The 9 "removed" diff lines are the two rewritten call expressions, the two `} catch {`→`} catch (error) {` lines and three comment lines re-flowed in place; I matched each to its replacement above and found **no deleted behaviour**.
- Line numbers cited in the report re-derived from disk and all correct: needles `:290-291`, describe `:1163`, pins (i) `:1164`, (ii) `:1194`, (iii) `:1228`, (iv) `:1248`.
- No `.only`, `.skip` or `.todo` in the touched test file (grep clean). No secret-shaped string in either file (grep clean).

### 2. Independent mutation — my own instrument, out-of-repo only

Instrument construction: `robocopy <repo> <copy> /E /XD node_modules .next .git .vitest .vite .vite-temp /XJ`, then three `mklink /J` junctions (copy root, copy `apps/web`, copy `packages/ai`) to the repo's real `node_modules`. **Reparse-point assertion, measured not assumed:** every link in the copy enumerated via .NET `LinkType`; before use, the only links were my 3 junctions plus the 5 `@corvus` links and 3 `.next` `pg-*` junctions that robocopy `/XJ` correctly did **not** copy (they are *inside* the repo's `node_modules`, which I excluded). Paths outside `node_modules` trees: **0 reparse points** — so no guarded recursive delete could ever reach the repo. Runner pinned to the same `node ./node_modules/vitest/vitest.mjs run`, cwd the copy's `apps/web`, `RUN v5.0.0` asserted in every row. Baseline **re-copied from a pristine shadow dir before every row**, so no row inherited another's mutation.

| Row | Mutation | Exit | Observed |
|---|---|---|---|
| **control** | post-edit bytes, unmodified, in the copy | **0** | **41 passed (41)** — instrument validated on an unmodified copy |
| **A** | removed `{ role: 'user', content: CLOSE_USER_TURN },` at both call sites (asserted exactly 2 occurrences before deleting) | **1** | **3 failed / 38 passed**: pin **(i)** `:1186` red, pin **(ii)** `:1222` red, pin **(iv)** `:1264` red — all three with `expected { role: 'system', …(1) } to match object { role: 'user' }` |
| **B** | `deriveLanguage` forced to `return 'english'` | **1** | **2 failed / 39 passed**: pin **(i)** red `expected 'Judge whether the user reply accepts …' to contain 'a Turkish yes is a yes'`; pin **(ii)** red `expected 'Distill the thread into 3-8 tight req…' to contain 'write the requirement lines in Turkish'` |
| **D** *(my own addition, misfire probe)* | `deriveLanguage` forced to `return 'turkish'` | **1** | **3 failed / 38 passed**: pin **(iii)** `:1241` red, **plus two pre-existing reply-view pins** — `bills an over-bound reply as exactly REPLY_MAX chars` (`expected 831 to be 500`, `:793`) and `sends an in-bound reply to the judge byte-identical, with no marker` (`:819`) |
| **baseline** | both files **pre-edit** | **0** | **37 passed (37)** — confirms the author's "41 = 37 pre-existing + 4 new" arithmetic |
| **E** *(my own addition, the strongest one)* | **pre-edit `route.ts` + current test suite** | **1** | **3 failed / 38 passed** — exactly pins (i), (ii), (iv) red, and **all 37 pre-existing assertions green** |

Row E is the one that closes the loop: the new pins fail on the *old* route and pass on the *new* one, while the old assertions pass on both. That is a clean bidirectional attribution — the pins measure the change and nothing else. Row D independently reproduces the author's misfire interlock, with the same two pre-existing reply-view pins going red, which is what makes "the derivation must not misfire on ASCII" a suite-enforced property rather than a comment.

### 3. Byte-identity of the English path — re-derived, not accepted

I built my own probe (out-of-repo copy only, never in the repo) that drives the real `POST` through the route's existing `__setPersonaCaller` seam with the stated ASCII English thread (plan ending `Can I start? Reply yes to build.`, reply `yes, go ahead`) and hashes the exact `messages[0].content` bytes:

| Route bytes | prompt SHA256 | chars | messages | last role | status |
|---|---|---|---|---|---|
| **pre-edit** (`46173f3b…`) | `2176621d9a79d66f36cd0e2049d1c379e3e35487e2f0703202fb80df0c7931dc` | 453 | 1 | system | 200 |
| **post-edit** (`acd64119…`) | `2176621d9a79d66f36cd0e2049d1c379e3e35487e2f0703202fb80df0c7931dc` | 453 | 2 | user | 200 |

**Identical.** The author's hash is reproduced byte-for-byte by an independently written probe on bytes I sourced from the pre-edit copy and verified by SHA256. So the claim "only the message-array shape changed, not the prompt content" is confirmed, and pin (iii) (`hasGuidance=false`, `Answer with EXACTLY` present) is the suite-level lock on it.

### 4. The author's two open flags — adjudicated

**(a) Full-suite worker aborts `3221226505` — NOT REPRODUCED, and not connected to this change.**
I attempted reproduction directly: **3 parallel-mode full-suite runs + 1 serialized run**, all with true exit codes captured — **all four EXIT 0, 65 files / 925 passed + 73 skipped each.** I did not see a single abort. Import-graph evidence, gathered myself rather than read from the report:
- Nothing in production imports the verdict route at all — repo-wide grep for `builder/verdict/route` outside `node_modules` returns only comments in `lib/bots.ts:75`, `lib/http/refusal.ts:27`, `lib/verdict/bounds.ts:6` and the generated `.next/**/validator.ts` type stubs. The route's only importer is its own test file.
- `lib/auth/session-db.test.ts`: **zero** hits for `verdict` / `persona-prompt` / `buildVerdictPrompt` / `buildBriefPrompt`.
- `app/api/builder/start/route.test.ts`: one hit, and it is prose in a comment (`:445`). It does open a real Postgres `Pool` (`connectionTimeoutMillis: 5000`, `:99`); `session-db.test.ts` does the same (`:99`) — neither is reachable from anything this change touched. The only test file whose import graph includes the change is `verdict/route.test.ts`, which never aborted in any of my runs and does not touch a live DB.
- The whole tree shares one `node_modules`, so a concurrent agent's run in another copy is a plausible source of the load the author saw; I did not chase that further because it is not attributable to this change and I could not reproduce it.
- Also noted, non-blocking: my runs created `apps/web/node_modules/.vite` and `node_modules/.vite` caches (dir mtime 2026-09-24 03:11 — pre-existing, content re-touched). This is gitignored test cache, not a source change.

Verdict on (a): consistent with the author's own honest limit ("cannot claim the abort class is proven pre-existing"), and stronger in the direction that matters — **the change does not cause it, and it does not reproduce** on this tree under 4 further full runs. Still a harness-level flake worth its own task (`pool: 'vmThreads'` is the hint vitest itself prints in every run, visible in my logs), but nothing here blocks this wave.

**(b) Half-false wording — confirmed as recorded, copy untouched.**
Verified by measurement, not by reading the comment: my probe drove all four plan/reply language combinations. A Turkish plan with an English reply (`Plan hazır. Başlayayım mı?` + `yes, go ahead`) derives `turkish` and the judge prompt **does** carry `The plan and the reply are in Turkish, …` — so that first sentence is half-false on that path. The inverse (`English plan + evet`) also reads `turkish`, which is the deliberate either-or. Copy is unmodified: `packages/ai/src/persona-prompt.ts` has no file with an mtime later than **2026-09-24 00:56:26**, hours before this 18:43 wave, and my `find` for `packages/ai` files newer than 18:00 returned **empty**. The guidance byte text is unchanged. Correctly recorded as an open founder copy decision, not silently reworded.

### 5. Trust artifacts, not summaries

- `Agent Reports/2026-09-24-1810_fixverdict_FIX_verdict-combo.md` exists on disk, 19558 bytes, mtime 2026-09-24 18:59:11.
- Both claimed-modified files exist, were really touched in the wave window (18:43:43 / 18:44:16), and their on-disk SHA256 values **equal the report's claimed after-hashes exactly**.
- `packages/ai` was not touched in the window: `find packages/ai -newermt "2026-09-24 18:00"` → empty; newest source file is `persona-prompt.ts` at 00:56:26. (Note for the record: `git diff -- packages/ai` is **not** empty — 6 tracked files modified plus 3 untracked — but those are this session's earlier uncommitted KI waves against `HEAD`, not this fix. The correct instrument for "did this task touch it" is mtime, and mtime says no. The report's own phrasing, "`packages/ai` is unmodified", is true of *this task* and would be misleading if read as "clean vs HEAD"; I confirmed the second reading is not what happened.)
- The author's reasoning for needing no package change holds: `OwnerLanguage` is exported through the barrel (`packages/ai/src/index.ts:13`, `export * from './persona-prompt.js'`), so the new `type OwnerLanguage` import at `route.ts:55` is satisfied without a package edit.

### Code-quality pass

- **No secrets, no credentials, no live key** in either file.
- **No `packages/ai` byte change** in the task window (mtime, above), so the "zero bytes" claim survives a stricter reading than git diff.
- **Additive-only test diff**: 137/0, verified by my own diff.
- **No length pin on the message array** in the new block — the only `toHaveLength` calls added are on `persona.calls` (1 or 2) and `boss.record.sent` (1), i.e. call/job counts, never `messages.length`. This matters because the whole fix is a shape change; a `messages` length pin would have been the brittle failure mode, and it is absent.
- **The needles are genuinely independent copies** (`route.test.ts:290-291`), and I verified each appears in exactly one other place repo-wide: `packages/ai/src/persona-prompt.ts:61` and `:66`. So a package-side copy drift does fail this suite, as claimed.
- **Scope hygiene:** the five route hunks map one-to-one to the claimed regions (import, detector block, kept-ends views, judge call + catch, brief call + catch). Nothing else in the file moved.
- **Additivity vs. the pre-existing suite** is not just a diff property: row E proves all 37 pre-existing assertions still pass against the **new** route too.

## Assumptions Made

- The adjudicated provider contract (GLM system-only → HTTP 400 / code 1214) is taken as context from the whitelisted 0428 report. I did **not** re-prove the provider, sent **no** live POST, and hold no key — my verdict covers the two defects as *code and payload* facts, not as live provider behaviour.
- "Unmodified" for `packages/ai` is measured by file mtime against the wave window, because on this uncommitted tree `git diff` cannot distinguish this task's bytes from earlier KI waves. Stated plainly rather than glossed.
- My mutation rows A/B/D reproduce the author's mutations in spirit and site but are my own instruments; deliberate, so the redness proves the pins rather than proving the author's harness.
- Pre-edit bytes are taken from `%TEMP%\f523-instrument\corvus\...`, whose two file SHA256 values equal the author's recorded before-hashes. That copy is another agent's evidence and I read from it only, never wrote to it; re-verified intact after all my work.

## Open Questions for Orchestrator

1. **Founder — the half-false sentence (carried over, now measured).** On a Turkish plan + English reply, the judge is told "The plan and the reply are in Turkish". Reproduced by direct measurement. Copy stays founder-locked; the fix is a one-line reword in `packages/ai/src/persona-prompt.ts:61` if he wants it. **Not a blocker for this PASS.**
2. **Harness — the parallel-worker abort class (not reproduced here).** 4 further full runs green (3 parallel + 1 serialized). Recommend the flake task the author proposed (`pool: 'vmThreads'` / memory headroom on a 3072-test tree), owned separately from this wave. Note the serialized run costs ~106s vs ~23s parallel, which is the practical argument for fixing the pool rather than serializing.
3. **Carried over from the author, unchanged:** `packages/ai/src/persona-prompt.test.ts` still has zero `'turkish'` coverage, so both guidance branches are exercised only through the route. Out of scope here too; recorded as the approved follow-up, not expanded.

## Public Interface Exposed

Unchanged, and I verified the boundary rather than taking it on trust. `POST` still accepts `{ botId, turns }` — no `language` field was added, so no client change is required (`app/dashboard/new/page.tsx` is untouched). Response shapes including both 500 codes and their Turkish sentences are byte-identical. `deriveLanguage`, `isTurkishText`, `TURKISH_LETTERS/STEMS/WORDS/WORD_RE` and `CLOSE_USER_TURN` are module-local and not exported; the pre-existing seams (`__setPool`, `__setPersonaCaller`, `__setBossFactory`, `__setSessionReader`, `BUILDER_QUEUE`, `PersonaCaller`, `PersonaResult`, `BuilderBoss`) are untouched. `packages/ai` exports nothing new.

## Known Limitations

- **No browser drive and no live end-to-end.** I did not start the app, did not send a live POST, held no key, and touched no database. Correctness is pinned by the focused suite, the four full-suite runs, and the byte hash. The live Turkish end-to-end on a real thread remains the orchestrator-plus-founder gate. (Per `LESSONS.md` §2.4 this is a real gap in *my* evidence, named rather than papered over — but the defect class here is a payload shape and a server-side derivation, both fully exercised through the route's own seam.)
- **The provider half of the 500 is inherited, not re-proved.** I verified the *shape* (both arrays now end in a non-empty user turn, system first) and that the pre-edit shape was system-only. Whether GLM specifically answers 400/1214 to a system-only array is the 0428 report's adjudication, not mine.
- **Moving-tree limits.** The tree is uncommitted and shared; two other agents were writing to `%TEMP%` during my pass (I saw `fvc_*` and `f7t3*` appear/update). My four full-suite runs are therefore valid as a *set* only on the tree state at their times; the files in scope were hash-verified identical before and after every one of them, so the verdict-route rows are stable regardless. The abort question in particular could be tree-load dependent, which is one reason I report "not reproduced" rather than "impossible".
- **Rows D and E are mine, not the author's.** They strengthen the verdict; they are not reproductions of claims in the report, and I label them as such above.
- **I did not read any Agent Report outside the three whitelisted ones**, and did not scan the reports directory.

## Cleanup / instrument disposition

All mutations lived in `%TEMP%\fvc_review_1830\`. Junctions were unlinked **explicitly by name first** (`.NET Directory.Delete(..., false)`, never recursively through a link), then the repo's `node_modules/vitest`, `apps/web/node_modules/vitest/vitest.mjs`, `packages/ai/node_modules` and all five `@corvus` links were asserted intact, then the copy was deleted (reparse-point count re-measured as **0** immediately before the delete). Post-delete assertions: copy `base` gone, my whole instrument dir `fvc_review_1830` gone, `%TEMP%\f523-instrument` byte-identical to its recorded hashes, `%TEMP%\f7t3` and `%TEMP%\f7t3_mut` present and untouched, no stray `__reviewer_probe*.test.ts` in the repo. `git rev-parse HEAD` still `d9cf8d7` and no writing git command was ever run.

## Research statement

**No web research was needed and none was performed.** This is bytes-on-disk verification: every fact in this report was produced by reading files, hashing files, diffing two byte sets, or executing the project's own gates and my own probes. The only live-fact dependency in the reviewed change is the GLM system-only contract, which the brief designates as already-adjudicated context in the whitelisted 0428 report; I consume that adjudication and explicitly decline to re-prove it (no key, no live POST allowed in scope). Tool versions were read from the installed packages (`vitest` 5.0.0 web / eslint 9.39.5, prettier 3.9.6, typescript 5.9.3 at root) — not from memory.

**OSS-first (memory rule):** no external pattern was borrowed for this review. The instrument follows the same out-of-repo-copy discipline the author used, and the mutation design (remove-at-both-sites, force-the-branch) is generic adversarial practice, so there is no repo or URL to cite.

**Next.js docs check (`apps/web/AGENTS.md`):** no Next.js API, route, layout or config is touched by this change or by my review — it edits the body of an existing route handler and its test, so no bundled guide applied. The bundled docs directory was already confirmed present by the author; I did not need it.
