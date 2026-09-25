# Reviewer Report: review-F16 (detection fix)

## Status
**PASS** — the F1 false-positive class from the prior review is fixed on the merged
tree, all gates reproduce, and every cited file:line checks out. Two non-blocking
observations below (one residual edge, one report inaccuracy). D-004 remains a
founder decision and is NOT closed by this review.

- Reviewer: independent (`review-F16`), did not write the code.
- Tree: merged working tree, `master` @ `d9cf8d7`, reviewed 2026-09-24 ~03:00.
- Artifacts under review: `apps/web/lib/demo/brain.ts`,
  `apps/web/lib/demo/brain.test.ts`, build report
  `Agent Reports/2026-09-24-0242_f16detect_FIX_demo-detection.md`.
- No edits made by this reviewer. No git restore/commit/push/deploy/migrate/secrets.
  Probes ran on temp copies outside the repo (deleted afterwards); stray `apps/web/C`
  file created by an earlier vitest `--outputFile` path quirk was removed.

## Independent Verification (commands + results, all re-run by me)

| Gate | Command (cwd `apps/web`) | Result |
|---|---|---|
| Focused tests | `npx vitest run lib/demo/brain.test.ts app/api/demo/message/message.test.ts app/demo/page.test.tsx` | **59/59 pass** (brain 39, route 14, page 6) — matches build report |
| Brain only | `npx vitest run lib/demo/brain.test.ts` | 39/39 pass |
| Lint | `npx eslint lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` | exit 0 (log captured, true exit code, not piped) |
| Format | `npx prettier --check lib/demo/brain.ts lib/demo/brain.test.ts` | exit 0, "All matched files use Prettier code style!" |
| Typecheck | `npx tsc --noEmit` (exit code captured to file) | exit **1**, but **0 errors mention `lib/demo`**; the only 3 errors are other waves' files (see Findings O1) |

Real-path-equivalent probe (my own instrument, `npx tsx`, temp copy outside repo,
source never touched): 17 negatives + 8 positives through the real `scriptedBrain.reply()`:

- Prior-review F1 cases now all English: `über templates` → EN template reply,
  `Zürich trials cost` → EN pricing reply, `Motörhead templates` → EN template reply.
- All bare words English: `var`, `const vs var`, `what does var do`, `ne`,
  `ne plus ultra`, `mi casa`, `mu`, `mu meson`, `kac` → EN fallback.
- Extra negatives I added beyond the brief: `café pricing`, `naïve templates`,
  `my résumé templates`, `schön grüße und mehr` → English. One exception: `façade cost`
  → Turkish pricing (Finding O2).
- Turkish positives all Turkish: `fiyat nedir`, `hangi şablonlar var`, `ışık açık`,
  `hangi bot var`, `sablon var mi`, `ücret ne kadar` → Turkish. `örnek bir şey` →
  Turkish via `ş` (Finding O3 — report text misdescribes this; behavior is correct).

## Findings

- **O1 (non-blocking, wave-level): tree `tsc` is red on other waves' files.** My run shows
  exactly 3 errors: `app/dashboard/bots/[id]/page.tsx(27,10)` (no exported member
  `stitchBrief` in `@/lib/chat/thread`) and `lib/chat/thread.test.ts(5,3)/(12,3)`
  (`BRIEF_MAX_CHARS`, `stitchBrief`). Zero errors in `lib/demo`. The build report's
  error list named `lib/verdict/bounds` + `stitchBrief` across `verdict/*`,
  `dashboard/new/*`, `thread*` — my run shows `lib/verdict/bounds.ts` exists and no
  verdict errors remain, i.e. the tree moved between runs (concurrent writers, as the
  build report also observed). Needs an owner before wave close; not fixable in F16 scope.
- **O2 (non-blocking, residual edge): `ç` alone still flips French loanwords.** `façade cost`
  → Turkish pricing because `ç` is in the detection class. Same class covers `garçon`,
  `soupçon`. This is inherent to the prescribed fix direction (the prior review explicitly
  recommended keeping `ç`), English `ç` words are rare in a Discord-bot demo, and no briefed
  case regresses. Recommended follow-up, not a FAIL: either require a second signal when
  the *only* evidence is `ç`, or record the trade-off in Known Limitations. I did not change it.
- **O3 (non-blocking, report inaccuracy): the `örnek bir şey` assumption is misstated.**
  The build report claims it "now correctly replies English" with ö as the sole signal.
  In fact it replies **Turkish**, via `ş` in `şey` hitting Rule 1 — which is the *correct*
  behavior (`örnek bir şey` is genuinely Turkish). No test asserts the claimed English
  outcome (the only remaining use is a language-agnostic length sample), so nothing is red;
  but the Assumption text is factually wrong and should be corrected to avoid a future
  reader "fixing" correct behavior.

## Accuracy of build report

Substantially accurate: 59/59 gates reproduce exactly, every cited mechanism
(`brain.ts:56` narrowed regex, `isTurkishQuestion` two-hit rule, untouched `toFold`,
new pins + `hangi bot var` positive + `ışık açık` control) verified by reading the files.
Two deltas: O3 above, and the tree-level tsc error list moved (O1 — concurrent tree,
not a misreport at write time). No web research was needed; correctly omitted.

## Scope / artifacts / hygiene

- `git status --porcelain -- apps/web/lib/demo apps/web/app/api/demo apps/web/app/demo`
  → exactly `M brain.ts`, `M brain.test.ts`. `route.ts` and `app/demo/page.tsx` untouched.
- No manifest/lockfile/env touched by me (only vitest/tsc/eslint/prettier reads and one
  `npx tsx` run outside the repo; no install). Note: repo-wide status shows many other
  modified files and `M package-lock.json` from concurrent waves — none in F16 scope.
- Report file on disk, content matches the summary I was given.
- `route.ts:84` (`const brain: DemoBrain = scriptedBrain`) still compiles against the
  unchanged `DemoBrain` interface; contract intact.

## Assumptions (mine)

- Exit-code capture via `> file; echo EXIT=$?` is trustworthy; the earlier `| head`
  pipeline masked codes, so final numbers come only from the file-redirect runs.
- The `ç`-loanword edge (O2) is acceptable English-demo risk; a Discord-bot visitor
  typing `façade cost` is far rarer than the German-ö/ü class this fix closes.

## Open Questions for Orchestrator

- **D-004 (product, founder-only, still open).** `Docs/DECISIONS.md` D-004
  (English-only, one-way, `Superseded by: none`) still contradicts shipped bilingual
  behavior. This fix narrows *when* Turkish fires; it does not resolve the contradiction.
  Escalate unchanged.
- Accept O2 as a documented trade-off, or brief a follow-up (ç-alone needs a second signal)?

## Public Interface Exposed

Unchanged: `DemoBrain { reply(text: string): Promise<string> }`, `scriptedBrain`.
No consumer changes needed.

## Known Limitations (carried + one addition)

- Carried: ö/ü-only Turkish with no stem and <2 word hits stays English; single
  word-list hits (`nedir`, `yok`, `hangi` alone) stay English — both by design.
- Addition from this review: single-`ç` French loanwords (`façade cost`) route Turkish
  (O2); single-`ş`-bearing inputs route Turkish even when the report calls them
  English controls (O3 — behavior correct, text wrong).
