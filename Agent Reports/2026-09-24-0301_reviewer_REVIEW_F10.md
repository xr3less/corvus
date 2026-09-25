# Task Report: review-F10

## Status

SUCCESS

## Reviewer identity and independence

Fresh independent reviewer (Sonnet tier). Did not write the code under review. Ran on the merged
working tree with **no edits to any source file**, no `git` command that restores from HEAD, no
commit, push, deploy, migration or secret access. All five F10 hashes were read before and after the
review and are unchanged (below), so this review is reproducible against the tree it judged.

- Timestamp: `2026-09-24-0301` (task-specified; review ran 02:00–02:25 local on 2026-09-24)
- Builder report reviewed: `Agent Reports/2026-09-24-0301_F10_MODIFY_rail-turkish.md` — **exists on
  disk, 15,024 bytes, mtime Sep 24 02:xx** (verified by `ls`)
- Toolchain detected: npm workspaces monorepo, root `package-lock.json` (no pnpm/yarn/bun lockfile);
  `apps/web` scripts are `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`. Verbatim
  commands below, not assumed ones.

## Verdict

**PASS** — the shipped code is correct, behaviour-identical to HEAD, and verified on the real path.
**Three findings** follow, none of which make the deliverable wrong, but one of which is a guard hole
the orchestrator should close before calling the regression net complete. Read them before moving on.

PASS means "the Turkish rail copy is live and nothing else moved", **not** "the evidence package is
perfect": finding 1 is a mis-cited test count, finding 2 is a missing member of the residue set, and
finding 3 is an overstated justification. All three are cheap to fix and all three are in F10's own
files.

---

## 1. Artifact integrity — verified, not trusted

Every hash F10 reported matches the file on disk byte-for-byte:

| File | Report md5 | Observed |
| --- | --- | --- |
| `apps/web/components/ui/dashboard-rail.tsx` | `a95484109f6e6843a50940bd33c55da3` | ✅ same |
| `apps/web/app/dashboard/layout.tsx` | `f1077c27cde18ca7e85c8508f90e6aa6` | ✅ same |
| `apps/web/components/ui/dashboard-rail.test.tsx` | `d2bba5d5120284637795d3b9a25e92dd` | ✅ same |
| `apps/web/app/dashboard/layout.test.tsx` | `6ed4721996a4d2be8d4753b56b41a360` | ✅ same |
| `apps/web/app/gallery/page.test.tsx` | `16f1308724788fbaed46f81b0097187b` | ✅ same |

The builder's line-number citations are accurate to the line: `dashboard-rail.tsx:50-57` (six
labels), `:65` (`Sunucum`), `:88-91` (`title="Yakında"` / `Yükselt · Yakında`), `:99`
(`Çıkış yapılıyor…` / `Çıkış yap`), `:40` (`Çıkış yapılamadı. Lütfen tekrar dene.`), `layout.tsx:14`
(`İçeriğe geç`). Every one checked against the file.

---

