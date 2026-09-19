# PLAN — Live Execution Plan

## Status: LIVE

> The single source of truth for what's done and what's next. Tick boxes as work completes; keep current. Additive only — don't reorder phases without founder approval. Per `GLOBAL_RULES.md §3`, nothing is built that isn't planned here first.

**Last updated:** 2026-09-19 midday (commits `54918cd` + `4aed2ff` local — dirty wave + KI-032 done, push denied twice by auto-mode classifier, needs founder `!` push; box NOT redeployed yet). First deploy LIVE at `https://13-140-181-113.nip.io/` (D-136). KI-018 stays Open (committed locally, not pushed, not rebuilt on box). KI-032 code-committed. KI-030/031/033 untouched. Do not share the URL.

---

## How phases work

Each phase below lists its tasks as checkboxes. Before a phase starts, it must carry a one-line **cost & risk** note in plain language (`GLOBAL_RULES.md §7`): estimated money/time and the single biggest risk. No rosy numbers — realism applies to estimates too.

At the **end of every phase**, run the doc audit (`Governance/DOC_AUDIT.md`) so the documentation doesn't quietly drift out of sync with reality.

---

## Phase 0 — Documentation & operating system

> Goal: the doc system and governance are in place before any product work.

- [x] Copy this template; replace `{{PROJECT_NAME}}` and folder placeholders (follow `HOW_TO_USE_THIS_TEMPLATE.md`) — done 2026-09-07, Corvus, v1.3.0
- [ ] Read `LESSONS.md` — start already knowing what past projects learned the hard way
- [ ] Confirm/adjust `Governance/*` for this project (usually unchanged)
- [x] Competitor deep research wave 1 (Vibebot site/business/tech/UX/founder/GTM, 6 agents) — 2026-09-07
- [x] Competitor deep research wave 2 (sitemap+buyer pains+pricing+engineering+AI/ease, 5 agents) — 2026-09-07, filed in `Marketing/vibebot-deep-research-2026-09-07.md`
- [x] Model verification (GLM 5.3 Flash: real, $0.15/$0.50, benches near-Opus) + unit economics + V1 scope (3 agents) — 2026-09-07, filed in `Marketing/corvus-model-and-pricing-2026-09-07.md`
- [x] Founder locks: English-only (D-004), GLM 5.3 Flash (D-005), dashboard-managed + templates (D-006)
- [x] Founder locks v2: ICP=A non-coder SMB owners (D-008), tiers Free/$10/$29-capped/$100 (D-009), Hetzner Nuremberg start (D-010); infra research done
- [x] Provider deep-dive (OVH/Contabo/netcup/Vultr) + virtualization verdict — stay Hetzner CX33, no virt for V1 (D-012)
- [x] Hetzner purchase spec verified (CX32 dead → CX33, nbg1, €8.99) + stack/repo/tools locked with live versions (D-018)
- [x] Founder locks v3: K1=$0.50/run, credits token-indexed + trial 1 bot/100cr (D-013), Creem.io conditional (D-014), launch scope no-$100/music-builder-only/marketplace-V2 (D-015), design clean+trustworthy anti-slop (04)
- [x] Fill product/strategy skeletons (`01`–`04`) — filled 2026-09-07, pending founder read
- [x] Fill engineering skeletons (`05`–`10`) — filled 2026-09-07, stack locked D-018
- [x] Fill marketing skeletons (`Marketing/*`) — 2 research files filed
- [x] Start `DECISIONS.md` (first real entry) and `KNOWN_ISSUES.md` (empty — fills as defects and failed attempts appear) — 31 decisions logged (D-001…D-031), 2 open issues (KI-001, KI-002)
- [ ] Reviewer pass for coherence of the doc system

## Phase 1 — Lock the foundation (founder + orchestrator)

> Per `GLOBAL_RULES.md §3.4`: no build starts until A-to-Z scope, design direction, and target-audience analysis are settled.

