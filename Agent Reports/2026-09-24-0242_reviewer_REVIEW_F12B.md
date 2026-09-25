# Task Report: review-F12B

## Status

**FAIL**

**Scope of the fail:** the pin F12 was asked to add is **verified correct and
non-vacuous** — I re-derived it with my own instrument and it trips. The failure
is in the **report's completeness claim** ("One-string guard hole closed") and in
the guard's own header comment: **one more entry of the same class is still
dead.** `['search placeholder', 'Search bots...']` (`page.test.tsx:42`) can never
fire, because an `<input placeholder>` is an *attribute* and
`document.body.textContent` does not contain attribute values. Reverting
`page.tsx:225` to its English baseline leaves **all 25 tests green** — English
ships on first paint with every gate passing. A one-line fix closes it.

This is the same class the prior review FAILed on and that F12's own report says
it closed: *a guard entry that exists but cannot match.*

---

## Files Touched

None. Read-only review. No `Write`/`Edit` on any in-scope path; no git command
that writes to the working tree (no restore/commit/push/deploy/migrate/secrets).
The file you are reading is the only file created. All mutation work ran on a
temp copy outside the repo (created and deleted; see "Instrument").

## Dependencies Added

None.

---

## Independent Verification

### 1. Toolchain — detected from manifests, never assumed

| Component | Manifest / resolver          | Resolved | Locked by task | Match |
| --------- | ---------------------------- | -------- | -------------- | ----- |
| TypeScript | `npx tsc --version`          | 5.9.3    | 5.9 strict     | YES   |
| ESLint    | `npx eslint --version`       | 9.39.5   | 9 flat config  | YES   |
| Vitest    | `npx vitest --version`       | 5.0.0    | 5              | YES   |
| Prettier  | `apps/web/package.json`      | 3.9.6    | 3.9.6          | YES   |
| React / Next | `apps/web/package.json`   | 19.2.8 / 16.3.4 | as locked | YES |

Manager: npm workspaces (root `package.json` `workspaces: ["apps/*","packages/*"]`),
`package-lock.json` present. Not symlinked to a different version: `apps/web`
resolves its **own** `vitest@5.0.0` (the root store holds a stale `vitest@3.2.7`
that a naive out-of-repo copy picks up — see "Instrument").

### 2. Gates on the merged tree — true exit codes, never through a pipe

```
$ cd apps/web && npx tsc --noEmit                                  # EXIT 0
$ cd <root> && npx eslint apps/web/app/dashboard/bots/page.test.tsx --max-warnings 0   # EXIT 0
$ cd <root> && npx prettier --check apps/web/app/dashboard/bots/page.test.tsx          # EXIT 0, "All matched files use Prettier code style!"
$ cd apps/web && npx vitest run app/dashboard/bots/page.test.tsx   # EXIT 0 — 1 file, 25 passed (25)
```

No `.only` / `.skip` focused test: `grep -nE "\.(only|skip)\("` → no matches.
Counts: `it(` ×25, `expect(` ×121 — matches the report's 25/121 (prior reviewer
baseline 25/120; the +1 is the assertion this fix added).

### 3. Cited bytes — read and compared

- `page.tsx:192` → `                    ? 'Yükleniyor…'` — confirmed, byte source.
- `page.test.tsx:38` → `  ['counts line', 'Loading…'],` — confirmed.

**U+2026 ellipsis byte-equality (asked for explicitly):** both the residue entry
and the source literal carry the **same** U+2026 HORIZONTAL ELLIPSIS:

```
src  bytes at Yükleniyor… : 89 195 188 107 108 101 110 105 121 111 114 226 128 166 39
test bytes at Loading…    : 76 111 97 100 105 110 103 226 128 166 39
test ellipsis char: "…" U+2026 | src ellipsis char: "…" U+2026 | BYTE-EQUAL: true
```

The substring trap the prior review identified is also gone:
`"Loading…".includes("Loading your bots") === false`, and the entry is now an
exact string, so it matches. **Note the contrast with Finding 1 below:** there the
*bytes* are right and the *channel* is wrong.

