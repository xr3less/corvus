# Reviewer Report: newpage-c-intent-start

Reviewer: independent (did not write this code). Timestamp: 2026-09-25-1620 (real clock 16:23).
Task under review: newpage-c-intent-start (MODIFY) — replace the new-bot page's ask-line
adjacency gate with a position-based plan-offer trigger; keep once-guards, POST shape,
render branches, Turkish strings intact.

## VERDICT: PASS

The page contains no content gate of any kind, the position rule is the trigger, every
frozen byte survived, and the guard was broken and watched to fail. No blocker findings.
Two informational items for the orchestrator (one real residual defect, pre-existing and
out of this task's scope — F-1 below).

---

## Artifacts Confirmed

`git status --porcelain` shows both owned files as `M` (modified, unstaged), and
`git diff --stat` reports real content change:

| File | Diffstat |
|---|---|
| `apps/web/app/dashboard/new/page.tsx` | 113 lines changed (+/-), 224 insertions / 222 deletions across both files |
| `apps/web/app/dashboard/new/page.test.tsx` | 333 lines changed |

The report file `Agent Reports/2026-09-25-1553_newpage-c_MODIFY_newpage-trigger.md` exists on
disk. Claim `SUCCESS` is backed by artifacts, not just text.

Out-of-scope files confirmed untouched **by this task**: `apps/web/lib/verdict/bounds.ts` is
absent from `git status` entirely (nobody touched it). `apps/web/app/api/builder/verdict/route.ts`
and `packages/ai/*` do show as modified — but by the *other two agents in this wave*
(verdict-b, persona-a), which is expected; this reviewer attributes them to those owners, not
to newpage-c, and the newpage-c report claims no touch of them (consistent with the diff scope).

---

## Functional Checks (command + observed result)

Toolchain detected from `package.json` + lockfile: **npm workspaces** (`package-lock.json` is
the only JS lockfile; `skills-lock.json` is unrelated). Real scripts: root `npm run typecheck`
→ `--workspaces`; `apps/web` has `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`.

| # | Check | Command | Observed |
|---|---|---|---|
| 1 | @corvus/web typecheck | `cd apps/web && npx tsc --noEmit` | **0 errors**, exit 0 |
| 2 | Lint, touched files | `npx eslint app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx --max-warnings 0` | **0 warnings**, exit 0 |
| 3 | Prettier | `npx prettier --check` on both files | **"All matched files use Prettier code style!"** |
| 4 | Owned page suite | `npx vitest run app/dashboard/new/page.test.tsx` | **58 passed / 58** (1 file) |
| 5 | Whole apps/web suite | `npx vitest run` (serial) | **65 files passed, 933 passed, 73 skipped, 0 failed (1006)** — matches the claim exactly, no collateral breakage |
| 6 | Content gate gone | `grep -nE 'ASK_LINES\|foldTurkish\|isPlanAsk\|TURKISH_FOLD' page.tsx page.test.tsx` | **no matches** in either file |
| 7 | Deleted ask strings gone | `grep -nE 'Can I start\|Başlayayım\|Başlayalım\|yazman yeterli'` on both files | **no matches** |
| 8 | `showSaving` is position-only | read `page.tsx:404-415` | condition is `before.role === 'assistant' && judgedUserIdRef.current !== messages[i].id` — **no content check** |
| 9 | Position gate is the trigger | `grep -n "prev.role !== 'assistant'" page.tsx` | `page.tsx:255` — `if (!prev \|\| prev.role !== 'assistant') return;` |

### Instrument validation (before trusting the numbers above)

- **Check 5 first disagreed with the claim**: my initial background run reported
  *8 files / 10 tests failed*. That was **my instrument, not the code** — I had launched it
  concurrently with check 4, and the two vitest processes shared the Vite module cache
  (the failing run collected only 962 tests vs 1006 in the clean run, i.e. modules failed to
  load rather than assertions failing). A clean serial re-run is **1006 tests, 0 failed**.
  I record this so a mid-wave snapshot is not mistaken for a regression. Note the background
  wrapper also reported `[exited with code 0]`, so **exit code alone was not a safe signal
  here** — the summary lines are what I read.

### Guard sanity — broken and watched to fail (LESSONS §8)

I re-added a content check myself: `page.tsx:255` →
`if (!prev || prev.role !== 'assistant' || !prev.text.includes('Can I start?')) return;`

- **Result: 31 of 58 tests failed.** The guard is genuinely load-bearing; the suite is not
  vacuously green.
- Reverted from a **checksum-verified copy kept outside the repo**
  (`sha256 18d6c246...82cf98`, taken before the probe; verified identical after restore).
  No `git stash` / `checkout --` / `restore` / `reset` was run at any point.
- Post-revert confirmation: no probe residue (`grep` for `Can I start`/`includes('` → clean),
  gate intact at `:255`, owned suite **58/58 green again**, and the diffstat is back to the
  pre-probe 113/333 lines — the tree is byte-identical to what the agent left.
- I did **not** re-run the agent's second probe (inverting the position test); the first probe
  already establishes the guard is real, and the agent's own report documents the inverse case.

### UI / visual check

Per the orchestrator's instruction, the byte-identical render block **is** the visual check
(this task changes trigger logic, not layout). Verified mechanically rather than by screenshot.

---

## Spec Adherence (§3a, item by item)

**1. Deletions — CONFIRMED.** `ASK_LINES`, `TURKISH_FOLD`, `foldTurkish`, `isPlanAsk` are all
gone from the page (check 6). The whole file now contains **no substring/content check on any
assistant sentence**. The only string-ish expressions left in the file are legitimate and not
gates: the template-slug format regex (`:119`), `row.text.trim() !== ''` whitespace filtering
(`:265`), the `boundedTurn` mapping (`:268`), and rendering `message.text` (`:447`).

**2. Position gate — CONFIRMED.** `page.tsx:255` is exactly
`if (!prev || prev.role !== 'assistant') return;`, preceded by a comment stating the position
rule. `showSaving` (`:404-415`) had its `isPlanAsk(before.text)` term removed and is now
position-only — verified directly, as the orchestrator asked.

**3. Byte-identity of the KEEP list — CONFIRMED by machine diff against `git show HEAD:`**

- All 6 once-guard declarations (`mintAttemptedRef`, `buildingRef`, `judgedUserIdRef`,
  `verdictFailedUserIdRef`, `runFailedRunIdRef`, `latchRunIdRef`) — present exactly once in both
  HEAD and current, identical text.
- Turns-tail construction — `.slice(0, lastUserIdx + 1)`, `.slice(-VERDICT_TURNS_MAX)`,
  `.filter((row) => row.text.trim() !== '')`,
  `content: boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX)` — all identical.
- POST shape — `body: JSON.stringify({ botId, turns }),` identical.
- Effect dep array — `}, [messages, streaming, building, runId, botId]);` identical.
- Gate lines — all 6 early-return guards, the M-8 reset pair
  (`judgedUserIdRef.current = null;` + `verdictFailedUserIdRef.current = lastUser.id;`), and the
  `setRunId(data.runId)` / `setVerdictHint(VERDICT_HINT)` branches — identical.
- **Render block**: the JSX from `return (` to EOF is **byte-identical to HEAD** (100 lines,
  `diff` clean). This is the requested visual check.
- **Frozen Turkish literals**: `MINT_FALLBACK_ERROR`, `START_FALLBACK_ERROR`,
  `PLAN_MISSING_MESSAGE`, `VERDICT_HINT`, `SUGGESTIONS` — all byte-identical to HEAD. Every other
  Turkish product string (hero title/sub, hint, retry hint, saving line, build-started line,
  build link, placeholder, cost line, chips, back link) lives inside the byte-identical render
  block, so it is covered by that check transitively.

**4. Header + comments — CONFIRMED.** The header (`:1-28`) was rewritten and now documents the
position rule ("The plan offer is a POSITION, not a sentence"), explicitly stating no word-list,
no string gate, and that a paraphrase approval takes the same path. A whole-file grep for
surviving ask-line documentation (`ask line`, `ask-line`, `word-list`, `diacritic`, `adjacency`)
returns only **two** hits, both of which are *descriptions of the removal* ("no word-list
matcher, no string gate at all"; "no ask line, no diacritic folding, no substring search") —
no surviving documentation of the deleted contract as if it still existed. The ask-line-era
comments on the turns-tail block, the M-8 catch, the `PLAN_MISSING_MESSAGE` constant, the
409 branch, and the effect were each rewritten to the position rule.

**5. Owned test file — CONFIRMED.** Ask-line verbatim assertions removed; the new cases exist:
- `PARAPHRASE_APPROVALS = ['baslat', 'yap', 'sen karar ver', 'you decide']` (`page.test.tsx:93`)
- position cases with non-ask assistant turns (`'OK — I think that covers it.'`,
  `'Sure, drafting something now.'`) around `:798`
- the negative half — `'the first user turn is never judged — no assistant turn precedes it'` (`:833`)
- M-8 marker (`:1283`), M-9 fresh-verdict-on-failure (`:1359`), M-9 follow-up cross-runId marker
  leak (`:1457`) all present and passing.

**6. `bounds.ts` / route / `packages/ai` — CONFIRMED untouched by this task.** `bounds.ts` does
not appear in `git status` at all. The route and `packages/ai` diffs belong to the wave's other
two owners.

---

## Code Quality

- **No secrets** on either touched file. My broad grep flagged `page.test.tsx:91` on the
  substring `sk-`; on inspection this is the word **"ask-line"** inside a comment
  ("the wordings the deleted ask-line gate could never…"), not a credential. False positive,
  reported here so it is not re-found as a mystery.
- **No manifest edits, no installs.** `package.json`, `package-lock.json`, `apps/web/package.json`,
  `packages/ai/package.json` all absent from `git status`.
- **No scope creep.** No wheel/scroll/CSS assertions added (`grep` for
  `wheel|scrollTo|scrollTop|getComputedStyle|toHaveStyle` → none), consistent with the task
  being trigger logic only.
- No `any`, no new runtime dependencies, no hardcoded user-facing English. The shared-component
  English labels stay out of scope as documented in the header.

---

## Findings

| ID | Severity | Location | Finding |
|---|---|---|---|
| F-1 | **Low / informational** — pre-existing, **not** introduced by this task | `apps/web/app/dashboard/new/page.tsx:61` and the render block at `:457`, both byte-identical to HEAD | The two remaining Turkish hint strings still instruct the person to type the literal word **"evet"**: `PLAN_MISSING_MESSAGE` ("…sonra kısaca "evet" yaz") and the on-screen hint ("…plan doğru görününce "evet" yaz — kurulumu asistan kendisi başlatır"). Under this task's position rule the start fires on **any** reply, so the copy now over-instructs: someone who wants to approve in their own words will read "yaz evet" and do that instead. This is **not a defect in the change** — the spec's §4 rationale explicitly keeps `VERDICT_HINT` because "evet remains one valid approval", and this page's two sentences are in the same frozen class. Recording it because it is a **product-copy residue of the removed model**: the founder's intent was "approval in your own words", and two sentences still name the keyword. Changing them would breach §4 frozen copy, so it needs a founder/product decision, not a code fix. |
| F-2 | Informational | wave-level | The agent's own "Open Questions" notes the route's new `0 assistant turns` → 409 `no_plan_asked` is **unreachable from this page** (the chat hook always appends an assistant row per submit, so the only qualifying thread is one user turn with zero assistant rows, which the hook cannot produce). I did not re-verify the hook's internals (out of my whitelist) — flagging it as the agent stated it, since it is a route-owner concern, not a defect here. |
| F-3 | Informational | `apps/web/app/dashboard/new/page.tsx:252-255` | The position gate is `messages[lastUserIdx - 1]` with `!prev` covering the first-turn case — correct and intentional. No off-by-one: `lastUserIdx` is found by scanning from the end for a user row, and the first user row has `lastUserIdx === 0` → `messages[-1] === undefined` → early return. Verified by the passing negative test at `page.test.tsx:833`. |

No **High** or **Medium** findings. No blocker.

---

## Open Issues for Orchestrator

1. **F-1 is a founder decision, not a fix.** The frozen copy is intact (correct per spec), but
   two on-screen sentences still tell the person to type "evet" while the code now accepts any
   reply. If the founder wants the copy to match the new model ("kendi cümlelerinle onayla"),
   that is a §4 frozen-copy exception needing his approval — this reviewer cannot authorize it
   and the page should not be changed without it.
2. **This task alone does not fix the reported loop**, and the agent says so itself (Known
   Limitations) — it needs verdict-b's route change and persona-a's prompt change plus the
   `packages/ai/dist` rebuild. Consistent with the spec's §7 merged-tree requirement.
3. **"Done" per LESSONS §2.4 is NOT established by this review.** I verified the real gates,
   the byte-identity, and the broken-guard proof on the real tree — but I did **not** complete the
   end-to-end flow in a running browser against a live model. The spec's §7 live probe (Turkish
   paraphrase approval → 200 `verdict: yes, phase: queued` + a `builder_runs` row; hedged reply →
   unclear, no row) is still outstanding and remains the orchestrator's to run on the merged tree.
   Per §7, green suites are claims, not evidence.
4. **No git restore-from-HEAD command was run** during this review; the only writes were my own
   probe (reverted from a checksum-verified out-of-repo copy, verified byte-identical) and this
   report file.
