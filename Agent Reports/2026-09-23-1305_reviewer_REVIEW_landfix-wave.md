# Task Report: reviewer-landfix-wave

## Status
**PASS** — with two open follow-ups (F1 pre-existing and unrelated; F2 an escalated class member).

All four claimed fixes are on disk, work on the real path, and pass every gate I ran on the merged
tree. **The builder's rejection of finding #1 is CORRECT**, verified independently below with my own
probe. No scope violation, no secret exposure, no manifest/env/migration/schema change, no production
contact.

## Files Touched
- CREATED: Agent Reports/2026-09-23-1305_reviewer_REVIEW_landfix-wave.md (this file)
- READ-ONLY on all source. I modified no source file, no test, no config.
- One transient probe file (`apps/web/__probe_caps.mts`) was created to falsify the builder's central
  claim, then **deleted**; confirmed gone.

## Dependencies Added
- None. No manifest, lockfile, or env file read into or written. No install run.

---

## 1. DOES IT WORK

### Artifacts exist (trust artifacts, not summaries)
All three required reports verified on disk with real timestamps:
`2026-09-23-1228_landfix_FIX_landing-minors.md` (18769 B), `2026-09-23-1245_landfix2_FIX_terms-test.md`
(13777 B), `2026-09-23-1250_inspect-landing_REVIEW_landing.md` (5493 B).

### Claimed edits are really on disk
Read via `git diff`, not from the reports. All four hunks present and exactly as described:
- `apps/web/app/page.tsx:33` — `{ href: '#how-it-works', label: 'How it works' }`
- `apps/web/app/page.tsx:401-403` — qualifier line added under the `Always on. Always remembered.` heading
- `apps/web/app/page.tsx:957-958` — both spans moved to `styles.footerTag`
- `apps/web/app/terms/page.tsx:89-90` — trial copy now names 1 bot + 100 AI credits
- `apps/web/app/terms/page.test.tsx:61` — assertion updated to the corrected copy

### Untouched claim VERIFIED
`git diff --quiet` over `apps/web/lib/demo/brain.ts` and `apps/gateway/src/db/seed-templates.ts` →
**both byte-identical to HEAD**. Independently corroborated: `brain.ts` mtime is `2026-09-23 12:59`
(inside the wave window), which matches the builder's disclosed write-then-revert — the content is
identical, so **no half-applied change was left behind**. `landing.module.css` (which the builder
claimed not to touch) has mtime `2026-09-21 20:29` and its one-line diff is `align-items: flex-start`
on `.ctaRow` — unrelated to `footerTag`/`timeSub`, and two days pre-wave. Claim holds.

### Gates — real project commands, detected not assumed
Toolchain detected from actual manifests: **npm workspaces** (`apps/*`, `packages/*`), `node_modules`
present at root and `apps/web` (so no stop-and-escalate condition triggered). Web scripts:
`typecheck` = `tsc --noEmit`, `test` = `vitest run` (vitest **5.0.0**); gateway is vitest 3.2.7.

| Gate | Command | Result |
|---|---|---|
| Typecheck (web) | `npx tsc --noEmit` | **exit 0** |
| Typecheck (gateway) | `npx tsc --noEmit` | **exit 0** |
| Lint (3 touched files) | `npx eslint app/page.tsx app/terms/page.tsx app/terms/page.test.tsx --max-warnings 0` | **exit 0**, zero warnings |
| Touched-area tests | `npx vitest run app/page.test.tsx app/terms/page.test.tsx lib/demo/brain.test.ts` | **26/26 pass** |
| Template/capability seam | `npx vitest run app/api/templates/templates.test.ts app/gallery/page.test.tsx "app/gallery/[slug]/page.test.tsx" lib/templates/templates.test.ts lib/invite/permissions.test.ts` | **69/69 pass** |
| Demo API | `npx vitest run app/api/demo` | **14/14 pass** |
| Gateway seed/schema | `npx vitest run src/db/seed-templates.test.ts src/db/v13.test.ts` | **14/14 pass** |
| **Full web suite (merged tree)** | `npx vitest run` | **885/885 pass, 62/62 files** |
| Production build | `npx next build` | **exit 0**, all routes compiled |
| Full gateway suite | `npx vitest run` | 440/440 tests pass, **1 suite fails to collect** — see F1 (pre-existing) |

