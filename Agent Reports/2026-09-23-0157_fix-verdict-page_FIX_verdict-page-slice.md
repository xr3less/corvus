# Task Report: fix-verdict-page

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx

No other file was created, modified or deleted. `apps/web/app/api/builder/verdict/route.ts`,
`apps/web/lib/chat/thread.ts` and `apps/web/components/ui/use-chat-stream.ts` were read-only context.
`page.module.css` shows as modified in `git status` from the earlier V3 wave — untouched by me
(verified: my hash on both of my files is unchanged except for my own edits; the CSS file is not in
my scope and I never opened it for writing).

## Dependencies Added
- None. No manifest, lockfile, version or config was touched, and no install was run.

## The defect and the fix

**Cause (measured, not assumed).** `page.tsx:128` (pre-fix) mapped every row through
`row.text.slice(0, VERDICT_TURN_MAX)` with `VERDICT_TURN_MAX = 500` — a head-only slice. The persona
prompt ends the plan turn with the ask line `Can I start?`, so a plan longer than 500 chars reached
`POST /api/builder/verdict` ask-line-less, the route's ask-line gate answered `409 no_plan_asked`,
and the page's 409 branch is silent by design: **"yes" started nothing and said nothing.** The route
side had already been fixed (it now accepts 2000-char turns and reads them through a kept-ends
`boundedView`); the page was the remaining break.

**Fix (mirrors the route, same marker — one helper, not a one-line patch):**

1. `VERDICT_TURN_MAX` 500 -> **2000**, matching the route's `TURN_MAX` and `POST /api/chat`'s
   `MESSAGE_MAX`. A plan turn is an ordinary chat turn; a page cap tighter than the route's can only
   slice one, never refuse one.
