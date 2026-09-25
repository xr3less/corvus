# Task Report: review-F12

## Status

FAIL

**Scope of the fail:** the shipped UI copy is correct — every page-owned string
is Turkish on file, in the served HTML and by reading. The failure is in the
**guard** this task added (and its report's completeness claim): one page-owned
string's render path is unguarded, so reverting it to English leaves all 6 gates
green. Details in "Finding 1". A 3-line fix closes it.

## Files Touched

None. Read-only review — no file was edited (no `Write`/`Edit` on any
in-scope path; no git restore/commit/push/deploy/migrate/secrets). The report
file you are reading is the only file created.

## Dependencies Added

None.

## Assumptions Made

1. `apps/web` is the workspace with the real web suite; `npx vitest` from
   `apps/web`, `npm run typecheck` / `npx eslint .` from the repo root. Verified
   from the root `package.json` scripts — not assumed.
2. "Merged tree" = the on-disk working tree, since the wave is uncommitted
   (`git status` shows `M apps/web/app/dashboard/bots/page.tsx` and
   `M .../page.test.tsx`). `HEAD` is therefore not the baseline; the pre-task
   baselines are the two `.bak` copies at `%TEMP%/f12-backup/`.

## Open Questions for Orchestrator

1. **Finding 1 is the only blocker.** One-line guard gap at
   `page.tsx:192`. Recommend a one-string fix agent rather than re-opening the
   whole task.
2. The builder's Open Question 2 is now **stale**: `lib/bots.ts` no longer
   exports an English `STATUS_LABEL` — a peer changed it to Turkish at 02:21
   (`Canlı`/`Deneme`/`Çevrimdışı`, verified), 4 minutes before the F12 report
   was written. Nothing imports it (`grep` — 0 importers). Superseded, not
   actionable.
3. D-004 (`Docs/DECISIONS.md`, English-only) still contradicts the shipped
   Turkish wave — carried forward unchanged from the builder's report; needs one
   owner, not per-page.

## Public Interface Exposed

Verified unchanged against the pre-task baseline:

- `export default function BotsPage({ bots, trialExpired }: { bots?: MockBot[]; trialExpired?: boolean })`
  — byte-identical signature; the only diff in the page is copy + a page-local
  `STATUS_LABEL` and the removed `STATUS_LABEL` import from `@/lib/bots`.
- Data flow untouched: `fetchBots(signal)`, `?runId=` read, fail-open
  `/api/session/trial` read, `STATUS_RANK` sort, tab/query filter,
  `localeCompare` name sort, `BuilderProgress runId={runId}`, every href. Only
  its own test imports the page (`grep` — 1 importer), so no sibling suite can
  be affected by this change.

## Known Limitations

- `BuilderProgress` still renders English (`No run started`, `Generating`, …) —
  shared component, out of this task's declared scope, documented in the file
  header and the report. Excluded from the residue guard **by design and stated
  in the test comment** — not a blind spot. Independently confirmed: exactly 1
  occurrence of `No run started` in the served page region.
- Number grouping stays `en-US` via `formatCount` in `lib/bots.ts` (out of
  scope) — Turkish unit words, US thousands separator. Cosmetic; acceptable.

---

## Verification — artifacts first

`sha256sum` on the real files, against the hashes the builder reported:

| File                        | Builder's hash                                                     | Reviewer's recompute | Match |
| --------------------------- | ------------------------------------------------------------------ | -------------------- | ----- |
| `.../dashboard/bots/page.tsx`      | `2b7b552bd8e847c7993bbc8834d3c4f8c7642fb94c12e50c99641a6011d11b82` | identical            | YES   |
| `.../dashboard/bots/page.test.tsx` | `1d749085a596e3ca327ed81b6c64d42b3b2635c0d83cc7e85ca09870f89dd189` | identical            | YES   |
| Report                              | `Agent Reports/2026-09-24-0301_F12_MODIFY_botslist-turkish.md`      | exists, 13,796 B     | YES   |

Report exists on disk and was read in full. Pre-task baselines also verified
independently: `%TEMP%/f12-backup/page.tsx.bak` sha256 `51ce1b0a1c…` and
`page.test.tsx.bak` `2ccc0f8a3f…` — both match the report's claimed `51ce1b0a…` /
`2ccc0f8a…`. The screenshot at
`%TEMP%/f12-artifacts/f12-bots-turkish-final.png` exists (89,511 B) and is
outside the tree.

## Step 1 — typecheck + lint, real commands, zero warnings

```
$ cd <repo root> && npm run typecheck          # EXIT 0 — gateway, testbot, web, ai, spec all tsc --noEmit clean
$ cd <repo root> && npx eslint . --max-warnings 0   # EXIT 0, no output
$ npx prettier --check apps/web/app/dashboard/bots/page.tsx apps/web/app/dashboard/bots/page.test.tsx
  "All matched files use Prettier code style!"  # EXIT 0
```

## Step 2 — focused suite

```
$ cd apps/web && npx vitest run app/dashboard/bots/page.test.tsx
  Test Files  1 passed (1)   Tests  25 passed (25)   EXIT 0
$ grep -nE "\.(only|skip)\(" …/page.test.tsx   # no matches — no focused/skipped test
```

Assertion count grew, nothing was weakened: `it(` 24 → 25, `expect(` 109 → 120
against the pre-task baseline. Independent diff of the two files confirms every
hunk is a Turkish string swap, the added `renderAllThreeStatuses()` +
"names every status in Turkish" test, the added `ENGLISH_RESIDUE` list, and
comment changes — no deleted test, no loosened assertion.

## Step 3 — residue grep

**On the real served page.** Dev server validated before use (LESSONS §1):
anonymous `GET /dashboard/bots` → **307** (so a 200 cannot be a cached shell),
then `POST /api/auth/dev-login` → session → `GET /dashboard/bots` → **200,
21,946 B** — byte-count identical to the builder's 21,946 B.

20 English strings, each **0** occurrences in the served HTML: `Your bots`,
`New bot`, `Search bots`, `Loading your bots`, `No bots yet`, `Clear search`,
`Pre-flight`, `Build progress`, `Follow your bot from draft`, `>Open<`,
`>Offline<`, `>Trial<`, `Filter bots by status`, `Sort bots`, `Name A-Z`,
`member`, `server<`, `>Live<`, `>All<`, `Describe one`.

Turkish present: `Botlar` ×9, `Anlat, botun burada belirsin.`, `Yeni bot`,
`Botlarda ara` ×2, `Botları sırala`, `Tümü`, `Canlı`, `Deneme`, `Durum`,
`İsim A-Z`, `Yükleniyor…`, `Kurulum ilerlemesi` ×2. `Çevrimdışı` reads ×0 in
this sample because the single real bot is a trial row — correct data behaviour,
not a missing translation; the string is present in the source and asserted by
the suite. Only English left in the page's own region is `No run started` ×1,
the documented shared-component exclusion.

Diff of the pre-task baseline against the current file enumerates every copy
change and confirms all of it is Turkish; the only non-copy changes are the
removed `STATUS_LABEL` import, the page-local Turkish map, and comments.

## Step 4 — the three full-suite failures are not F12's, and that is proven

```
$ cd apps/web && npx vitest run
  Test Files  3 failed | 61 passed (64)   Tests  3 failed | 982 passed (985)   EXIT 1
  × app/gallery/page.test.tsx    — "falls back to the raw error code when a fork failure carries no message"
  × app/privacy/page.test.tsx    — "points Privacy Policy and Terms of Service at the real routes"
  × app/dashboard/new/page.test.tsx — "submitting streams the reply into a thread with botId null"
```

Counts match the builder's 982/3/64 exactly. Causation is **peer-caused, not
F12**, and I did **not** restore anything to prove it (the wave is uncommitted —
LESSONS §1 rule 6). Three independent structural proofs instead:

- `app/gallery/page.test.tsx:422` expects `trial_bot_limit`; the received text
  is `'Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi.'` — that string is
  `TRIAL_BOT_LIMIT_MESSAGE = TRIAL_DEAL` in `lib/bots.ts:60`, a **peer's** edit
  (F5). Nothing to do with the bots page.
- `app/privacy/page.test.tsx` fails with
  `Unable to find an accessible element with the role "link" and name "Privacy Policy"` —
  a translated landing-footer link (F13/F14 peer).
- `app/dashboard/new/page.test.tsx:490` asserts `/This reply used 1.1 credits/`
  against a peer's Turkish credits line.

And none of the three imports the bots page or `lib/bots` for that assertion
(`grep` per file). The builder's restore-baseline experiment is therefore both
consistent with my finding and unnecessary — it did not need to touch the tree
at all, and its end state was hash-verified back to `2b7b552…` (I recomputed
it independently, above).

## Step 5 — guard non-vacuity, re-derived from the file (found 1 hole)

I rebuilt the coverage matrix from the source rather than the report: extracted
every Turkish literal in `page.tsx`, then asked whether each is asserted in
`page.test.tsx`. Result: 23 of 24 page-owned Turkish literals are asserted, and
the 4 remaining ones (`Canlı ${…} / Deneme ${…} / Çevrimdışı ${…}`,
`${bot.name} — bot detayını aç`, `üye`, `Yükleniyor…`) are all covered **except
one** by the `ENGLISH_RESIDUE` list, which is applied in both guard-calling
tests where those strings render.

### Finding 1 — `Yükleniyor…` (page.tsx:192) is unguarded; the report's completeness claim is false

- `apps/web/app/dashboard/bots/page.tsx:192` — counts line, loading branch:
  `? 'Yükleniyor…'` — the only string in the file with **zero** test references
  (`grep -n "Yükleniyor" page.test.tsx` → no matches).
- The residue list has `['loading line', 'Loading your bots']`
  (`page.test.tsx:45`), which does **not** match the English baseline of this
  branch (`Loading…`) — verified by substring check: `"Loading…".includes("Loading your bots") === false`.
- The one test that renders this branch
  (`page.test.tsx:175`, "holds a loading shell…") does not call
  `expectNoEnglishResidue()` and asserts only the shell line
  `Botların yükleniyor…`, not the counts line's loading word. The guard is
  called in only two tests (lines 159, 210), both of which inject bots, so
  `loading === false` and this branch never renders under the guard.

**Repro (read-only, decisive):** change `page.tsx:192` `'Yükleniyor…'` →
`'Loading…'`. Every one of the six gates stays green: no test asserts the
Turkish word, the residue list has no matching entry, and the branch is never
rendered in a guarded test. English then ships on the page's first paint.

This is not a hypothetical branch: the SSR HTML of a cold page load renders it
(dumped `GET /dashboard/bots` contains
`…countsLine">Yükleniyor…`, exactly 1 occurrence). It is the *same class* the
builder's own report says it closed twice ("guard body narrower than its title",
`renderAllThreeStatuses()` for the online pill) — here the mutation **matrix**
itself has the hole, because it was enumerated from the strings the builder
remembered rather than from the file. The report's claim *"every string this
page owns is asserted in Turkish below"* (page.test.tsx:18 comment) and its
"24/24 caught" result are therefore both false as stated.

