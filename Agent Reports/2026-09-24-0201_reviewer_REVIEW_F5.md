# Reviewer Report: review-F5

## Status

**PASS** — the F5 deliverable is correct, its numbers are source-verified, its gates reproduce on the
merged tree, and its headline cross-file finding is **true as reported** (I re-proved it with an
 instrument that was itself validated). No blocking finding. Five findings are recorded below —
two explanatory (report/comment imprecision), three non-blocking follow-ups the orchestrator should
keep on the list.

- Reviewer: independent (`review-F5`), did not write the code, ran no production edits.
- Artifact under review: `apps/web/lib/bots.ts` (84 insertions / 28 deletions vs HEAD `d9cf8d7`).
- Report under review: `Agent Reports/2026-09-24-0201_F5_MODIFY_bots-turkish.md`.
- No file other than this report was written. No `git` verb that restores from HEAD was run
  (`git show` / `git diff` / `git status` only — read-only). No install, deploy, migration or secret access.

---

## Verdict on the objective

| Claim under review | Verdict | Evidence (file:line) |
| --- | --- | --- |
| In-scope copy is Turkish, no invented facts | **TRUE** | `lib/bots.ts:60,79` — 3 days = `apps/gateway/drizzle/0010_accounts_trial_ends.sql:20` (`now() + interval '3 days'`); 1 bot = `lib/bots.ts:139` (`liveBotCount >= 1`); 100 = `apps/web/lib/auth/session.ts:102` (`TRIAL_GRANT_CREDITS = 100`) |
| No export name / type / arity moved → no consumer change | **TRUE** | `diff` of `git show HEAD:apps/web/lib/bots.ts` vs worktree export lines → **EXPORT SURFACE IDENTICAL**; `npx tsc --noEmit` exit 0 |
| Pricing untouched | **TRUE** | `packages/ai/src/cost.ts` not in the diff at all; `USD_PER_CREDIT = 0.005` byte-identical HEAD↔worktree; `CREDITS_PER_CHANGE` still `1.1` (`lib/bots.ts:192`) |
| `TRIAL_BOT_LIMIT_MESSAGE` defined from `TRIAL_DEAL` (drift impossible) | **TRUE** | `lib/bots.ts:85` — `export const TRIAL_BOT_LIMIT_MESSAGE = TRIAL_DEAL;` |
| Byte-identity with F15's refusal table | **TRUE — re-proved by me with a negative control** | `lib/http/refusal.ts:38,39`; my probe reports `deal identical: true`, `expired identical: true`, and `DRIFT DETECTED (checker works)` on a mutated control |
| Only one file touched by the agent | **TRUE** | `git status --porcelain -- apps/web/lib/bots.ts` → ` M apps/web/lib/bots.ts`; `packages/ai/src/cost.ts` clean |
| 9 focused suites green (241/241) | **TRUE** | reproduced: `Test Files 9 passed (9) / Tests 241 passed (241)` |
| Full suite 982 pass / 3 fail | **TRUE** | reproduced: `Test Files 3 failed | 61 passed (64) / Tests 3 failed | 982 passed (985)` |
| The 3 residuals cannot see `lib/bots.ts` | **TRUE — proved, not asserted** | see Instrument §2 below |
| Cross-file English drift exists in 3 routes | **TRUE as reported** (one nuance, Finding 2) | `app/api/chat/route.ts:88`, `app/api/builder/verdict/route.ts:89`, `app/api/builder/start/route.ts:42` |

---

## Instrument validation (done before trusting any reading)

1. **The reachability instrument was proved to work in both directions.** A naive `grep -c "lib/bots"`
   is a *string* count, not a dependency test — it would score 0 for a file that imports the module
   through a different specifier. I wrote a transitive specifier resolver and ran it with controls:
   - **Positive control** (files that *do* consume the module): `app/dashboard/page.tsx → lib/bots hits=1`,
     `app/dashboard/bots/page.tsx → 1`, `app/dashboard/bots/[id]/page.tsx → 1`, `app/api/bots/route.ts → 2`.
   - **Negative control** (the three residual failures): `app/gallery/page.tsx → 0` (5 files walked),
     `app/dashboard/new/page.tsx → 0` (14 files), `app/page.tsx → 0` (3 files). Same result over the
     *test* files. The instrument distinguishes the two classes, so its negatives are meaningful.
2. **The identity probe carries a negative control** (LESSONS §8): mutating `TRIAL_DEAL` by one word
   makes it report `DRIFT DETECTED`, so a `true` reading is not a checker that always says yes.
