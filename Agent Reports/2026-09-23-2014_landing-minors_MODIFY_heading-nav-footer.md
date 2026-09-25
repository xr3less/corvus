# Task Report: landing-minors-fix

## Status
SUCCESS — with one criterion re-scoped (see "Criterion 3"), one criterion already satisfied at task start (see "Criterion 2"), and one finding escalated.

Four assigned criteria: **1 changed — 1 line**, **1 already-satisfied (verified, not assumed)**, **1
already-satisfied but strengthened with a real assertion**, **1 pinned as a regression guard, unchanged**.
All four now carry mutation-proven test guards. Every criterion was verified against the **served,
built** artifact, not just source.

## Files Touched
- MODIFIED: `apps/web/app/page.tsx` — **one line only**: `:399` heading gains ` (planned)`
- MODIFIED: `apps/web/app/page.test.tsx` — imports (`readFileSync`, `path`, `styles` from
  `./landing.module.css`) + four new tests appended
- CREATED: `Agent Reports/2026-09-23-2014_landing-minors_MODIFY_heading-nav-footer.md` (this file)

No other file touched. `page.tsx` final sha256 `97e95ecc…faf755`; `page.test.tsx` `7f2f824f…3d8e1a`.

## Dependencies Added
- None. No manifest/lockfile edit, no install.

## Assumptions Made
- **`(planned)` appended to the heading text, rather than a new sub-line.** The sibling wave had
  *already* added a qualifying paragraph at `:401-403`; the inspector's finding was that the **heading
  itself** still read as a live guarantee. Appending to the heading string fixes the heading; adding a
  second paragraph would have duplicated `:401-403`. Matches the file's own dominant idiom (`Planned: …`
  inline on `:419,719,723,727,731,769,…`; `(planned)` inline on `:357,364,367,375,378,386,389,406,411,415`).
- **Nav "distinctness" was interpreted as distinct *targets*, not distinct label→target pairs.** See
  Criterion 2.
- **Footer socials: kept as inert plain text, not removed, not linked.** No Corvus community invite or X
  handle exists anywhere on disk (evidence below), so any `<a>` would have been an invented URL —
  forbidden by the task. The alternative (delete the two entries) is a customer-visible product change
  on a founder-deferred surface, so it stays as the sibling wave left it and is now *guarded*.
- The pre-existing `page.test.tsx` test at `:141` already asserted the SOCIAL tags; my new test adds the
  **affordance** assertion (class) plus a page-wide "no external anchor" invariant.

## Verification

### Criterion 1 — heading carries `(planned)` — **CHANGED**
`page.tsx:398-400`:

```tsx
<h3 className={`${styles.display} ${styles.blockTitle}`}>
  Always on. Always remembered. (planned)
</h3>
```

Verified in the **served production build**: 2 occurrences of the string, **2 qualified, 0 unqualified**
(`<h3>` markup + the RSC flight payload). Instrument control: stripping one qualifier from the HTML in
memory makes the unqualified count `1`, proving the probe can detect a positive rather than always
returning zero (§2.1 / §4.9).

### Criterion 2 — nav anchors distinct — **ALREADY SATISFIED; verified, not assumed**
The premise ("Features/Architecture both → `#bento`") was true at **HEAD** but the sibling `landfix`
wave has **already fixed it** in the working tree: `git show HEAD:…page.tsx` shows
`{ href: '#bento', label: 'Architecture' }` at `:33`, while the working tree has
`{ href: '#how-it-works', label: 'How it works' }`. The reviewer report I was given already logged this
as PASS. Nothing to change — so I added the assertion that makes it **stay** fixed.

Measured on the served HTML: `id="bento"|"how-it-works"|"templates"|"pricing"|"faq"` each resolve
**exactly once**; `Architecture` appears **0 times** in the rendered page. The N-1 space (`#bento`
**and** `#features`) this task class made visible is now explicitly excluded by the new test with its
reason recorded.

### Criterion 3 — footer socials honest — **RE-SCOPED, because the literal instruction was unsatisfiable**
The task said "real links where invite URLs exist on disk, otherwise plain text." **No Corvus community
invite and no Corvus X handle exist on disk.** Exhaustive grep over `*.ts/tsx/md/json/yml/css` (excluding
`node_modules`, `.git`) for `discord.gg|discord.com/invite|x.com|twitter.com` returned only:

