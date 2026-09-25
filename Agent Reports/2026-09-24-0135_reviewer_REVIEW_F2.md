# Task Report: review-F2

## Status

**PASS** (with 4 non-blocking findings recorded below)

Reviewer had no part in writing this code. Independent verification of the merged tree on disk;
no file was edited, no git command touched the tree.

## Artifacts verified on disk

| Artifact                                      | Evidence                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/app/dashboard/new/page.tsx`         | `git hash-object` = `fed6c14…`, differs from HEAD `60863f5…` (really modified) |
| `apps/web/app/dashboard/new/page.test.tsx`    | tracked `M`, 43 `it(` declarations, 0 `only`/`skip`/`todo`                |
| `Agent Reports/2026-09-24-0101_F2_MODIFY_dashboard-new-turkish.md` | exists, 13,398 bytes, mtime `2026-09-24 01:24`      |

Toolchain **detected, not assumed** (npm workspaces monorepo; from `package.json`):
`apps/web` scripts are `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`
(Vitest 5.0.0, ESLint 9.39.5, TS 5.9.3). Root scripts: `lint: eslint . --max-warnings 0`,
`typecheck: npm run typecheck --workspaces --if-present`.

## Gate results (command → exit code)

| Gate                            | Command                                                                    | Result                    |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| Typecheck (focused)             | `npx tsc --noEmit` (cwd `apps/web`)                                         | **exit 0**                |
| Typecheck (root, all workspaces)| `npm run typecheck` (repo root) — web + @corvus/ai + @corvus/spec           | **exit 0**                |
| Lint (focused, zero warnings)   | `npx eslint app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx --max-warnings 0` | **exit 0** |
| Lint (root, whole tree)         | `npm run lint` → `eslint . --max-warnings 0`                                | **exit 0**                |
| Format                          | `npx prettier --check <both files>`                                         | **exit 0** ("All matched files use Prettier code style") |
| Focused suite                   | `npx vitest run app/dashboard/new/page.test.tsx`                            | **49 passed (49)**        |
| Full web suite                  | `npx vitest run` (cwd `apps/web`)                                           | **942 passed / 63 files** |
| Peer route suite (F1 surface)   | `npx vitest run app/api/builder/verdict/route.test.ts`                      | **37 passed (37)**        |

Both suites run on the **merged tree**, not on an agent's tree. The 49 figure was confirmed
non-vacuously from the JSON reporter: 43 `it(` declarations, of which 2 are `it.each`
expanding to 3 cases each → 49 executed assertion results, **0 non-passed**. The parametrized
Turkish cases really ran:
`a Turkish plan ending with Başlayayım mı? / Baslayayim mi? / Başlayalım mı? starts the build on evet`
and `a 501-/1500-/2000-char plan turn still sends the ask line that ends it`.

## PASS/FAIL per acceptance criterion

### 1. Accept set includes `Can I start?` AND `Başlayayım mı?` — **PASS**

- `page.tsx:71` — `const ASK_LINES = ['Can I start?', 'Başlayayım mı?', 'Başlayalım mı?'];`
- Both call sites use `isPlanAsk`, not a literal: `page.tsx:278` (`prev.role !== 'assistant' || !isPlanAsk(prev.text)`) and `page.tsx:436` (`isPlanAsk(before.text)`). Grep confirms zero surviving `.includes('Can I start?')` comparisons on this page.
- Diacritic folding: `foldTurkish` (`page.tsx:86-91`) lowercases, strips the combining dot U+0307 that `'İ'.toLowerCase()` leaves, then folds `ışğçöüâî`. Mechanically re-implemented and re-run against the source: `Başlayayım mı?`, `BAŞLAYAYIM MI?`, ASCII `Baslayayim mi?` all match; a non-ask plan (`Başlayalım mı` without `?`) correctly does not.
- **Real path** (dev server :3000, instrument validated first — see below): a Turkish plan
  `Plan şu: karşılama mesajı ve XP rolleri. Başlayayım mı?` followed by `evet` posted
  `/api/builder/verdict` with exactly
  `{"botId":"1111…","turns":[{"role":"user","content":"Karşılama botu istiyorum"},{"role":"assistant","content":"Plan şu: … Başlayayım mı?"},{"role":"user","content":"evet"}]}`
  — the plan turn intact, diacritics and all, ending on the ask line. Before this task the same page posted nothing.

### 2. 409 renders a visible Turkish explanation, never silence — **PASS**

- `page.tsx:299-315` is a dedicated `response.status === 409` branch that reads **only** `message`
  from the body, falling back to `PLAN_MISSING_MESSAGE` (`page.tsx:54`). It deliberately does
  **not** call `readRefusalMessage` — confirmed by reading the branch: the shared reader's
  `error` fallback would print the raw code `no_plan_asked` to the screen. Reading `bounds.ts:66-72`
  confirms that fallback exists, so the avoidance is necessary, not stylistic.
- Render site `page.tsx:492` — `{buildError !== null ? <p role="alert">{buildError}</p> : null}`.
- The page's constant is **byte-identical** to the route's own: extracted both from disk and
  compared — `page.tsx` `PLAN_MISSING_MESSAGE` === `route.ts:132-133` `NO_PLAN_MESSAGE`,
  98 chars, `true`.
- **Real path**: with the route's current body
  `{error:'no_plan_asked', message:'Sunucu: plan okunamadı — yeniden isteyip "evet" yaz.'}` the page
  rendered `alert=Sunucu: plan okunamadı — yeniden isteyip "evet" yaz.` — the server's words, not the
  page's fallback. No run link, no `Build started` line.
- Legacy code-only body covered by its own test and by `PLAN_MISSING_HINT` equality in
  `page.test.tsx:719`.

### 3. `no`/`unclear` shows a Turkish hint, not blank — **PASS**

- `page.tsx:346` sets `VERDICT_HINT` (`page.tsx:61`); render `page.tsx:493` as `role="status"`
  (not `alert` — nothing failed, the decision is still the person's). Cleared on the next submit at
  `page.tsx:284` and `page.tsx:417` (both `setVerdictHint(null)`, confirmed by grep).
- Test `page.test.tsx:926` asserts the hint appears, no alert, no run link; `page.test.tsx:868`
  asserts the clear-on-next-reply.
- **Real path**: a `{verdict:'unclear', started:false}` response rendered exactly
  `status=Kurulum için onay gerekiyor — kısaca “evet” yaz ya da değiştirmek istediğin yeri yaz.`
  with no link; the following submit cleared it (role list came back empty).

### 4. All page-owned strings Turkish; cost copy honest — **PASS**

Independently enumerated from the rendered page, not from the test's own list.

- Every page-owned constant and JSX literal read as Turkish: hero `:463`, sub `:465`, guide
  `:479,487`, saving `:490`, build status `:496`, link `:498`, back link `:456`, chips `:40`,
  group `:517`, placeholder `:533`, region labels `:462,472,495`, fallbacks `:42,43`,
  `Adsız bot` `:112`, starter `:165,166`, cost line `:544`.
- Residue grep on source for all 16 pre-F2 English strings → **0 hits each** (including
  `Build this bot`, `All bots`, `Untitled bot`, `Welcome message`).
- `1.1` in `page.tsx` occurs **once** and only inside the explanatory comment at `:541`
  ("the old \"about 1.1\""); it is not rendered.
- **Real path**: the served HTML contains the Turkish hero/sub/hint/chips/placeholder/cost strings
  and **zero** of `What will your bot do today`, `All bots`, `Describe the bot you want`,
  `Build this bot`. The only two `1.1` occurrences in the 26,777-byte served HTML are inside an
  inline SVG `d="…1.17 1.17…"` path attribute — verified by dumping 120 chars of context around each.

### 5. Tests updated, suite green — **PASS**

49 passed focused (was 41 in the pre-F2 intermediate wave; 14 `it(` at HEAD); 942 passed / 63 files
full. No `only`, `skip`, or `todo` anywhere in the file. The suite grew in the right direction:
the new cases assert *behavior* (POST body bytes, rendered roles), not implementation shape.

### 6. Typecheck + lint clean — **PASS** (see table above; four independent commands, all exit 0)

## Guard non-vacuity (LESSONS.md §1/§8 — checked, not assumed)

The builder's own table claims nine breaks each caught. I could **not** re-run that matrix: the
"backup outside the repo" at `%TEMP%/f2-backup/` holds the **post-fix** files
(`md5sum` of its `page.tsx` = `b8b7bd8b…` = the live file, byte-identical), so the break matrix is
self-reported and not independently reproducible from what was left on disk. That is a
reproducibility note, not a defect claim.

I tested the underlying property a different way — **is the residue guard non-vacuous?** I checked
each of the 16 `ENGLISH_RESIDUE` entries against the true pre-F2 baseline recorded in
`Agent Reports/2026-09-22-1939_aibuild-newpage_MODIFY_auto-start.md` (the intermediate uncommitted
auto-start wave). Result: 12 of 16 are literal strings in `HEAD:…/page.tsx`, and the remaining 4
(`say yes when the plan looks right`, `A yes after a failed build`, `Saving your bot`,
`Build started`) are verbatim in that wave's report and were live on the page then. **All 16 map to
strings that really existed pre-F2**, so the list is a genuine regression guard, not a set of
strings that never existed. `BODY not.toContain('1.1')` is likewise non-vacuous — HEAD's cost line
read `About 1.1 credits per change`.

## Real-path verification and instrument validation (LESSONS.md §1)

A `next dev` server was already live on `127.0.0.1:3000` (PID 10836). **Validated before use**:
`GET /dashboard/new` → HTTP 200; the six Turkish strings unique to this edit were present in the
served HTML, the four pre-F2 English strings were absent, and the only `1.1` bytes were SVG path
data. I additionally proved the served client bundle is the *current* source, not a stale build:
every page-level constant (`Başlayayım mı?`, `plan mesajı okunamadı`, `Kurulum için onay gerekiyor`,
`Adsız bot`, `no_plan_asked`) was found in `_next/static/chunks/apps_web_1o51ys4._.js` and nowhere
else — a bundle built from the file under review.

Exercised on the real page with `fetch` intercepted and every request recorded: the Turkish
plan→`evet` POST (criterion 1), the 409 alert (criterion 2), the `unclear` status line and its
clearing (criterion 3). Console: no application errors — the only entries were the two expected
`404` resource lines for `/api/templates/moderation` (the `templates` table is empty in this DB;
`GET /api/templates` returns `{"templates":[]}`).

**The StrictMode template fix is real, and I confirmed it outward-facing.** On a load of
`/dashboard/new?template=moderation` the page issued `/api/templates/moderation` **exactly 2 times**
(the double-invoke the report describes, so no once-guard is present). With the route fulfilled
in-browser as `{name:'Moderation', capabilities:['moderation','logging']}`, the composer filled with
`Moderation gibi bir bot kur: moderation, logging`. Without the guard that is the correct outcome;
the report's own measurement (guard present → fetch once, composer empty) is consistent with this.

## Findings (all non-blocking; none changes the verdict on any criterion)

**R1 — minor, cross-peer: the two ask-line gates are not true twins.**
`route.ts:146-148` states the route's fold is "the twin of the new-bot page's own" and that "the two
gates must recognize the same set". The route's `foldAskText` collapses whitespace runs
(`.replace(/\s+/g,' ')`) and trims; the page's `foldTurkish` (`page.tsx:86-91`) does **not**. I
re-implemented both and compared on the same inputs: `"Plan şu. Başlayayım\nmı?"` and
`"Plan şu. Başlayayım  mı?"` → **page=false, route=true**. `ASK_LINES` themselves are byte-identical
(verified by extraction), so only the fold differs. Direction is safe — the page declines to
auto-start where the route would have accepted, so no user ever sees an unexpected 409 — but the
"twins" claim is literally false and nothing pins it. One-line fix in the page's fold, or a test
that pins the difference deliberately. In `page.tsx`'s scope, not the route's.

**R2 — minor, stale rationale comment (page.tsx:45-53).** The comment above
`PLAN_MISSING_MESSAGE` says "the route knows the English line; a Turkish plan it cannot read comes
back this way." As of peer task F1 in this same wave, the route (`route.ts:150,521`) accepts the
same three ask lines, so it *can* read a Turkish plan — the comment describes the pre-F1 state.
Behaviour (prefer the server's `message`) is still correct and still the right choice; only the
justification is out of date. Worth correcting so the next reader does not re-introduce the belief
that the route is English-only.

**R3 — pre-existing duplicate module, not introduced by F2.** `lib/verdict/bounds.ts:66` still
exports its own `readRefusalMessage` — a near-copy of `lib/http/refusal.ts:26` minus the
`allowErrorFallback` option — and the page imports from `bounds`. `http/refusal.ts`'s own header
says it exists precisely because the same reader had been copied four ways and "a fix to one side
without the others showed a code where a sentence belonged". A fourth copy survives; F2 preserved
it (import unchanged) rather than converging. mtimes confirm `bounds.ts` (02:55) predates
`http/refusal.ts` (04:01), so this is not F2's regression. Escalating as LESSONS §2 territory
(enumerate the class, fix together) — but it is a separate task, not a fix to F2.

**R4 — directory hygiene.** `apps/web/app/dashboard/new/page.module.css` is also dirty vs HEAD, by
one line: `padding-bottom: env(safe-area-inset-bottom);` at `:107`. It is **not** F2's change — it
matches the deferred item listed in `Agent Reports/2026-09-22-1902_boption-newpage_MODIFY_auto-start.md`
— and it is benign. Noted only because a reviewer of this directory should know the third dirty
file is not attributable to the report under review. F2's report correctly lists only its two files.

## Escalations in the report, verified

Both open questions are accurate and correctly out of scope:
- `ai-chat-input.tsx:921` (`aria-label="Prompt"`), `:994` (`Attach image — sending is not connected yet`), `:1027` (`Send prompt` / `Stop recording` / `Use voice input`) — all three confirmed on disk.
- `chat-thread.tsx:34` (`Retry`) and `:51` (`This reply used N credits · platform failures retry free.`) — confirmed; the report cites `:44/51`, and the `Retry` label is at `:34` (minor line-drift in the citation only).
- The recommendation (pass labels as props) is supported by the file: `PromptInputProps` already
  exposes `placeholder`, so a `labels`/`ariaLabel` prop is a small, non-breaking addition.

## Public Interface Exposed

No exported API changed. `export default function NewBotPage()` unchanged; new page-local, non-exported
helpers `foldTurkish` (`:86`) and `isPlanAsk` (`:94`); no new dependencies; no manifest touched.

## Known Limitations of this review

- Template seeding was driven with an in-browser fulfilled response, not the real database: the
  `templates` table is empty in this environment, so `GET /api/templates/<slug>` answers 404 for every
  slug. The page's honoured contract (slug in, fetch, fill) was exercised; real row content was not.
- The verdict POST was driven with intercepted responses. A real run needs a session plus a persona
  lane, and would write builder/spend rows — deliberately not done.
- The builder's nine-break guard matrix is self-reported (see the non-vacuity section for what I
  could substitute).
- No `.design-src/` exists anywhere in this repo for `/dashboard/new`, so there was no source design
  to diff against; visual verification is limited to the real-path screenshots/snapshots taken
  (page rendered end-to-end in Turkish, no visual fault observed).
