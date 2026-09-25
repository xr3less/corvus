# Task Report: newpage-c-intent-start

## Status
SUCCESS

## Timestamp
2026-09-25-1553 (report written 2026-09-25-1615)

## Files Touched
- MODIFIED: `apps/web/app/dashboard/new/page.tsx`
- MODIFIED: `apps/web/app/dashboard/new/page.test.tsx`

No other file touched. `apps/web/lib/verdict/bounds.ts`, the verdict route, and
`packages/ai/**` were NOT touched (verified via `git status`).

## Dependencies Added
None. No manifest edits, no installs run.

## What Changed (contract §3a, item by item)

1. **DELETED** `ASK_LINES`, `TURKISH_FOLD`, `foldTurkish`, `isPlanAsk` — the
   page now contains zero content checks, zero diacritic folding, and zero
   substring searches. Verified: `grep -c 'ASK_LINES|foldTurkish|isPlanAsk|TURKISH_FOLD'`
   returns 0 in both the page and its test.
2. **REPLACED** the adjacency gate with the position gate:
   `if (!prev || prev.role !== 'assistant') return;` (page.tsx:255). The
   `showSaving` (mint-race) block dropped `isPlanAsk(before.text)` from its
   condition for the same reason — it is the same gate class, so it moved with
   the rest (LESSONS §3: fix the class, not the call site).
3. **KEPT byte-identical** — machine-verified against the HEAD copy of the file
   with a 24-pin check plus a render-block byte comparison:
   - once-guards: `mintAttemptedRef`, `buildingRef`, `judgedUserIdRef`,
     `verdictFailedUserIdRef`, `runFailedRunIdRef`, `latchRunIdRef` (all 6
     declarations byte-identical)
   - turns-tail construction: `slice(0, lastUserIdx + 1)` → `slice(-VERDICT_TURNS_MAX)`
     → whitespace filter → `boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX)`
   - POST shape: `body: JSON.stringify({ botId, turns })`
   - all early-return gates and the effect dep array `[messages, streaming, building, runId, botId]`
   - the entire `return (<> ... </>)` render block: **byte-identical**
   - frozen Turkish literals: 7/7 byte-identical (see below)
4. **REWROTE** the file header comment, the turns-tail comment, the effect
   comment, the `PLAN_MISSING_MESSAGE` comment, the 409-branch comment, and the
   M-8 catch comment — every one of them documented the ask-line contract that
   is gone. Two comments now actively explain the position rule.

### Frozen Copy Verification (spec §4)
Machine-diffed every Turkish string literal in the file against HEAD:
- `MINT_FALLBACK_ERROR`, `START_FALLBACK_ERROR`, `PLAN_MISSING_MESSAGE`,
  `VERDICT_HINT`, `SUGGESTIONS` — **byte-identical**
- Hero title/sub, hint, retry hint, saving line, build-started line, build link,
  placeholder, cost line, chips, back link — all inside the byte-identical
  render block
- The only Turkish source lines removed are the 9 lines of the deleted
  string-gate block itself (the `ASK_LINES` array and the fold table/functions).

## Tests

`app/dashboard/new/page.test.tsx` — **58 tests, all green** (was 49).

Removed (ask-line verbatim assertions, all now meaningless):
- the `ASK_LINE` / `ASK_LINE_TR` / `ASK_LINE_TR_ASCII` fixtures
- `longAskPlan(...)` (built plans whose END carried the ask line)
- the 3-case `it.each([ASK_LINE_TR, ASK_LINE_TR_ASCII, 'Başlayalım mı?'])`
  Turkish-ask-line table
- the "Turkish hint clears" / "Turkish plan reaches the POST whole" wording
  assertions that depended on an ask line being present

Added (spec §3a cases):
- **`it.each` × 4 — any assistant turn before the reply triggers the verdict**:
  an English plan, a Turkish plan, `OK — I think that covers it.`,
  `Sure, drafting something now.` — none carries an ask line, none is a
  question, none is a keyword. Every one POSTs exactly once. Under the deleted
  gate every one of these would have been judged never.
- **`it.each` × 4 — paraphrase approvals** (`baslat`, `yap`, `sen karar ver`,
  `you decide`) posted like any other reply, each asserted as the last turn of
  the POSTed tail.
- **the first user turn is never judged** — no assistant turn precedes it, so
  no POST; the second turn (whose predecessor IS an assistant turn) then POSTs
  exactly once. This is the negative half of the position rule.
- **M-8 preserved**: transport failure → honest fallback, judged pin cleared,
  the failed row held by the failure marker (settling re-posts nothing), and
  the NEXT user turn posts again and lands the run. The count stays at 1
  between failure and the next turn.
- **M-9 preserved**: failed build → latch marks exactly that runId → a later
  turn posts a FRESH verdict carrying the new row and lands run-2; the same
  failed row never re-posts.
