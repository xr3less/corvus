# 00 — START HERE

> **This is the map. Read this first — whether you are a human or an AI agent.**
> Everything else hangs off this file. If a doc is not listed here, it is not canonical.

> **This is a reusable documentation template.** Copy this whole folder to start a new project, then fill in the project-specific blanks marked `{{...}}` and the `> TODO` markers. The `Governance/` files and this map carry over unchanged; the numbered `01`–`10` docs are project-specific skeletons you fill per project. **To start a new project, read `HOW_TO_USE_THIS_TEMPLATE.md` first** (the 10-step checklist).

> **Started from template version:** `v1.3.0` — stamped 2026-09-07 for project Corvus.

---

## What is this project?

Corvus is an AI Discord-bot builder for non-coder server owners: describe the bot in plain English in a private panel, get a live bot you own and manage from one dashboard — no code, no token paste, no per-server rent.

**Working codename:** `Corvus`
**Final product name:** Corvus (decided 2026-09-07).

---

## The Prime Directive (read before doing anything)

> **Never bill the user for our failures; never lose their data; never make them paste a secret.**

Every plan, every doc, every agent task is judged against this directive. See `03_validation_plan.md` and `Governance/GLOBAL_RULES.md`.

---

## How to navigate (reading order for a fresh agent)

1. **`00_START_HERE.md`** (this file) — the map + authority chain.
2. **`Governance/GLOBAL_RULES.md`** — the founder's non-negotiable principles + how to behave. **Always read this.**
3. **`Governance/AGENT_CONSTITUTION.md`** — orchestrator/sub-agent model, decision rights, parallelism, review gate.
4. **`01_product_vision.md`** → **`02_strategy.md`** → **`03_validation_plan.md`** — the product "why" and "for whom".
5. The engineering docs (`04`–`10`) only when building.
6. **`DECISIONS.md`** — why past decisions were made (read before re-opening a settled question).
7. **`LESSONS.md`** — what past projects learned the expensive way (read at the start of every project).
8. **`KNOWN_ISSUES.md`** — open bugs and failed attempts (read before writing any spec or fix task).

---

## What to read for a task (don't read everything)

The default rule: **index first, file second, never the folder.** Reading everything is how context dies — and a bloated context makes the agent worse, not better. Match the reading to the task:

| Task type                | Read (in order), nothing else                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Small fix / copy tweak   | `PROJECT_STATUS.md` → `07` (file map + surface map) → the one doc owning that area                |
| Bug in a known area      | `KNOWN_ISSUES.md` → `07` surface map row → `DECISIONS.md` (if it might reopen a settled question) |
| New feature              | the owning `01`–`10` doc → `DECISIONS.md` (if it might reopen a settled question) → `PLAN.md`     |
| Fresh start / onboarding | the full reading order above                                                                      |

Hard rules:

- **Never open `Screenshots/` wholesale.** `Screenshots/_INDEX.md` says what each image shows; open only what the task actually references.
- The engineering docs (`05`–`10`) are read **only when building touches them**.
- The founder's phrasing ("kayıt ol butonu") resolves through `07`'s surface map — that is its job.

---

## Canonical file list (the contract)

> Agents: create/fill EXACTLY these files with EXACTLY these names. Do not invent new top-level docs without the orchestrator adding them here first.

### Root — product & engineering

| File                                   | Purpose                                                                             | Status    |
| -------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| `00_START_HERE.md`                     | This map.                                                                           | CANONICAL |
| `01_product_vision.md`                 | What we're building and why; the one-sentence product.                              | DRAFT     |
| `02_strategy.md`                       | Target customer, pricing, positioning, kill criteria, scope locks.                  | DRAFT     |
| `03_validation_plan.md`                | The validation test — playbook, success/fail bar.                                   | DRAFT     |
| `04_design_language.md`                | Visual/design system: colors, type, components, tone.                               | DRAFT     |
| `05_architecture.md`                   | System architecture, tech stack, how the pieces fit.                                | DRAFT     |
| `06_data_model.md`                     | Database schema / data shapes.                                                      | DRAFT     |
| `07_folder_structure_and_standards.md` | Code organization + coding standards + the live file-structure map.                 | DRAFT     |
| `08_core_pipeline.md`                  | The core product workflow / main processing pipeline.                               | DRAFT     |
| `09_auth_and_billing.md`               | Login + payments.                                                                   | DRAFT     |
| `10_deployment.md`                     | How it ships and runs in production.                                                | DRAFT     |
| `DECISIONS.md`                         | The decision log — every significant decision + its reasoning.                      | LIVE      |
| `LESSONS.md`                           | What we learned the expensive way + the promote-to-template loop.                   | LIVE      |
| `KNOWN_ISSUES.md`                      | Open bugs + failed attempts ("do not retry" registry). Read before any spec or fix. | LIVE      |
| `GLOSSARY.md`                          | Shared plain-language glossary (technical term → plain meaning).                    | LIVE      |
| `DOD.md`                               | Definition of Done — the single canonical "is it actually done?" checklist.         | CANONICAL |
| `HOW_TO_USE_THIS_TEMPLATE.md`          | Meta: how to start a project from this template + version/changelog.                | CANONICAL |
| `PLAN.md`                              | The LIVE execution plan — checkboxes, kept current.                                 | LIVE      |
| `PROJECT_STATUS.md`                    | Current state, top dated banner.                                                    | LIVE      |

