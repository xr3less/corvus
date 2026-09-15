# Corvus Golden Eval — Round 1 (2026-09-08)

## Status: LIVE (research record — first codegen gate run)

> Companion to `corvus-model-and-pricing-2026-09-07.md` (§1 eval gate) and D-005/D-021/D-022.
> Method from two live research passes (discord.js v14.27 API verification + eval methodology), both cited inline in agent reports this day.
> Honesty note: LLM-as-judge step was WAIVED (no third model family available; contestant-judging forbidden) — taste notes below are NON-BLIND orchestrator annotations and did not decide the round (deterministic scores decide per the frozen thresholds).

---

## 1. Round config (frozen)

- Tasks: 6 golden discord.js v14 tasks (T1 scaffold / T2 ping / T3 warn / T4 pages / T5 welcome / T6 xp), prompts frozen v2 (sha256 in Temp evidence `tasks/README.md`; v2 adds the module.exports contract that v1 forgot).
- System prompt: frozen `tasks/system.md` (concise, no prose outside one fenced js block).
- Generation: temperature 0. Round 1a: max_tokens 4000 both lanes. Round 1b (deepseek T3/T4/T6 only): max_tokens 6000 + `reasoning_effort: low` (contract-verified: `GET /v1/models/deepseek/v4-flash` lists `reasoning_effort` + `reasoning_enabled` in generation_controls, 2026-09-08).
- Models: builder lane `deepseek/v4-flash`, chat lane `xai/grok-4-1-fast`, both via `https://llm.wiro.ai/v1/chat/completions` (`Authorization: Bearer KEY:SECRET`, browser-like User-Agent — bare Python-urllib gets Cloudflare 1010).
- Metric: single-shot pass@1 (identical frozen prompt, first generation scores; no repair loop — repair is a separate future eval).
- Cost meter: provider-reported `usage.cost` only. Spend: 15 runs total (12 scored + 3 superseded 1a empties) = **$0.0419** ($170 balance).

## 2. Results (deterministic harness, 6/6 tasks CERTIFIED)

Harness: zero-dep Node (`node --check` + exact-token asserts + mock runtime), mutation-proven (reference all-GREEN + 24 broken variants RED on intended checks + empty→UNKNOWN), re-proven after two fix rounds. Evidence: Temp `eval-0908/` (harness/proof.log+proof.json, candidates/, responses/, run-summary.json).

| Task | deepseek/v4-flash (1b config) | grok-4-1-fast |
|---|---|---|
| T1 scaffold | PASS ($0.00046, 10.5s) | PASS ($0.00080, 8.7s) |
| T2 ping | FAIL — genuine bare-identifier `clientReady` ReferenceError + registration shape (API-3, RUN UNKNOWN) ($0.00339, 25.7s) | PASS ($0.00128, 10.4s) |
| T3 warn | FAIL — RUN-3 only: handler performs no moderating action (`console.log`), 50013-resilience unproven ($0.00253, 36.0s) | FAIL — RUN-3 only: try wraps defer+edit (never rejects), no permLike content ($0.00226, 11.6s) |
| T4 pages | FAIL — ignores explicit `deferUpdate` instruction (API-1 + RUN-1/2) ($0.00448, 54.9s) | PASS ($0.00239, 20.8s) |
| T5 welcome | FAIL — RUN-3: no channel-partial fetch ($0.00237, 32.3s) | FAIL — RUN-3 (same partial gap) + EDGE double-send on 50013 ($0.00148, 20.3s) |
| T6 xp | PASS ($0.00212, 31.2s) | PASS ($0.00173, 75.1s — latency outlier, single sample) |

Score: **deepseek 2/6 (33%) — FAIL. grok 4/6 (67%) — CONDITIONAL** (thresholds: ≥5/6 PASS, 3–4/6 CONDITIONAL, ≤2/6 FAIL).

## 3. Taste notes (NON-BLIND, annotation only)

- SHIP: deepseek/T1, grok/T1, deepseek/T6, grok/T6.
- SHIP-WITH-NOTES: grok/T2 (odd but valid `client.emit` indirection), grok/T4 (follows prompt exactly incl. deferUpdate — but uses deprecated `fetchReply: true`, should be `withResponse`; HARNESS HOLE, see §5).

## 4. Instrument findings (the round's real yield)

1. **Thinking-bloat recurrence (D-021 lesson, again):** round-1a deepseek T3/T4/T6 returned EMPTY (reasoning filled all 4000 tokens, chars=0). Scored UNKNOWN per rubric canary rule (never FAIL), config fixed via contract-verified `reasoning_effort: low` + 6000 cap, re-ran only the 3 affected tasks with round-1a artifacts preserved (`round1a-*`). Rule stands: builder calls always set reasoning_effort low + cap ≥6000.
2. **Three mock-fidelity bugs found by triage, all fixed + re-proven:** (a) mocks narrower than production (missing `isChatInputCommand`, `memberPermissions`, `client.emit`, `update/editReply`, `channels.cache`, non-null `client.user`, `User.toString→<@id>`); (b) refusal regex rejected valid plain-language refusal ('outranks'); (c) defer+edit counted as two messages (production: one visible). T6 check passed a seed NUMBER as rng — fixed to pass a function.
3. **Adversarial check passed:** round-2 agent refuted an orchestrator prediction (grok/T3-RUN-3 stays RED, genuinely) — recorded as evidence the fix process was not teaching to the test.

## 5. Open holes (do NOT gate silently — listed for round 2)

- H1: `fetchReply: true` (deprecated) not in banned tokens — grok/T4 passes with it. Add to API-2 everywhere + re-prove.
- H2: T6 prompt "deterministic-injectable" ambiguous (function vs value) — check now accepts both. Freeze ONE contract in round-2 prompts.
- M1: Sonnet baseline still missing (no Anthropic key) — gate compared vs references, not vs Sonnet as D-005 envisioned.
- M2: grok T6 75s single-sample latency outlier — watch in round 2 (async builder tolerates ≤60s; beyond is fallback territory).
- M3: K1 needs median over 30 builds; this round is n=6/lane.

## 6. K1 early-signal (NOT a determination)

- deepseek median: **$0.00245/run** (n=6, range $0.00046–$0.00448) — ~204x under the $0.50 bar.
- grok median: **$0.00161/run** (n=6, range $0.00080–$0.00239) — ~311x under.
- Wall medians: deepseek 31.8s, grok 16.0s (async-tolerable).
- Verbatim: **early signal only — NOT a K1 determination (needs median over 30 builds).**

## 7. Verdict + routing impact (recorded as D-023)

- Builder lane stays UNROUTED for bulk traffic: deepseek 2/6 FAILs the gate (including a ReferenceError and an ignored explicit instruction — not harness noise).
- Chat lane unaffected (its job is persona/chat, a separate future eval); grok 4/6 reads as decent fallback-suitability, not a builder decision.
- No bulk routing change until a PASS round. Options go to the founder in D-023.

Evidence root (pre-approved temp, NOT the repo): `C:\Users\xr3less\AppData\Local\Temp\opencode\eval-0908\` (tasks/v2 frozen + README hashes, harness + proof.log/json, candidates/12, responses/ incl. round1a-*, run-summary.json with ids/costs, score-verify12.txt). Instruments (`eval-run.py`, `eval-rerun.py`, `eval-contract.py`) kept beside it. No secrets in any file (env-only auth, cleared after runs).
