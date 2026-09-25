# Task Report: F12-botslist-turkish

## Status

SUCCESS

## Files Touched

- MODIFIED: `apps/web/app/dashboard/bots/page.tsx`
- MODIFIED: `apps/web/app/dashboard/bots/page.test.tsx`

Final contents (sha256, on disk at report time):

| File                | sha256                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `page.tsx`          | `2b7b552bd8e847c7993bbc8834d3c4f8c7642fb94c12e50c99641a6011d11b82` |
| `page.test.tsx`     | `1d749085a596e3ca327ed81b6c64d42b3b2635c0d83cc7e85ca09870f89dd189` |

Pre-task baselines (copies kept outside the repo at
`%TEMP%/f12-backup/`, md5-verified against `HEAD`): `page.tsx` `51ce1b0a…`,
`page.test.tsx` `2ccc0f8a…`.

## Dependencies Added

None. No manifest, lockfile or install command was touched (hard rule).

## Assumptions Made

1. **Page-local Turkish `STATUS_LABEL`.** `lib/bots.ts` still exports an
   English `STATUS_LABEL` (`Online`/`Trial`/`Offline`) and that file is out of my
   scope, so the page stopped importing it and defines its own Turkish
   `STATUS_LABEL` (`Canlı`/`Deneme`/`Çevrimdışı`) locally. Chosen over editing
   the shared lib. **This makes the lib's copy dead for this page — see Open
   Questions.**
2. **`BuilderProgress` labels stay English.** `No run started`, `Queued`,
   `Generating`, `Syncing`, `Live`, `Build failed`, `Could not reach the builder`
   and the `Builder progress` landmark come from
   `components/ui/builder-progress.tsx`, which is shared with `/dashboard` and
   is out of scope. The page translates only what it owns (the section's own
   `Kurulum ilerlemesi` heading + sub-line) and the page comment says so.
   The residue list in the test deliberately excludes these strings, so the
   exclusion is stated, not a blind spot.
3. **`TRIAL_EXPIRED_MESSAGE` is rendered verbatim, not re-worded.** It is
   byte-locked in `lib/bots.ts` (KI-033) and printed on `/dashboard` and the
   bot-detail page too; a second Turkish wording here would be a second source
   of truth. A peer agent (F5) changed that constant to Turkish at 02:06 while
   this task ran; the page needs no change for it, and the test's expected
   constant was synced to the new sentence.
4. **`formatCount`'s `en-US` grouping stays in the lib.** The page passes the
   Turkish unit words (`üye` / `sunucu`, invariant after numerals) but does not
   re-implement number grouping; `lib/bots.ts` is out of scope.
5. **Word choices follow the wave and the already-Turkish rail.** `Botlar`,
   `Etkinlik`, `Ön kontrol` match `components/ui/dashboard-rail.tsx` so the list
   and the sidebar name the same things the same way. `…` is U+2026; the
   Turkish text uses the curly apostrophe `’`. Test data (bot names such as
   `Test bot Zorba: welcomes new mem`) is *account data*, not page copy, and was
   left as-is.
6. **`Docs/DECISIONS.md` D-004 ("Product language is English-only") vs. the
   live Turkish wave** was treated as already superseded in practice by the
   in-flight Turkish wave and the Turkish rail — I followed the wave rather than
   the doc, and escalated the contradiction instead of silently editing the
   decision log (out of scope).

## Open Questions for Orchestrator

1. **D-004 is now factually wrong.** It says the product language is
   English-only; the rail, `/dashboard/new` (F2), the trial/refusal copy (F5,
   F15) and now this page speak Turkish. Somebody should either amend D-004 or
   write a superseding entry — one owner, not per-page.
2. **Two owners for the same status words.** `lib/bots.ts` still exports an
   English `STATUS_LABEL`; this page now keeps a Turkish map of its own. Pick
   one: translate the lib constant and let pages import it (touches the lib and
   every consumer), or delete the unused export. Leaving both invites drift.
3. **Shared components need a language decision.** `BuilderProgress` (also on
   `/dashboard`) has no labels prop; it renders English on a Turkish page. The
   F2 review recommended label props for the same class of problem
   (`ai-chat-input.tsx`, `chat-thread.tsx`). One decision covers the class.
4. **Sibling surfaces are still partly English** and outside this task:
   `/dashboard`, `/dashboard/bots/[id]`, `/gallery`, `/privacy`.

## Public Interface Exposed