### `Governance/` — how the AI operates ("the OS")

| File                          | Purpose                                                                  | Status    |
| ----------------------------- | ------------------------------------------------------------------------ | --------- |
| `GLOBAL_RULES.md`             | Founder's global principles + behavior.                                  | CANONICAL |
| `AGENT_CONSTITUTION.md`       | Orchestrator + sub-agent roles, decision rights, gates.                  | CANONICAL |
| `SUBAGENT_PROMPT_TEMPLATE.md` | The strict template for spawning coding sub-agents.                      | CANONICAL |
| `HOW_TO_WRITE_DOCS.md`        | Doc style guide so agents + humans write consistently.                   | CANONICAL |
| `WHEN_STUCK.md`               | The escalation ladder — what to do when blocked (no guessing, no loops). | CANONICAL |
| `DOC_AUDIT.md`                | The recurring check that docs still match reality (anti-staleness).      | CANONICAL |

### Folders

| Folder         | Purpose                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `Screenshots/` | Visual evidence (UI states, design refs, review captures). Indexed in `Screenshots/_INDEX.md`.             |
| `Marketing/`   | Positioning, launch, channels/distribution drafts.                                                         |
| `_archive/`    | Superseded docs — never deleted, always moved here with a reason recorded in `_archive/_ARCHIVE_INDEX.md`. |

---

## The documentation layer

One layer. Everything in the root and `Governance/` is **AI-facing, English, exhaustive** — it records _everything_: every decision, file, and change, in full technical detail. This is the AI's primary working guide and the permanent record (`GLOBAL_RULES.md §4`).

The founder is served **in conversation, not in a doc layer**: plain Turkish, business framing, per `GLOBAL_RULES.md Part 1`. (A founder-facing summary layer — `CEO_Ozet/` — existed until v1.3.0 and was retired: the founder never read it, while every task paid to update it. See `_archive/_ARCHIVE_INDEX.md`. Do not re-add it; if the founder wants a written summary, he will ask.)

---

## Authority chain (who wins when docs conflict)

1. **`Governance/GLOBAL_RULES.md`** — the founder's word. Highest authority.
2. **`02_strategy.md`** — current locked strategy (product, target customer, pricing, scope).
3. **`PLAN.md` / `PROJECT_STATUS.md`** — current execution truth.
4. Everything else — supporting detail.

If a doc contradicts a higher one, the higher one wins; flag the conflict to the orchestrator.

---

## Open Decisions (need the founder)

Decided and closed: product name (Corvus), ICP (non-coder SMB owners), English-only, model + router (GLM path / wiro burn), tiers + credits + trial shape, Contabo-interim/Hetzner-target, validation skip, music-builder-only, marketplace-V2, design feeling, K2/K3 kill numbers (D-032), Scale $100 caps 20/200/20k (D-033), app-owned trial with no Creem object until upgrade (D-034), gate-hardening wave incl. git init (D-035). Still open:

- [ ] **Core premise re-check** — trial-funnel read at first 100 trials (`03`).

---

## Status