- [x] Decide final product name — Corvus (D-002)
- [x] Lock exact target customer — non-coder small/medium owners (D-008); big servers via Studio later
- [x] Lock strategy (`02_strategy.md`): pricing (tiers locked D-009/D-011/D-013, Scale post-launch D-015), kill criteria (K1=$0.50 locked; K2/K3 LOCKED D-032), scope
- [ ] Lock validation plan (`03_validation_plan.md`): the test + success bar
- [ ] Lock design direction (`04_design_language.md`) — FEELING LOCKED clean+trustworthy, anti-slop rule, founder tests gate; palette/type pending agent proposal
- [x] Lock tech stack (`05_architecture.md`) — D-018, founder buys CX33 per purchase spec; fixed base ~€20/mo
- [ ] Lock Corvus attack list from research (engineering 8 + ease 8 + pricing 5 + trust/GTM 7 in `Marketing/vibebot-deep-research-2026-09-07.md §8`) — founder picks scope for smallest slice

**Cost & risk:** planning cost sunk (research waves + box ~€5.50/mo running); biggest risk if locked wrong = model economics (gated by K1 eval) + Discord gotcha handling (gated by pre-flight + simulator).

## Phase 2 — Smallest testable slice (build)

> Goal: the minimum that proves the core value. NOT the whole product. V1 = 9 items (`Marketing/corvus-model-and-pricing-2026-09-07.md §6`), build ORDER locked D-016 (dependency order):

1. [x] V1-8 persistent DB + gateway core — DONE 2026-09-09 (Waves A→B→C; launch-blockers 4/4 on live PG; merged ci green; reviewers PASS backend 0110, frontend 0111, wave-A 0121; D-028/D-029/D-030)
2. [x] V1-1 connect + panel interview + least-privilege invite — DONE 2026-09-09 (OAuth/session + invite mapper + interview draft-mint + session bind; L-008 grounding cited; merged ci green 111/111 with live DB; reviewers PASS auth 0140, product 0141, bind 0142; D-031)
3. [x] V1-2 spec + round-trip editor — BACKEND DONE 2026-09-09 (editor GET/patch + metered AI router + durable stores closing KI-002 + builder prompt + parseSpec guards; reviewers PASS editor 030 + platform 031; merged ci green; D-036). Panel UI binding deferred with all frontend (L-007). Micro-debt: remove in-memory interviewProgress once durable proves out; wrap done-path pool.connect; router off-wiro IDs at pre-exhaustion wiring.
4. [x] V1-6 template gallery (8) — DONE 2026-09-09 (0004 templates table + idempotent seed + list/detail/fork routes with invite URL; reviewer PASS 034; merged ci green; D-037). Gallery UI binding deferred with all frontend (L-007).
5. [x] V1-4 pre-flight scan — DONE 2026-09-09 (vault envelope + installs table + pure 7-check scanner + relay routes + gateway worker; reviewers PASS 041/042; merged ci green; D-039). Scan UI deferred with all frontend (L-007).
6. [x] V1-5 simulator + pre-install demo window — DONE 2026-09-09 as PROTOTYPE backend (spec matcher + simulate route + scripted brain + rate-limited demo route + thin demo page; reviewer FAIL→1-line lint fix→PASS; live CI 386 green; D-044). Taste debt open (L-007): all surfaces redesigned under founder references later.
7. [ ] V1-5 full build (prototype backend DONE line above D-044; hosted persona + live discord.js demo pending)
8. [x] V1-3 publish/rollback — BACKEND DONE 2026-09-13 (publish + rollback routes with Red-blocks-publish, rollback-never-blocked, guarded pointer moves, audit trail via 0006 migration; gateway start.ts boot + idempotent worker; deterministic race test 10/10; consolidated review PASS; D-098). Live-Discord scan proof still needs fleet token (founder-blocked).
9. [x] V1-7 pipeline/logs/explainer — PROGRESS BACKEND DONE 2026-09-15 (builder_runs table 0007 + pg-boss `builder` queue + start/poll routes + BuilderProgress polling UI; D-099 part + D-126) + REAL MODEL CALL DONE 2026-09-15 (@corvus/ai shared lanes/router/cost/prompt, worker brief-to-draft with ai_spend metering, fenced-JSON contract live-proven PASS; reviewer PASS; D-128) + DASHBOARD WIRING DONE 2026-09-18 (KI-014 Resolved D-130: `/dashboard` + `/dashboard/bots` via `?runId=`). Remainder: live-PG proof of the sync write path (KI-015)
10. [x] V1-9 self-heal hardening — SUPERVISOR DONE 2026-09-15 (per-bot crash counter 5/5min + backoff 1s→30s + quarantine via existing path + sibling-isolation proofs 11/11; D-126) + PROD WIRING DONE 2026-09-15 (Gateway.relogin preserving crash state + start.ts supervisor with audit/restart-via-vault; preservation test mutation-proven; reviewer PASS; gateway 151 green; D-127)
11. [x] D-045 dark-first locked (founder refs: Strix + illustration.app + Linear) — 04 tokens dark
12. [ ] FRONTEND-PROTO-1 landing + dashboard dark prototypes (mock, taste-gated, no backend binding) — wave CLOSED (builds, verdicts, deletes in lines below 2026-09-10; no action)

