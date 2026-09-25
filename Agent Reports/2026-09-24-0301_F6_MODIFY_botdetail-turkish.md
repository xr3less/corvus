# Task Report: F6-botdetail-turkish

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.tsx
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx

Nothing else was touched. No manifest, lockfile, `.env`, CSS, or shared component
was edited; no git verb that writes, no install, no deploy, no migration ran.
Baselines kept as copies **outside** the repo (`/tmp/f6-backup/page.tsx.orig`,
`/tmp/f6-backup/page.test.tsx.orig`) per the LESSONS no-restore-from-HEAD rule.

## Dependencies Added
- None.

## Assumptions Made
- **`notSavedYet(action)` helper instead of five hand-written sentences.** The
  English original repeated one idea five times (`This bot is not saved on the
  server yet, so <action> is not available.`). Turkish word order puts the verb
  last, so the fragments were collected into one function
  (`page.tsx:86`) and called with `'yayınlama'` / `'tarama çalıştırma'` /
  `'simülasyon çalıştırma'` / `'kaydetme'` / `'kurulum başlatma'`. Same meaning,
  one wording, and a future action verb cannot drift into a second phrasing.
- **`Görüşmeyi sürdür` for "Continue interview".** No dashboard surface ships a
  Turkish noun for "interview" yet; `görüşme` is the word `app/page.tsx` already
  uses for interview records, so it was reused rather than coined.
- **`Bot jetonu` for the `Bot token` link.** `jeton` is the repo's shipped
  Turkish word for a Discord bot token (`app/page.tsx`: "Jeton yapıştırmak yok").
- **`Yakında` as the "Coming soon" word**, matching the wave's shipped copy
  (`Yükselt · Yakında`), keeping `·` as the shipped separator.
- **The DOM selector `button[aria-label="Open prompt input"]` in `applySuggestion`
  was deliberately left in English** (`page.tsx:494`) — it does not select the
  shared, out-of-scope `PromptInput`; translating it would silently break the
  chip→composer fill (`page.test.tsx:470`).
- **The page keeps a local `STATUS_LABEL` / `DETAIL_TABS`** rather than importing
  labels from `lib/bots.ts`, so this task needed zero cross-file edits to reach
  parity with the list page's already-shipped `Canlı` / `Deneme` / `Çevrimdışı`.
- **`const CREDITS_PER_CHANGE = 1.1` was deleted outright.** It existed only to
  feed the retired "about 1.1" line; leaving an unused binding would fail
  `eslint --max-warnings 0`.

## Open Questions for Orchestrator
1. **Out-of-scope English still renders on this page (shared components).** These
   are visible on `/dashboard/bots/[id]` and are owned by other files, so this
   task could not reach them:
   - `components/ui/ai-chat-input.tsx` — `aria-label="Prompt"`,
     `aria-label="Open prompt input"`,
     `'Attach image — sending is not connected yet'`,
     `'Image sending is not connected yet, so nothing was sent…'`
   - `components/ui/builder-progress.tsx` — `Queued` / `Generating` / `Syncing` /
     `Live`, `No run started`, `aria-label="Builder progress"`
   - `components/ui/error-card.tsx` — `retryLabel = 'Run scan again'`,
     `'What to do next: '`
   - `components/ui/thinking-trace.tsx` — `Thinking` / `Thought`, `· took {n}s`
   - `lib/chat/thread.ts:137` — `'You are logged out — log in again, then press
     Retry.'` (the HTTP-error lane, distinct from this page's own
     `LOGGED_OUT_LINE` at `page.tsx:78`)
   The page's header comment (`page.tsx:8-18`) names both remaining English
   sources so a future reader does not "fix" them here and drift one surface into
   a second wording. They need one owner each, or an F-wave of their own.
2. **`lib/bots.ts`'s own header records KNOWN DRIFT** — the English expired
   sentence is still hard-coded in `app/api/builder/start/route.ts:42`,
   `app/api/chat/route.ts:88`, `app/api/builder/verdict/route.ts:89`. Not this
   file's to fix; flagging so it is not lost. (The KI-033 sentences the page
   itself renders are byte-identical to the constant — see Verification.)
3. **`components/ui/chat-thread.tsx:10` is now stale.** Its header says the
   bot-detail page shell "is still English", which this change falsifies. Its
   owner should update that line (out of my write scope).
