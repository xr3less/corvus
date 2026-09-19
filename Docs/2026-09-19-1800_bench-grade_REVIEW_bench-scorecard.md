# Task Report: bench-grade

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1800_bench-grade_REVIEW_bench-scorecard.md

## Dependencies Added

None.

## Assumptions Made

- Runners' pre-delete snapshots are taken as authoritative evidence (account-delete cascades ai_spend/spec rows, so post-hoc DB re-audit is impossible — confirmed by both runners and live-smoke-003).
- Wall seconds = builder_runs.updated_at minus created_at (box UTC) unless noted; B6 is DB window (~23.3s) per runner B recovery note; B7-B10 are driver-measured.
- USD conversion at USD_PER_CREDIT=0.005 per grader contract.
- R2/R3 graded per task instruction: where runner recorded only row counts (no behavior kinds/counts), mark PASS-with-note, never invent spec contents. All 10 runs recorded exactly 1 spec row v1 and no behavior-level dump.
- B4/B5 wall times include shared-queue wait behind runner B (single worker serializes queue) — noted, not penalized.

## Open Questions for Orchestrator

- R2/R3 evidence gap (applies to all 10): runners captured spec row count (1 x v1) but no behavior list, behavior count, kinds, or parseSpec output. Grading marks R2/R3 PASS-with-note, but a future wave should snapshot spec_versions.detail (behavior count + kinds) pre-delete to make R2/R3 fully verifiable. No re-audit is possible now (rows cascaded on delete).
- B7 used 2 billable calls (0.9944 + 1.00672). Within ceiling (≤3). Worth watching if giveaway-class briefs consistently need 2 calls, but not a failure.
- No premium-lane drift observed on any run (all billable calls glm/5-2). No Discord publish on any run.

## Public Interface Exposed

Scorecard for B1-B10 below (per-brief verdict table + cost table + pass-band verdict). No code, no API, no box writes.

## Known Limitations

- Read-only grading from runner snapshots only; no box writes, no DB inserts, no billable calls, no service restarts, no key handling performed.
- Spec content (faithfulness/shape) not directly inspected — behavior-level evidence absent in both runner reports. R2/R3 are PASS-with-note, not fully proven.
- No UI/login/Discord publish exercised (by design).
- Wall-time comparison across runners is confounded by single-worker queue contention (B4 ~40s queue wait noted by runner A; B7 94.8s longest).

---

# Scorecard: bench-quality B1-B10 (frozen rubric R1-R5)

Rubric (PASS = all true):

- R1 contracted: builder_runs terminal `live`, spec_versions exactly v1, boss job `completed`.
- R2 faithful: every spec behavior traces to brief ask (no invented/dropped core ask).
- R3 shaped: 1..20 behaviors, every entry has non-empty `kind`.
- R4 honest: no provider text in detail (coded class only); bot stayed `draft`.
- R5 metered: ≤3 billable calls and ≤54 credits.

## Per-brief verdicts (10/10)