## 2. Gates — run on this tree, verbatim

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` (cwd `apps/web`) | **exit 0, zero output.** Two runs: run 1 exit 2 on `f16-fp-probe.test.ts(15,228) TS1005` — an untracked peer scratch file, since deleted by its owner — run 2 clean. **No F10 file ever appeared in the error list** (`grep dashboard-rail\|dashboard/layout\|gallery` on the output → no match). |
| Lint | `npx eslint dashboard-rail.tsx layout.tsx dashboard-rail.test.tsx layout.test.tsx page.test.tsx --max-warnings 0` | **exit 0**, no output |
| Format | `npx prettier --check <same five>` | **exit 0** — "All matched files use Prettier code style!" |
| Focused suites (the three modified files) | `npx vitest run components/ui/dashboard-rail.test.tsx app/dashboard/layout.test.tsx "app/gallery/[slug]/page.test.tsx"` | **3 files / 25 passed** |
| The rail block inside the out-of-scope file | `npx vitest run app/gallery/page.test.tsx -t "gallery rail"` | **2 passed / 19 skipped** |

The task's four steps: (1) real typecheck + lint zero warnings — **pass**; (2) focused vitest —
**pass**; (3) residue grep — see §3.4 and finding 2; (4) report exists — **pass**.

---

## 3. Findings

### Finding 1 — the cited focused-suite command does not produce the cited number (reporting defect)

The report reads: ``npx vitest run components/ui/dashboard-rail.test.tsx app/dashboard/layout.test.tsx "app/gallery/[slug]/page.test.tsx"`` → **3 files / 34 passed**. Run verbatim, that command
gives **3 files / 25 passed (25)**. The count 25 is right for the three files it names (10 + 4 + 11
tests, counted in source and confirmed by the runner).

The number **34 is reachable — from a different command**: swapping `app/gallery/[slug]/page.test.tsx`
for `app/gallery/page.test.tsx` gives exactly `1 failed | 2 passed`, **"34 passed (35)"**. 34 + the
one failure = 35, and 35 = 10 (rail) + 4 (layout) + 21 (gallery page). So the builder ran both
commands and cited the second one's total under the first one's command line.

**Impact:** the substantive claim ("tests green") survives — 25/25 green on the three modified files,
and the 34-test reading includes `app/gallery/page.test.tsx`, which is red only on the peer's fork
copy (§4). **Impact on trust:** this is the LESSONS §1 "act on a number without validating the
instrument" shape — a number whose label points at a different measurement. Cheap to correct; the
orchestrator should not carry "34" forward as the evidence for this task's focused gate.

### Finding 2 — the residue sweep has a hole exactly one member wide (guard completeness)

The new sweep in `components/ui/dashboard-rail.test.tsx:79-102` pins 10 English strings. At HEAD the
rail rendered **11**. The missing one is **`Logging out…`** — the in-flight logout label, live at
HEAD source line 95: `{loggingOut ? 'Logging out…' : 'Log out'}`.

Checked three ways, without editing:

- `grep "Logging out" components/ui/dashboard-rail.test.tsx` → **0** (not in `ENGLISH_RESIDUE`).
- `grep -rn "yapılıyor\|Logging out" app components --include=*.test.tsx --include=*.test.ts` →
  **no test anywhere pins that string**, in either language. The rail's own repro tests select the
  button with `name: /çıkış yap/i`, which matches the *idle* branch only in practice and never
  asserts the in-flight text.
- The existing `Log out` entry does **not** cover it: `"logging out"` does not contain the substring
  `"log out"` (after `log` comes `g`, not a space). And the sweep reads `nav.textContent` from a
  rail rendered with `loggingOut === false`, so the in-flight branch is not in the observed text at
  all.

**Consequence:** reverting `dashboard-rail.tsx:99` to `'Logging out…'` fails **nothing** — not the
sweep, not the label pins, not the repros. One English rail string can come back silently, and it is
a member of the exact class the sweep was built for. LESSONS §8 applies directly here: *"the costly
defect is usually the entry that isn't there"* — assert the set **and its size**.

I audited the rest of the class and the gap is this one member, not a pattern: all six nav labels,
`Sunucum`, `Yükselt · Yakında`, `title="Yakında"` and the failure sentence
(`Çıkış yapılamadı. Lütfen tekrar dene.`, pinned exactly at `dashboard-rail.test.tsx:201`) are all
pinned. `layout.test.tsx` carries no sweep of its own but pins its labels exactly, which is adequate.

**This does not make the code wrong** — line 99 today reads correctly, and I verified
`Çıkış yapılıyor…` in the served bundle with `Logging out` at 0 (§4). It is the regression net that is
one thread short. Suggested fix is one line in F10's own file: add `'Logging out'` to
`ENGLISH_RESIDUE` and pin the in-flight label by holding a pending logout and asserting the button
text. Note the sweep currently can't see any in-flight state, so the label needs its own assertion
rather than a list entry alone.

### Finding 3 — the `aria-label="Primary"` justification describes a co-render that does not occur today

The report keeps the landmark English and justifies it: translating only the rail "would make two
landmarks ambiguous to a screen-reader user" because `app/pryzm/page.tsx:306` carries a second nav
with the same name. The file citation is correct — `app/pryzm/page.tsx:306` does read
`<nav className={styles.navBar} aria-label="Primary">`.

But the two never ship together. Served and counted:

| Route | `aria-label="Primary"` | rail CSS | pryzm CSS |
| --- | --- | --- | --- |
| `/dashboard` | 1 | 20 | 0 |
| `/gallery` | 1 | 20 | 0 |
| `/pryzm` | 1 | 0 | 1164 |

`/pryzm` has no `layout.tsx` of its own, the root layout renders no rail, and `/pryzm` renders no
rail strings (`My server` 2 — its own copy — `Sunucum` 0). So **no page today presents two `Primary`
landmarks**; the ambiguity is a hypothetical, not a live a11y defect.

**Impact:** the *decision* is still sound and the escalation is exactly right — an a11y landmark name
is not screen copy, and leaving it English costs the user nothing. What is overstated is the reason.
The orchestrator should not read "they co-render" as a present fact and spend a cross-file task on it;
if the owner wants the landmark in Turkish, that is a product-language preference, not a bug fix.

### Note (not a finding) — one Known Limitations entry is already stale

Report item 3 says `app/dashboard/page.tsx:316` still shows `Workspace: My server` above the Turkish
rail. That is no longer true: the current file reads `Çalışma alanı: Sunucum` at line 325, and the
served `/dashboard` shows `Çalışma alanı: Sunucum` ×3 with `Workspace: My server` ×0. A peer wave
landed between the builder's read and this review. Out of date, not wrong when written, and not F10's
to fix.

---

## 4. Real-path verification

**Instrument validated first — and the first instrument I reached for was ambiguous.** The builder
reports a dev server on `localhost:3000`; one is live and answers 200. But `POST /api/auth/dev-login`
redirects to `http://localhost:3119/dashboard` and **nothing listens on 3119** (`netstat` shows only
`127.0.0.1:3000`). A cookie-bound 200 from a server that may not be the one the builder used proves
nothing on its own, so I proved *which tree it serves* before reading anything from it, using a string
only the working tree has: HEAD's `dashboard/page.tsx` says `Workspace: My server`; the working tree
says `Çalışma alanı: Sunucum`. The served `/dashboard` shows `Çalışma alanı: Sunucum` ×3 and
`Workspace: My server` ×0 — **the server serves the current tree, not a stale build.** (LESSONS §1:
*"a server a `kill` missed, still serving the old build"* is the failure this step exists to catch.)

