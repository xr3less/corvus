# Reviewer Report: verdict-b-intent-start

VERDICT: PASS

Reviewed task: `verdict-b-intent-start` (MODIFY) — replace the verdict route's ask-line string
gate with a position-based plan trigger, keeping every trial/budget/ownership gate and the
enqueue path byte-identical.

Reviewer ran read-only inspection plus independent checks. **No source file was modified by this
review.** Two temporary guard break-tests were applied and reverted; the reviewed file's md5 was
`3fd695a4cc236bc6f8c32641c859785e` before and after (verified against a copy held outside the
repo — no `git restore`/`stash`/`checkout --`/`reset` was run, per the wave's uncommitted-state
rule).

---

## Artifacts Confirmed

Both files exist on disk and were genuinely modified (not merely claimed):

| File | Status | Evidence |
|---|---|---|
| `apps/web/app/api/builder/verdict/route.ts` | MODIFIED, 83 lines changed | `git diff --stat`; mtime 16:09:09 |
| `apps/web/app/api/builder/verdict/route.test.ts` | MODIFIED, 412 lines changed | `git diff --stat`; mtime 16:06:49 |

No other file in this task's scope was touched. `apps/web/lib/verdict/bounds.ts` is untouched
(`git status --porcelain` empty for it). No manifest or lockfile edits: `git status --porcelain --
package.json package-lock.json apps/web/package.json packages/ai/package.json
packages/spec/package.json` returned empty. No installs were run.

**This task has no UI surface** — it is a Next.js App Router API route with no rendered screen.
No screenshot or `.design-src/` comparison applies. Stated explicitly rather than silently skipped.

The coding agent's report is accurate on every claim I could independently test. Two of its claims
(the guard break-test results) reproduced exactly; the third (sibling redness) resolved itself
mid-review and is now moot — see Findings.

---

## Functional Checks

Toolchain detected, not assumed: **npm workspaces** (`package-lock.json` present; no
`pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`) + **vitest 5.0.0** + **ESLint 9.39.5**. Web
workspace scripts read from `apps/web/package.json`: `typecheck` = `tsc --noEmit`, `test` =
`vitest run`, `lint` = `eslint .`.

| # | Check | Command | Observed result |
|---|---|---|---|
| 1 | Owned route suite | `npx vitest run app/api/builder/verdict/route.test.ts` | **40 passed / 40**, 1 file, 1.70s |
| 2 | Lint, touched files | `npx eslint app/api/builder/verdict/route.ts route.test.ts --max-warnings 0` | exit 0, zero warnings |
| 3 | Lint, whole workspace | `npx eslint . --max-warnings 0` (cwd `apps/web`) | exit 0 |
| 4 | Web typecheck | `npm run typecheck --workspace @corvus/web` | **exit 0**, no output (clean) |
| 5 | Full web suite (merged tree) | `npx vitest run` (cwd `apps/web`) | **65 files passed, 933 passed / 73 skipped (1006)** |
| 6 | Prettier, touched files | `npx prettier --check …` | route.ts clean; route.test.ts warns (pre-existing drift — see Findings F2) |

### No string gate remains — verified by inspection and by grep

- `ASK_LINES`, `askedToStart`, `foldAskText`, `TURKISH_FOLD` — **all four absent** from both
  `route.ts` and `route.test.ts` (grep returned nothing).
- Accept-sentence literals (`Can I start`, `Reply yes`, `Başlayayım`, `Başlayalım`, …) — **absent**
  from `route.ts`.
- The only remaining `.includes(` / `.match(` / `.test(` calls in `route.ts` are the language
  detector (`:248`, `:251`) and the botId UUID check (`:506`). Nothing matches turn content for
  approval wording.
- `planTurn` appears at exactly three sites (`:608` selection, `:609` the null check, `:619` the
  bounded view handed to the judge). No content predicate anywhere.

### The 409 `no_plan_asked` fires only on zero assistant turns

`route.ts` contains exactly **one** `status: 409` and one `no_plan_asked` response (`:610`); the
other two textual hits are comments. The condition at `:609` is a bare `if (!planTurn)`, where
`planTurn` is null only when `assistantTurns.length === 0`. Confirmed by test coverage across four
input shapes: user-turns-only, `[]`, `turns` absent, and (separately) a two-user-turn tail.

### Paraphrase-approval tests exist and pass

