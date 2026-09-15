# Vibebot Deep Research — for Corvus (2026-09-07)

## Status: LIVE (research record)

> Wave 1 (6 agents) + Wave 2 (5 agents), all live fetches on 2026-09-07. No memory used.
> Founder summary (Turkish) was given in conversation. This file is the exhaustive AI-facing record.
> Single source of truth for: sitemap, features, pricing, AI models, buyer pains, engineering critique, gaps.

---

## 1. Subject snapshot

- **Product:** Vibebot (vibebot.gg) — "describe your bot, AI builds and hosts it." Prompt -> Discord.js v14 code -> 1-click cloud hosting inside the user's own Discord application.
- **Positioning:** "something you build, not something you rent." One bot replaces a stack (MEE6, Dyno, Carl-bot, Ticket Tool, Jockie Music).
- **Pricing:** Trial 3-day full Pro (card required, $1 check -> credits, auto-charge $10/mo). Lite $5/mo ($50/yr, $5 credits ONE-TIME). Pro $10/mo ($100/yr, $10/mo credits, non-rollover). Extra bot +$5/mo each. Credits $7.50/1M in + $37.50/1M out (trial $3.30/$16.50). Top-up min $10, auto-reload $10 when <$2. Source export $100/export. Fix My Bot $200 flat. Stripe. Claims 14-day money-back (contradicts Terms, see §9).
- **Business (TrustMRR, Stripe-verified, synced 2026-09-07):** ~$3,385 last 30d (+41.0%), MRR ~$1,666 (+30.7%), 175 active subs, all-time ~$8,614. Monthly: Feb $10 / Mar $220 / Apr $225 / May $445 / Jun $1,353 / Jul $2,418 / Aug $3,046 / Sep partial $833. Small but alive, growing on small base.
- **Founding:** product Feb 2026 (domain 2026-01-11, first $ Feb 2026, X born May 2026, public push Jun 2026). TrustMRR "Feb 2019" = studio date reuse, do NOT cite as product age.
- **Founder:** Fadi Mamar, Toronto, Canada. MAMAR GROUP LTD (inc. 2018-04-06). Solo-builder evidence; TrustMRR claims 2-5 people, bootstrapped (unverified). No co-founder named.
- **Self-claimed scale (UNVERIFIED, treat as marketing):** 2,500+ servers, 5,000+ builders, 4.9/5 from 200+ reviews, 127 bots today, 39 templates, 13 integrations. Verifiable reality: 1 top.gg review, 6 servers listed, 0 Trustpilot, 0 Reddit threads, X 11 followers, Discord ~120 members.

---

## 2. Sitemap (exhaustive, fetched 2026-09-07)

Sources: `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/robots.txt`, footer/nav crawl. Disallowed: `/api/`, `/dashboard/`, `/admin/`, `/teams/`. AI crawlers explicitly allowed (GPTBot, ClaudeBot, PerplexityBot, etc.).