With the instrument valid:

- `curl -b <dev-login cookie> /dashboard` → **200**. Counts in the served HTML: `İçeriğe geç` 1,
  `Sunucum` 2, `Yükselt · Yakında` 2, `Ana sayfa` 2, `Botlar` 4, `Şablonlar` 2, `Etkinlik` 1,
  `Ön kontrol` 3, `Ayarlar` 1, `Çıkış yap` 1 — and **0** for `My server`, `Upgrade · Coming soon`,
  `Log out`, `Logging out`, `Skip to content`.
- `/gallery` → **200** and `/dashboard/bots` → **200**: Turkish present, every English rail string 0
  on both.
- **The `<nav aria-label="Primary">…</nav>` element extracted verbatim from served HTML** carries six
  links in order to `/dashboard`, `/dashboard/bots`, `/gallery`, `/dashboard#week`,
  `/dashboard#preflight`, `/dashboard#workspace`; `aria-current="page"` on exactly one (the active
  one — 1 occurrence on `/dashboard`, 1 on `/gallery`); `Sunucum`; and the honest foot:
  `<button type="button" disabled="" aria-disabled="true" title="Yakında">Yükselt · Yakında</button>`
  followed by a live `<button type="button">Çıkış yap</button>` — the disabled attribute moved with
  the copy exactly as claimed, and only on the button that should have it.
