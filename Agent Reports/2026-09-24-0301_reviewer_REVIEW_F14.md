# Task Report: reviewer-REVIEW-F14

Timestamp: 2026-09-24-0301
Agent id: reviewer
Task type: REVIEW
Component: F14-layout-meta

## Status

PASS — with one factual correction (diffstat), one escalation the builder left open that I recommend
resolving as an explicit accepted gap, and one dismissal of the builder's bonus font finding as an
artifact of a mis-specified measurement instrument.

Reviewed artifact: `apps/web/app/layout.tsx`
`md5 1a4ec864dac49705620538a491526142` · `git hash-object 2ddfc20a28acdc5500b4f56cfe297b757577eaa8`
· HEAD `71767a7d3f5036b66a671d11d7afe85c15186c5f` — all three re-derived by me and identical to the
builder's report.

Independent toolchain detected from `apps/web/package.json` (not assumed): npm workspaces, Next
16.3.4, React 19.2.8, TypeScript 5.9.3, ESLint 9.39.5, Vitest 5.0.0, prettier 3.9.6,
`typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`.

## Files Touched

- CREATED: `Agent Reports/2026-09-24-0301_reviewer_REVIEW_F14.md` (this report)

No source file was edited, and no git command that restores from HEAD was run (`git show`, `git
cat-file`, `git hash-object`, `git diff` only). The reviewed file's md5 was verified unchanged
before and after every experiment below.

## Dependencies Added

None.

## Method note — the tree is being written by peers while this review runs

`git status --short -- apps/web` shows ~40 modified files; a full play-through of the suite spawns 20+
live `vitest` processes that are not mine (peer agents). Every whole-suite number below is therefore
a moving-target reading and is attributed by **file**, never by count alone.

## Acceptance criteria — independent verification

### AC1 — Turkish title/description, no showcase string: PASS

Live-served (`curl http://127.0.0.1:3000/...`, dev server `127.0.0.1:3000`, PID 10836,
`next dev` from this repo root):

| route | status | `<html lang>` | `<title>` |
|---|---|---|---|
| `/gallery` | 200 | `tr` | `Corvus — Sade Dille Discord Botu Kur` |
| `/privacy` | 200 | `tr` | `Privacy Policy - Corvus` (own) |
| `/terms` | 200 | `tr` | `Terms of Service - Corvus` (own) |
| `/pryzm` | 200 | `tr` | `Pryzm \| Background & Visual Studio for Designers` (own) |
| `/auth/error` | 200 | `tr` | `Sign-in problem - Corvus` (own) |

`/dashboard` and `/dashboard/new` are 307 → `/api/auth/login` → Discord OAuth for an
unauthenticated fetch, so I could not re-confirm those two routes the builder reported as 200 (its
run evidently carried a session cookie). `/gallery` and `/` are the unauthenticated routes that
actually render root metadata — live evidence above. The new description appears exactly on `/gallery`;
the four routes with their own `export const metadata` correctly override it (grep inventory of
`export const metadata` under `app/`: `auth/error`, `demo/stats-bento`, `layout`, `page`, `privacy`,
`pryzm`, `terms`; none under `app/dashboard`).

Residue grep, whole repo, excluding `node_modules`/`.next`/`.git`: `UI primitives showcase` and
`Mock-data showcase` now appear **only inside the builder's own report**. Zero source hits.

Browser-confirmed (Playwright, `/gallery`): `document.documentElement.lang === 'tr'`, `document.title`
= the new Turkish title, `meta[name="description"]` = the new Turkish sentence character-for-character.

### AC2 — `lang="tr"`: PASS (truthful on the Turkish routes, false on four English ones — escalated)

Live browser reads `tr`. Repo has exactly two `lang=` declarations: `app/layout.tsx:19` and
`app/api/checkout/success/route.ts:169` (`lang="en"`, its own standalone HTML document — unaffected
and correctly out of scope).

Measured content language on the four routes the root layout also wraps but which are still English:
visible-text Turkish-marker hits 0/532 (`/privacy`), 0/504 (`/terms`), 0/765 (`/pryzm`), 0/23
(`/auth/error`). The builder's Open Question #1 is factually correct.

### AC3 — react-grab / unpkg script removed: PASS

`unpkg` / `react-grab` absent from served HTML on all six routes I fetched. Live browser on
`/gallery`: `[...document.querySelectorAll('script[src]')]` filtered to `^https?:|\/\/` → `[]`;
`/react-grab|unpkg/i` against `documentElement.outerHTML` → `false`; console 6 messages, 0 errors, 0
warnings.

