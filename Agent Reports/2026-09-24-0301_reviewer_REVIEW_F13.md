# Task Report: review-F13

## Status

**PASS** — the F13 deliverable is correct and verified on the real path. Two findings are recorded
below: one **medium** (a guard whose body is narrower than its title) and one **low** (an inaccurate
sentence in the F13 report). Neither changes the shipped page's honesty or language.

Reviewer wrote no production code. No tracked file was modified; scratch used a temp dir outside the
repo and was removed. No git restore/stash/checkout/commit/push, deploy, migration or secret access.

## Verdict on the objective

| Claim under review                                    | Verdict | Evidence                                                                 |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| Landing page ships in Turkish                         | TRUE    | 173 rendered visible lines, all Turkish; independent residue sweep clean  |
| Honesty qualifiers preserved 14 / 13                  | TRUE    | Re-proved against the **pre-change backup**, not HEAD (see Instrument)    |
| Qualifier stays attached to its own claim             | TRUE    | Line-by-line pairing pre vs final, 14/14 and 13/13 one-for-one            |
| Prices / plan names / figures byte-unchanged          | TRUE    | `$0` `$10` `$29` `2.000` `6.000` `~1.800` `12 ay` `8 şablon` all present   |
| Two in-scope files green                              | TRUE    | 13 passed (13); real typecheck exit 0; repo lint exit 0; prettier clean   |
| Only 2 files touched by F13                           | TRUE    | Both byte-identical to the agent's own final backup (`cmp -s`)            |
| Cross-suite break correctly escalated, not hidden     | TRUE    | /privacy red exactly as reported; it is the only external consumer        |

## Instrument validation (done before trusting any reading)

1. **`TSC_EXIT`/`ESLINT_EXIT` after a pipe are `tail`'s code, not the tool's.** Re-ran both writing to
   a file and reading `$?` directly: `npm run typecheck` → **0**, `npm run lint` → **0**.
2. **The `:3000` server is a dev/Turbopack server** (HMR chunk
   `_next/static/chunks/[turbopack]_browser_dev_hmr-client...` present, no `BUILD_ID`). Validated it
   serves *current* source rather than a cached build by fetching with a cache-buster and confirming
   strings that exist only in the working-tree `page.tsx` are present.
3. **`git show HEAD:app/page.tsx` is the WRONG baseline for the parity claim.** HEAD carries 12
   `(planned)`; F13's pre-change baseline (its own backup, `%TEMP%/f13-backup/page.tsx`, and
   corroborated by `2026-09-23-2014_landing-minors` which added the 14th) carries 14. The agent's
   14→14 / 13→13 claim is **correct**; my first reading was the instrument's fault.

## Commands run and results

```
cd apps/web && npx vitest run app/page.test.tsx     -> Tests  13 passed (13)
cd apps/web && npx vitest run app/privacy/page.test.tsx -> 1 failed | 4 passed (5)
cd apps/web && npx vitest run                       -> Test Files 3 failed | 61 passed (64)
                                                       Tests 3 failed | 979 passed (982)   exit 1
npm run typecheck                                   -> exit 0 (testbot, web, ai, spec)
npm run lint                                        -> exit 0  (eslint . --max-warnings 0)
npx eslint app/page.tsx app/page.test.tsx --max-warnings 0 -> exit 0
npx prettier --check apps/web/app/page.tsx apps/web/app/page.test.tsx -> clean
curl -H 'Cache-Control: no-cache' http://127.0.0.1:3000/?cb=<ts> -> 200, 119352 B
```
Real-path readings on the served page: `(planlı)` ×14, `Planlı:` ×13 in rendered text;
`(planned)` ×0, `Planned:` ×0; `<title>Corvus - Discord botunu sade sözlerle kur</title>`;
legal CTAs resolve `href="/privacy"` → `Gizlilik Politikası`, `href="/terms"` → `Kullanım Şartları`.

## Findings

### F1 — MEDIUM — the parity guard's body is narrower than its title (guard gap)

`apps/web/app/page.test.tsx:274-281`. The guard's own comment claims *"no claim line may lose its
qualifier while keeping its promise"*, but the assertions are **count-only**
(`plannedSuffixes === 14`, `plannedPrefixes === 13`) plus one hardcoded heading string.

Mutation-tested independently (copies in a temp dir, repo untouched):

| Mutation                                                       | Caught?                                  |
| -------------------------------------------------------------- | ---------------------------------------- |
| A — drop one `(planlı)` (count 14 → 13)                         | **caught** by the count                  |
| B — **move** one `(planlı)` from claim X to unrelated claim Y   | **NOT CAUGHT** (count still 14)          |
| C — strip it from the always-on heading, add one elsewhere      | caught only by the hardcoded `toContain` |