4. **The full-suite instrument was unreliable while peers edited concurrently**
   (F8's measured finding, reproduced here — peers landed `lib/bots.ts` (F5) and
   `chat-thread.tsx` (F7) mid-run). Verification was therefore done on the two
   focused suites plus the three gates, and the F6 guard was proven by a
   break-and-restore, not by a green full run.

## Public Interface Exposed
- No exported interface change. In-file only: `SUGGESTIONS`, `STATUS_LABEL`,
  `DETAIL_TABS`, `LOGGED_OUT_LINE`, `notSavedYet(action: string): string`,
  `scanRowTitle(row)`. The page's props (`bots?`, `trialExpired?`) are untouched.
- The rendered copy contract (what a reviewer can assert against) is now:
  `Canlı` / `Deneme` / `Çevrimdışı` · `Genel bakış` / `Etkinlik` / `Ön kontrol` ·
  `Karşılama mesajı` / `Moderasyon kuralı` / `XP ödülleri` ·
  `Sürüm kaydedildi. Botun Discord'da henüz canlıya alınmadı.` ·
  `Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.` ·
  `Görüşmeyi sürdür · Yakında` · `Kurulum başladı.` / `Kurulum ilerlemesini aç` ·
  `Son etkinlik` · `Ön kontrol` · `Bir kontrol ayrıntı vermeden bitti.` ·
  `İlgilenilmeli — {text}` · `Oturumun kapanmış — yeniden giriş yap, sonra tekrar dene.`

## Known Limitations
- **Not every English string on the *page* was reachable** — the shared
  components listed in Open Question 1 render English inside this page's own
  screens; this task is the page's own strings only.
- **KI-033 sentences are rendered, not authored, here.** The page prints
  `TRIAL_DEAL` / `TRIAL_EXPIRED_MESSAGE` verbatim from `lib/bots.ts` (already
  Turkish). `lib/bots.ts` and its three hard-coded route copies are outside this
  task.
- **No test asserts the Turkish of the shared components**, by design — their
  strings belong to their owners' tests.
- Verification is on the two focused suites (63 tests) + gates, not the whole
  suite (see Open Question 4).

---

## Verification

Acceptance criterion evidence, `file:line`, measured after the final
`prettier --write`. Both files were re-run in this order: vitest → eslint → tsc →
prettier, all clean, with no file left in a broken state.

