# Task Report: F2-dashboard-new-turkish

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/new/page.tsx
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx

`apps/web/lib/http/refusal.ts` was read as context only and is byte-unchanged. No other file was
created, modified, or deleted; no manifest, lockfile, or env file was touched.

## Dependencies Added

None.

## Assumptions Made

- **The shared composer/thread components stay English on this page.** `PromptInput`
  (`components/ui/ai-chat-input.tsx:921`, `aria-label="Prompt"`) and `ChatAssistantRow`
  (`components/ui/chat-thread.tsx:51`, `This reply used N credits · platform failures retry free.`)
  render English strings inside `/dashboard/new`'s own layout. Both files are outside this task's
  scope and both also serve `/dashboard/bots/[id]`, so translating them is a cross-page copy wave,
  not this task. The page's own test documents this exclusion explicitly
  (`page.test.tsx:41-44`) instead of pretending the page is free of English. Escalated below.
- **409 keeps its own constant as a fallback.** The route (`app/api/builder/verdict/route.ts:509`)
  now ships the Turkish sentence as `message`; the page prefers it and falls back to its own
  byte-identical `PLAN_MISSING_MESSAGE` for the older code-only body. `readRefusalMessage` is
  deliberately NOT used on this branch: its `error` fallback would print the raw code
  `no_plan_asked` to the screen, which is exactly the defect class this task closes.
- **`no`/`unclear` renders `role="status"`, 409 renders `role="alert"`.** A refusal is an error;
  "nothing started yet, approve or adjust" is not. Both previously rendered nothing.
- **Turkish ask lines are matched diacritic-folded, not added to the server.** The route's
  English-only gate is byte-locked by `persona-prompt.ts` and its own suite, so the page stops
  closing the auto-start path for a Turkish plan (the page-side defect) and the 409 sentence
  carries the remedy. Outgoing turns are never rewritten: injecting the English ask line would
  misrepresent the model's own reply and perturb a tested contract.
- **`Docs/DECISIONS.md` D-004 says English-only product language.** The persona prompt and the two
  reference reports (`2026-09-24-0023_…`, `2026-09-24-0031_…`) establish that the owner writes
  Turkish; this task's explicit acceptance criteria for this single-user surface were followed.
  Flagged below rather than silently resolved.

## Open Questions for Orchestrator

1. **Shared-component English on this page.** `ai-chat-input.tsx:921` (`Prompt`),
   `ai-chat-input.tsx:994` (`Attach image — sending is not connected yet`),
   `ai-chat-input.tsx:1027` (`Send prompt` / `Use voice input`) and `chat-thread.tsx:44,51`
   (`Retry`, `This reply used N credits …`) are still English inside `/dashboard/new`. They are
   out of scope here and shared with the bot-detail page, so a single Turkish surface needs a
   decision: localize the shared components (both pages gain Turkish) or pass labels as props
   (each page picks its language). Recommend props — it keeps the two pages independent.
2. **D-004 vs. the live product language.** D-004 ("English-only product language") now conflicts
   with the shipped persona prompt and this page. One of them should be amended so the decision
   record stops contradicting the product.

## Public Interface Exposed

- No exported API changed. `export default function NewBotPage()` is unchanged.
- Page-local, non-exported: `isPlanAsk(text: string): boolean` (`page.tsx:94`),
  `foldTurkish(text: string): string` (`page.tsx:86`), constants `ASK_LINES` (`:71`),
  `TURKISH_FOLD` (`:75`), `PLAN_MISSING_MESSAGE` (`:54`), `VERDICT_HINT` (`:61`),
  `SUGGESTIONS` (`:40`), `MINT_FALLBACK_ERROR` (`:42`), `START_FALLBACK_ERROR` (`:43`).
- Test-only helpers: `verdictConflict()` (`page.test.tsx:175`, server sentence shape),
  `verdictConflictCodeOnly()` (`:187`, legacy shape), `ENGLISH_RESIDUE` (`:46`).
- `lib/http/refusal.ts` and `lib/verdict/bounds.ts` are unchanged; the page still imports
  `readRefusalMessage` from `bounds` for the mint/start/other-refusal branches (`page.tsx:34`).

## Known Limitations

- The 409 remedy is a sentence, not a mechanism: the person must ask the assistant for the plan
  again so it re-emits the locked English ask line. Making the route accept a folded Turkish ask
  line is a route change and was outside this scope.
- The composer's `aria-label` and the assistant row's cost/retry lines remain English (see Open
  Questions 1).
- The verdict POST requires a session and a real persona lane; the browser-verified 409/unclear
  runs used intercepted responses (the page under test is the client). The route's own behavior is
  covered by its own suite.

## Verification

### Acceptance criteria

