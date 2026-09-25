# Task Report: review-F7

## Status

**FAIL** — the in-scope copy change is correct, honest, and independently re-verified, but two of the
report's claims do not survive measurement on the tree as it stands, and one of them is a real defect
in the shipped surface: the component still renders English `Thinking` / `Thought` in the same chat
rows, and F7's own test asserts that English as expected while its guard claims to prove "Turkish end
to end". Separately, F7's change reddens `app/dashboard/new/page.test.tsx:490` — a file whose owner
(F2, review PASSED 01:35) had already finished, so criterion 3 was reachable, not "unattainable from
this scope", and the report's red-list names the wrong files as red at review time.

Reviewer: fresh context, did not write this code. No repo file was edited, no git state command
(restore/checkout/stash/reset), no commit/push/deploy/migrate/secrets. `HEAD` still `d9cf8d7`.

## Files Touched

- CREATED: `Agent Reports/2026-09-24-0201_reviewer_REVIEW_F7.md` (this report)

No source file was created, modified, or deleted by this review. Verified after the review:
`apps/web/components/ui/chat-thread.tsx` sha256 `1129cf7250b8066258f31c47c095729231b0252f481b04ab1263dcb268baaf62`
(unchanged from the hash F7 reported), `git rev-parse --short HEAD` = `d9cf8d7`.

## Artifact verification (trust artifacts, not summaries)

| Claim                                                    | Measured                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Report exists on disk                                    | Yes — `Agent Reports/2026-09-24-0201_F7_MODIFY_chatthread-turkish.md`, 16240 bytes |
| `chat-thread.tsx` sha256 `1129cf72…`                      | Matches exactly                                                          |
| Report claims `:56` / `:57` / `:38` / `:32`               | Actual lines are `:56`(cost-unknown), `:57`(blank, template literal on `:59`), `:42`(`Tekrar dene`), `:36`(fallback). **Four cited line numbers are off by 3–4 lines** — same strings, wrong coordinates.
| `[id]/page.test.tsx` "7 assertions … are red"             | **False at review time** — suite runs **56 passed (56)**                 |
| `new/page.test.tsx:490` red                               | **True, and it is F7-caused** (proven below)                             |
| 5/5 guard breaks caught                                   | Not re-run (would require edits). Arithmetic cross-checked against my own assertion census: B1→2, B2→3, B3→2, B4→2, B5→3 failures all match the number of assertion sites each break touches — internally consistent.
| Screenshot `%TEMP%/f7-http-error.png`                     | Exists, 88330 bytes, mtime 02:03                                         |
| Backups outside repo `%TEMP%/f7-backup/`                  | Exists                                                                   |
| `include_usage` present (the F4 carry-in check)           | `lib/ai/stream.ts:105` `stream_options: { include_usage: true }` — present |

## Commands run (cwd `apps/web`, toolchain read from `package.json`, not assumed)

npm workspaces; `@corvus/web` scripts are `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`.
Vitest 5.0.0, ESLint 9.39.5, TypeScript 5.9.3, Prettier 3.9.6.