| Match | Is it a Corvus community URL? |
|---|---|
| `Antigravity/components/Footer.tsx:92-93` + `Navbar.tsx:97,136` — `https://discord.com`, `https://x.com` | **No** — reference design's links, to the services' **root domains**, not to a Corvus server/handle. Copying these is exactly the "dead-link affordance" the criterion bans. |
| `apps/web/lib/auth/discord.ts:7-9`, `lib/invite/permissions.ts:161` | **No** — OAuth/API endpoints and the per-bot **install** URL (`oauth2/authorize?client_id=…`), not a community invite. |
| `apps/web/app/page.test.tsx:147-148` | No — assertions that these must be absent. |
| `Docs/Marketing/vibebot-deep-research-2026-09-07.md:29` — `discord.gg/sZd8bMbgQk` | **No** — a **competitor's** invite recorded in research notes. |
| `discord.gg` in moderation regexes/tests (`apps/gateway`, `apps/testbot`) | No — spam-detection fixtures. |

So: **zero inventable URLs**, and the current state (plain `<span>`) is the honest one. The criterion is
satisfied by the existing state, and I made it **non-regressable** rather than merely true today.

Verified on the served HTML's Company column, verbatim:

| tag | class | href | text |
|---|---|---|---|
| `<a>` | `footerLink` | `/privacy` | Privacy Policy |
| `<a>` | `footerLink` | `/terms` | Terms of Service |
| `<a>` | `footerLink` | `#top` | Home |
| `<span>` | `footerTag` | **NONE** | Community Discord |
| `<span>` | `footerTag` | **NONE** | X (Twitter) |

**Affordance gap confirmed in the shipped compiled CSS**, not just source — chunk
`.next/static/chunks/27n3fien57fmk.css`:
`…__footerTag{color:#a1a1aa;max-width:20rem;margin:0;font-size:12px;line-height:1.625}` with **no
`:hover`/`:focus` rule at all**, versus `…__footerLink{…}` paired with
`…__footerLink:hover{color:#fff}`. Identical colour and sizing, so appearance is unchanged apart from
the removed interactivity signal. Page-wide: **0 anchors with an external `http(s)` href**.

### Criterion 4 — `page.tsx:731` intact — **UNCHANGED, now pinned**
`Planned: full access to all 8 starter templates` is byte-identical to my pre-edit baseline; the number
**8** is preserved (confirmed non-trial, per task). Diff of my entire `page.tsx` change against my own
baseline is **exactly one line**.

### Mutation proof — every guard broken and watched to fail (§4.1 / §4.9)
Baseline was a copy I made myself **outside the repo** at task start (§7.2); **no git command that
restores from HEAD was run** at any point.

| Mutation applied to `page.tsx` | Failing test (name) | Result |
|---|---|---|
| M1 remove ` (planned)` from heading | `qualifies the always-on heading with (planned), like its own body` | 1 failed / 10 passed |
| M2 restore duplicate `#bento` + `Architecture` label | `gives every top-nav entry a distinct anchor that exists in the page` | 1 failed / 10 passed |
| M3 social back to `<a className={styles.footerLink} href="https://x.com">` | `leaves community entries as plain text with no placeholder hrefs` **and** `keeps the community footer entries free of any link affordance` | 2 failed / 9 passed |
| M4 `8` → `6` starter templates on `:731` | `keeps the Starter template line intact (templates are live, not planned-off)` | 1 failed / 10 passed |
| **control: unmutated** | — | **11 passed / 11** |

### Gates — real project commands, detected not assumed
Toolchain: npm workspaces; `apps/web` scripts `typecheck` = `tsc --noEmit`, `test` = `vitest run`
(vitest **5.0.0**), `lint` = `eslint .`, `format` = `prettier --check`.

| Gate | Command (cwd `apps/web`) | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0** |
| Lint (both files) | `npx eslint app/page.tsx app/page.test.tsx --max-warnings 0` | **exit 0**, zero warnings |
| Format | `npx prettier --check app/page.tsx app/page.test.tsx` | **clean** |
| Page suite | `npx vitest run app/page.test.tsx` | **11/11 pass** |
| **Full web suite** | `npx vitest run` | **927/927 pass, 63/63 files** |
| Production build | `npx next build` | **exit 0**, all routes compiled |

