# 02 — Strategy

## Status: DRAFT (filled 2026-09-07, pending founder read; K2/K3 + Scale caps still to sign)

> Target customer, pricing, positioning, kill criteria, scope locks. When CANONICAL, this doc is second only to `GLOBAL_RULES.md` in authority. All entries here are product/business decisions — the founder decides; the AI recommends.

---

## 1. Ideal customer (ICP)

> LOCKED (D-008, 2026-09-07): V1 = small/medium NON-CODER server owners (gaming, streamer, friend/study groups; ~50-5,000 members). They carry the worst pain (setup hell, 4-dashboard sprawl, paywall creep) and match all 31 buyer voices in research. Big servers (own devs possible) = Studio tier audience, V2 emphasis — still servable from day one, not the design center.

> Language (LOCKED D-004): English-only. No Turkish UI/docs/support — no market in Türkiye; buyers live in EN communities.

> Distribution map due before first stranger outreach (tracked in `PLAN.md` Phase 3): r/Discord_Bots answers, top.gg template listing, 2 builds/week YouTube, Product Hunt launch, official Discord support server.

---

## 2. Positioning

For non-coder Discord owners drowning in rented bots, Corvus is the AI bot-builder that builds them ONE bot that's theirs to run and manage (own bot user, config, data, free export), unlike MEE6/Dyno/Carl-bot which rent preset features per server.

---

## 3. Pricing & packaging

> LOCKED v1 tiers (D-009, 2026-09-07). No per-token meter visible to users — pooled allowances + refill packs instead.
>
> | Tier | Price | Bots / servers | AI allowance (pooled) |
> |---|---|---|---|
> | Free trial (NO CARD — signup with Discord only, card asked ONLY at paid upgrade) | $0 for 3 days | 1 bot / 1 server, full Pro features | 100 credits / 3 days (token-indexed: run ≈ 1.1 cr, msg ≈ 0.075 cr); day 4: pay or bot sleeps (data 12 mo, wake on upgrade, NEVER deleted) |
> | Pro | $10/mo | 2 bots / up to 5 servers | 2000 credits/mo (~1800 builds or ~26k replies) |
> | Studio | $29/mo | 8 bots / up to 100 servers (HARD CAP — no unlimited: resale/abuse overload risk) | 6000 credits/mo |
> | Scale $100 | $100/mo (POST-LAUNCH — caps locked D-033, not at launch) | 20 bots / 200 servers | 20,000 credits/mo, hard cutoff, no rollover |
>
> Refills: $5 pack = 1000 credits (90-day expiry). Soft-cap: AI pauses, bot stays online — never surprise bills. Trial end falls back to sleep (12-mo data keep, wake on upgrade). Anti-farming: 1 trial per Discord account + rate limits. Credits pegged to token cost (formula moves if model price moves); dashboard shows human translations ("≈1800 builds"), never raw tokens. Trial is app-owned: no Creem subscription exists during the trial (Creem-managed trials require a card — verified D-034); the card is collected only at the paid-upgrade checkout.
> Credits burn ONLY on AI work: builder runs (≈1.1 cr) + AI persona/chat replies (≈0.075 cr) + image gen. Normal bot actions (welcome messages, reaction roles, automod kicks, XP, tickets, logs) cost ZERO credits — no AI call involved. Same split as the competitor (their templates/running free; only builder + persona + image metered).
> Starting allowances are provisional — founder directive 2026-09-07: revisit ALL credit numbers against real usage data after launch (current ones may be generous); K3 guards the downside meanwhile.
> Music/YouTube (D-015): NO ready-made template (legally fraught) — but builder CAN construct music behaviors on request; YouTube source labeled fragile. Competitor HAS a music template (Pro-only); we match capability, not the template card.
> Template marketplace (D-015): V2 — users publish bot templates free or priced in credits (e.g. 100 cr -> seller account), platform fee ~30%, curation gate before listing, verified-purchase reviews only.
> Anti-abuse: per-bot cgroup caps + fleet-wide guild counters + no-resale Fair-Use terms + graduated enforcement (warn -> throttle -> sleep -> suspend). Full control list: infra research §3.
> V2 exploration (NOT committed): user-to-user bot selling system (users sell bots they built). Needs fraud/support/Discord-ToS review first — recorded here so it isn't forgotten, not scheduled.

> Price bands re-confirmed against first willingness-to-pay signals at validation read (founder review scheduled with trial data).

---

## 4. Kill criteria (when to stop)

> LOCKED K1 (D-013, founder-set 2026-09-07): median OUR cost/builder-run > $0.50 after 30 eval builds → STOP and re-scope the builder before Pro launch.
> LOCKED K2/K3 (D-032, founder-signed 2026-09-09, re-validated live on GLM 5.2 economics): K2 = measured infra/bot/mo > $1.50 at 100+ bots on shared runtime → no 3-day trial expansion, no sub-$10 plan until re-architected. K3 = realized Pro margin < $3.00/mo at medium-ish use over any 4-week cohort → reprice to $15 or halve allowance within 2 weeks. BINDING CONDITION (V1-2 builds it): K3 is measured on accrued live provider cost (`totalcost`), never the fixed credit table, and never on cash while the $170 prepaid balance lasts. (Numbers in `Marketing/corvus-model-and-pricing-2026-09-07.md §5`.)

---

## 5. Scope locks

> LOCKED 2026-09-07 (D-009): NO unlimited-servers tier at any price until abuse controls are battle-tested (resale + overload risk). No in-server setup (panel-only, privacy). No global slash commands default (guild-only, Discord-imposed 1h propagation). V1 = 9 items in `Marketing/corvus-model-and-pricing-2026-09-07.md §6`; Never-list enforced.

> Scope boundaries live in the Never-list (`Marketing/corvus-model-and-pricing-2026-09-07.md §6`) + D-006/D-009/D-015. Rule: a new scope item enters only by removing one (founder-approved swap).

---

## 6. Competitive landscape

> Research record (2026-09-07): full teardown in `Marketing/vibebot-deep-research-2026-09-07.md`. Benchmark = Vibebot (vibebot.gg, Feb 2026, ~$1,666 MRR / 175 subs, Lite $5 / Pro $10). Closest comps: BotGhost (flat $10/mo, yearly $5 eff.), Nexus getnexus.me (flat €5/15 srv), Kite ($0 open source), BotNinja ($5/bot), MEE6 ($11.99/server), Dyno (~$4.99), Carl-bot ($7.99). Founder decision on wedge/scope still open — do NOT treat this note as locked strategy.

> One reason to pick us: the bot is yours (own app, free export, sleep-not-delete) and manageable without code (panel interview, simulator, pre-flight, rollback) — vs rented preset features per server. Evidence file: `Marketing/vibebot-deep-research-2026-09-07.md`.
