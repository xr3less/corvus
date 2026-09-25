# Task Report: landfix2-terms-test

## Status
SUCCESS

The single stale assertion at `apps/web/app/terms/page.test.tsx:59` now pins the corrected trial
copy. The terms file is green (4/4), and the **full web suite is now 885 passed / 885 across 62 of
62 files** — the terms drift flagged by `dashfix2` was the last failure standing, so the web suite is
now fully green. Exactly one test file was modified; the frozen prod source was not touched
(hash-verified below).

## Files Touched
- CREATED: Agent Reports/2026-09-23-1245_landfix2_FIX_terms-test.md
- MODIFIED: apps/web/app/terms/page.test.tsx (one assertion at line 59, plus a two-line explanatory
  comment — see the diff below in "Verification Performed")

No other file touched. **`apps/web/app/terms/page.tsx` was NOT modified** — verified by SHA-256, not
by diffstat (evidence below). The sibling agent's source fix was still frozen at its
`12:55:41` mtime throughout this task.

## Dependencies Added
- None. No new dependency, no manifest or lockfile edit, no install run.

## Assumptions Made
- **The corrected string was read out of the source file, never from memory.** `apps/web/app/terms/page.tsx:89-90`
  renders the `<li>` as JSX split across two source lines, so the *rendered* string is the
  concatenation with the JSX collapse: `Trial (live): 3 days of Pro features, limited to one bot and
  100 AI credits, no card required.` I confirmed the exact rendered characters rather than trusting
  the source line breaks — the baseline failing test's own output shows this string verbatim in the
  received `textContent`, which is my evidence. The assertion pins the substring
  `3 days of Pro features, limited to one bot and 100 AI credits` (dropping the `Trial (live):` prefix,
  which line 54 already pins separately, and the trailing `, no card required.`, which line 61 already
  pins separately). That keeps the new line's responsibility to the trial *scope* and avoids
  duplicating the neighbours' assertions.
- **I checked the whole file for the trial numbers before editing, and they agree.** Task item 2 asked
  me to verify the corrected copy (3-day / 1 bot / 100 credits) does not contradict other assertions
  in the file. Within `page.test.tsx` there is no other numeric trial assertion to conflict with — the
  new line is the file's only pin on trial scope. The file *does* pin the neighbouring planned prices
  (`$10`, `$29`, `$5 refill pack`, `12 months`) and those are untouched and still pass. No disagreement
  existed, so the escalate-rather-than-rewrite branch of item 2 never triggered.
- **I added a short comment naming the reason rather than a bare string swap.** The file already uses
  this convention for exactly this class of change — line 52-53 carries a `KI-033` comment above the
  `Trial (live):` assertion. A bare copy swap would let a future agent "fix" the assertion back to the
  over-reading copy without seeing why it changed. The comment states the rule, not the history.
- **I deliberately did NOT propagate the corrected copy to the four other trial-line sites I found**
  (see Open Question 1). They are outside my declared file scope and are copy/product changes, not
  test-assertion updates. I am reporting them rather than touching them.

## Open Questions for Orchestrator

**1. Four other sites still ship the un-corrected "full Pro / full access" trial wording. This is the
"never fix only the call site that surfaced the defect" pattern, and it is still open.**

The sibling's source fix changed the trial copy in `terms/page.tsx` to name the real limits (1 bot,
100 AI credits). The same class — trial copy that over-reads as unrestricted — remains at:

- `apps/web/app/terms/page.tsx:44` — *"A 3-day trial with full access and no card is planned."* (the
  "short version" bullet). **Note this one is in the same file the sibling already edited**: their diff
  is exactly one hunk touching only the `Plans, trial, and billing` bullet, so this second bullet in
  the same file was left over-reading. It is frozen to me and is a copy decision, so I did not touch it.