The 885/885 figure **exactly matches** the count claimed in the landfix2 report — I re-ran it myself
on the merged tree rather than accepting N agents' N-tree reports.

### Real path exercised (the flow ran, not "it compiles")
Built the app and served it with `npx next start -p 3123`. **Instrument validated before use** — this
mattered, because `next start` emitted `"does not work with output: standalone"` and I had to prove
the served HTML was the fresh build rather than something stale. Two independent checks:
1. The served HTML contains strings that exist **only** in the post-wave working-tree source (the new
   qualifier line; the new trial wording) — impossible from a stale artifact.
2. `Architecture` count in served landing HTML = **0**; `How it works` = 8.

Results: `GET /` → **200** (106099 B), `GET /terms` → **200** (20849 B). Server **stopped** after
verification (PID 24832 killed; post-kill probe = connection refused, port closed).

## 2. DOES IT MATCH

**Nav (#5)** — `NAV_LINKS` has **5 entries, 5 distinct hrefs, 0 duplicates** (script-verified over the
source, not eyeballed). All five targets resolve to live ids **in the same served document**:
`#bento`→`page.tsx:268`, `#how-it-works`→`page.tsx:185`, `#templates`→`:491`, `#pricing`→`:691`,
`#faq`→`:858`. Label `Architecture` → `How it works`; `Architecture` appears **0 times** in the
rendered page. The label+target pair reuses the file's own established footer pattern
(`page.tsx:938`), so it is consistent rather than novel. The mobile menu consumes the same
`NAV_LINKS` (`:137`, `:168`), so the fix propagates to both surfaces.

