# Corvus Model, Economics & V1 Scope (2026-09-07)

## Status: LIVE (research record, numbers verified live 2026-09-07)

> Companion to `vibebot-deep-research-2026-09-07.md` (the benchmark).
> This file records OUR choices: model, unit economics, pricing shape, V1 scope.
> Founder-locked decisions live in `DECISIONS.md` (D-004 language, D-005 model, D-006 dashboard+templates).

---

## 1. Model decision: GLM 5.3 Flash (verified real)

- **Existence: REAL.** Launched 2026-08-26 by Z.AI (ex-Zhipu). Model ID `glm-5.3-flash`, international endpoint `https://api.z.ai/api/paas/v4/chat/completions` (OpenAI-compatible). Weights MIT on HuggingFace. Pre-launch stealth ("Ox Alpha") was most-used model on OpenRouter/OpenCode on quality alone.
- **Price (LIST — budget on this, NOT promo):** $0.15/1M in, $0.03 cached, $0.50/1M out. Promo $0.075/$0.25 ends Sept 9, 2026 16:00 UTC — ignore for planning.
- **Coding evidence:** Terminal-Bench 2.1 84.3 (vs Opus 4.8 85.0), DeepSWE 63.4 (vs Opus 58.0), Toolathlon 78.4 (vs Opus 76.2). Largest gap: NL2Repo 56.3 vs Opus 69.7 (whole-repo generation). English: PASS (all benches English-prompted; GDPval-AA English Elo 1773 vs Opus 1582). Confidence for Discord.js codegen: MEDIUM — needs own golden-task eval.
- **Caveats:** slow + verbose (~49-67 tok/s, reasoning unbilled-off, bills as output — fine for async builder, bad for streaming); 12 days old (stability unproven); Coding Plan subscription ($18-168/mo) is ToS-BANNED as SaaS backend — metered API only; Türkiye/EU card top-up may hit 3DS friction (untested — $5 test required); rate limits undocumented; refusal behavior on safety-adjacent prompts unverified.
- **Route:** OpenRouter (`z-ai/glm-5.3-flash`, 12+ providers) primary for failover, direct `api.z.ai` pinned alternate. Fallback: Sonnet 4.6 ($3/$15) for retries/refusals/slow runs (>60s), budgeted 5-10% of runs.
- **Eval gate (must pass before 100% traffic):** English Discord.js golden tasks (moderation command + embed/pagination + intent-correct scaffold) vs Sonnet: pass rate, wall-clock, real output-token burn.

## 2. Unit economics (assumptions: run = 20k in + 5k out, calibrated to Vibebot's $0.34 demo run; msg = 1.5k in + 300 out)

| Per unit | Sonnet 4.6 ($3/$15) | GLM-5.3-Flash list ($0.15/$0.50) | Ratio |
|---|---|---|---|
| Builder run | $0.1350 | $0.0055 | 24.5x |
| Persona msg | $0.0090 | $0.000375 | 24x |

$10/mo Pro user margin (fees $0.59, shared-runtime hosting ~$0.15-0.45):

| Scenario | Sonnet margin | GLM margin |
|---|---|---|
| Light (5 runs + 200 msgs) | +$4.92 | +$7.06 |
| Medium (15 + 1,000) | **-$3.64 underwater** | +$5.91 |
| Heavy (40 + 5,000) | -$43.01 | +$0.65 (thin) / +$2.52 shared |

Conclusions: $10 flat is UNPRICEABLE on Sonnet-class (medium user costs more than price). On GLM it clears with room — this is what funds flat pricing + free tier + free export. Verbosity tax (~+36% output) still leaves >15x margin. Multi-bot plans must run on shared/mutiplexed runtime, never $2/bot isolated containers.

## 3. Pricing shape (LOCKED v1 tiers — D-009 + D-011 + D-013/D-015, 2026-09-07)

| Tier | Price | Bots/servers | AI allowance (token-indexed credits, no meter shown) |
|---|---|---|---|
| Free trial (no card, 3 days — NO forever-free) | $0 | 1 bot / 1 server, full Pro features | 100 credits / 3 days (run ≈ 1.1 cr, msg ≈ 0.075 cr); day 4: pay or sleep (data 12 mo, wake on upgrade, never deleted) |
| Pro | $10/mo | 2 bots / 5 servers | 2000 credits/mo (~1800 builds or ~26k replies) |
| Studio | $29/mo | 8 bots / up to 100 servers (HARD CAP — no unlimited: resale/abuse overload risk) | 6000 credits/mo |
| Scale $100 (~20 bots, capped) | POST-LAUNCH (D-015) | — | — |

> Credit = $0.005 of AI at GLM list (deduction = in/1M×30 + out/1M×100; formula moves with model price). "No card" = signup with Discord only; card asked ONLY at paid upgrade. (Vibebot demands a card before any trial — we do the opposite.)
> Infra: Hetzner `nbg1` Nuremberg 1x CX33 start (~€9-14/mo at 100 bots); 2nd region on triggers only (D-010/D-012). Template marketplace = V2 (credit sales, ~30% fee, curation gate, verified reviews). Music = builder-capable, NO ready template (YouTube labeled fragile).

Rules: soft-cap (AI pauses, bot stays online — never surprise bills); refill $5 = 1000 credits (90-day expiry); trial end falls back to sleep (12-mo data keep, wake on upgrade); anti-farming: 1 trial per Discord account + rate limits; dashboard shows human translations ("≈1800 builds"), never raw tokens.

## 4. Architecture-cost notes (for `05_architecture.md`)

