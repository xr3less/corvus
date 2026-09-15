# Corvus Golden Eval — Round 2 (2026-09-08)

## Status: LIVE (research record — second gate run; read round-1 file first)

> Same exam, same frozen questions (T1–T5 byte-identical v2; T6 one-sentence v3 clarification only) — no teaching to the test.
> Config locked for both lanes: temperature 0, max_tokens 6000; deepseek + `reasoning_effort: low` (round-1 finding, contract-verified).
> Harness fixes H1 (deprecated `fetchReply` banned; T4 reference migrated to `withResponse`) + H2 (T6 rng contract frozen to function-style; reference rewritten; check passes a function). Full re-proof before scoring.
> Taste notes NON-BLIND again (no third model family) — annotation only.

## 1. Results (12 runs, 12/12 HTTP 200, $0.0211)

| Task | deepseek/v4-flash | grok-4-1-fast |
|---|---|---|
| T1 scaffold | PASS ($0.00041, 77.5s outlier) | PASS ($0.00079, 7.9s) |
| T2 ping | FAIL — EDGE only: replies Pong! to unknown command (ReferenceError GONE, big improvement) ($0.00211, 19.6s) | PASS ($0.00078, 17.9s) |
| T3 warn | FAIL — RUN-3 only: no moderating action, 50013-resilience unproven ($0.00325, 31.3s) | FAIL — RUN-1/2/3+EDGE (regressed vs R1) ($0.00170, 14.2s) |
| T4 pages | FAIL — API-1 (no deferUpdate) + RUN-1/2 ($0.00346, 53.3s) | Harness UNKNOWN (no collector intercepted) → ORCHESTRATOR-ADJUDICATED FAIL: `interaction.reply()` without `withResponse` resolves to void in production, so `.createMessageComponentCollector` crashes — genuine production bug the check under-reports ($0.00200, 10.0s) |
| T5 welcome | FAIL — RUN-3: no channel-partial fetch ($0.00094, 33.8s) | FAIL — RUN-3: same partial gap ($0.00148, 11.9s) |
| T6 xp | PASS ($0.00243, 41.0s) | PASS* ($0.00175, 52.2s) — *SHIP-WITH-NOTES: `handleMessageCreate(message, {})` passes a FRESH store per message, XP never persists; no frozen check covers cross-call persistence (round-3 hole, filed) |

Score: **deepseek 2/6 (33%) — FAIL. grok 3/6 (50%) — CONDITIONAL** (3/5 = 60% on frozen rules with T4 excluded; adjudicated 3/6 = 50% — CONDITIONAL either way).

## 2. Stability across rounds (the honest table)

| Lane | R1 | R2 | Stable reads |
|---|---|---|---|
| deepseek | 2/6 FAIL | 2/6 FAIL | T1+T6 pass twice; T5 partial-gap fails twice; T2 improving (crash → single EDGE nit); T4 instruction-following fails twice |
| grok | 4/6 COND | 3/6 COND | T1+T2+T6 pass twice (T6-R2 with notes); T5 partial-gap fails twice; T3/T4 swing (variance, n=1 per cell) |

Systematic model weakness (both lanes, both rounds): **channel-partial fetch on T5** — recorded as builder-system-prompt improvement material (product prompt work, NOT test tuning).

## 3. Instrument meta-lesson (fix the class)

Round 2 needed a THIRD mock surgery (`inGuild`) plus an adjudication outside frozen rules (T4 UNKNOWN→FAIL). Pattern: mock-based scoring of generated API code converges on testing the mock — each round's new outputs use real APIs the mocks lack. Prescription for round 3 (if any): a mechanical **stub-coverage probe BEFORE scoring** (extract `X.y()` accesses from candidates via AST, assert each exists on the stub, fix-or-exclude before verdicts) + the two filed holes (T6 cross-call persistence check; unhandled-rejection→FAIL). Stop hand-triaging after every round.

## 4. K1 cumulative (still NOT a determination)

- deepseek median over R1+R2 scored runs: **$0.00240** (n=12, range $0.00041–$0.00448) — ~208x under $0.50.
- grok median: **$0.00159** (n=12, range $0.00078–$0.00239) — ~314x under.
- Wall medians R2: deepseek 37.4s (T1 77.5s outlier), grok 13.1s. Async-tolerable; outliers watched.
- Cumulative eval spend: smoke $0.014 + R1 $0.0419 + R2 $0.0211 ≈ **$0.077** of the $170.

## 5. Verdict (recorded as D-024)

Builder lane stays UNROUTED (deepseek FAIL twice; grok CONDITIONAL twice — and grok's job is the chat lane). No bulk routing without a PASS round. Taste: SHIP deepseek/T1+T6, grok/T1+T2; SHIP-WITH-NOTES grok/T4-R1 (`fetchReply`, now banned), grok/T6-R2 (stateless store).

Evidence: Temp `eval-0908/` — `round1/` (sealed R1), root `candidates/`+`responses/`+`run-summary.json` = ROUND 2 (archive before R3), `tasks/` (v3), `harness/`+proof.json (round-2-prep + round-2-micro sections), `score-r2.txt` (pre-micro) + `score-r2b.txt` (final), `instruments/`. No secrets in any file.

## 6. Post-script addendum — T4-cell contamination (found during round-3 build, 2026-09-08)

Two instrument artifacts hit deepseek/T4-R2 specifically (verdict class unaffected — see below):
- (a) The round-2 T4-API-1 RED ("missing: deferUpdate") was a COMMENT-STRIPPER bug: the candidate has `await i.deferUpdate();` in real code (line 54), but the old stripper ate the code line following a `//` comment line, hiding the token. Current code scores API-1 GREEN on the identical sealed file.
- (b) Its RUN-1/2 REDs (`reading 'edit'` = missing `i.message`) are the F2-confirmed mock gap: production `ButtonInteraction.message` exists; the sealed T4 inline btn mocks lack it.
- Verdict class stands (FAIL either way: even fully repaired, the cell's honest reading is at best mixed, and deepseek stays 2–3/6 = FAIL band; grok/T4-R2's adjudicated FAIL is independent of both artifacts — its reply-chain crashes with no message object at all). Recorded so round 3 does not inherit either defect: R3 checks carry comment-adjacency fixtures and `message`-faithful btn mocks from birth.
