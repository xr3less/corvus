# Task Report: F12C-placeholder-guard

## Status

**PARTIAL**

Split verdict — read both halves:

- **The assigned deliverable is COMPLETE and independently verified.** The dead
  `['search placeholder', 'Search bots...']` entry is gone, a direct
  `getByPlaceholderText('Botlarda ara…')` assertion now guards the string, the
  header comment no longer overclaims the `textContent` sweep, and a mutation
  proof shows reverting the source to English fails the suite. All required
  gates exit 0.
- **I introduced an out-of-scope regression in my own throwaway instrument and
  did NOT self-repair it.** While assembling the temp-copy instrument I deleted
  eight real directories from the repo's shared `node_modules` store and
  replaced two of them with junctions into `apps/web`'s tree. Full detail,
  evidence, and the one-command remedy are in **Open Questions** item 1 — that
  is the item that needs the orchestrator's decision, not the guard fix.
  I stopped and escalated rather than repairing, because the repair requires an
  `install` command this task explicitly forbids.

## Files Touched

- MODIFIED: `apps/web/app/dashboard/bots/page.test.tsx` (only file written in
  the source tree; sha256 `14131a66…` → `81485eff…`)
- READ ONLY: `apps/web/app/dashboard/bots/page.tsx` (byte source for the
  placeholder; sha256 unchanged at `2b7b552b…`)
- CREATED: `Agent Reports/2026-09-24-0312_f12placeholder_FIX_search-guard.md`
  (this report, the assigned output)
- **OUT-OF-SCOPE, INADVERTENT (not a source file):** `node_modules/vitest` and
  `node_modules/@vitest` in the repo root store, plus six packages under them —
  see Open Questions 1. No tracked file was affected.

No source file other than the test file was written. No manifest, lockfile,
`.env`, or git state touched. No `git restore`/`checkout`/`stash`/`reset` run.

## Dependencies Added

None. No install command was run.

## Changes (exact, with line numbers)

1. **Header comment corrected** (`page.test.tsx:16-23`). Previously claimed
   *"every string this page owns is asserted in Turkish below, and
   `ENGLISH_RESIDUE` fails if one comes back"* — false, because the sweep reads
   `document.body.textContent` and is structurally blind to attribute-carried
   strings. Now states the sweep catches text-node strings only, names the
   placeholder as the one attribute string lacking a compensating assertion, and
   points at the direct assertion that covers it.
2. **Dead residue entry removed** (`page.test.tsx:42`, formerly
   `['search placeholder', 'Search bots...'],`). Deleted rather than annotated,
   and the reason is recorded in the list's doc comment
   (`page.test.tsx:35-40`) so it is not re-added: the entry could never fire
   whatever text it held, because the channel — not the string — was the defect.
3. **Direct assertion added** (`page.test.tsx:168-172`), inside the existing
   `renders the Bots title block with the search control` test:
   `expect(screen.getByPlaceholderText('Botlarda ara…')).toBeTruthy();`

No new `it` block, so the suite count correctly stays at 25.

## Assumptions Made

- No web research needed — this is a copy/guard fix, no versions, model names,
  APIs, or pricing involved. Stated per the task's RESEARCH FIRST section.
- `apps/web` is the workspace that owns the suite; `npx vitest` and
  `npx tsc --noEmit` run from `apps/web`, `eslint`/`prettier` run from the repo
  root against the workspace path. Read from `apps/web/package.json` and
  `vitest.config.mjs`, not assumed.
- "Reverting to English" means `placeholder="Search bots..."` with three ASCII
  dots — the pre-Turkish baseline the F12B review cites at `page.bak:208`.
- `ENGLISH_RESIDUE` stays a `[string, string][]`; removing one entry needs no
  type change.
- The `getByPlaceholderText` idiom is established in this repo
  (`bots/[id]/page.test.tsx:294`, `Input.test.tsx:11`), so this is the codebase's
  own pattern, not a new one.

## Verification

Every command below was run with its true exit code captured directly
(`echo $?` / `${PIPESTATUS[0]}`), never read through a pipe's status.

### Placeholder bytes — copied from source, never retyped

Read programmatically out of `page.tsx` line 225 and compared byte-for-byte
against the literal in my new assertion:

```
src  : "Botlarda ara…"  U+0042 U+006F U+0074 U+006C U+0061 U+0072 U+0064 U+0061 U+0020 U+0061 U+0072 U+0061 U+2026
test : "Botlarda ara…"  U+0042 U+006F U+0074 U+006C U+0061 U+0072 U+0064 U+0061 U+0020 U+0061 U+0072 U+0061 U+2026
utf8 bytes both sides: 66 111 116 108 97 114 100 97 32 97 114 97 226 128 166
BYTE-EQUAL: true
```

The **U+2026 HORIZONTAL ELLIPSIS is confirmed present**, encoded as
`226 128 166` — byte-identical on the source and test sides. The ASCII-dots
variant (`Botlarda ara...`) compares **not equal**, so the guard pins the
ellipsis too, not just the words.

### Gates on the real tree