Unchanged and byte-identical in shape to the pre-task version:

- `export default function BotsPage({ bots, trialExpired }: { bots?: MockBot[]; trialExpired?: boolean })`
  — the default export the route consumes.
- Everything else added is page-local and **not exported**:
  `STATUS_LABEL`, `TAB_LABEL`, `SORT_LABEL`, `TABS`, `SORT_MODES`,
  `LOGIN_HREF`, `LOGGED_OUT_LINE`, `StatusPill`, `BotsInner`.
- Data flow untouched: `fetchBots(signal)`, the `?runId=` read, the
  `GET /api/session/trial` read (fail-open), `STATUS_RANK` ordering, tab/query
  filtering, `localeCompare` name sort, `BuilderProgress runId={runId}`, and
  every href (`/dashboard/new`, `/dashboard/bots/${id}`,
  `?tab=activity`, `?tab=preflight`, `/api/auth/login`). No import of the page
  exists anywhere but its own test.

## Known Limitations

- The build-progress panel still shows English text (shared component, out of
  scope) — see Open Question 3.
- The trial banner's sentence is the shared constant; this page cannot re-word
  it without creating a second source of truth.
- Number grouping for `üye`/`sunucu` counts comes from `lib/bots.ts`
  (`toLocaleString('en-US')`) and is therefore not Turkish-formatted.
- Sibling pages listed in Open Question 4 remain outside this task's scope.

## Verification

### Acceptance criteria

| # | Criterion                                                    | Result | Evidence                                                                                                                                                                                                                                                  |
| - | ------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | All user strings on this page Turkish                        | PASS   | Served HTML scan (below): 17 English strings → 0 occurrences; every page-owned string present in Turkish. Residue list in `page.test.tsx` (`ENGLISH_RESIDUE`, 32 entries) fails the suite if any returns.                                              |
| 2 | Tests green                                                  | PASS   | Focused suite `npx vitest run app/dashboard/bots/page.test.tsx` → `25 passed (25)`, exit 0 (25 `it(` declarations, 0 `only`/`skip`).                                                                                                                     |
| 3 | Typecheck clean                                              | PASS   | Repo root `npm run typecheck` (web + `@corvus/ai` + `@corvus/spec`) → exit 0, after the format fix.                                                                                                                                                       |
| 4 | Lint clean, zero warnings                                    | PASS   | `npx eslint . --max-warnings 0` (repo root) → exit 0.                                                                                                                                                                                                    |
| 5 | Format clean                                                 | PASS   | `npx prettier --check` on both in-scope files → "All matched files use Prettier code style", exit 0. (The test file needed one `--write` pass; recorded rather than hidden.)                                                                            |
| 6 | Data flow untouched                                          | PASS   | Section "Public Interface Exposed"; the only removed import is `STATUS_LABEL` (replaced by a page-local map). Real-path interactions below behaved identically to pre-change.                                                                              |

### Guard non-vacuity (LESSONS.md §1/§8 — broken and watched, not assumed)

One mutation matrix of 24 strings — every page-owned string the task translated
(hero title, sub-line, `Aç`, `Etkinlik`, `Ön kontrol`, counts units, both status
pills, search placeholder, counts line, tab `All`, sort `Name A-Z`, logged-out
line, `Aramayı temizle`, no-match line, `Bot kartları`, build-panel sub, search
label, sort label, `Durum`, filter group label, empty action, logged-out action,
`Yeni bot`, panel title). Each mutation was applied to the real file, the suite
run, then reverted with `sha256sum` re-verified after every revert (final hashes
are the table at the top).

- **First pass: 23 of 24 caught.** Mutating `online: 'Canlı'` → `'Live'` did
  **not** fail — the suite had no case that rendered an online pill, the exact
  "guard body narrower than its title" class. This is recorded as a real hole
  found and closed, not as a clean first run.
- **Closed and re-verified: 24/24 caught.** The fix was `renderAllThreeStatuses()`
  plus the test *"names every status in Turkish — pills, tabs and the counts
  line"* (which asserts all three pills, the tab row, the counts line, both sort
  options and the filter group together). Re-run of the previously-escaping
  mutation at 02:20, after the format fix: `1 failed | 24 passed`, exit 1; file
  restored and hash-verified to `2b7b552…`.
- Two assertions in the suite could not be satisfied by an English string at
  all (`FORBIDDEN`, 17 jargon terms; `MODEL_NAMES`, 5 model names) — they are
  inherited guards, out of this task's acceptance scope, and were left intact.

