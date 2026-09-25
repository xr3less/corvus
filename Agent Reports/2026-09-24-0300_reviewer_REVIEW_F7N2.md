# Task Report: review-F7N2

## Status
**PASS** — the F7N2 pin at `apps/web/app/dashboard/new/page.test.tsx:470` is byte-exact, sits on the shipped render path, and is proven to trip when the guarded label is broken. One non-blocking finding (§Findings 1).

## Independent Verification

### Toolchain (detected from manifests, never assumed)
`npm` workspaces; root `package.json` `workspaces: ["apps/*","packages/*"]`. `apps/web/package.json` scripts: `typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check --ignore-unknown .`, `test: vitest run`. Versions read from the lockfile-installed trees: **vitest 5.0.0** (`npx vitest --version` → `vitest/5.0.0 win32-x64 node-v24.15.0`), typescript 5.9.3, eslint 9.39.5, prettier 3.9.6. Prettier settings from `apps/web/package.json` (`printWidth: 100`, `singleQuote: true`) — note `apps/web` has **no `.prettierrc`**; the temp controls below were seeded with those two settings for that reason.

### 1. Gates on the merged tree — all true exit codes, none piped
| Gate | Command (cwd `apps/web`) | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0**, 0 output lines |
| Lint | `npx eslint app/dashboard/new/page.test.tsx --max-warnings 0` | **exit 0**, no output |
| Format | `npx prettier --check app/dashboard/new/page.test.tsx` | **exit 0**, "All matched files use Prettier code style!" |
| Focused suite | `npx vitest run app/dashboard/new/page.test.tsx` | **exit 0**, `Test Files 1 passed (1)`, `Tests 49 passed (49)`, 6.42s |

**Instrument validation (before trusting the greens).** A green lint/format run can also mean "the file was never processed", so each instrument was checked:
- `tsc --noEmit --listFiles` → 846 files in the program, including `components/ui/thinking-trace.tsx` (:786) and `app/dashboard/new/page.test.tsx` (:792). The test file is genuinely type-checked.
- `eslint … -f json` → exactly 1 result, that file's path, `messages: 0`, `suppressed: 0`, `fatal: 0`. The file was really linted, with nothing suppressed.
- `prettier` two-sided control on a byte-identical temp copy outside the repo, seeded with the repo's prettier settings: unmodified copy → exit 0; copy with spacing perturbed → exit 1 ("Code style issues found"). The pass is meaningful, not silent non-application. Temp removed.

### 2. Cited bytes, re-read at source
- `components/ui/thinking-trace.tsx:79` → `{status === 'thinking' ? 'Düşünüyor' : 'Düşündü'}`
- `app/dashboard/new/page.test.tsx:470` → `expect(thread.textContent).toContain('Düşünüyor');`
- Codepoint comparison, not eyeballing: the pin's literal is `68,252,351,252,110,252,121,111,114` (`D`+`ü`+`ş`+`ü`+`n`+`ü`+`y`+`o`+`r`) — **identical** to the ternary's `thinking` branch and **not** equal to its `done` branch (`Düşündü` = `68,252,351,252,110,100,252`). The pin therefore targets the correct branch of the ternary, which is the failure mode a string pin like this most easily gets wrong.
- `thinking-trace.tsx:84` still renders `· ${elapsed}` / `· ${elapsed} sürdü`, and `:77` keeps `role="status"` — the label and the elapsed readout remain separate spans, so the pin cannot pass on elapsed text alone.

### 3. Mutation instrument — my own, re-derived independently
Temp vitest config **outside the repo** (deleted after use), running the repo's real suite under the repo's real runner (the run header reports `RUN v5.0.0 C:/Users/xr3less/Desktop/corvus/apps/web`), with a `enforce: 'pre'` `load` hook that returns the component's bytes with `'Düşünüyor'→'Thinking'` and `'Düşündü'→'Thought'`. The repo file is never written; the hook throws if the substitution fails to apply. Repo hashes were re-checked after every run.

**Mutation A — the reviewed pin:**
`npx vitest run --config <temp> app/dashboard/new/page.test.tsx` → **exit 1**, `Tests 1 failed | 48 passed (49)`
```
FAIL app/dashboard/new/page.test.tsx > new bot page > submitting streams the reply into a thread with botId null
AssertionError: expected 'A welcome bot for my study serverThin…' to contain 'Düşünüyor'
Expected: "Düşünüyor"
Received: "A welcome bot for my study serverThinking · 0s"
 ❯ app/dashboard/new/page.test.tsx:470:32
```
The guard trips, and the failure dump is independent evidence that the **real shipped path** (`NewBotPage` → `ChatAssistantRow` → `ThinkingTrace`) renders the label immediately after the owner's message with the elapsed readout beside it. The pin asserts real rendered bytes, not a coincidence of the test's own fixtures.

