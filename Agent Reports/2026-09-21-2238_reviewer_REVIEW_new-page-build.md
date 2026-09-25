# Review Report: reviewer-ki036-newpage (ki036-newpage fix)

## Verdict
PASS

The ki036-newpage change meets its spec (§4 Agent A acceptance, §5 must-not-break).
All four functional criteria hold with file:line evidence below. Real gates run
from `apps/web` are green. One scope observation for the orchestrator (not a
failure of this task): the working tree contains unrelated uncommitted changes
outside this task's two files — detailed in §Scope so merged-tree gates can
account for them.

## Per-criterion evidence

### (1) Brief stitched from ALL user turns — PASS
- `apps/web/app/dashboard/new/page.tsx:52-60`: `BRIEF_MAX_CHARS = 2000` plus
  `stitchBrief(rows)` filters `role === 'user'`, trims each text, drops empties,
  joins with `'\n'`, `.slice(0, 2000).trim()`. Deterministic concat of on-screen
  state — no model call, no new network call (only fetch in `handleBuild` is the
  pre-existing `POST /api/builder/start`, page.tsx:158-162, shape unchanged
  `{ botId, brief }`).
- `firstBriefRef` deleted: grep for `firstBriefRef` across
  `apps/web/app/dashboard/new/` returns zero matches; the diff vs HEAD shows the
  `useRef` declaration and the `firstBriefRef.current = text` assignment removed.
- Mint-name derivation intact: `deriveBotName` unchanged (page.tsx:43-45);
  `mintOnce(text)` still derives the name from the first-submit text
  (page.tsx:91-92, 131-134).

### (2) Existing BuilderProgress inline, exact props — PASS
- `page.tsx:16` reuses the existing import; `page.tsx:239-244` renders exactly
  once, only when `runId !== null`:
  `<section aria-label="Build progress"><BuilderProgress runId={runId} />`
  plus the kept `?runId=` link (`/dashboard?runId=${runId}`).
- Props match `BuilderProgressProps` (`components/ui/builder-progress.tsx:137-142`:
  `runId`, optional `intervalMs = 2000` default) — no prop drift, no `intervalMs`
  override.
- No new timers / no faked phases: grep for
  `setInterval|setTimeout|requestAnimationFrame` in `app/dashboard/new/` returns
  zero matches. Polling lives entirely in the pre-existing hook
  (`builder-progress.tsx:61-124`, server-polled `GET /api/builder`, D-104
  compliant).

### (3) Preserved behavior — PASS
- Mint-on-first-submit + pendingBotId quiet-commit intact (page.tsx:84-89
  effect, page.tsx:91-124 `mintOnce`).
- Build disabled until `botId`: `disabled={botId === null || building}`
  (page.tsx:234).
- Copies verbatim: 401 `You are logged out. Log in again to start the build.`
  (page.tsx:164); 404 `This bot is not saved yet. Send a message and try again.`
  (page.tsx:168); trial-403 path via unchanged `readRefusalMessage`
  (page.tsx:35-41, 171-180); empty `Describe your bot in a few words before
  building.` (page.tsx:149); oversize `Keep the brief under 2000 characters.`
  (page.tsx:153 — dead code post-clamp since `stitchBrief` never exceeds 2000,
  acknowledged as defensive in the builder report; harmless, copy preserved).
- Hero copy unchanged (page.tsx:211-218). FORBIDDEN-words list intact in
  `page.test.tsx:14-32` (17 entries).

### (4) Tests pin the new behavior — PASS
- Stitched brief on POST body: `page.test.tsx:379-437` submits two user turns,
  asserts `POST /api/builder/start` body equals
  `{ botId, brief: 'A moderation helper\nIt should welcome newcomers' }`.
- Empty-thread error: `page.test.tsx:439-464` proves whitespace submit is a
  no-op (no chat/mint/build post, no alert); `page.test.tsx:466-505` proves the
  non-empty path posts and pins the guard copy in source (mutation-grade).
- Inline progress + link kept: `page.test.tsx:507-547` asserts the `?runId=`
  link href AND the existing `BuilderProgress` rendering the real server phase
  (`Generating`) inside `region` `Build progress`, with
  `fetch('/api/builder?runId=run-123')` observed.

### (5) Scope check — PASS for this task, with working-tree observation
- This task's footprint is exactly the two files: the `page.tsx` diff vs HEAD is
  confined to stitch/import/BuilderProgress/handleBuild/composer-shell hunks,
  all within the SPEC §4 Agent A scope.
- Working-tree observation (NOT attributable to this task — flagging for the
  orchestrator's merged-tree gates): `git status` shows unrelated uncommitted
  modifications also present in the tree, including
  `apps/web/app/api/chat/route.ts` (persona system-message injection +
  `PERSONA_MAX_OUTPUT_USD_PER_MTOKEN` 0.5→4.4), `packages/ai/src/*`,
  `apps/web/components/ui/*`, publish route, `package-lock.json` (manifest
  edit), and untracked `packages/ai/src/persona-prompt*.ts`. The builder report
  declares only the two in-scope files and states pre-existing composer changes
  were built upon per instruction — consistent with what the diff shows. No
  detail-page changes detected (`git status` for dashboard bots/detail paths is
  clean). The orchestrator should attribute the route/manifest/packages
  changes to their owning tasks (note: SPEC §4 forbids Agent B from touching
  `apps/web/**`, so the `route.ts` system-message hunk deserves an ownership
  check) before running merged-tree gates.

## Gate outputs (all run from `apps/web`, toolchain detected from package.json scripts)

| Gate | Command | Exit |
|---|---|---|
| typecheck | `npx tsc --noEmit` | 0 |
| eslint (touched path) | `npx eslint app/dashboard/new/` | 0 |
| prettier (both files) | `npx prettier --check app/dashboard/new/page.tsx app/dashboard/new/page.test.tsx` | 0 |
| vitest (touched path) | `npx vitest run app/dashboard/new` | 0 — 1 file, 26/26 passed |

All four scripts exist (`typecheck`, `lint`, `format`, `test` in
`apps/web/package.json:8-15`); the exact commands above were used rather than
assumed equivalents.

## Fix instructions
None — no FAIL findings. Recommended orchestrator follow-ups (not review
blockers): (a) attribute the `route.ts`/`packages-ai`/manifest hunks to their
owning tasks and confirm Agent B stayed out of `apps/web/**`; (b) merged-tree
gates + §6 live repro remain the wave-close bar.