- **Core:** `/`, `/pricing`, `/about`, `/contact`, `/affiliate`, `/ai-discord-bot-maker`, `/ai-instructions` (+`.md`), `/changelog` (EMPTY), `/status` (thin loader; real `status.vibebot.gg`), `/status/discord`, `/discord-bots` (22-type directory), `/discord-bot-hosting` (BYO $5/mo), `/discord-server-maker`, `/discord-server-tags`, `/fix-my-discord-bot` ($200), `/vs-heroku`, `/vs-railway`, `/vs-replit`, `/llms.txt`, `/llms-full.txt`, `/de/*` (German funnel: bot-erstellen, musik, moderation, server-vorlagen).
- **Header nav (only 3 items):** logo `/`, How it works `/about`, Pricing `/pricing`, Get Started button `/login?callbackUrl=/dashboard`.
- **Footer (6 columns):** Product (11 links), Resources (19: docs, status, guides, 3 compares, 9 alternatives, tags, bots, tools, templates, maker), Company (5), Hosting (5), Free Tools (19 of 21 — omits invite-checker + vanity-checker), Legal (4: terms, privacy, cookies, dmca). Plus X, Discord `discord.gg/sZd8bMbgQk`, Stripe Climate, mamar.ca credit.
- **Features (31 pages):** `/features` hub + hosting, music, moderation, ai-chatbot, translator, tickets, giveaways, economy, leveling, welcome, verification, birthday, counting, reaction-roles, application, reminder, twitch, youtube, roblox, minecraft, auto-role, rpg, fortnite, text-to-speech, userphone, gta, fivem, gta-6, custom-commands, logging, starboard. Hub counters render broken `0+ Active Bots / 0+ Servers / 0.0% Uptime`.
- **Templates (`/builders`):** 19 marketing cards rendered (hero claims 39 = behavior builders per docs). Top uses: AI Chat Persona 4,500+ (5.0), AI Community Helper 4,200+ (5.0), AI Assistant 3,500+ (5.0). Lowest: VIP Manager 540+ (4.8). All cards -> login. 7 POPULAR badges.
- **Compare (3):** vibebot-vs-mee6, vs-dyno, vs-carl-bot. Framing: "the bot you own vs the bot you rent."
- **Alternatives (hub + 9):** mee6, dyno, carl-bot, wick, botghost, mudae, fredboat, sapphire, tupperbox. Each ends "Describe it -> VibeBot writes + hosts it."
- **Free Tools (21 live, footer shows 19):** timestamp, text-formatter, embed, colors, username-generator, avatar-downloader, bio-generator, font-generator, server-layout, rules-generator, colored-text, server-name-generator, invite-checker (unlisted), vanity-checker (unlisted), id-lookup, emoji-downloader, emoji-maker, pfp-maker, banner-resizer, banner-downloader, server-icon-downloader. Hub copy: "No login, no rate limits, no ads."
- **Server Templates (14):** gaming, community, friends, study, streamer, art, aesthetic, support, dating, grow-a-garden, anime, roleplay, fivem, gta-6.
- **Docs (17 pages):** hub + getting-started, quick-start, first-bot, building, ai-chat, ai-persona, builders (39-template reference), behaviors, triggers-actions, deployment, discord-token, deploying, inviting, billing, credits, troubleshooting. NO dates on any page. NO API reference.
- **Blog (30 posts):** roundups (best-bots-2026, moderation, music, gaming), setup guides, MEE6-pricing-explained (2026-08-01), 8 competitor-alternative posts (Arcane, Invite Tracker, ProBot, Mimu, Ticket Tool, Dank Memer, Nekotina, Loritta). Authors: Alex Chen, Sarah Martinez, Marcus Thompson/Johnson, Emily Rodriguez, David Kim (DEV byline for gotchas post is FADI MAMAR — stock-persona pattern).
- **`/guides`:** visual examples hub (4 community archetypes with mocked Discord embeds + 4 bundle templates), NOT article list. No video anywhere on site.
- **Legal:** `/terms` + `/privacy` (both Last Updated 2026-01-17), `/cookies`, `/dmca`.
- **Plan gates per feature:** music = Pro-only. AI Builder + AI Agents (moderation/music/tickets) = Pro-only. Everything else (tickets standard, giveaways, economy, leveling, welcome, verification, birthday, counting, reaction-roles, application, reminder, twitch/youtube/roblox/minecraft/auto-role/rpg/fortnite/tts/gta/fivem/gta-6, custom-commands base, logging, starboard, translator template, userphone) = all plans, BUT persona/translator/AI answers spend wallet credits on any plan.

---

## 3. Pricing teardown — cheap or expensive?

All prices fetched 2026-09-07.