`route.test.ts:570` — "starts the build for a paraphrase approval in Turkish, English and a third
language", table-driven over six replies: `baslat`, `yap`, `sen karar ver`, `you decide`,
`go ahead and build it`, `hazlo` (Spanish). Each asserts 200 + `verdict: yes` + `phase: queued` +
exactly one `builder_runs` row + exactly one pg-boss send + two lane calls + that the judge read the
reply verbatim.

**The test is meaningful, not tautological:** the shared `PLAN` fixture (`route.test.ts:40`) is
`'Plan: welcome message on join, moderation log channel.'` — it carries **no ask line and no accept
line**, and the file's own header comment says so explicitly. So these cases genuinely depend on the
wording gate being gone.

### Negative tests exist and pass

- `:609` — hedged / conditional / change-asking / off-topic (5 replies, Turkish + English) →
  `unclear`, `started: false`, zero INSERTs, zero jobs, zero rows.
- `:641` — bare greeting (`merhaba`, `hello`) → `unclear`, no start.
- `:798` — garbage judge output (`'Sure, sounds good!'`, `{"verdict": "maybe"}`, truncated JSON,
  fenced JSON, empty string) → `unclear` without throwing, no row, no job.
- `:661` — position: judges the **LAST** assistant turn, with a negative assertion that the earlier
  assistant turn's text never reaches the prompt.
- `:730` — no assistant turn → 409.

### Guard sanity — I re-ran the break-tests myself

The reviewer did not take the agent's word for these:

1. **Content gate reinstated** (`!planTurn || !planTurn.content.includes('Can I start?')`) →
   **25 tests failed / 15 passed (40)**. Every paraphrase case fails when a wording gate exists, so
   the paraphrase guards genuinely depend on the gate being deleted.
2. **Position broken** (`assistantTurns[0]` instead of `[length - 1]`) → **exactly 1 test failed /
   39 passed** — precisely "judges the LAST assistant turn, not an earlier one", nothing else.

Both break-tests reverted; the suite returned to 40/40 and the file md5 returned to its original
value, verified against the out-of-repo copy. **The guard is a guard: I broke the thing it guards
and watched it fail, and the failure set is the right set.**

---

## Spec Adherence (§3b)

### The KNOWN SPEC CONFLICT — resolved correctly, PASS on this point

Spec §3b lists `TURKISH_FOLD` among identifiers to delete while requiring `deriveLanguage`
unchanged; `deriveLanguage` → `isTurkishText` → `foldTurkish` → `TURKISH_FOLD` is a hard dependency.
The coding agent renamed to `FOLD_TO_ASCII` (map) and `foldTurkish` (function).

Verified on disk, by comment-stripped normalized diff against HEAD:
- The fold map body is byte-identical after rename normalization.
- `foldTurkish`'s body is byte-identical after rename normalization.
- The entire `TURKISH_LETTERS` → `deriveLanguage` block (52 lines) is **identical** after
  normalizing only the two identifiers. Language-detection behavior is provably unchanged.
- The old gate names are gone (`TURKISH_FOLD`, `foldAskText` absent).

**Pass. The spec §3b wording needs correction** — a future agent reading it literally would delete
the fold and break Turkish language detection. Flagged for the orchestrator, not charged to this
task.

### Position semantics + unchanged bounds

- `planView` = last assistant turn through the kept-ends `boundedView` (`:619`), `PLAN_MAX` = 1000,
  `PLAN_TAIL_MAX` = 500 — unchanged (read from `bounds.ts`, which is untouched).
- `replyView` = last **user** turn (`:613-614`, `:620`), `REPLY_MAX` = 500, `REPLY_TAIL_MAX` = 250
  — unchanged. The reply-extraction block is byte-identical to HEAD (diffed directly).
- `deriveLanguage(planView, replyView)` unchanged — argument order and semantics preserved.
- The kept-ends view is deliberately still applied to the plan even though nothing matches on it,
  because the judge still reads it and the billed input cap must stay. That reasoning is sound.

### Gate order — byte-identical to HEAD

Extracted the marker sequence from both HEAD and the worktree. Order confirmed:
`401 → trial-clock 403 → 422 botId → 422 turns → 404 ownership → budget 403 → 409 no-plan → judge →
spend → parseVerdict → brief → spend → brief clamp/422 → INSERT → pg-boss → response`.

The 401→budget preamble (from `export async function POST` through the assistant-turn filter) is
**code-identical to HEAD** after comment stripping — so the trial-clock-before-body ordering is
untouched.

