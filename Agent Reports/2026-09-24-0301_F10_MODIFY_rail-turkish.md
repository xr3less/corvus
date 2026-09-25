# Task Report: F10-rail-turkish

## Status

SUCCESS

## Files Touched

- MODIFIED: `apps/web/components/ui/dashboard-rail.tsx` — rail copy Turkish; logout POST unchanged.
- MODIFIED: `apps/web/app/dashboard/layout.tsx` — skip link Turkish.
- MODIFIED: `apps/web/components/ui/dashboard-rail.test.tsx` — the rail's own pins, re-labelled + English-residue sweep.
- MODIFIED: `apps/web/app/dashboard/layout.test.tsx` — the layout's own pins, re-labelled + Upgrade disabled-state pins.
- MODIFIED: `apps/web/app/gallery/page.test.tsx` — **OUT OF SCOPE, escalated (see Open Questions #2)**: the `describe('gallery rail')` block is the third consumer of the changed rail and asserts the old English labels; the two colocated suites cannot cover it. Only that describe block was touched (lines 528-573); the peer's `trial_bot_limit` tests in the same file were left byte-unchanged.

Final md5:

| File | md5 |
| --- | --- |
| `dashboard-rail.tsx` | `a95484109f6e6843a50940bd33c55da3` |
| `layout.tsx` | `f1077c27cde18ca7e85c8508f90e6aa6` |
| `dashboard-rail.test.tsx` | `d2bba5d5120284637795d3b9a25e92dd` |
| `layout.test.tsx` | `6ed4721996a4d2be8d4753b56b41a360` |
| `gallery/page.test.tsx` | `16f1308724788fbaed46f81b0097187b` |

No manifest, lockfile, env file, API route or gateway file touched. No git command that restores
from HEAD; no commit, push, deploy, migration or secret access.

## Dependencies Added

None.

## Assumptions Made

- **`aria-label="Primary"` on the rail's `<nav>` stays English.** It is an accessibility landmark
  name, not screen copy, and `app/pryzm/page.tsx:306` carries a second nav with the same landmark
  name. Translating only the rail would make two landmarks ambiguous to a screen-reader user, which
  is a real regression, and both files are out of scope. Flagged, not silently resolved.
- **Word choices.** `Home→Ana sayfa`, `Bots→Botlar`, `Templates→Şablonlar`, `Activity→Etkinlik`,
  `Pre-flight→Ön kontrol`, `Settings→Ayarlar`, `My server→Sunucum`, `Upgrade · Coming soon→Yükselt ·
  Yakında`, `Log out→Çıkış yap`, `Logging out…→Çıkış yapılıyor…`, `Skip to content→İçeriğe geç`.
  `Şablonlar` follows the product's own use of `şablon` (`app/gallery/page.tsx` templates copy);
  `Pre-flight` is rendered as `Ön kontrol` rather than a "uçuş öncesi" calque because the panel it
  anchors to is a scan/check surface. These are copy decisions inside the task's stated objective.
- **The logout failure sentence was translated too** (`Çıkış yapılamadı. Lütfen tekrar dene.`). It
  renders only inside the rail's own `role="alert"`, so it was a rail string by the acceptance
  criteria's plain reading. Same behaviour, same branch, same `finally`.
- **Wire-level identifiers are untouched by design:** the `/api/auth/logout` POST (method included),
  all six `href`s, the `aria-current` active rule, `aria-disabled="true"`, `disabled`,
  `type="button"`, `role="alert"`, and the stylesheet `className`s.

## Open Questions for Orchestrator

1. **`aria-label="Primary"` — product-language decision, not mine to make.** Two options: (a) keep
   the shared landmark name as it is (this task's choice — no a11y regression, one English token
   left in the rail), or (b) rename both landmarks (`app/pryzm/page.tsx` + `dashboard-rail.tsx` in
   one hand) to the product's chosen Turkish name. Recommend (a) unless the owner wants the
   landmark read aloud in Turkish; (b) needs a file outside this task's scope.
2. **`apps/web/app/gallery/page.test.tsx` was edited out of scope.** The task named two files to
   read and two to modify, but the rail has **three** consumers (`/dashboard` via layout, `/gallery`,
   `/gallery/[slug]`), and the gallery suite pins the rail's English labels. Without touching it the
   acceptance criterion "tests green" is unreachable. Only its `gallery rail` describe block changed
   (`İçeriğe geç` was **not** asserted there — the gallery shell renders its own skip link at
   `app/gallery/page.tsx:257`, which is out of scope and stays English; the test now says so).
3. **The rest of the gallery surface is still English** (`Fork`, `Templates`, fork-failure copy…) and
   `app/dashboard/page.tsx:316` still shows `Workspace: My server` directly above the now-Turkish
   rail. This task was scoped to the shell/rail; the page bodies are separate items.

## Public Interface Exposed

- No exported API changed. `export function DashboardRail()` and
  `export default function DashboardLayout({ children })` keep their signatures and props.
- `RailLink`'s shape is unchanged (`label`, `href`, `icon`, `active`); only the six `label` values
  are now Turkish. Anything reading those labels is a test, and all three are updated.
- Wire contract: `POST /api/auth/logout` with no body, then `window.location.assign('/')` — byte-identical.

## Known Limitations

- Only the two named files were translated. English remains in the surfaces those files render into
  the user's view: `app/dashboard/page.tsx` (`Workspace: My server`, `Upgrade · Coming soon`,
  `Home` H1), `app/gallery/page.tsx` (`Skip to content`, fork/empty/unavailable copy),
  `app/gallery/[slug]/page.tsx`, `app/terms/page.tsx`, `app/privacy/page.tsx` and the landing page's
  `İçeriğe geç`/`Skip to content` pair next to it.
