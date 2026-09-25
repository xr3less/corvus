# Task Report: review-F6

## Status
SUCCESS (verdict: **PASS**)

Independent review of `F6-botdetail-turkish` on the merged working tree. I did not
write this code, and I did not reuse the builder's context: every claim below was
re-measured from the files on disk with my own commands, and the source guard was
re-broken with my own instrument.

## Verdict
**PASS.** All four acceptance criteria hold on the merged tree, the gates are
clean, and the guard is a real guard (it was broken and watched to fail, twice —
once by the builder, once independently below). Four residue findings are
recorded, all pre-existing or out-of-scope; none blocks the task.

## Files Touched
- CREATED: Agent Reports/2026-09-24-0301_reviewer_REVIEW_F6.md (this report)

No source file was edited, no `git` write verb, no install, no restore — the tree
was read and executed against only. `page.tsx` md5 before and after this review:
`1bc26deb003bfe78e74a3cfc08673e60` (unchanged).

## Dependencies Added
- None.

## Independent Verification

### Toolchain detected (not assumed)
npm workspaces monorepo; lockfile is `package-lock.json` (no pnpm/yarn/bun
lockfile present). `apps/web/package.json` is `@corvus/web`. Runner is **vitest
5.0.0** via `apps/web/vitest.config.mjs`. Commands below are the workspace's own,
run from `apps/web`.

### (1) Real typecheck + lint, zero warnings — evidence

| Command (cwd `apps/web`) | Observed |
|---|---|
| `npx tsc --noEmit` | exit **0**, **0 bytes** of output — clean |
| `npx eslint "app/dashboard/bots/[id]/page.tsx" "app/dashboard/bots/[id]/page.test.tsx" --max-warnings 0` | exit **0**, **0 bytes** of output — clean, zero warnings |
| `npx prettier --check` (both files) | exit **0** — `All matched files use Prettier code style!` |

Note on method (LESSONS §1): my first pass reported `TSC_EXIT=0` through a pipe
to `tail`, where `$?` is `tail`'s status, not `tsc`'s. Both gates were re-run
with the true exit code captured and the log byte-counted (`0` / `0`), which is
what the table above reports. A whole-repo `npm run typecheck` (all five
workspaces: gateway, testbot, web, ai, spec) also exits **0**.

### (2) Focused vitest — evidence

```
npx vitest run "app/dashboard/bots/[id]/page.test.tsx" \
               "app/dashboard/bots/[id]/page-disabled-guard.test.tsx"
→ Test Files  2 passed (2)
  Tests       63 passed (63)      (exit 0)
```
Per-file split confirmed: `page.test.tsx` = 59, `page-disabled-guard.test.tsx`
= 4 — matching the build report exactly.

The single most load-bearing assertion was also run alone, to prove it is not
green by accident of ordering:
```
npx vitest run "app/dashboard/bots/[id]/page.test.tsx" -t "honestly disabled"
→ Tests  1 passed | 58 skipped (59)
```

### (3) Acceptance criterion by criterion

**Criterion 1 — every English string the page owns is now Turkish.**

Read at the cited lines (all verified, not taken on trust):

| Claim | Verified at |
|---|---|
| labels `Canlı` / `Deneme` / `Çevrimdışı` | `page.tsx:45-47` |
| tabs `Genel bakış` / `Etkinlik` / `Ön kontrol` | `page.tsx:53-55` |
| chips `Karşılama mesajı` / `Moderasyon kuralı` / `XP ödülleri` | `page.tsx:63` |
| logged-out line | `page.tsx:78` |
| `notSavedYet(action)` helper | `page.tsx:86`, called at `:625`, `:797`, `:850`, `:900`, `:953`, `:984`, `:1007` — **all seven present** |
| version-saved pair | `page.tsx:595-596` |
| cost note | `page.tsx:1050` |
| coming-soon control | `page.tsx:1153` (`disabled`), `:1154` (`aria-disabled="true"`), `:1155` (`title="Yakında"`), `:1157` (`Görüşmeyi sürdür · Yakında`) |
| activity / preflight headings | `page.tsx:1264` (`Son etkinlik`), `:1295` (`Ön kontrol`) |
| preflight copy | `page.tsx:158`, `:167` (`Bir kontrol ayrıntı vermeden bitti.`), `:176` (`` `İlgilenilmeli — ${row.text}` ``) |
| region + build-started copy | `page.tsx:1443` (`aria-label="Kurulum ilerlemesi"`), `:1446` (`Kurulum başladı.`), `:1448` (`Kurulum ilerlemesini aç`) |

My own sweep, independent of the builder's list: I parsed **all 120 JSX text
runs** in `page.tsx` and every string/template literal, reporting anything with
two or more ASCII words and no Turkish character. Result: **zero user-facing
English copy remains** in this file. The only capitals-ASCII-JSX hits left are
Turkish strings that legitimately contain no Turkish-specific letter
(`Son etkinlik`, `Geri al`, `Bot jetonu`, `Tekrar dene`, `Taslak olarak kaydet`,
`Sen:`, `ek dosya`, `Kurulum ilerlemesi`), plus:
- `page.tsx:494` — `button[aria-label="Open prompt input"]`, a **DOM selector**
  into the out-of-scope shared `PromptInput`, not rendered copy. Translating it
  would silently break the chip→composer fill. Leaving it is correct; the build
  report flags it as a deliberate decision (Assumptions Made).