Residue, whole repo, excluding `node_modules`/`.next`/`.git`:
- `apps/web/package.json:47` `"react-grab": "^0.2.0"` (devDependency — now dead weight, correctly
  left to the orchestrator's manifest step; builder disclosed it as Known Limitation #3)
- `package-lock.json` (same dependency)
- `apps/web/app/pryzm/page.test.tsx:360` — this is an **absence assertion**, not residue
- `Docs/PLAN.md:130` — a *historical done-log* line ("React Grab init DONE 2026-09-19 … `layout.tsx`
  dev-gated Script + `react-grab ^0.2.0` + lockfile"). It is not a current-state claim, so I am not
  calling it stale, but the wave's closeout may want to note that F14 removed the Script half it
  records as present.
- `.playwright-mcp/console-*.log` — old MCP capture logs, generated artifacts, not source.

### AC4 — typecheck + lint clean, layout tests green: PASS

| gate | command | exit | result |
|---|---|---|---|
| web typecheck | `npx tsc --noEmit` (cwd `apps/web`) | **0** | clean, zero output |
| all-workspace typecheck | `npm run typecheck` (repo root) | **0** | gateway, testbot, web, ai, spec all present, all pass |
| lint | `npm run lint` → `eslint . --max-warnings 0` (repo root) | **0** | clean |
| format (changed file) | `npx prettier --check --ignore-unknown app/layout.tsx` | **0** | "All matched files use Prettier code style" |
| focused layout test | `npx vitest run app/dashboard/layout.test.tsx` | **0** | 4 passed / 4 |
| **full web suite** | `npx vitest run` (cwd `apps/web`) | **1** | **Test Files 6 failed \| 59 passed (65) · Tests 14 failed \| 967 passed (981)** |

**The full suite is red, and I confirm none of the 14 is F14's.** Evidence, in the order I
established it:

1. **No test imports the root layout.** Grep across all `apps/web` `*.ts(x)` for
   `from '…app/layout'` → 0 hits. `RootLayout` appears in exactly one file repo-wide:
   `app/layout.tsx:17`. `app/dashboard/layout.test.tsx` imports the *dashboard* layout, which F14 did
   not touch. Grep for `RootLayout|documentElement|app/layout|lang=` across every `*.test.ts(x)` → 0
   hits. The builder's claim holds, and it is the structural reason no re-run can converge.
2. **No root-layout-side error exists to fail.** `tsc` is now fully clean at both scopes, and
   `eslint . --max-warnings 0` is clean. The builder's `tsc` error (`scratch-probe2.test.ts`) and its
   `f16-fp-probe.test.ts` sibling have both been deleted or renamed by peers since its run — the tree
   moved under it, which corroborates its concurrency account rather than contradicting it.
3. **Every failing file is a peer-owned surface, and the failures are peer-surface defects.**
   Failing file set: `app/dashboard/bots/[id]/page.test.tsx` (8), `app/dashboard/page.test.tsx` (3),
   `app/dashboard/new/page.test.tsx` (1), `app/gallery/page.test.tsx` (1),
   `app/privacy/page.test.tsx` (1), plus one suite-level loader failure
   `lib/demo/f16-fp2.test.ts` (0 tests, `Cannot find module '/@id/…/f16-fp2.test.ts'` — a peer's
   in-flight file). Two I read to the assertion and both are peer copy/test drift on live surfaces,
   not root-layout effects:
   - `app/gallery/page.test.tsx:432` expects the alert to contain `trial_bot_limit`; actual rendered
     text is `Ücretsiz 3 günlük deneme — 1 bot, 100…` (peers F7/limit-message copy).
   - `app/privacy/page.test.tsx:104` looks up link role name **`Privacy Policy`**;
     `app/page.tsx:941-945` now renders `Gizlilik Politikası` / `Kullanım Şartları`. A peer renamed
     the footer labels and did not update this test. (Both reproduce in isolation — I re-ran those
     two files alone and got the same 2 failures.)
   - `lib/demo/brain.test.ts` (peer, not failing) now holds `TR_PRICING_REPLY` asserting
     `kart gerekmez` — independent corroboration that the trial/copy wave is mid-flight.
   The remaining ones sit in `lib/bots.ts` trial copy (D-145, committed at HEAD) and the
   bots/`chat-thread` surfaces; all are peer files, none imports the layout.
4. **Attribution is structural, not statistical.** Because (1) is a complete enumeration of
   consumers, no test outcome can depend on this file. A/B swap confirmation is therefore
   unnecessary; the builder's A/B (14 vs 14, symmetric diff, tree-hash movement) is *consistent* and
   I am not disputing it — I am recording that the decisive evidence is the enumeration.

## Guard non-vacuity — reproduced with an independent guard, then with the builder's own

I wrote my own 19-check guard (outside the repo, `%TEMP%\f14_review\guard\guard.mjs`) asserting both
absence and presence sets, then broke each criterion on a scratch copy:

| file | result |
|---|---|
| shipped `app/layout.tsx` | **19/19 pass**, exit 0 |
| mutant 1: `next/script` import + unpkg `<Script>` + manual `<head>` restored | **5 fail**: `no-unpkg`, `no-react-grab`, `no-next-script-import`, `no-Script-tag`, `no-manual-head-block` |
| mutant 2: `lang="tr"` → `lang="en"` | **2 fail**: `no-lang-en`, `lang-tr` |
| mutant 3: showcase title + description restored | **7 fail**: `no-primitives-showcase-title`, `no-mockdata-desc`, `title-turkish-exact`, `title-has-turkish-chars`, `desc-corvus`, `desc-no-code-claim`, `desc-trial-no-card` |

I then ran the **builder's own** guard, which survives on disk at
`C:\Users\xr3less\AppData\Local\Temp\f14guard.mjs` (their report says it was written to `/tmp/`;
that path resolves to `C:\tmp\` which does not exist — in this Git Bash, `/tmp` is
`C:\Users\xr3less\AppData\Local\Temp\`. The artifact is real; only the path string in the report is
misleading): shipped file **14/14 PASS, exit 0**; mutant 1 **3 FAILED**; mutant 2 **2 FAILED**;
mutant 3 **5 FAILED** — exactly the counts the builder reported. Its break-the-guard table
reproduces.

Their A/B backups also survive: `%TEMP%\f14-backup\layout.HEAD.tsx` (md5 `f7876e29…`, matching
`git cat-file blob HEAD:… | md5sum`) and `layout.F14.verify.tsx` (md5 `1a4ec864…`, byte-identical to
the shipped file by `cmp`). All of the numbers in their report that I could re-derive are exact.

## Trust artifacts, not summaries — verified on disk

- F14 report exists: `Agent Reports/2026-09-24-0301_F14_MODIFY_layout-meta.md`, 19,128 bytes, 306 lines.
- The claimed diff is real: `git diff HEAD -- apps/web/app/layout.tsx` matches their inline diff
  line for line; `git cat-file -s HEAD:…` = 903 bytes → `wc -c` = 754 bytes (their "903 → 754" is
  exact); `git cat-file blob HEAD:… | md5sum` = `f7876e2996860d6964c52573a7e8663e` (their claimed
  before-md5 is exact).
- **One correction:** their report says "+4 / −16 lines". `git diff --numstat` says **4 / 13** (17
  changed lines; 32 → 23 file lines). The four added lines and the net effect are right; "−16"
  overcounts. The reviewer's `git diff --stat` confirms `1 file changed, 4 insertions(+), 13
  deletions(-)`.

## Escalations

### E1 — `lang="tr"` is false on four still-English routes (builder's Open Question #1)

Confirmed and quantified above. My reading of the three options, recorded for the orchestrator:

- **A — finish the wave, keep `lang="tr"`.** The four routes are copy, not mechanism. Cost of being
  wrong in the meantime is an a11y/translation-prompting mismatch on four routes, with no reader-visible
  change.
- **B — per-route `lang`.** Cannot be done from `layout.tsx` (layouts do not re-render on
  navigation); it needs a route-group layout or a client component writing
  `document.documentElement.lang`. It is a mechanism the wave's own completion deletes. I would not
  add it now.
- **C — revert to `lang="en"`.** Regresses `/`, `/dashboard`, `/dashboard/new`, `/gallery`, which are
  the routes a Turkish reader is onboarded through.

**I recommend A, with one addition: it must be an explicitly accepted gap with an owner and a
closeout check, not a silent one.** "The wave will finish" is not a trigger a future reader can
verify against. The closeout item should be: *at wave close, no route under `app/` renders English
body text while `lang="tr"` is in force* — assertable with the token measurement above.

### E2 — nothing pins the metadata or the language attribute (builder's Open Question #2)

Confirmed: 0 tests reference `RootLayout`, `documentElement`, `app/layout` or `lang=`. The stale
showcase title shipped unguarded, and the fix is equally unguarded — the same defect class has a
second live instance after this change, not zero. The builder correctly refused to create
`app/layout.test.tsx` (new file, outside its single-file scope) and recommend the orchestrator spawn
one. I concur, and would widen it slightly: the same test file is the natural home for the
`lang="tr"`-vs-English-routes assertion if E1 is resolved as an accepted gap.

### E3 — the builder's "font subset" finding: I could not reproduce a defect, and the instrument that produced it is mis-specified

The builder raises as a class that `subsets: ['latin']` (this file, `app/dashboard/layout.tsx:8`,
`components/ui/dashboard-rail.tsx:16`) does not contain `ş` (U+015F) or `ğ` (U+011F). Split verdict:

- **The static half is true.** In the served CSS bundle, `@font-face` #1 (`Public Sans`, src
  `fc2699ecc8323b38-…woff2`) has unicode-range `U+100-2BA, …` → covers U+015F and U+011F. Face #0 and
  #2 do not. Next emits and serves the extra face; the browser fetched it on page load (network log:
  `200 …/fc2699ecc8323b38-s.1gwygi6ipeo67.woff2`). So Turkish is *served* by a real Public Sans face.
- **The "a different face is genuinely being selected" measurement does not support what it is used
  for.** `document.fonts.check('100px "Public Sans"', 'ş')` returns **false** in this browser even for
  plain `s`, and canvas `measureText` for `ş`/`ğ` returns byte-identical widths under
  `"Public Sans"` and `Times New Roman` (38.92 / 38.92 and 50 / 50) while `sans-serif` differs
  (50 / 55.62) — i.e. the canvas path is not resolving the loaded webfont at all. A width comparison
  built on that path cannot distinguish "different face" from "no face".
- **The honest instrument agrees with the builder's *conclusion*.** CDP
  `CSS.getPlatformFontsForNode` on a probe `<span>` styled `font-family:"Public Sans"` reports
  `Public Sans Thin (custom) ×1` for each of `ş`, `ğ`, `İ`, `ı`, `ç`, `ö`, `S` — custom webfont, not a
  system fallback. Combined with the served `unicode-range`, the rendered conclusion stands: Turkish
  renders in Public Sans on the running app.

So the *recommendation* to widen the subsets is a legitimate, low-priority question — the current
setup relies on a second face that happens to be emitted and fetched rather than preloaded — but the
"there is a latent bug here" framing is not supported, and three of the five call sites
(`app/page.tsx` ×2) belong to a page that does not even apply Public Sans (`jakarta` /
`mono` classes; `app/layout.tsx`'s `publicSans.className` is overridden there). File it as a
font-loading policy question for the orchestrator, not as a defect in this task.

### E4 — "test before going live" is verifiable from code, not from the served page

The new description claims "taslağını gör ve canlıya almadan önce test et". I could not exercise that
claim in the browser: `/dashboard` and `/dashboard/new` 307 an unauthenticated fetch to Discord OAuth
(no test account available to this reviewer). Corroboration from code only: `app/api/preflight/route.ts`
and `app/api/preflight/start/route.ts` exist with tests, and `Test modu` / `Ön kontrol` surfaces are
present in `app/dashboard/bots/[id]/page.tsx`. Treat the metadata clause as plausible-and-consistent,
not as independently demonstrated; the copy claim itself is not F14's to prove out (LESSONS §2.4's
"the flow completed" bar applies to the feature, not to a metadata string), and the same claim is
already live in the app's own Turkish copy (`app/page.tsx:10`).

## Public Interface Exposed (unchanged by review)

- `export const metadata: Metadata` — same name/type, new values (title, description).
- `export default function RootLayout({ children }: { children: React.ReactNode })` — signature
  unchanged; root `<html>` keeps `className={publicSans.variable}`, `<body>` keeps
  `className={publicSans.className}`.
- `next/script` no longer imported here; no file imported `Script` from this module.
- Server-rendered `<head>` still carries `charSet="utf-8"` and `viewport`; `nav`, `main` and the
  stylesheet links next to where the manual `<head>` sat are untouched and still emitted (`<head>`
  present, 17 `<script>` tags, 1 preload, on `/gallery`). No layout shift introduced.

## Known Limitations of this review

1. `/dashboard`, `/dashboard/new` and every authenticated route could not be re-verified endpoint-wise
   (307 → OAuth for an unauthenticated client). Their metadata inheritance is argued from the absence
   of `metadata` exports under `app/dashboard` plus the unchanged root export, not from a live fetch.
2. The suite attribution rests on a complete consumer enumeration (no test imports the file) plus
   per-assertion reading of the failures I could isolate. I did not run a HEAD-vs-F14 A/B swap; I
   judged it unnecessary given the enumeration, and the tree is moving too fast for a swap to be
   attributable anyway (peer writes landed between my own commands, e.g. the builder's named
   `scratch-probe2.test.ts` no longer exists).
3. Nothing was re-deployed, migrated, committed or pushed; no secret was read or rotated. The dev
   server on `127.0.0.1:3000` was read-only from my side.
