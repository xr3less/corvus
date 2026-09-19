# 08 — Core Pipeline / Workflow

## Status: DRAFT (filled 2026-09-07, locked D-006/D-007)

> **DRIFT (2026-09-19, KI-031):** §1 glance is the worst lie in the docs — it still describes Discord.js codegen + a sandbox gate. Runtime is spec-as-data (D-012): builder writes fenced JSON, `parseSpec` stores it, sandbox is not built, gateway does **not** interpret `prod_spec` yet. Stage 2 body is closer to truth than the glance. Do not implement from §1. Detail: `Teknik_Borc/KI-031_docs-stale.md`.

> The heart of the product: the main workflow that turns a user's input into the output they value, step by step. (Rename this doc to match the product if helpful, but keep the `08` number.) Document each stage so a reader without code access understands exactly how the product works end to end.

---

## 1. The pipeline at a glance (plain language)

> LOCKED direction (D-005, D-006, 2026-09-07): the user describes the bot in plain English; Corvus turns it into a versioned behavior spec, generates Discord.js code with GLM 5.3 Flash, checks it in a sandbox, lets the user simulate + test in a test server, then publishes to the live server — and the user manages everything from the Corvus dashboard afterward. Full economics + V1 scope: `Marketing/corvus-model-and-pricing-2026-09-07.md`.

```
user words -> [ behavior spec (versioned draft) ] -> [ AI codegen (GLM 5.2 on wiro; Flash after balance) ] -> [ sandbox gate (lint + auto-fix, broken never ships) ] -> [ simulate + test guild ] -> [ pre-flight scan (Red blocks publish) ] -> [ publish ] -> live Discord bot (+ dashboard manage: edit, logs, analytics, rollback)
```

---

## 2. Stages

One subsection per stage: input, output, mechanism, failure handling.

### Stage 1 — Describe (PRIVATE panel interview + templates)

- **Input:** plain-English answers in a private dashboard interview (NOT in the user's server — a 100k-member server must never see setup chatter), or 1 of 8 v1 templates as starting point.
- **Output:** a versioned behavior-spec draft (never touches the live bot).
- **How:** conversational panel flow ("Which channel for welcomes? #..." with channel picker), written for non-technical owners; template fork = spec copy; AI proposes spec-patches with human Accept/Reject diff.
- **Failure modes:** vague answer -> follow-up question + fixed-price quote before building; no silent live writes.
- **Cost:** ~1.1 credits/run via router (provider-reported totals reconcile the meter; $0 while wiro balance lasts).

### Stage 2 — Build (codegen + persistent state + self-healing runtime)

- **Input:** approved behavior-spec draft.
- **Output:** tested bot revision + migrated user data, running under supervision.
- **How:** builder lane (wiro `glm/5-2` per D-026; Flash off-wiro after balance) drafts versioned behavior-spec patches (fenced JSON, parseSpec-validated; brief-to-draft worker with ai_spend metering, D-128); sandbox lint/auto-fix gate OPEN (not built); per-bot PERSISTENT database (XP, warnings, economy balances, configs) that survives restarts, updates, and redeploys — data loss on restart is a launch-blocking defect class (founder directive D-007, proven by Wave C kill/storm tests); supervised runtime catches errors silently, retries/fixes in background, restarts without downtime — the user never sees a technical stack trace and never pays for platform-failure retries.
- **Failure modes:** empty provider response -> free retry (not billed); billable response, even unparseable -> spend recorded + run failed honestly (D-128); runtime error -> silent catch + fix + resume, plain-language notice only if user action needed; restart -> state reloaded from persistent DB, zero XP/record loss.
- **Cost:** covered by allowance model; platform failures cost the user $0.

### Stage 3 — Preview (live demo window + simulator, pre-install)

- **Input:** staged bot revision.
- **Output:** buyer confidence BEFORE install.
- **How:** (a) public fake-Discord window on our site: visitor messages a scripted demo brain with honest preview labeling and watches replies in real time (conversion driver, D-007; AI persona + live discord.js hosting arrive later, V1-5 ships the prototype); (b) private draft simulator + test-guild trial for owners.
- **Failure modes:** demo sandbox isolated from prod; abusive demo use rate-limited; demo resets hourly.

---

## 3. Sync vs background processing

Builder runs + deploys are ASYNC with live progress (queued → generating → syncing → live) and explicit timeout copy — the user watches, never wonders. Persona chat is SYNC (reply in seconds). Discord's 3-second interaction rule is met by defer-first code (ACK immediately, work async, PATCH followup) — recorded in D-016-adjacent gotcha handling, never left to model output.

---

## 4. External providers / models

> Costs verified live 2026-09-07; swap risk handled by the provider ROUTER (D-021) — no provider SDKs anywhere, so swapping is config, not rewrite.

| Provider                             | Used for                                                    | Cost                                                  | Lock-in if swapped                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| wiro.ai gateway                      | builder (glm/5-2) + persona (grok-4-1-fast) + standby lanes | $170 sunk ≈ 3,400 realistic builds; then PAYG per run | none (OpenAI-compatible baseURL+key)                                                                                                     |
| OpenRouter / api.z.ai                | GLM-5.3-Flash route                                         | ~$0.0055/run list                                     | none (same interface)                                                                                                                    |
| DeepSeek direct                      | cheapest fallback ($0.14/$0.28)                             | per run                                               | none                                                                                                                                     |
| Anthropic direct                     | Sonnet quality fallback                                     | $3/$15 conservative                                   | none                                                                                                                                     |
| Creem.io (MoR)                       | subs + refill packs + trials                                | 3.9% + $0.40/txn                                      | MEDIUM — customer records live there; export before any move; Paddle hot backup                                                          |
| Contabo (interim) / Hetzner (target) | compute                                                     | ~€5.50 / ~€9/mo                                       | LOW — Compose re-deploy migrates                                                                                                         |
| Discord                              | OAuth + gateway + invites                                   | $0                                                    | PLATFORM RISK (not lock-in): intents policy, 1h global command propagation, token-ban blast radius — mitigated per D-016 gotcha handling |

---

## 5. Limits & quotas

- Credits: trial 100/3 days/1 bot; Pro 2000/mo (2 bots/5 guilds); Studio 6000/mo (8 bots/100 guilds). Refill $5 = 1000 (90d expiry). Monthly reset, no rollover. Soft-cap: AI pauses, bot stays online.
- Fleet: 101st guild invite auto-leaves with upsell DM (anti-resale gate, D-009). Per-bot cgroups (0.25 vCPU, 256MB free / 512MB paid) + Discord token-bucket passthrough + 429-storm quarantine.
- Demo window: rate-limited per IP, hourly reset (abuse control, D-007).
- Discord-imposed: global commands ≤1h propagation (guild-only default avoids it); sharding forced >2,500 guilds/bot (fleet never hits per-bot; multiplex math watched).