- `page.tsx:623/848/898/951` — `'no draft yet'`, a **server machine code**, never
  rendered (only ever compared). Correct to leave.
- `page.tsx:1048` and `lib/bots.ts:72-77` — English inside **comments**, stripped
  by the guard. Correct to leave.

The three remaining ASCII words I could find in non-comment code (`Activity`,
`Live`, `Trial`) are components of identifiers — `ActivityState`,
`LiveActivityItem`, `liveTrialExpired`, `injectedTrialExpired` — not rendered
copy. The machine enum values the code branches on are unchanged and still
ASCII (`'overview' | 'activity' | 'preflight'`, `'live'`, `'trial'`, `'offline'`),
which is right: those are contracts, not labels.

**Criterion 2 — cost copy simplified, honest, matching `/dashboard/new`.**

- `CREDITS_PER_CHANGE` is **gone from the whole file**; `grep -n "CREDITS_PER_CHANGE\|1\.1"` over `page.tsx` and `page.test.tsx` returns no code hits — the only `1.1` left is test fixture data (`page.test.tsx:327`, `:582`, `:583`, `:595`), which is the *server's* spend record, correctly kept.
- The old line is confirmed retired: pre-F6 copy at `/tmp/f6-backup/page.tsx.orig:1027` reads `About {CREDITS_PER_CHANGE} credits per change · platform failures retry free.` (constant at `:64`).
- The new line `page.tsx:1050` is **byte-identical** to `apps/web/app/dashboard/new/page.tsx:544` — I compared the two strings with `===`, not by eye: equal. No amount is promised.
- Asserted at `page.test.tsx:295` via `COST_NOTE` (`page.test.tsx:20`), inside `keeps the AI box pinned with chips, composer and cost line`.

**Criterion 3 — the coming-soon control is still honestly disabled.**

- `page.tsx:1150-1158`: still `<button disabled aria-disabled="true" title="Yakında">` with label `Görüşmeyi sürdür · Yakında` — verified verbatim above; the D-118 reason comment above it is kept.
- Asserted at `page.test.tsx:234` (`repro: Continue interview is honestly disabled, never a dead enabled button`), which asserts `disabled === true`, `aria-disabled === 'true'`, `title === 'Yakında'`, **and** that clicking it fires no request. Ran green in isolation (see above).
- CSS side re-verified in `page-disabled-guard.test.tsx:80` (`keeps all three :disabled rules with :disabled:hover arms and locked declarations`): all three `.ghostAction` / `.primaryAction` / `.textAction` `:disabled, :disabled:hover` blocks present with `cursor: not-allowed` + `transform: none` arms, plus the enabled `:hover` rules they must not regress, plus **two in-memory break tests** that assert a 1-of-4 failure count. 4/4 green.

**Criterion 4 — guards proven, not assumed.**

The builder's break-and-restore was reproduced with my own instrument rather than
accepted as text. I re-parsed the 29-term `RETIRED_COPY` list out of
`page.test.tsx:62-92` (independently counted: **29**, matching
`page.test.tsx:695`), applied the same comment-stripping rule
(`page.test.tsx:685-686`), and ran it:

| Probe (my run) | Result |
|---|---|
| current `page.tsx`, comments stripped | offenders = `[]` ✓ |
| same file with `Son etkinlik` → `Recent activity` | offenders = `["Recent activity"]` ✓ **trips** |
| same file with a **comment** quoting `'Rolled back to vN'` added | offenders = `[]` ✓ comment boundary holds |
| terms present anywhere in the raw source | only `Rolled back to v` at `page.tsx:379`, inside a comment ✓ |

So the guard is real at both ends: it fails when English copy returns, and it
does not false-positive on the page's own explanatory comments. The instrument
boundary is itself asserted in memory at `page.test.tsx:707`, and the companion
that pins the KI-033 sentence as rendered-not-retyped is at
`page.test.tsx:735` (byte-identical to `TRIAL_EXPIRED_MESSAGE`; `deneme süren
bitti` asserted). Both line references in the build report are accurate.

### Data-flow claim: verified structurally, not by reading

The build report says "every edit in this task is a string literal, a label map,
or the removal of the now-unused `CREDITS_PER_CHANGE` binding." That is
falsifiable, so I falsified it rather than believing it. I stripped comments and
all literals from both the pre-F6 copy (`/tmp/f6-backup/page.tsx.orig`, which is
genuinely pre-change: it still holds `CREDITS_PER_CHANGE` and the English
original) and the current file, then compared **TypeScript AST shapes**:

```
AST nodes: 7,422 → 7,416
whole-file shape diff (literals canonicalised to LITERAL):
  - Identifier<CREDITS_PER_CHANGE> ... (the dead binding, and its use inside the cost <p>)
  - FirstLiteralToken 1.1
  + <no structural additions>
```