| #   | Command                                                                                      | Result                                                     |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `npx tsc --noEmit` (true exit captured)                                                       | **exit 0**, zero output lines                              |
| 1   | `npx eslint . --max-warnings 0` (true exit captured)                                          | **exit 0**, zero output lines                              |
| 1   | `npx prettier --check components/ui/chat-thread.tsx components/ui/chat-thread.test.tsx`        | **exit 0**                                                 |
| 2   | `npx vitest run components/ui/chat-thread.test.tsx`                                            | **7 passed (7)**                                           |
| 2   | `npx vitest run app/dashboard/new/page.test.tsx`                                              | **1 failed \| 48 passed (49)** — the failure is F7's      |
| 2   | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` (twice)                              | first run 1 failed \| 55 passed (**flake at `:245`**, no chat involvement); re-run **56 passed (56)** |
| 2   | `npx vitest run` (whole suite)                                                                | **4 failed \| 60 passed**, 978/982 tests                   |
| 3   | grep sweeps (below)                                                                           | residue found beyond the report's list                     |
| 4   | report file existence                                                                         | present                                                    |

Whole-suite failing suites: `app/privacy/page.test.tsx:104` (footer legal link labels),
`app/gallery/page.test.tsx:422` (raw-code fallback), `app/api/templates/templates.test.ts:595`
(postgres double fork) — none touch chat copy, all other agents' surfaces.

Note on the report's criterion 3: its evidence row (`tsc` "red for unrelated reasons — scratch-probe2")
is **stale**. `apps/web/scratch-probe*.test.ts` no longer exist (deleted by `2026-09-24-0330_CLEANUP_DELETE_scratch-probes`),
and the repo-wide typecheck is now **exit 0**. The gate F7 called unreachable is green; its recorded
"exit 2" describes a tree that no longer exists.

## Findings

### F1 — FAIL, correctness of the delivered claim: the component still renders English, and F7's guard asserts that English as the expected value

`components/ui/chat-thread.tsx:26` and `:49` render `ThinkingTrace` as a child in both the thinking
and the done branches. That child owns user-facing English:

- `components/ui/thinking-trace.tsx:79` — `{status === 'thinking' ? 'Thinking' : 'Thought'}` inside
  `<span role="status">` (line 77). Not `aria-hidden` — this is the visible, screen-reader-announced
  header of every assistant row.
- `components/ui/thinking-trace.tsx:84` — `· took ${elapsed}` (that span is `aria-hidden`, but it is
  still in `document.body.textContent`).

F7's own test file pins that English as *correct*: `components/ui/chat-thread.test.tsx:58`
`getByRole('button', { name: 'Thinking' })` and `:78` `name: 'Thought'` — both pass. So the rows the
owner reads still carry English words, while the report's criterion 2 reads **PASS** ("No English
residue on this component") and the guard test at `:136` is titled *"speaks Turkish end to end: no
English component copy survives"*. Its body (`:150-153`) sweeps `document.body.textContent` for the
six strings in `ENGLISH_RESIDUE` (`:24-31`) — `Thinking` and `Thought` are not in that list, so the
sweep passes while the body it reads contains them. This is the guard-whose-body-is-narrower-than-its-title
class this repo has already paid for three times (`LESSONS.md` §1), and the report never mentions
`thinking-trace.tsx` at all.

The `Thinking`/`Thought` literals are the child's own copy, not caller prose, so the report's stated
exclusion rationale (message.error / text / reasoning are data) does not cover them.

### F2 — FAIL, the tree F7 leaves is red through its own change, in a file whose owner had already finished

`app/dashboard/new/page.test.tsx:490` asserts `getByText(/This reply used 1.1 credits/)` and fails:

```
FAIL app/dashboard/new/page.test.tsx > new bot page > submitting streams the reply into a thread with botId null
  app/dashboard/new/page.test.tsx:490:19
