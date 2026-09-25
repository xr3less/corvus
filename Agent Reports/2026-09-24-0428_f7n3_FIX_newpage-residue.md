# Task Report: fix-f7n3-0428

## Status

**SUCCESS**

The F7N2 non-blocking gap is closed, and the premise behind it was measured rather than
assumed. The prior attempt's suspicion was **correct**: the `ENGLISH_RESIDUE` sweep on this
page renders the empty state, so a bare `Thinking`/`Thought` entry there would have been a
**dead entry that could never fire** — the exact F12B/F12C defect class. I did not install
those bare entries. Instead the sweep predicate became a shared helper, the thread row's
pre-Turkish words moved to per-branch lists, and each list is swept inside the render that
actually **mounts** its branch. All three entries were then proven load-bearing one at a
time by mutation, and a counter-probe reproduces the original F12B/F12C defect exactly
(green 49/49 with full English mutation) to show what was avoided.

## Files Touched

- MODIFIED: `apps/web/app/dashboard/new/page.test.tsx` (ONLY file in the source tree;
  sha256 `a95151c0a812f25e4928194e226a40b62daf0bae8a06999ef9d174c0598b6726` → `7ff29eb258a45c6e5fd5b0eaa6d4104aa660c323422fd3f554fc034c6a7f9294`)
- CREATED: `Agent Reports/2026-09-24-0428_f7n3_FIX_newpage-residue.md` (this report)

READ ONLY (byte sources, never written): `apps/web/components/ui/thinking-trace.tsx`
(sha256 `5d60c4b46f184a20c3ad12a9a40ad46a6d8872b96312d0bd47cff20c71dfc46d`, **unchanged
before and after**), `apps/web/components/ui/chat-thread.tsx`,
`apps/web/app/dashboard/new/page.tsx`, `apps/web/lib/chat/thread.ts`,
`apps/web/components/ui/use-chat-stream.ts`.

No source, manifest, lockfile, `.env`, or git state written. No
`git restore`/`checkout --`/`reset`/`stash`/`commit`/`push`/`deploy`/`migrate` run at any point.

## Dependencies Added

None. No install command was run.

## Assumptions Made

- **No web research needed, stated explicitly per RESEARCH FIRST.** This task is a
  copy/guard fix: no library version, model name, API surface, or pricing fact is involved,
  so no live source was cited. The only facts used are bytes read out of this repo.
- **The Turkish labels were copied from the shipped source, never retyped.** Both literals
  were extracted programmatically from `thinking-trace.tsx:79` and compared byte-for-byte
  against the test-side literals (see Verification §1). `Düşünüyor` = `44c3bcc59fc3bc6ec3bc796f72`,
  `Düşündü` = `44c3bcc59fc3bc6e64c3bc` — **byte-equal on both sides**, and `Düşündü` is
  correctly the `done` branch, not the `thinking` branch of the same ternary.
- **The `Thinking`/`Thought` words belong to the shared thread row, not to this page.**
  `page.tsx` contains no `Thinking`/`Thought`/`took` at all (grepped); they are rendered by
  `thinking-trace.tsx:79`/`:84`, reached through `ChatAssistantRow`. That is why sweeping
  them against the empty page is structurally dead and why the fix is a mounted-state sweep
  rather than a list edit.
- **`Thinking` and `Thought` are time-exclusive on this page.** `ChatAssistantRow` renders
  the thinking trace while the stream is open and the parked trace at done
  (`chat-thread.tsx:25`/`:46`), and the page's own `:494` pin sits on the open-stream
  branch — so each word is swept where its branch is the mounted one. A single combined
  sweep would have made one of the two entries dead by construction.