| brief              | phase / boss     | wall s | calls / credits | spec   | R1   | R2             | R3             | R4   | R5   | verdict + evidence                                                                                                                                              |
| ------------------ | ---------------- | ------ | --------------- | ------ | ---- | -------------- | -------------- | ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 welcome         | live / completed | 18     | 1 / 0.37116     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 87477b84 live, v1 x1, boss completed, draft, 1 call 0.37cr; spec behaviors not dumped (gap noted)                                                    |
| B2 moderation-warn | live / completed | 33     | 1 / 1.04908     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run dc187c0e live, v1 x1, boss completed, draft, 1 call 1.05cr; spec behaviors not dumped (gap noted)                                                    |
| B3 xp-levels       | live / completed | 16     | 1 / 0.32332     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run a94b7d79 live, v1 x1, boss completed, draft, 1 call 0.32cr; spec behaviors not dumped (gap noted)                                                    |
| B4 poll            | live / completed | 59     | 1 / 0.47112     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 32632dda live, v1 x1, boss completed, draft, 1 call 0.47cr; 59s incl ~40s queue wait behind B; spec behaviors not dumped (gap noted)                 |
| B5 autoresponder   | live / completed | 30     | 1 / 0.21368     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 8ac1e88d live, v1 x1, boss completed, draft, 1 call 0.21cr; spec behaviors not dumped (gap noted)                                                    |
| B6 modlog          | live / completed | ~23.3  | 1 / 0.3776      | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 3da15cde live, v1 x1, boss completed, draft, 1 call 0.38cr; wall is DB window (driver recovery note); spec behaviors not dumped (gap noted)          |
| B7 giveaway        | live / completed | 94.8   | 2 / 2.00112     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 164f9d90 live, v1 x1, boss completed, draft, 2 calls 2.00cr (0.9944+1.00672); longest wall but within ceiling; spec behaviors not dumped (gap noted) |
| B8 reactionrole    | live / completed | 24.5   | 1 / 0.36652     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 0829e264 live, v1 x1, boss completed, draft, 1 call 0.37cr; spec behaviors not dumped (gap noted)                                                    |
| B9 timeout         | live / completed | 24.5   | 1 / 0.17436     | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run fe67662f live, v1 x1, boss completed, draft, 1 call 0.17cr (cheapest); spec behaviors not dumped (gap noted)                                         |
| B10 threadwelcome  | live / completed | 58.5   | 1 / 0.7874      | 1 (v1) | PASS | PASS-with-note | PASS-with-note | PASS | PASS | PASS — run 08d18f03 live, v1 x1, boss completed, draft, 1 call 0.79cr; spec behaviors not dumped (gap noted)                                                    |

Failing rule per brief: none — 10/10 PASS (R2/R3 carry the same explicit evidence-gap note on every brief: count-matches (1 x v1) but behavior kinds/counts never recorded, so faithfulness/shape verified only at row-count level).

R4 detail (all 10): detail `{"stub": false, "model": "glm/5-2", "version": 1}` — coded class only, no provider text; all bots stayed `draft`, zero Discord publish.
R5 detail (all 10): max 2 calls (B7), max 2.00112 credits (B7) — every run far under ≤3 calls / ≤54 credits.

## Cost table (USD_PER_CREDIT=0.005)

| brief                      | credits | $       |
| -------------------------- | ------- | ------- |
| B1 welcome                 | 0.37116 | 0.00186 |
| B2 moderation-warn         | 1.04908 | 0.00525 |
| B3 xp-levels               | 0.32332 | 0.00162 |
| B4 poll                    | 0.47112 | 0.00236 |
| B5 autoresponder           | 0.21368 | 0.00107 |
| B6 modlog                  | 0.37760 | 0.00189 |
| B7 giveaway                | 2.00112 | 0.01001 |
| B8 reactionrole            | 0.36652 | 0.00183 |
| B9 timeout                 | 0.17436 | 0.00087 |
| B10 threadwelcome          | 0.78740 | 0.00394 |
| Runner A subtotal (B1-B5)  | 2.42836 | 0.01214 |
| Runner B subtotal (B6-B10) | 3.70700 | 0.01854 |
| TOTAL (10 runs, 11 calls)  | 6.13536 | 0.03068 |

Wall time: mean 38.16s, median 27.25s (sorted: 16, 18, 23.3, 24.5, 24.5, 30, 33, 58.5, 59, 94.8). Cost: mean 0.61354cr ($0.00307), median 0.37438cr ($0.00187). Total spend $0.03068 — two orders of magnitude under the $1 abort line.

## Pass-band verdict

PASS BAND: 10/10 PASS (threshold ≥7/10). No failing briefs; no 3-weakest list required. Watchlist (not failures): B7 (costliest, 2 calls, longest wall 94.8s), B2 (second costliest 1.05cr), B10/B4 (long walls 58.5s/59s, queue-influenced). Recommended harness fix before next wave: snapshot spec detail (behavior count + kinds) pre-delete so R2/R3 are provable, not count-inferred.