| Rival | Free | Cheapest paid | Per-server? | Annual | Refund |
|---|---|---|---|---|---|
| MEE6 | limited free, no card | $11.99/mo/server (promo $5.99 1st mo, $24.99 1st yr, lifetime $44.99) | per-server | yes | 7-day (14 EU/UK) |
| Dyno | generous free, no card | ~$4.99/mo 1 srv; $11.99/3 srv; $14.99/5 srv | tiered by count | save 2 mo | none found |
| Carl-bot | generous free (250 roles), no card | $7.99/1 / $12.99/2 / $16.99/3 / $24.99/5 / $35.99/8 per mo | tiered by count | -17% Patreon | none found |
| BotGhost | free 1 bot/5 srv, no card | Single $10/mo ($5 eff. yearly); Unlimited $20/mo ($10 eff.) | FLAT per-account | -50% yearly | 7-day web-only |
| Nexus (getnexus.me) | free 1 srv, no card | Pro €5/mo (15 srv); Agency €10/mo (inf srv) | FLAT, "no per-server fees" | -20% yearly | cancel-anytime |
| BotNinja | free sleep-relay, no card | Always-on $5/mo per bot | per-bot | unknown | unknown |
| Kite | 100% FREE open source (10 bots x 100 srv) | $0 | flat-free | n/a | 14-day (moot) |
| Bottie.io | DEAD domain 2026-09-07 | unknown | — | — | — |

Scenario maths (monthly, list prices):
- **1 server:** Vibebot Pro $10 vs MEE6 $11.99 (saves $2) vs MEE6-stack $24.97 (saves $15, -60%) vs BotGhost $10 (parity) vs Nexus €5 (~$5.4, LOSES +85%) vs Kite $0 (loses).
- **3 servers:** Vibebot 1-bot $10 (or 3 branded bots $20) vs MEE6 x3 $35.97 vs stack tier-optimized $64.95 vs BotGhost $10 vs Nexus €5.
- **10 servers:** Vibebot 1-bot $10 vs MEE6 x10 $119.90 vs stack ~$198.86 vs BotGhost $10-20 vs Nexus Agency €10 (~$10.8) vs Kite $0.
- Vibebot 10 separate branded bots = $55 (loses to BotGhost Unlimited $20, Nexus Agency €10).

Verdict: Vibebot is CHEAP vs legacy per-server stacks (MEE6/Dyno/Carl at 2+ servers), PARITY vs BotGhost monthly, EXPENSIVE vs Nexus flat (€5), vs yearly BotGhost ($60/yr vs $100/yr), vs all free tiers ($0), and CONFUSING (Lite $5 one-time credits then $10-min top-ups; Pro non-rollover; $100/export toll; 1-bot-$10 vs 10-bots-$55 ambiguity). Their "$24.96 -> $10" stack math is arithmetically correct ($11.99+$4.99+$7.99=$24.97) but cherry-picked: monthly list, 1 server, light AI use, no promos/annuals/free tiers, unnamed 4th bot.

---

## 4. AI models (vendor claims, confidence labeled)

- **Codegen / Bot Builder:** claimed `Claude Sonnet 4.6` writing Discord.js v14 + sandbox linter + auto-fix + hot-reload (`/ai-discord-bot-maker`, 4 mentions). CONFIRMED as marketing claim; runtime unverifiable. Price sanity: Sonnet 4.6 list $3/$15 per 1M; Vibebot meter $7.50/$37.50 = exactly 2.5x both legs (margin-consistent, proves nothing).
- **Personas / chat:** DRIFT — marketing says Gemini 2.0 Flash, docs (`/docs/building/ai-persona`) say Gemini 2.5 Flash, feature page says generic "Google Gemini" + BYO OpenAI key. Gemini 2.5 Flash list $0.30/$2.50 (2.0 Flash $0.10/$0.40); uniform $7.50/$37.50 meter = 25x/15x over 2.5 Flash. Either extreme persona markup or personas run on bigger model. BYOK: one marketing sentence, no setup docs, unknown if it bypasses meter.
- **AI Moderation/Ticket agents, image gen:** model unnamed (unknown). Image gen spends credits at unknown rate.
- **Safety:** docs say Gemini filters always-on non-disablable; feature page says "configure strictness per channel" (contradiction — likely threshold-tunable, never off). Persona memory: 30-day auto-delete + rolling window (cost grows with thread length, 1c minimum/response, no documented cap control).
- **Credit economics (consistent across 4 pages):** spends = Builder + persona + image gen only. Free = templates, edits, running, deploys. Grants: trial $1/3d, Lite $5 once, Pro $10/mo reset no-rollover. Trial token rate $3.30/$16.50 (2.27x further — arithmetic holds). $0 = Builder stops, bots keep running. Per-run price + session banner shown (good; move it pre-run for Corvus).