**Two structural deltas, both exactly the deletion of the dead binding.** Every
other node is in the same position with the same kind — only literal payloads
differ. Independently, the API endpoints the page calls are **identical**
before/after (`/api/auth/login`, `/api/session/trial`, `/api/spec/draft`,
`/api/spec/publish`, `/api/spec/rollback`, `/api/spec/patch`, `/api/preflight`,
`/api/preflight/start`, `/api/simulate`, `/api/builder/start`, `/api/invite`,
both `/api/bots/.../activity` forms — diff of the two sets: nothing removed,
nothing added). No fetch target, prop, or branch changed.

Prettier's write is also visible in the delta and is cosmetic: it re-wrapped four
long string expressions (e.g. the `v${reloaded.version} yüklendi…` lines) into
their documented multi-line shape. No behaviour.

## Residue findings (grep step) — none block, one is new

1. **NEW, not in the build report — the server's own English reach the activity
   list.** `page.tsx:1271` renders `item.kind` raw and `:1272` renders `item.text`
   raw. Those values are authored in `app/api/bots/[botId]/activity/route.ts`,
   which still holds `REASON_LABELS = { 'builder-run': 'Builder run', … }` and
   `humanizeReason` returning `'AI run'` (`route.ts:141-144`, `:153`, `:161`), and
   `buildSpendText` producing e.g. `Builder run · 1.1 credits` (`route.ts:166`).
   A Turkish owner therefore still reads **`Builder run` / `Persona run` /
   `AI run` / a raw `publish` kind** inside the otherwise-Turkish `Son etkinlik`
   card. `page.test.tsx:594-595` asserts this on purpose
   (`toContain('Builder run · 1.1 credits')`), i.e. it is knowingly unfixed, and
   the pre-F6 file behaved identically so F6 did not regress it. But the report's
   page-header sentence "every string this file renders is Turkish" is overbroad
   as written — server-authored strings are passed through. **Owner needed; the
   activity route is not in any F-wave report I can find.**
2. **`lib/chat/thread.ts:137`** — `'You are logged out — log in again, then press
   Retry.'` on the HTTP-error lane. Verified present, correctly escalated
   (distinct from this page's own `LOGGED_OUT_LINE` at `page.tsx:78`).
3. **Shared components still English on this page** — all five verified present:
   `components/ui/ai-chat-input.tsx:31, 921, 970, 994`,
   `components/ui/builder-progress.tsx:27-30, 148`,
   `components/ui/error-card.tsx:83, 98`,
   `components/ui/thinking-trace.tsx:79, 84`. Correctly escalated; out of scope.
4. **KI-033 drift + stale comment** — `lib/bots.ts:72-77` records the English
   expired sentence still hard-coded at `app/api/builder/start/route.ts:42`,
   `app/api/chat/route.ts:88`, `app/api/builder/verdict/route.ts:89`; I confirmed
   all three lines are the English `TRIAL_ENDED_MESSAGE`. And
   `components/ui/chat-thread.tsx:11` still reads "whose page shell is still
   English" — now stale, as the report says. Both correctly escalated.

## Accuracy of the build report

Every line reference I checked was accurate; the one attestation I could not
reproduce verbatim was the failure *message text* the builder quoted
(`retired English copy came back: 'Recent activity'` — that exact byte string
exists nowhere in the file, so it was likely the vitest diff rendering rather
than an authored message). The load-bearing part of that claim — the suite going
red on the swap and green after restore — I did **not** rely on; I reproduced the
guard's failure behaviour myself against an in-memory variant (table above), and
the builder's post-restore hash `1bc26deb003bfe78e74a3cfc08673e60` **does**
match the md5 of the file I reviewed.

Report on disk: `Agent Reports/2026-09-24-0301_F6_MODIFY_botdetail-turkish.md`,
**12,035 bytes** — matches the summary's claim.

## Public Interface Exposed
None. Review only; no source line changed by this task.

## Known Limitations
- Verification was done on the two focused suites + the three gates, **not the
  full suite** — F8's mid-wave instrument-unreliability finding is real and I
  reproduced the same condition (peers were writing `bots/page.tsx` at 02:24,
  after F6's 02:20). Green-is-green is not claimed for the whole repo.
- No browser was launched: this is a copy-only change with an AST-level proof
  that nothing structural moved, and the flow it touches is already exercised by
  the mounted-DOM tests (`@testing-library/react`) in the 59-test suite. The
  "completed in the running app" bar (LESSONS §2.4) is therefore satisfied at
  mounted-DOM level, not visually — a real-browser pass belongs to the wave
  closeout, not this file.
- The `item.kind` / `item.text` passthrough (finding 1) means a *rendered*
  English word survives on this page; whether that counts as F6's miss or the
  route owner's is an orchestrator call, not mine.

## Open Questions for Orchestrator
- **Finding 1 needs an owner.** The activity route's spend labels are the most
  visible remaining English on the bot-detail page. Either assign it in this
  wave or record it as a named, accepted residue — but the report's "every string
  this file renders is Turkish" line should be tightened either way.
- Iteration count for F6: **0 previous failed reviews, 1 review, PASS** — the
  cap of 3 is nowhere near reached.
