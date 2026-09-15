# Corvus Golden Eval — Round 4: GLM 5.2 single-lane (2026-09-08)

## Status: LIVE (research record — read R3 file first for the instrument post-mortem)

> Founder-directed: try GLM 5.2 on wiro now (single meter — dual rejected as 2x spend); wiro balance → GLM 5.3 Flash off-wiro later.
> Same 10 frozen U-tasks, locked config (temp 0, 6k cap, `reasoning_effort: low` — contract-verified pre-round; observed reasoning 7–18 tokens, no bloat).
> Same procedure as R3: coverage-probe pre-registration → frozen-harness scoring → expert adjudication of every non-green (same override bar, pre-committed).
> 10 runs, 10/10 HTTP 200, **$0.0489** (median $0.0050, wall median ~48s).

## 1. Contract (free pre-check)

`GET /v1/models/glm/5-2`: $1.40/$4.40 (+$0.26 cache), `reasoning_effort` + `reasoning_enabled` supported, 1M context / 128K max-out. Matches the marketplace page — meter reconciled.

## 2. Expert verdicts (10/10 files read)

| Task | Verdict | Decisive evidence |
|---|---|---|
| U1 serverinfo | UNSCORED (mock gap: `guild.channels.cache` unmocked, probe-predicted; API GREEN on `createdTimestamp` — valid v14) + note: registers GLOBALLY, prompt demanded guild-scoped | probe flag + code quote |
| U2 roleinfo | PASS (probe transcript: defer → editReply, title+name+mention+color+members all present) | probe-u2 transcript |
| U3 autoresponder | PASS (Events enum + `author?.bot` + MESSAGE_CONTENT comment — three literal artifacts overridden; exact-match + silent verified by read) | T6-R2 certified precedent |
| U4 timeout | PASS (`inGuild` stub gap; 150-line handler read-verified: guards, real action, 50013 catch; 'ready' nit + rethrow note) | full read |
| U5 poll | PASS (required-null mock artifact; withResponse correct; progress UI; `fetchReply:false` sloppiness noted) | Discord API validation |
| U6 reactionrole | UNSCORED (no wiring required by prompt — R3 addendum applies; RUN reds mock-decided per rubric trigger (2); PERSIST green) | R3 §7 precedent |
| U7 modlog | UNSCORED (env-at-load vs export-mutation clash, same as ds/U7; strongest U7 file: dual-env, isTextBased guard, both wirings) | R3 convention analysis |
| U8 giveaway | PASS (`setCustomId` case artifact; dual-shape `resource?.message ?? response`; Fisher-Yates rng-fn; RUN-3 = mock missing `message.reply`) | full read |
| U9 automod | PASS (regex ≡ toUpperCase; comment present; pure+cooldown+wiring verified) | full read |
| U10 threadwelcome | PASS (`inGuild` stub gap; defer→PrivateThread+invitable→add→mention, read-verified end-to-end) | full read |

Score: **7/7 scored = 100% → PASS BAND** (3 unscored-excluded per frozen UNKNOWN rules). Zero genuine defects found in 10 files (2 notes: global registration U1, `require('discord.js').REST` laziness U10).

## 3. Three-way final (expert tables only)

| Lane | R1 | R2 | R3/R4 | Total |
|---|---|---|---|---|
| deepseek/v4-flash (builder) | 2/6 | 2/6 | 7/8 (R3) | 11/20 (55%) |
| grok-4-1-fast (chat) | 4/6 | 3/6 | 6/9 (R3) | 13/21 (62%) |
| glm/5-2 (new) | — | — | **7/7 (100%)** | 7/7 |

## 4. Economics (counsel first — L-004)

GLM 5.2 builder run (≈20k in + 5k out) ≈ **$0.05** (10x flash-class, verified against this round's median $0.0050 on short tasks — real builds will land $0.02–0.08).
Pro math at $10 Pro: light (5 runs ≈ $0.25 AI) fine; medium (15 runs ≈ $0.75 + grok persona ≈ $0.40) total ≈ $1.9 cost → ≈ $8 margin; heavy (40 runs ≈ $2.00 + $2.00 persona) total ≈ $5.1 → ≈ $4.9 margin. K1 ($0.50/run): median $0.0050, n=10 — 100x under, early signal.
Persona MUST stay grok (GLM 5.2 chat turns would be ~9x). Verdict: affordable as the wiro-balance builder, NOT as an everything-model.
Migration math flips on balance end: GLM 5.3 Flash off-wiro (~$0.08/$0.25 class) is ~10x cheaper per build — the move the founder ordered. Card/off-wiro setup has lead time (3DS friction unverified since D-005): START IT BEFORE the balance hits zero, not after.

## 5. Verdict (recorded as D-026)

Builder primary = GLM 5.2 on wiro (single meter). Persona = grok-4-1-fast (unchanged). deepseek = cold standby (configured, unrouted). Dual-source retired without ever routing (rejected on 2x spend — correct call at these absolutes).
Builder system prompt still gains the standing 3 one-liners (withResponse shape, partial fetch, handler contract) + 1 new: guild-scoped registration default.

Evidence: Temp `eval-0908/` — `round4/` to be archived (candidates+responses+summary+score-r4.txt); contract-glm52.py transcript above; probes. No secrets in any file.