- **Behaviour in the bundle the page actually loads** (`/dashboard`'s
  `[root-of-the-server]__19ex1yb._.js`, fetched, 79,315 bytes): the real handler reads
  `const res = await fetch('/api/auth/logout', { method: 'POST' }); if (!res.ok) throw new Error(\`Logout failed: ${res.status}\`); if (…) window.location.assign('/')` —
  the POST method survives into the browser. The React element reads
  `children: loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'`. No English rail string appears in that
  chunk.

**What this does NOT prove, stated rather than implied:** the click-through itself. I did not click
the logout button in a browser, and neither did the builder (both sessions lacked a browser tool). The
strongest evidence for the flow is the served handler + served attributes above, plus the three
`repro:` unit tests that drive the real handler via `fireEvent.click`, all passing. Per LESSONS §2.4,
*"done" means a human completed the flow in the running app* — that bar is **not** met by this review
or by the builder's. Everything short of it is met, and it is met on the served tree rather than on
disk.

---

## 5. Out-of-scope edit to `apps/web/app/gallery/page.test.tsx` — scope confirmed

F10 edited a file it was not given, and escalated it. The escalation is correct: the rail has three
consumers (`app/dashboard/layout.tsx`, `app/gallery/page.tsx`, `app/gallery/[slug]/page.tsx` — the
report said three and that is what `grep -rln DashboardRail` returns), and the gallery suite pins the
rail's English labels, so "tests green" was unreachable without it.

Scope check by the strongest available evidence — the **complete deletion set** of `git diff` for that
file against HEAD:

```
-    expect(within(nav).getByText('My server')).toBeTruthy();
-      { label: 'Home', href: '/dashboard', current: false },
-      { label: 'Bots', href: '/dashboard/bots', current: false },
-      { label: 'Templates', href: '/gallery', current: true },
-      { label: 'Activity', href: '/dashboard#week', current: false },
-      { label: 'Pre-flight', href: '/dashboard#preflight', current: false },
-      { label: 'Settings', href: '/dashboard#workspace', current: false },
-    expect(within(nav).getByRole('button', { name: 'Upgrade · Coming soon' })).toBeTruthy();
```

**Eight deletions, every one a rail string.** No peer line was removed — the `trial_bot_limit` /
trial-fork tests survive untouched (they appear as insertions in the same diff because they are the
peer's *uncommitted* work, relative to HEAD, not F10's). The block boundaries are as claimed: the
deletions sit at lines 535/540/563, inside `describe('gallery rail')` which begins at 529, and the
relabelled block is self-contained. The comment F10 added there correctly records that the gallery
shell's own `Skip to content` link is out of scope and stays English —
`grep "İçeriğe geç"` in both gallery suites returns nothing, and the served `/gallery` shows
`Skip to content` ×1 / `İçeriğe geç` ×0, which matches the claim exactly.

**Limitation I will not paper over:** because the file's untouched peer content is uncommitted, a
diff against HEAD cannot by itself prove F10 didn't touch the *inserted* peer tests. The
`%TEMP%/f10-good/page.test.tsx` backup has the same md5 as the current file and was written at 01:56,
after the file's 01:45 mtime — so it is a copy of F10's *post-edit* state and cannot serve as
before/after evidence for those lines either. What is proven is the part that matters: **F10 deleted
no peer line and its own edit is confined to the rail block.**

---

## 6. Full-suite red — independently attributed, and none of it is F10's

`npx vitest run` on this tree: **4 failed | 60 passed (64 files); 4 failed | 978 passed (982 tests).**
The tree has moved a long way since the builder's window (its two runs gave 22 then 10 failures); the
report's own warning that no full-suite number describes a *stable* tree is correct and still applies.
What I can confirm is the part that matters — **the failing set is peer-owned**:

