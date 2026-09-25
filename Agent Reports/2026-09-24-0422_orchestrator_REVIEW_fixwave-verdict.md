# Adjudication Verdict: fix-fail-followups wave (wf_8036c468-a5c) + pins — ALL CLOSED

**Date:** 2026-09-24-0422 (local), HEAD `d9cf8d7` throughout. No commit/push/deploy/migrate/secret-touch.
**Author:** orchestrator (integration, not a builder — no production code written here).
**Scope:** adjudicate all 9 build/review pairs from journal `wf_8036c468-a5c` + follow-ups
(F7N2/F7T2, F15T, F12C), then re-gate the merged QUIESCED tree with the project's real commands.

## 1. Journal completeness — VERIFIED

`journal.jsonl`: **37 lines = 1 launched + 18 started + 18 results, 0 errors.**
All 18 labels present exactly once: build-F9D/F7N/F7T/F12/F10/F13/F14/F15/F16 (9)
+ review-F9D/F7N/F7T/F12/F10/F13/F14/F15/F16 (9). Result events carry no label;
mapping below is via agentId→start-meta, and every pair cross-checked against the
report file on disk (26 fix-wave/pin files present, all read).

## 2. Pair verdicts — ALL CLOSED

| Pair | Build | Review | Verdict |
|---|---|---|---|
| F9D docker-copy | SUCCESS (Dockerfile:50 one-line COPY proxy.ts, 14/14) | PASS | **CLOSED** |
| F7N newpage-pin | PARTIAL — :490 pin correct, :470 out-of-scope `Thinking` left red **correctly** per scope guard | PASS (48/1 correctly escalated) | **CLOSED → F7N2** |
| F7T thinking-turkish | SUCCESS (thinking-trace.tsx:79/84, 11/11, mutation 5-fail) | PASS (11/11 + 49/49 + 59/59) | **CLOSED** |
| F12 botslist-guard | SUCCESS (inline — harness no-report-file rule; residue + direct assert, 25/25) | initial PASS, then **FAIL (F12B)** — dead `['search placeholder','Search bots...']` entry, attribute invisible to textContent sweep, English ships 25/25 green | **FAIL → F12C, CLOSED** |
| F10 rail-guard | SUCCESS (ENGLISH_RESIDUE 11th + in-flight test :181-193, 26/26, mutation 1/10) | PASS | **CLOSED** |
| F13 privacy-parity | SUCCESS (set-attached guard + CTA retarget, 18/18; disclosed `git checkout --` breach fully recovered via backup+cmp) | PASS | **CLOSED** |
| F14 layout-guard | SUCCESS (CREATED layout.test.tsx, 6/6; layout md5 unchanged) | PASS | **CLOSED** |
| F15 refusal-unify | PARTIAL **expected** (3 readers unified; 2 busy tests fail by design, same class) | PASS (16/2 by design) | **CLOSED → F15T** |
| F16 demo-detection | SUCCESS (brain.ts:56 narrowed `[çğışÇĞİŞ]` + ≥2-hit rule, 59/59 + 8/8 live POST probe) | PASS | **CLOSED** |

**Journal anomaly adjudicated, not a defect:** build-F10's inline journal result is the
truncated string `{"review":"flagged"}` (pipeline return cut, no label on result events).
The disk artifacts are authoritative and complete — `2026-09-24-0242_f10railpin_FIX_rail-guard.md`
(SUCCESS, full evidence) + `2026-09-24-0242_reviewer_REVIEW_F10.md` (PASS, independently
re-derived). Verdict: PASS. Lesson: trust artifacts, not summaries.

## 3. Follow-ups — ALL CLOSED

- **F7N2** (`0252_f7n2` SUCCESS) + review `0300_REVIEW_F7N2` PASS — new/page.test.tsx:470
  → `Düşünüyor`, 49/49, mutation 1/48, byte-exact. **CLOSED.** (Non-blocking: page-level
  ENGLISH_RESIDUE lacks Thinking/Thought — sibling chat-thread guard covers the class;
  optional one-liner.)