---

## 5. Buyer pains (31 buyer : 24 seller voices, 56% buyer)

Vibebot itself: ZERO buyer-voiced reviews found (no Reddit, no Trustpilot, 0 directory reviews; only 1 top.gg review by s0ggy, 6 servers listed). Category-wide (MEE6/Dyno/Carl/BotGhost/music), ranked for non-coder ICP:

1. **Per-server paywall creep (CRITICAL):** "now everything on Mee6 is locked behind a paywall... Everyone bans it" (r/discordapp). "ESSENTIAL modules will stay free... then put MODERATION behind the paywall" (r/discordbots 2025). MEE6 $11.95-11.99/mo/server, ~$89.90/yr, no refunds historically (now 7-day). 3 servers ~= $360/yr. top.gg MEE6 score 2.6.
2. **Multi-bot sprawl (HIGH):** 4-5 dashboards, overlapping jobs, cross-bot raid conflicts ("spent an hour figuring out which bot was blocking what"). Removal = data loss (XP, warnings, transcripts).
3. **Setup = permissions + hierarchy hell (CRITICAL):** Discord 50013 errors, silent fails, "configured-but-disabled" modules. r/carlbot frontpage ~= 100% setup help. 800-word Dyno reaction-role failure post. Non-coders cannot diagnose.
4. **Fragility: offline + music death (HIGH):** Groovy (Aug 30 2021) + Rythm (Sep 15 2021) killed by YouTube C&D (250M + 560M users). MEE6 outages Jul-Sep 2026 tracked. Non-coder wakes to unmoderated server, no fallback.
5. **Spammy bot behavior + pay-to-win (HIGH):** MEE6 unsolicited DMs + unmutable AI mentions; Dank Memer inflation/TOS issues. Reputational damage owners can't code away.
6. **No-code builders still too hard/brittle (CRITICAL for ICP):** BotGhost TrustScore 2.4 Poor (63% 1-star, n=19): "no support... possibilities very limited... marketplace features break after $100." Non-coder stranded when blocks fail.
7. **Token/hosting/security fear (HIGH):** "paste your token" + Replit leaks + one screenshot = full bot takeover (ban/nuke/read privates).
8. **Keyword automod false positives + trivial evasion (MED-HIGH):** "grass/Scunthorpe/class assignment" deletions; "a1rdrop" bypasses. Non-coders can't write regex.
9. **Tickets: retention windows + permission collisions (MED):** Ticket Tool free transcripts 30d; glitch "every member gets put in the ticket chat"; video/audio never archived.
10. **Distrust: acquisitions, dismissive support, review gaming (MED, purchase-blocking):** Carl/MEE6 -> BotLabs/BlueStacks; MEE6 Trustpilot "unsupported review methods... hasn't replied to negatives"; "changing terms without notice."

Vibebot SOLVES (if claims true, all seller-claimed): per-server multiply, sprawl, setup time, hosting toil, FAQ deflection. IGNORES: music legality, automod quality numbers, resilience proof, hierarchy physics, trust proofs. CAUSES: AI-brittleness non-coders can't audit, trial-to-paid trap risk, inflated social proof as lie signal, 473-member support bottleneck, single-bot blast radius (one outage/leak nukes everything).