2026-09-07 — Planning complete (D-002…D-021): all 11 product/engineering docs filled, box bought + provisioned, V1 9 items ordered (D-016), build next (GLM/DeepSeek eval → V1-8).
2026-09-09 — V1-8 DONE (foundation + launch-blockers on live PG, D-030) → V1-1 DONE + bound (OAuth/invite/interview/session-bind, 111/111 tests, D-031). Founder rejected mock screens (L-007, frontend deferred), ordered OSS-grounded backend (L-008). Next: V1-2 spec on founder go.
2026-09-09 — Open-doors wave DONE (K2/K3 locked D-032, Scale caps D-033, app-owned trial D-034, KI-001 closed + gate hardening + git init D-035; merged `npm run ci` green). V1-2 SPEC filed — build next.
2026-09-09 — V1-2 backend DONE (editor + metered router + durable stores closing KI-002 + builder prompt + real parseSpec; reviewers PASS 030/031; merged ci green from dist-less tree; D-036). Next: V1-6 templates.
2026-09-09 — V1-6 DONE (0004 templates + idempotent seed + fork with invite URL; reviewer PASS 034; merged ci green; D-037). Next: V1-4 pre-flight.
2026-09-09 — V1-4 DONE (custody locked D-038: Corvus-owned fleet; vault + installs + scanner + relay + worker; reviewers PASS 041/042; merged ci green; D-039). Next: V1-5 simulator.
2026-09-09 — V1-5 DONE as prototype backend (matcher + simulate + scripted demo + page; reviewer PASS 046; live CI 386 green; D-044). Taste debt open. Next: V1-3 publish.
2026-09-10 — Frontend taste day: dark-first locked (D-045) → ui-skills round → clone-skill installed → Strix/illus DESIGN.md → landing WINNER (Geist, taste PASS, 04 updated) → dashboard 3-pane → whisper-glass (D-046) → 3 protos (/proto-a|b|c) → 5 clones (/clone-*) → clone-fixes (L-012 filed: frequency≠role, screenshot=truth). Parked: winner-pick + vercel-drop verdict due morning. Next: verdict → winner to `/` → interview/gallery.
2026-09-10 — Verdicts closed: pryzm-winner live at `/` (D-047) → 8 parked routes deleted (D-048) → avatar proof pill added per founder file, no-new-stack (D-049). Next: interview/gallery.
2026-09-11 — LEAD CHANGE (unlocked): `/pryzm` is the current main design direction (D-061) — prototype continues, no lock verdict yet; parked routes stay for comparison.
2026-09-12 — Landing honesty done (D-075/D-076, KI-009 closed) + template tiles (D-077) + bento fix (D-078). Dashboard: 3-track contest (D-080) → B lead, C out, A parked (D-081) → app `/dashboard` ruled lead, backed up, cleaned (D-083/D-084). Sandbox files parked; next verdict picks the shippable dashboard.
2026-09-13 — Dashboard ref-rhythm DONE (D-088): founder Partner-Portal refs → left-aligned grid (stats + Today/Pre-flight + bots + templates), reviewer PASS 358, live 200; taste verdict open.
2026-09-13 — App track day (D-089…D-106): `/pick` voter + `/gallery` Scraphe rhythm + dashboard dash-home port + Recent cards + separate Bots view + Bolt-anatomy creation + fullscreen New-bot + real-time persona chat (thinking→stream, metered) + cleanup (48 files out, KI-011 kept). V1-3 publish/rollback backend DONE (D-098), V1-7 part DONE (D-099). Live on :3119 (dev) + :8000 (Antigravity static). Sandbox track (D-090…D-094) runs parallel on Antigravity files — untouched by app track. Open: KI-011 (clone-pryzm dependency), KI-012 (mock buttons), V1-7 async progress, V1-9, bindings, deploy. `/pick` votes still empty (founder hasn't voted).
2026-09-13 (evening) — Chat pages wave (D-107…D-119): creation overlay → `/dashboard/new`, detail overlay → `/dashboard/bots/[id]`, both under one rail layout; thinking traces (MIT-adapted) with live elapsed clock + history tail + reasoning flag (probed); fake pickers deleted (Auto-only); beam trialed + removed (FA-002); dev login opened (local PG + `.env.local`, first live persona reply measured). 400 tests green, routes live 200 on :3119. Still open: KI-011, KI-012, V1-7 async progress, V1-9, bindings, deploy.
2026-09-14 — Landing corrected (D-120): production `/` is the Antigravity port (Vercel rhythm, non-coder copy 1:1, wired CTAs, reviewer PASS, live 200); pryzm-winner retired to out-of-repo backup; KI-008 closed. Still open: KI-011, KI-012, V1-7 async progress, V1-9, bindings, deploy.
2026-09-14 — IA split (D-121): `/dashboard/bots` own page, home overview-only, `?view=bots` redirects; gallery cards match landing (D-122); one shared rail, icon bug fixed (D-123); mock-debt wave — dead buttons wired to real APIs, Upgrade honest-disabled, footer delinked, vote route prod-guarded (D-124, KI-012/KI-013 closed); rail instant on all 5 routes (D-125) + rail font unified. Suite 437 green. Still open: KI-006 (privacy/terms pages), KI-010 (sandbox port), KI-011 (clone-pryzm), V1-7 async progress, V1-9, real-UUID binding, deploy.
2026-09-15 — Debt wave DONE (D-126, 8 agents, disjoint scopes): KI-006 closed (/privacy + /terms live, footer-linked), KI-010 closed (dashboard live-bound via GET /api/bots), KI-011 closed (/pryzm self-contained, clone-pryzm deleted), V1-7 progress backend (jobs table + builder queue + poll UI, model call stubbed), V1-9 supervisor (crash counter + backoff + quarantine), deploy pipeline ready (Dockerfiles built + run-proven, needs domain + secrets). Merged: typecheck clean, gateway 143 + web 483 green. Open remainders: support-email + DPA, supervisor prod wiring, builder model call, first real deploy.
2026-09-15 (EOD) — D-127 (supervisor on duty via relogin) + D-128 (builder real call via @corvus/ai, live-proven) + first commits + full doc audit (KI-014…KI-019 open, L-020/L-021). Tree clean, gates green. Next on founder go: dashboard progress wiring, demo window.