- `apps/web/app/pryzm/page.tsx:230` — `blurb: 'Full Pro, free for 3 days.'`
- `apps/web/app/pryzm/page.tsx:923` — *"Start with 3 days of full Pro free — no card required."*
- `apps/web/lib/demo/brain.ts:9` — `PRICING_REPLY = '... Trials run 3 days, full Pro, no card'` (the
  scripted demo chat's pricing answer).

Assessment, offered as information rather than a verdict: the `pryzm` sites are the weakest case for
being a defect, because `pryzm/page.tsx:229-237` lists the limits adjacently (`'1 bot for 1 server'`,
`'100 credits to spend on builds'`) and the test at `pryzm/page.test.tsx:246,256,257` pins all three of
those strings — so `pryzm` reads as a trial with limits but a headline that arguably overstates the
gate on *which* Pro features. The `terms` line 44 and `brain.ts` sites have no such adjacent qualifier.
This is a **product/copy call**, not an engineering one — flagging it for the founder's decision, not
recommending a sweep unilaterally.

**2. The `dashfix2` report's Open Question 1 is now closed by this task**, and its diagnosis is
confirmed exactly: the terms drift was a UI copy change that landed without its paired test update.
Its prediction ("one small test-only follow-up scoped to `app/terms/page.test.tsx`, exactly parallel to
this one") was the right scope — one file, one assertion, no source change needed.

## Public Interface Exposed
- No production interface touched (test file only). `TermsOfServicePage` is a default-exported
  zero-prop component and remains untouched and unchanged.
- No helper added, no export added, nothing exported from the test file.
- The contract this file now pins on trial copy, so a future change must keep it:
  `textContent` contains the literal `3 days of Pro features, limited to one bot and 100 AI credits`,
  and contains `Trial (live):` while containing neither `Planned: Trial:` nor `Creem` (the last two
  pre-existing, unchanged).

## Verification Performed
Toolchain detected from the real manifests, not assumed: root `package.json` is an npm-workspaces
monorepo (`apps/*`, `packages/*`); web workspace scripts are `typecheck` = `tsc --noEmit` and
`test` = `vitest run`; `node_modules` present at both root and `apps/web` (checked before starting, per
the task's stop-and-escalate condition — it was present, so no escalation was needed). Runner is
`vitest` v5.0.0 per `apps/web/package.json:50`. Lint config: the root flat `eslint.config.mjs` (ESLint
9) and a workspace `apps/web/eslint.config.mjs` (a near-empty `tseslint.configs.recommended` wrapper);
I ran the touched file under **both** and both are exit 0.

- **Baseline captured first.** `npx vitest run app/terms/page.test.tsx` → **1 failed / 3 passed**,
  failing exactly at `:59` with `expected ... to contain '3 days of full Pro access'`. The instrument
  was validated rather than trusted: the failure output prints the full received `textContent`, and it
  visibly contains `Trial (live): 3 days of Pro features, limited to one bot and 100 AI credits, no card
  required.` — i.e. the assertion really was pinning the removed copy, and the target string really is
  what I was about to pin. I did not act on a number I had not seen the raw behaviour for.
- **Touched file:** `npx vitest run app/terms/page.test.tsx` → **4 passed / 4**. Repeated **3×** back to
  back: 4/4 each time. No flake.
- **Full web suite:** `npx vitest run` → **885 passed / 885, 62 of 62 files pass.** This resolves the
  last outstanding failure in the workspace; no new failure was introduced. (One benign non-failure
  stderr line appears: `Not implemented: HTMLCanvasElement's getContext()` — a pre-existing jsdom
  limitation from an unrelated file, not a test failure, present before my change.)
- **Typecheck:** `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`) → **exit 0, zero errors.**
- **Lint:** `npx eslint app/terms/page.test.tsx --max-warnings 0` (workspace config) → **exit 0, zero
  warnings.** `npx eslint apps/web/app/terms/page.test.tsx --max-warnings 0` (root config) → **exit 0.**
  No lint rule, config, or dependency was modified to achieve this.
- **Format:** `npx prettier --check app/terms/page.test.tsx` → *"All matched files use Prettier code
  style!"*.
- **Guard-break probes — the new assertion was deliberately broken and watched to fail twice** (the
  source is frozen, so I mutated my own expectation, confirmed the failure, then restored):
  1. Pointed it at the *old* copy (`'PROBE-OLD-COPY 3 days of full Pro access'`) → **failed**, naming
     the drift. This is the exact assertion whose absence let the original drift ship, and it now
     cannot pass over the over-reading copy.
  2. Pointed it at a **credit-number drift** (`... and 1000 AI credits`) → **failed**, proving the
     assertion pins the numbers and is not satisfied by a merely-similar prefix. A weaker
     `toContain('3 days of Pro features')` would have passed this probe and silently absorbed a wrong
     credit count; per the repo's own rule the set *and* its size are now asserted.
  3. Restored, and confirmed byte-exact by hash: post-probe `sha256` equals the pre-probe
     `da4bd0c329885a5266a1a1026857eed341baa731b39221daac414e429666842a`. The probes left no residue.
- **PROD SOURCE UNCHANGED — verified by hash and mtime, stated as required.** `apps/web/app/terms/page.tsx`
  `sha256` **before** my work = `f1c2f8d67bee8c60ef880feb0e67ebc2168f408b005734734b7d8c0aaf68bd8e`;
  **after** all tests, probes and runs = `f1c2f8d67bee8c60ef880feb0e67ebc2168f408b005734734b7d8c0aaf68bd8e`.
  **Identical — the file is byte-for-byte what the sibling left.** Its mtime is likewise unchanged at
  `2026-09-23 12:55:41`, *before* my final test-file write at `2026-09-23 12:59:35`. `git diff --cached --stat -- apps/web/app/terms/page.tsx` is **empty** (nothing
  staged). Per the task's note, I did not rely on diffstat alone — the working tree carries ~200
  uncommitted wave files, and the `M` this source shows in `git status --short` is the **sibling agent's**
  uncommitted fix from this wave, not mine; a read-only `git diff` confirms its change is exactly **one
  hunk** (the `Plans, trial, and billing` trial bullet), and I made no edit of any kind to that file.
- **No secrets; no manifest/env edits; no installs; no git restore/commit; no production contact.**
  No git command that restores from HEAD was run (no `stash`/`checkout --`/`restore`/`reset`), and no
  commit was made. Only read-only `git diff`/`git status`/`git diff --cached` were used, for evidence.
  No `.env`, `package.json`, or lockfile was read into or written by this task. No secret value was
  read, printed, or transmitted; the only credential-shaped check in scope (that the source renders
  `support@corvus.ai`) is a public support address already in committed source, not a secret. No
  production box, Contabo, GHCR, or live-key contact of any kind.

The complete diff of my work (read-only, against HEAD) is exactly:

```diff
--- a/apps/web/app/terms/page.test.tsx
+++ b/apps/web/app/terms/page.test.tsx
@@ -56,7 +56,9 @@ describe('terms of service page', () => {
     expect(text).toContain('Planned: Credits:');
     expect(text).toContain('Planned: When a plan lapses:');
     expect(text).not.toContain('Planned: Trial:');
-    expect(text).toContain('3 days of full Pro access');
+    /* KI-033: the trial is limited to one bot and 100 AI credits, so its copy must
+       not over-read as unrestricted "full Pro access". */
+    expect(text).toContain('3 days of Pro features, limited to one bot and 100 AI credits');
     expect(text).toContain('no card required');
     expect(text).toContain('$10');
     expect(text).toContain('$29');
```

## Known Limitations
- **I did not edit the sibling source file, so I cannot state that its own fix is correct** — only that
  it is unchanged by me and that the copy it now renders satisfies this test. If the sibling agent
  changes the copy again after this report, this assertion goes red again; that is the intended
  behaviour of a pin, not a defect in it.
- **Concurrent-edit risk was real and was handled as instructed.** The task warned the sibling might be
  editing the source mid-run. I hash-checked the source before and after every run: it was stable at
  `f1c2f8d6…` throughout, and the file's mtime (`12:55:41`) predates my first run by minutes, so no
  re-run was needed on that account. Had the hash moved, I would have re-run once before concluding.
- **I verified nothing on the real path** (no dev server, no browser render of `/terms`). This is a
  test-assertion task whose subject is a server-rendered static page; the assertion is exercised against
  the real component via `render(<TermsOfServicePage />)`, and the string it pins is the component's own
  rendered `textContent` captured in the baseline failure output. The page's live appearance was not
  re-checked — consistent with this task's boundaries, and it is the copy change's owner who owns that.
- **The four sites in Open Question 1 remain un-corrected.** After this task the repo still ships
  "full Pro / full access" trial wording in `terms/page.tsx:44`, `pryzm` (×2) and `brain.ts`. This task
  closes the test/copy mismatch on one line; it does not close the class. That is stated deliberately so
  this report is not read as "the trial copy is now honest everywhere".
- **The `Not implemented: HTMLCanvasElement's getContext()` stderr line** in the full-suite output is a
  pre-existing jsdom limitation in an unrelated file. I did not investigate it (out of scope) and it is
  not a failure, but a reader of the raw output will see it.
