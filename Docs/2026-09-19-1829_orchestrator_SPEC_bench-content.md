# SPEC: bench-content — builder content correctness, 4 live re-runs + spec-detail snapshot + line-by-line grade

## Status: SPEC (founder-approved 2026-09-19 evening, option A: subagents read code + specs)

## Goal

Answer the founder's follow-up — "does it do it RIGHT, not just run?" — with a receipt, not an opinion: re-run 4 frozen briefs through the LIVE builder on box PG, snapshot `spec_versions.spec` FULL JSON pre-delete (behavior count + kinds + raw spec), then a FRESH grader reads the specs line-by-line against the briefs + the real `parseSpec` product shape. Corrects the R2/R3 evidence gap from bench-quality (10/10 PASS-with-note at row-count level).

## Non-goals

- No Discord publish, no real tokens, no UI/login. No repo code changes. No key handling (len-32 WIRO key stays installed; nobody touches /opt/corvus/.env, nobody pastes key values anywhere).
- Not a re-run of all 10. Not stage test on live Discord (option B, after this wave).
- No hardening stress (budget gate, retry/repair, ledger idempotency, supervisor) — prior unit/integration proofs only, out of scope here.

## Cost & risk

~$0.01 expected (4 × ~$0.002-0.005 per run at observed bench spend; B7-class may take 2 calls); ABORT the wave if projected spend exceeds $1. Biggest risk = a run drifting into a premium-model lane (mitigated: briefs are builder-type, stop rule below, spend snapshot per run).

## Frozen briefs (subset of bench-quality B1–B10, byte-identical strings, English)

1. C1 (= B1 welcome): "Create a welcome bot: greet every new member in #general with a friendly message and give them the Member role."
2. C2 (= B2 moderation-warn): "Build a moderation bot that warns a member the first time they post a banned word and deletes the message."
3. C3 (= B7 giveaway): "Create a giveaway bot: start a giveaway with a prize and duration, let members enter with a reaction, and pick a random winner at the end."
4. C4 (= B9 timeout): "Create a timeout bot: time out a member for 10 minutes when a moderator uses the timeout command."

Why these 4: C1 simplest (welcome baseline), C2 second-costliest in bench (1.05cr — worth inspecting), C3 only 2-call run + costliest (2.00cr — retry class), C4 cheapest (0.17cr — floor sample).

## Frozen rubric (same R1–R5 as bench-quality; R2/R3 now fully provable)

- R1 contracted: builder_runs reaches terminal `live`, spec_versions has exactly v1 for the bot, boss job `completed`.
- R2 faithful: every behavior in the spec traces to something the brief asked for (no invented features, no dropped core ask). Graded LINE-BY-LINE from the snapshotted spec JSON — quote behavior kinds/fields against brief asks.
- R3 shaped: draft passes parseSpec product shape — 1..20 behaviors, every entry has a non-empty `kind`. Graded by running/checking the REAL validator path (`packages/spec/src/index.ts` parseSpec + `packages/ai/src/eval/golden-briefs.ts` checkProductDraft strictness note), never by eyeball.
- R4 honest: no provider text leaked into the detail field (coded class only); bot row stays `draft` (nothing published).
- R5 metered: ≤3 billable calls for the run and ≤54 credits total (BUILDER_BILLABLE_CEILING).

A brief scores PASS only if R1–R5 all hold. Report per-brief verdict + the failing rule + one-line evidence + (for R2) the behavior→ask trace table.

## Wave shape (disjoint write-scopes — parallel-safe per Hard Rule 14)

- Runner C (bench-c): briefs C1+C2. Runner D (bench-d): briefs C3+C4. Each runner owns its own bot/account/run rows only (discord_id `bench-2026-09-19-c-N` / `-d-N`, bot name `bench-2026-09-19-{c,d}-N-bot`).
- Grader (bench-grade-c): starts ONLY after both runners report; reads both runner reports (whitelisted) + the snapshotted spec JSONs inside them; applies R1–R5 line-by-line; writes the content scorecard. Never the builder of any row it grades.