1. One multiplexed gateway process routing N Discord tokens (not one container per bot): $0.15/bot vs $2.02 — 13x cut that funds free tier.
2. No per-bot staging twin: shared staging pool OR guild-scoped preview commands (draft behavior runs ephemerally, zero extra container).
3. Sleep-after-idle for Free (state snapshot, gateway RESUME on wake); paid pinned warm; wake SLA by tier.
4. Hetzner-packed primary (€4.35/mo box), Fly shared-cpu overflow; NOT Railway ($7.50/bot meter).
5. Context-cache persona system prompt ($0.03/1M reads); cap memory (last 10 msgs + 500-token summary).
6. Cheapest-leg routing later: Flash-Lite-class for persona chatter only (cuts medium AI $1.48 -> ~$0.62); one model in V1.
7. Fail-closed allowance ledger in code (worst-case AI/user/mo = allowance cost, bounded).

## 5. Kill numbers (pre-written triggers)

- **K1:** median OUR cost/run > $0.50 on GLM after 30 eval builds (founder-set 2026-09-07; was $0.05) -> STOP, re-scope builder before Pro launch.
- **K2:** measured infra/bot/mo > $1.50 at 100+ bots on shared runtime -> no free tier, no sub-$15 plan until re-architected.
- **K3:** realized Pro margin < $3.00/mo at medium-ish use over any 4-week cohort -> reprice to $15 or halve allowance within 2 weeks.

## 6. V1 scope (9 items — founder expanded 2026-09-07, D-007)

1. **V1-1** Guided Connect + least-privilege invite (no token paste, <=6 perms with why-lines) + PRIVATE panel interview (conversational setup inside dashboard, never in the user's server — setup chatter must stay invisible to members).
2. **V1-2** Visual editor <-> AI chat round-trip on versioned `behavior-spec.json` (one surface, two inputs, draft vN).
3. **V1-3** Draft / Publish / Rollback timeline (prod pointer separate from draft; rollback <60s).
4. **V1-4** Pre-flight scan, blocking on Red (roles, overwrites, perms, intents — each row a 30-sec fix).
5. **V1-5** Event simulator on draft (fake join/message/reaction/slash — no Discord calls) + PRE-INSTALL live demo window (fake Discord on our site running a demo bot — conversion driver).
6. **V1-6** Template gallery v1: 8 templates, fork-on-install, Customize-with-AI handoff ("describe the diff"). "One-click typical server packs" = same gallery: a pack is a template bundle (behaviors + channel/role layout suggestion), not a separate system.
7. **V1-7** Honest pipeline + guild-command sync + Logs + plain-language "what does my bot do?" explainer.
8. **V1-8** Persistent per-bot database (XP/warnings/economy/configs survive restarts, updates, redeploys) + backups; data-loss-on-restart = launch-blocker with regression test.
9. **V1-9** Self-healing runtime (silent catch + fix + resume, no downtime, no stack traces to users, platform-failure retries free).

V2 (validated-only): full staging, 30d analytics, team matrix, paid wallet, MEE6-first Switch Kit, weekly #mod-log digest, false-positive repair buttons, thin `/corvus status|link|log`, 90-day transcript vault + free permanent export, free code export + Railway button, public per-bot status page + auto-changelog, 12 templates + verified reviews.
NEVER: full in-Discord settings (drift), unlimited free storage, global commands default, node-graph editor, fleet manager, auto-moving user roles, native mobile app. (Template marketplace moved OFF Never -> V2 with fee + curation + verified reviews, D-015. Music template: not in gallery; builder-capable only, D-015.)
V1 acceptance signals: 5/5 strangers connect without token paste; panel interview completes without docs; AI+visual edit same draft no lost fields; rollback <60s; Red-flagged hierarchy fixed via link; simulator predicts prod; demo-window visitor tries 3+ messages before signup; template installed <=3 clicks to test-guild trial; deploy never >5 min without visible reason; kill -9 mid-day loses zero XP (V1-8 test); injected crash recovers silently with no user-visible error (V1-9 test).

## 7. Sources (2026-09-07)

`z.ai/blog/glm-5.3-flash`, `huggingface.co/zai-org/GLM-5.3-Flash`, `docs.z.ai/guides/overview/pricing` (+quick-start, api-reference, legal terms, subscription-terms, devpack usage-policy, faq), `openrouter.ai/z-ai/glm-5.3-flash`, `developers.cloudflare.com/workers-ai/models/glm-5.3-flash`, `artificialanalysis.ai/models/glm-5-3-flash`, `benchlm.ai/benchmarks/terminalbench21`, `ai.google.dev/gemini-api/docs/pricing`, `platform.claude.com/docs/en/about-claude/pricing`, `fly.io/docs/about/pricing`, `railway.com/pricing`, `hetzner.com/cloud`, SCMP 2026-08-27 (Ox Alpha reveal), buildfastwithai + memeburn + mindstudio reviews (Aug 2026).


## 8. Addendum 2026-09-09 (locked numbers - D-032/D-033/D-034)

- K2/K3 LOCKED as proposed: K2 = infra/bot/mo over $1.50; K3 = Pro margin under $3.00/mo. Binding condition: measured on accrued LIVE provider cost, never the fixed credit table, never cash while the $170 balance lasts.
- Scale $100 caps LOCKED: 20 bots / 200 servers / 20,000 credits/mo, hard cutoff, no rollover (worst case about -$4.30/user/mo). Post-launch only.
- Trial is app-owned: no Creem object exists until the upgrade checkout (Creem-managed trials require a card).
- 5.2-era margins at live prices (builder $0.05/run, persona $0.00045/msg): light about $8.96, medium about $8.43, heavy about $7.14. The $170 balance funds about 3,400 realistic builds. Migration math to GLM 5.3 Flash off-wiro unchanged.