### Real-path verification in the running app (LESSONS.md §2.4)

Instrument validated before use: `next dev` live on `127.0.0.1:3000`; the page
307s to login when anonymous (so a 200 cannot be a cached shell), and a session
obtained via `POST /api/auth/dev-login` then `GET /dashboard/bots` returned
**HTTP 200, 21,946 bytes**.

- **English residue scan on the served HTML** — all 0 occurrences:
  `Your bots`, `New bot`, `Search bots`, `Loading your bots`, `No bots yet`,
  `Clear search`, `Pre-flight`, `Build progress`, `Follow your bot from draft`,
  `>Open<`, `>Offline<`, `>Trial<`, `Filter bots by status`, `Sort bots`,
  `Name A-Z`, `member`, `server<`.
- **Turkish strings present in the served HTML:** `Botlar` (9), `Anlat, botun
  burada belirsin.`, `Yeni bot`, `Botlarda ara` (2), `Botları sırala`, `Tümü`,
  `Canlı`, `Deneme`, `Durum`, `İsim A-Z`, `Yükleniyor…`, `Botların yükleniyor…`,
  `Kurulum ilerlemesi` (2), `Botunu taslaktan kayıtlı sürüme kadar izle.`
  The only English left in the page's own region is `No run started` (1) — the
  shared `BuilderProgress`, as documented.
- **Browser session (Playwright, `127.0.0.1:3000`)**, real session cookie, real
  row (`Test bot Zorba: welcomes new mem`, pill `Deneme`):
  - Accessibility snapshot: `heading "Botlar"` L1, `region "Botların"`,
    `link "Yeni bot" → /dashboard/new`, `group "Botları duruma göre filtrele"`
    with `Tümü / Canlı / Deneme`, labels `Botlarda ara` + `Botları sırala`,
    options `Durum` / `İsim A-Z`, `list "Bot kartları"`, card link
    `/dashboard/bots/05a0cf98-…` with actions `Aç`, `Etkinlik`
    (`?tab=activity`), `Ön kontrol` (`?tab=preflight`),
    `region "Kurulum ilerlemesi"`. Counts line rendered `Canlı 0 / Deneme 1 /
    Çevrimdışı 0` — matching the real data.
  - Interactions: `Canlı` tab → `Bu filtreye uyan bot yok.` + `Aramayı temizle`;
    `Aramayı temizle` → list back; search `zorba` → exactly 1 row (the real bot),
    search `zzzznomatch` → 0 rows + the Turkish no-match line, clearing → 1 row;
    sort → `name` → row order recomputed with the same single row.
  - Console: 0 errors, 0 warnings.
  - Screenshot: `C:\Users\xr3less\AppData\Local\Temp\f12-artifacts\f12-bots-turkish-final.png`
    (kept outside the repo so no stray image is left in the tree).

### Full web suite — the 3 failures are not mine, and that is proven, not assumed

`npx vitest run` (cwd `apps/web`, post-format-fix): **982 passed / 3 failed /
985 total, 61 of 64 files green**. The three failures are in
`app/gallery/page.test.tsx`, `app/privacy/page.test.tsx`,
`app/dashboard/new/page.test.tsx` — peer surfaces of the same uncommitted wave.

**Proof of independence, not a claim:** both in-scope files were temporarily
restored to their pre-task baselines (`51ce1b0a…` / `2ccc0f8a…`) and those three
suites re-run — **the same 3 tests failed (3 failed / 72 passed)** with my change
absent from the tree. My files were then restored and hash-verified back to
`2b7b552…` / `1d74908…`. Additionally, grep shows nothing imports
`app/dashboard/bots/page.tsx` except its own test, so no other suite can be
affected by this change. This mirrors the earlier pre-existing-failure finding
for `app/dashboard/bots/[id]/page.test.tsx`, whose count has since dropped to
zero on the merged tree as peers landed their work.

### What was deliberately NOT done (scope discipline)

- No file outside the two in-scope paths was edited — `lib/bots.ts`,
  `builder-progress.tsx`, `dashboard-rail.tsx`, `Docs/DECISIONS.md` and the
  sibling pages were read only.
- No manifest, lockfile or install command; no git restore/commit/push/stash;
  no deploy, migration or secret access.
- The only git commands run were read-only (`status`, `diff`, `hash-object`) —
  no working-tree write.
