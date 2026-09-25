# Task Report: F14-layout-meta

Timestamp: 2026-09-24-0301 (filename per task text)
Agent id: F14
Task type: MODIFY

## Status

SUCCESS — all four acceptance criteria met and verified on the running app. One judgment call
escalated (see Open Questions #1) and one class of pre-existing gap recorded (#2). Nothing outside
`apps/web/app/layout.tsx` was edited.

## Files Touched

- MODIFIED: `apps/web/app/layout.tsx` (the only in-scope file; 903 → 754 bytes)
- CREATED: `Agent Reports/2026-09-24-0301_F14_MODIFY_layout-meta.md` (this report)

Nothing else. No manifest, no lockfile, no install, no git restore/commit/push, no deploy/migrate/
secrets. `react-grab` stays declared in `apps/web/package.json` devDependencies and is still
installed under `node_modules` — only the dev-gated CDN `<Script>` that loaded it was removed. (See
Known Limitations #3 for why the dependency declaration was left alone.)

## Dependencies Added

None.

## Assumptions Made

1. **The Turkish title names the product and the job, not a slogan.** Chosen wording is
   `Corvus — Sade Dille Discord Botu Kur`. It matches the product's own landed Turkish on `/`
   (`Corvus - Discord botunu sade sözlerle kur`, `app/page.tsx:8`) and the locked Turkish hero
   (`Botun bugün ne yapacak?`, `app/dashboard/new/page.tsx:463`) rather than inventing a new claim.
2. **The description carries only claims the product already ships.** Each clause maps to landed
   Turkish copy: "kod yazmadan bot kurma aracı" (no-code builder), "sade bir dille anlat" (plain
   words), "taslağını gör" (draft), "canlıya almadan önce test et" (test before going live),
   "Ücretsiz 3 günlük deneme — kart gerekmez" (the enforced trial, D-145 / `TRIAL_DEAL`,
   `lib/bots.ts:50`). No price, no "live", no invented capability. This is the KI-030 honesty rule
   applied at the metadata layer.
3. **`lang="tr"` is the code-level half of a change the wave is already making.** Peers in this same
   wave have already turned `/`, `/dashboard`, `/dashboard/new` Turkish (verified live, below). The
   root layout is the single place that declares document language, so the attribute had to move
   with the copy.
4. **The `lang="tr"` claim is scoped to the routes that are actually Turkish, and that scope is not
   yet complete** — recorded as Open Question #1 rather than silently accepted. Three routes the
   root layout also wraps are still English (measured, below).

## Open Questions for Orchestrator

1. **`lang="tr"` is currently truthful for most routes but false for privacy / terms / pryzm /
   auth-error.** The root layout declares one language for every route it wraps, and this wave has
   not turned all of them yet. Measured on the running app (script stripped, visible text only):

   | route | TR tokens | EN tokens | verdict |
   |---|---|---|---|
   | `/` | 43 | 1 | TR |
   | `/dashboard` | 10 | 1 | TR |
   | `/dashboard/new` | 7 | 0 | TR |
   | `/pick` | 1 | 0 | TR |
   | `/gallery` | 2 | 2 | tie |
   | `/dashboard/bots` | 2 | 5 | EN |
   | `/demo` | 1 | 2 | EN |
   | `/interview` | 1 | 8 | EN |
   | `/privacy` | 0 | 99 | EN |
   | `/terms` | 0 | 72 | EN |
   | `/pryzm` | 0 | 79 | EN |
   | `/auth/error` | 0 | 2 | EN |

   Only the language *attribute* is wrong on the English routes, not the copy — no reader sees a
   changed word, and screen readers still read English text with an English voice, so the practical
   harm today is limited to those routes' a11y announcement and any translation prompting.

   The three ways out, for the orchestrator (I did not pick one):
   - **A (recommended): finish the wave, keep `lang="tr"`.** The routes above are already in scope
     for the remaining F-tasks; when they land, the single root-layout attribute becomes true
     everywhere and needs no further edit. Cheapest, and matches the direction already committed.
   - **B: per-route `lang` while the wave is in flight.** A route group or a small client component
     that sets `document.documentElement.lang` per segment. More correct this hour, but adds a
     mechanism that the wave's own completion would then delete — and it cannot be done from
     `layout.tsx` alone (layouts do not re-render on navigation).
   - **C: revert to `lang="en"` until the wave finishes.** Truthful today for the English routes,
     false for the three Turkish ones, and it would have to be re-edited at closeout.

   Recommendation is A, on the grounds that this is a mid-wave state with a known end, and that
   `lang="tr"` on the Turkish routes is the higher-value half (those are the routes a Turkish
   reader is being onboarded through). Reverting now would ship a regression on the routes that
   just landed.

2. **No test pins any of this, before or after.** `grep` across `apps/web` for
   `UI primitives showcase`, `Mock-data showcase`, `react-grab`, `lang="en"` in test files returns
   zero hits, and no test file imports `app/layout.tsx` at all (only `app/dashboard/layout.test.tsx`
   exists, which is the *dashboard* layout). So the stale title shipped unnoticed because nothing
   guarded it, and my fix is likewise unguarded. The four acceptance criteria are all cheaply
   assertable from a static read of the file; a small `app/layout.test.tsx` would make this class of
   regression impossible to re-ship. **I did not create it** — it is a new file and outside my
   declared scope. Recommend the orchestrator spawn one.

## Public Interface Exposed

- `export const metadata: Metadata` — same name and type, new values. Title and description are now
  Turkish product copy.
- `export default function RootLayout({ children }: { children: React.ReactNode })` — **signature
  byte-identical.** Root `<html>` keeps `className={publicSans.variable}`; `<body>` keeps
  `className={publicSans.className}`. The manual `<head>` block is gone entirely.
- `next/script` is no longer imported by this file. No other file in the repo imported `Script` from
  here.
- No new exports; nothing removed that anything consumed.

## Known Limitations

1. **Does not translate the app.** This is the document-level metadata and language attribute only.
   Route copy is peer F-tasks' work.
2. **Does not add a `metadataBase` / OpenGraph / robots block.** `layout.tsx` still has no
   `og:title` (verified absent live, below) and no canonical base. Out of this task's four
   criteria; noting so it is not mistaken for covered.
3. **Does not touch the `react-grab` dependency.** `apps/web/package.json:47` still declares
   `react-grab ^0.2.0` in devDependencies. Removing the script makes the package dead weight, but
   manifests are explicitly out of scope (HARD RULES) and `apps/web/package.json` is outside the
   single-file scope. Flagging for the orchestrator; the removal is a one-line manifest edit plus an
   install, which belongs to the central manifest step.
4. **Does not remove the dev-only `next dev`-managed block in `apps/web/AGENTS.md`** — unrelated
   file, and the block re-adds itself.

## Verification

### Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | title/description describe Corvus in Turkish, no "UI primitives showcase" | **PASS** | live-served `<title>` and `<meta name="description">` on 4 routes (below); guard check `no-primitives-showcase-title`, `no-mockdata-desc`, `title-turkish`, `desc-no-card-need` all pass and were each watched to fail |
| 2 | `lang='tr'` | **PASS** | `<html lang="tr">` live on 4 routes; browser `document.documentElement.lang === 'tr'`; guard `lang-tr` failed on revert to `en` |
| 3 | react-grab unpkg script removed | **PASS** | `unpkg` / `react-grab` absent from served HTML on 4 routes and from the DOM (0 external scripts); three guards failed when the script was restored |
| 4 | typecheck + lint clean, layout tests green | **PASS (with a pre-existing peer error named)** | `eslint --max-warnings 0` exit 0; `prettier --check` exit 0; `tsc` reports **zero** errors in this file — the 1 remaining error is another agent's untracked `scratch-probe2.test.ts`, proved pre-existing below; `app/dashboard/layout.test.tsx` 4/4 green and F14 changed no test outcome anywhere (full-suite A/B below) |

### Toolchain detected, not assumed

npm workspaces monorepo. From `apps/web/package.json`: `typecheck: tsc --noEmit`,
`lint: eslint .`, `test: vitest run`. Vitest 5.0.0, ESLint 9.39.5, TypeScript 5.9.3, Next 16.3.4,
React 19.2.8, Node v24.15.0. `apps/web/eslint.config.mjs` is a bare
`tseslint.config({ignores}, ...tseslint.configs.recommended)` — no `next` plugin, so the removed
`next/script` import is not checked by any lint rule; correctness here rests on `tsc` + the guard.

### Layer 1 — the four gates

| Gate | Command (cwd `apps/web`) | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 2 errors, **0 in `app/layout.tsx`**, both in peer `scratch-probe2.test.ts` (see attribution) |
| Lint | `npx eslint app/layout.tsx --max-warnings 0` | **exit 0** |
| Format | `npx prettier --check app/layout.tsx` | **exit 0** — "All matched files use Prettier code style" |
| Layout tests | `npx vitest run app/dashboard/layout.test.tsx` | **4 passed / 4** |

#### The tsc error is a peer's, proved by swap rather than asserted

The tree is **being edited concurrently by peer agents on this same wave** (see the concurrency
note below), so a single tsc reading is not attributable. Method: I copied the shipped file and the
pristine `HEAD` version to `%TEMP%\f14-backup\` (outside the repo — no git command ever touched the
tree), then ran `tsc` with each in place.

- With `HEAD`'s layout on disk: at one reading `tsc` exited 0; at a later reading the same swap
  produced 2 errors in `scratch-probe2.test.ts`, a file that did not exist when I started.
- The error set names **only** `scratch-probe2.test.ts`, never `app/layout.tsx`.
- `grep -c "app/layout.tsx"` against the tsc output: **0**.

So the 1 surviving error is an untracked scratch file created at 01:48 by a peer probe, and it is
not mine to fix or delete (out of scope; and deleting another agent's file mid-wave is exactly the
destructive action the HARD RULES forbid). `git show HEAD` confirms `layout.tsx` at HEAD imports
`Script` — the removed import cannot be the cause since it was present before my edit and the error
appeared after, in a different file.

### Layer 2 — the guards are non-vacuous (LESSONS §8: break it and watch it fail)

A 14-check guard script was written to `/tmp/f14guard.mjs` and run against the shipped file:
**14/14 PASS, exit 0**. It asserts both the absence set (no `unpkg.com`, no `next/script`, no
`<Script`, no `lang="en"`, no `UI primitives showcase`, no `Mock-data showcase`) and the presence
set (the exact Turkish title, the Turkish description, `kart gerekmez`, `export const metadata`,
`export default function RootLayout`, a well-formed `<html>…<body>…</body></html>`,
`publicSans.className`).

Then each defect class was reintroduced into a scratch copy and the guard re-run — **all three
caught**:

| Break applied | Checks failed | Which |
|---|---|---|
| react-grab unpkg `<Script>` + `next/script` import restored | **3** | `no-unpkg-script`, `no-next-script-import`, `no-Script-tag` |
| `lang="tr"` → `lang="en"` | **2** | `lang-tr`, `lang-tr-not-en` |
| Original showcase title + description restored | **5** | `no-primitives-showcase-title`, `no-mockdata-desc`, `title-turkish`, `desc-mentions-corvus`, `desc-no-card-need` |

After each break the scratch copy was deleted and the shipped file re-verified **14/14 PASS** with
`md5 = 1a4ec864dac49705620538a491526142` unchanged. A presence-only or absence-only guard would
have passed the third break; the pair is what catches all three.

### Layer 3 — attribution: a full-suite A/B on an actively-moving tree

The web suite currently shows failures. **None is attributable to F14.** Method: `HEAD`'s layout and
the F14 layout were each swapped in (from `%TEMP%\f14-backup\`, no git), the full suite run, and the
failure sets diffed. A `find | md5sum | md5sum` tree hash was taken before and after to detect
concurrent peer writes.

- Tree hash: `6f91617ad5d6` → `96d9c7e65b02` — **the tree changed during the A/B**, confirming peers
  are writing while tests run.
- `HEAD` failures: **14** · F14 failures: **14**
- Symmetric diff: one entry off each side, both in `app/dashboard/bots/page.test.tsx` — a file
  rewritten by a peer at 01:47:44, mid-run (`shows the logged-out line…401` left, `shows a
  no-match state…Clear search` entered). Same count, different test, different file, zero
  relation to the root layout.

Independent corroboration that the layout cannot be implicated: **no test file in `apps/web` imports
`app/layout.tsx`** (`grep` for `app/layout` / `from './layout'` / `from '../layout'` across all
`*.test.ts(x)` returns only `app/dashboard/layout.test.tsx`, which imports the *dashboard* layout),
and no test references `metadata`, `RootLayout`, or `documentElement`. **`app/dashboard/layout.test.tsx`
was 4/4 green in both arms of the A/B.**

The failures visible today are peer-in-flight work, and one is provably so: the single
`app/dashboard/new/page.test.tsx` failure is the stale-English-cost-string test at `:490`
(`expect(screen.getByText(/This reply used 1.1 credits/))`) against peer F7's already-landed Turkish
cost line in `components/ui/chat-thread.tsx:59` (`Bu yanıt … kredi harcadı · platform kaynaklı
hatalarda tekrar denemek ücretsiz.`). F7's own file comment records the same tension. Not mine, and
not fixable from `layout.tsx`.

### Layer 4 — real path on the running app (LESSONS §2.4)

Instrument validated **before** use (LESSONS §1). The `next dev` server already live on
`127.0.0.1:3000` (PID 10836) was read first and it returned the **old** values — `lang="en"`, title
`Corvus — UI primitives showcase`, description `Mock-data showcase…`, `react-grab in html: true` on
`/dashboard`, `/gallery`, `/`. So the instrument distinguishes before from after rather than
agreeing with anything I had already done. It also proved hot-reload picked up the edit without a
restart, so the served bytes are the file under review.

**After the change**, four routes fetched from the live server:

| route | status | `lang` | title | description | `react-grab` | `unpkg` |
|---|---|---|---|---|---|---|
| `/dashboard` | 200 | `tr` | `Corvus — Sade Dille Discord Botu Kur` | Turkish, full sentence | **false** | **false** |
| `/dashboard/new` | 200 | `tr` | same | same | **false** | **false** |
| `/gallery` | 200 | `tr` | same | same | **false** | **false** |
| `/` | 200 | `tr` | `Corvus - Discord botunu sade sözlerle kur` (its own, untouched) | its own, Turkish | **false** | **false** |

**In a real browser** (Playwright, `http://127.0.0.1:3000/dashboard/new`):
- `document.documentElement.lang === 'tr'`; page title is the new Turkish one.
- `meta[name="description"]` carries the new Turkish sentence exactly.
- **0 external scripts** in the DOM (`[...document.querySelectorAll('script[src]')]` filtered to
  `/^https?:|\/\//` returns `[]`) — the unpkg tag is gone from the live DOM, not merely from source.
- **0 console errors**, 0 warnings across the full page load.
- `og:title` is `null` — confirming Known Limitation #2 rather than glossing it.
- Screenshot captured (viewport, `/dashboard/new`): the page renders Turkish end to end —
  `Botun bugün ne yapacak?`, `Şablonlar`, `Ön kontrol`, `Ayarlar`, `İstediğin botu anlat…` — with
  **no tofu boxes**: every Turkish glyph (ş, ğ, İ, ı, ç, ö, ü) renders. This matters because
  `lang="tr"` makes the font stack load-bearing; I checked it rather than assume it.

### One finding from checking the font claim, raised for the class not the instance (LESSONS §2)

Because `lang="tr"` makes glyph coverage a correctness question for this file, I verified it:
**Public Sans is configured `subsets: ['latin']` (`layout.tsx:6`) and the `latin` subset does not
contain `ş` (U+015F) or `ğ` (U+011F)** — I confirmed this three ways: the Google `css2` response's
own unicode ranges, the compiled `@font-face` blocks Next serves, and live browser measurement.
Turkish renders anyway, because `latin-ext` is *also* emitted by Next and the browser falls forward
into it (measured in-browser: Turkish advance width 357.9px vs 328.3px for a latin-only control at
100px — i.e. a different face is genuinely being selected, not synthetic fallback).

Three of the five `next/font/google` call sites in this app declare `subsets: ['latin']` while
rendering Turkish: here, `app/dashboard/layout.tsx:8`, and `components/ui/dashboard-rail.tsx:16`
(the latter two are `Geist`). Today it works by fall-forward through the emitted `latin-ext` face.
**I did not change any of them** — two are outside my single-file scope, and widening a subset is a
font-loading decision, not a metadata edit. Recording it so the orchestrator can decide whether the
reliance on emitted-but-unpreloaded `latin-ext` is intended, or whether those declarations should
say `['latin', 'latin-ext']` and preload what Turkish actually needs. Flagging as a class (all
Turkish-rendering font declarations), not just this instance.

### Concurrency note (why several numbers above are timestamped)

Peer agents were writing `apps/web` throughout this task: `app/dashboard/bots/page.tsx` at 01:47:44,
`app/api/chat/route.ts` at 01:45:37, an untracked `scratch-probe2.test.ts` at 01:48, plus F7's
`chat-thread.tsx` and F4/F8 reports. I therefore treated every whole-suite number as a
moving-target measurement and established attribution by A/B plus import analysis rather than by a
single reading. **No git command that restores from HEAD was run** — `git show HEAD:<path>` (read
to a temp file outside the repo) and `git hash-object` only; backups were file copies under
`%TEMP%\f14-backup\`.

### Exact change (diff against HEAD)

```
-apps/web/app/layout.tsx  index 71767a7..2ddfc20   md5 f7876e29… -> 1a4ec864…
```

```diff
-import Script from 'next/script';
 import { Public_Sans } from 'next/font/google';
@@
-  title: 'Corvus — UI primitives showcase',
-  description: 'Mock-data showcase of the Corvus design system primitives.',
+  title: 'Corvus — Sade Dille Discord Botu Kur',
+  description:
+    'Corvus, Discord toplulukları için kod yazmadan bot kurma aracı: botunu sade bir dille anlat, taslağını gör ve canlıya almadan önce test et. Ücretsiz 3 günlük deneme — kart gerekmez.',
@@
-    <html lang="en" className={publicSans.variable}>
-      <head>
-        {process.env.NODE_ENV === 'development' && (
-          <Script src="//unpkg.com/react-grab/dist/index.global.js" crossOrigin="anonymous" strategy="beforeInteractive" />
-        )}
-      </head>
+    <html lang="tr" className={publicSans.variable}>
       <body className={publicSans.className}>{children}</body>
```

Net: **+4 / −16** lines. Final `md5 1a4ec864dac49705620538a491526142`, `git hash-object`
`2ddfc20a28acdc5500b4f56cfe297b757577eaa8`, HEAD's `71767a7d…` — differs, so the file is genuinely
modified.
