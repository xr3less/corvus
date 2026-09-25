# Task Report: fix-botdetail-draft

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.tsx
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx

## Dependencies Added
- none

## Assumptions Made

- **DEFECT 1 — chose option (a), "use the freshly refreshed draft data
  directly".** The task allowed either (a) or (b); `refreshDraft` could be made
  to return the data, so (a) was taken. The save now appends the note to the
  behaviors the read RETURNED, never to `(draftBehaviors ?? [])`. Reproduced
  first: the old code posted a note-only head over a server draft holding two
  behaviors (`expected [ { kind: 'note', …(2) } ] to deeply equal
  [ { kind: 'welcome', …(1) }, …(2) ]`).
- **A false 404 was the blocker for a pure (a) fix.** `refreshDraft` originally
  collapsed every failure to `null`, so a 404 could not be told apart from a
  500/abort. Under "always append" semantics that would have *invented* a head
  for a bot that has none (base = 1) and posted a phantom v1. The read now
  reports three outcomes — `loaded` / `absent` / `unreadable` — so only a
  **definitive** `404 no draft yet | not found` proceeds without a base; an
  unreadable read refuses the save with the honest retry line. This is stricter
  than "never POST a note-only replacement" while still letting the two genuine
  no-draft cases keep their existing copy.
- **DEFECT 3 — the twin's `error` leg is deliberately NOT taken.** The spec said
  to mirror `readRefusalMessage` (new/page.tsx:49-55) "prefer `message`, fall
  back to `error`, else the generic". Taken literally on this surface that leg
  would surface a machine code: this route answers 500 with
  `{ error: 'could not start build' }`, and the page's own locked test
  ("a failed start shows the honest error …") requires that to render
  `'Could not start the build — try again.'`. Every `error` value this route can
  emit is a code, so the `error` leg is unreachable-with-a-good-outcome here.
  The helper therefore reads `message` and falls through to the existing generic
  line, which satisfies both locked requirements. The comment on the helper
  records this. **Flagged for the orchestrator in case the SPEC intended the
  literal mirror; say the word and I will add the `error` leg (one line).**
- **DEFECT 2 — rendered honestly disabled rather than wired.** `/interview`
  exists and `/api/interview/*` is live, but `app/interview/page.tsx` starts a
  **new** round from a typed bot name: it takes no `botId`, and `handleStart`
  posts `{ botName }` only. There is no resume path, so wiring this button would
  have started a second, unrelated interview — a worse lie than a disabled
  button. Disabled with the repo's own marker (`disabled aria-disabled="true"
  title="Coming soon"`, the Upgrade control's shape) and labelled
  `Continue interview · Coming soon` so the label itself is honest in the a11y
  tree and in tests.
- `refreshDraft`'s return type change rippled to three other callers
  (`runPublish`, `runRollback`, plus the two 409 handlers). All were updated to
  the new discriminated shape; **no behaviour change was intended there** and
  their existing tests still pass.

## Open Questions for Orchestrator

- Confirm the DEFECT 3 deviation described above (message-only, no `error`
  fallback) — or ask for the literal mirror.
- Confirm the DEFECT 2 label change to `Continue interview · Coming soon`. It
  changes a user-visible string; the alternative (keep the bare label, add only
  the disabled attributes) is a one-line revert if the founder prefers the
  shorter label.
- **Unrelated but observed:** the full `npm test` run is currently NOT green
  because of files owned by other agents in this wave —
  `lib/chat/thread.ts` + its test (2 failures: `readHttpError` returning codes
  instead of the locked sentences) and `app/api/builder/verdict/route.ts`
  (4 typecheck errors: `VERDICT_MAX_TOKENS` / `BRIEF_MAX_TOKENS` used before
  declaration; the file is still untracked). Both are mid-edit by peers — they
  passed in isolation and the failing set changed between two runs of the same
  suite. **Not caused by this task**; flagged so the merge gate is not read as
  mine.

## Public Interface Exposed

No exported API. Two module-local changes inside `app/dashboard/bots/[id]/page.tsx`:

```ts
type DraftRead =
  | { status: 'loaded'; version: number; behaviors: unknown[] }
  | { status: 'absent'; error: string }
  | { status: 'unreadable' };
async function refreshDraft(botId: string, signal?: AbortSignal): Promise<DraftRead>

function readRefusalMessage(payload: unknown): string | null  // message-only
```

Rendered change: the action-row button `Continue interview` is now
`Continue interview · Coming soon`, `disabled aria-disabled="true" title="Coming soon"`.

## Known Limitations

- **The running app was not exercised by me.** Gates (typecheck on my files,
  ESLint, Prettier, focused suite) are green, but per this repo's own rule green
  gates are claims, not evidence. The three flows (save-with-empty-cache,
  trial-403 start, the disabled button) were proven at the component level with
  jsdom + mocked routes only. A human/browser pass over the real page is still
  owed before this is called done.
- The disabled button has **no CSS treatment**: `page.module.css:105`
  `.ghostAction` has no `:disabled` rule, so it renders visually identical to an
  enabled button (it is disabled to the a11y tree, to the cursor and to clicks,
  but the pixels do not yet say "not available"). The CSS file was outside my
  two-file scope, so I did not touch it — **this is the honest gap in DEFECT 2**
  and belongs to whoever owns `page.module.css`.
- The `.ghostAction:active { transform: scale(0.98) }` rule still applies on
  mouse-down; a disabled button does not receive pointer events for `:active` in
  browsers, so this is theoretical rather than observed.
- The save guard refetches the draft only when the local cache is empty; a save
  that races a *concurrent* writer in the same turn as a successful mount load
  is still resolved by the route's 409, exactly as before. That path was already
  correct and is unchanged.
- `readRefusalMessage` is duplicated rather than shared. Sharing it would mean
  editing `app/dashboard/new/page.tsx` or adding a module, both outside scope;
  the divergence is intentional and documented in-file.
