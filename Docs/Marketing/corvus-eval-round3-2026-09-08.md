# Corvus Golden Eval — Round 3 DECIDER (2026-09-08)

## Status: LIVE (research record — read R1 + R2 files first for the full arc)

> 10 FRESH tasks (no overlap with T1–T6), same frozen family, locked config (temp 0, 6k cap, reasoning-low-deepseek).
> Harness: 10/10 CERTIFIED + probe-clean + 3x-stable + UNKNOWN-vs-FAIL spec — AND YET the deterministic layer still failed in production (see §4). This round's verdicts are EXPERT REVIEW (orchestrator read all 20 files against the frozen rubrics; deterministic GREEN accepted without override; every RED/UNKNOWN override cites a quoted production-API behavior).
> Override bar (pre-committed before reading outcomes): override ONLY where production truth CONTRADICTS the check (mock gaps, counting, literal-style). Frozen-rubric judgment calls stand even when strict.

## 1. Deterministic table (published, DISCLAIMED — do not cite without §4)

1/20 PASS (deepseek/U2). Distribution shift vs R1/R2 (~40%) is instrument strictness, not model collapse — proven cell by cell in §2.

## 2. Expert verdicts (the actual scores)

| Task | deepseek | grok | Decisive evidence (quoted) |
|---|---|---|---|
| U1 serverinfo | FAIL (no commandName guard; prompt/rubric tension noted, gateway routes in our arch — frozen rubric wins ties) | PASS-notes (defer+edit = 1 visible message, counting artifact; content verified; registration snippet missing — hole filed) | ds: dead-code risk accepted per frozen rules; gr: counting fix |
| U2 roleinfo | PASS (frozen SHIP — getRole, hexColor, 10062 fallback) | PASS-notes (defer+edit flow probe-verified; mention via `role.toString()` production-true; no name-text field — minor) | probe transcript |
| U3 autoresponder | PASS (Events enum — literal-check artifact overridden; CONFIG+bot-ignore+silent-catch verified) | PASS (same grounds; un-awaited reply noted) | T6-R2 certified precedent |
| U4 timeout | PASS (probe transcript: defer → `timeout(600000)` REAL action → ephemeral confirm; all branches read clean) | PASS (same shape verified by read: fetch, owner, hierarchy, timeout, 50013 catch) | probe-u4 transcript, both lanes |
| U5 poll | PASS (RUN-2 mock returned null for REQUIRED options — production-guaranteed non-null; code trusts the guarantee correctly) | FAIL (genuine `{message}` destructure crash — production resolves `{resource:{message}}` — plus genuine `ephemeral:` deprecated) | ds: Discord API validation; gr: crash quoted |
| U6 reactionrole | FAIL (no in-file wiring + MessageContent in CODE vs comment-only rule — both genuine) | FAIL (no in-file wiring — genuine; RUN reds mock-decided but verdict anchored on wiring) | wiring gap quoted (no client.on) |
| U7 modlog | unscored-UNKNOWN (env-at-load vs export-mutation config convention clash — NEITHER in prompt; industry-standard pattern unprovable under harness convention; rubric anticipated this shape in its own UNKNOWN trigger) | FAIL (no wiring — genuine; convention clash moot) | convention analysis in §5 |
| U8 giveaway | PASS (withResponse+resource.message CORRECT shape, Fisher-Yates rng-fn, dedupe, disable, cleanup) | FAIL (same `{message}` crash as U5 + `fetchReply` token; pattern: withResponse shape unknown) | ds verified by read; gr crash quoted |
| U9 automod | PASS (regex ≡ toUpperCase valid alternative; MESSAGE_CONTENT comment present; pure+cooldown+wiring verified) | PASS (same grounds; floating reply promise noted) | literal-check artifacts overridden |
| U10 threadwelcome | PASS (probe transcript: defer → PrivateThread(12)+invitable:false → members.add → mention confirm) | PASS (probe transcript: perm gate → create → add → reply) | probe-u10 transcript, both lanes |

Expert score: **deepseek 7/9 = 78% (U7 excluded) — CONDITIONAL-HIGH. grok 6/10 = 60% — CONDITIONAL.**
Taste: SHIP ds/U2,U3,U4,U5,U8,U9 + gr/U3,U4,U9,U10; SHIP-WITH-NOTES ds/U10 (deprecated 'ready' in dead guard), gr/U1 (no registration), gr/U2 (no name field); fails as tabled.
DUAL (either-pass — the engineering metric): **8/9 = 89%** (only U6 fails both — both omit in-file subscription, which suits gateway-owned routing; product note §5).

## 3. Cross-round synthesis (all scored cells ever)

