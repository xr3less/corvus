# Task Report: F11-dashhome-turkish

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/page.tsx
- MODIFIED: apps/web/app/dashboard/page.test.tsx
- (no other file touched; no file created or deleted)

## Dependencies Added
- None. No manifest edited, no install run. The only new import is the existing
  intra-repo module `@/lib/bots`, already present in this file's import list.

## Assumptions Made
- **The two trial lines are not this page's words.** `TRIAL_DEAL` and
  `TRIAL_EXPIRED_MESSAGE` are defined once in `lib/bots.ts` and shared with the
  API refusal bodies and the bot-detail page. The page imports and prints them
  verbatim; this task therefore changed no trial copy in `page.tsx` — it was
  already correct once the owning module (peer F5) translated them. Recorded in
  the page's header comment so a later reader does not "helpfully" retype it.
- **`TEMPLATES` names stay English.** `Mod Shield` / `Ticket Desk` /
  `Welcome Wagon` byte-match the catalog seed names in
  `apps/gateway/src/db/seed-templates.ts`; the landing showcase and gallery
  detail pages use that one shared name set. Translating them here would make a
  click contradict its destination. Left untouched, deliberately.
- **`BuilderProgress` stays English.** Its labels (`No run started`,
  `Queued`/`Generating`/…, `Build failed`) are rendered by a shared component
  that also serves the bots list page. Translating it is a cross-page wave owned
  by another file — out of scope per the SCOPE GUARD. The test keeps its
  `'No run started'` / `'Generating'` assertions with a comment naming the owner.
- **`aria-label="Kurulum durumu"` (not `Kurulum ilerlemesi`) on the setup
  progressbar.** The Build-progress panel already owns the accessible name
  `Kurulum ilerlemesi`; reusing it would have collided two regions' names. The
  content words are identical (`Kurulum ilerlemesi` heading), so only the
  progressbar's label differs.
- Trial-constant drift in three API routes (`app/api/builder/start/route.ts:42`,
  `app/api/chat/route.ts:88`, `app/api/builder/verdict/route.ts:89` still hold
  the English expired sentence inline) is **pre-existing and owned by peer F5**,
  which reports it as known drift. Not touched.

## Open Questions for Orchestrator
- The `lib/bots.ts` copy changed twice while this task ran (peer F5, mtimes
  01:59:38 → 02:06:18 → 02:13). `TRIAL_DEAL` gained the `AI` qualifier
  (`100 AI kredisi`). This task's test imports the constants rather than pinning
  the strings, so it stayed green across all three revisions by construction —
  no action needed, noted so the orchestrator knows the observed value in the
  verification below is the peer's latest, not a snapshot.

## Public Interface Exposed
- Unchanged. `DashboardPage({ bots?, trialExpired? })` — same props, same
  default export, same Suspense wrapper. No exported name, type, or signature
  changed on either file.

## Known Limitations
- **Copy only.** No behavior, data path, layout, or CSS changed. The full-file
  diff is 51 added / 45 removed lines on `page.tsx`; the only structural token
  anywhere in it is `Number.isFinite(value)`, on a line whose sole change is the
  returned string.
- **`TEMPLATES` and `BuilderProgress` remain English** — both deliberate, both
  explained above, both outside this task's write scope.
- **Real-path verification used the optimistic cookie gate.** `proxy.ts` reads
  cookie *presence* only (`corvus_session`) and the page is a client component,
  so a browser with that cookie set renders the real page. The three API reads
  behind it returned 401 (no real session), which is the documented fail-open
  path: the page rendered its honest settled empty state, never fabricated data.
  A fully authenticated human pass was not possible without credentials, and
  touching secrets is forbidden by this task's rules.

---

## Verification

### 1. Data-fetching region untouched (explicit requirement)
Checked mechanically, not by eye. `:69–181` region (the `searchParams`/`runId`
read, the `?view=bots` redirect effect, `fetchBots`, `/api/credits`,
`/api/session/trial`, `botsLoading`, `creditsSettled`, `trialExpired`) diffs as
**identical** against the pre-change backup; the apparent line-offset was only
the added header comment. Confirmed at whole-file granularity: all 51 added lines
are strings, comments, or the constant indirection, and 0 `useState` /
`useEffect` / `fetch` / `AbortController` / `async` / `await` tokens appear in the
diff.

### 2. Gate results (all on the current merged tree)
| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **clean, exit 0** (0 errors) |
| Lint | `npx eslint <both files> --max-warnings 0` | **clean, exit 0** |
| Format | `npx prettier --check <both files>` | **all files use Prettier style** |
| Focused suite | `npx vitest run app/dashboard/page.test.tsx` | **26 passed (26)** |

Baseline was 25 passed; the task adds 1 test (the end-to-end residue guard) and
retargets the existing 25 to Turkish. **No test was deleted** — verified by
stripping every string literal from both revisions and diffing the remaining
structure: the only differences are additions.

### 3. Break verification — 12 breaks, 12 caught, 0 missed
Each guard was broken and the suite watched to fail. Restored byte-exact between
runs (md5 confirmed after the matrix: `ad39e920b12197396c962574fe20e0bb`).