Mutation B is exactly the failure the comment says the guard prevents, and it survives: a planned
claim can lose its qualifier while an unrelated claim silently gains one. For 13 of the 14
qualifiers only the count protects them. This is `LESSONS.md` §1's recurring pattern (*"a guard whose
body was narrower than its title"*) and §8 (*"assert the set **and** its size"*).

**Not a defect in the shipped page** — I verified by line-by-line pairing that all 14 qualifiers are
attached to their correct claims today. The gap is a future-drift hole, not a present dishonesty.
Suggested follow-up (small, test-only): assert the *set* of qualified claim keys, not the total.

### F2 — LOW — report sentence inaccurate about the working tree

`2026-09-24-0301_F13_MODIFY_landing-turkish.md` states `apps/web/app/landing.module.css` "were
**read** as context and are byte-unchanged". It is **not** byte-unchanged: it shows ` M` with
`ctaRow { align-items: flex-start; }` added (`landing.module.css:517`). Its mtime is
**2026-09-21 20:29**, i.e. pre-existing sibling work, so F13 did not touch it — the "I did not touch
it" meaning is right, the "byte-unchanged" wording is not. Documentation accuracy only; no product
impact. (`page.tsx` and `page.test.tsx` ARE byte-identical to F13's own final backup.)

### F3 — INFO — the escalated cross-suite break is real and correctly attributed

`apps/web/app/privacy/page.test.tsx:104` fails (`1 failed | 4 passed`): it renders the landing page
and expects `Privacy Policy` / `Terms of Service`. Verified `app/privacy/page.test.tsx:7` is the
**only** file outside F13's scope that imports `../page`, so this is the single legitimate consumer
and the single legitimate break. Fix is a two-string edit, outside F13's declared scope — the agent
correctly obeyed SCOPE GUARD and did **not** leave the CTAs English. Needs a follow-up task.

The other two merged-tree failures are **sibling-owned, not F13** (verified by import graph and by
where the string lives):
- `app/gallery/page.test.tsx:422` — expects `trial_bot_limit`; the text comes from
  `lib/http/refusal.ts:39` + `lib/bots.ts:60` (Turkish). `gallery/page.tsx` does not import the
  landing page.
- `app/dashboard/new/page.test.tsx:490` — expects `This reply used 1.1 credits`; that string lives in
  `apps/web/app/dashboard/new/page.tsx` (F2/sibling). Not in `page.tsx`.

### F4 — INFO — D-004 conflicts with shipped reality (needs an owner, not a reviewer)

`Docs/DECISIONS.md:118-134` still reads *"Product language is English-only (no Turkish)"* with
`Superseded by: none`, while Turkish is live on `/`, `/dashboard/new` and the persona lane. This is a
**product decision** and belongs to the founder/orchestrator — a reviewer must not amend it. F13 and
F2 both escalate it.

### F5 — INFO — F13's own open question 3 is already resolved

The report asks about `apps/web/app/layout.tsx:19` being `lang="en"`. It is now `lang="tr"` (F14's
task, `2026-09-24-0301_F14_MODIFY_layout-meta.md`), confirmed in the served HTML. No action needed;
F14's own report already records the scope caveat that `/privacy`, `/terms`, `/pryzm` are still
English routes under a `tr` declaration.

## Files Touched

- CREATED: Agent Reports/2026-09-24-0301_reviewer_REVIEW_F13.md
- (no other file created, modified or deleted; scratch dir removed)

## Dependencies Added

None.

## Assumptions Made

- Treated the agent's pre-change backup (`%TEMP%/f13-backup/page.tsx`) as the authority for the
  "14 planned / 13 Planned:" parity baseline, because F13's diff is against that tree state, not
  against `HEAD` (which is 12/13). Corroborated by the `landing-minors` report that added the 14th.
- Read the "only two files touched" claim as scoped to F13's own edits; verified via mtime and the
  agent's backups rather than via `git status`, since the tree carries unrelated uncommitted sibling
  work.

## Open Questions for Orchestrator

1. **Follow-up task needed for `apps/web/app/privacy/page.test.tsx:104,107`** — two-string edit,
   currently red. This is the only F13-caused failure on the merged tree.
2. **F1 guard gap** — decide whether to fix now (test-only, small) or carry it. The page is correct
   today either way.
3. **D-004** — needs a founder/orchestrator decision (supersede vs re-scope to "code English,
   user-facing copy Turkish"). Out of a reviewer's authority.

## Public Interface Exposed

None (review only).

## Known Limitations

- No browser interaction was driven beyond the HTTP fetch and rendered-text extraction; the FAQ
  toggle/accordion claim in the F13 report was not independently re-exercised by this review (F13
  records a trusted-click read plus a jsdom probe, and `landing-islands.tsx:266-283` reads no string
  F13 changed, so the risk is low). Layout-overflow figures were likewise taken from the report.
- The merged tree is **not** green: 3 failures remain (1 F13-caused and escalated, 2 sibling-owned).
  A green verdict here is about the F13 fix, not about the wave.