2. New `boundedTurn(text, max, tailMax)` helper (page.tsx:81) replaces the head-only slice. Text that
   already fits travels **byte-identical**; otherwise it keeps BOTH ends, dropping the middle behind
   the same `'\n…\n'` marker the route writes (`TURN_ELLIPSIS`, route's `ELLIPSIS`). The result is
   **exactly `max` characters**, so the request can never grow past the bound.
3. `VERDICT_TURN_TAIL_MAX = 500` mirrors the route's `PLAN_TAIL_MAX`, so the tail the page keeps is
   the tail the route's gate reads.

Keeping the shape identical to the route is the point: a page-capped turn and a route-capped turn now
read the same to the judge, and the two constants are documented as needing to stay in step.

**Preserved, deliberately and verifiably:** `VERDICT_TURNS_MAX` (12) and its `.slice(-12)` position;
the send ends at `lastUserIdx + 1` (trailing post-yes replies still excluded); the empty-row filter;
the POST shape `{ botId, turns }` with the same method/headers; the 409-silent branch; every guard
(`streaming || building || buildingRef.current`, `runId !== null`, `messages.length === 0`,
`judgedUserIdRef`, `botId === null`, the adjacency + `ASK_LINE` check); the no/`unclear`/`started:false`
silence; the gate-body refusal surface; the transport-throw fallback. The only changed line in the
effect is the `.map` body.

## Assumptions Made
- The page cannot keep the route's `boundedView` literally: the route exports only `POST` and its
  test seams, and importing a route module into a page would drag the route's `pg-boss` /
  `@corvus/ai` server graph into the client bundle. The helper is therefore reimplemented client-side
  with the same shape and a comment pinning it to the route's constants. Extracting one shared module
  is the right end state; it needs a new file, which is outside this task's two-file scope (flagged).
- 3000 (and the 12-row test) are the lengths that prove the bound; no attempt was made to test every
  length in between, since the helper is total and the boundary cases (in-bound / just-over-bound /
  far-over-bound) are covered.
- The guard-validation mutations were applied to a copy and the file restored byte-identically
  (SHA256 `c5673f0894583a2bb74fa38bea0a658f74d6e3523c3c5465608a5fd37c7061e6` before and after). No git
  restore/stash/checkout was used; the baseline copy lived outside the repo and was deleted after.

## Open Questions for Orchestrator
1. **Shared bound constants.** The per-turn bound (2000), the tail (500) and the marker (`'\n…\n'`)
   now exist in two files as literals, kept in step by comments and by tests. Adding a fourth turn
   length to either side without the other re-opens this exact defect. If a later wave owns
   `apps/web/lib/`, a tiny shared module holding `TURN_MAX` / `PLAN_TAIL_MAX` / the marker /
   `boundedView` (imported by both the page and the route) removes the class rather than this
   instance. Not done here — it needs a new file plus a route edit, both outside my scope.
2. **Enumerated same-class sites, for the record.** Every other `slice(0, N)` in `apps/web` was
   checked for this defect: `app/dashboard/bots/[id]/page.tsx:807` slices a *summary* field for
   `/api/spec/patch` (a different payload with no tail-carried meaning — excluded, reason: not a
   chat/verdict turn); `app/api/templates/[slug]/fork/route.ts:190` slices a derived diff-summary
   string (excluded: not user-authored content and nothing downstream reads its end). Neither shares
   the "the END of the text is what the consumer looks for" property that made this a defect.
3. The reviewer's Phase-3 real-path check is owed on the founder path: dev server -> `/dashboard/new`
   -> plan longer than 500 chars -> yes -> inline progress. My evidence is the page suite plus the
   mutation checks; no live provider, DB or dev server was exercised (all tests hermetic by design).

## Public Interface Exposed
No new exports. `NewBotPage`'s props and the rendered surface are unchanged. The module-private
`boundedTurn(text, max, tailMax)` is a pure helper.

The POST body contract, pinned by test: exactly two keys, `{ botId, turns }`; `turns` is at most 12
entries, each `{ role: 'user' | 'assistant', content }` with `content.length <= 2000`.

## Verification (evidence, not self-report)

Toolchain detected from `apps/web/package.json` (npm workspaces; `typecheck: tsc --noEmit`,
`lint: eslint`, `test: vitest run`, `format: prettier --check`).

- **Focused page suite:** `npx vitest run app/dashboard/new/page.test.tsx` from `apps/web` —
  **37 passed / 37** (30 pre-existing cases + 7 new: 4 declarations, one of them an `it.each` over
  three plan lengths). All pre-existing tests still pass; the only edit to an existing test is the
  extraction of the `ASK_LINE` constant (`PLAN_REPLY` is now built from it) and the 409 test being
  re-pointed at the shared driver — no existing assertion changed or weakened.
- **Page + route suites together:** 64 passed / 64 — the two sides of this contract are green
  together on the merged tree.
- **Full web suite:** `npx vitest run` from `apps/web` — **58 files, 761 passed, 69 skipped, 0
  failed.** (One earlier run of the same command hit a vitest worker crash,
  `exit code 3221226505`, in `app/api/bots/[botId]/activity/route.test.ts`; that file passes alone
  (20 passed / 3 skipped) and the full suite is green on re-run. Environmental and unrelated to my
  two files — named, not touched.)
- **Root gates on the merged tree:** `npm run typecheck` exit 0 (all three workspaces);
  `npm run lint` exit 0 (`eslint . --max-warnings 0`); `npm run format` exit 0;
  `eslint --max-warnings 0` and `prettier --check` on both touched files clean.
- **Guard validation — the new tests were broken and watched to fail.** The faithful pre-fix state
  (`VERDICT_TURN_MAX = 500` **and** head-only `slice(0, max)` — the exact original defect) was applied
  and the suite run: **6 of the 7 new tests fail**, on the right names —
  501-char plan, 1500-char plan, 2000-char plan, keeps-both-ends, travels-untouched, and
  unchanged-when-it-fits. The file was then restored byte-identically (hash verified equal, `cmp`
  clean) and the suite re-run green. A second mutation (head-only at the new bound of 2000, leaving
  the constant raised) fails the keeps-both-ends test alone — so the kept-ends view is load-bearing
  independently of the widened constant. **A guard that has been broken and watched to fail is the
  only guard that counts.**
- **What the tests assert (the defect, end to end).** A 501/1500/2000-char plan turn whose ask line
  sits at the END — each also asserted to be a plan the old 500-char head slice *would* have stripped
  — reaches the POST body with the ask line intact and no 409. A 3000-char plan turn is capped at
  exactly 2000 chars, with head and tail both verified to the character at the head/tail boundary and
  the middle dropped. An in-bound 1200-char turn travels byte-identical. A 14-row thread still sends
  exactly 12 rows, ending at the judged user row, none over 2000.
- **No secrets:** the diff contains no credential values and the scan for key/token/secret patterns
  over both files returns only prose matches. No prod, box, GHCR, `.env` or key contact of any kind.

## Known Limitations
- **No live-path evidence.** The page suite is hermetic (stubbed fetch, no dev server, no provider,
  no DB). Per the brief, the founder-facing confirmation — plan over 500 chars, "yes", build starts —
  is the reviewer's Phase-3 check, and it is still owed.
- The bounds now live in two files as literals with no shared source; tests and comments pin them,
  but nothing *enforces* the two staying equal at compile time (Open Question 1). A future change to
  either constant is a place where this defect can return.
- The turns-count bound (12) is still a client concern only, unchanged by this task.
- The 12-row test drives 7 submissions and so re-renders the whole page thread seven times; it is the
  slowest test in the file (still well under a second), which is acceptable for the contract it pins.