---

## 6. Engineering critique — what Vibebot did badly (severity for non-coders)

1. **(5) Raw token paste onboarding.** Token = password, pasted into third-party dashboard. CORVUS: OAuth2 install flow, secret never leaves Discord, KMS vault, one-click rotate + leak-state recovery.
2. **(5) Administrator (permissions=8) default invite**, scope-down left manual — contradicts their own blog warning. CORVUS: least-privilege scopes computed from enabled behaviors + human-readable permission card.
3. **(5) Bot OFFLINE during entire builder session.** Editing = downtime. CORVUS: staging/preview instance + atomic blue/green cutover; prod never goes offline to be edited.
4. **(4) Redeploy required for template edits; builder edits publish to live with NO versioning** (version history = templates only; AI mistakes fixed by re-prompting = more credits). CORVUS: versioned immutable builds + draft/preview/publish/rollback for everything.
5. **(4) Privileged intents (Members + Message Content) required for every bot**, silent empty-string failures. CORVUS: per-feature intent requests, slash-first, pre-flight gate with deep links.
6. **(3) Slash commands up to 1h to register**, shipped as "wait and hope." CORVUS: guild-scoped instant registration in staging, per-command sync state in UI.
7. **(3) Deploy "usually <1 min" but silent 15-min timeout**, no progress. CORVUS: phase-labeled progress, 3-min cap, auto-rollback to last-good + plain reason + one-click retry.
8. **(4 agg.) Eight Discord gotchas as user problems, not platform checks** (50013 hierarchy, 10062 3-sec interaction race vs LLM latency, silent intents, partials, ephemeral tokens, duplicate gateway sessions + 1000/day limit, per-route rate limits). Their own gotchas post proves production pain; mitigations live in a blog, not the build path. CORVUS: bake all eight into pre-deploy checks with plain-language fix cards ("I couldn't kick @X because my role sits below theirs").
9. **(4) "Export anytime / 100% ownership" vs $100/export toll.** CORVUS: exit price in the same sentence as ownership claim; free export in paid tiers.
10. **(3) Docs drift as defect factory:** Gemini 2.0 vs 2.5, 39 vs 22 vs 37/38 templates, hot-reload vs offline+redeploy, trial no-card vs card-required, DE music-free vs EN Pro-only, Terms "Free, Pro" tiers that don't exist. CORVUS: docs-as-code from single config, CI drift assertions, changelog-required merges.
11. **(2) Discord-OAuth-only login** — one key, no recovery, no team seats/audit. CORVUS: OAuth start + recovery email + owner/editor/viewer roles + builder audit log.
12. **(3) Metering punishes the core loop** — failed builds billed, vague prompts "waste credits," Lite $5 one-time, trial $1/3d. CORVUS: free retries on platform failures, fixed-price quotes pre-build, renewing allowance on all paid tiers, hard caps, auto-reload OFF by default.

Fragile bets: (A) YouTube music via WARP proxy + yt-dlp 12h updates — EXTREME legal fragility (Groovy/Rythm precedent: lawyer letters, not detection, killed them). CORVUS: don't headline YouTube; licensed/tolerant sources first; label YouTube "fragile, may break." (B) Gemini filters always-on — MED-HIGH product fragility (false positives on trash-talk/RP/non-English 1-in-6 users, zero recourse). CORVUS: tunable sensitivity + allowlists + transparent block/appeal + human review before actions. (C) Single-model codegen named in marketing — HIGH (price/deprecation/drift; rename = marketing+FAQ+prompt edits). CORVUS: model-agnostic interface, pinned evals, dual-vendor readiness, never name models in user copy.

Trust-engineering gaps: empty changelog; 99.9% "SLA/guaranteed" disclaimed by Terms §7.1 (no remedy); JS-only status page; "SOC2-ready" without audit; no WCAG statement; CA-law + AAA arbitration for a Toronto corp + chargeback=ban language; no-refunds Terms vs 14-day money-back marketing; $1 trial described 4 incompatible ways.

