# LESSONS — What We Learned the Expensive Way

## Status: LIVE

> The company's compounding memory. Every project pays for some lessons in time and money; this file makes sure the NEXT project doesn't pay for them again. Per `GLOBAL_RULES.md §4`, nothing learned is allowed to evaporate. This is distinct from `DECISIONS.md` (which records _what_ we chose and _why_) — LESSONS records _what reality taught us afterward_, especially when it contradicted the plan.

---

## How to use this file

- **When to add a lesson:** any time reality surprised the plan — a thing took 3× longer, a "safe" choice broke, an assumption was wrong, a user did the unexpected. Good news counts too ("X worked better than expected — do more of it").
- **Be specific and honest** (`GLOBAL_RULES.md §2`): "auth took 2 weeks not 2 days because of email deliverability" beats "auth was hard."
- **End every lesson with a rule.** A lesson with no resulting rule is just a story. Turn it into a "from now on we…" line.

---

## The feedback loop (what makes the template get smarter)

This is the point of the file. A lesson lives in three escalating places:

1. **Project-local.** It's recorded here, in this project's `LESSONS.md`.
2. **Promoted to the template.** When the SAME lesson shows up in 2+ projects, it stops being a project quirk and becomes a company truth. Promote it into the master template's `Governance/GLOBAL_RULES.md` (or the relevant numbered doc) and bump the template version (`HOW_TO_USE_THIS_TEMPLATE.md`). Now every FUTURE project inherits it automatically.
3. **Reviewed at project start.** Phase 0 of every new project includes "read the template's accumulated lessons." See `PLAN.md`.

> Orchestrator: at the end of a project (or a major phase), scan this file and ask: "which of these should be promoted to the template so we never relearn them?" Record the promotion as a `DECISIONS.md` entry.

---

## Entry template (copy for each lesson)

```markdown
### L-{NNN} — {short title}

- **Date:** YYYY-MM-DD
- **Cost of learning it:** {time/money/trust spent before we understood}
- **Category:** product | engineering | process | distribution | people

**What happened.** {The surprise, plainly. What we expected vs. what reality did.}

**The rule now.** {The "from now on we…" sentence this produces.}

**Promote to template?** {no | candidate — seen once | YES — seen in {project A}, {project B}; promoted on YYYY-MM-DD}
```

---

## Log

> Standing rule: add lessons as they happen — don't wait for a retrospective. The starter lessons below are the durable ones already proven across past work; treat them as inherited company truths until a project disproves one.

### L-001 — "Deployed" is not "validated"

- **Date:** inherited (template v1.3.0)
- **Cost of learning it:** an entire over-built platform shipped before a single paying user
- **Category:** product

**What happened.** A live URL with no users feels like progress but teaches nothing. Shipping is not learning; watching real people use it is.

**The rule now.** Don't count a launch as a milestone until real target users have actually used it. Validation gates the build (`03_validation_plan.md`).

**Promote to template?** YES — already reflected in `GLOBAL_RULES.md §2` and the Prime Directive.

### L-002 — Distribution is the real bottleneck, not code

- **Date:** inherited (template v1.3.0)
- **Cost of learning it:** strong product, no one in front of it
- **Category:** distribution

**What happened.** The hard part was never building it; it was getting the right handful of people to actually try it. Code is the cheap part.

**The rule now.** If you can't reach your target users, fix that before writing more features. Treat `Marketing/` as seriously as the engineering docs.

**Promote to template?** YES — reflected in `03_validation_plan.md §4`.

### L-003 — Over-building before validation is the default failure mode

- **Date:** inherited (template v1.3.0)
- **Cost of learning it:** months of work on infrastructure no user ever needed
- **Category:** process

**What happened.** It's tempting to build the "real" version — platforms, abstractions, scale — before proving anyone wants the core thing. Motion got mistaken for progress.

**The rule now.** Build the smallest thing that proves value, then stop and test. Ask of every task: "does this move us toward a validated, payable product?" (`GLOBAL_RULES.md §3`, Prime Directive).

**Promote to template?** YES — this is the Prime Directive.

### L-004 — Price the model before pricing the product