**Mutation B — is the class guarded, or only this one pin?** Broader sweep, because "fix only the call site" is this repo's most-repeated defect:
- `components/ui/chat-thread.test.tsx` under the same mutation → **exit 1**, `3 failed | 4 passed (7)`, including `still English: Thinking: expected 'Thinking · 0sYanıt.Bu yanıt 0.075 kre…' not to contain 'Thinking'`. The `ENGLISH_RESIDUE` guard at `:31-32` is a **real** guard and it is the only hard check on the exact label bytes.
- `app/dashboard/bots/[id]/page.test.tsx` under the same mutation → **exit 1**, `3 failed | 56 passed (59)`. Its four `Düşünüyor` pins are live guards too, not decorative.

**Clean-state cross-checks:** sibling suites `thinking-trace.test.tsx` + `chat-thread.test.tsx` → exit 0, 2 files / **11 passed**; all four in-scope consumer suites (`thinking-trace`, `chat-thread`, `new/page`, `bots/[id]/page`) → exit 0, 4 files / **119 passed**; `bots/[id]/page.test.tsx` alone → exit 0, **59 passed**.

### 4. Scope hygiene
- Scoped `git status`: `M apps/web/app/dashboard/new/page.test.tsx` — as claimed. `thinking-trace.tsx` also shows `M`, correctly: that is the **upstream** F7-thinking wave's source change (mtime 23:48:18), not an F7N2 edit. F7N2 wrote no source, manifest, lockfile or `.env` byte.
- **Attribution by mtime, since the tree is dirty beyond git's ability to attribute:** the F7N2 window is mtime ≥ 23:51 (`page.test.tsx` 23:54:14, F7N2 report 23:56:32). Every manifest/lockfile/env predates it by days: `package-lock.json` 2026-09-20, `.env.example` 2026-09-21, `apps/web/package.json` 2026-09-19, root `package.json` 2026-09-15, `apps/web/vitest.config.mjs` 2026-09-12. No manifest/lockfile/env was touched by this fix.
- No stray backup/copy/`*.orig` artifact from this fix exists anywhere in the repo. My own temp copies lived outside the repo and are deleted (verified absent).
- **The `:470` delta cannot be attributed from git alone, and I did not pretend otherwise:** the file is 1590 insertions / 101 deletions against `HEAD` and `HEAD`'s copy contains **zero** `Düşünüyor` — the F7 copy wave rewrote this file wholesale, so this file carries two logical changes from two reports and its diff is not evidence for the one-line delta. The report's own disclosure of this is accurate and honest.
- The build report writes the previous task id as `2026-09-24-0242_f7newpin_FIX_newpage-pin.md`; the report I was whitelisted against is `2026-09-24-0242_f7think_FIX_thinking-turkish.md`. Both files exist on disk (mtimes 23:49:52 and 23:50:58). A naming reference, not a missing artifact — non-blocking.
- **Tree concurrency (assumption made explicit):** at least five other agents were writing into this working tree while I verified — the 45-minute mtime census shows `app/dashboard/bots/[id]/page.tsx` 23:20:10, `lib/bots.ts` 23:21:03, `bots/page.tsx` 23:24:24, `layout.test.tsx` 23:48:38, `dashboard-rail.tsx` 23:50:12, `lib/demo/brain.ts` 23:50:41, `lib/verdict/bounds.ts` 23:53:41, `lib/chat/thread.ts` 23:57:28, `app/page.tsx` 23:59:11, and more. My greens are a point-in-time snapshot of a **shared** tree, not of an isolated build. What does hold: the two reviewed files were **byte-identical before, during and after** all my verification — `page.test.tsx` SHA256 `A95151C0A812F25E4928194E226A40B62DAF0BAE8A06999EF9D174C0598B6726` (82100 bytes) and `thinking-trace.tsx` `5D60C4B46F184A20C3AD12A9A40AD46A6D8872B96312D0BD47CFF20C71DFC46D` (4145 bytes).
- Whole tree: 495 dirty entries — the literal "only this file" criterion is unsatisfiable on this wave tree, exactly as the build report states. Of the untracked `apps/web/**` entries, none is attributable to F7N2; `apps/web/.vitest/json/output.json` (mtime 23:56:47) is a runner artifact from a peer agent's session, not a hand-written file by this fix.

### 5. Build-report claims vs. my measurements
| Claim | My result |
|---|---|
| `:470` was the file's only stale English thinking pin | **Confirmed** — `Düşünüyor\|Düşündü\|'Thinking'\|'Thought'` in that file returns exactly one hit, line 470 |
| Focused run 49/49, exit 0 | **Confirmed exactly** (same count, same runner version) |
| tsc / eslint / prettier exit 0, post-mutation-restore | **Confirmed on current bytes** |
| Mutation revert → `1 failed \| 48 passed (49)` at :470, DOM dumping `Düşünüyor · 0s` | **Confirmed, reproduced independently** |
| Restored file SHA256 `A95151C0…B6726`, size 82100 | **Confirmed exactly** — independently recomputed |
| `bots/[id]/page.test.tsx:1716,1795,1830,1838` already `Düşünüyor` | **Confirmed**, and additionally proven to be live guards (Mutation B) |
| `chat-thread.test.tsx:31-32` is a deliberate residue guard, not a stale pin | **Confirmed** — comment at `:20-23` says so verbatim, and Mutation B shows the guard firing |
| No web research needed (no version/API/pricing fact) | **Confirmed** — the task is one test-string pin; no live fact is involved, so no citation is owed |

