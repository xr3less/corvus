# Task Report: F16-demo-turkish

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/lib/demo/brain.ts
- MODIFIED: apps/web/lib/demo/brain.test.ts

Untouched (verified by `git status --porcelain`): `apps/web/app/api/demo/message/route.ts`,
`apps/web/app/demo/page.tsx`. No file outside `apps/web/lib/demo/` was modified.

## Dependencies Added
None. No manifest was edited and no install command was run.

## Assumptions Made
- **Language detection is a property of the question, not a switch.** The brain holds two
  reply tables (English + Turkish) and picks one per request from the incoming text. No env
  var, no config, no per-session state — otherwise the same visitor could not be answered in
  the language they actually typed.
- **Turkish template/category names stay English.** `welcome`, `moderation`, `tickets`, etc.
  are gallery catalog rows (apps/gateway/src/db/seed-templates.ts), not translatable prose, so
  both reply tables list the identical eight names in the identical order.
- **Short Turkish markers were treated as whole words, long ones as substrings.** `mi`, `ne`,
  `kac`, `var` must be whole words or they fire inside English (`minimum`, `one`, `various`);
  `fiyat`, `sablon`, `yardim` are substrings so Turkish suffixes still match (`fiyatı`,
  `şablonlar`).
- **Diacritic-stripping is for matching only, never for output.** `toFold` exists to make
  `şablon` and `sablon` the same needle; the reply strings are never folded.
- **The `other` template-name check was not extended to the Turkish copy's sentence wrapper.**
  `xp` / `connector` / `status` are checked against the whole reply in both languages, which is
  the drift that matters; the Turkish wrapper wording carries no such vocabulary.

## Open Questions for Orchestrator
- **D-004 vs. this task (product decision, not technical).** `Docs/DECISIONS.md:118` records
  D-004 as *"English-only product, docs, marketing, and support. No Turkish UI or docs until
  validated demand says otherwise. **Superseded by: none**"*, decided by the founder on
  2026-09-07. F16 as briefed adds Turkish *replies* to a public product surface, which reads as
  a partial reversal of that one-way decision. I implemented exactly what F16 asked for and did
  not touch the decision record — but the record now contradicts shipped behaviour, and only the
  founder can close that. The three F-series siblings (`F1_verdict-turkish-gate`,
  `F2_dashboard-new-turkish`, `F3_persona-turkish`) suggest a deliberate new direction; if so,
  D-004 wants an explicit superseding entry.
- **Turkish selection is keyword + diacritic based, not a language model.** A Turkish question
  with no diacritic and none of the listed words inside a broader Turkish sentence will fall to
  the English table. Widening the word list is the cheap fix; genuine detection is V2 territory
  and out of this task's scope.

## Public Interface Exposed
Unchanged in shape — no consumer needs to change:

```ts
export interface DemoBrain {
  reply(text: string): Promise<string>;
}
export const scriptedBrain: DemoBrain;
```

`route.ts` line 84 (`const brain: DemoBrain = scriptedBrain;`) still compiles against this
interface untouched. Response shape `{ reply }` and the 20/hour limit are unchanged.

## Known Limitations
- Turkish detection covers the listed stems and whole words plus any diacritic. Unlisted
  Turkish with no diacritic stays English.
- Replies are a scripted mirror, not a translation layer — a six-intent keyword demo. Nothing
  here generalises to the AI persona (`F3` owns that surface).
- Only the demo brain is bilingual. The demo *page* chrome (labels, button text, error notices
  in `app/demo/page.tsx`) remains English; F16's scope was the brain only.

## Verification

Toolchain detected from `apps/web/package.json`: npm workspaces, Vitest 5, `tsc --noEmit`,
ESLint 9 (`--max-warnings 0`), Prettier 3 with the repo's `.prettierrc`.

**Green gates**

| Gate | Command | Result |
|---|---|---|
| Focused tests | `vitest run lib/demo/brain.test.ts app/api/demo/message/message.test.ts app/demo/page.test.tsx` | 3 files, **56 passed** |
| Typecheck | `tsc --noEmit` | **0 errors in `lib/demo`** |
| Lint | `eslint --max-warnings 0` on both files | exit 0 |
| Format | `prettier --check` on both files | "All matched files use Prettier code style" |

**Real path exercised, not just the unit.** A temporary probe (written, run, then deleted —
not committed) drove the actual `POST` handler in `app/api/demo/message/route.ts`: a Turkish
body returned a Turkish reply, an English body returned English, `Object.keys(data)` was exactly
`['reply']`, and 21 consecutive Turkish requests returned 20x200 then 429 with `Retry-After`.
All 5 probe cases passed. The route contract is provably intact because the probe used the real
handler, and `route.ts` itself is unmodified.

**Guards proven to have teeth (each broken, watched to fail, restored).** Per `LESSONS.md` §1.8,
a guard is not a guard until you have broken the thing it guards:

1. *Whole-word marker matching* → rewritten to naive substring: **red** (`does not let the
   Turkish markers fire inside English words`). Restored: 35/35 green.
2. *Language routing* → hard-wired to always reply Turkish: **red**, 8 tests failed including
   all six English trigger tests. Restored: green.
3. *Turkish gallery provenance* → two categories swapped in the Turkish copy: **red**, 5 tests
   failed including `live template trigger returns the pinned gallery reply in both languages`.
   Restored: 36/36 green.

**Pre-existing failures in the tree — NOT mine, and NOT fixable in scope.** The full web suite
reports 22 failures across 8-9 files (`app/page.test.tsx`, `app/dashboard/page.test.tsx`,
`components/ui/ai-chat-input.test.tsx`, `app/dashboard/bots/[id]/page.test.tsx`,
`app/api/chat/route.test.ts`, `app/privacy/page.test.tsx`, `components/ui/chat-thread.test.tsx`,
`app/dashboard/new/page.test.tsx`, `scratch-probe.test.ts`). Evidence they are independent of
F16:
- **No file in the failing set imports `lib/demo/brain`.** The only importers are
  `app/api/demo/message/route.ts` (unmodified) and `message.test.ts` (passing).
- **Failure causes are unrelated** — e.g. `Unable to find an accessible element with the role
  "region"` on dashboard/landing DOM structure; jsdom image-attachment errors in
  `ai-chat-input.test.tsx`.
- **`tsc --noEmit` reports errors in exactly one file, `scratch-probe2.test.ts` (untracked,
  not mine), and zero mentioning `lib/demo`.**
- **The failing set changed between two runs (8 vs 9 files) and several failing files carry
  mtimes after my edits**, with untracked `scratch-probe.test.ts` / `scratch-probe2.test.ts`
  present — a concurrent agent is working this same tree.

I did not fix these: they are outside my declared scope, and `SCOPE GUARD` required escalation
rather than silent expansion. Flagging so the orchestrator can attribute them to the right wave.

**One instrument error I made and corrected, recorded because it nearly produced a false
pass.** My first attempt to prove the gallery guard had teeth grepped the output for the test
*title*, which appears in the file's own constant — so it printed a green-looking line while
the run was actually red. Re-run with a JSON reporter, the true result was 5 failures. The
lesson is `LESSONS.md` §1.1: the instrument, not the result, was wrong.