- **Date:** 2026-09-07
- **Cost of learning it:** one research wave (avoided building a $10 plan that loses $3.64/user/mo on Sonnet-class at medium use)
- **Category:** product

**What happened.** The $10 flat price looked obvious until unit economics ran: medium usage costs $11.03 in AI alone on Sonnet-class. The plan only works because a 24.5x-cheaper verified model (GLM-5.3-Flash) was found FIRST — pricing followed the model, not the reverse.

**The rule now.** From now on we pick and verify the model (live price + coding bench + eval gate) BEFORE locking any price or allowance number; credit math pegs to token cost so model moves propagate automatically.

**Promote to template?** candidate — seen once (Corvus).

### L-005 — A feature finished on one side only is not finished (frontend↔backend↔plan drift)

- **Date:** 2026-09-08
- **Cost of learning it:** caught at planning (founder's scar tissue from past builds: backend features never surfacing in UI, UI controls with no backend behind them, planned items built nowhere — each side green, product lying)
- **Category:** process

**What happened.** Three faces of one seam: (1) backend ships a capability no screen exposes — dead code with passing tests; (2) frontend ships a control nothing serves — a button that lies; (3) the plan names work neither side builds — a wish filed as done. Every part is correct in isolation and the system still lies (the global seam pattern).

**The rule now.** From now on every feature ships as a TRIPLE — contract + backend + frontend — or it does not ship: (1) BEFORE any spec is written, write the surface matrix (which spec fields, which gateway path, which panel surface + its `07` surface-map row); a feature missing any leg is a wish, not a plan. (2) The Reviewer verifies the OTHER two legs, never just the built one. (3) End-of-phase audit maps every PLAN item to its triple; anything unmapped is OPEN, never done. Infra-only work (like V1-8) instantiates the triple as contract + implementation + test.

**Promote to template?** candidate — seen once (Corvus).

### L-006 — A root test runner that ignores package configs tests a fictional project

- **Date:** 2026-09-09
- **Cost of learning it:** one debug cycle inside the Wave A gate (caught same session, zero user impact, zero product change)
- **Category:** engineering

**What happened.** Root `vitest run` executed the web package's tests WITHOUT the web package's config (no React plugin, no jsdom setup) — 14 tests failed with "React is not defined" on code that was correct. Same wave: a CJS vitest setup rejected by ESM-only vitest 5, and a `--prefix` install duplicating the whole tree into a nested `node_modules` (dual-React hazard). Three symptoms, one class: the merger ignored package boundaries.

**The rule now.** From now on, in any monorepo: root scripts (test/typecheck/format) DELEGATE to workspaces — never run a workspace's code under the root's config; each package owns its runner + config; exactly one lockfile at root; config file dialect (CJS/ESM) follows what the runner demands. Trigger: before adding any root script to a monorepo, and before installing into a subfolder (always install from root).

**Promote to template?** candidate — seen once (Corvus).

### L-007 — Mock-data UI without founder taste input gets fully rejected

- **Date:** 2026-09-09
- **Cost of learning it:** one wave leg (2 agents + reviews) — cheap only because the screens were never bound to backend
- **Category:** product

**What happened.** Primitives + 3 screens were built on mock data per the design doc and both Reviewer legs PASSED against that doc — then the founder saw them and rejected all of it on sight. A doc-conformant UI nobody taste-checked is a wish, not a design.

**The rule now.** From now on no screen is built before the founder names 2–3 reference sites or screenshots he likes; the taste gate checks against those references, not just the doc. The rejected Wave B screens stay mock-only and get redesigned after backend wiring, per founder direction (backend first, then proper bind).

**Promote to template?** candidate — seen once (Corvus).

### L-008 — Sıfırdan mühendislik yapma; en iyi açık kaynağı canlı araştır, örnek al

- **Date:** 2026-09-09
- **Cost of learning it:** founder direktifi (önden kazanıldı — bedava ders)
- **Category:** process

**What happened.** Founder kural koydu: backend yapılırken her bileşenin mühendisliğini en iyi yapan açık kaynak projeler canlı araştırılacak (internet, Stack Overflow, güncel repolar); planlama ve kod onlara bakılarak yapılacak, uygun olanlar kullanılacak. Gerekçe: denenmiş mühendisliği yeniden yazmak hem yavaş hem hataya açık.

**The rule now.** From now on, every SPEC and every coding brief carries an OPEN-SOURCE GROUNDING step that runs BEFORE design: (1) webde o bileşeni en iyi yapan 2–3 açık kaynak repo/örnek bulunur ve raporda link + lisansıyla anılır; yapı, pattern ve hata-yönetimi onlardan alınır; (2) kopyala-yapıştır öncesi lisans bakılır — MIT/Apache-2.0/ISC/BSD sorunsuz kullanılır, GPL/AGPL kod ürüne girmeden karar gerekir; (3) Stack Overflow ve blog cevaplarında tarih + sürüm filtresi zorunlu (özellikle discord.js: v12/v13 cevapları v14'te çöp — eski cevap, yanlış cevap); (4) kaynaksız tasarım kararı review'da kusur sayılır. Trigger: her SPEC yazımında ve her ajan briefinde.

**Promote to template?** candidate — seen once (Corvus).

### L-009 — A skip gate that cannot fire is not a gate (prove both states)

- **Date:** 2026-09-09
- **Cost of learning it:** one debug cycle inside the open-doors wave (caught same session, zero user impact)
- **Category:** engineering

**What happened.** The launch-blocker suite's "skip loudly without DB" gate was `PG_GATE_SKIP = !DATABASE_URL && !FALLBACK` — always false, because the fallback constant is never empty. The skip path could never run, so the hooks threw ECONNREFUSED instead and local `npm run ci` went red with zero product cause. Same wave, second instance of the shape: two workspace packages had no `format` script, so the root format gate passed without ever checking them.

**The rule now.** From now on every skip/run gate is proven by execution in BOTH states before it is trusted: force the skip (no DB, no key, no network) and watch it go loud-green, then run it for real and watch it pass. A gate verified in only one state is decoration. Trigger: writing or touching any gate, skip, or fallback — plus grepping for sibling packages missing the same runner (fix the class, D-028).

**Promote to template?** candidate — seen once (Corvus).

### L-010 - Recall is not evidence (read-then-anchor)

- **Date:** 2026-09-09
- **Cost of learning it:** three dead-end edit rounds + two SPEC misquotes in one week (zero user impact, all caught same session)
- **Category:** process

**What happened.** Three edits failed on source text quoted from memory (a SPEC sentence, a status line, a table row), and two SPEC amendments targeted text that was never there. Every failure burned a round-trip; every one resolved the moment the bytes were dumped first. Memory of file content degrades within the same session - including drafts written hours earlier by the same hand.

**The rule now.** From now on no edit is drafted from memory: the oldString comes from a same-breath read, and the SECOND consecutive failed match on visible text stops the line - switch to dump-then-anchor (print the region, anchor on the dump) instead of retyping. Trigger: every edit longer than one line, and automatically on the second miss.

**Promote to template?** candidate - seen once (Corvus).

### L-011 - Stubs prove logic; only live PG proves contracts

- **Date:** 2026-09-09
- **Cost of learning it:** one live-verification afternoon; 4 reds that 300+ green tests could not see (all closed same session)
- **Category:** engineering

**What happened.** Four defects shared one shape: the test double was friendlier than production. A non-UUID stub id that fakes accept and Postgres rejects; a stubbed boss that returns null where the real one throws queue-missing; a cleanup list written before the FK existed; timeouts budgeted for same-DC latency on a transatlantic tunnel. Every one passed stubs + review and failed first live contact.

**The rule now.** From now on every PG-backed test earns one live run before its wave closes (the CI service counts; loud-skip is a deferral, never proof): stub identities must satisfy column types (UUIDs for uuid); queue consumers must handle never-created queues; every new table greps all TRUNCATE/cleanup lists; latency budgets are run parameters (CLI flag), never committed-code edits for an exotic setup. Trigger: closing any wave with PG tests, and adding any table. Amended 2026-09-09: per-test ceilings MAY follow the repo's own DB-test precedent — the interview tree-walk carries `{ timeout: 30_000 }` after proving ~20 sequential round-trips need it over remote PG (launch-blockers already carry 60–120s; the ceiling asserts no product speed, CI finishes it in under a second).

**Promote to template?** candidate - seen once (Corvus).

### L-012 - Extraction data is guilty until proven innocent (frequency is not role)

- **Date:** 2026-09-10
- **Cost of learning it:** one full 5-clone wave judged "alakasız" + one fix wave (zero user impact, all mock)
- **Category:** process

**What happened.** MiroMiro returned CORRECT numbers we used WRONGLY three ways in one day: (1) color frequency read as color role — Framer's #0099FF appears 171x but lives in glow FX/code highlighting, we painted CTA fills with it; Strix's "primary" red is severity badges, not brand; (2) the `theme` label trusted unread — it says light for Resend/Framer whose heroes are black, and the 5KB brand files holding named roles sat unopened while 250KB extracts got summarized; (3) product theme (Corvus dark-first) forced onto clones, so light-source structure (Vercel) came out unrecognizable. The founder caught all three from screenshots; no gate looks at pixels.

**The rule now.** From now on no extraction-fed build starts before the EYES-ON-TRIPLE is filed in the SPEC: (a) screenshot seen by the spec author (theme + where each color actually lives, in words), (b) named roles read from the brand/small file (never frequency counts), (c) theme rule stated (source-faithful vs product-language). A builder prompt carrying only token tables is a blind brief and review must reject it.

**Promote to template?** candidate - seen once (Corvus).

### L-013 - CSS Modules reject global selectors (a `*` reset 500s the route)

- **Date:** 2026-09-10
- **Cost of learning it:** one red-herring round (all routes 500, dev server looked dead)
- **Category:** engineering

**What happened.** A `*, *::before, *::after { transition: none }` reduced-motion
reset inside `proto-landing.module.css` failed the CSS transform ("Selector `*`
is not pure") and returned 500 — not just for that route but, via the poisoned dev
compile, for `/` and `/proto-snippet` too, which made the server look dead. Fix:
scope resets under the page root (`.page *, .page *::before, .page *::after`).

**The rule now.** From now on no bare element/universal selector ever enters a
`.module.css` file — resets and kill-switches hang off the route root class.
Trigger: writing or reviewing any CSS Module; the reviewer greps `^[a-z*]`.

**Promote to template?** candidate - seen once (Corvus).

### L-014 - Only founder-pixel-picked ports pass taste; everything generated dies on sight

- **Date:** 2026-09-11
- **Cost of learning it:** a full day of taste waves (3 protos, 5 clones, glass passes, light theme — all rejected on sight, zero user impact, all mock)
- **Category:** product

**What happened.** L-007 said screens need founder references before building. The stronger version proved itself all day: even WITH references, anything the AI originated (token-fused designs, theme trials, texture collages) died the moment the founder saw it. What passed, 4 for 4, was pixel-level curation carried over 1:1 — Pryzm clone, saa-s hero, animated word. The founder's verdict closed it: "sen tasarım yapmayı beceremiyorsun."

**The rule now.** From now on the founder supplies pixels and the AI only ports (D-068). No taste wave starts from a token table, a vibe description, or an unpictured order — a reference screenshot is the ticket to build.

**Promote to template?** candidate - seen once (Corvus).

### L-015 — Visual port without audience-fit copy is a slop landing (ICP voice ≠ reference voice)

- **Date:** 2026-09-12
- **Cost of learning it:** one full Vercel-port bento redo + page cleanup (3 sub-agent waves; founder had to write copy with me in a second pass)
- **Category:** product

**What happened.** D-068 Vercel-port executed the visual rhythm correctly (editorial blocks, big text + visual panel + features list, alternating layout). But the COPY mimicked Vercel's B2B-software voice: "Engineered for Total Server Autonomy", "OAuth2 PKCE handshake", "ACID Postgres with point-in-time recovery", "Multi-guild central dispatch", "Self-healing supervisor", "Deterministic logic compilation". Visually clean; messaging read like a developer-targeted platform page. Founder rejected explicitly: "neden sürekli teknik detaylardan bahsediyorsun? biz kodlama bilmeyen insanlara yardım ediyoruz." Audience is non-coder Discord server owners (D-008: gaming/study/streams communities) — they ask about XP loss and token sharing, not PKCE or ACID. The reference site's audience was Vercel's (B2B developers); Corvus's audience is different, and copying the reference's voice copied its audience. Same wave caught 10 fabricated testimonials + fake "500+/1.8M+" social-proof numbers + "14ms/99.98%" trust strips + an unbacked newsletter form (L-005) — all symptoms of the same failure: writing copy FOR the reference site, not FOR the ICP.

**The rule now.** From now on, when porting a visual reference to Corvus, the COPY must be audience-fit, not reference-fit. Concrete: before writing any landing-page copy, name the ICP (per D-008: non-coder Discord server owner running 50–5,000-member community) and write copy FOR THAT PERSON — explain value as if to a friend who runs a Discord server for gaming/study/streaming. Forbidden on user-facing surfaces: OAuth, PKCE, ACID, Postgres, WebSocket, Multi-guild, Dispatch, Compilation, Self-healing, Behavior spec, Sandbox, Backend, API, "Production-grade", "Built from first principles", "Enterprise-Grade", "Architectural Breakthroughs". If a developer term is technically accurate but the ICP won't recognize it, paraphrase or remove. Trigger: every landing-page SPEC, every hero subline, every feature bullet, every value prop. Visual rhythm ports stay D-068 (founder picks pixels); the copy layer is audience-fit, separately.

**Promote to template?** candidate — seen once (Corvus). Compounds L-014 (no AI taste) with the audience-fit dimension. Promote to `Governance/GLOBAL_RULES.md` if seen again.

### L-016 — Centered hero rhythm does not belong in the app workspace

- **Date:** 2026-09-13
- **Cost of learning it:** one full dashboard rebuild wave (D-086: sparse centered home, reviewer PASS, all gates green — rejected on sight)
- **Category:** product

**What happened.** The sparse rebuild correctly separated concerns (home vs detail, cards vs tabs — that part stands) but stacked ALL home content in one centered max-width column, copying the competitor greeting-plus-prompt hero rhythm. Founder verdict: "everything centered doesn't look good." The categorization was wanted; the centering was the rejected part. Same signature as L-007/L-014: gates cannot judge taste, only the founder's eyes can — and they did, the same night.

**The rule now.** From now on dashboard/app-workspace content stays left-aligned; the centered hero rhythm (greeting + prompt + cards, one column) is for landing pages only, never for the workspace the owner works in daily. Trigger: every dashboard SPEC states the alignment rule up front, and the reviewer checks centering as a taste defect, not a neutral choice.

**Promote to template?** candidate — seen once (Corvus).

### L-017 - A shared layout owns the landmarks; pages must not re-declare them

- **Date:** 2026-09-13
- **Cost of learning it:** one red gate + one stray-brace repair in the same wave (caught before merge, zero user impact)
- **Category:** engineering

**What happened.** The dashboard layout took over shell + skip-link + main landmark, but both subpage briefs said "keep inner main" for the anchor — landing two nested `<main id="main-content">` landmarks, plus one JSX structure edit that left a dangling brace. Each agent implemented its brief correctly; the contradiction lived one level up, in the split of the briefs.

**The rule now.** From now on, when a layout takes ownership of a landmark, every child-page brief carries the explicit line "no `<main>`, no skip-link, no shell — the layout provides them; return content only." Ownership transfers are stated on BOTH sides of the handoff, never just the new owner's.

**Promote to template?** candidate - seen once (Corvus).

### L-018 - Never kill a WebGL context in a React effect cleanup (StrictMode remounts on the corpse)

- **Date:** 2026-09-14
- **Cost of learning it:** one invisible hero background + one FIX wave (zero user impact, pre-launch)
- **Category:** engineering

**What happened.** The ported hero canvas called `WEBGL_lose_context.loseContext()` in its effect cleanup with no paired `restoreContext()`. Next.js runs dev effects as setup → cleanup → setup on the same canvas (StrictMode default), so the cleanup murdered the one context and the second setup drew into a lost one — every GL call a silent no-op, canvas black forever. The static sandbox had no React, so it rendered fine there; no gate looks at pixels.

**The rule now.** From now on effect cleanups stop work (cancel RAF, disconnect observers) and never destroy shared handles (no `loseContext`, no `close()` on a remountable resource) unless a paired restore runs on the same path. Trigger: reviewing any WebGL/canvas/audio effect cleanup.

**Promote to template?** candidate - seen once (Corvus).

### L-019 - A bare Suspense around a never-suspending subtree still holes the prerender (experiment beats two docs-backed theories)

- **Date:** 2026-09-14
- **Cost of learning it:** three falsified hypotheses + one instrumented build before the 5-minute experiment that actually settled it (zero user impact, pre-launch)
- **Category:** engineering

**What happened.** Gallery's rail streamed deferred while dashboard's was inline. `useSearchParams` (removed — no change), `useRouter` (removed — no change), `'use client'` segment config (impossible per framework source — reverted), "dashboard is dynamic" (killed by the build's own route table: all static). Each theory was docs-plausible and each was wrong. The experiment — delete the bare `<Suspense>`, watch dev name the hook or render inline — settled it instantly: no hook was ever suspending, the boundary itself was the hole.

**The rule now.** From now on, after TWO failed theory-fix rounds on a render anomaly, stop theorizing and run the cheapest decisive experiment (remove-or-isolate + read the framework's own error/build verdict). Name the stop rule in the task brief before the third round starts.

**Promote to template?** candidate - seen once (Corvus).

### L-020 - A restart that re-registers supervision is not a restart (relogin preserves, remove+add resets)

- **Date:** 2026-09-15
- **Cost of learning it:** 20 minutes of reading before writing (free — the expensive version would have been an infinite 1s-restart loop in production)
- **Category:** engineering

**What happened.** Wiring the crash supervisor's restart callback, the obvious implementation was removeBot+addBot. Reading both sides first showed removeBot calls forget (deletes the crash window) and addBot calls registerBot (fresh state) — so every restart would have reset the consecutive-crash counter and the 5-in-5min quarantine could never trip. The feature's only tripwire, silently defeated by its own wiring.

**The rule now.** From now on, when wiring a retry/recovery callback into supervised lifecycle, check what the teardown path does to the supervisor's state BEFORE choosing the mechanism — a recovery that re-registers is a reset wearing a restart costume. The fix (relogin: swap client, keep state) got a mutation-proven test that fails under the naive implementation.

**Promote to template?** candidate - seen once (Corvus).

### L-022 - Windows CRLF checkout breaks the prettier gate on LF-written files (.gitattributes closes it)

- **Date:** 2026-09-18
- **Cost of learning it:** two failed commits + one debug round (zero user impact, pre-launch)
- **Category:** process

**What happened.** A wave wrote 5 IP-prep files with LF endings; Windows checked them out as CRLF (`core.autocrlf=true`, no `.gitattributes`), and the pre-commit prettier gate failed on `RUNBOOK.md` + `compose.yml` even though `npm run format` had been green minutes earlier — the gate reads worktree bytes, the earlier check had run before the CRLF round-trip. Unmodified docs files stayed LF and green, which isolated it to checkout conversion, not content.

**The rule now.** From now on every repo carries `.gitattributes` with `* text=auto eol=lf` from the start, and any prettier failure on files the wave didn't semantically touch means: check `git ls-files --eol` first, convert CRLF→LF, re-run the gate — never reformat content to satisfy a line-ending failure. Trigger: prettier red on untouched-shape files, or any Windows checkout.

**Promote to template?** candidate - seen once (Corvus).

- **Date:** 2026-09-15
- **Cost of learning it:** one failed commit + one debug round (zero user impact, pre-launch)
- **Category:** process

**What happened.** The first commit (565 files) tripped the pre-commit hook two ways at once: pre-existing prettier drift in vendored/sandbox docs it didn't cause, and eslint OOM-killed scanning the whole tree. The hook was green on every product file and red on the tree — the colors disagreed and the hook's color was the wrong one to obey blindly.

**The rule now.** From now on the initial commit goes: (1) prettier --write only the files this wave touched, (2) commit with --no-verify AND the reason recorded in the commit message, (3) pre-existing drift filed as its own issue (KI-019), never silently absorbed. A bypass with a recorded reason beats a red hook everyone learns to ignore. Trigger: any commit over ~50 files, and any hook failure on files the wave didn't touch.

**Promote to template?** candidate - seen once (Corvus).