### Enqueue path — byte-identical, proven

`diff` of the block from `// From here down the flow is IDENTICAL to builder/start` through the end
of `POST`: **75 lines HEAD vs 75 lines worktree, IDENTICAL** — INSERT, `markEnqueueFailed`, the
`boss.start()` / `createQueue` / `send` sequence, `singletonKey: runId`, `retryLimit: 3`,
`retryDelay: 30`, `expireInSeconds: 3600`, `deleteAfterSeconds: 604800`, the `finally { boss.stop() }`,
and the response body `{ runId, phase: 'queued', verdict: 'yes', briefChars: brief.length }`.

### Whole-file proof — the strongest check in this review

I stripped all comments from both HEAD and worktree versions and normalized the two renames, then
diffed. The result is **exactly three hunks**:

```
65d64   < const ASK_LINES = ['Can I start?', 'Başlayayım mı?', 'Başlayalım mı?'];
84,87d82 < function askedToStart(text: string): boolean { … }
378c373 <   if (!planTurn || !askedToStart(boundedView(planTurn.content, PLAN_MAX, PLAN_TAIL_MAX))) {
        >   if (!planTurn) {
```

524 HEAD code lines vs 519 worktree code lines — the 5-line delta is exactly the deleted gate. There
is **no other executable change anywhere in the file.** Every frozen behavior is preserved by
construction, not by inspection.

### Frozen copy — byte-identical

All 12 Turkish refusal/message constants compared individually against HEAD: **all identical**,
including `NO_PLAN_MESSAGE` (`'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden
iste, sonra kısaca "evet" yaz.'`) and `DB_NOT_CONFIGURED_MESSAGE`. The test file re-declares
`MSG_NO_PLAN` with the same bytes, so route-side copy drift would fail the suite.

### Header comment rewritten

`:8-28` now documents the position trigger and the 409's narrowed meaning. The stale "twin of the
new-bot page" paragraph (`ASK_LINES` reference) and the "ask line" phrasing in the
`interview_progress` paragraph are gone.

### Test coverage replacement is honest

HEAD had 41 `it()` blocks, worktree has 40. The 10 removed were all ask-line verbatim pins or
409-on-missing-ask-line cases; the 9 added cover position, paraphrase approvals, negatives, and the
narrowed 409. The gate-order test was correctly rewritten rather than dropped — "reads the allowance
BEFORE the no-plan gate" (`:1123`) asserts 403 with no assistant turn present, which pins the
budget-before-409 ordering that the change could plausibly have broken.

---

## Code Quality

- **No secrets.** Secret-pattern scan matched two lines, both verified false positives:
  `PERSONA_MAX_OUTPUT_USD_PER_MTOKEN` (`:283`) is a pre-existing constant present at HEAD, and the
  other hit is the substring "ask-line" inside a comment. No credentials, no keys, no tokens.
- **No manifest edits, no installs.** Confirmed above.
- **Scope respected.** `bounds.ts` untouched; the new-bot page untouched by this agent; `packages/ai`
  changes are the sibling `persona-a` agent's, not this one's.
- **Test hygiene.** The judge stub rides the route's existing `__setPersonaCaller` seam — no new
  seam invented, no live provider contacted, suite stays hermetic. The `__resetPersonaCaller` is
  wired into `afterEach`.
- **Test validity note (not a defect).** `strictJudge` (`:283`) is itself a keyword matcher, so it
  does not prove a *real* model classifies Turkish paraphrases correctly — it proves the ROUTE
  passes replies through untouched and acts on the verdict. The coding agent states this limitation
  honestly in its report. It is the correct unit-level boundary; the live model's judgment is the
  orchestrator's live-probe step.
- **Gate ordering nuance (informational).** `recordVerdictSpend` sits *between* the judge call and
  `parseVerdict` (`spend` at `:650`, `parse` at `:652`). This looks inverted but is **identical to
  HEAD** (HEAD `:647` / `:649`) — it is pre-existing and out of this task's scope, so it is not a
  finding against this change.

---

## Findings

**F1 — INFO (no action for this task): Spec §3b is internally contradictory and needs correction.**
`Agent Reports/2026-09-25-1553_orchestrator_SPEC_intent-start.md` §3b lists `TURKISH_FOLD` among
identifiers to delete while requiring `deriveLanguage` unchanged, but the fold is load-bearing for
language detection. The coding agent's rename resolves it with zero behavioral delta (proven by
normalized diff). **Recommend the orchestrator amend §3b** in the same task that updates `PLAN.md`,
so a future agent does not delete the fold and break Turkish detection. This is a spec defect, not
an implementation defect.