3. **The dev server was validated as serving the current tree, not a stale build** — `curl
   http://127.0.0.1:3000/` returns the wave's own Turkish bytes (`Ücretsiz 3 günlük deneme — 1 bot,
   100 AI kredisi, kart gerekmez.`, `Gizlilik Politikası`), which do not exist at HEAD.
4. **`git diff --stat` vs `--numstat` discrepancy chased, not shrugged at:** repo-wide `.gitattributes`
   has `* text=auto eol=crlf` and the file is CRLF in the index, which shifts the rounder's count by
   blank lines. Raw truth: **84 / 28**. The agent's report says "+79 / −23" (Finding 5, cosmetic).

---

## Commands run and results

```
cd apps/web && npx tsc --noEmit                       -> exit 0
cd apps/web && npx eslint lib/bots.ts                  -> exit 0, zero warnings
cd apps/web && npx eslint .                            -> exit 0
cd apps/web && npx prettier --check lib/bots.ts        -> clean
cd apps/web && npx vitest run <9 named suites>         -> 9 files / 241 tests passed
cd apps/web && npx vitest run                          -> 3 failed | 61 passed (64 files); 3 failed | 982 passed (985)
cd apps/web && grep -rn "3-day trial" app lib components -> 3 route producers + their tests (Finding 2 class)
node /tmp/reach.mjs <entries>                          -> positive controls hit lib/bots; the 3 failures do not
node /tmp/identity-probe.mjs                           -> identical: true / true; negative control fires
curl -s http://127.0.0.1:3000/                         -> 200, Turkish trial line present in rendered HTML
curl -s http://127.0.0.1:3000/dashboard                -> 307 -> /api/auth/login (no session; banner path not reached)
```

The 3 residual full-suite failures, reproduced and attributed:
`app/gallery/page.test.tsx` "falls back to the raw error code…", `app/privacy/page.test.tsx`
"points Privacy Policy and Terms of Service…", `app/dashboard/new/page.test.tsx` "submitting streams
the reply…". The first is F15's own contradictory test (`app/gallery/page.test.tsx:409-423` pins the
raw code that `lib/http/refusal.ts:38` was written to remove); the other two are F2/F8/F13 sibling
changes landing against stale English pins (`app/privacy/page.test.tsx:104`, `app/dashboard/new/page.test.tsx:490`).

---

## Findings

### F1 — MEDIUM — the file comment overstates the drift ("do NOT import this module") [explanatory]

`apps/web/lib/bots.ts:72-77` says the three route files "do NOT import this module". Two of them
**do**: `app/api/builder/start/route.ts:35` and `app/api/builder/verdict/route.ts:67` both
`import { isPaidTier } from '…/lib/bots'`. Only `app/api/chat/route.ts` has no `lib/bots` import at
all. The accurate phrasing is "do not import these constants". The *substantive* claim (the text is
hard-coded locally in each of the three) is correct and I re-verified all three sites. This is a
one-line wording fix, not a re-open; record it so the follow-up task does not go looking for a
non-existent import to delete. Class: LESSONS §1.8 (a guard/claim whose wording is wider than its body).

### F2 — MEDIUM — the drift narrative assigns the chat route's failure to F5 alone; the chat route is a **failed, escalated** task [explanatory]

`app/api/chat/route.ts:88` is on the build/chat path, so a user exhausting the trial via chat still
reads English while the mint path reads Turkish — real. But the tree shows the chat route's copy is
not an oversight F5 could have caught by looking: `app/api/builder/verdict/route.ts:89-90` and
`app/api/chat/route.ts:86-87` each carry an explicit *"Locked wording (KI-033 SPEC, byte-level)"*
comment, and **F8 exists precisely to translate them and returned `FAILED — escalated, no change
shipped`** (`Agent Reports/2026-09-24-0201_F8_MODIFY_chat-turkish.md`), with F1 reaching the same
conclusion independently. F8's Open Question 4 asks the orchestrator to choose between (a) widening
scope or (b) one coordinated task that rewrites all producers + pins together. **F5 is the
prerequisite for (b), not the cause of the residue.** Recommendation: resolve F8's OQ4 and land the
follow-up as one task over `chat/route.ts`, `builder/start/route.ts`, `builder/verdict/route.ts`,
`chat/route.ts:105-109` (the budget sibling), plus their three test files, pointing all of them at
`lib/bots.ts`. Do **not** send that follow-up to an agent while that decision is open — it is the
same unsatisfiable task F8 already refused.

### F3 — LOW — `formatCount`'s `en-US` grouping is a real Turkish-language defect, correctly escalated, and the pin that blocks it is F12's

`apps/web/lib/bots.ts:232` — `value.toLocaleString('en-US')` renders `2,013 üye` where Turkish writes
`2.013 üye`. It is inside F5's file but outside F5's stated copy scope, and moving it alone reds
`app/dashboard/bots/page.test.tsx:225` (`'2,013 üye · 2 sunucu'`), owned by the concurrent F12 agent —
F12's report Open Question 4 says exactly that the lib is out of *its* scope. Both agents correctly
declined; the residue needs **one** task that changes the locale and its pin together. Not a blocker
for F5. Also note the same file's `formatActivityTime` (`lib/bots.ts:301`) formats dates `'en-US'`
(`Sep 13, 10:00 AM`) and now sits inside the Turkish "Son etkinlik" panel
(`app/dashboard/bots/[id]/page.tsx:1266,1278`) — the same class, one function away, unmentioned by
either report. Bundle both in that task.

### F4 — LOW — Turkish apostrophe convention differs inside the new copy [cosmetic]

The new `MOCK_SPECS` copy writes `v11'e` with an ASCII apostrophe (`lib/bots.ts:202`, inside a
template literal), while the wave's other Turkish page copy uses the curly `’` (`Discord’da`,
`kaydet’e` — `app/dashboard/bots/[id]/page.tsx:595`, `:615`). These are dead strings (the report's
analysis is correct: every mock `kind` is known to `explain()` — I checked the `switch` in
`packages/spec/src/explain.ts:84-171` and `packages/spec/src/explain.ts:183` is the only `title`
reader — so `title`/`detail` never render), but the file that is otherwise the wave's canonical copy
should not ship a second apostrophe style. One-character fix at leisure.