What they did WELL (copy): per-bot isolated containers + heartbeat/auto-restart; sandbox linter + auto-fix gate (mutation-prove it, publish catch rate); per-run price display (move pre-run); public gotchas writeup (turn each into an automated check); templates-free + AI-metered segmentation (add versioning to the safe path).

---

## 7. Contradictions registry (19 pairs, all verified live 2026-09-07)

1. Templates 39 (`/`, `/pricing`, docs) vs 22 (homepage FAQ, `/discord-bots`) vs 19 cards (`/builders`).
2. Integrations 13 (`/`, `/pricing`) vs 21 (`/llms-full.txt`).
3. Trial "no card" (`/compare/*`, `/discord-bots`) vs card-required (`/pricing`, docs).
4. Trial $1 credits vs trial token rate $3.30/$16.50 (same $1, different amounts).
5. Trial expiry auto-charge vs "stopped after 7-day" + 3-day vs 7-day.
6. Extra bots any-paid-plan vs Pro-only (`/llms-full.txt`).
7. Export anytime/included vs $100/export vs "No, not available" (`/llms-full.txt` FAQ).
8. 14-day money-back (`/pricing`, `/llms.txt`) vs No Refunds §4.7 (Terms).
9. Tools 21 (hub/sitemap) vs 19 (footer) vs "All 6" (`/llms-full.txt`).
10. Server templates 8 (`/llms.txt`) vs 14 live.
11. Music "included on free plan" (same page body) vs Pro-only (same page FAQ + pricing + docs).
12. Affiliate title "Earn 30%" vs body 15% everywhere.
13. Social proof 5,000/2,500/4.9/127 vs `0+ Active Bots / 0+ Servers / 0.0% Uptime` (`/features`).
14. AI models: Gemini default+BYO vs GPT-4/Claude (`/discord-bots`) vs GPT-4/3.5 (docs/llms-full).
15. Auto-reload <$5 (`/llms-full.txt`) vs <$2 (`/pricing`, docs).
16. Lite $5 one-time vs implied recurring phrasing.
17. Terms tiers "Free, Pro" vs actual Trial/Lite/Pro + "no free tier."
18. Analytics 3-day trial retention vs Standard(Lite)/30-day(Pro).
19. "100% ownership forever" vs Terms-governed + export fee + 30-day deletion.

---

## 8. What Corvus will do better (attack list)

ENGINEERING (ranked): 1. OAuth install, zero token paste, least-privilege scopes. 2. Staging + atomic publish + one-click rollback. 3. Eight gotchas as automated pre-deploy checks. 4. One refund policy + one trial card + exit price on pricing page. 5. No YouTube headline; tolerant sources first. 6. Model-agnostic + pinned evals + tunable safety. 7. Real server-rendered status + honest SLA with auto-credits. 8. Docs-as-code + CI drift checks.
EASE (ranked): 1. Zero-Portal onboarding. 2. Template-first, builder-second. 3. Pre-deploy readiness gate. 4. Least-privilege invite. 5. Staging/instant preview. 6. Guided intent + hierarchy visuals. 7. Plain-language error cards for all 14 failure modes. 8. Pre-run quotes + caps + context meter.
PRICING: 1. Flat multi-server under $10, AI included no per-token meter (e.g. $8 flat, 3 bots). 2. Free export. 3. No-card free tier (1 bot, sleep-after-idle). 4. Rollover credits or flat allowance ("unused AI doesn't evaporate"). 5. 2nd+ bots $3 (5-pack $12).
TRUST/GTM: hierarchy pre-flight that speaks human; permanent free transcript vault; one-click false-positive repair ("Never flag THIS again"); zero-token architecture published; verified-review escrow (14+ days live, all stars published, 1-star replied <48h); 2 builds/week YouTube + r/Discord_Bots answers + top.gg templates + Product Hunt (channels Vibebot ignores); show-don't-tell 60-sec build replays + remixable gallery.