| File | Failure | Owner evidence |
| --- | --- | --- |
| `app/gallery/page.test.tsx:422` | `falls back to the raw error code…` — expected `'trial_bot_limit'`, got `'Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi.'` | Peer F15: `apps/web/lib/http/refusal.ts` (untracked, **mtime 02:05 — written during this review**) now resolves the code to a Turkish sentence, invalidating the peer's own test at `:409-423`. That test is **outside** F10's deletion set (proven in §5). |
| `app/privacy/page.test.tsx:104` | `Unable to find role "link" name "Privacy Policy"` — page now shows `İçeriğe geç` | Peer legal/Turkish pass. `grep -c DashboardRail app/privacy/page.tsx` → **0**. |
| `app/dashboard/new/page.test.tsx:490` | `Unable to find text /This reply used 1.1 credits/` | Peer F2/F4 copy. `rail=0` in that page. |
| `app/dashboard/bots/[id]/page.test.tsx:245` (and one more in isolation) | `retired English copy came back: 'Rolled back to v'` | Peer F6 retirements in that page. `rail=0`. |

No failing file imports the rail or the dashboard layout except `app/gallery/page.test.tsx`, whose
failure is in the `gallery page` describe (fork copy) and not in `gallery rail` (which passes: **2
passed / 19 skipped**). The builder's attribution holds, and the drift in the failing *set* between
its window and mine (`app/page.tsx`, `chat-thread.tsx`, `dashboard/page.test.tsx`, the scratch probe
are now green; `bots/[id]` and `gallery` now appear) is consistent with a peer wave mid-landing.

Also confirmed not F10's: the working tree's `package-lock.json` and `.env.example` changes carry
mtimes of **2026-09-20** and **2026-09-21** — days before F10 ran (its files are 01:56–01:57 on
09-24). The builder did not touch a manifest, lockfile or env file, as it claimed.

---

## 7. Guard integrity (LESSONS §1/§8) — audited, not re-run

I cannot break the guards without editing files, and this review is forbidden from editing — so
instead of re-running the builder's four breaks I audited **what the guards cover**, which is the
check that finds the missing entry rather than the present one. Result: the four breaks the builder
reports (English copy back → 3 failures; `disabled` removed → 4; `POST` removed → 1; skip link
reverted → 1) are each plausible against the assertions I read, and the disabled-state and POST pins
are genuinely present (`layout.test.tsx:64-69`, `dashboard-rail.test.tsx:167-190`). The audit's
product is **finding 2** — one live HEAD string the set omits, with no test anywhere covering it.

---

## 8. What the orchestrator should carry forward

1. **F10's Turkish rail copy is live and correct** on `/dashboard`, `/gallery` and `/dashboard/bots` —
   verified in served HTML and the served bundle, with hrefs, the active rule, the disabled Upgrade
   and the logout POST all byte-identical to HEAD (`diff` of href lines and the active-rule block
   against HEAD → identical).
2. **Fix finding 2 before the wave closes** — one line in F10's own test file; the rail's regression
   net is missing the in-flight label, and this is the class the net exists to catch.
3. **Correct the 34 → 25 in the F10 report** (or cite the command that yields 34), so the wave's
   closeout doesn't inherit a number whose instrument doesn't match it.
4. **Finding 3 needs no code:** keep the English landmark, but do not treat the two `Primary`
   landmarks as co-rendering today — they don't.
5. **`aria-label="Primary"` remains a product-language question for the founder**, exactly as F10
   escalated it; it is not a defect and does not block.

## Files read (no file written or modified by this review)

- `apps/web/components/ui/dashboard-rail.tsx`, `apps/web/app/dashboard/layout.tsx`
- `apps/web/components/ui/dashboard-rail.test.tsx`, `apps/web/app/dashboard/layout.test.tsx`
- `apps/web/app/gallery/page.test.tsx`, `apps/web/app/gallery/page.tsx`, `apps/web/app/gallery/[slug]/page.tsx`, `apps/web/app/gallery/[slug]/page.test.tsx`
- `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/page.test.tsx`, `apps/web/app/pryzm/page.tsx`
- `apps/web/lib/http/refusal.ts` (peer, untracked), `apps/web/package.json`, root `package.json`
- Served over HTTP from `127.0.0.1:3000`: `/dashboard`, `/gallery`, `/dashboard/bots`, `/pryzm`, and
  the chunk `/_next/static/chunks/%5Broot-of-the-server%5D__19ex1yb._.js`
- `%TEMP%/f10-good/` (the builder's outside-repo backups — all four present, hashes match)