## Runner contract (identical for C and D, except brief list)

- Pre-checks (read-only): HEAD 5c6c134 (tree dirty with grab+docs only, no product code change — verify via `git status --short` + `git rev-parse HEAD`), all services Up, WIRO lens 32/32 (lengths only, never values), worker running, zero own-suffix fixtures.
- You may READ (read-only, never modify): `packages/spec/src/index.ts` (parseSpec contract), `apps/gateway/src/db/builder-runs.ts` (sync INSERT + live detail contract), `packages/ai/src/eval/golden-briefs.ts` (checkProductDraft strictness reference).
- Per brief N: INSERT account (tier='trial') + bot (dummy token_cipher, status 'draft') + builder_runs row; boss.send('builder',{runId,botId,brief},...) with v2 options; poll to terminal (≤10 min); record phase + detail + created/updated + wall seconds; snapshot ai_spend count+sum + spec_versions count for the run BEFORE any delete; **AND snapshot `spec_versions.spec` FULL JSON pre-delete (SELECT spec WHERE bot_id=$1) + behavior count + kinds list + diff_summary/author/state.** The pre-delete snapshot IS the evidence (account-delete cascades spec/spend rows — confirmed by bench-quality + live-smoke-003).
- Cleanup per brief BEFORE the next brief: DELETE builder_runs → bots → accounts for own rows; verify own rows 0.
- Stop rules: exactly 2 runs, one per brief, sequential (never 2 live jobs at once per runner); if a run leaves WIRO routes toward a premium lane, STOP observing that run, record it, continue to next brief; abort whole task if projected total >$1.
- Report: `Docs/2026-09-19-1829_bench-{c,d}_CREATE_bench-content-runs.md` with the report schema + a per-brief table (brief id, runId, phase, wall s, calls, credits, spec rows, behavior count, kinds, cleaned y/n) + the FULL spec JSON per brief (verbatim, no truncation; if >200 lines, full JSON in report + kinds/count summary up top).

## Grader contract

- Reads ONLY: the two runner reports (whitelisted filenames) + this spec. No new box writes; read-only code reads allowed (`packages/spec/src/index.ts`, `packages/ai/src/eval/golden-briefs.ts`) to ground R3. Never invent spec contents — grade only from the snapshotted JSONs.
- Applies R1–R5 to each of the 4 briefs from the runners' snapshots; per brief: verdict + failing rule + one-line evidence + R2 behavior→ask trace (each behavior kind/field mapped to the brief phrase it serves, or flagged INVENTED; each brief ask mapped to PRESENT/MISSING).
- R3: state behavior count, kinds non-empty y/n, and parseSpec-shape verdict (1..20 + kind present) per brief.
- Cost table (per brief + total + $ conversion at USD_PER_CREDIT=0.005) + corrected R2/R3 verdicts vs bench-quality's PASS-with-note.
- Report: `Docs/2026-09-19-1829_bench-grade-c_REVIEW_bench-content.md` (report schema, Status = SUCCESS if scorecard complete regardless of pass/fail).

## Files in scope

- CREATE (local): the spec (this file) + 2 runner reports + 1 grader report. Nothing else local.
- BOX-TRANSIENT: bench accounts/bots/runs rows only, all deleted by runners.
- NEVER: /opt/corvus/.env, HEAD, pgdata, other box files, other services, any repo code, git restore/stash/checkout/reset, stage/commit/push. Zero Discord publish. Zero key values anywhere (lengths only).

## Acceptance

- [ ] 4/4 briefs executed live, each with phase + wall time + spend snapshot + FULL spec JSON snapshot + cleanup verified
- [ ] Grader content scorecard complete: 4 verdicts with R2 traces, failing rules named, cost table, corrected R2/R3 vs bench-quality
- [ ] Total spend ≤$1 (expected ~$0.01); zero Discord publish; zero key values anywhere