**Fix (one agent, one file):** add the counts-line loading word to the
`ENGLISH_RESIDUE` list (`['counts line', 'Loading…']`) **and** assert
`screen.getByText('Yükleniyor…')` in the loading test at `page.test.tsx:175`,
then re-run the mutation to watch it fail (LESSONS §1 rule 8). Note the residue
entry alone is not enough — that branch must first be rendered in a guarded test.

### The sibling strings are guarded, against suspicion

- `${bot.name} — bot detayını aç`: residue entry `['card aria', 'open bot detail']`
  catches its English baseline, and cards render in guard-calling tests. Guarded.
- Counts-line 3-status variant: residue entry `['counts line', 'Live ']` catches
  `Live n / …`. Guarded.
- `üye` / `sunucu`: English baselines `members` / `servers` are both listed, and
  guard-calling tests pass injected rows with counts. Guarded.

### Independence of the guard (not circular)

`expectNoEnglishResidue()` asserts **all** 32 English strings against
`document.body.textContent` on every guarded render, while each test separately
asserts the Turkish positives by role and name (`getByRole('heading', { name: 'Botlar' })`,
`getByLabelText('Botlarda ara')`, …). The guard is a negative sweep, not a
restatement of the assertions. Verified non-vacuous by construction: the
commented refusal-word list (`FORBIDDEN`) and `MODEL_NAMES` are unchanged from
the baseline and still applied.