---

## 9. Open unknowns (need product access or later research)

Dashboard/builder reality (composer, chips, version panel, analytics, logs); real largest-server scale; persona per-message economics at scale; annual proration; failed-renewal grace beyond trial; regions; Presence-intent breakage; export contents/license; affiliate live users; churn/trial conversion/plan mix; LLM routing/fallbacks/prompts; music stack (ffmpeg?); incident history; team identities; reason for TrustMRR 2019 date + US-vs-Canada mismatch.

## 10. Sources (all accessed 2026-09-07 unless dated)

vibebot.gg: `/`, `/pricing`, `/about`, `/features` (+31 subpages), `/builders`, `/compare/*` (3), `/alternatives/*` (9+hub), `/tools` (+21), `/server-templates` (+14), `/docs` (+17), `/blog` (30 posts), `/guides`, `/contact`, `/affiliate`, `/ai-discord-bot-maker`, `/ai-instructions` (+`.md`), `/discord-bots`, `/discord-bot-hosting`, `/discord-server-maker`, `/discord-server-tags`, `/fix-my-discord-bot`, `/vs-heroku|railway|replit`, `/llms.txt`, `/llms-full.txt`, `/robots.txt`, `/sitemap.xml`, `/terms`, `/privacy`, `/changelog` (empty), `/status`, `status.vibebot.gg`, `/de/*`. TrustMRR: `/startup/vibebot-gg` (+`.md`), `/founder/vibebot_gg`. Operator: `mamar.ca`, `x.com/vibebot_gg`, `dev.to/mamar`, `dev.to/vibebot/...`, `federalcorporation.ca/corporation/10721174`. Reviews: `scoutforge.net/apps/vibebot` (2026-06-10, 86/100), `aijourn.com/...` (2026-07-06), `altoptools.com/tool/vibebot` (2026-03-03, 0 reviews), `aiagentsdirectory.com/agent/vibebot`, `thehiveindex.com/communities/vibebotgg`, `top.gg/bot/1459972025270669362` (VibeBot 5.0 n=1) + MEE6/Carl-bot/Dyno listings, `trustpilot.com/review/mee6.xyz` (7,134 reviews, bias banner) + `/botghost.com` (2.4, n=19), `saashub.com/vibebot`. Buyer threads: r/discordapp (190j3s9, 19dppos, 10n4vee, 183gvqh, 172s9cf, 1bzfxd9, 16yvq4k, z44bx5, 14mphf6, z4fan1, wtvy08, sf5kgw, 8fz87p, jhbvc7, gwmxmk), r/discordbots (1k2gakg), r/carlbot (frontpage, 16g4v10), r/Discord_Bots (1do8mjr), r/discord101 (w92ao3), r/Mee6 (anwcka), r/Dynodiscord (1dfn3fo), r/TicketTool, r/dankmemer (l7frto), change.org Dank petition, StatusGator MEE6 (2026-09-05), MEE6 status history, `thehowleronline.org` (2021-10-06), `nme.com` (2021-09-14), `theverge.com` (2021-08-24). Pricing: `mee6.xyz/en/premium`, `help.mee6.xyz` (refund 2026-07-28), `dyno.gg/premium`, `docs.dyno.gg/en/premium`, `patreon.com/carlbot` (2025-06-11), `botghost.com`, `getnexus.me`, `botninja.ai`, `kite.onl` (+`/refund`). Model pricing: `ai.google.dev/gemini-api/docs/pricing`, `aicostcheck.com`, aggregators for Sonnet 4.6 ($3/$15). Traffic: `aitoolnet.com/vibebotgg` (28.4K visits, 77% organic), `turbo0.com/item/vibebotgg`, `seohive.io/proof?site=vibebot.gg`.