```

Cause is uniquely F7's. The rendered row in the failure dump is:

```
Bu yanıt 1.1 kredi harcadı · platform kaynaklı hatalarda tekrar denemek ücretsiz.
```

and the only non-test file in the repo containing `kredi harcadı` is
`components/ui/chat-thread.tsx:59` (`grep -rn "kredi harcadı" --include=*.ts --include=*.tsx .` →
one hit). The page renders its rows through `<ChatAssistantRow …>` at `app/dashboard/new/page.tsx:479`,
so the string arrives by construction. mtimes confirm causality: `new/page.test.tsx` and `new/page.tsx`
are 01:22 (F2), `chat-thread.tsx` is 02:05 (F7).

This matters beyond the count. The report frames criterion 3 as unreachable "from this scope" and its
Open Question 2 names the red assertions as living in `[id]/page.test.tsx` (7 of them). At review time
those 7 are **green** — `[id]/page.test.tsx` now pins Turkish (`:1625` `/Bu yanıt 0.075 kredi harcadı/`,
`:1681` `name: 'Tekrar dene'`) and the suite is 56/56 — while the single genuinely red assertion is in
`new/page.test.tsx`, F2's file, whose agent finished (report 01:01, review PASSED 01:35) *before* F7's
02:05 change and is therefore no longer mid-write. The coordination window F7 declared closed was open.

### F3 — FAIL, residue census incomplete: three same-class sites are missing from Open Question 3

The report names three sites of English user-facing text that reach the same rows. I measured **six**:

| Site                                            | Text                                                          | Named by the report? |
| ----------------------------------------------- | ------------------------------------------------------------- | -------------------- |
| `lib/chat/thread.ts:137`                          | `You are logged out — log in again, then press Retry.`        | yes                  |
| `lib/chat/thread.ts:148`                          | `The reply stopped unexpectedly. Try again.`                  | yes                  |
| `components/ui/use-chat-stream.ts:30-31`          | `ATTACHMENTS_UNSUPPORTED` = `Image sending is not connected yet, …` | yes            |
| `lib/chat/thread.ts:52`                           | `'The reply stopped unexpectedly.'` — `toChatStreamEvent`'s `t:'error'` fallback, which lands on `row.error` and is rendered by `chat-thread.tsx:36` | **no** |
| `components/ui/use-chat-stream.ts:120`            | `'The reply stopped unexpectedly. Try again.'` — the stream-catch branch, same row | **no** |
| `components/ui/thinking-trace.tsx:79,84`          | `Thinking` / `Thought` / `· took Ns` — rendered by the component under review | **no** |

`thread.ts:52` and `use-chat-stream.ts:120` are reachable (any `t:'error'` frame without a `message`
string, and any mid-stream read failure). This is the "fix only the call site that surfaced the
defect" pattern — the census that was supposed to enumerate the class enumerated two thirds of it.

### Non-findings (verified sound)

- The shipped copy itself is **correct and honest**, and the diff is exactly the four stated changes:
  `:36` fallback, `:42` control, `:58` cost-unknown, `:59` cost-known. The `creditsUnavailable ||
  credits === undefined` branch correctly refuses to print a fabricated `0`.
- Diff scope is clean: only `chat-thread.tsx` (+18/-9 region) and its own test. No manifest, lockfile,
  env, or git state touched. `chat-thread.module.css` is dirty but predates F7 (mtime 09-21 21:57) and
  is another agent's composer-ring work — not F7's.
- No i18n framework exists in the repo (`grep` for `next-intl|i18next|useTranslation|getTranslations`
  → empty; no `i18n` in either manifest), so the report's i18n exemption is correct.
- Real-path evidence is real: screenshot present, and the honest-cost branch is exercised by a green
  test in the consumer page (`[id]/page.test.tsx:1644-1657`).
- Vocabulary mirroring is genuine (`Tekrar dene` on `/dashboard/new/page.tsx:544` region predates F7),
  so the report's "mirrored, not invented" assumption is corroborated.

## Required corrections (narrow)

1. `app/dashboard/new/page.test.tsx:490` — retarget to `/Bu yanıt 1.1 kredi harcadı/`. F2's agent is
   finished; this is now a one-line, unowned-file fix.
2. Either extend the residue sweep (`chat-thread.test.tsx:24-31`) to the child's literals and fix
   `thinking-trace.tsx:79,84`, or rewrite criterion 2 and the guard's title (`:136`) to claim only what
   it checks. As written, the guard asserts English `Thinking`/`Thought` as expected in the same file
   it claims proves Turkish end to end.
3. Enumerate the three missing residue sites in the escalation (F3 table).

## Open Questions for Orchestrator

- `thinking-trace.tsx` is untouched at `HEAD` and outside F7's write scope. Is the shared thinking
  header part of this Turkish wave at all? If yes it needs its own task with `thinking-trace.test.tsx`
  in scope (that file pins `Thinking`/`Thought` at `:23,33,42,51,68`). If no, criterion 2's wording and
  the guard title must be narrowed.
- The `[id]/page.test.tsx:411` pin is still English (`You are logged out — log in again, then press
  Retry.`) and is green only because `thread.ts:137` is still English. When the residue work lands,
  that producer and this pin must move together.

## Dependencies Added

None.

## Public Interface Exposed

None — review only.

## Known Limitations

- I did not re-run F7's five-way guard-break matrix (it requires edits, which this review forbids). I
  cross-checked its failure counts against my own census of assertion sites per copy key (costKnown 3,
  costUnknown 3, retry 2, errorFallback 2) and found them consistent — evidence the matrix is honest,
  not a re-measurement.
- I did not drive a browser. The report's real-path run is corroborated by artifacts (screenshot,
  served-chunk negative control, green consumer test), not independently re-performed.
- The first `[id]` run showed 1 failure at `:245` (`Bu bot ne yapıyor` tab region) that disappeared on
  re-run and involves no chat copy; I treat it as a flake of F6's in-flight page, not an F7 defect.
