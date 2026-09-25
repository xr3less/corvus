# Task Report: landfix-landing-minors

## Status
PARTIAL — 3 of 5 findings fixed. Finding #1 was **rejected as factually wrong** (with a falsifying probe); the demo-reply half of #1 and the remaining members of #2's class were blocked by files outside my declared scope. All gates green at hand-off (the one stale test pin I flagged was fixed mid-task by the sibling agent that owned it). Details below.

## Files Touched
- MODIFIED: apps/web/app/page.tsx (nav anchor #5; heading qualifier #3; footer spans #4)
- MODIFIED: apps/web/app/terms/page.tsx (trial wording #2)
- CREATED: Agent Reports/2026-09-23-1228_landfix_FIX_landing-minors.md (this file)
- NOT MODIFIED (deliberately): apps/web/lib/demo/brain.ts, apps/gateway/src/db/seed-templates.ts — both verified byte-identical via `git diff --quiet`

No other file was created, modified, or deleted. `git diff --name-only` over my scope shows exactly the two files above.

## Dependencies Added
- None. No manifest, lockfile, or env file touched. No install run.

---

## Finding-by-finding disposition

### 1. Kind vocabulary drift — **REJECTED as specified; premise is false**

The task premise was: "Demo reply + both seed capability arrays contain only valid RUNTIME_KINDS." That premise conflates **two different closed vocabularies that legitimately coexist in this codebase**. I validated the instrument (LESSONS §2.1) rather than reading two lists and assuming they must match.

**The two vocabularies, and which one each field belongs to:**

| Field | Vocabulary | Source of truth | Count |
|---|---|---|---|
| `RUNTIME_KINDS` — *executable behavior kinds* on `bot_runtime_config.kind` | `welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles` | `apps/gateway/src/runtime/config.ts:11-20` (mirrored `apps/web/app/api/spec/publish/route.ts:67`) | 8 |
| `VALID_CAPABILITIES` — *Discord invite permission sets* on `templates.capabilities` and `bots` invites | `welcome, moderation, tickets, leveling, reaction-roles, logging` | `apps/web/lib/invite/permissions.ts:11-18` | 6 |

`templates.capabilities` is **not** a list of runtime kinds. It selects which Discord permission bundle the fork's invite URL requests — a deliberately different axis. Its contract is stated and enforced in three places:
- `apps/gateway/src/db/v13.ts:10-11` — "`capabilities` is a non-empty subset of the invite vocabulary (welcome|moderation|tickets|leveling|reaction-roles|logging)"
- `apps/gateway/src/db/seed-templates.test.ts:19,73-80` — `INVITE_VOCAB` test: "capabilities are a non-empty subset of the 6 invite vocab"
- `apps/web/app/api/templates/[slug]/fork/route.ts:165-174` — at fork time, `rawCaps.every(isCapability)` fails → **500 "template data invalid"**

**Instrument-validation probe (run, not assumed).** I imported the real `permissions.ts` through `tsx` and asked it directly whether a runtime kind is a valid capability:

```
welcome         isCapability=true   CAPABILITY_MAP=3 perms
moderation      isCapability=true   CAPABILITY_MAP=5 perms
xp              isCapability=false  CAPABILITY_MAP=UNDEFINED
giveaway        isCapability=false  CAPABILITY_MAP=UNDEFINED
connector       isCapability=false  CAPABILITY_MAP=UNDEFINED
status          isCapability=false  CAPABILITY_MAP=UNDEFINED
tickets         isCapability=true   CAPABILITY_MAP=5 perms
reaction-roles  isCapability=true   CAPABILITY_MAP=5 perms
leveling        isCapability=true   CAPABILITY_MAP=5 perms
logging         isCapability=true   CAPABILITY_MAP=5 perms
economy         isCapability=false  CAPABILITY_MAP=UNDEFINED
giveaways       isCapability=false  CAPABILITY_MAP=UNDEFINED

--- What a forker actually gets (fork route path) ---
giveaway: THREW -> TypeError: CAPABILITY_MAP[capability] is not iterable
xp:       THREW -> TypeError: CAPABILITY_MAP[capability] is not iterable
```

**Conclusion, and why I did not make the requested change.** Writing `capabilities: ['giveaway']` into the seed — as finding #1 instructs for `giveaway-grove` — would make that template **unforkable** (fork route returns 500) and would **break the seed's own locked test** (`seed-templates.test.ts:73-80`) and the web seam test (`templates.test.ts:161-170`, `LOCKED_SETS`). The same applies to `coin-cellar: ['xp']`. The instruction would have introduced the exact class of defect it was written to remove.

**What is actually true about the two named rows:**
- `giveaway-grove` → `capabilities: ['welcome']` is **already correct and intentional**. `kindToCapabilities('giveaway')` returns `['welcome']` (`apps/web/app/api/invite/route.ts:26-27`) — single-posting behaviors need only post + embed. The preflight module documents the same at `apps/web/app/api/preflight/start/route.ts:181-188`: "No giveaway capability exists; the giveaway-grove seed proves these bots need exactly the welcome permission set, so derive that."
- `coin-cellar` → `capabilities: ['leveling']` is **already correct and intentional**. `kindToCapabilities('xp')` returns `['leveling']` (`route.ts:24-25`), and `capabilityForKind` maps the whole economy family (`earn, balance, shop, gamble, economy`) to `leveling` (`preflight/start/route.ts:157-172`), with coin-cellar named in the comment as the proof.

So the seed is coherent: template `category` uses the 8 template-gallery names, `capabilities` uses the 6 invite-permission names, and **both bridge correctly to the 8 runtime kinds via `kindToCapabilities`**. No seed edit is warranted. Editing it would be the "fixed the call site, broke the class" pattern in reverse — inventing a defect to match a finding.

**The demo-reply half of finding #1 is also not a defect — but for a different reason.** `apps/web/lib/demo/brain.ts:8` reads "8 templates ship v1: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy." That list is **exactly the 8 template categories, verbatim and in order** — it describes the *template gallery*, not the runtime kinds:

```
LOCKED_CATEGORIES (seed-templates.test.ts:8-17) = welcome, moderation, tickets, leveling,
                                                  reaction-roles, logging, giveaways, economy
seed rows in order (seed-templates.ts:50,91,134,177,221,263,307,348) = same 8, same order
```

The demo reply is a **template** reply (triggered by "template"/"sablon") answering "what templates exist," and its eight names match the eight seeded rows exactly. Rewriting it to `xp`/`connector`/`status` would make the demo **misdescribe the gallery** — the words `xp`, `connector` and `status` name no template a user can fork. The finding's own evidence line concedes the landing copy is clean; no user reaches these names outside the gallery, where they are the correct nouns. **Not changed.**

> Escalated rather than silently done: the instruction and the code disagree, and per the Scope Guard I am not expanding scope to "correct" three passing, contract-enforcing test suites to match a premise the code contradicts.

### 2. Trial wording (terms) — **FIXED**
`apps/web/app/terms/page.tsx:89-90`, now:
> **Trial (live):** 3 days of Pro features, limited to one bot and 100 AI credits, no card required.

Both caps now stated; hidden over-read class enumerated (see "Same-class check" below). Numbers consistent with landing hero (`page.tsx:220`) and FAQ (`page.tsx:54`): 3-day / 1 bot / 100 credits. Landing and FAQ untouched.

### 3. "Always on" heading — **FIXED**
`apps/web/app/page.tsx:401-403` — one qualifier line added directly under the heading, body left `(planned)`-marked as-is:
> None of these uptime and retention promises are live yet (planned).

Uses the existing `.timeSub` class (muted 12px, `#71717a`, **no `:hover` rule** — verified in compiled CSS), matching the house `(planned)` marker convention used ~20 times on this page. `landing.module.css` is outside my scope and was not touched.

### 4. Footer social spans — **FIXED (affordance was present; removed)**
Verdict on the task's conditional: the spans **did** carry clickable affordance, so per instruction I removed it. They used `.footerLink`, which defines `transition: color 0.2s ease` (`landing.module.css:1883`) and `.footerLink:hover { color: #ffffff }` (`:1892-1894`) — a hover colour change, i.e. the exact "looks clickable but isn't" signal. They now use `.footerTag` (`page.tsx:951-958`), which has **no hover rule** (confirmed against the compiled chunk: `.landing-module__scJOqG__footerTag{color:#a1a1aa;max-width:20rem;margin:0;font-size:12px;line-height:1.625}`; zero `footerTag:hover` selectors). Same colour (`#a1a1aa`) and `12px`/`14px` sizing as before, so appearance is visually identical apart from the removed affordance. Still `<span>`s; `page.test.tsx:141-149` (which locks them as spans) still passes.

### 5. Nav duplicate anchor — **FIXED**
`apps/web/app/page.tsx:33` — `{ href: '#bento', label: 'Architecture' }` → `{ href: '#how-it-works', label: 'How it works' }`.

Smallest honest change: relabelled to match a real, distinct section rather than inventing an architecture section or a new anchor. `#how-it-works` is the hero section (`page.tsx:185`), and the same label+target pair is **already the established house pattern in this very file's footer** (`page.tsx:938-940`), so this is consistent, not novel. All five nav anchors now resolve to distinct live ids — verified against the running built app:
```
href="#bento"          -> id="bento"          OK
href="#how-it-works"   -> id="how-it-works"   OK
href="#templates"      -> id="templates"      OK
href="#pricing"        -> id="pricing"        OK
href="#faq"            -> id="faq"            OK
```

---

## Same-class check (LESSONS §1: fix the class, not the call site)

Finding #2's class is **"trial copy that over-reads the enforced 1-bot/100-credit caps."** I grepped the whole web app for `full Pro / Full Pro` and found the class has **five** members, not one:

| Site | Text | Disposition |
|---|---|---|
| `apps/web/app/terms/page.tsx:89` | "3 days of full Pro access, one bot" | **FIXED** (in scope) |
| `apps/web/lib/demo/brain.ts:9` | "Trials run 3 days, full Pro, no card" | **NOT FIXED — out of scope** (see below) |
| `apps/web/app/pryzm/page.tsx:230` | "Full Pro, free for 3 days." | out of scope |
| `apps/web/app/pryzm/page.tsx:923` | "Start with 3 days of full Pro free — no card required." | out of scope |

**Why the remaining three are escalated, not silently edited.** I wrote the corrected demo reply (`"Trials run 3 days, 1 bot, 100 credits, no card"`), ran the tests, and **reverted it** — `apps/web/lib/demo/brain.test.ts:8` pins the old `PRICING_REPLY` string byte-for-byte and asserts replies match it via `resolves.toBe(...)` (lines 45-46). Editing `brain.ts` alone leaves that suite red; editing the test too is out of scope. Same shape for `pryzm`, whose strings are pinned at `apps/web/app/pryzm/page.test.tsx:246`. `brain.ts` is confirmed byte-identical to its original state (`git diff --quiet` clean), so I have not left a half-applied change behind.

**Recommendation:** the class fix is mechanical once scope is widened — 4 string edits + 2 test-expectation edits, all in `apps/web`. It should be one follow-up task with `brain.test.ts` and `pryzm/page.test.tsx` in scope, not four separate ones.

---

## Gates — all run, with real project commands

Detected toolchain (`apps/web/package.json`, root `package.json`, npm workspaces, `node_modules` present):

| Gate | Command | Result |
|---|---|---|
| Typecheck (web) | `npx tsc --noEmit` | **PASS** (exit 0) |
| Typecheck (gateway) | `npx tsc --noEmit` | **PASS** (exit 0) |
| Lint (touched files) | `npx eslint app/page.tsx app/terms/page.tsx --max-warnings 0` | **PASS** (exit 0, zero warnings) |
| Format (touched files) | `npx prettier --check app/page.tsx app/terms/page.tsx` | **PASS** (one wrap-only reflow applied) |
| Production build | `npx next build` | **PASS** — all routes compiled |
| Web touched-area tests | `npx vitest run app/page.test.tsx app/terms/page.test.tsx lib/demo/brain.test.ts app/api/demo` | **PASS** — 40/40 (see note) |
| Web template/capability tests | `npx vitest run app/api/templates/templates.test.ts app/gallery/page.test.tsx "app/gallery/[slug]/page.test.tsx" lib/templates/templates.test.ts lib/invite/permissions.test.ts` | **PASS** — 69/69 |
| Gateway seed/schema tests | `npx vitest run src/db/seed-templates.test.ts src/db/v13.test.ts` | **PASS** — 14/14 |

**Note on the touched-area suite — resolved mid-task by a sibling agent, not by me.** My first run of this suite was **1 failed / 39 passed**: `apps/web/app/terms/page.test.tsx:59` still asserted the retired string `'3 days of full Pro access'`, the expected consequence of finding #2 (the test file is outside my declared scope, so I did not edit it). A parallel agent (`landfix2-terms-test`, report `2026-09-23-1245_landfix2_FIX_terms-test.md`) then updated that single assertion to pin the corrected copy. I **re-verified their claim against the working tree rather than trusting the report** — line 59 now reads `expect(text).toContain('3 days of Pro features, limited to one bot and 100 AI credits');` — and re-ran the suite: **40/40 pass**. My `terms/page.tsx` copy fix is intact and was not modified by them (their report hash-verifies this independently).
> I deliberately did NOT weaken that assertion or edit the out-of-scope test myself to turn the gate green — a green gate obtained by editing the check is worse than an honest red. The correct fix (updating the stale pin) was made by the agent whose scope owned it.

**Real path exercised (Phase 3 / "done" = the flow ran, not "it compiles"):** built the app and served it with `npx next start -p 3111`, then fetched the real rendered HTML:
- `GET /` → **200**; `GET /terms` → **200**
- Landing: qualifier line present immediately after the heading; nav shows 5 distinct `navLink` hrefs (was 4 + duplicate); footer spans render `class="…footerTag"`, **not** `footerLink`; `Architecture` count in the page = **0**
- Terms: renders `Trial (live): 3 days of Pro features, limited to one bot and 100 AI credits, no card required.`
- Prices render `$0 / $10 / $29` (verified in real HTML; the `$$29` seen in the RSC payload is Next's escaping, not a rendering bug)
- Server was **stopped** after verification; port 3111 confirmed closed.

## Assumptions Made
- `RUNTIME_KINDS` vs `VALID_CAPABILITIES` are two legitimate, deliberately distinct closed vocabularies bridged by `kindToCapabilities`; therefore finding #1's premise — that `templates.capabilities` must hold RUNTIME_KINDS — is false. Evidence, not assumption: `v13.ts:10-11`, `seed-templates.test.ts:19,73-80`, `fork/route.ts:165-174`, and the `tsx` probe above.
- The demo brain's 8 names are template *categories* (they match the seed's 8 categories verbatim and in order), so they are correct as written.
- Finding #4's conditional resolved to "affordance present" — `.footerLink` carries a hover colour change by definition — so per the instruction the affordance was removed.
- "Smallest honest change" for #5 = relabel to an existing distinct section, reusing the label+target pair already used in this file's footer.
- `landing.module.css` being out of scope means the qualifier line (#3) and the span restyle (#4) must reuse existing classes; both do (`.timeSub`, `.footerTag`), with no CSS edit.

## Open Questions for Orchestrator
1. **Finding #1 needs a decision, not a fix.** The instruction conflicts with three contract-enforcing test suites and would break forking for two seeded templates. My recommendation: **close it as "premise false"**, optionally adding a one-line comment at `seed-templates.ts:308,349` noting `capabilities` is the invite-permission vocabulary (not runtime kinds), since that is what made the field look drifted to a reader. That comment edit needs the seed file in scope — it is currently in scope, but I did not make it without confirmation since it changes a contract-locked file.
2. **Finding #2's class has 3 unfixed members** (`brain.ts:9`, `pryzm/page.tsx:230,923`), all blocked only by out-of-scope test pins (`brain.test.ts:8,45-46`; `pryzm/page.test.tsx:246`). Recommend one follow-up task scoped to those 5 files.
3. ~~**`terms/page.test.tsx:59` must be updated** to the new trial wording~~ — **CLOSED mid-task** by the sibling `landfix2-terms-test` agent, whose scope owned that test file. Verified on the working tree (assertion now pins `3 days of Pro features, limited to one bot and 100 AI credits`) and re-run green: 40/40 touched-area tests pass. No action needed.
4. **Pre-existing, not mine, worth flagging:** `apps/web/app/terms/page.tsx:44` (the "short version" bullet) still reads "A 3-day trial with full access and no card is planned" — it carries the **same "full access" over-read** as the section I fixed, and additionally still calls the trial *planned* while the very next section labels it `Trial (live)`. That is a genuine internal contradiction on the page, but it is a wording/intent decision beyond finding #2's stated line range, so I did not touch it. Recommend it joins the follow-up in (2).

## Public Interface Exposed
- `apps/web/app/page.tsx`: `NAV_LINKS` is module-private; its exported default component signature is unchanged. Label `Architecture` → `How it works`, `href` `#bento` → `#how-it-works` (nav only; the footer's existing `#how-it-works` link is unchanged).
- `apps/web/app/terms/page.tsx`: no interface change (copy only).
- No exported type, function signature, route, or data shape changed anywhere.

## Known Limitations
- Findings #1 (both halves) and 3 further members of #2's class are **not fixed**, as detailed above. Two of those three (`terms/page.tsx:44`, `brain.ts:9`) live in files inside my declared scope, but changing them is a copy/product decision the finding did not authorise, so I escalated rather than expanded — see Open Questions.
- No DB was started and no seed was re-run; the seed change was rejected as unwarranted, so there is no data migration to verify. `seed-templates.ts` and `brain.ts` are byte-identical to their pre-task state.
- Visual verification was done on the built app's real HTML + compiled CSS, not a pixel screenshot; no browser was available in this environment. Layout/spacing of the #3 qualifier line was reasoned from the existing `.timeSub` rule and the page's `p { margin: 0 0 12px }` reset, not seen rendered.
- The gateway's live runtime behaviour behind `RUNTIME_KINDS` was not exercised (out of scope; no production contact).
- No secrets were read, printed, or transmitted. No manifest/env file, install, git restore/stash/checkout/reset, commit, or production contact occurred.