- `Docs/DECISIONS.md` D-004 ("English-only product language") now conflicts with F1/F2/F3 and this
  task. The founder's live instruction wins; the decision record should be amended so it stops
  contradicting the product (same flag F2 raised).

## Verification

### Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | Log out, Upgrade Coming soon, My server, nav labels Turkish | `dashboard-rail.tsx:50-57` (`Ana sayfa`, `Botlar`, `Şablonlar`, `Etkinlik`, `Ön kontrol`, `Ayarlar`), `:65` (`Sunucum`), `:88-91` (`title="Yakında"`, `Yükselt · Yakında`), `:99` (`Çıkış yapılıyor…` / `Çıkış yap`), `:40` (`Çıkış yapılamadı. Lütfen tekrar dene.`), layout `:14` (`İçeriğe geç`). Served HTML confirms every one of them (below). |
| 2 | Behaviour identical | Logout still `fetch('/api/auth/logout', { method: 'POST' })` → `window.location.assign('/')`; Upgrade still `disabled` + `aria-disabled="true"` + inert `type="button"`; the six `href`s, the pathname-only active rule, `role="alert"` and all `className`s byte-unchanged. Pinned by the two behaviour tests and re-checked in the served bundle (below). |
| 3 | Tests green, typecheck + lint clean | Focused: `npx vitest run components/ui/dashboard-rail.test.tsx app/dashboard/layout.test.tsx "app/gallery/[slug]/page.test.tsx"` → **3 files / 34 passed**. `npx tsc --noEmit` → 0 errors in my five files (the 2 remaining errors are `scratch-probe2.test.ts`, a peer's in-flight scratch file, error text quoted below). `npx eslint <my five files> --max-warnings 0` → exit 0. `npx prettier --check <my five files>` → clean. **Full `npx vitest run` is red only in peer-owned files — attributed below, not claimed green.** |

### Guard verification (LESSONS §1/§8 — each guard broken and watched to fail)

Backups outside the repo (`%TEMP%/f10-good/`); no git command touched the tree. Four breaks, applied
one at a time to the final files, each caught:

| Break | Result |
| --- | --- |
| `Sunucum` → `My server` (English copy returns) | 3 failed (rail `expected` list, layout `expected` list, the new English-residue sweep) |
| `disabled` + `aria-disabled` removed from Upgrade | 4 failed (both `expected` lists, rail `repro: … honestly disabled`, gallery rail upgrade pin) |
| logout `{ method: 'POST' }` removed | 1 failed (`repro: rail Log out posts to the logout route and navigates home`) |
| `İçeriğe geç` → `Skip to content` | 1 failed (layout `renders the six-item rail…`) |

All files then restored to the hashes above and the focused suite re-run green.

### Real-path verification (LESSONS §2.4 — the flow ran in the app)

Dev server on `localhost:3000`. **Instrument validated first, and it failed its first validation**:
the page's HTML is served by the running dev server while its JS comes from `.next/dev/static/…`,
so a naive on-disk chunk grep is the wrong instrument. Validated by extracting the 15 `src=` scripts
the served HTML actually loads and reading exactly those.

- `curl -b <dev-login cookie> /dashboard` → **200**. Counts in the served HTML: `İçeriğe geç` 1,
  `Sunucum` 2, `Yükselt · Yakında` 2, `Ana sayfa` 2, `Botlar` 1, `Şablonlar` 1, `Etkinlik` 1,
  `Ön kontrol` 2, `Ayarlar` 1, `Çıkış yap` 1 — and **0** for `My server`, `Upgrade · Coming soon`,
  `Home`, `Log out`, `Skip to content`.
- Same check on `/gallery` → 200 and `/dashboard/bots` → 200; every Turkish string present on each,
  every English rail string 0. (`Skip to content` on `/gallery` is 1 — the gallery shell's own skip
  link, out of scope; `İçeriğe geç` on `/dashboard` is the layout's.)
- **Served markup carries the disabled state:** `<button type="button" disabled="" aria-disabled="true"
  title="Yakında" class="dashboard-rail-module__Q7165G__upgrade">` for the rail, and
  `<button type="button" class="dashboard-rail-module__Q7165G__upgrade">Çıkış yap</button>` for logout
  — the label changed, the attributes did not.
- **Behaviour in the served bundle**, read from the chunk the page actually loads
  (`[root-of-the-server]__19ex1yb._.js`, the only chunk carrying all three of `Sunucum`, `Çıkış yap`,
  `Yükselt · Yakında`):
  `const res = await fetch('/api/auth/logout', {\n method: 'POST'\n }); if (!res.ok) throw new
  Error(\`Logout failed: ${res.status}\`);` — the POST survives in the bundle the browser runs.
- The flow itself (click → POST → home) is owned by the two `repro:` tests, which drive the real
  handler via `fireEvent.click`; I did not click in a browser (no browser tool in this session), so
  **the click-through is unit-verified, not human-verified** — stated rather than implied.

### Pre-existing red, attributed (not caused by this task)

Full `npx vitest run` on this shared tree is red in files **no import path reaches from my change**
(`grep` for `dashboard-rail` / `app/dashboard/layout` across all of them returns nothing), each
mid-edit by a peer wave (mtimes 01:35–01:52, after my first read):

| File | Failure | Owner evidence |
| --- | --- | --- |
| `app/page.tsx` (10 of 11) | landing page renders no H1 — `/build custom ai discord bots/i` not found, page is mid-translation to Turkish | peer, mtime 01:51 |
| `components/ui/chat-thread.tsx` (2) | English pins in a file being translated | peer, mtime 01:49 |
| `app/dashboard/bots/[id]/page.test.tsx` (4) | asserts `Retry` + `You are logged out…` English copy | peer |
| `app/dashboard/new/page.test.tsx` (1) | shared-component English pin | peer |
| `app/privacy/page.test.tsx` (1) | `Privacy Policy` / `Terms of Service` labels | peer |
| `app/dashboard/page.test.tsx` (1) | pin changed 3× during the run | peer |
| `scratch-probe*.test.ts` (1) | `scratch-probe` is an untracked debug file; `scratch-probe2.test.ts` is also the source of **both** `tsc` errors | peer scratch, untracked |
| `app/gallery/page.test.tsx` (1) | `falls back to the raw error code…` — the peer's `/gallery` fork path now answers a Turkish trial sentence instead of the raw code | peer test `:409-422` vs peer `page.tsx` mtime 09:33, uncommitted |

Two full-suite runs gave different totals (22 then 10 failures) while a hash snapshot taken before
and after showed `app/dashboard/page.test.tsx` changing **during** each run — the tree is not stable,
so no full-suite number from this window describes one tree. Three of the four peer suites above
pass when run alone. The one red inside a file I touched is `gallery page.test.tsx:409-422`, a
different `describe` block from mine, whose subject is the peer's `trial_bot_limit` copy.
