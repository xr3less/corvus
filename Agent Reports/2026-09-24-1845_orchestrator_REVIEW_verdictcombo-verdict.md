# Adjudication Verdict: verdict-combo wave 1810 (500-shape + language plumbing) — CLOSED

**Date:** 2026-09-24-1845 (local), HEAD `d9cf8d7` throughout. No commit/push/deploy/migrate/secret-touch, no live POST.
**Author:** orchestrator (integration, not a builder — no production code written here).
**Scope:** adjudicate fix-verdict-combo-1810 (combined 500-shape + language-plumbing fix, founder-approved) with its fresh independent review, on the merged tree.

## 1. Pair verdict — CLOSED

| Pair | Build | Review | Verdict |
|---|---|---|---|
| verdict-combo (route.ts + route.test.ts) | SUCCESS (`2026-09-24-1810_fixverdict_FIX_verdict-combo.md`): judge call 3rd-arg language + closing user turn (`:627`/:629), brief call 2nd-arg + user turn (`:669`/:670), both catches log RouterError (`:641`/`:679`); route-local `deriveLanguage` (`:256`, founder option (a), kept-ends views `:616-617` reused for derivation AND prompt); 4 additive pins (i `:1164`, ii `:1194`, iii `:1228`, iv `:1248`); English byte-identity by hash (`2176621d…931dc`, 453 chars); mutations A/B/C/D all behave; `packages/ai` untouched; full web 65 files 925+73 green | PASS (`2026-09-24-1830_reviewer_REVIEW_verdictcombo.md`): every claim re-derived with own instruments — focused 41/41 `RUN v5.0.0`, full suite 65 files 925+73 (4 independent runs), tsc/eslint/prettier EXIT 0, diff 137-added/0-removed proven by own diff, route 5 hunks region-exact, byte-identity hash independently reproduced, mutations A/B + own rows D (misfire interlock) and E (old-route + new-suite → exactly 3 new pins red, 37 pre-existing green) all as claimed | **CLOSED.** Non-blocking carried: (1) parallel-worker abort class `3221226505` NOT reproduced in 4 further full runs (3 parallel + 1 serialized) + import-graph independence proven — harness-level flake task, not a verdict defect; (2) half-false wording measured (Turkish plan + English reply gets "plan and reply are Turkish") — copy founder-locked, untouched by design; (3) `packages/ai` phrasing note — "unmodified" true of this task by mtime, `git diff` vs HEAD non-empty from earlier KI waves (correct instrument = mtime, stated plainly); (4) `persona-prompt.test.ts` still zero `'turkish'` coverage — approved separate follow-up. |

## 2. Merged-tree gate — GREEN (reviewer-run ×4, orchestrator-adjudicated)

| Gate | Result |
|---|---|
| Focused `route.test.ts` | **41/41, EXIT 0** at `RUN v5.0.0` (37 pre-existing + 4 new; row E proves bidirectional attribution) |
| Full `apps/web` suite | **65 files / 925 passed + 73 skipped (998), EXIT 0** — 4 independent reviewer runs (3 parallel + 1 serialized ~106s vs ~23s) |
| `tsc --noEmit` (TS 5.9.3) | **EXIT 0**, zero bytes; `--listFiles` covers both touched files |
| ESLint 9.39.5 both files | **EXIT 0**, JSON `messages=[] suppressedMessages=[]` |
| Prettier 3.9.6 both files | clean, **EXIT 0** |
| `packages/ai` | zero bytes changed in task window (mtime; newest source 00:56:26, pre-wave) |

## 3. Standing harness additions (from this wave)

1. **Row E (old-bytes + new-suite) is the bidirectional close of any guard-pin claim** — new pins red on old code + all old assertions green on new code proves the pins measure the change and nothing else. Require it for future pin waves.
2. **"Unmodified" on a shared uncommitted tree must be measured by mtime window, never by `git diff` vs HEAD** — diff conflates earlier waves; mtime isolates the task. State the instrument when claiming it.
3. **Never add a `messages.length` pin on a shape fix** — pin roles/needles and call/job counts instead; length pins are the brittle failure mode of exactly the change being made (reviewer §Code-quality confirms absence here).
4. **Test-needle independence:** re-declare guidance needles in the test file (not imported) so package-side copy drift fails the suite — same second-copy idiom as the refusal-sentence pins.

## 4. What's next (founder-owned where marked)

Live Turkish end-to-end (§6: Turkish plan → evet → builder_runs + pg-boss + no double-run) with **real key in founder's hands** — orchestrator-only + founder watching; then commit/push of all waves (HEAD still `d9cf8d7`); A8 fresh live run; gallery build; half-false copy call (one line in `persona-prompt.ts:61` if wanted); `persona-prompt.test.ts` turkish-coverage follow-up; parallel-worker flake task (`pool: 'vmThreads'` / memory headroom); `%TEMP%\f7t3_*` + `%TEMP%\f523-instrument` + `%TEMP%\fvc_*` cleanup decision; `:523` + thread-census recons still running at adjudication time (do NOT treat this verdict as covering them). **Agents must NOT touch: push/deploy/migrate/secrets/live keys.**
