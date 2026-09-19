# SPEC: bench-quality — builder quality benchmark, 10 live runs + frozen rubric

## Status: SPEC (founder-approved 2026-09-19 evening, option B)

## Goal

Answer the founder's question — "does the builder do it RIGHT?" — with a receipt, not an opinion: 10 frozen briefs run through the LIVE builder on box PG, graded by a FRESH agent against a FROZEN rubric, with wall time + ai_spend cost per brief. Pass band ≥7/10; anything below escalates with evidence.

## Non-goals

- No Discord publish, no real tokens, no UI/login. No repo code changes. No key handling (len-32 key stays installed; nobody touches /opt/corvus/.env).

## Cost & risk

~$0.02 expected (10 × ~$0.002 per run at observed 003 spend); ABORT the wave if projected spend exceeds $1. Biggest risk = a run drifting into a premium-model lane (mitigated: briefs are builder-type, stop rule below, spend snapshot per run).

## Frozen briefs (B1–B10, English — builder input language is English by D-004)

1. B1 welcome: "Create a welcome bot: greet every new member in #general with a friendly message and give them the Member role."
2. B2 moderation-warn: "Build a moderation bot that warns a member the first time they post a banned word and deletes the message."
3. B3 xp-levels: "Make an XP bot: award XP for each chat message, announce when a member levels up, and keep a weekly leaderboard."
4. B4 poll: "Build a poll bot: start a yes/no poll with one command, count reactions as votes, and announce the winner when the poll closes."
5. B5 autoresponder: "Create an autoresponder bot: when someone types !help, reply with a list of server rules."
6. B6 modlog: "Build a mod-log bot: log every deleted message (author, channel, time) to a #mod-log channel."
7. B7 giveaway: "Create a giveaway bot: start a giveaway with a prize and duration, let members enter with a reaction, and pick a random winner at the end."
8. B8 reactionrole: "Build a reaction-role bot: give members the Gamer role when they react with the game emoji."
9. B9 timeout: "Create a timeout bot: time out a member for 10 minutes when a moderator uses the timeout command."
10. B10 threadwelcome: "Build a thread-welcome bot: open a private thread for each new member and post a welcome message inside it."

## Frozen rubric (grader applies identically to all 10; PASS = all true)

- R1 contracted: builder_runs reaches terminal `live`, spec_versions has exactly v1 for the bot, boss job `completed`.
- R2 faithful: every behavior in the spec traces to something the brief asked for (no invented features, no dropped core ask).
- R3 shaped: draft passes parseSpec product shape — 1..20 behaviors, every entry has a non-empty `kind`.
- R4 honest: no provider text leaked into the detail field (coded class only); bot row stays `draft` (nothing published).
- R5 metered: ≤3 billable calls for the run and ≤54 credits total (BUILDER_BILLABLE_CEILING).

A brief scores PASS only if R1–R5 all hold. Report per-brief verdict + the failing rule + one-line evidence.

## Wave shape (disjoint write-scopes — parallel-safe per Hard Rule 14)

- Runner A (bench-a): briefs B1–B5. Runner B (bench-b): briefs B6–B10. Each runner owns its own bot/account/run rows only (discord_id `bench-2026-09-19-a-N` / `-b-N`, bot name `bench-2026-09-19-{a,b}-N-bot`).
- Grader (bench-grade): starts ONLY after both runners report; reads both runner reports (whitelisted) + queries box rows; writes the scorecard. Never the builder of any row it grades.

## Runner contract (identical for A and B, except brief list)

- Pre-checks (read-only): HEAD 5c6c134, all services Up, WIRO lens 32/32, worker running, zero bench fixtures for own suffix.
- Per brief N: INSERT account (tier='trial') + bot (dummy token_cipher, status 'draft') + builder_runs row; boss.send('builder',{runId,botId,brief},...) with v2 options; poll to terminal (≤10 min); record phase + detail + created/updated + wall seconds; snapshot ai_spend count+sum + spec_versions count for the run BEFORE any delete.
- Cleanup per brief BEFORE the next brief: DELETE builder_runs → bots → accounts for own rows; verify own rows 0. (Note: account-delete cascades ai_spend/spec rows — the pre-delete snapshot IS the evidence.)
- Stop rules: exactly 5 runs, one per brief, sequential (never 2 live jobs at once per runner); if a run leaves WIRO routes toward a premium lane, STOP observing that run, record it, continue to next brief; abort whole task if projected total >$1.
- Report: `Docs/2026-09-19-1800_bench-{a,b}_CREATE_bench-runs.md` with the report schema + a per-brief table (brief id, runId, phase, wall s, calls, credits, spec rows, cleaned y/n).

## Grader contract

- Reads ONLY: the two runner reports (whitelisted filenames). No new box writes; read-only verification queries allowed (counts only).
- Applies R1–R5 to each of the 10 briefs from the runners' snapshots; scorecard table + pass count + failing rules + one-line evidence each; cost table (per brief + total + $ conversion at USD_PER_CREDIT=0.005).
- Verdict: PASS BAND (≥7/10) or FAIL with the 3 weakest briefs named.
- Report: `Docs/2026-09-19-1800_bench-grade_REVIEW_bench-scorecard.md` (report schema, Status = SUCCESS if scorecard complete regardless of pass/fail).

## Files in scope

- CREATE (local): the spec (this file) + 2 runner reports + 1 grader report. Nothing else local.
- BOX-TRANSIENT: bench accounts/bots/runs rows only, all deleted by runners.
- NEVER: /opt/corvus/.env, HEAD, pgdata, other box files, other services, any repo code, git restore/stash/checkout/reset, stage/commit/push.

## Acceptance

- [ ] 10/10 briefs executed live, each with phase + wall time + spend snapshot + cleanup verified
- [ ] Grader scorecard complete: 10 verdicts, failing rules named, cost table, pass-band verdict
- [ ] Total spend ≤$1 (expected ~$0.02); zero Discord publish; zero key values anywhere
