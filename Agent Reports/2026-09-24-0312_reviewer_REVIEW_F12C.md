# Task Report: review-F12C

## Status

**PASS** — on the F12C deliverable, and on the environment repair.

The assigned fix is correct, complete, and I re-derived it with my own instrument
rather than trusting the build report:

- The dead `['search placeholder', 'Search bots...']` residue entry is **gone**
  (independent count: 32 entries, was 33 with it — and my isolation probe
  re-created the 33-entry list and reproduced the pre-fix green).
- The direct `getByPlaceholderText('Botlarda ara…')` assertion **is live and is
  the sole guard on that string** — proven by removing it in a copy, leaving the
  dead entry as the only guard, and watching English ship with 25/25 green.
- The header comment's new claim is not merely reworded, it is **measured true**:
  I mutated all six of the page's attribute-carried strings and reproduced the
  report's trial table exactly (7/1/6/2/2/1).
- The placeholder literal **byte-matches the source including U+2026**, and the
  ASCII-dots variant does **not** match.
- The shared `node_modules` damage F12C caused is **repaired**: all six
  `@vitest/*` packages and every nested dep are back at their locked versions,
  `vitest` at root is a real directory (not a junction), and all four workspaces
  now pass **under their declared vitest majors**.

**One report-accuracy defect, no effect on the verdict:** the blast-radius table's
suite counts for `packages/spec` (112) and `packages/ai` (316) are **exactly 2×**
the true declared-config counts (56 and 158). I reproduced both inflated figures
precisely by clearing vitest's default `dist/` exclusion, so they are stale
compiled duplicates of the same tests, not additional coverage. The table's
*conclusion* (all four suites green) still holds — and the corrected post-repair
figures are the stronger claim.

Read both required reports in full. Read no other report; did not scan the
directory.

---

## Files Touched

- CREATED: `Agent Reports/2026-09-24-0312_reviewer_REVIEW_F12C.md` (this review —
  the only file I wrote)
- READ ONLY: `apps/web/app/dashboard/bots/page.test.tsx`,
  `apps/web/app/dashboard/bots/page.tsx`, `apps/web/package.json`,
  `apps/web/vitest.config.mjs`, `package-lock.json`, `.gitignore`,
  `packages/{spec,ai}/vitest.config.ts`, `apps/gateway/vitest.config.mjs`
- All mutation work ran on a **full copy** outside the repo (see "Instrument").
  No source, test, manifest, lockfile, `.env`, or git state was edited. No
  install, no `git restore`/`checkout`/`stash`/`reset`/`commit`/`push`.

---

## Independent Verification

### 1. Toolchain — detected from manifests, never assumed

| Component  | Command / manifest            | Resolved | Locked by task | Match |
| ---------- | ----------------------------- | -------- | -------------- | ----- |
| TypeScript | `npx tsc --version`           | 5.9.3    | 5.9 strict     | YES   |
| ESLint     | `npx eslint --version`        | 9.39.5   | 9 flat config  | YES   |
| Prettier   | `npx prettier --version`      | 3.9.6    | 3.9.6          | YES   |
| Vitest (web) | `apps/web/package.json`     | 5.0.0    | 5.0.0          | YES   |
| Vitest (spec/ai/gateway) | their manifests | 3.2.7 | 3.x           | YES   |
| Node / npm | `node --version` / `npm -v`   | 24.15.0 / 11.12.1 | —      | —     |

Manager: npm workspaces — root `package.json` `workspaces: ["apps/*","packages/*"]`,
`package-lock.json` present. Root itself declares `vitest@^3.0.0` as a devDep.
Nothing assumed; every value read from a manifest or the tool's own banner.

### 2. Gates on the merged tree — true exit codes, never through a pipe

All run on the on-disk working tree (the wave is uncommitted), cwd as noted:

```
$ cd apps/web && npx tsc --noEmit                                            # EXIT 0
$ cd apps/web && npx vitest run app/dashboard/bots/page.test.tsx             # EXIT 0 — 1 file, 25 passed (25)
$ cd <root>  && npx eslint apps/web/app/dashboard/bots/page.test.tsx --max-warnings 0   # EXIT 0
$ cd <root>  && npx prettier --check apps/web/app/dashboard/bots/page.test.tsx          # EXIT 0 — "All matched files use Prettier code style!"
```