Residue list grew by exactly one: **33 entries** now vs the 32 the prior review
counted — entry #8 is the new one, no entry removed or weakened.

### 4. The pin itself — re-derived with my own instrument

I did not trust the report's mutation run; I rebuilt it (see "Instrument") and ran
both directions.

**(a) Revert the source, all guards live → SUITE FAILS (correct):**

```
mutated line 192: "                    ? 'Loading…'"
→ app/dashboard/bots/page.test.tsx:183
  expect(within(botsRegion).getByText('Yükleniyor…')).toBeTruthy();
  Test Files 1 failed (1) | Tests 1 failed | 24 passed (25) | EXIT 1
```

**(b) Isolation probe — is the new residue entry itself live, or is only the
direct assertion carrying it?** I disabled *only* the direct assertion in the copy
and left the residue entry as the sole guard:

```
direct assertion disabled in COPY; source mutation still present: true
AssertionError: counts line still English: Loading…:
  expected 'BotlarAnlat, botun burada belirsin.Bo…' not to contain 'Loading…'
  Test Files 1 failed (1) | Tests 1 failed | 24 passed (25) | EXIT 1
```

**Both halves of the fix are independently live.** The residue entry alone
catches the revert, and the direct assertion alone catches it. This is the
"assert the set *and* its size" requirement met.

### 5. Class enumeration — I did not stop at the named instance

Because the lesson is *never fix only the call site that surfaced the defect*, I
enumerated **every user-visible string this page owns** and mutated each one back
to its true pre-task English baseline (recovered from
`%TEMP%/f12-backup/page.tsx.bak`, the wave's uncommitted baseline; `HEAD` is not
the baseline — see Assumption 2).

**32 mutations were actually run: 31 tripped, 1 stayed green.** (Five further
anchors missed my literal first pass because the source text differed from my
guess — the three worth re-running were corrected and re-run; a missed anchor is
not a verdict and none was counted.) The table below lists the distinct strings,
which is the unit that matters for a guard.

One methodology note, because it is how a wrong instrument hides: my **first**
instrument silently resolved `vitest@3.2.7` from the root store instead of the
workspace's `5.0.0`, and it reported the unmutated copy green. A wrong instrument
that reports green looks exactly like a working one. I caught it by comparing the
version string in the runner banner against the manifest, rebuilt the instrument,
and re-validated before trusting any mutation result.

| # | String reverted to English | Verdict |
| - | -------------------------- | ------- |
| 1 | counts loading `Yükleniyor…` (the F12 target) | TRIPPED (1 failed) |
| 2 | section aria `Botların` | TRIPPED (7) |
| 3 | section title `Botların` | TRIPPED (3) |
| 4 | counts empty `Henüz veri yok` | TRIPPED (2) |
| 5 | counts 3-status `Canlı/Deneme/Çevrimdışı` | TRIPPED (2) |
| 6 | tab `Tümü` | TRIPPED (3) |
| 7 | tab `Canlı` | TRIPPED (1) |
| 8 | tab group aria `Botları duruma göre filtrele` | TRIPPED (1) |
| 9 | pill `Çevrimdışı` | TRIPPED (3) |
| 10 | loading shell `Botların yükleniyor…` | TRIPPED (1) |
| 11 | empty state `Henüz botun yok…` | TRIPPED (4) |
| 12 | empty action `İlk botunu anlat` | TRIPPED (1) |
| 13 | no-match state `Bu filtreye uyan bot yok.` | TRIPPED (1) |
| 14 | no-match action `Aramayı temizle` | TRIPPED (1) |
| 15 | logged-out line | TRIPPED (1) |
| 16 | login action `Giriş yap` | TRIPPED (1) |
| 17 | count unit `üye` | TRIPPED (1) |
| 18 | count unit `sunucu` | TRIPPED (1) |
| 19 | card aria `bot detayını aç` | TRIPPED (2) |
| 20 | card action `Aç` | TRIPPED (4) |
| 21 | card action `Etkinlik` | TRIPPED (3) |
| 22 | card action `Ön kontrol` | TRIPPED (3) |
| 23 | cards list aria `Bot kartları` | TRIPPED (6) |
| 24 | build panel `Kurulum ilerlemesi` | TRIPPED (2) |
| 25 | build panel sub | TRIPPED (3) |
| 26 | search label `Botlarda ara` | TRIPPED (5) |
| 27 | sort label `Botları sırala` | TRIPPED (4) |
| 28 | sort option `Durum` | TRIPPED (3) |
| 29 | sort option `İsim A-Z` | TRIPPED (3) |
| 30 | new bot action `Yeni bot` | TRIPPED (4) |
| 31 | page sub | TRIPPED (3) |
| **—** | **`placeholder="Botlarda ara…"` → `"Search bots..."`** | **GREEN — 25 passed** ← Finding 1 |