- R1: ds 2/6, gr 4/6. R2: ds 2/6, gr 3/6. R3-expert: ds 7/9, gr 6/10.
- Totals: ds 11/21 (52%), gr 13/22 (59%) — rough parity, different shapes: deepseek sweeps the hardest (U8/U9/U10 all PASS) but drops wiring/contract details; grok steadier on easy/medium, crashes on response-shape (U5/U8 `{message}` twice) and skips wiring (U6/U7).
- Costs (provider-reported, cumulative): ds median **$0.00248** (n=22, range $0.00041–$0.00687); gr median **$0.00176** (n=22, range $0.00078–$0.00288) — ~200–280x under K1 $0.50. Wall medians R3: ds 35.7s (U8 97.4s outlier), gr 15.2s. grok ~1.4x cheaper, ~2.3x faster; deepseek stronger when reasoning pays off.
- Spend: R3 $0.0592 (20/20 billed; one grok/U2 HTTP 520 upstream error, unbilled, retry clean). Cumulative eval: ≈ **$0.136** of $170.

## 4. Instrument post-mortem (why deterministic died, with receipts)

1. **Comment-eating stripper (R2 T4 cell):** old comment stripper ate the code line after a `//` line, hiding a present token (API-1 false RED on a file containing `await i.deferReply();`). Fixed incidentally by refactor; added as R2 addendum. Lesson: validate check text-processing on adjacency fixtures, not just references.
2. **Reference-co-written mocks:** references pass because they were written against the same mocks (they avoid unmocked surface by construction). Reference-green proves check–reference consistency, NOT mock sufficiency. Every candidate using wider real API (`inGuild`, `memberPermissions`, `channels.cache`, `message` on buttons, `Role.toString`, `member.user`) crashed on mock gaps across all three rounds.
3. **Counting rule (mine, wrong):** defer+editReply counted 0 visible messages; production shows exactly one (proven by probe). Rule needs the already-deferred-edit-counts-once refinement.
4. **Literal-style checks (4 instances):** `messageCreate` vs `Events.MessageCreate`, `customId` vs `setCustomId`, `toUpperCase` vs `/[A-Z]/`, `MessageContent` vs `MESSAGE_CONTENT`. Style alternatives are production-valid; checks must accept all documented spellings.
5. **Config-convention clash (U7):** env-at-load (industry standard, both models) vs export-mutation (check-only) — neither in the prompt. Scored UNKNOWN, prompt clarification filed for R4.
6. **Coverage probe (worked):** pre-registered 13 flags; predicted the U4/U6/U10 mock gaps before scoring. Pre-registration is now mandatory process, not optional.

## 5. Product notes (for the builder, not the test)

- P1: Both models omit in-file event subscription on handler-style tasks (U6×2) — matches GATEWAY-OWNED routing (our arch invokes handlers; files needn't self-wire). The eval's "runnable file" framing fights our architecture here; the builder spec should define the handler-module contract explicitly (it already does via behavior-spec — keep it).
- P2: grok twice misunderstands the withResponse shape (`{message}` vs `{resource:{message}}`) — one line in the builder system prompt fixes a whole crash class.
- P3: Neither model fetches channel-partials (T5/U7, all rounds) — same one-line class.
- P4: U7 convention clash → generated code must read deploy-time config per-call (or document env-at-load as THE contract — decide once in V1-8).

## 6. Verdict (recorded as D-025)

No single bulk-primary crowned (neither reached 80%). Dual-source + human gate covers 8/9 — and the human gate already exists in V1-2 (Accept/Reject diff). K1 at n=22/lane and ~200x under bar.

## 7. Post-script addendum — U6 wiring FAILs invalid (found during round 4, 2026-09-08)

The R3 expert table scored ds/gr U6 FAIL on "no in-file event wiring." Re-examination against the frozen U6 prompt shows the prompt NEVER requires in-file subscription (behavioral trigger description + export contract only; the T5 reference precedent wires, but precedent is not requirement). The wiring FAILs are therefore rubric-overreach, not model defects. Corrected reading: U6×both-lanes UNSCORED (API-1 GREEN on `handleMessageCreate`-name/enum grounds; RUN reds mock-decided per the rubric's own trigger (2), which names `guild.roles.fetch` variants explicitly; PERSIST green stands). Corrected R3-expert: deepseek 7/8 (88%), grok 6/9 (67%) — verdict classes unchanged (CONDITIONAL-HIGH / CONDITIONAL). Frozen deterministic rows left intact as scored.

Evidence: Temp `eval-0908/` — `round1/`, `round2/` sealed; root `candidates/`+`responses/`+`run-summary.json` = ROUND 3 (archive next); `tasks-r3/` frozen; `harness/` (round-3-build + upgrades + micro); `score-r3.txt` + this file's per-cell table; `instruments/` (race/probe/parse scripts). No secrets in any file.