Suite banner confirms the declared major in the workspace under test:
`RUN v5.0.0 C:/Users/xr3less/Desktop/corvus/apps/web`.

Counts: `it(` ×25, `expect(` ×122 (was 121 — the +1 is the new assertion),
`.only(`/`.skip(` ×0. Matches the build report exactly.

### 3. Cited bytes — read and compared, not retyped

Read programmatically out of the source and the test, then compared byte-for-byte:

```
page.tsx:225  =>  "                    placeholder=\"Botlarda ara…\""
placeholder codepoints: U+0042 U+006F U+0074 U+006C U+0061 U+0072 U+0064 U+0061
                        U+0020 U+0061 U+0072 U+0061 U+2026
src  utf8 bytes: 66 111 116 108 97 114 100 97 32 97 114 97 226 128 166
test utf8 bytes: 66 111 116 108 97 114 100 97 32 97 114 97 226 128 166
BYTE-EQUAL: true
`Botlarda ara...` (ASCII dots) byte-equal to source: false    <- the guard pins U+2026 too
```

- **U+2026 HORIZONTAL ELLIPSIS confirmed present** on both sides (`226 128 166`).
- **Dead entry gone:** `page.test.tsx` no longer contains `search placeholder`.
  `ENGLISH_RESIDUE` holds **32** entries; line 42 is now `['page title', 'Bots'],`.
- **Header comment** (`page.test.tsx:16-23`) now reads: *"`ENGLISH_RESIDUE` sweeps
  `document.body.textContent`, so it catches text-node strings only — it is
  structurally blind to strings carried by attributes. The one attribute-carried
  string this page owns with no compensating assertion is the search input's
  `placeholder`, and it is covered by the direct `getByPlaceholderText` assertion
  in the search-control test below, not by the sweep."* The F12B overclaim is gone.
- The removed entry's rationale is recorded in the list's doc comment
  (`page.test.tsx:35-40`) so it is not re-added — verified present.
- The new assertion sits at **`page.test.tsx:172`**, confirmed independently by
  vitest's own failure trace in probe A below (`page.test.tsx:172:19`).

### 4. The guard, re-derived with my own instrument

I did **not** trust the report's mutation run. I rebuilt it from a full copy and
ran both directions plus a control.