| Command (cwd) | Result | Exit |
| ------------- | ------ | ---- |
| `npx vitest run app/dashboard/bots/page.test.tsx` (apps/web) | 1 file passed, **25 passed (25)** | **0** |
| `npx tsc --noEmit` (apps/web) | clean | **0** |
| `npx eslint apps/web/app/dashboard/bots/page.test.tsx --max-warnings 0` (root) | clean | **0** |
| `npx prettier --check apps/web/app/dashboard/bots/page.test.tsx` (root) | "All matched files use Prettier code style!" | **0** |

Counts after the change: 25 `it(`, **122** `expect(` (was 121 — the +1 is the
new assertion). No `.only`/`.skip`.

### Mutation proof — my own instrument, temp copy outside the repo

Instrument at `%TEMP%/f12ph-instrument` (full `apps/web` copy minus build
caches; `node_modules` assembled as junctions to the real store plus the
workspace's own `vitest@5.0.0`/`@vitest/spy@5.0.0`).

**Instrument validated before use, per LESSONS §1 rule 1:** the unmutated copy
ran **vitest 5.0.0** (read from the runner banner and from
`node_modules/vitest/package.json`) and reproduced **25 passed / exit 0** with a
test file byte-identical to the repo's (`81485eff…`). The F12B reviewer recorded
that a naive out-of-repo copy silently resolves the root store's stale
`vitest@3.2.7` and reports a misleading green; I checked the resolved version
explicitly rather than trusting the instrument.

| # | Setup on the COPY | Result | Exit |
| - | ----------------- | ------ | ---- |
| A | `page.tsx` placeholder reverted to `Search bots...`, **my new assertion present** | 1 failed \| 24 passed — fails at `page.test.tsx:172` on `getByPlaceholderText` | **1** |
| B | Same mutation, **my assertion removed and the old dead entry restored** (i.e. the pre-fix guard state) | 25 passed | **0** |
| C | Copy restored from the repo (control) | 25 passed | **0** |

Run A is the required proof: reverting the source to English now **fails the
suite**, where before this fix all gates stayed green. Run B is the decisive
isolation probe and independently reproduces the F12B finding — with the dead
entry as the only guard, English ships with a fully green suite, proving that
entry could never fire and that my assertion is the sole guard on this string.
Run C confirms the instrument was clean between runs.

Temp instrument and probe script **deleted; verified gone**. `page.tsx` sha256
is unchanged at `2b7b552b…` before and after all mutation work, so the source
tree was never mutated.

### Class enumeration — I did not stop at the named instance

`page.tsx` owns exactly **5** attribute-carried user-visible strings. I reverted
each to English in the copy and ran the suite, because my new comment asserts
the placeholder is the only one without a compensating assertion and that claim
had to be tested rather than asserted:

| Attribute (page.tsx line) | Verdict |
| ------------------------- | ------- |
| `aria-label="Botların"` (185) | TRIPPED (7 failed) |
| `aria-label="Botları duruma göre filtrele"` (204) | TRIPPED (1) |
| `aria-label="Bot kartları"` (291) | TRIPPED (6) |
| `aria-label="Kurulum ilerlemesi"` (357) | TRIPPED (2) |
| `aria-label` card template `bot detayını aç` (313) | TRIPPED (2) |
| **`placeholder="Botlarda ara…"` (225)** | **TRIPPED (1) — only after this fix** |

All six now trip. The 5 `aria-label` entries trip via separate role/name
assertions that happen to cover the same strings — which is exactly why they
were harmless dead entries and the placeholder was not. My header comment's
claim is therefore measured, not assumed.

## Open Questions for Orchestrator

### 1. BLOCKER FOR YOU, NOT FOR THIS TASK — I damaged the shared `node_modules` store and did not repair it

**What happened.** Assembling the temp instrument, I placed a junction at
`%TEMP%/f12ph-instrument/node_modules` pointing at the repo's real
`node_modules`, then ran a recursive delete against paths *under that junction*
(`rmSync(<temp>/node_modules/vitest, {recursive:true})`). The delete resolved
through the junction and removed the **real** directories instead of the link.
Then it symlinked `apps/web`'s copies into their place. The damaging step was
mine, in throwaway tooling — it touched no source file, and it is unrelated to
the guard fix, which is correct and verified.

**Exact damage** (root store, per `package-lock.json` as the authority):

```
DRIFT  vitest                                 lock=3.2.7  now=5.0.0 (JUNCTION -> apps/web) 
DRIFT  vitest/node_modules/@vitest/mocker     lock=3.2.7  now=5.0.0 (real dir)
DRIFT  vitest/node_modules/vite               lock=7.3.6  MISSING
DRIFT  vitest/node_modules/chai               lock=5.3.3  MISSING
DRIFT  vitest/node_modules/magic-string       lock=0.30.21 MISSING
DRIFT  vitest/node_modules/std-env            lock=3.10.0 MISSING
DRIFT  vitest/node_modules/tinybench          lock=2.9.0  MISSING
DRIFT  vitest/node_modules/tinyexec           lock=0.3.2  MISSING
DRIFT  @vitest/expect                         lock=3.2.7  MISSING
DRIFT  @vitest/expect/node_modules/chai       lock=5.3.3  MISSING
DRIFT  @vitest/pretty-format                  lock=3.2.7  MISSING
DRIFT  @vitest/runner                         lock=3.2.7  MISSING
DRIFT  @vitest/snapshot                       lock=3.2.7  MISSING
DRIFT  @vitest/snapshot/node_modules/magic-string lock=0.30.21 MISSING
DRIFT  @vitest/spy                            lock=3.2.7  now=5.0.0
DRIFT  @vitest/utils                          lock=3.2.7  MISSING
```

`node_modules/@vitest` now contains only `spy`; the other five `@vitest/*`
packages are gone. Evidence the delta is mine and not pre-existing: before any
instrument work I read the root version directly and it reported **3.2.7**; both
replaced entries carry mtime `2026-09-24T00:21:34Z`, exactly my junction step,
and nothing else at root top level changed today.

**Measured blast radius — real, but not currently breaking:**

| Consumer | Declares | Now resolves | Suite |
| -------- | -------- | ------------ | ----- |
| `apps/web` | `vitest@5.0.0` | own 5.0.0 (real dir, intact) | 25 passed, exit 0 |
| `packages/spec` | `vitest@^3.0.0` | **5.0.0** (drift) | 112 passed, exit 0 |
| `packages/ai` | `vitest@^3.0.0` | **5.0.0** (drift) | 316 passed, exit 0 |
| `apps/gateway` | `vitest@^3.0.0` | **5.0.0** (drift) | 464 passed, exit 0 |

No junction cycle (checked, 12 dirs visited, none). Four workspaces' suites pass
— but three of them are now running a **different vitest major than their
manifest declares**, so their green is not the green the lockfile promises. One
further latent hazard: `node_modules/vite/dist/node/chunks/node.js` imports
`@vitest/utils`, which was among the deleted packages; it lives on a lazily
reached path, so I could not prove it is exercised — I am flagging it as
unproven rather than claiming it is fine.

**Why I did not fix it myself:** the remedy is an install command, which this
task explicitly forbids ("Do NOT run install…"), and it would write to the store
rather than to a declared scope. Repairing it is an out-of-scope write, so per
the scope guard I stopped and escalated instead of expanding silently.

**Recommended remedy (yours to run, one command, root of repo):**

```
npm install
```

`npm install` — not `npm ci`, which would wipe the whole store — reconciles
against `package-lock.json`: it re-installs the hoisted `vitest@3.2.7` and its
missing `@vitest/*` siblings, restores the deleted nested deps, and removes the
two junctions. It should be safe offline: I verified the content blobs for
**every** deleted package are present in the npm cache
(`vitest-3.2.7`, `@vitest/{expect,utils,runner,snapshot,pretty-format,spy}@3.2.7`,
`vite-7.3.6`, `chai-5.3.3`, `magic-string-0.30.21`, `std-env-3.10.0`,
`tinybench-2.9.0`, `tinyexec-0.3.2`, `mocker-3.2.7` — all `BLOB PRESENT`). After
running it, re-run the four suites above to confirm each returns to its declared
vitest. Given this wave is broad and uncommitted, do **not** reach for any git
restore/checkout/stash.

**The harness defect, so this class does not recur.** The failure was not the
junction — it was **deleting through a path that traverses one**. A recursive
delete on a junctioned path follows into the target and removes real data. Any
future "temp copy outside the repo" instrument must either copy the store
instead of junctioning it, or junction only *leaf packages* and never delete
through the junction. Worth folding into the instrument recipe as a standing
rule: *never run `rm -rf` / `rmSync` on a path with a junction anywhere in its
ancestry.*

### 2. Carried forward, unchanged, still unowned

D-004 (`Docs/DECISIONS.md`, English-only) still contradicts the shipped Turkish
wave. One owner needed, not a per-page fix. Unchanged by this task.

## Public Interface Exposed

Unchanged. `page.tsx` is byte-identical (sha256 `2b7b552b…`), so `BotsPage`'s
signature, the `lib/bots` imports, the data flow, and every href are untouched.
The only interface this task added is test-internal: one assertion inside an
existing `it` block.

## Known Limitations

- **The `node_modules` regression is not repaired** — see Open Questions 1. It is
  outside this task's scope and outside its permitted commands.
- I verified the **page's own** strings. Shared components reached from this page
  (`BuilderProgress`) remain English by design, are excluded from the guard, and
  are documented and asserted (`page.test.tsx:521`).
- I did not exercise the app over HTTP (no dev server or auth session). Every
  claim rests on a gate exit code, a file byte, or a redirected jsdom render.
  Per LESSONS §2.4 that is weaker than a human completing the flow in the running
  app; for a guard-pin fix it is appropriate, but it is the reason the "English
  would ship" statement rests on a mutation plus a DOM assertion rather than a
  screenshot.
- Class enumeration is bounded by what I could enumerate mechanically (attribute
  literals and JSX text). A user-visible string composed at runtime from
  fragments outside those patterns would not appear in it.
- The `vite` → `@vitest/utils` import path is flagged as an unproven hazard, not
  a verified one.