- [x] FRONTEND-PROTO-1 built 2026-09-10 (landing + dashboard dark, mock-only; reviewer PASS 050; 07 map updated) — founder verdict: BERBAT, ui-skills trial ordered
- [x] FRONTEND-PROTO-2 built 2026-09-10 (ui-skills redesign round: redesign-skill + landing-page-design, SPEC addendum 0053; merged typecheck/lint/tests green 217; dev 200/200) — founder verdict: BERBAT, clone-skill trial ordered
- [x] CLONE-SKILL installed 2026-09-10 (firecrawl-website-design-clone, 32.6K installs; global) + Strix DESIGN.md extracted (measured tokens: #000000, white pill, Geist, 64/56/20) → landing rebuilt per DESIGN.md (merged gates green, dev 200) — founder verdict: colors ok, rest cheap knockoff
- [x] ILLUS-DESIGN extracted 2026-09-10 (Geist, full-pill #E5E5E5/#262626, #121212, framed product shots) → strict visual SPEC (0115, pixel numbers) + merge rules → landing rebuilt (real Geist loaded, fused input-CTA, 1100px, hairline discipline; merged gates green 217, dev 200) — founder taste PASS, winner locked in 04 (SUPERSEDED 2026-09-14 by D-120 Antigravity port)
- [x] DASHBOARD-WINNER built 2026-09-10 (Geist + 04 tokens + pill buttons + tabular numbers; merged gates green 218, dev 200) — founder verdict: hiç olmamış + 2 app refs (Strix 3-pane + illus playground)
- [x] DASHBOARD-3PANE built 2026-09-10 (rail + liste + detay, credits meter, AI bar; mock-only; merged gates green 222, dev 200) — founder: whisper-glass + feathered edge + ambient lights ordered (D-046)
- [x] WHISPER-GLASS built 2026-09-10 (dashboard + hero; alpha 0.04/blur 10px/mask feather/static glows; merged gates green 223, dev 200/200) — founder verdict: görünmüyor (flat-black üstünde blur = hiçlik)
- [x] GLASS-VISIBLE built 2026-09-10 (alpha 0.08/blur 16px/inset highlight/mask 75%/glow overlap; prettier drift fixed by orchestrator; merged gates green 223, dev 200) — founder taste gate OPEN
- [x] 3-PROTOS built 2026-09-10 (A=Vercel+Resend serif, B=Strix+Framer motion, C=Pryzm+illus compact; disjoint routes /proto-a|b|c + /protos index; merged gates green 227, dev 4x200) — founder: parked, 5 site-clones ordered
- [x] 5-CLONES built 2026-09-10 (vercel/resend/strix/pryzm/framer 1:1-structure, measured tokens, resend race red→merged green 233; dev 6x200) — founder: alakasız (framer blue dispute) → instrument audit: brand files unread, dark forced on light sites
- [x] CLONE-FIXES built 2026-09-10 (eyes-on screenshots: vercel LIGHT per shot / resend+framer dark confirmed; vercel dark-rebuild per founder order, resend details, framer blue=glow-only; merged green 236, dev 3x200) — founder judges; vercel drop candidate
- [x] MORNING VERDICT (founder 2026-09-10): landing winner = PRYZM CLONE → promoted to `/` (D-047, gates green 232, live 200) + vercel DROPPED (KI-007 closed) → losers-delete DONE 2026-09-10 (8 routes, D-048, 224 passed) → avatar proof pill DONE (D-049, founder scope avatar-only) → interview/gallery next (SUPERSEDED 2026-09-14: `/` is the D-120 Antigravity port; pryzm files backed up out-of-repo)
- [x] PROTO-SNIPPET built 2026-09-10 (ui-cnippet 6 parçanın CSS Modules uyarlaması, option A per founder; SPEC 1605 + builder 6/6 + reviewer PASS; live /proto-snippet 200 + / 200 unchanged; D-051)
- [x] PROTO-SNIPPET wave2 built 2026-09-10 (founder: more pieces + motion; +tabs/carousel/dialog/tooltip/progress, CSS-only motion + reduced-motion kill-switch; 11/11 tests + reviewer PASS; live 200 + / unchanged; D-052)
- [x] PROTO-SNIPPET wave3 built 2026-09-10 (founder Downloads: dock + prompt hero + bento + categorized FAQ + pricing toggle, lifted dark; 16/16 tests + reviewer PASS; live 200 + / unchanged; D-053)
- [x] PROTO-LANDING built 2026-09-10 (founder: fresh page, landing-usable picks only, sign-in excluded; CSS `*` 500 fixed L-013; 15/15 tests + reviewer PASS; live 200 + / + /proto-snippet unchanged; D-054)
- [x] PROTO-LANDING hero swapped to hero-01 2026-09-10 (founder Landing-Hero/3 pick, 21st.dev match, screenshot-sourced rebuild; prompt relocated to #preview; 17/17 tests + reviewer PASS; 3 routes 200; D-055)
- [x] PROTO-PRYZM port built 2026-09-10 (founder Open-Design clone path; structure mirrored, visuals+copy original, harvested assets excluded, newsletter skipped L-005; 21/21 tests + reviewer PASS; 4 routes 200; D-056)
- [x] PROTO-PRYZM texture pass built 2026-09-11 (founder verdict: skeleton ugly; 6 eyes-on CSS textures from Temp-only harvest ref, zero bytes in repo; 26/26 tests + reviewer PASS; 4 routes 200; D-057)
- [x] CLONE-PRYZM verbatim copy placed 2026-09-11 (founder override after counsel; html+68 assets byte-identical under public/clone-pryzm, quarantined interim ref; page+assets 200; D-058)
- [x] PRYZM Next.js port built 2026-09-11 (founder: no HTML; 1:1 JSX+CSS Modules conversion, lenis 1.3.26 npm + native fallback; 15/15 tests + reviewer PASS, 303 suite green; D-059)
- [x] LANDING hero swapped to saa-s rhythm 2026-09-11 (founder-pasted source; Tailwind/import/hotlink/signin converted away, panel redrawn honestly; 19/19 tests + reviewer PASS; 5 routes 200; D-060)
- Ops notes: MiroMiro 190/300 credits left (render+screenshot = 402 paid-wall, avoid); Firecrawl screenshots used for theme truth; dev server left RUNNING on :3000; API keys live ONLY on Desktop txt files (never in repo)

- [x] Antigravity dashboard sandbox 2026-09-12 (sidebar/onboard/stats/table/carousel/marquee, example-marked; D-079, KI-010 for port wiring)
- [x] Dashboard 3-track contest 2026-09-12 (a/b/c + independent review all PASS; D-080) → verdict: B lead, C deleted (backup kept), A parked (D-081)
- [x] dashboard.html v2 2026-09-12 (rebuilt on app 3-pane shell + lighting, flattened; D-082)
- [x] App dashboard lead 2026-09-12 (`apps/web/app/dashboard` backed up, typecheck green; D-083) + cleanup (Lucide rail icons, unmasked glass, 7/7 tests; D-084)
- [x] Dashboard IA restructure 2026-09-13 (grouped rail + tabbed detail + sort + Interview into detail; 20/20 tests + reviewer PASS, live verified; D-085)
- [x] Dashboard sparse rebuild 2026-09-13 (dense 3-pane out: sade ev selamlama + tek AI kutusu + bot kartları + şablon şeridi, detay ayrı ekranda; full web 355 passed; reviewer PASS, live verified; D-086)
- [x] Dashboard taste verdict 2026-09-13 (centered sparse home rejected on sight; categorization wanted, centering not; next direction open, no build; D-087, L-016)
- [x] Dashboard ref-rhythm rebuild 2026-09-13 (founder Partner-Portal refs → left-aligned grid: 4 stat cards + Today/Pre-flight + filterable Your bots + templates; home composer removed to detail only; 23/23 dashboard + full web 358 passed; reviewer PASS; D-088) + panel-depth fix same day (flat cards → 04 shadow+ring+top-light on .statCard/.panel/.card/.detailHead, CSS-only, reviewer PASS)
- [x] Component picker Faz A 2026-09-13 (`/pick`: 10 input variants Turkish UI + file-backed votes + `/pick/results`; fenced Tailwind no-preflight per D-073; 369 passed; reviewer PASS + results-css fix; votes reset, founder voting next) + corners fix same day (all 10 inputs unified 8px, CSS-only, light-review PASS)
- [x] Dashboard Scraphe mimarisiyle yeniden inşa edildi 2026-09-13 (`Antigravity/dashboard.html`: AppSidebar + 2 sütunlu hiyerarşi + CreditCard + PromptCard + Filo listesi + Pre-flight paneli; index.html karanlık tokenları; reviewer PASS; D-090)
- [x] Dashboard dash-home port 2026-09-13 (app `/dashboard`, sandbox hattından ayrı — D-095: dash-home.html ritmi: Get-started 2/4 + 3-col bot grid + This-week/Pre-flight + Workspace; review FAIL 2 ölü düğme → fix → PASS 26 test; rail 6 anchor, Interview yok, radius 12px) + bot-cards Recent ritmi same day (Scraphe: medya kutusu + başlık/zaman + mini menü Open/Activity/Pre-flight sekmeli; 37 test, PASS; D-100) + Bots ayrı görünüm same day (Scraphe PromptCard ritmi: büyük composer + liste; gönder → boş üretim sayfası; 43 test, PASS; D-101) + creation Bolt-anatomisi same day (deri Corvus: büyük ortalı hero composer, model adı yok, gradient/cam yok; 47 test, PASS; D-102) + New-bot fullscreen same day (liste sadeleşti, creation dialog overlay Esc/scroll-lock ile; 50 test, PASS; D-103) + creation-submit fix same day (ölü gönder → taslak kartı + adım ilerleme; 59 test, PASS) + BuildProgress same day (düşünüyor animasyonu + gerçek fazlar, demo sürücülü, 58 test, PASS; D-104 — AYNI GÜN EMEKLİ: kurucu reddetti, dosya silindi, statik listeye dönüldü; D-106) + gerçek-zamanlı sohbet same day (persona streaming: thinking→akan cevap, sayaçlı, 384 passed, PASS; D-105)
- [x] Cleanup 2026-09-13 (8 park rota + 15 dashboard yedeği silindi, 48 dosya; repo-dışı SHA256 yedekli; clone-pryzm KEPT-linked KI-011; gates green; D-097)
- [x] Gallery Scraphe ritmi 2026-09-13 (app `/gallery` — D-096: arama + All/8 kategori hapı + 3-col kart ızgarası + boş durum; fork davranışı aynı, mock, API yok; reviewer PASS 376) + dashboard rail same day (6-item rail, Templates aktif, reviewer PASS 378)
- [x] Antigravity honesty follow-up 2026-09-12 (KI-009 closed + 9 same-class finds, backup kept, forbidden-pattern scan clean; D-076)
- [x] Landing port 2026-09-14 (`Antigravity/index.html` → production `/`, stack-pure, reviewer PASS; D-120, KI-008 closed; pryzm-winner backed up out-of-repo)
- [x] Bots list split 2026-09-14 (own page `/dashboard/bots`, home overview-only, `?view=bots` redirects; D-121; 402 green, all routes live 200)
- [x] Gallery cards match landing 2026-09-14 (tile + pills + chips, behavior untouched; D-122, reviewer PASS)
- [x] Gallery rail href fix 2026-09-14 (stale `#bots`/`#home` → real routes; anchors verified; 402 green)
- [x] Rail unified 2026-09-14 (one shared component, local copies deleted, icon bug fixed; D-123, reviewer PASS, 407 green)
- [x] Mock-debt wave 2026-09-14 (5 parallel fixes: gallery/detail/interview/rail/guards + merged gate + docs-true + cva/log cleanup; D-124; 436 green, live 200, anon publish → 401)
- [x] Rail instant everywhere 2026-09-14 (bare Suspense out, 3 hypotheses falsified, build-verified; D-125, L-019; 5/5 routes inline, 436 green)
- [x] Rail font unified 2026-09-14 (rail owns Geist import; same typeface all routes; 437 green)
- [x] Debt wave 2026-09-15 (D-126, 6 parallel agents + 2 fix agents, disjoint scopes): KI-006 privacy/terms routes + footer links; KI-011 /pryzm de-quarantined (clone-pryzm 69 files deleted); KI-010 closed via dashboard live binding (GET /api/bots + live-first lib/bots.ts with mock fallback); V1-7 progress backend; V1-9 supervisor; deploy pipeline **scaffolded** (compose web+gateway, deploy.yml gates→GHCR→SSH). **Correction 2026-09-19 (KI-029):** “Dockerfiles built+run-proven” was false at HEAD `b5c9833` — they never COPY `@corvus/ai` (or gateway `@corvus/spec`). First box `docker build` failed; box-local patch + later uncommitted repo Dockerfiles exist; local rebuild unproven this morning. Do not cite this line as image-proof.
- [x] Motor-hardening wave 2026-09-16 (D-129: 3 audit agents + 6 fix agents + 4 seam-fix agents + 1 adversarial reviewer, disjoint scopes): builder worker orphan/fake-live/double-bill/ledger-hole closed + validation retry/repair (3 attempts) + budget pre-check; web fail-fast on missing DB + builder poll allowlist + preflight parity; gateway shard-disconnect boundary + ready-wait + status machine/startAll; ai budget/spans + golden-brief eval under src/eval. Merged: typecheck clean x4, gateway 201 + web 466 + ai 91 + spec 56 green.
- [x] KI-025/026/027 wave DONE 2026-09-18 (D-134, spec `2026-09-18-1647`, disjoint scopes, 4 independent reviews all PASS): KI-025 tier source (`0008_accounts_tier.sql` + `tier-resolver.ts` + boot wiring); KI-026 ledger unique backstop (`0009_ai_spend_attempt.sql` partial unique + insertSpend 23505→skip, double-insert COUNT=1 live-proven); KI-027 new-page mint (`POST /api/bots` + mint-on-first-submit + Build→`?runId=`, 12/12 page tests). Commits `ac17d4b` (19 files) + `fab15c6` (11 test-only files, FA-004 shared-DB hardening). CI `35382829514` SUCCESS 12/12; clean-DB local `npm test` exit 0 (gateway 233 + web 546 + ai 94 + spec 56). KI-025/026/027 → Resolved; open: KI-015/016/017/018/019/024-partial.
- [x] Deploy to a shareable URL (LIVE 2026-09-19 night, D-136: `https://13-140-181-113.nip.io/` HTTPS 200 + cert + login 307). Residual — do not treat this tick as “shipped to strangers”: box still publishes 5432 and :3000; deploy is not reproducible from committed git (KI-018); landing still lies (KI-030); Discord portal redirect + Contabo snapshot are founder clicks. No auto-deploy on push.
- [x] IP-first prep DONE 2026-09-18 (D-135: Caddy TLS via `13-140-181-113.nip.io`, RUNBOOK §7 rewritten, APP_URL pattern locked; box provisioned ALL DONE; commit `b5c9833` is on origin — "pending push" is stale)
- [x] Docs-vs-code audit DONE 2026-09-19 (report `Agent Reports/2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md`; filed KI-029…KI-034; no product code). Founder still decides: docs-true wave vs Docker COPY vs honesty pass vs KI-018 deploy
- [x] Teknik borç folder + drift stamps DONE 2026-09-19 (`Docs/Teknik_Borc/00_INDEX.md`; banners on 02/04/05/06/07/08/09/10; L-021 heading restored; D-128 empty-body noted). KI-031 stays Open until the numbered bodies are rewritten.
- [x] First deploy LIVE 2026-09-19 night (box-deploy-001 SUCCESS + independent review PASS: `https://13-140-181-113.nip.io/` 200, Let's Encrypt cert verify 0, login 307 byte-exact, no secret leak; report `Agent Reports/2026-09-18-2343_box-deploy-001_CREATE_first-deploy.md`). Residuals: box Dockerfile fix not yet in repo (docker-029 running), box still exposes 5432 until redeploy (repo fixed by compose-036), web:3000 plaintext residual recorded. KI-018 stays open until the deploy is reproducible from the repo.
- [x] compose-036 DONE 2026-09-19 (postgres `ports:` removed from `infra/compose/compose.yml`, `config` exit 0 + differential-render proof; report `Agent Reports/2026-09-19-0045_compose-036_FIX_close-postgres.md`). Box-side exposure closes only on redeploy.
- [x] New-chat docs fill DONE 2026-09-19 morning (founder: fill done-vs-not-done before opening a new chat). Living files trued; numbered 01–10 bodies still stale (KI-031). Handoff: `Agent Reports/2026-09-19-0800_orchestrator_SPEC_new-chat-handoff.md`. Next chat order: commit dirty wave → KI-032 `.env.example` → box redeploy (close 5432) → KI-030 honesty. Do not share the URL.
- [x] Commit dirty wave DONE 2026-09-19 midday (`54918cd`: 32 files — Dockerfiles ai copy KI-029, compose-036 close 5432, deploy.yml caddy, parked guards KI-034, RUNBOOK, living docs, Teknik_Borc KI-029-034 + handoff spec; prettier-fixed 16 files; pre-commit typecheck+eslint+prettier all green).
- [x] KI-032 `.env.example` DONE 2026-09-19 midday (`4aed2ff`: `ENCRYPTION_KEY=` shape-only entry + WIRO note reworded; no value). Push to origin/master DENIED twice by auto-mode classifier (transient per its own message) — needs founder `! git push`. Box NOT redeployed (5432 + :3000 still live, image still pre-guard).
- [ ] D-027 scheduling (approved 2026-09-08, additive — order unchanged): TRACK 1 = V1-8 backend wave (waves A→B→C); TRACK 2 = frontend primitives + 3 mock screens in parallel (taste gate per 04)
- [x] Wave A done 2026-09-09 (skeleton + spec v0 + UI primitives; merged `npm run ci` green 3x, D-028) — Wave B armed (T-db, T-store, T-gateway, T-screens)
- [x] Wave B done 2026-09-09 (db schema + store + gateway core + 3 mock screens; merged `npm run ci` green 3x, 44/44 tests; reviewers PASS backend 0110 + frontend 0111; D-029) — Wave C done (T-blockers 4/4 on live PG; merged ci green 2x with DB, 48/48; D-030)
- [x] Wave A per-task Reviewer gates (were skipped under rate limiting — now CLOSED via reviewer 0121, all PASS, D-030)
- [x] Standing follow-ups CLOSED 2026-09-09 (D-035): git init done (no commit yet), `format` script added for apps/web + packages/spec, KI-001 fixed (web eslint CJS→ESM), stale bind comments refreshed

**Cost & risk:** infra ~€9-14/mo at 100 bots (D-010/D-012); AI ~$0.0055/run GLM list; biggest technical risk = Discord gotcha handling + GLM eval gate (must pass before 100% traffic).

## Phase 2b — Chat overlays become real pages (D-118, founder-ordered)

> Contract (locked): `/dashboard/new` = creation chat page (back → bots list); `/dashboard/bots/[id]` = detail page (tabs + chat, back → bots list); unknown id → honest empty state, never a guess. Shared pieces (no duplication): `lib/chat/thread.ts` (ThreadRow, SSE parse, history, botId, error text), `components/ui/chat-thread.*` (thread rendering over ThinkingTrace), `components/ui/use-chat-stream.ts` (messages/streaming/submit/retry/abort). Dashboard keeps home + bots list; New bot + cards become links; `?view=bots` restores the list view for back-nav. All existing behaviors preserved (streaming, ThinkingTrace, history tail, 401 line, composer lock, forceExpanded creation).

- [x] Shared lib + thread component + stream hook (with tests)
- [x] `/dashboard/new` page + tests; creation overlay deleted
- [x] `/dashboard/bots/[id]` page + tests; detail overlay deleted
- [x] Dashboard slim + `?view=bots` + dead CSS removal; full gates green (395 passed, 3 routes live 200)

> The single source of truth for what's done and what's next. Tick boxes as work completes; keep current. Additive only — don't reorder phases without founder approval. Per `GLOBAL_RULES.md §3`, nothing is built that isn't planned here first.

**Cost & risk:** $0, pure move; biggest risk = state lost in transit (mitigated: behavior-by-behavior test moves, no logic changes).

## Phase 3 — Validation

> SKIPPED as ceremony (D-017, 2026-09-07): category validated by competitor revenue. Replaced by trial metrics watch:

- [ ] First strangers publish via trial (funnel: visit -> trial -> publish tracked)
- [ ] Read trial→publish + day-3 conversion; pivot-per-data if poor (kill numbers armed)

## Phase 4 — Only if validated: harden & monetize

- [ ] Payments
- [ ] Polish, quotas, error handling

---

_Phases 4+ stay deliberately thin until Phase 3 gives a green light. Don't over-build before validation._