31 rows, one string each, all tripped — plus the one green row = **32 executed**,
matching the totals above. The pin is not a spot fix; the page-owned text-node
copy is genuinely swept. But the sweep has exactly one remaining blind entry, and
it is the same defect class.

---

## Findings

### Finding 1 — `['search placeholder', 'Search bots...']` is a dead entry; an English placeholder ships with all gates green

- **Entry:** `page.test.tsx:42` — `['search placeholder', 'Search bots...'],`
- **Source:** `page.tsx:225` — `placeholder="Botlarda ara…"`
- **Why it cannot fire:** `expectNoEnglishResidue()` sweeps
  `document.body.textContent`. An `<input>` is a void element — it has **no text
  children**, so its `placeholder` attribute never reaches `textContent`. The
  entry is structurally incapable of matching, whatever text it holds.

  **Decisive probe** (temp copy, English placeholder injected, redirected render
  introspected):
  ```
  input placeholder attr = "Search bots..."      <- English IS in the DOM
  input visible to user  = true                  <- and it IS user-visible
  body.textContent has "Search bots"     = false <- channel cannot see it
  body.textContent has "Search bots..."  = false <- not a bytes problem
  ```
  Note the entry's *text* is correct — it matches the baseline
  (`page.tsx.bak:208` → `placeholder="Search bots..."`, three ASCII dots). The
  defect is the **channel**, not the string. That is exactly why it reads as
  correct and survived both the build and the prior review.

- **Repro (read-only, decisive):** change `page.tsx:225`
  `placeholder="Botlarda ara…"` → `placeholder="Search bots..."`. All gates stay
  green:
  ```
  Test Files 1 passed (1) | Tests 25 passed (25) | EXIT 0
  ```
  No test asserts the Turkish placeholder (`getByPlaceholderText` appears
  **nowhere** in this file — it is used in `bots/[id]/page.test.tsx:294` and
  `Input.test.tsx:11`, so the idiom exists in this codebase and was simply not
  applied here). A placeholder is visible text on first paint, so this is
  English on the shipped surface, not a hidden attribute.

- **Class, not instance:** this is the third appearance of the same defect in
  this file's history — the prior review's Finding 1 (loading word unguarded,
  closed by F12), and now this. The pattern is *a guard whose body is narrower
  than its title*. Note the other attribute-carried entries in the list
  (`section region`, `tab group`, `card aria`, `cards list aria`) are **also**
  invisible to `textContent` — they are harmless only because separate
  role/name assertions happen to cover the same strings (my matrix proves they
  trip). The placeholder is the one entry with **no compensating assertion**, so
  it is the one that leaks.

- **Provenance:** **not** introduced by F12guard — the placeholder entry came in
  with the F12 MODIFY wave. F12guard added entry #8 correctly and did not audit
  its siblings. It is in scope for the verdict only because F12guard's report
  asserts *"One-string guard hole closed"* / *"no other file needs change"*, and
  because the file's own header comment still claims the list catches every
  English return:
  > `page.test.tsx:18-19` — "every string this page owns is asserted in Turkish
  > below, and `ENGLISH_RESIDUE` fails if one comes back."

  That sentence is **false as written** while this entry stands.

