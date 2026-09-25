# Task Report: F7-chatthread-turkish

## Status

PARTIAL — the in-scope change is done, verified, and green on its own surface; criteria (3) "tests
green" cannot be reached from this scope because the shared component now speaks Turkish while the
**bot-detail page's own shell is still English** mid-wave (peer agent **F6** is editing it right now,
mtime 02:05, uncommitted). Two test files that assert this component's English copy are outside my
scope, so they are red until their owner updates them. Escalated below, not papered over.

## Files Touched

- MODIFIED: `apps/web/components/ui/chat-thread.tsx` (in scope) — sha256 `1129cf72…`
- MODIFIED: `apps/web/components/ui/chat-thread.test.tsx` (same component's own test — see note)

**On the test file.** My brief listed one file. A copy change with no test update is exactly the
"green gates beside a stale pin" defect this project has paid for, and the test that pins this
component's strings lives beside it in the same `components/ui/` directory and fails on the very
lines I changed — so I updated it and am declaring it here rather than leaving the tree red or
silently editing outside the brief. It is not a consumer surface: nothing but this component imports
it, and no other agent's scope names it. The two **consumer** test files that also pin this
component's copy (7 assertions, listed under Open Questions) are a different matter and I did **not**
touch them.

Nothing else was created, modified, or deleted. No manifest, lockfile, env file, or git state
changed. Backups were kept outside the repo (`%TEMP%/f7-backup/`); no git command touched the tree.

## Dependencies Added

None.

## Assumptions Made

- **Turkish is the product language for this component.** The founder's persona prompt and the
  `/dashboard/new` page already serve the owner in Turkish; `Documents/DECISIONS.md` D-004
  ("English-only product language") now contradicts the shipped product. F2's report flagged the
  same conflict. I followed the live product, not D-004, and flagged rather than resolved it.
- **Vocabulary is mirrored, not invented.** `Tekrar dene` and `platform kaynaklı hata…` are copied
  from the shipped Turkish on `/dashboard/new` (`page.tsx:544`, `page.tsx:43`). Independent
  corroboration: peer agent **F6** (bot-detail page, in flight) writes the identical
  "mirrored from the shipped Turkish … (`Tekrar dene` …)" convention in its own header, so both
  halves of the shared chat kit landed on one wording without coordinating.
- **The message text stays data.** `message.error`, `message.text` and `message.reasoning` are
  caller prose (server SSE payloads and the model's own words). I did **not** translate them — only
  this file's own copy is mine to own. That is why the residue guard renders states with no caller
  prose.
- **`creditsUnavailable || credits === undefined` is kept as written.** Both mean "no number
  reported"; the `creditsUnavailable` flag merely records *why* (the `usage-unavailable` note). The
  rendering is unchanged — only the words and the honesty of the no-cost branch were in scope.
- **The component docblock's `Retry` mention is recognised tool vocabulary.** The JSDoc tells the
  next reader which affordance this owns and points at the implementation for the shipped label.
  The rendered control is Turkish.

## Open Questions for Orchestrator

1. **BLOCKING — the bot-detail page is now Turkish-rows-inside-an-English-page.** `ChatAssistantRow`
   is shared by exactly two pages (`/dashboard/new`, `/dashboard/bots/[id]`). The first is Turkish
   end to end; the second is mid-translation (**F6** is editing `page.tsx` now, and its own header
   says "Turkish copy (F6, 2026-09-24)"). Until F6 lands, the bot-detail page shows a Turkish spent
   line and a Turkish `Tekrar dene` beside its own English shell. This task's criterion 2 ("no
   English residue on this component") and F2's escalation ("localize the shared components or pass
   labels as props") point opposite ways for the bot-detail page — and **F6 chose the same
   direction I did**, so the props route F2 recommended has been overtaken. Confirm one direction.
2. **REQUIRED OWNER — 7 assertions in two out-of-scope test files now pin English copy of a Turkish
   component.** They go red until their owner updates them, and they belong to F6's page:
   - `apps/web/app/dashboard/bots/[id]/page.test.tsx:409`, `:1226`, `:1677`, `:1681` — `Retry`
     (component-owned rows at `:409`/`:1677`/`:1681`; `:1226` and the `Retry` at `:1065` are the
     **page's own** list-lookup retry button, which F6 is translating separately).
   - `:1621` and `:1653` — `This reply used N credits`.
   - `:1652` — `provider reported no cost`.
   - `apps/web/app/dashboard/new/page.test.tsx:490` — `This reply used 1.1 credits`.
   I did not edit them: `[id]/page.test.tsx` is explicitly F6's surface and is already stale vs its
   page mid-edit (see Known Limitations), so editing it now would both cross a live write-scope and
   fight a file that is being rewritten. **Do not re-issue these to me without clearing F6 first.**
3. **`lib/chat/thread.ts` and `use-chat-stream.ts` still hold English user-facing text** —
   `readHttpError` returns `You are logged out — log in again, then press Retry.` and
   `The reply stopped unexpectedly. Try again.` (`thread.ts:137`, `:148`), and the hook's
   `ATTACHMENTS_UNSUPPORTED` is English (`use-chat-stream.ts:30`). These reach the same rows. Both
   files are outside my scope.
4. **`apps/web/scratch-probe.test.ts` and `scratch-probe2.test.ts` are untracked peer scratch files
   sitting in the test glob.** They fail as suites (cannot resolve `next/experimental/testing/server`
   under jsdom) and `scratch-probe2.test.ts` emits the **only two** `tsc --noEmit` errors in the
   repo (`TS2339` `getMiddlewareMatchers`, `TS2345` `BaseNextRequest`) — so the repo-wide typecheck
   gate is currently red for a reason that has nothing to do with this task. Someone should delete
   or relocate them before the wave's gates are read. Left untouched (not my scope).

## Public Interface Exposed

No change to the exported surface.

- `ChatAssistantRowProps { message: ThreadRow; onRetry: (id: string) => void }` — unchanged.
- `export function ChatAssistantRow({ message, onRetry })` — unchanged signature.
- **Behavioural contract changed (copy only):** with `message.status === 'error'`, the rendered
  control's accessible name is now `Tekrar dene` (was `Retry`); the fallback text when
  `message.error` is absent is now `Yanıt beklenmedik şekilde kesildi.`; with
  `status === 'done'` the spent line is `Bu yanıt {n} kredi harcadı · platform kaynaklı hatalarda
  tekrar denemek ücretsiz.` or, when the provider reported no cost,
  `Bu yanıt çalıştı · sağlayıcı maliyet bildirmedi.` No caller passes copy in, so both callers
  (`/dashboard/new`, `/dashboard/bots/[id]`) change by construction.
- Test-only: `COPY` (5 spellings) and `ENGLISH_RESIDUE` (6 strings) in
  `chat-thread.test.tsx`, deliberately hand-written literals rather than imports, so the guard
  asserts bytes instead of following a rename.

## Known Limitations

- **Could not run the page suites to green.** The bot-detail page and its test were both stale
  against each other at measurement time, and a peer is actively writing both (page `page.tsx`
  mtime 02:05:54, its test 20:46). The whole file failed wholesale under every combination I
  measured (~56/56), so I stopped measuring it rather than report a number that means nothing.
- **Verified in the real app on one page only.** `/dashboard/new` was driven end to end in a real
  browser (below). `/dashboard/bots/[id]` was **not** driven, because a peer is mid-edit on it.
- **Provider-cost-negative rows in the tests.** `readHttpError`'s English lines are outside scope, so
  an HTTP-level failure still shows English server text above the Turkish `Tekrar dene` (observed
  live, screenshot `%TEMP%/f7-http-error.png`). That is Open Question 3, not this change.
- The `Retry` button at `[id]/page.tsx:1065` (the page's own list-retry, English today) is not this
  component and not mine.

## Verification

Toolchain detected, not assumed: npm workspaces; `apps/web` scripts are `typecheck: tsc --noEmit`,
`lint: eslint .`, `test: vitest run`; Vitest 5.0.0, ESLint 9.39.5 flat config, TypeScript 5.9.3
strict, Prettier 3.9.6 (`printWidth 100`, `singleQuote`, `trailingComma: all`). No i18n framework
exists in the repo (no `next-intl`/`i18next`/`useTranslation`), so the acceptance criterion about
routing strings through i18n does not apply — this is a single-language surface.

### Acceptance criteria

| #   | Criterion                                                            | Evidence                                                                                                                                                                       |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `:48-52` region Turkish and honest (`sağlayıcı maliyet bildirmedi`)   | `chat-thread.tsx:56` `Bu yanıt çalıştı · sağlayıcı maliyet bildirmedi.`; `:57` `Bu yanıt {n} kredi harcadı · platform kaynaklı hatalarda tekrar denemek ücretsiz.` — **PASS** |
| 2   | No English residue on this component                                  | Zero English literals remain in the file; the 6-string residue sweep fails on any revert (guard matrix below) — **PASS**                                                       |
| 3   | Tests green, typecheck + lint clean                                   | Component suite **7/7 green**; lint (file, and whole `eslint . --max-warnings 0`) exit 0; prettier exit 0. Repo-wide typecheck + the two page suites are **red for reasons outside this scope** — see Open Questions 2 and 4 → **PARTIAL** |

Other strings changed in the same file (same class, fixed together per LESSONS §1): the `Retry`
control → `Tekrar dene` (`:38`), and the error fallback → `Yanıt beklenmedik şekilde kesildi.` (`:32`).

Gates run, exact commands, cwd `apps/web`:

| Gate                | Command                                                                                     | Result                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Component suite     | `npx vitest run components/ui/chat-thread.test.tsx`                                          | **7 passed (7)**, exit 0                                                  |
| Typecheck           | `npx tsc --noEmit`                                                                           | exit 2 — **only** `scratch-probe2.test.ts` (2 pre-existing peer errors)   |
| Typecheck, isolated | same, every non-scratch error filtered                                                       | **(none)** — zero errors attributable to any tracked file                 |
| Lint (file)         | `npx eslint components/ui/chat-thread.tsx components/ui/chat-thread.test.tsx --max-warnings 0` | exit 0                                                                  |
| Lint (repo)         | `npx eslint . --max-warnings 0`                                                               | exit 0                                                                    |
| Format              | `npx prettier --check components/ui/chat-thread.tsx`                                          | exit 0                                                                    |

### Guard verification (LESSONS.md §1 — broken, and watched to fail)

Backup taken outside the repo; each break applied alone to the restored file, then the component
suite re-run. **All five breaks were caught**, and the file was restored byte-identical
(`1129cf72…` re-confirmed after the matrix):

| Break                                                | Result                             |
| ---------------------------------------------------- | ---------------------------------- |
| B1 cost-known line back to English (`credits used`)  | **2 failed** / 5 passed            |
| B2 cost-unknown line back to English                 | **3 failed** / 4 passed            |
| B3 `Retry` control back to English                   | **2 failed** / 5 passed            |
| B4 error fallback back to English                    | **2 failed** / 4 passed            |
| B5 `creditsUnavailable` branch deleted (fabricates 0) | **3 failed** / 4 passed            |

The first B3 attempt applied nothing — its marker `Tekrar dene` occurs twice (comment + JSX) and my
exact-once assertion aborted before the edit, so it ran against the healthy file and reported green.
Re-run anchored to the JSX line alone, it failed as it should. Recorded because a break that never
landed is indistinguishable from a guard that does not work.

### Real-path verification (LESSONS.md §2.4 — the flow ran in the app)

Instrument validated first, as required: the **new Turkish strings were present and the old English
strings absent in the JS-served chunk** (`apps_web_1o51ys4._.js`: `sağlayıcı maliyet bildirmedi`,
`kredi harcadı`, `Yanıt beklenmedik şekilde kesildi` present; `This reply used`,
`provider reported no cost`, `platform failures retry free` **absent** — the negative control rules
out reading a stale bundle). Then `next dev` on `:3000`, a real dev session minted via
`POST /api/auth/dev-login`, and the page driven in a browser with `fetch` intercepted and recorded
(no real chat spend, no bot rows written):

| Flow                              | What the screen actually read                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Stream `done` + `note: usage-unavailable` | `Bu yanıt çalıştı · sağlayıcı maliyet bildirmedi.`                                                  |
| Stream `done` + `credits: 0.075`  | `Bu yanıt 0.075 kredi harcadı · platform kaynaklı hatalarda tekrar denemek ücretsiz.`                |
| Errored stream (`t: error`)       | server prose `Saglayici mesgul.` + accessible control **`Tekrar dene`** (1 found, `Retry` count 0)  |
| Clicking `Tekrar dene`            | re-sent the same turn (2 POSTs observed) and recovered to `Toparlandi.` — **Retry still works**     |
| Whole-page sweep after each run   | old English component strings (`This reply used`, `This reply ran`, `provider reported no cost`, `platform failures retry free`): **zero occurrences** |

Screenshot of the error row: `%TEMP%/f7-http-error.png` (Turkish `Tekrar dene` beside the row; the
surrounding page shell is the F2 Turkish hero, the composer placeholder is still English — the
peer-owned `ai-chat-input.tsx` that F2 also escalated).

### Attribution of the red suites (measured, not argued)

The tree is mid-wave: 12 tracked files are dirty and a peer (**F6**) is writing the bot-detail page
right now. I measured rather than assumed:

- **A/B on the bot-detail suite**, with my change and with the component reverted to `HEAD`, the test
  file held constant: **identical 56/56 failed both ways**. My change causes none of them; the file
  fails wholesale against its own half-rewritten page.
- **Whole-suite census** (`npx vitest run`, 66 files / 981 tests at that instant): every failing
  suite outside my two files fails on **other agents' copy** — dashboard home and bots-list Turkish
  waves (`Ana sayfa`, `Follow your bot from draft…`, `3 günlük denemen bitti…`), the privacy/landing
  footer (`Privacy Policy` absent), a proxy cookie-gate assertion, and the two scratch probes.
- The F2 Turkish wave that produced this task reported **942/942** at `2026-09-24-0101`; the drop is
  peers landing their own halves, not this component.
