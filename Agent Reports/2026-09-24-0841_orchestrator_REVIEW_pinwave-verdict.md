# Adjudication Verdict: pin wave 0428 (F7N3 + F7T3) + recon-verdict500 — ALL CLOSED

**Date:** 2026-09-24-0841 (local), HEAD `d9cf8d7` throughout. No commit/push/deploy/migrate/secret-touch.
**Author:** orchestrator (integration, not a builder — no production code written here).
**Scope:** adjudicate F7N3 (newpage mounted guard) + F7T3 (botdetail tighten, verify-outcome) + recon-verdict500 (root-cause), each with a fresh independent review, then re-gate the merged QUIESCED tree with the project's real commands.

## 1. Pair verdicts — ALL CLOSED

| Pair | Build | Review | Verdict |
|---|---|---|---|
| F7N3 newpage-residue | SUCCESS (`2026-09-24-0428_f7n3_FIX_newpage-residue.md`): premise CONFIRMED by measurement (sweep renders empty state, `page.tsx:471-483` thread mounts only when `messages.length > 0`) → refused bare dead entries; shared `expectNoEnglishResidue(extra)` helper + `THINKING_RESIDUE`/`PARKED_RESIDUE` swept inside mounting renders; 49/49, tsc/eslint/prettier 0; three isolation probes each red at own entry + counter-probe reproduces F12B/F12C (full English ships 49/49 green on dead design) | PASS (`2026-09-24-0428_reviewer_REVIEW_F7N3.md`): every load-bearing element independently re-derived; dead design rebuilt independently → full English 49/49 green CONFIRMED; three entries independently live (P-parked/P-thinking/P-suffix); gates reproduced 49/49 + tsc/eslint/prettier 0 | **CLOSED.** Non-blocking: (1) `:523` negative vacuous (P-negpin: stays green with both real guards neutralized — single-submit `it` always parked by then); (2) report's run-B gloss loose (red at `:522` direct pin, not the new entry — P1 covers the gap). Either drop `:523` or assert the negative on a two-turn render. Optional follow-up, one line. |
| F7T3 botdetail-tighten | SUCCESS by verification (`2026-09-24-0428_f7t3_FIX_botdetail-tighten.md`): `:1838` is a stream push not an assertion; F7T2 F1 remediation already on disk (`:1834-1837` comment + `:1846` negative / `:1847` positive); author then verified with full mutation table (A/B/C/D/E/F incl. discriminator reconstructing pre-04:39 vacuous shape → 59/59 green) | PASS with provenance correction (`2026-09-24-0428_reviewer_REVIEW_F7T3.md`): substantive claim CONFIRMED (own mutation A red at `:1847:11`, B red at `:1846:85`, discriminator D green); **the "peer edit at 04:39" was the agent's own script** (`%TEMP%\f7t3_tighten.js` mtime 04:38:56 — line-number convergence `:1847` vs `:1846`, log-header window, self-inconsistent `:1838` usage). Work correct, narrative wrong — wave record must say F7T3 closed F1 itself | **CLOSED.** F7T2 F1 RESOLVED (was "optional tightening" in 0422 verdict — now proven fixed). Provenance corrected in this record. Leftover `%TEMP%\f7t3_*` (incl. `f7t3_mut\` full copy ~GB) flagged for closeout; NOT deleted by reviewer (another agent's artifacts). |
| recon-verdict500 | SUCCESS (`2026-09-24-0428_recon-verdict500_REVIEW_verdict-500.md`, read-only, saved by orchestrator): **ROOT CAUSE FOUND.** `verdict/route.ts:530-541` judge call (and brief call `:572-574`) post a **system-only message array**; GLM backend contract: "must not consist of system messages or assistant messages only" → 400/1214; `router.ts:257-267` clientErrorSeen → one retry → `RouterError` (`:296`); bare catch `:544-551` discards error, maps to `could not judge reply` 500. Two fast wiro 4xx round trips = ~100ms signature. Chat succeeds (same lane/key/model) because `chat/route.ts:428-432` always ends with a user turn; builder worker same (`builder-runs.ts:637-649`); verdict is the repo's ONLY system-only caller → language-independent instant 500. Cited live: docs.z.ai (contract + 1214), nanobot #3082, openclaw #73688, wiro completions docs. Recipe: append short user turn at both call sites (tests read `messages[0]` only, none pin length) + log discarded RouterError + regression pin. **Flagged:** `route.ts:534-537` drops the `language` arg (defaults english) — `TURKISH_VERDICT_GUIDANCE` never reaches judge; separate latent quality issue, not the 500 | N/A (recon is read-only diagnosis; no code to review. Evidence standard: official docs + OSS reproductions + file:line mechanics, all cited) | **CLOSED as diagnosis.** Fix NOT applied (needs founder: live-key confirm + user-turn copy choice — bills per call). Blocks §6 live Turkish E2E. Scoped as follow-up. |

## 2. Merged QUIESCED re-gate — GREEN (orchestrator-run, true exit codes)

| Gate | Result |
|---|---|
| Root `npm run typecheck` (5 workspaces) | **EXIT 0** |
| Root `npm run lint` | **EXIT 0** |
| Web `npm test` | **65 files / 921 passed + 73 skipped (= 994), EXIT 0** at `RUN v5.0.0` |
| ai / spec `npm test` (tail of root run) | **158 / 56, EXIT 0** at `v3.2.7` (testbot/gateway covered by 0422 verdict at 103/464; untouched by this wave's two test-only files — both suites' files outside their trees) |
| Root vitest store repair | HOLDS (both reviewers confirm: root real dir 3.2.7, web 5.0.0, 5 legit `@corvus/*` links only) |

## 3. Standing harness additions (from this wave — fold into instrument recipe)

1. **When a mutation's stated failure line is absent from its own failure evidence, re-derive the line.** (F7T3's table cited `:1838` precisely after deleting the assertion from it — unfalsifiable citation; reviewer caught it via line-number convergence.)
2. **Pin the vitest CLI path in out-of-repo instruments** (`node ./node_modules/vitest/vitest.mjs`, assert `RUN vX` banner) — bare `npx` silently resolves the root's stale 3.2.7 instead of the workspace 5.0.0. (F7N3 author caught it; reviewer avoided via pinning. Second sighting of the wrong-major trap.)
3. **A report's authorship claim is itself a checkable artifact** (script mtimes, log headers, line arithmetic). Provenance errors propagate into the wave record if unchallenged.
4. **Never install a residue entry without proving its channel is live** — the F7N3 refusal (bare entries would be dead) plus dual counter-probes (author P4 + reviewer P-premise, both full-English-green) is now the reference example. The F12B/F12C class has its third documented near-miss.

## 4. What's next (unchanged, founder-owned)

Verdict-500 fix (live-key confirm + user-turn copy → 2 call sites + error logging + regression pin) → live Turkish end-to-end (Turkish plan → evet → builder_runs + pg-boss + no double-run); WIRO live POST with real key; commit/push of all waves (HEAD still `d9cf8d7`); A8 fresh live run; gallery build; env/port/OAuth alignment; D-004 amendment; KI-033 7-file lock; pricing-1.1; real spend test; i18n direction; `%TEMP%\f7t3_*` cleanup; PC shutdown when work fully done. **Agents must NOT touch: push/deploy/migrate/secrets.**