## Findings
1. **LOW / non-blocking — the page's own residue list has a hole the label can fall through.** `app/dashboard/new/page.test.tsx:46-60` `ENGLISH_RESIDUE` lists prose phrases ('hero title', 'cost line', 'composer placeholder', …) but **not** `Thinking`/`Thought`. So inside this page's suite the English label is caught at `:470` only while the stream is **open** (the `thinking` branch); the **done**-state label (`Düşündü`, and its `· Ns sürdü` suffix) has no pin in this suite at all. The class is not unguarded — `chat-thread.test.tsx:31-32` covers it and I proved that guard fires — but the page-level list is weaker than its sibling's for no stated reason. Same class as the fix: one line in the sibling list closes it. Not a reason to fail this task.
2. **INFO — `apps/web/.vitest/json/output.json` is an untracked runner artifact** in the tree (mtime 23:56:47, a peer agent's session). It recorded 59/59 across 3 files, so it is not evidence for this 49-test suite; it is also not this fix's file. Flagged for tree hygiene, not for F7N2.
3. **INFO — vitest is installed twice:** `apps/web/node_modules/vitest` = **5.0.0** (what `npx vitest` resolves from `apps/web` and what every gate above ran) and root `node_modules/vitest` = 3.2.7. A root-level `npm test --workspaces` run resolves its per-workspace PATH shim and should hit 5.0.0; I verified the executed runner version directly (`RUN v5.0.0`) rather than assuming it. Pre-existing, outside this fix's scope.

## Accuracy of build report
**Accurate.** Every quantitative claim I could re-measure reproduced exactly — including the SHA256 and byte size, the 49/49 count, the `1 failed | 48 passed (49)` mutation result, and the residue-guard judgement call at `chat-thread.test.tsx:31-32` (which is the subtle one and it is correct: leaving those alone was right). Its one imprecision is a task-id filename reference (§Scope hygiene), which does not affect the outcome. Its self-disclosed limitation — no browser drive — is honest, and it is the same standard I met. The report also correctly refuses to over-claim the one thing it cannot claim: git cannot isolate its one-line delta on a wholesale-rewritten file, and it says so instead of implying clean attribution.

## Scope / artifacts / hygiene
Wrote exactly one file: this review. No source, test, manifest, lockfile, `.env`, or git state modified. No `git restore/checkout --/reset/stash/commit/push/deploy/migrate`. All proof work ran in `%TEMP%` copies and temp vitest configs **outside** the repo, all deleted and verified absent. The two in-scope repo files re-hashed **UNCHANGED** after every mutation run.

## Assumptions
- Gates were run on a shared, actively-written working tree (§Scope hygiene, concurrency); greens are a snapshot. Mitigated by hash-pinning both reviewed files across the whole session.
- `apps/web/package.json`'s inline prettier settings are the intended formatting contract for this workspace (no `.prettierrc` in `apps/web`); my format controls were seeded with them.
- The `thinking`-branch narrative is the correct reading of `:470`, inferred from the test's own staging (it asserts the label while the stream is open, before the `t: 'done'` frame at `:486`) rather than from a comment.

## Open Questions for Orchestrator
1. Add `'Thinking'`/`'Thought'` to `app/dashboard/new/page.test.tsx:46-60` `ENGLISH_RESIDUE` to close Finding 1? One line, same class as the fix, sibling parity. My recommendation: yes, as a follow-up — not a blocker for F7N2.
2. Findings 2 and 3 (untracked runner artifact; duplicate vitest 5.0.0 / 3.2.7) are tree-hygiene items, not F7N2 defects. Neither was introduced by this fix.

## Public Interface Exposed
None — test-only. The reviewed delta is one assertion literal:
- OLD: `expect(thread.textContent).toContain('Thinking');`
- NEW: `expect(thread.textContent).toContain('Düşünüyor');`
No exported symbol, prop, route or type changed. `ThinkingTraceProps` is untouched.

## Known Limitations
- **No browser drive.** I did not start the app or complete the flow in a real browser. Evidence is static gates plus the real component render path exercised through jsdom, with the mutation failure dump as the DOM-level evidence. This is the same ceiling the build report declared, and it is disclosed rather than dressed up as a human-in-browser pass.
- The **done**-state label (`Düşündü` / `· Ns sürdü`) is pinned by sibling suites (`thinking-trace.test.tsx`, `chat-thread.test.tsx`, `bots/[id]/page.test.tsx` — all green), **not** by this page's suite; that is Finding 1.
- Findings 2 and 3 were observed, not root-caused; both predate this fix.