| # | Broken | Result |
|---|---|---|
| 01 | page title → `Home` | CAUGHT (3 failed) |
| 02 | stat label → `Live bots` | CAUGHT (3 failed) |
| 03 | region → `Overview` | CAUGHT (3 failed) |
| 04 | upgrade copy → `Upgrade · Coming soon` | CAUGHT (4 failed) |
| 05 | empty heading → English | CAUGHT (3 failed) |
| 06 | loading shell → English | CAUGHT (1 failed) |
| 07 | pre-flight line → English | CAUGHT (3 failed) |
| 08 | credits unit `kredi` → `credits` | CAUGHT (1 failed) |
| 09 | workspace line → English | CAUGHT (2 failed) |
| 10 | step name → English | CAUGHT (2 failed) |
| 11 | this-week empty → English | CAUGHT (3 failed) |
| 12 | templates heading → English | CAUGHT (2 failed) |

The guard was also broken **in its own dimension**: the residue test was
confirmed to fail on an English string that no other test queries, which is what
proves it is a real guard rather than a restatement of the existing queries.

### 4. Real path — the page rendered in a running app, in a browser
Source: `next dev` already listening on `:3000`
(`node_modules/next/dist/server/lib/start-server.js`, pid 10836).
Instrument validated before use: the live DOM showed `100 AI kredisi`, which
matches the peer's `lib/bots.ts` mtime 02:06:18 — i.e. the server is serving the
current file via HMR, not a stale build.

Rendered at `http://localhost:3000/dashboard`, observed **zero** English strings
from a 26-entry probe list (including every string this page previously owned):

| Element | Rendered |
|---|---|
| h1 | `Ana sayfa` |
| sub | `Botlarına bir bakış.` |
| setup region / h2 | `Başlangıç (2/4)` |
| setup sub | `İki adım tamam. Devam etmek için botunu anlat.` |
| 4 steps | `Sunucunu bağla` (Tamam) · `Botunu anlat` (Buradasın) · `Dene` (Sırada) · `Canlıya al` (Sırada) |
| build-progress region + h2 | `Kurulum ilerlemesi` |
| build sub | `Botunu taslaktan kayıtlı sürüme kadar izle.` |
| stat groups | `Canlı botlar` · `Denemede` · `Sunucular` · `Kalan kredi` |
| credits line | `0 / 0 kredi` |
| empty state | `Henüz botun yok — ilk botunu anlat.` + link `İlk botunu anlat` |
| this week | `Bu hafta` / `Henüz etkinlik yok.` |
| pre-flight | `Ön kontrol` / `Henüz tarama yok — bir botu açıp çalıştır.` |
| workspace | `Çalışma alanı` / `Çalışma alanı: Sunucum` |
| trial line | `Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi.` (verbatim from `lib/bots.ts`) |
| upgrade | `Yükselt · Yakında`, `title="Yakında"` |
| templates | `Şablondan başla` / `Tüm şablonları gör` |

Accessible names, read off the live DOM (not inferred): 8 section regions all
Turkish; progressbar `Kurulum durumu`; 4 stat groups all Turkish; step list
`Kurulum adımları`; exactly 1 h1; `title` attribute `Yakında`.

The three 401s (`/api/session/trial`, `/api/bots`, `/api/credits`) are the
documented fail-open path — presence-only cookie passes the gate, the real
session reads behind the API correctly reject it, and the page renders the honest
empty state. Screenshot saved outside the repo at
`%TEMP%/F11-post/F11-dashboard-turkish-realpath.png`. The probe cookie was set
only to pass the presence gate and was cleared afterwards; no real session was
created, read, or modified.

### 5. Full-suite failures are provably not from this task
`npx vitest run` (whole `apps/web`) reports 42 failed / 940 passed in 4 files:
`app/dashboard/bots/[id]/page.test.tsx`, `app/dashboard/new/page.test.tsx`,
`app/gallery/page.test.tsx`, `app/privacy/page.test.tsx`.

Ruled out three ways:
1. **No coupling.** None of the four imports this page — each imports only its
   own `./page` (grep, exact match). They are peer-owned files mid-wave.
2. **A/B on the same peer state.** Ran the four files with this task's two files
   reverted to their pre-change backups: **11 failed / 120 passed**. Restored and
   re-ran: **11 failed / 120 passed**. Identical — delta attributable to this
   task is zero. (The 11 here vs 42 in the full run is peer concurrency: the
   peers wrote those files between the two runs.)
3. **Independence by construction.** The failures are English-literal
   expectations in peer tests (`'Retry'`, `'The provider is busy.'`) against
   peer pages that are mid-translation — the same class of stale-literal failure
   this task's own test was fixed to avoid by importing its constants instead.

`app/dashboard/page.test.tsx`: **26/26 green throughout**, including across three
peer revisions of `lib/bots.ts` and while all four peer files were failing.

### 6. Harness notes (LESSONS §1 — validate the instrument)
- Mid-run the peer translated `lib/bots.ts` while this task was verifying. Rather
  than accept the resulting failure count as a finding, the diff was taken and
  the actual DOM read, which showed the peer's new Turkish string. The failure
  was stale English literals **in this task's own test**, not a page defect.
  Fixed at the class level: the test now imports `TRIAL_DEAL` /
  `TRIAL_EXPIRED_MESSAGE` from their single source, so it cannot drift from what
  renders. This is why the suite survived two further peer revisions.
- The earlier break matrix was invalidated by that same peer edit and was
  re-run from scratch against a stable snapshot; the 12/12 table above is the
  re-run, not the invalidated one.
- `npx tsc --noEmit` was briefly non-clean due to an untracked peer scratch probe
  (`scratch-probe2.test.ts`); it was removed by the peer's own cleanup wave and
  the run above is clean.