| #   | Criterion                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Accept set includes `Can I start?` AND `Başlayayım mı?`  | `page.tsx:71` — `ASK_LINES = ['Can I start?', 'Başlayayım mı?', 'Başlayalım mı?']`; both call sites use `isPlanAsk` — `:278` (`prev.role !== 'assistant' \|\| !isPlanAsk(prev.text)`) and `:436` (`isPlanAsk(before.text)`)                                                                                                                                                                                                   |
| 2   | 409 renders a visible Turkish explanation, never silence | `page.tsx:299-315`; render site `:492` (`role="alert"`). Tests `page.test.tsx:699` (server sentence) and `:715` (legacy code-only body)                                                                                                                                                                                                                                                                                       |
| 3   | `no`/`unclear` shows a Turkish hint, not blank           | `page.tsx:346` sets `VERDICT_HINT` (`:61`); render `:493` (`role="status"`); cleared on the next submit `:284`, `:417`. Test `page.test.tsx:926`                                                                                                                                                                                                                                                                              |
| 4   | All page-owned strings Turkish; cost copy honest         | hero `page.tsx:463`; sub `:465`; guide `:479,487`; saving line `:490`; build status `:496`; link `:498`; back link `:456`; chips `:40`, group `:517`; placeholder `:533`; region labels `:462,472,495`; fallbacks `:42,43`; `Adsız bot` `:112`; Turkish starter `:165,166`; cost line `:544` (the fabricated `1.1` is gone). Whole-page test `page.test.tsx:440` asserts 16 English strings absent and `not.toContain('1.1')` |
| 5   | Tests updated, suite green                               | `page.test.tsx` 49 passed (was 41); full `apps/web` **942 passed / 63 files**                                                                                                                                                                                                                                                                                                                                                 |
| 6   | Typecheck + lint clean                                   | `npx tsc --noEmit` exit 0; `npx eslint app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx --max-warnings 0` exit 0; `npx prettier --check` clean                                                                                                                                                                                                                                                                      |

### Guard verification (LESSONS.md §1 — broken and watched to fail)

Backups were taken outside the repo (`%TEMP%/f2-backup/`); no git command touched the tree. Nine
behavior breaks were applied one at a time against the final files, each followed by the page
suite; **all nine were caught**:

| Break                                                           | Result                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ASK_LINES` back to English-only                                | 4 failed (`Başlayayım mı?`, `Baslayayim mi?`, `Başlayalım mı?`, Turkish-plan POST) |
| 409 swallowed again                                             | 2 failed (both 409 tests)                                                          |
| `no`/`unclear` silent again                                     | 1 failed                                                                           |
| An English hero string back                                     | 2 failed (hero + whole-page sweep)                                                 |
| Cost line regains `1.1`                                         | 2 failed (hero + whole-page sweep)                                                 |
| Diacritic folding off                                           | 1 failed (the ASCII-Turkish case)                                                  |
| 409 read via `readRefusalMessage` (code could reach the screen) | 1 failed                                                                           |
| Server 409 sentence ignored                                     | 1 failed                                                                           |
| Template once-guard restored                                    | 1 failed (StrictMode test)                                                         |

### Real-path verification (LESSONS.md §2.4 — "done" means the flow ran in the app)

Dev server on `localhost:3000` (instrument validated first: the Turkish strings unique to this edit
were present in the served HTML and the only `1.1` on the page was inside an SVG path). Driven in
the browser with `fetch` intercepted and recorded:

- **Turkish plan + `evet` now posts the verdict at all.** Thread: `Karşılama botu istiyorum` →
  `İşte plan: karşılama mesajı ve XP rolleri. Başlayayım mı?` → `evet`. Recorded POST
  `/api/builder/verdict` with all three turns, the plan turn intact and ending in the Turkish ask
  line. Before this task the same page posted nothing and said nothing.
- **409 spoke.** Rendered alert read exactly `Sunucu: plan okunamadı — yeniden isteyip “evet” yaz.`
  (the server's own sentence, preferred over the page fallback).
- **`unclear` spoke.** Rendered status read exactly `Kurulum için onay gerekiyor — kısaca “evet” yaz
ya da değiştirmek istediğin yeri yaz.`; no alert, no run link.
- **Chips and cost line.** Clicking `Moderasyon kuralı` filled the composer; the cost line read
  `Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.`
- **`?template=` seeds.** `/dashboard/new?template=moderation` fetched `/api/templates/moderation`
  and filled the composer with `Moderasyon botu gibi bir bot kur: moderation, logging`.
- Page rendered end to end in Turkish (screenshot captured; heading, sub, guide, chips, placeholder,
  cost line all Turkish; the 16 English strings the suite pins were absent from the served HTML).

### Defect found and fixed during real-path testing

`?template=<slug>` seeding was dead in the running app: the `useSearchParams` effect is
double-invoked on a page load (React Strict Mode, on by default in the App Router) and the first
invocation is torn down, so its response could never land; a `useRef` once-guard set on that dead
run made the surviving run bail. Measured: with the guard, the fetch fired exactly once and the
composer stayed **empty** for every `?template=` load; without it, the fetch fires twice and the
draft fills with `Moderasyon botu gibi bir bot kur: moderation, logging`. The once-guard was
removed (`page.tsx:125-175`, rationale in the comment there); re-running is safe because the fetch
is idempotent and `setBrief` refuses to overwrite a non-empty draft. The unit test had stayed green
because its module-level `useSearchParams` mock never re-invokes — the template test now renders
under `<StrictMode>` (`page.test.tsx:898-920`) and goes red if the guard returns (verified: with the
guard re-applied the test fails in 1.0s, 1 failed / 48 passed).