### Real path exercised (not "it compiles")
`npx next build` then `npx next start -p 3199` → `GET /` = **HTTP 200**, 106070 B. Instrument validated
first: the served HTML contains the post-edit-only string, and every assertion above was re-run against
that HTML (corrected-instrument control described in Criterion 1). Server **stopped** — PID 28264 killed,
post-kill probe `HTTP 000` / connection refused, `netstat` shows **no listener on 3199**. A first
`next start` attempt collided with a port already held by my earlier attempt (exit 1); I identified the
holder by PID rather than assuming, and cleaned it up. All local; **no production contact**.

## Findings (escalations — not fixed, out of scope)

### E1 — `apps/web/app/dashboard/bots/[id]/page.test.tsx` fails, and a sibling is editing it live
Three consecutive isolated runs gave `1 failed | 55 passed (56)`:
`× shows the attachment count on the user row only when files are attached` →
`TestingLibraryElementError: Unable to find role="list" and name "Submitted changes"`.
**Attribution proved by controlled experiment, not by timestamp argument:** I reverted **only my** edit
(restoring my pre-edit baseline copy, sibling waves untouched) and the failure **reproduced
unchanged** — so it is not mine. Both that file and its SUT are modified by another wave (11:42/11:46,
hours before my 20:27 edits). While this task ran, that file's mtime advanced to **20:44:44** and the
failure **disappeared** on the next full run (914 → 927 tests, 63/63 green) — i.e. **another agent was
fixing it concurrently**. I did not touch it. **The 927/927 figure is therefore a moving target: it is
true as of 20:46:38 on a tree a sibling is still writing.** The orchestrator must re-run the full gates
on the frozen merged tree after all waves stop (§6.1) — I flag this rather than claim the number.

### E2 — `Class`-level residue of Criterion 2, named and excluded with reason
The task's own framing ("no both → `#bento`") describes an N-1 *space*, not one defect. I enumerated the
whole space in `page.tsx`: **0 duplicate targets remain in `NAV_LINKS`** (5 entries, 5 distinct hrefs),
and the footer's own duplicate-pair pattern (`#bento`/`Features` at `:920,935`; `#how-it-works` at
`:917,938`) is **excluded** because footer entries are cross-column shortcuts, not a nav set — distinct
*labels*, distinct *columns*, and the reviewer already PASSed that region. Recorded so the omission is
deliberate, not silent (§3.2).

### E3 — Sibling work is mid-flight in `page.tsx`'s blast radius
`page.tsx` carries uncommitted edits from at least three waves (landfix labels/qualifier/footer at
~12:28, dashland at ~14:10, mine at 20:30). My edit is a single line, so clobber risk from my side is
nil, but **no wave should commit this file until the siblings report done**.

## OSS-FIRST RESEARCH
10-minute scan for landing-honesty patterns in OSS. Named repos/rules, cited:

1. **`anonmesh/mobile_app` — `.github/workflows/honesty-check.yml`** — a CI gate that greps the diff for
   present-tense claims about unshipped capabilities and **fails the build** unless the copy is reframed
   as coming-soon or wrapped in a `PreviewBadge`. Directly validates this wave's approach: honesty about
   unshipped state is enforced mechanically, not by prose discipline.
   <https://github.com/anonmesh/mobile_app/blob/95154f9f030dda74b880849fa2c80b9052de7433/.github/workflows/honesty-check.yml>
2. **`nexu-io/open-design` PR #4417 — "feat(landing): trust/EEAT pages + footer rebuild"** — a real
   landing fix whose changelog is the closest published analogue to this task: *"Dead RSS and contact
   links removed"*, footer rebuilt, one shared footer as a single source of truth.
   <https://github.com/nexu-io/open-design/pull/4417>