### F5 — INFO — the report's diffstat does not reproduce (+79/−23 vs the tree's 84/28) [cosmetic]

Same rounder causes the `--stat` "112 ++++" line. Nothing material: the *content* under review is
correct and the file is the only one the agent wrote. Recorded because a reviewer's job includes
not letting a number stand unverified.

### INFO — the byte-identity invariant is still asserted only in a comment (no in-repo guard)

Tallied independently: `lib/http/refusal.ts` has **zero** imports; it depends on `lib/bots.ts` by
comment alone, in both directions. F15's report flags the same seam (its Open Question 4). A guard
here needs no new file and would be cheap. Per the harness rule "a guard is not a guard until you
have broken the thing it guards," this should be a test that pins the two pairs (and their sizes),
not another comment.

---

## What I could and could not verify

- **Real path, partially exercised (this is new evidence, not a restatement).** The dev server on
  `127.0.0.1:3000` is live and serving the working tree; I confirmed the wave's Turkish bytes are in
  the rendered HTML. `/dashboard` and `/dashboard/bots` returned **307 → `/api/auth/login`** (no
  session), so the **trial banner itself was not seen in a browser** — the remaining live-evidence
  debt is narrower than the F5 report implies: `dashboard/page.tsx:233` prints
  `TRIAL_EXPIRED_MESSAGE` verbatim, `dashboard/page.test.tsx:304,314` assert it via the import, and
  `dashboard/bots/page.test.tsx:378` pins the Turkish bytes literally. A founder-level pass over one
  trial-expired account is still owed, and `CORVUS_DEV_LOGIN=1` (POST `/api/auth/dev-login`) is the
  seam that would make it cheap — I did not attempt it, as it would write a dev account row.
- **No human completed the flow in the running app** (LESSONS §2.4). Stated plainly, as the agent did.
- Gateway and `packages/spec` suites were not re-run: `packages/spec/src/explain.ts` is untouched and
  the change is web-only.
- The other dirty files in the tree (`app/dashboard/**`, `lib/http/refusal.ts`, `components/**`) belong
  to peers F1–F16, not to F5; I did not review them here.

## Verdict

**PASS.** The objective — the one in-scope file's trial/credit copy in honest Turkish with the
enforced numbers, no export or pricing movement — is met and verified on the merged tree, with the
agent's own headline finding (cross-file English drift) confirmed and its attribution of the 3
residual failures independently proved rather than taken on trust. Carry F2's follow-up and F3's
locale task forward; neither blocks F5.