## Verdict

FAIL — one finding, one string, one file. Everything else the report claims
survives independent checking: hashes match, all six gates reproduce green with
the real commands, the copy is Turkish on file *and* on the wire, the data flow
is untouched, the three full-suite failures are peer-caused (proven by the
failing strings' provenance, without touching the tree), and the shared
`BuilderProgress` exclusion is real and documented. Fix Finding 1 and this
passes.

---

## Commands run (all read-only)

```
cd <root> && npm run typecheck                                  # EXIT 0
cd <root> && npx eslint . --max-warnings 0                      # EXIT 0
npx prettier --check apps/web/app/dashboard/bots/{page.tsx,page.test.tsx}   # EXIT 0
cd apps/web && npx vitest run app/dashboard/bots/page.test.tsx  # EXIT 0, 25 passed
cd apps/web && npx vitest run                                   # EXIT 1, 982 passed / 3 failed / 64 files
cd apps/web && npx vitest run app/{gallery,privacy}/page.test.tsx app/dashboard/new/page.test.tsx  # EXIT 1, 72 passed / 3 failed
sha256sum apps/web/app/dashboard/bots/{page.tsx,page.test.tsx}  # match the builder's hashes
sha256sum "%TEMP%/f12-backup/"*.bak                             # 51ce1b0a… / 2ccc0f8a…, match
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/dashboard/bots           # 307 anonymous (instrument validated)
curl -s -c jar -X POST http://127.0.0.1:3000/api/auth/dev-login                       # 307
curl -s -b jar http://127.0.0.1:3000/dashboard/bots                                   # 200, 21,946 B
grep -c 'Yükleniyor' apps/web/app/dashboard/bots/page.test.tsx                        # 0 — Finding 1
grep -rn 'dashboard/bots/page' apps/web --include=*.tsx                                # only its own test imports it
```

No git command that writes to the working tree was run; no file was modified;
the wave's uncommitted state is exactly as found.