3. **`jsx-eslint/eslint-plugin-jsx-a11y` — `anchor-is-valid`** (`recommended` + `strict`) — official rule:
   an `<a>` needs a valid `href`; `#`, empty, and `javascript:` are invalid, and *"preferably use another
   element (such as `div` or `span`) for display of text."* This is the exact rule behind Criterion 3 —
   the chosen `<span className={styles.footerTag}>` is the rule's own recommended remedy.
   <https://github.com/evcohen/eslint-plugin-jsx-a11y/blob/master/docs/rules/anchor-is-valid.md>
   (companion: `lit-a11y/anchor-is-valid`, <https://github.com/open-wc/open-wc/blob/master/docs/docs/linting/eslint-plugin-lit-a11y/rules/anchor-is-valid.md>)
4. Corroborating static-analysis rule **`unclear-anchor-url`** (SiteLint) — flags `href="#"`, empty href,
   and `javascript:`; exempts hash links whose target id exists (which is why `#bento`-style anchors are
   legitimate **only** when the id resolves — the Criterion 2 assertion).
   <https://www.sitelint.com/docs/accessibility/links-must-have-a-clear-valid-destination>

**Next.js `AGENTS.md` caution honoured:** I read `apps/web/AGENTS.md`, which warns this Next.js version
differs from training data and directs reading `node_modules/next/dist/docs/`. My change touches **no**
Next.js API — only JSX text, a module-private const, and class names — so no guide was implicated. The
routes I exercised (`GET /`) are the app's own, unchanged.

## Public Interface Exposed
- No exported signature changed. `HomePage` unchanged; `NAV_LINKS` remains module-private.
- `apps/web/app/landing.module.css` was **not** modified (documented here because the new test reads its
  class map).
- Contract this task pins as verified: **(a)** every `NAV_LINKS.href` resolves to an `id` present in
  `page.tsx`; **(b)** the two community footer entries are `<span className={styles.footerTag}>` with no
  `href`; **(c)** the landing page contains **no** anchor with an external `http(s)` href; **(d)**
  `page.tsx:731` reads `Planned: full access to all 8 starter templates`.

## Known Limitations
- **Verified from served HTML + shipped compiled CSS, not a pixel screenshot.** No browser tooling was
  available to this task, so visual rendering (spacing, wrapping) of the amended heading is not
  screenshot-confirmed. The CSS rules, class resolution, and DOM structure **are** confirmed. The added
  ` (planned)` is plain text inside an existing heading and adds no new class, so the layout risk is
  minimal but is not zero-by-measurement.
- The concurrent sibling edit (E1) means my full-suite number cannot be treated as the frozen-tree
  truth; the orchestrator owns that re-run.
- I did not exercise `/terms`, `/gallery`, or the dashboard routes — outside this task's scope.
- No production, box, GHCR, or live-key contact. No secret value read, printed, or transmitted. **No
  `stash`/`checkout --`/`restore`/`reset`, no commit, no manifest/env/migration edit, no install.**
  My one baseline mechanism was a file copy made **outside** the repo at task start.
- **One self-inflicted incident, disclosed:** my first mutation loop used a shell `trap … EXIT` whose
  restore copied a baseline taken **before** my heading edit, so it reverted that line mid-loop. I caught
  it on the hash check, re-applied the edit, and re-measured **all four** mutations cleanly from the
  corrected baseline (the confounded counts — M2: 2, M3: 3 — are superseded by the table above). The
  final file hash was verified equal to the intended baseline afterward. Sibling-wave work in the same
  file was **never** at risk: the restore wrote only `page.tsx` from a copy I made, and it survived
  intact.

## Open Questions for Orchestrator
1. **Re-run the full gates on the frozen merged tree.** A sibling was editing
   `dashboard/bots/[id]/page.test.tsx` during my run (`mtime 20:44:44`), and the full-suite result changed
   under me (914→927). My 927/927 is honest but **not** the frozen-tree number (§6.1).
2. **Confirm the `(planned)`-on-heading style** is the house preference, versus a sub-line. I chose the
   inline form because `:401-403` already carried a qualifying paragraph and inline `(planned)`/`Planned:`
   is the file's dominant idiom. Founder-visible copy, so flagged rather than silently locked.
3. **Footer socials remain inert by design.** No invite URL exists, so the honest options were "plain
   text" (chosen, preserves the promise the page names) or "remove the two entries" (a customer-visible
   product change). If the founder prefers removal, it is a two-line change plus one test edit — but it
   is his call, and the current state is guarded either way.
4. **`page.tsx` is shared by ≥3 uncommitted waves.** Recommend no commit of this file until all siblings
   report done, per E3.
