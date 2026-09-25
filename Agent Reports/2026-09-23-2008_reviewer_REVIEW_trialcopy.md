# Task Report: reviewer-trialcopy

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2008_reviewer_REVIEW_trialcopy.md

## Dependencies Added
- None.

## Assumptions Made
- Verified everything from disk only (source files, installed packages, `apps/web/package.json` scripts). No web research was needed — the task depends on no external current fact, and the builder's report was read as a claim to be tested, not as evidence.
- I re-ran the builder's three gates plus the full web suite. Running the full suite was an extra check beyond the acceptance criteria (which required me to *state* whether I ran it); I did run it, so its real result is reported below.
- The acceptance criteria named the report timestamp `2008`; I used that exact filename per the declared scope even though the wall clock at write time was later. No other filename was created.
- "Non-trial copy" for `page.tsx:731` was adjudicated by reading its surrounding element (its sibling list items and the pricing card that contains it) and by checking whether any enforced gate contradicts it — not by accepting the builder's reasoning.

## Open Questions for Orchestrator
- **Low / honesty, at a line this wave edited:** `apps/web/app/terms/page.tsx:44` now reads "…limited to one bot and 100 AI credits with no card required, **is planned**." while the *same page* at `:89` reads "**Trial (live):** 3 days of Pro features, limited…", and the homepage test asserts "the trial is enforced now" (`apps/web/app/page.test.tsx:44`). The builder's report calls this "planned status kept accurate". It is preserved verbatim from HEAD (HEAD `:44` also said "is planned"), so it is **not a regression from this wave** — but the wave rewrote that exact sentence and left one page simultaneously claiming the trial is live (`:89`) and planned (`:44`). Recommend a follow-up one-line alignment (drop "is planned" from `:44` or scope it to billing). Not blocking: the wave's declared objective (the over-reading limits class) is closed, and the conflict is pre-existing.
- **Low / guard strength, informational:** the new negative guards are case-sensitive and narrower than a reader might assume. `pryzm/page.test.tsx:248` (`not.toContain('full Pro')`) would NOT have caught the old *blurb* `'Full Pro, free for 3 days.'` (capital `Full Pro`); `terms/page.test.tsx:64` (`not.toContain('full access')`) would NOT have caught the old `Trial (live):` line (it said `full Pro access`). Both old strings are nevertheless covered by the *positive* pins in the same blocks (`pryzm:257` `toContain('Pro features for 3 days')`; `terms:61` `toContain('3 days of Pro features, limited to one bot and 100 AI credits')`), which do fail on the old copy — I verified this by string-matching the HEAD text, not by editing any file. No action required; noted so a future sweep does not mistake the negative guards for full-class protection.
- **Environment observation (not this wave's defect):** three files outside the claimed 6 were modified inside/near the same clock window — `apps/web/app/page.tsx` (18:01:03), `apps/web/app/dashboard/page.tsx` (18:00:55), `apps/web/app/dashboard/page.test.tsx` (20:10:28). Their diffs carry unrelated work (nav links, template names, footer spans, dashboard suites) and grep for the trial-copy class over those diffs returns **zero** trial-copy lines; `page.tsx:731` is byte-identical to HEAD. So mtime alone does not corroborate the 6-file scope — the **diff content** does (copy + test pins only, verified line by line). Flagging because concurrent waves in one tree are exactly how an unclaimed edit slips through a review.

## Public Interface Exposed
- No exported type, function, route, or data shape changed. Diff over the 6 files is 20 insertions / 11 deletions, every line either user-facing copy or a test expectation string. No imports, no logic, no config, no JSX structure changed.

## Known Limitations
- No real-path browser render. I did not start a dev server, so verification of the *rendered* copy rests on the same rendered-`textContent` component assertions the builder used, plus direct source reads and grep — consistent with a copy-only wave, but it is not a human-in-the-browser confirmation. Per `~/.claude/LESSONS.md` §2.4, "done" for a copy change would ideally include a real render; for this wave I am reporting it as not performed rather than implying it.
- The full web suite I ran covers the workspace, not the other workspaces (gateway, packages) — I did not run those, and the wave touches `apps/web` only.
- `apps/web/app/pryzm/page.tsx` is a parked route that 404s in production (`page.tsx:275-278`), so two of the four fixed sites are dev/portfolio-visible only. Severity of any residual pryzm copy issue is correspondingly lower than the terms/brain sites, which are production-visible.

## Verification

Ground truth: HEAD = `d9cf8d7`. Toolchain detected from `apps/web/package.json` (npm workspaces; `typecheck` = `tsc --noEmit`, `lint` = `eslint .`, `format` = `prettier --check`, `test` = `vitest run`). No script name was assumed; no package manager was assumed.

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Trial-copy class closed — terms | grep `full Pro\|full access\|Full Pro` (case-insensitive) `apps/web/app/terms/page.tsx` | **0 matches** (PASS) |
| 2 | Trial-copy class closed — pryzm | same pattern, `apps/web/app/pryzm/page.tsx` | **0 matches** (PASS) |
| 3 | Trial-copy class closed — brain | same pattern, `apps/web/lib/demo/brain.ts` | **0 matches** (PASS) |
| 4 | Limited wording present (terms) | read `terms/page.tsx` | `:44` "3-day trial of Pro features, limited to one bot and 100 AI credits"; `:89` "Trial (live): 3 days of Pro features, limited to one bot and 100 AI credits" |
| 5 | Limited wording present (pryzm) | read `pryzm/page.tsx` | `:230` "Pro features for 3 days — 1 bot, 100 credits."; `:923` "Start with 3 days of Pro features — 1 bot and 100 credits, no card required."; limits list `:235` `1 bot for 1 server`, `:236` `100 credits to spend on builds` intact |
| 6 | Limited wording present (brain) | read `brain.ts` | `:9-10` `PRICING_REPLY = 'Pro is $10/mo, Studio $29/mo. Trials run 3 days, 1 bot, 100 credits, no card'` (76 chars, ≤280 gate) |
| 7 | Out-of-scope claim adjudicated | read `page.tsx:715-744`; `git show HEAD:apps/web/app/page.tsx` | **Builder was right.** Line 731 reads `Planned: full access to all 8 starter templates`. It sits in the **Starter ($0) card** (`priceCard` opens `:703`, `priceName` "Starter" `:706`; next card opens `:749`) among sibling items all labeled `Planned:` (`:719`, `:723`, `:727`, `:731`) and describes **template-gallery** access, not the trial. Byte-identical to HEAD (HEAD `:728`, same text); not pinned by any test. The templates API has no tier gate (`app/api/templates/route.ts`, `[slug]/route.ts` — only the fork route gates), so nothing enforced contradicts it. Correctly left and correctly escalated, not silently expanded. |
| 8 | Typecheck (@corvus/web) | `npm run typecheck --workspace @corvus/web` | **exit 0**, zero errors |
| 9 | ESLint, 6 touched files | `npx eslint app/terms/page.tsx app/terms/page.test.tsx app/pryzm/page.tsx app/pryzm/page.test.tsx lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` (cwd `apps/web`) | **exit 0**, zero warnings, zero output |
| 10 | Prettier, same 6 files | `npx prettier --check <same 6>` | **exit 0**, "All matched files use Prettier code style!" |
| 11 | Touched-area suites | `npx vitest run app/terms/page.test.tsx app/pryzm/page.test.tsx lib/demo/brain.test.ts` | **exit 0 — 3 files / 40 tests passed** |
| 12 | Per-suite counts (matches builder's claim) | each suite run separately | terms **4/4**, brain **15/15**, pryzm **21/21** — 40 total, **builder's 40/40 claim confirmed exactly** |
| 13 | Full web suite (extra; I ran it) | `npx vitest run` (cwd `apps/web`) | **exit 0 — 62 files / 886 tests passed.** Note: the builder's report cited a sibling's "885/885" and honestly declared the full suite not re-run; the real current number is **886**, not 885 — the builder never claimed a full-suite result, so this is a correction to the cited number, not a contradiction of the report. |
| 14 | Copy-only / no logic (diff audit) | `git diff --numstat` + full `git diff` over the 6 files | 20 insertions / 11 deletions; `pryzm/page.test.tsx` 3/1, `pryzm/page.tsx` 2/2, `terms/page.test.tsx` 6/1, `terms/page.tsx` 5/5, `brain.test.ts` 2/1, `brain.ts` 2/1. Every added line is a copy string or a test expectation; three added lines contain only JSX/text or the `const PRICING_REPLY =` wrap. No imports, no logic, no config, no JSX structure. |
| 15 | Security — no secrets introduced | grep added lines for `api[_-]?key\|secret\|token\|password\|bearer\|sk-\|ghp_\|AKIA\|BEGIN … PRIVATE KEY\|https?://…@` | **0 matches** (PASS) |
| 16 | No manifest / lockfile / env touched by this wave | `git status --porcelain` on manifests+env, + mtimes | `.env.example` mtime **2026-09-21 19:36**, `package-lock.json` mtime **2026-09-20 11:09** — both predate this wave's window (~17:56–18:01). No install run. (Both are dirty from earlier waves, unrelated.) |
| 17 | Negative guards actually fire (extra) | string-match of HEAD copy vs guard needles in Node | `not.toContain('full access')` fires on old short bullet **true**, on old `Trial (live)` line **false**; `not.toContain('full Pro')` fires on old lead **true**, on old blurb `'Full Pro, free for 3 days.'` **false** (case-sensitive needle). New copy trips neither guard. Both old strings remain covered by the positive pins — see Open Questions. |
| 18 | Adjacent pryzm survivors defensible | read `pryzm/page.tsx:234-239` + gate search | `Every Pro feature unlocked` (`:237`) left intact: no feature is tier-gated on disk (only mint/credit/trial gates exist: `lib/bots.ts:83-124`, `api/chat/route.ts:94-110`, `api/builder/*`), and the same card states `1 bot for 1 server` / `100 credits`. Defensible. |
| 19 | Wave stayed inside scope | `git status` full tree + `find -newermt` | Only the 6 claimed files carry this wave's copy+pin diff. Three sibling files changed in the window with unrelated work (see Open Questions). No source, config, manifest, or env file outside the 6 was altered by this wave. |

**Adversarial checks attempted (per `LESSONS.md` §1 — validate the instrument):**
- The grep instrument: I ran the class pattern case-insensitively (`-i`) across the whole `apps/web` tree, not just the three named files, all extensions — the only remaining hits are the two *test* guards themselves and `page.tsx:731`, which the case-sensitivity of the narrow grep could otherwise have hidden (the builder's report pattern was case-sensitive; mine is broader and still finds nothing in the three files).
- The test instrument: I confirmed the 40/40 is real by running each suite separately (4/15/21) rather than trusting an aggregate line.
- The diff instrument: I read the full diff, not `--stat`, because "20 insertions" would also be consistent with a logic change.
- I did **not** run any `git restore/stash/checkout/reset`, did not stage/commit/push, did not contact production, and did not modify any file other than this report.