- **`it` count deliberately unchanged (43 declarations → 49 tests, as before).** The new
  assertions were added inside the two existing `it` blocks rather than as new blocks,
  following the F12C precedent ("No new `it` block, so the suite count correctly stays at
  25"). The runner banner independently reports 49 before and after.
- **The touched file was already dirty from prior waves** (it carries the F7 and F7N2
  changes); my delta is additive and the pre-edit sha was recorded so it is isolable.

## Verification

### 1. Premise verified with file:line evidence — CONFIRMED (the entries would have been dead)

| Evidence | Fact |
|---|---|
| `page.test.tsx:466-480` (pre-edit) | The sweep test calls `render(<NewBotPage />)` and asserts — **it never submits a turn** |
| `page.tsx:471-483` | The thread `<ul aria-label="Yeni bot konuşması">` renders only when `messages.length > 0` |
| `page.test.tsx:403` (pre-edit) | The same empty state is pinned negatively: `queryByRole('list', { name: 'Yeni bot konuşması' })` is `null` |
| `chat-thread.tsx:25`/`:46` | The row's words exist only inside a mounted `ChatAssistantRow` |
| `thinking-trace.tsx:79`/`:84` | The byte source: `'Düşünüyor'`/`'Düşündü'` and `· ${elapsed}`/`· ${elapsed} sürdü` |

So a bare `['thinking label', 'Thinking']` in `ENGLISH_RESIDUE` would have been checked
against a `document.body` that can never contain it. **Premise TRUE.**

**Counter-probe (PROBE 4) — the avoided defect, reproduced.** I built the dead design
(entries only at page level, mounted-site sweeps removed) in the out-of-repo copy and ran it
under a FULL English mutation of both branches and the suffix:

```
Test Files  1 passed (1)
     Tests  49 passed (49)      EXIT=0
```

**Full English ships green.** That is the F12B/F12C dead-entry defect, reproduced on this
file — and it is what this task exists to prevent.

### 2. The installed guard is PROVEN live — three isolation probes

Instrument: full repo copied **outside** the repo (robocopy `/E /XJ`, `.next`/`.git`/npm
cache excluded), **zero reparse points asserted inside the copy before any use** (the F12C
junction lesson). Mutations were applied to files **in the copy only**; repo hashes were
re-checked and are unchanged (see §4).

**Instrument validation, and a trap caught.** The first run reported `RUN v3.2.7` — the
copy's `npx` silently resolved the **root** store's stale `vitest@3.2.7` instead of the
workspace's own `vitest@5.0.0`. This is precisely the misleading-instrument failure the F12C
report documented. I did not trust that run: I re-validated with the workspace's own CLI
explicitly (`node ./node_modules/vitest/vitest.mjs`, banner `v5.0.0`) and re-baselined —
**49/49, exit 0** on the unmutated copy. Every mutation result below is from the pinned
5.0.0 runner, matching the repo's real one.

| # | Mutation (in the copy) | Guard under test | Result | Exit |
|---|---|---|---|---|
| A | FULL: `Thinking`/`Thought` + `took` | the pre-existing `:494` pin | 1 failed \| 48 passed | **1** |
| **B** | **done branch only** (`Thought` + `took`), thinking stays Turkish | **`PARKED_RESIDUE` (the new entries)** | **1 failed \| 48 passed**, fails at **`:522`** | **1** |
| P1 | done branch only + my `Düşün*` pins neutralized | `PARKED_RESIDUE` **as the only guard** | 1 failed \| 48 passed, `thought label still English: Thought` | **1** |
| P2 | elapsed suffix only (`· took Ns`) | the `took` entry **alone** | 1 failed \| 48 passed, `elapsed suffix still English: took` | **1** |
| P3 | thinking label only | the `Thinking` entry **alone** | 1 failed \| 48 passed, `thinking label still English: Thinking` | **1** |
| C | none (copy restored from repo) | control | 49 passed | **0** |

Run B is the required proof and it is the strongest possible form of it: the mutation is a
**done-branch-only English regression, a case the file had NO guard on before this fix**
(F7N2 reviewer Finding 1), and the suite goes red **at the new assertion**. Probes P1–P3
then remove my own sibling pins and show each of the three entries catching its string on
its own — so none is decoration. P1's failure dump is independent DOM evidence of the real
shipped path rendering the row:

```
Received: '…A welcome bot for my study serverGot it — drafting.Thought · took 0sWeighing the optionsBu yanıt 1.1 kredi harcadı · …'
```

### 3. Gates on the real tree — all true exit codes, none read through a pipe

| Gate | Command (cwd `apps/web` unless noted) | Result | Exit |
|---|---|---|---|
| Focused suite | `npx vitest run app/dashboard/new/page.test.tsx` | `Test Files 1 passed (1)`, **`Tests 49 passed (49)`**, `RUN v5.0.0` | **0** |
| Sibling suites | `npx vitest run components/ui/chat-thread.test.tsx components/ui/thinking-trace.test.tsx` | 2 files, **11 passed** | **0** |
| Typecheck | `npx tsc --noEmit` | 0 output lines | **0** |
| Lint | `npx eslint app/dashboard/new/page.test.tsx --max-warnings 0` | no output | **0** |
| Format | `npx prettier --check app/dashboard/new/page.test.tsx` | "All matched files use Prettier code style!" | **0** |

**Instruments validated, not assumed** (a green run can also mean "the file was never
processed"):
- `eslint -f json` → exactly **1** result, that file's path, `messages: 0`,
  `suppressed: 0` — the file was really linted with nothing suppressed.
- `tsc --noEmit --listFiles` → the touched file appears in the program (grep count 1).
- Prettier **two-sided control** on a byte-identical copy outside the repo, seeded with this
  workspace's inline settings (`printWidth: 100`, `singleQuote: true`; `apps/web` has no
  `.prettierrc`): unmodified → **exit 0**; spacing perturbed → **exit 1**. The pass is
  meaningful, not silent non-application. Control deleted, verified absent.

Test count unchanged at **49** (43 `it` declarations + 6 from the two `it.each` blocks);
no `.only`, no `.skip`.

### 4. Scope and repo integrity

- `apps/web/components/ui/thinking-trace.tsx` sha256 re-checked after every mutation run:
  **`5d60c4b4…c46d` before and after — unchanged.** The repo source was never mutated;
  all mutation work happened in the copy.
- Scoped `git status`: `M apps/web/app/dashboard/new/page.test.tsx` — plus
  `page.tsx` (mtime 01:22:21) and `thinking-trace.tsx` (mtime 02:48:18), both of which
  **predate this task's window** (my file only: 08:17:34) and are the upstream F7 waves'
  changes, not mine.
- Manifests/lockfile/`.env` untouched, by mtime: `package.json` 09-15, `apps/web/package.json`
  09-19, `apps/web/vitest.config.mjs` 09-12, `.env.example` 09-21, `package-lock.json` 09-24
  03:31 — all hours or days before this task started (~08:05).
- **No `node_modules` damage, and the F12C repair holds:** root `vitest` still a real dir at
  **3.2.7**, `apps/web` at **5.0.0**, all six `@vitest/*` present at root, and the 5 legit
  `@corvus/*` junctions intact — verified **before and after** the guarded temp delete.
- Temp instrument deleted with a guard that **aborts if any reparse point exists inside the
  tree** (count checked = 0, then delete). Tree and controls verified absent. No stray
  `*.orig`/`*.probe`/backup artifact anywhere in the repo.

## Open Questions for Orchestrator

1. **INFO — the copy's `npx vitest` resolves the wrong major; a repo-wide hazard, not this
   file's.** Running `npx vitest` from an out-of-repo copy of `apps/web` silently resolves
   the **root** store's `vitest@3.2.7` rather than the workspace's `vitest@5.0.0`, while the
   workspace's own CLI is 5.0.0. This is the same trap F12C flagged, and it means any future
   out-of-repo instrument must pin the CLI path explicitly (`node ./node_modules/vitest/vitest.mjs`)
   and read the banner, or it will report a green from the wrong runner. Worth folding into
   the standing instrument recipe. **In-repo runs are unaffected** — from `apps/web`,
   `npx vitest` correctly resolves 5.0.0 (verified: banner `RUN v5.0.0`).
2. **INFO — the parked branch remains pinned in two places, which is fine and intended:**
   this file now pins `Düşündü` (via the sweep) for the first time, and the F7N2 reviewer's
   Finding 1 is therefore closed. No further action needed on this gap.
3. **Carried forward, unchanged, unowned (not this task's scope):** the reviewer F3 English
   census at `lib/chat/thread.ts:52,137,148` and `use-chat-stream.ts:30,120`, and D-004
   (`Docs/DECISIONS.md`, English-only) contradicting the shipped Turkish wave. Both were
   already open before this task and are untouched by it.

## Public Interface Exposed

Test-internal only; no exported symbol, prop, route, or type changed. The test file's own
shapes:

- New helper: `expectNoEnglishResidue(extra: [string, string][] = [])` — sweeps
  `document.body.textContent` against `ENGLISH_RESIDUE` plus caller-supplied entries.
- New constants: `THINKING_RESIDUE` (1 entry: `Thinking`), `PARKED_RESIDUE` (2 entries:
  `Thought`, `took`).
- `ENGLISH_RESIDUE` is **unchanged** (16 entries, none added, none removed) — the dead-entry
  trap was avoided by not touching it.
- Three call sites: `expectNoEnglishResidue()` at `:469` (empty state),
  `expectNoEnglishResidue(THINKING_RESIDUE)` at `:497` (row mounted, stream open),
  `expectNoEnglishResidue(PARKED_RESIDUE)` at `:524` (row parked after done).
- Two assertions added where the done branch mounts: `expect(thread.textContent).toContain('Düşündü')`
  at `:522` and `.not.toContain('Düşünüyor')` at `:523` — the parked branch had no pin in
  this suite at all before.

## Known Limitations

- **No browser drive.** I did not start the app or complete the flow in a real browser. The
  evidence is the suite plus static gates on the real component path (`NewBotPage` →
  `ChatAssistantRow` → `ThinkingTrace`) through jsdom, with PROBE P1's failure dump as the
  DOM-level evidence that the real path renders the row. Per LESSONS §2.4 that is weaker
  than a human completing the flow in the running app; for a guard-pin fix it is appropriate,
  and it is disclosed rather than dressed up.
- **Verification ran against a shared, actively-written working tree** (other agents have
  been writing during this session). My files were hash-pinned across the whole task
  (`page.test.tsx` and `thinking-trace.tsx` both re-hashed), so my greens describe my bytes,
  but a peer's concurrent change elsewhere is not covered by them.
- **The `it` count staying at 49 is deliberate** (F12C precedent). A reviewer who expects
  the assertion count to move will see `expect(` grow (294 now) while the test count does
  not — that is the intent, not a missed registration.
- **Attribution caveat, same as F7N2's:** `page.test.tsx` is 1625/101 against `HEAD` because
  earlier waves rewrote it wholesale, so git cannot isolate my delta from the file's diff.
  Pre-edit sha `a95151c0…` → `7ff29eb2…` and the mtimes are the isolable evidence.
- **Entry `took` is a word, so the sweep is substring-based.** It is load-bearing (PROBE 2)
  and the surface is narrow, but a future legitimate use of the word `took` **inside a
  rendered string** on this page would trip the sweep. No such string exists today
  (grepped across `page.tsx`, `chat-thread.tsx`, `thinking-trace.tsx`).
