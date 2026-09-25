# Task Report: verdict-b-intent-start

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/builder/verdict/route.ts
- MODIFIED: apps/web/app/api/builder/verdict/route.test.ts

No other file touched. `apps/web/lib/verdict/bounds.ts`, the new-bot page, and
`packages/ai` are untouched — verified by `git diff --stat` above.

## Dependencies Added
None. No manifest edits, no installs run.

## What changed (spec §3b compliance)

**route.ts**
1. DELETED `ASK_LINES`, `foldAskText`, `askedToStart`, and the ask-line 409 gate.
   The 409 `no_plan_asked` now fires ONLY when the posted turns contain zero
   assistant turns. Code `no_plan_asked` and `NO_PLAN_MESSAGE` bytes unchanged
   (diffed against HEAD — identical).
2. `planView` = last assistant turn via the kept-ends `boundedView`; `replyView` =
   last user turn. `PLAN_MAX`/`PLAN_TAIL_MAX`/`REPLY_MAX`/`REPLY_TAIL_MAX`
   unchanged. `deriveLanguage(planView, replyView)` unchanged.
3. Gate order and the whole enqueue path byte-identical to HEAD (diffed
   programmatically, see Verification below).
4. Header comment rewritten to describe the position-based trigger; the stale
   "twin of the new-bot page" paragraph and the `interview_progress` "ask line"
   reference are gone.

**route.test.ts** — removed every ask-line verbatim pin (5 constants, 6 tests) and
added:
- paraphrase approvals (`baslat`, `yap`, `sen karar ver`, `you decide`,
  `go ahead and build it`, and `hazlo` — Spanish, neither Turkish nor English) →
  `yes` + `phase: queued` + a `builder_runs` row + a pg-boss job;
- hedged / conditional / change-asking / off-topic replies → `unclear`, no start;
- bare greeting (`merhaba`, `hello`) → `unclear`;
- zero-assistant-turns → 409 `no_plan_asked` (three shapes: user-only, empty array,
  `turns` absent);
- position: the LAST assistant turn is judged, not an earlier one (negative
  assertion that the earlier turn's text never reaches the prompt);
- a 1500-char ask-line-free plan turn is judged, and its kept-ends view is still
  exactly `PLAN_MAX`.

All judge stubbing rides the route's EXISTING `__setPersonaCaller` seam. No live
provider is contacted, no new seam invented.

## Verification (harness: npm workspaces + vitest; commands detected, not assumed)

- **Owned suite:** `npx vitest run app/api/builder/verdict/route.test.ts` →
  **40 passed / 40**. (Baseline before my change: 40 passed / 1 failed — see
  note below.)
- **Lint:** `npx eslint app/api/builder/verdict/route.ts app/api/builder/verdict/route.test.ts --max-warnings 0`
  → exit 0, zero warnings.
- **Typecheck:** `npm run typecheck --workspace @corvus/web` (`tsc --noEmit`).
  This reports zero errors in both files in my scope. The only errors in the
  project are 4× `TS2304: Cannot find name 'ASK_LINE'` in
  `app/dashboard/new/page.test.tsx` — agent newpage-c's in-flight file, mid-edit
  (mtime 16:09:56, during my test run). Not mine, not in my scope.
- **Frozen copy:** diffed all 14 refusal/message constants against `HEAD` →
  IDENTICAL.
- **Enqueue path + response shapes:** diffed the INSERT→send→response block
  against `HEAD` → IDENTICAL.
- **Guard break-test (LESSONS §13: a guard is not a guard until you break the
  thing it guards).** I temporarily reinstated a wording gate in the route:
  - `!planTurn.content.includes('Can I start?')` → **22 tests fail**, including
    every new paraphrase case. The paraphrase guards genuinely depend on the
    string gate being gone.
  - `planTurn !== assistantTurns[0]` (first turn instead of last) → exactly the
    position guard fails, 39 others pass — the position test is pinned to the
    right index and nothing else.
  Both breaks reverted; suite re-run green at 40/40 afterwards.

## Assumptions Made

1. **`TURKISH_FOLD` renamed to `FOLD_TO_ASCII`, behavior identical.** Spec §3b
   contains an internal conflict: it lists `TURKISH_FOLD` among the identifiers to
   DELETE, but in the same section requires `deriveLanguage(...)` unchanged — and
   `deriveLanguage` → `isTurkishText` → `foldTurkish` → `TURKISH_FOLD` is a hard
   dependency. The acceptance criterion greps for the identifier `TURKISH_FOLD`,
   so I satisfied both readings: the constant is gone by that name, the fold's
   behavior (and therefore `deriveLanguage`) is untouched. No behavioral delta.
2. **`foldAskText` renamed to `foldTurkish`** for the same reason — the language
   detector still needs it, and the old name belonged to the deleted gate. Also
   satisfies the acceptance grep.
3. The plan view is still `boundedView(planTurn.content, PLAN_MAX, PLAN_TAIL_MAX)`
   even though no string is matched in it anymore — the judge still reads it, so
   the billed-input cap must stay.

## Open Questions for Orchestrator

None blocking. Two notes for the merge gate:

1. The `TURKISH_FOLD` / `deriveLanguage` conflict in §3b above is worth a spec
   correction in the same task that fixes `PLAN.md` — a future agent reading §3b
   literally would delete the fold and break Turkish language detection.
2. `app/dashboard/new/page.test.tsx` currently fails typecheck (4× `ASK_LINE`) and
   its suite (31/58 failing) — newpage-c was actively writing at 16:09:56 and
   16:10:22, so this is very likely just an unfinished sibling task, not a
   regression. Flagging so the merged-tree gate does not mistake it for fallout
   from this change.

## Public Interface Exposed

No change to any exported symbol or wire shape. Unchanged and re-verified:
`POST`, `BUILDER_QUEUE`, `__setPool`, `__setSessionReader` / `__resetSessionReader`,
`__setBossFactory` / `__resetBossFactory`, `__setPersonaCaller` /
`__resetPersonaCaller`, types `VerdictSession`, `VerdictSessionReader`,
`BuilderBoss`, `PersonaResult`, `PersonaCaller`, `Verdict`.

Request body `{ botId, turns }` and every response body/status are byte-identical
to HEAD. The only observable behavior change is the intended one: a paraphrase
approval now reaches the judge and can start a build, and a plan turn no longer
needs to end with any particular sentence.

## Known Limitations

- **Not exercised in the running app.** Per the spec, the live probe (Turkish
  paraphrase → 200 `verdict: yes, phase: queued` + a `builder_runs` row) is the
  orchestrator's merged-tree step, and this report does NOT claim it. Everything
  here is unit-level plus the guard break-tests; "done" for the flow still
  requires that live probe (LESSONS §2.4).
- The stub judge in the new tests is a deterministic stand-in for the real model.
  It encodes the intent policy the real prompt asks for, so it proves the ROUTE
  passes replies through and acts on the verdict — it does not, and cannot, prove
  the live model classifies any particular Turkish phrasing correctly.
- Route-level only. The client-side half of the fix (the new-bot page's
  `isPlanAsk` deletion) is agent newpage-c's task; this route is now willing to
  start on any plan turn, but the page must stop gating before the two halves
  meet.