- **F7T2** (`0252_f7t2` SUCCESS) + review `0300_REVIEW_F7T2` PASS — 4 matchers → `Düşünüyor`,
  59/59, reversal md5 proof. **CLOSED.** (F1: :1838 still vacuous — done-label covered by
  F7 suites; optional tightening only.)
- **F15T** (`0305_f15thread` SUCCESS) + review `0305_REVIEW_F15T` PASS — 2 busy blocks →
  generic literal byte-identical to refusal.ts:65, 18/18, 4/4 payloads load-bearing. **CLOSED.**
- **F12C** (`0312_f12placeholder` PARTIAL: deliverable complete + env escalation) + review
  `0312_REVIEW_F12C` PASS (fix + repair) — dead entry removed, `getByPlaceholderText('Botlarda ara…')`
  :172, U+2026 bytes `226 128 166`, 25/25, class table 7/1/6/2/2/1 reproduced. Node_modules
  junction damage **repaired and verified** (root vitest real dir 3.2.7, all `@vitest/*` +
  nested deps at locked versions, zero leftover junctions except 5 legit `@corvus/*` links).
  **CLOSED.** (Report-accuracy note: spec 112/ai 316 counts were a 2× stale-`dist/` double-count;
  true declared-config figures 56/158 — confirmed by this verdict's own re-gate below.)

## 4. Merged QUIESCED re-gate — GREEN (orchestrator-run, true exit codes)

| Gate | Result |
|---|---|
| Root `npm run typecheck` (5 workspaces) | **EXIT 0** |
| Root `npm run lint` | **EXIT 0** |
| Web `npm run format` | EXIT 1 on **6 peer/untracked files only** (`.vitest/json/output.json`, go-live + token routes, token page, gallery pages — mtimes 09-23/09-24, none wave-owned). **Wave-owned 19 files EXIT 0** from `apps/web` cwd. (Root-cwd prettier flags thinking-trace.tsx:46 wrap — config-resolution artifact; the workspace's own `npm run format` does not flag it. Workspace cwd is authoritative.) |
| Web `npm test` | **65 files / 994 passed, EXIT 0** |
| testbot / ai / spec / gateway `npm test` | **103 / 158 / 56 / 464, all EXIT 0, all at declared vitest majors** (web 5.0.0, rest 3.2.7) |
| Root vitest store repair | HOLDS — real dir 3.2.7, `@vitest/*` ×6 present |

Not wave dirt, not chased as regression: the 6 format warns need owner + commit-hygiene
decision (founder), same as `.vitest/output.json` gitignore and the `apps/testbot` untracked
workspace carrying a lockfile stanza.

## 5. Standing harness rules (from this wave — fold into instrument recipe)

1. **Never delete through a junction ancestry** (`rm -rf`/`rmSync` on any path with a
   junction above it follows into the target). Temp instruments: full copy via robocopy,
   assert zero reparse points before use, guarded delete that aborts on any internal link.
2. **spec/ai suite counts: report declared-config figures** (vitest excludes `dist/` by
   default; clearing it double-counts stale compiled copies 2× toward reassurance).
   Always cite runner banner file/test counts + declared major alongside.
3. **Prettier: workspace cwd is authoritative** for workspace files (config resolution
   differs root-vs-app); run the project's real command from its own cwd.
4. **Result events without labels**: map agentId→start-meta; when inline results truncate,
   disk artifacts rule.

## 6. What's next (unchanged, founder-owned)

Live Turkish end-to-end (verdict-lane 500 owner → Turkish plan → evet → builder_runs +
pg-boss + no double-run); WIRO live POST with real key; commit/push of all waves
(HEAD still `d9cf8d7`); A8 fresh live run; gallery build; env/port/OAuth alignment;
D-004 amendment; KI-033 7-file lock; pricing-1.1; real spend test; i18n direction;
PC shutdown when work fully done. **Agents must NOT touch: push/deploy/migrate/secrets.**