- **Fix (one line, one file):** assert the placeholder directly — the residue
  entry cannot be repaired because the channel, not the text, is the defect.
  `expect(screen.getByPlaceholderText('Botlarda ara…')).toBeTruthy();` inside an
  existing guarded test, and either delete the dead entry or move it to a
  channel that can see attributes. Then **re-run the mutation and watch it fail**
  (the point of the exercise). The sibling attribute entries deserve the same
  audit while the file is open.

### Non-findings — checked against suspicion, all clear

- **The pin is not circular.** `expectNoEnglishResidue()` is a negative sweep
  against `document.body.textContent`; each test separately asserts the Turkish
  positives by role and name. Verified non-vacuous by construction and by the
  isolation probe in §4(b).
- **No test was weakened.** 25 `it(` / 121 `expect(`; no `.only`/`.skip`; the new
  assertions were added inside an existing `it`, so the suite count correctly
  stays 25. No deleted test, no loosened matcher.
- **`page.tsx` untouched by this fix.** Its sha256 still equals the value both
  the builder and the prior reviewer recorded
  (`2b7b552bd8e847c7993bbc8834d3c4f8c7642fb94c12e50c99641a6011d11b82`), and its
  mtime (23:24) predates the test file's (23:48). The guard fix is test-only, as
  its report claims.
- **The `BuilderProgress` exclusion is real and documented**, in both the source
  header and the test comment, and independently asserted by
  `getByText('No run started')` at `page.test.tsx:521`. A stated, deliberate
  exclusion — not a blind spot.

---

## Accuracy of the build report

| Claim in `2026-09-24-0242_f12guard_FIX_botslist-guard.md` | Verdict |
| ---------------------------------------------------------- | ------- |
| Residue entry added: `['counts line', 'Loading…'],` | **TRUE** — `page.test.tsx:38`, byte-exact |
| Loading test asserts `within(botsRegion).getByText('Yükleniyor…')` | **TRUE** — `page.test.tsx:183` |
| U+2026 byte-equality between entry and source | **TRUE** — `226 128 166` on both sides |
| Focused suite 25 passed, EXIT 0 (run 3×) | **TRUE** — I reproduce EXIT 0, 25 passed |
| `npm run typecheck` EXIT 0 | **TRUE** — `tsc --noEmit` EXIT 0 |
| eslint `--max-warnings 0` EXIT 0 | **TRUE** |
| prettier `--check` clean | **TRUE** |
| Mutation on a temp copy trips the new entry | **TRUE** — and I confirmed it survives isolation |
| 25 `it(`, 121 `expect(` | **TRUE** |
| "One-string guard hole closed" / "no other file needs change" | **FALSE as a completeness claim** — Finding 1 |
| Only `page.test.tsx` modified | **TRUE** — page.tsx hash unchanged, mtime older |
| No manifest/lockfile/install touched | **TRUE** — `package-lock.json` mtime 2026-09-20, `.env.example` 2026-09-21, both days before this wave |

The report is accurate about everything it did. It is wrong only in the scope of
its completeness sentence — the same failure mode as the review it was written to
answer.

---

## Scope / artifacts / hygiene

- **In-scope files, unmodified.** Post-verification hashes are identical to
  pre-verification hashes:
  ```
  page.tsx      2b7b552bd8e847c7993bbc8834d3c4f8c7642fb94c12e50c99641a6011d11b82
  page.test.tsx 14131a66b714c2f185a0b277229b378adc695eb5bc4843896839ed850f088804
  ```
- **Artifacts on disk.** Both cited reports exist and were read in full. The
  report filename in the task prompt
  (`2026-09-24-0242_f12guard_FIX_botslist-guard.md`) matches the file on disk.
- **No manifest / lockfile / `.env` touched by this fix.** `package-lock.json`
  mtime `2026-09-20T08:09Z`, `.env.example` `2026-09-21T16:36Z` — both predate
  the wave entirely.
- **The wave is broad and uncommitted.** `git status` shows ~150 modified paths
  from the whole Turkish/expansion wave, so `git status` alone cannot isolate
  this fix's footprint; the per-file mtime + hash evidence above does. I ran no
  git command that writes to the tree (LESSONS §1 rule 6).