**Always-on qualifier (#3)** — `page.tsx:402` sits directly under the heading at `:401`, before the
body. Uses `.timeSub`; the **shipped compiled CSS** shows
`.landing-module__scJOqG__timeSub{color:#71717a;margin-top:.125rem;font-size:12px}` with **no hover
rule**. Body retains its own `(planned)` markers. Consistent with the house `(planned)` convention.

**Footer affordance (#4)** — the spans now carry `.footerTag`. I read the **shipped compiled CSS**
(the chunk that actually carries the class). Verified, with the builder's claim reproduced exactly:
- `.footerTag{color:#a1a1aa;max-width:20rem;margin:0;font-size:12px;line-height:1.625}` and a
  `640px` override `{font-size:14px}` — **no `:hover`, no `:focus`** (grep: `NONE`).
- `.footerLink` for contrast: `{color:#a1a1aa;font-size:12px;text-decoration:none;transition:color .2s}`
  plus **`.footerLink:hover{color:#fff}`** — i.e. the affordance the finding described.
- Same colour (`#a1a1aa`) and same 12px/14px sizing, so appearance is unchanged apart from the
  removed affordance. **Class check:** every remaining `footerLink` in the file is a real `<a>`
  (`page.tsx:917-950`) — no inert element is left wearing the interactive class.

**Terms trial line (#2)** — `page.tsx:89-90` states 3 days + **one bot** + **100 AI credits**. Numbers
agree with the code's ground truth: `TRIAL_DEAL = 'Free 3-day trial — 1 bot, 100 AI credits.'`
(`lib/bots.ts:50`), `TRIAL_GRANT_CREDITS = 100` (`lib/auth/session.ts:102`), `CREDITS_TOTAL = 100`
(`lib/bots.ts:187`), and with landing `page.tsx:220/714/744` + FAQ `page.tsx:54`. Consistent.

## 3. ADJUDICATION OF THE #1 REJECTION — **the builder is CORRECT**

**Verdict: the rejection stands. Finding #1's premise is factually false, and acting on it would have
introduced the very defect it was written to remove.**

### The two vocabularies are genuinely distinct and separately owned
| Field | Vocabulary | Source of truth | Count |
|---|---|---|---|
| `bot_runtime_config.kind` | executable behavior kinds | `apps/gateway/src/runtime/config.ts:11-20` (`RUNTIME_KINDS`), mirrored `apps/web/app/api/spec/publish/route.ts:67` | 8 |
| `templates.capabilities` | Discord invite permission bundles | `apps/web/lib/invite/permissions.ts:11-18` (`VALID_CAPABILITIES`) | 6 |

`templates.capabilities` is the **invite** vocabulary — a different axis (which Discord permissions the
fork's invite URL requests), not a list of runtime kinds. This is stated and enforced in four places:
- `apps/gateway/src/db/v13.ts:10-11` — the table's own contract comment: "`capabilities` is a non-empty
  subset of the invite vocabulary (welcome|moderation|tickets|leveling|reaction-roles|logging)".
- `apps/gateway/src/db/seed-templates.test.ts:19` + `:73-80` — `INVITE_VOCAB` test: "capabilities are a
  non-empty subset of the 6 invite vocab".
- `apps/gateway/src/db/seed-templates.test.ts:21-45` — `LOCKED_ROWS` pins the exact arrays, including
  `giveaway-grove → ['welcome']` (`:39-43`) and `coin-cellar → ['leveling']` (`:44`).
- `apps/web/app/api/templates/[slug]/fork/route.ts:165-174` — `rawCaps.every(isCapability)` fails →
  **500 "template data invalid"**.
- The web seam test locks the same two sets: `apps/web/app/api/templates/templates.test.ts:161-170`
  (`LOCKED_SETS` rows 7-8 = `['welcome']`, `['leveling']`).

### My own falsifying probe (independent, not the builder's)
I imported the real `permissions.ts` through `tsx` and asked it directly:

```
welcome      isCapability=true   perms=3      tickets  isCapability=true   perms=5
moderation   isCapability=true   perms=5      reaction-roles  true  perms=5
xp           isCapability=FALSE  perms=UNDEFINED   leveling  true  perms=5
giveaway     isCapability=FALSE  perms=UNDEFINED   logging   true  perms=5
connector    isCapability=FALSE  perms=UNDEFINED
status       isCapability=FALSE  perms=UNDEFINED
would ['giveaway'] pass the fork-route isCapability filter?  false
would ['xp']       pass the fork-route isCapability filter?  false
CAPABILITY_MAP['xp'] iteration -> THREW: CAPABILITY_MAP.xp is not iterable
```

So writing `capabilities: ['giveaway']` / `['xp']` as finding #1 instructs would have made both
templates **unforkable (500)** and broken **three** contract-enforcing test suites. The instruction
was the defect site. (This is `LESSONS.md` §1.5: "when every agent implemented something correctly and
it is still wrong, the spec is the bug.")

### The two named rows are intentional and documented, not drifted
- `giveaway-grove → ['welcome']` (`seed-templates.ts:308`): `kindToCapabilities('giveaway')` returns
  `['welcome']` (`apps/web/app/api/invite/route.ts:26-27`) — single-posting behaviors need only post +
  embed. The preflight module documents the same reasoning at
  `apps/web/app/api/preflight/start/route.ts:186-188`: "No giveaway capability exists; the
  giveaway-grove seed proves these bots need exactly the welcome permission set."
- `coin-cellar → ['leveling']` (`seed-templates.ts:349`): `kindToCapabilities('xp')` returns
  `['leveling']` (`invite/route.ts:24-25`), and the economy family (`earn, balance, shop, gamble,
  economy`) maps to `leveling` at `preflight/start/route.ts:157-172`, which names coin-cellar in the
  comment as the proof.

The inspector's specific wording was also wrong on its own terms: it claimed `coin-cellar` carries
`['leveling']` "(no such kind)" — `leveling` **is** a valid capability (one of the 6); and it said
`giveaway-grove` "should read giveaway-ish" — **no giveaway capability exists at all**.

### The demo-reply half also fails, for a different reason
`brain.ts:7-8` lists the **8 template categories**, and I verified this mechanically rather than by
eye — normalizing `-`→space and trailing `s`, the reply's list is an **exact match** to the seed's
`category` values, in order:
```
seed:  welcome, moderation, tickets, leveling, reaction-roles, logging, giveaways, economy
reply: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy
EXACT MATCH: true
```
Those categories are **user-facing**: the gallery renders and filters by them
(`apps/web/app/gallery/page.tsx:16,235,241,297`). `xp`, `connector` and `status` name no template a
user can fork. Runtime kinds are not surfaced as user vocabulary anywhere in `apps/web` outside the
publish route's own validation. Rewriting the reply would have made the demo **misdescribe the
gallery**.

### What remains of finding #1
**Nothing actionable.** The only residue is **readability**: nothing at the seed rows or in
`brain.ts` tells a reader that these are two different vocabularies, which is exactly what made the
field look drifted to the inspector. The builder's own suggested remedy (a one-line comment at
`seed-templates.ts:308,349`) is a documentation nicety, not a defect fix — and it correctly asked
before editing a contract-locked file unprompted. I concur that finding #1 should be **closed as
"premise false."**

## 4. QUALITY

- **No secrets.** Secret-shaped-string scan over the wave diff → none added. No credential value was
  read, printed, or transmitted by me; the only credential-shaped item in scope is the public
  `support@corvus.ai` address already in committed source.
- **No manifest/env/migration/schema change.** The three out-of-scope files that show as modified all
  **predate this wave**: `.env.example` (mtime 2026-09-21 19:36), `package-lock.json` (2026-09-20
  11:09), `apps/gateway/src/db/schema.ts` (2026-09-23 09:15). The schema diff is
  `bot_runtime_config` only — a **different wave** — and does **not** touch `templates.capabilities`
  (grep-confirmed). `v13.ts` is unmodified. For the seed question there is **no migration and no
  schema change at all**, because there is no seed change: data-only, and in fact no data change.
- **No production contact.** All verification was local; the server bound to `localhost:3123` and was
  stopped. No SSH, no Contabo, no GHCR, no live keys.
- **No git-restore.** I ran only read-only `git diff`/`git status`/`git diff --quiet`. No
  `stash`/`checkout --`/`restore`/`reset`; no commit.
- **Review left no residue.** The probe file was removed, and both terms files' SHA-256 match the
  reports' claims **exactly** — `terms/page.tsx` = `f1c2f8d6…68bd8e`, `terms/page.test.tsx` =
  `da4bd0c3…6842a`.

---

## Findings

### F1 — Info / PRE-EXISTING / NOT caused by this wave (route elsewhere)
`apps/gateway` full-suite run: 440/440 **tests** pass, but **1 suite fails to collect**:
`src/start.test.ts` → `[vitest] No "SlashCommandBuilder" export is defined on the "discord.js" mock`,
raised from `src/runtime/moderation/index.ts:586` via `src/runtime/feature-modules.ts:20` in
`src/deploy-commands.ts:15`. The `vi.mock('discord.js', …)` at `start.test.ts:81-106` returns only
`Client`, `GatewayIntentBits` and `Events`.
**This is not this wave's.** The implicated files were last modified `08:06` and `10:28` — before the
wave's `12:28` start — and the landing wave touched **zero** gateway files (its declared scope is two
web files, confirmed by `git diff --name-only`). It must not be charged to this wave, but it should
not be silently dropped either: the suite is red on the merged tree.

### F2 — Low / pre-existing / correctly escalated, still OPEN (the class gap)
The trial-copy over-read class has **four remaining members** the wave did not fix:
`apps/web/app/terms/page.tsx:44` ("A 3-day trial with full access and no card is planned" — **in the
same file** the wave edited, and it *also* calls the trial "planned" while the next section says
"Trial (live)": a genuine internal contradiction), `apps/web/lib/demo/brain.ts:9`, and
`apps/web/app/pryzm/page.tsx:230,923`.
I confirmed line 44 is **byte-identical to HEAD** (`git show HEAD:…`) and still renders in the served
HTML — so it is pre-existing, not a regression.
**Why this is not a FAIL:** the finding this wave was given (inspector #2) cited
`terms/page.tsx:89-90` specifically, so line 44 sits outside its stated range. Both agents found the
remaining members, measured the blocker precisely (out-of-scope test pins at `brain.test.ts:8,45-46`
and `pryzm/page.test.tsx:246`), **escalated instead of silently widening scope**, and recommended one
follow-up task scoped to those five files. That is the correct behaviour under Hard Rule 6 — the
class is legitimately open, and the builder's refusal to half-apply it (writing `brain.ts`, watching
the suite go red, and reverting) is what kept the tree honest. Worth noting the fix is mechanical: 4
string edits + 2 test-expectation edits.

### F3 — Trivial / documentation nit only
The landfix2 report says the updated assertion is at `terms/page.test.tsx:59`; it is at **`:61`** (the
two-line `KI-033` comment inserted before it shifted the line). The report's own diff hunk header
(`@@ -56,7 +56,9 @@`) is consistent with this, and its *content* claim is exactly right — only the
final line number is stale. The sibling landfix report also cites `:59`, which was correct **before**
the comment was added. No action needed.

## Assumptions Made
- "8 kinds" ground truth = `RUNTIME_KINDS` at `apps/gateway/src/runtime/config.ts:11-20`, per the
  inspector's own stated assumption, which I verified directly.
- The inspector's finding #1 as written (writing `['giveaway']`/`['xp']` into the seed) is the
  instruction I adjudicated, since that is the change the builder was told to make and refused.
- `next start`'s standalone warning was treated as a **reason to validate the instrument**, not as a
  blocker — resolved by proving the served HTML contained fresh-only strings.
- The 885/885 web count is the merged-tree truth; I ran it myself rather than compositing the
  agents' per-tree results.

## Open Questions for Orchestrator
1. **Close finding #1 as "premise false."** Recommend accepting the builder's rejection; optionally
   authorise the one-line clarifying comment at `seed-templates.ts:308,349` (contract-locked file, so
   it wants a decision, not a unilateral edit).
2. **F1 — assign the gateway `start.test.ts` collection failure to whoever owns the
   `bot_runtime_config` / moderation wave.** It predates this one but is red on the merged tree.
3. **F2 — authorise the single follow-up task** covering `terms/page.tsx:44`, `brain.ts:9`,
   `pryzm/page.tsx:230,923` plus the two test pins. Scope must include the test files or the change
   cannot land green.

## Public Interface Exposed
- No interface changed by this wave. `NAV_LINKS` remains module-private; `HomePage` and
  `TermsOfServicePage` signatures are unchanged. No exported type, route, or data shape changed.
- Contract this review pins as verified: `templates.capabilities` ∈ the 6-value invite vocabulary
  (`permissions.ts:11-18`) — **not** `RUNTIME_KINDS`; and the 8 template `category` values in
  `brain.ts:7-8` match `TEMPLATE_SEEDS` categories exactly, in order.

## Known Limitations
- **I verified copy/layout from real served HTML + shipped compiled CSS, not a pixel screenshot.** No
  browser was available, so I could not confirm visual rendering (spacing, wrapping) of the new
  qualifier line. The CSS rules and class resolution are confirmed; the pixels are not.
- The gateway runtime behavior behind `RUNTIME_KINDS` was not exercised (out of scope, no production
  contact). My adjudication is of the **vocabulary contracts and their enforcement**, which is what
  finding #1 concerned.
- The gateway suite's 440 tests pass but one file fails to **collect**, so that file's assertions were
  never evaluated. I established it is pre-existing and unrelated; I did not fix it (read-only scope).
- I did not attempt to run the seed against a live database — correctly so, since the seed is
  unchanged and this was a data-vocabulary question, not a migration.