```
A  source reverted to English, new assertion PRESENT
   => 1 failed | 24 passed (25), EXIT 1
      AssertionError, stack root: app/dashboard/bots/page.test.tsx:172:19
      (getByPlaceholderText on the mutated input)

B  source still English, new assertion REMOVED, dead entry RESTORED
   => 25 passed (25), EXIT 0
      executable `expect(screen.getByPlaceholderText…` count in the copy = 0
      residue entries in the copy = 33
      remaining occurrences are comment text only (lines 22, 39)

C  copy restored from the repo (control, byte-identical hashes)
   => 25 passed (25), EXIT 0
```

**Run A is the required proof**: reverting the source to English now fails the
suite, where before this fix every gate stayed green.
**Run B is the decisive isolation probe**: with the dead entry as the *only*
guard, English ships with a fully green suite — proving that entry could never
fire and that this assertion is the sole guard on this string.
**Run C** confirms the instrument was clean between runs.

Note on Run B: my first log line printed `false` for "assertion removed" because
the header comment contains the same `getByPlaceholderText('Botlarda ara…')`
substring. That was a **wrong instrument reading, not a wrong result** — I caught
it against my own output, re-inspected by matching `expect(screen.` at line start,
and got `executable assertion count = 0`. Flagging it because a check that reads
a comment as code is exactly how a broken instrument reports green.

### 5. Class enumeration — I did not stop at the named instance

The header comment now asserts the placeholder is the **one** attribute-carried
string without a compensating assertion. That claim had to be **tested, not
asserted**, so I mutated each of the page's six attribute strings back to its true
pre-task English baseline and ran the suite on each:

| # | Attribute (page.tsx line) | Baseline (from `.bak`) | My result |
| - | ------------------------- | ---------------------- | --------- |
| 1 | `aria-label="Botların"` (185) | `"Your bots"` | **TRIPPED** — 7 failed \| 18 passed |
| 2 | `aria-label="Botları duruma göre filtrele"` (204) | `"Filter bots by status"` | **TRIPPED** — 1 failed \| 24 passed |
| 3 | `aria-label="Bot kartları"` (291) | `"Bot cards"` | **TRIPPED** — 6 failed \| 19 passed |
| 4 | card template `bot detayını aç` (313) | `"open bot detail"` | **TRIPPED** — 2 failed \| 23 passed |
| 5 | `aria-label="Kurulum ilerlemesi"` (357) | `"Build progress"` | **TRIPPED** — 2 failed \| 23 passed |
| 6 | **`placeholder="Botlarda ara…"` (225)** | `"Search bots..."` | **TRIPPED** — 1 failed \| 24 passed |

**All six now trip, and the failure counts reproduce the build report's table
exactly (7 / 1 / 6 / 2 / 2 / 1).** The five `aria-label`s trip through separate
role/name assertions that happen to cover the same strings — which is precisely
why they were harmless dead entries and the placeholder was not. The comment's
claim is therefore measured, not assumed. The pre-task baseline file
`%TEMP%/f12-backup/page.tsx.bak` exists and carries exactly these English values
at lines 168/187/208/274/294/338, so the revert targets were the genuine
pre-Turkish bytes rather than a guess.

### 6. Environment repair — VERIFIED (I did not re-run it)

Root store, checked as filesystem objects, not by version string alone:

```
node_modules/vitest            attrs=Directory  linkType=(empty)  Target=(none)  version=3.2.7
node_modules/@vitest/expect         version=3.2.7  link=(empty)
node_modules/@vitest/utils          version=3.2.7  link=(empty)
node_modules/@vitest/runner         version=3.2.7  link=(empty)
node_modules/@vitest/snapshot       version=3.2.7  link=(empty)
node_modules/@vitest/pretty-format  version=3.2.7  link=(empty)
node_modules/@vitest/spy            version=3.2.7  link=(empty)
```

Every nested dep the F12C report listed as MISSING is back **at its locked
version**: `vitest/node_modules/@vitest/mocker` 3.2.7, `vite` 7.3.6, `chai` 5.3.3,
`magic-string` 0.30.21, `std-env` 3.10.0, `tinybench` 2.9.0, `tinyexec` 0.3.2,
`@vitest/expect/node_modules/chai` 5.3.3, `@vitest/snapshot/node_modules/magic-string`
0.30.21. **No junction remains at root** — a deep recursive scan of the whole root
`node_modules` (29,093 files) found reparse points only at the five legitimate
`@corvus/{ai,gateway,spec,testbot,web}` workspace links. `npm ls vitest --all`
resolves `apps/web` → 5.0.0 and spec/ai/gateway/testbot → 3.2.7 deduped, exit 0.

The four suites, each under its **declared** major:

| Workspace | Declares | Banner | Result | Exit |
| --------- | -------- | ------ | ------ | ---- |
| `apps/web` | `vitest@5.0.0` | v5.0.0 | **994 passed (65 files)** | **0** |
| `packages/spec` | `vitest@^3.0.0` | v3.2.7 | **56 passed (3 files)** | **0** |
| `packages/ai` | `vitest@^3.0.0` | v3.2.7 | **158 passed (6 files)** | **0** |
| `apps/gateway` | `vitest@^3.0.0` | v3.2.7 | **464 passed (35 files)** | **0** |

Every workspace now runs the major its manifest declares — the pre-repair drift
the build report measured (`spec`/`ai`/`gateway` resolving 5.0.0 despite declaring
`^3.0.0`) is **gone**. The report's own flagged latent hazard —
`node_modules/vite/dist/node/chunks/node.js` importing the then-deleted
`@vitest/utils` — is **cleared**: `@vitest/utils@3.2.7` is present again.

**`package-lock.json` testbot stanza — noted, not touched.** The lockfile diff vs
`HEAD` is **18 insertions** and contains *only* the `apps/testbot` and
`node_modules/@corvus/testbot` stanzas. **No vitest stanza is in the diff**, so the
repair install did not rewrite the lockfile's dependency graph. `apps/testbot/` is
untracked (`?? apps/testbot/`) and matches the `apps/*` workspace glob, so a
concurrent wave's in-flight workspace was picked up by the repair `npm install`.
Peer work, not F12C — left exactly as found.

---

## Findings

### Finding 1 (report accuracy, not a deliverable defect) — the blast-radius table's spec/ai suite counts are exactly 2× the true declared-config counts

The F12C report's "Measured blast radius" table lists `packages/spec` as
**112 passed** and `packages/ai` as **316 passed**. On the workspaces' own
declared configuration the true figures are **56** and **158**.

I did not stop at noticing the difference — I reproduced the report's numbers
exactly, which identifies the cause:

```
packages/spec, declared config            => 3 files,  56 passed   <- correct
packages/spec, dist/ exclusion cleared    => 6 files, 112 passed   <- the report's number
packages/ai,   dist/ exclusion cleared    => 12 files, 316 passed  <- the report's number
```

`packages/spec/dist/*.test.js` and `packages/ai/dist/*.test.js` are stale
compiled copies of the same tests (`explain.test.ts` 16 ↔ `explain.test.js` 16,
`index` 9 ↔ 9, `simulate` 31 ↔ 31). Vitest excludes `**/dist/**` by default; the
report's instrument did not, so each test was counted twice.

**Why `apps/gateway` was unaffected (464 in both):** its config pins
`include: ['src/**/*.test.ts']` explicitly, so it can only ever collect from
`src/`. That one workspace agreeing across both configurations is what confirms
the mechanism rather than leaving it a guess.

**Impact — the conclusion survives, the numbers do not.** The table existed to
show the three drifted workspaces still pass; they do, under either
configuration. Nothing about the guard fix or the environment verdict changes.
But the counts as printed do not describe the workspaces' declared test suites,
and the corrected post-repair figures (56 / 158, at 3.2.7) are the stronger claim.
This is `LESSONS.md` §1 rule 1 — *validate the instrument* — where the instrument
happened to err toward a larger, more reassuring number.

### Non-findings — checked against suspicion, all clear

- **The guard is not circular.** `expectNoEnglishResidue()` is a negative sweep
  over `document.body.textContent`; each test separately asserts the Turkish
  positives by role and name. Non-vacuous by construction and by the isolation
  probe in §4(B).
- **No test was weakened.** 25 `it(` / 122 `expect(`; no `.only`/`.skip`; the new
  assertion was added *inside* an existing `it`, so the suite count correctly
  stays 25. No deleted test, no loosened matcher. `expect(` rose by exactly one.
- **The comment's claim is true, not decorative.** Verified by mutation, not by
  reading it (§5).
- **`page.tsx` untouched by this fix.** sha256
  `2b7b552bd8e847c7993bbc8834d3c4f8c7642fb94c12e50c99641a6011d11b82` — identical
  to the value F12B recorded — and its mtime (23:24) predates the test file's
  (00:19). The fix is test-only, as its report claims.
- **The `BuilderProgress` exclusion is real and documented**, in both source and
  test, and independently asserted (`getByText('No run started')`). A stated,
  deliberate exclusion — not a blind spot. The residue list still carries the
  English `No run started`-adjacent entries it should.
- **`getByPlaceholderText` is this codebase's own idiom**, not a new pattern:
  `bots/[id]/page.test.tsx:294` and `components/ui/Input.test.tsx:11` both use it.
  Confirmed by reading both files.

---

## Accuracy of build report (`2026-09-24-0312_f12placeholder_FIX_search-guard.md`)

| Claim | Verdict |
| ----- | ------- |
| Dead `['search placeholder', 'Search bots...']` entry removed | **TRUE** — 32 entries, substring absent |
| Direct assertion added, inside an existing `it` | **TRUE** — `page.test.tsx:172`, suite stays 25 |
| Header comment no longer overclaims `textContent` sweep | **TRUE** — `:16-23`, states text-node-only + attribute blindness |
| Rationale recorded so the entry is not re-added | **TRUE** — `:35-40` |
| Placeholder byte-equal to source **including U+2026** | **TRUE** — `226 128 166` both sides, ASCII-dots ≠ |
| 25 `it(` / 122 `expect(`, no `.only`/`.skip` | **TRUE** |
| Focused suite 25 passed, EXIT 0 | **TRUE** — reproduced |
| `tsc --noEmit` / eslint / prettier all clean, EXIT 0 | **TRUE** — all three reproduced |
| Mutation A trips at `:172` | **TRUE** — reproduced, 1 failed \| 24 passed, EXIT 1 |
| Mutation B (pre-fix guard state) stays green | **TRUE** — reproduced, 25 passed, EXIT 0 |
| Mutation C control green | **TRUE** — reproduced |
| Class table: 5 aria-labels TRIPPED, placeholder TRIPPED only after fix | **TRUE** — 7/1/6/2/2/1, exact match |
| Only `page.test.tsx` modified; `page.tsx` sha256 `2b7b552b…` | **TRUE** |
| No manifest/lockfile/`.env`/install touched by this fix | **TRUE** — lockfile diff is testbot-only; `.env.example` 09-21; `apps/web/package.json` 09-19 |
| node_modules damage description (exact drift list) | **TRUE as history** — every named package was absent; all now restored |
| Blast-radius suite counts: spec **112**, ai **316** | **FALSE** — true declared-config counts are **56** / **158**; the printed figures are a 2× stale-`dist/` double-count (Finding 1) |
| Blast radius: all four suites pass, EXIT 0 | **TRUE** — and post-repair they pass at their declared majors |
| Blast-radius count for `apps/gateway` 464 | **TRUE** — matches mine (config pins `src/`) |

The report is **accurate about everything it did** and about its own escalation.
Its single defect is measurement, not behaviour: two suite counts taken with an
instrument that did not exclude stale build output. It did not overclaim the
fix — it statused itself `PARTIAL` and escalated the damage rather than hiding it,
which is the correct call.

---

## Scope / artifacts / hygiene

- **Artifacts on disk.** Both cited reports exist and were read in full; their
  filenames match the task prompt. My own review file is the only file created.
- **Post-verification hashes identical to pre-verification hashes:**
  ```
  page.tsx       2b7b552bd8e847c7993bbc8834d3c4f8c7642fb94c12e50c99641a6011d11b82
  page.test.tsx  81485eff051f1b524e0f6345a2706dba4b52e7337ff8eb565982d8e1cc3611c1
  ```
  The test file's `81485eff…` matches the post-fix value in the build report, and
  the pre-fix `14131a66…` matches the value F12B recorded — the chain is unbroken.
- **Only `page.test.tsx` changed by this fix.** `page.tsx` is byte-identical to the
  hash both the builder and the prior reviewer recorded, and its mtime is older.
  `apps/web/package.json` (09-19) and `.env.example` (09-21) both predate the wave
  entirely. The lockfile diff contains no vitest stanza.
- **The wave is broad and uncommitted** (~150 modified paths from the whole
  Turkish/expansion wave), so `git status` alone cannot isolate a footprint; the
  per-file hash + mtime evidence above does. I ran **no** git command that writes
  to the tree.
- **Instrument (mine, deliberately different from F12C's).** Filed at
  `%TEMP%/f12c-instrument` as a **full copy** of root `node_modules` +
  `apps/web` + `packages/` + root manifests — **`robocopy`, never junctions**,
  precisely because junction-and-delete is what broke the shared store.
  **Validated before use:** a deep scan found **0 reparse points** inside the
  copy; the control run reproduced 25 passed / EXIT 0 at **vitest 5.0.0**, read
  from the runner banner, matching the workspace's declared major; the copied
  `page.tsx`/`page.test.tsx` hashes were byte-identical to the repo's before every
  run. **Deleted at the end, behind four guards** (must be under `%TEMP%`; must
  not itself be a link; **abort if any reparse point exists anywhere inside**;
  repo files present) — the delete reported `reparse points inside instrument: 0`
  and `exists now = false`. Repo files confirmed present afterwards. No probe
  script or temp artifact remains in the repo.
- **Pre-existing, not F12C's, recorded so it is not mistaken for review residue:**
  `apps/web/.vitest/` and `apps/web/tsconfig.tsbuildinfo` are untracked build
  outputs; `.playwright-mcp/` and `apps/web/suite-final.log` are from unrelated
  earlier waves. None touched by me.
- **Minor, pre-existing:** root `node_modules` is ~578 MB / 29,093 files, so its
  mtimes are noisy after any install — which is why I verified the repair by
  package version + link type rather than by timestamp.

---

## Assumptions Made

1. **"Merged tree" = the on-disk working tree**, the wave being uncommitted
   (same definition F12B used). `HEAD` is not the baseline for this fix.
2. **"Declared vitest major"** is the version in the workspace's own
   `package.json` plus the version the runner banner reports when invoked from
   that workspace — not the root store's version. This is the distinction the
   pre-repair drift turned on, so I checked the banner every time.
3. **The pre-task English baseline** for the class enumeration is
   `%TEMP%/f12-backup/page.tsx.bak`, verified present and carrying the expected
   English literals at the expected lines, rather than `HEAD` (which predates the
   Turkish wave entirely).
4. **Mutation testing on a copy outside the repo** is an acceptable substitute for
   mutating the real tree: the copy is byte-identical at the start and end of each
   run and the real files' hashes are unchanged afterwards.
5. **No web research needed** — this task involves no versions, model names, APIs,
   or pricing. Stated per the RESEARCH FIRST section. (The version figures above
   are read from manifests and tool banners, not recalled.)

## Open Questions for Orchestrator

1. **Finding 1 is a report-accuracy correction, not a blocker.** The F12C fix and
   the environment repair both pass. If the blast-radius table is being relied on
   as evidence anywhere, substitute the declared-config figures: spec **56**,
   ai **158**, gateway **464**, web **994**.
2. **The stale-`dist/` instrument defect looks like a class, not an instance.**
   Any agent measuring `packages/spec` or `packages/ai` suite counts risks the
   same 2× inflation, and it inflates *toward* reassurance. Worth a standing rule
   for the instrument recipe: report the runner banner's file/test counts and the
   workspace's declared major alongside every suite figure, so a doubled count is
   visible as a doubled file count. (Fixing it in the harness, not per-run —
   Principle 8 / Hard Rule 16.)
3. **The F12C node_modules failure mode deserves the standing rule its author
   proposed.** The defect was not the junction, it was **deleting through a path
   that traverses one**. My instrument recipe above (full copy, zero-reparse-point
   assertion before use, and a guarded delete that aborts on any internal link)
   is a working implementation of that rule if you want to fold one into the
   template.
4. **`apps/testbot` is untracked but now carries a lockfile stanza** from the
   repair install picking up a concurrent wave's workspace. Peer work — left
   untouched. It needs an owner before any commit, or the lockfile and the tree
   will disagree about whether that workspace exists.
5. **Carried forward, unchanged, still unowned:** D-004 (`Docs/DECISIONS.md`,
   English-only) still contradicts the shipped Turkish wave. One owner needed, not
   a per-page fix. (Unchanged by this task; noted so it is not lost.)

## Public Interface Exposed

Unchanged. `page.tsx` is byte-identical (sha256 `2b7b552b…`), so `BotsPage`'s
signature, the `lib/bots` imports (`fetchBots`, `formatCount`, `STATUS_RANK`,
`TRIAL_EXPIRED_MESSAGE`, the `BotStatus`/`BotsSnapshot`/`MockBot` types), the data
flow, and every href are untouched. The only interface this task added is
test-internal: one assertion inside an existing `it` block, and one doc-comment
correction. No source, manifest, lockfile, or environment variable changed.

## Known Limitations

- I verified the **page's own** strings. Shared components reached from this page
  (`BuilderProgress`) remain English by design, are excluded from the guard, and
  are documented and asserted. Out of this task's scope.
- **I did not exercise the app over HTTP** (no dev server or auth session in this
  review). Every claim rests on a gate exit code, a file byte, or a redirected
  jsdom render. Per `LESSONS.md` §2.4 that is weaker than a human completing the
  flow in the running app; for a guard-pin verification it is appropriate, but it
  is the reason "English would ship" rests on a mutation plus a DOM assertion
  rather than a screenshot. The prior F12B reviewer and the builder both record
  the same limitation.
- My class enumeration is bounded by what I could enumerate mechanically
  (attribute literals in `page.tsx`). A user-visible string composed at runtime
  from fragments outside those patterns would not appear in it. I found six
  attribute-carried strings and tested all six; I did not attempt an exhaustive
  runtime-string audit of the module graph.
- **The 2× dist inflation is reported, not repaired.** Excluding stale build output
  is a configuration change outside a reviewer's write scope; I measured both
  configurations and reported the true figures instead. It affects neither fix.
- I did not run the full repo-wide gate set (only the focused suite plus the four
  workspace suites); other workspaces' suites (`apps/testbot`, which is untracked
  and in flight) were not run because they belong to a concurrent wave.