- **Instrument.** Filed outside the repo at `%TEMP%/f12b-instrument` (a full copy
  of `apps/web` minus `.next`, with `node_modules` assembled as junctions to the
  real hoisted store plus the workspace's own `vitest@5.0.0`/`@vitest/spy@5.0.0`).
  **Instrument validated before use:** the unmutated copy reproduces EXIT 0 / 25
  passed at vitest **5.0.0**, matching the repo. An earlier build of the
  instrument silently resolved `vitest@3.2.7` from the root store — a wrong
  instrument that still reported green; it was discarded, not trusted. **Deleted
  at the end; verified gone.** No probe, script, or mutation touched the real
  tree.
- **Minor, pre-existing, not F12's:** `apps/web/.vitest/` is untracked and absent
  from `.gitignore`. It predates this session's first command (present in the
  opening `git status`). Not introduced by this fix and not in its scope —
  recorded only so it is not mistaken for review residue.

---

## Assumptions Made

1. `apps/web` is the workspace that owns the real suite; `npx vitest` from
   `apps/web`, `tsc --noEmit` from `apps/web`, `eslint`/`prettier` from the repo
   root against the workspace path. Read from the manifests, not assumed.
2. **"Pre-task English baseline" = `%TEMP%/f12-backup/page.tsx.bak`**
   (sha256 `51ce1b0a1c6551e28b504465c9d2bbc2afb45900acfb56b3b7e1c1843b48bea0`),
   not `HEAD`. The wave is uncommitted, so `HEAD` predates the loading branch
   entirely — `HEAD`'s counts line has no `loading` ternary at all, which makes
   `HEAD` useless as the revert target. The `.bak` is where `'Loading…'` is the
   literal baseline (`page.tsx.bak:175`), and it is also the artifact the prior
   reviewer independently hash-matched. For the placeholder, `.bak:208` gives the
   baseline `placeholder="Search bots..."`.
3. "Merged tree" = the on-disk working tree, the wave being uncommitted.
4. Mutation testing on a temp copy is an acceptable substitute for mutating the
   real tree; the copy is byte-identical to the real file at the start and end of
   each run, and the real file's hash is unchanged afterwards.

## Open Questions for Orchestrator

1. **Finding 1 is the only blocker** — one dead entry + one overclaiming comment,
   one file. Recommend a one-line fix agent (assert the placeholder directly),
   not a re-open of the pin, which is correct.
2. **The header comment at `page.test.tsx:18-19` overclaims** and should be
   corrected in the same fix, or the class will keep recurring: the sweep cannot
   see attributes, so a claim of "fails if one comes back" is only true for
   text-node strings.
3. **Carried forward, unchanged, still unowned:** D-004 (`Docs/DECISIONS.md`,
   English-only) contradicts the shipped Turkish wave. One owner needed, not a
   per-page fix.

## Public Interface Exposed

Unchanged and unmodified by this review or by the fix. Verified against the
in-scope files: `BotsPage`'s signature, `fetchBots` / `readLiveBotRows` /
`mapLiveStatus` / `resolveBotId` / `formatCount` / `STATUS_RANK` /
`TRIAL_EXPIRED_MESSAGE` imports, the data flow, and every href are untouched —
`page.tsx`'s sha256 is byte-identical to the value recorded before the fix. The
only interface this task added is test-internal (`ENGLISH_RESIDUE` entry, one
assertion inside an existing `it`).

## Known Limitations

- I verified the **page's own** strings. Shared components reached from this page
  (`BuilderProgress`) remain English by design and are excluded from the guard —
  documented, asserted, and out of this task's scope.
- I did not exercise the app over HTTP (no dev server / auth session in this
  review). Every claim here is either a gate exit code, a file byte, or a
  redirected render in jsdom. Per LESSONS §2.3 that is weaker than a human
  completing the flow in the running app — appropriate for a guard-pin
  verification, but it is the reason the "ships English" statement in Finding 1
  rests on a DOM probe plus a green-suite mutation rather than a screenshot.
- My class enumeration is bounded by what I could enumerate mechanically
  (quoted literals, JSX text, and attributes). A string composed at runtime from
  fragments outside those patterns would not appear in it.