### (1) All user-facing English → Turkish
| Anchor | Evidence |
|---|---|
| version-saved line | `page.tsx:595` — `'Sürüm kaydedildi. Botun Discord'da henüz canlıya alınmadı.'` and `page.tsx:596` — `` `Sürüm ${published} kaydedildi. Botun Discord'da henüz canlıya alınmadı.` `` |
| cost note (`:1027` in the task's line refs) | `page.tsx:1050` — `Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.` |
| coming-soon (`:1132-1142`) | `page.tsx:1154-1157` — `aria-disabled="true"` / `title="Yakında"` / `Görüşmeyi sürdür · Yakında` |
| region (`:1392`) | `page.tsx:1443` — `<section aria-label="Kurulum ilerlemesi">`; `page.tsx:1446` — `Kurulum başladı.{' '}`; `page.tsx:1448` — `Kurulum ilerlemesini aç` |
| labels, tabs, chips | `page.tsx:45-47` (`Canlı` / `Deneme` / `Çevrimdışı`), `page.tsx:53-55` (`Genel bakış` / `Etkinlik` / `Ön kontrol`), `page.tsx:63` (`Karşılama mesajı` / `Moderasyon kuralı` / `XP ödülleri`) |
| not-saved-yet family | `page.tsx:86` (`notSavedYet`), called at `:625`, `:797`, `:850`, `:900`, `:953`, `:984`, `:1007` |
| logged-out line | `page.tsx:78` — `'Oturumun kapanmış — yeniden giriş yap, sonra tekrar dene.'` |
| activity/preflight copy | `page.tsx:1264` (`Son etkinlik`), `page.tsx:1295` (`Ön kontrol`), `page.tsx:158`/`:167` (`Bir kontrol ayrıntı vermeden bitti.`), `page.tsx:176` (`` `İlgilenilmeli — ${row.text}` ``) |
| machine guard | `page.test.tsx:694` — `keeps every retired English string out of the page source`, reading `page.tsx` from disk, `RETIRED_COPY` size asserted as **29** (`page.test.tsx:695`) |

### (2) Local 1.1 cost copy simplified and honest
- The literal `1.1` is gone from the page: `CREDITS_PER_CHANGE` deleted, and
  `page.tsx:1050` now says a change spends credits and the amount follows what
  the change actually costs, with the free-retry clause added — the same wording
  `/dashboard/new` already ships (`page.test.tsx:20` holds it as `COST_NOTE`).
  The old "about 1.1" read as a fixed price no run can promise; the new line does
  not promise an amount it cannot know.

### (3) Coming-soon disabled controls stay disabled with honest Turkish labels
- `page.tsx:1153-1157` — the control still carries `disabled`, `aria-disabled="true"`,
  `title="Yakında"`, and is now labelled `Görüşmeyi sürdür · Yakında`. It is
  honestly disabled for the stated D-118 reason (the line comment above it is
  kept), never a pressable-looking dead button.
- Asserted by `page.test.tsx:234` — `repro: Continue interview is honestly disabled,
  never a dead enabled button` (updated to the Turkish four in the header-action
  row, still asserting disabled + marker).
- The CSS side of the same guarantee is independently guarded by
  `page-disabled-guard.test.tsx:80` (three `:disabled` rules + enabled `:hover`
  arms, with two in-memory break tests) — passing, 4/4.

### (4) Tests green, typecheck + lint clean
All run from `apps/web` on the final file state:

| Command | Result |
|---|---|
| `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` | `Test Files 1 passed (1)` / `Tests 59 passed (59)` |
| `npx vitest run "app/dashboard/bots/[id]/page-disabled-guard.test.tsx"` | `Test Files 1 passed (1)` / `Tests 4 passed (4)` |
| focused, both files | `Test Files 2 passed (2)` / `Tests 63 passed (63)` |
| `npx eslint "app/dashboard/bots/[id]/page.tsx" "app/dashboard/bots/[id]/page.test.tsx" --max-warnings 0` | clean (`LINT_OK`), zero warnings |
| `npx tsc --noEmit` | clean (`TSC_OK`) |
| `npx prettier --check` (both files) | `All matched files use Prettier code style!` |

**Guard is not a guard until it has been broken and watched to fail** (LESSONS
§8). The F6 source guard was broken in the real file on purpose: the heading
`<h2 className={styles.cardTitle}>Son etkinlik</h2>` was swapped to
`Recent activity`, and the suite went **`2 failed | 57 passed (59)`** with
`retired English copy came back: 'Recent activity'`. The pre-break copy was then
restored from the out-of-repo copy and the suite returned to **`59 passed (59)`** —
`md5sum page.tsx /tmp/f6-break.tsx` confirmed identical afterwards
(`1bc26deb003bfe78e74a3cfc08673e60`). No file is currently in a broken state.

**Instrument boundary, pinned by its own test:** the scan strips `/* … */`
comments before looking for literals/JSX text, so the page's own explanatory
comment quoting the server's English feed shape (`Rolled back to vN`, the M-10
note) does not trip it. `page.test.tsx:707` asserts that boundary in memory —
the same helper over a heading swapped to a retired term returns exactly
`['Recent activity']`, while a version with `{/* mirrors 'Rolled back to vN' … */}`
added returns `[]`, and the real file is asserted untouched. This was a real
catch: an earlier, unscoped version of the guard tripped on the page's own
comment.

**Companion boundary test:** `page.test.tsx:735` still mounts the trial-expired
page and asserts the rendered sentence is byte-identical to
`TRIAL_EXPIRED_MESSAGE` from `lib/bots.ts` (containing `deneme süren bitti`) —
proving the page *renders* the locked constant rather than keeping a second
wording of its own.

### Data flow untouched — only strings
`git status --porcelain` for the two files shows ` M` (modified) and nothing else;
no new file, no deletion. The page's imports, fetches, write payloads, KI-030
empty-not-example behaviour, KI-033 trial gate, and D-112 mock-id coercion are
unchanged — every edit in this task is a string literal, a label map, or the
removal of the now-unused `CREDITS_PER_CHANGE` binding.