- **M-9 follow-up preserved, sharpened**: while run-2 is live, a turn that is
  position-ELIGIBLE by construction (a new user row after an assistant turn)
  posts nothing — so only the run gate can be holding it, not the judged pin.
- **`it.each` × 3 — long plan turns** (501/1500/2000 chars) posted whole under
  the bound; the kept-ends assertions now check the head/tail boundary and
  `VERDICT_TURN_MAX` exactly without depending on an ask line.
- **12-row tail** test still sends exactly 12 turns ending at the judged reply.

All fixtures that previously depended on an ask line now carry plain prose, so
every test in the file is itself proof that the page reads nothing.

### Harness check — the new guard was broken and watched to fail (LESSONS §8)
A guard is not a guard until you break the thing it guards. Two probes run
against the rewritten suite, then reverted:
- re-adding `|| !prev.text.includes('Can I start?')` → **31 of 58 tests fail**
- inverting the position test (`if (prev && prev.role === 'assistant') return;`)
  → **27 of 58 tests fail**

Both directions of the gate are therefore genuinely covered, not vacuously
green.

## Gates Run (project's real commands, detected toolchain = npm workspaces)
- `npm run typecheck` → `tsc --noEmit` in `apps/web`: **0 errors** (whole app)
- `npx eslint app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx --max-warnings 0`: **0 warnings**
- `npx prettier --check` on both files: **clean**
- `npx vitest run app/dashboard/new/page.test.tsx`: **58 passed / 58**
- `npx vitest run` (whole `apps/web`): **65 files passed, 933 passed, 73 skipped
  (DB-gated loud skips), 0 failed** — no collateral breakage

## Assumptions Made
- The `showSaving` mint-race block (page.tsx:400-412) was in scope as part of
  the same gate class. Spec §3a names only the effect's gate, but leaving
  `isPlanAsk` there was impossible (the function is deleted) and leaving it as a
  bare position check would have been the same contract applied twice. It now
  reads `before.role === 'assistant' && judgedUserIdRef.current !== messages[i].id`.
  Its behaviour is unchanged in the tested paths (the mint-race test passes
  unmodified).
- Three M-8/M-9 tests previously contained a "middle turn preceded by the ack,
  not the ask line — judges nothing" step. Under the position rule that middle
  turn IS eligible, so the step was rewritten to assert what the surviving
  guard actually holds (the run gate / the failure marker) rather than being
  deleted. No behaviour assertion was weakened — the M-9 follow-up got
  strictly sharper.
- The `PLAN_MISSING_HINT` / `no_plan_asked` UI path was left fully intact
  (spec §3b gives the route the new zero-assistant-turns meaning; the page
  keeps preferring the server's `message`).

## Open Questions for Orchestrator
- **Not blocker-level, but worth a look at merge time:** the `0 assistant turns`
  409 is now unreachable from this page, because `useChatStream` always appends
  a user row AND an assistant row per submit (submit() pushes both). Every user
  turn therefore has an assistant predecessor except the very first, and the
  first is never the *last* user row once a second turn exists. So the page can
  only earn a 409 for a thread of exactly one user turn with zero assistant
  rows — which the hook cannot produce. The route's new gate (§3b) is still the
  right fail-closed backstop for direct callers; this is informational only.
- `apps/web/app/api/builder/verdict/route.test.ts` (verdict-b's file, not mine)
  had 2 transient `TS1128` syntax errors while I was working; they are gone as
  of my final run (`tsc --noEmit` = 0 errors app-wide, and the full suite is
  green). No action needed, noting it only so a mid-wave snapshot is not
  mistaken for my regression.

## Public Interface Exposed
No exported surface changed. The page's default export and all component props
are untouched. The internal gate is now:

```ts
const prev = messages[lastUserIdx - 1];
if (!prev || prev.role !== 'assistant') return;
```

## Known Limitations
- **"Done" per LESSONS §2.4 is not claimed by this agent.** I ran the real
  gates on the real tree, but I did not complete the end-to-end flow in a
  running browser against a live model — that is the orchestrator's merged-tree
  live probe (spec §7: Turkish paraphrase approval → 200 `verdict: yes,
  phase: queued` + a `builder_runs` row; hedged reply → unclear, no row). My
  evidence is unit-level plus a broken-guard proof.
- The page change alone does NOT fix the reported loop. It needs verdict-b's
  route change (§3b) and persona-a's prompt change (§3c) plus the `dist`
  rebuild to take effect end to end. A merged tree with only this change would
  still loop — the other two string gates are still live.
- No test asserts on wheel/scroll or CSS; none was in scope.

## Notes on Standing Constraints
- No git restore-from-HEAD command run (`stash` / `checkout --` / `restore` /
  `reset`) — the only git reads were `git show HEAD:<file>` redirected to a
  temp copy outside the wave, and `git diff` / `git status` (read-only). The
  temp probe directory was removed.
- `C:\Users\xr3less\Desktop\wiroai.txt` was never read. No secrets referenced.