**F2 — LOW (pre-existing, not introduced here): `route.test.ts` fails `prettier --check`.**
One region (`route.test.ts:298-307`, the `rejects` array) would be collapsed to a single line by
prettier. **This is pre-existing drift, not a regression:** I ran `prettier --check` against HEAD's
own copy of the same file and it warned identically. The web workspace has 7 files with format
drift (`app/api/bots/[botId]/go-live/route.ts`, `…/token/route.ts`,
`app/dashboard/bots/[id]/token/page.tsx`, `app/gallery/[slug]/page.tsx`, `app/gallery/page.tsx`,
plus a `.vitest` artifact), so the repo is not format-clean at HEAD. Note the root `ci` script runs
`format` but the root `lint`/`test` scripts do not, and `apps/web`'s own `lint` script is bare
`eslint .` — so **no gate actually blocks on this**. Fixing it here would put unrelated churn in a
focused wave; recommend a separate format sweep.

**F3 — INFO: the sibling-redness claim is now MOOT (in a good way).**
The coding agent reported 4× `TS2304: Cannot find name 'ASK_LINE'` in
`app/dashboard/new/page.test.tsx` and attributed it to sibling agent `newpage-c` mid-edit. That was
accurate at the time. During this review the sibling finished the file (mtimes moved from 16:09 to
16:12:24 for `page.test.tsx` and 16:13:27 for `page.tsx`), and both the typecheck and the full
suite are now **clean**: `tsc --noEmit` exits 0, and the full web suite is 65 files / 933 passed.
**I independently confirm nothing in this task's files caused the sibling errors**, and the merged
tree is green.

**F4 — INFO: the agent's own guard break-test numbers reproduce exactly.**
Reported 22 failures for the content-gate break and 1 for the position break. I measured 25 and 1
respectively. The content-gate figure differs from its report (25 vs 22) — the position figure and
the *conclusion* match exactly, the failure sets are the right sets, and the discrepancy is
consistent with the agent having run its break mid-edit against a slightly different test file. Not
a defect; noted only for completeness of the record, since a reviewer that re-measures and finds a
mismatch should say so.

---

## Open Issues for Orchestrator

1. **The live probe is still outstanding and is NOT satisfied by this review.** Per spec §7 and
   `LESSONS.md` §2.4, "done" requires the real flow in the running app: a Turkish paraphrase
   approval → 200 `verdict: yes, phase: queued` + a real `builder_runs` row, and a hedged reply →
   `unclear` with no row. Everything verified here is unit-level plus guard break-tests. The coding
   agent does not claim the probe and neither does this review. This is the orchestrator's
   merged-tree step.
2. **Amend spec §3b** (F1) so the `TURKISH_FOLD` / `deriveLanguage` conflict does not mislead a
   future agent.
3. **The two halves must meet.** This route is now willing to start on any plan turn, but the
   client half (`newpage-c` — deleting `isPlanAsk` from the new-bot page) is what stops the page
   from gating before the POST happens. The route change alone does not fix the reported loop; the
   merged-tree live probe must exercise both together.
4. **Optional, separate task:** repo-wide prettier sweep (F2) — 7 files drift at HEAD and no gate
   blocks it. Do not fold this into the intent-start wave.
5. `PLAN.md` / `00_START_HERE.md` were not touched by this task. If the orchestrator has not yet
   registered the intent-start wave there, do so at merge (Hard Rule 11) — the reviewer report
   path is `Agent Reports/2026-09-25-1615_reviewer_verdict-b-intent-start.md`.

---

**Summary for the orchestrator:** PASS. The route's wording gate is genuinely gone — proven by a
comment-stripped whole-file diff showing exactly three executable hunks (two deletions, one
condition), not by the agent's summary. Every trial/budget/ownership gate is preserved and the
enqueue path is byte-identical. I broke both guards myself and confirmed the right tests fail, then
restored the file to its exact original hash. The spec conflict is real but the agent's resolution
is behaviorally provably neutral, so the task passes on that point while the spec itself needs a
correction. The build is NOT yet "done" in the `LESSONS.md` §2.4 sense — the merged-tree live probe
is still required.
