# SPEC: KI-036twin detail-page twin (thread ignored by Save/Start, link-only progress)

Status: SPEC — authorized under the founder's standing order ("sorunu çözene kadar
durma") plus "Onu da aynı şekilde çözelim mi?" answered by "Continue" (2026-09-21).
Parent: `Agent Reports/2026-09-21-2238_orchestrator_SPEC_new-chat-build.md` §8, which
named exactly this twin as follow-up work (not a limitation note).
Timestamp: 2026-09-21-2343 (real clock, `date +"%Y-%m-%d-%H%M"`). PLAN ref: Phase 2d,
KI-036 follow-up (detail twin, open). KNOWN_ISSUES KI-036 row notes this follow-up.

## §0 What happens today (evidence, not memory)

Detail page `apps/web/app/dashboard/bots/[id]/page.tsx` (all refs verified 2026-09-21):

- The chat thread exists: `useChatStream(bot?.id ?? null)` at :251, user rows +
  `ChatAssistantRow` rendered at :1113-1130. Submits stream via `POST /api/chat`
  exactly like the new page.
- The composer is dual-purpose: `PromptInput value={draft} onChange={setDraft}
  onSubmit={(value, meta) => submit(value, meta.attachments)}` (:823-829). Pressing
  Enter chats AND clears the box (`ai-chat-input.tsx:610-624` clears through
  `onChange('')` → `setDraft('')`); typing without pressing Enter leaves text in
  `draft` with an empty thread.
- `runSaveDraft` (:704-758) reads ONLY `draft.trim()` (:707) and posts
  `POST /api/spec/patch { botId, baseVersion, behaviors: [...old, { kind:'note',
  title:'Note', detail:text }], summary: text.slice(0,500) }`. The streamed thread
  (`messages`) is never read — AI-refined conversation never becomes a behavior.
- `runStartBuild` (:763-807) reads ONLY `draft.trim()` (:765) and posts
  `POST /api/builder/start { botId: writeBotId, brief }`. Same discard as R1, on
  the second surface. (Route contract: brief 1..2000 chars, `start/route.ts:142-145`.)
- Both buttons gate on the composer only: Save `:1147`
  `disabled={savingDraft || draft.trim().length === 0}`, Start `:1155`
  `disabled={startingBuild || draft.trim().length === 0}`. A user with a full
  thread and an empty composer sees two disabled buttons — the thread alone can
  never start anything.
- Success renders link-only: `startedRunId` (:279) shows
  `<p role="status">Build started. <a href=/dashboard?runId=…>Follow the build</a></p>`
  (:1180-1185). No `BuilderProgress` import or usage on this page (grep-proven:
  zero hits) — the R2 exile, repeated.
- New page (closed wave, DO NOT TOUCH): local `stitchBrief` (`new/page.tsx:52-60`),
  `handleBuild` posts the stitched thread (:144-193), inline `<section
  aria-label="Build progress"><BuilderProgress runId/> + ?runId= link` (:239-244).

## §1 Root causes (twin of R1/R2, same defect class)

- T1 Conversation discarded on detail: Save and Start read the composer box only.
  Thread content (user turns) never reaches `/api/spec/patch` or `/api/builder/start`.
- T2 Progress exiled on detail: a started build yields a link, not the live
  server-polled stepper, although the `BuilderProgress` component already exists
  and is proven on the new page.

## §2 Locked contract (what SHOULD happen)

- 08 §1 + parent §2 unchanged: words → versioned draft → simulate → publish is a
  pointer move; spec is data. Detail page is Stage-2 Refine; writes stay honest.
- Patch route contract (untouched, `lib/editor/drafts.ts:56-91`): behaviors must be
  a non-empty array, summary a non-empty string, botId a uuid (else 404); 409 stale
  base retries via `refreshDraft`. No route file changes in this task.
- Builder start contract (untouched, `start/route.ts:106-146`): brief 1..2000 chars;
  401/404/honest errors. No route file changes in this task.
- D-104: progress rows are server truth only — reuse `BuilderProgress`, no new
  timers, no faked phases. Chat route stays side-effect-free (no builder logic
  smuggled into `/api/chat`).

## §3 OSS patterns (researched 2026-09-21 in the parent SPEC — reuse, don't re-derive)

Parent §3 (Lovable explicit-Build, v0/Next.js queued side-effect + server-owned
runId, fetch-POST SSE with run-outlives-tab, tool-only actions + provenance
boundary) with its live URLs applies verbatim. Cite the parent SPEC; run a fresh
web search ONLY if you deviate from it.

## §4 The task (ONE agent, no parallelism — single owner set)

Agent D — ki036twin-detail (MODIFY):

1. **Shared stitch helper** in `apps/web/lib/chat/thread.ts` (exported + named, §3.4):
   `stitchBrief(rows: { role:'user'|'assistant'; text:string }[], current?: string,
   maxChars = 2000): string` + `BRIEF_MAX_CHARS = 2000`. Semantics (mirror the
   proven new-page function): user-turn texts in send order, trimmed, non-empty
   only; append `current.trim()` when non-empty; join with `\n`; clamp to
   `maxChars`; trim. Assistant rows never contribute (model prose is not
   requirements). Returns `''` when there is nothing. Leave the new page's local
   copy EXACTLY as-is (closed wave — dedup is a later task, not this one).
2. **Detail page** (`bots/[id]/page.tsx`):
   - `runSaveDraft`: `text` becomes the combined thread+composer
     (`stitchBrief(messages, draft)`); behaviors/summary/baseVersion/409-retry/notes
     logic otherwise byte-identical. Empty combined → same silent return as today.
   - `runStartBuild`: `brief` becomes `stitchBrief(messages, draft)`; length guards
     and ALL user-facing copy (empty/too-long/mock-id/401/404/generic) verbatim.
   - Buttons: Save enabled iff `!savingDraft && combined.length > 0`; Start enabled
     iff `!startingBuild && combined.length > 0` (compute `combined` once per render).
   - Progress: import the EXISTING `BuilderProgress`; on `startedRunId` render
     `<section aria-label="Build progress"><BuilderProgress runId={startedRunId} />
     <a href={/dashboard?runId=…}>Follow the build</a></section>` (new-page shape,
     detail link text kept). Keep the `[bot]`-change reset that clears
     `startedRunId` (:404-421). No CSS file changes — reuse existing classes only.
   - Do NOT add trial-403 message parsing, do NOT change error copy, do NOT touch
     simulate/scan/publish/rollback/invite/activity code.
3. **Tests**: extend `bots/[id]/page.test.tsx` (existing composer-only Save/Start
   tests MUST keep passing — empty thread + filled composer still works), plus new:
   (a) 2-turn chat thread + composer text → Save patch body `detail`/`summary`
   contain the stitched user texts in order (reuse the file's existing
   `sseStream`/`streamResponse`/`frame` helpers for the `/api/chat` stub);
   (b) same setup → Start `brief` equals the stitched combination;
   (c) thread non-empty + composer empty → Save and Start buttons have
   `disabled === false` (property check, not a matcher);
   (d) mocked start-OK → `section[aria-label="Build progress"]` renders AND the
   `Follow the build` link keeps its exact href.
   Unit tests for `stitchBrief` in `lib/chat/thread.test.ts`: order, trim,
   assistant/empty skipped, current appended, 2000-clamp, `''` when empty.
4. Before writing code, read the relevant guide in
   `apps/web/node_modules/next/dist/docs/` (repo AGENTS.md: this Next.js has
   breaking changes vs training data) and heed deprecations.
5. Gates on touched paths: `tsc` clean, ESLint clean, Prettier clean, both vitest
   files green.

| May MODIFY (4 files) | Must NOT touch |
|---|---|
| `apps/web/app/dashboard/bots/[id]/page.tsx`, `.../[id]/page.test.tsx`, `apps/web/lib/chat/thread.ts`, `apps/web/lib/chat/thread.test.ts` | everything else — esp. `dashboard/new/*`, `packages/ai/**`, any `api/**` route, styles, manifests |

No manifest edits, no installs (declare deps in report; orchestrator installs
centrally). No git restore commands (`stash`/`checkout --`/`restore`/`reset`).
Commit nothing, push nothing, deploy nothing, migrate nothing.

## §5 Locked must-not-break list

KI-033 gates + fail-open clock; trial copy verbatim; FORBIDDEN-words list +
no-model-names assertions in the detail test; patch builder-start shapes
(`{botId, brief}`, patch `{botId, baseVersion, behaviors, summary}`); `?runId=`
link + `Follow the build` text kept; progress server-truth only; chat stays
side-effect-free; new page + prompt + worker/publish/simulate untouched.

## §6 Acceptance (twin-close bar)

1. Fresh reviewer PASS (toolchain-detected, real commands, §7).
2. Merged-tree `tsc`+ESLint+Prettier+vitest green (orchestrator run).
3. POST bodies prove the stitch: patch `detail`/`summary` and builder `brief`
   carry thread user-turns in order plus composer text; composer-only behavior
   preserved (old tests green unmodified in intent); inline progress renders the
   real `BuilderProgress` with the real runId and keeps the exact link.

## §7 Review + recovery

Fresh reviewer (spec + builder report + 4 touched files; detect real toolchain,
never assume; verify artifacts exist on disk). Fail → fix agent with a changed
prompt, never a verbatim retry. 3rd failed review → STOP, escalate to founder
with 2 options. Any interface drift vs this SPEC → SPEC is truth; drifted side
re-spawns.

## §8 Scar-tissue steps applied

- Fix the class (§1 names T1/T2 as the same R1/R2 class on the second surface;
  §4-1 puts the helper in the shared module, exported + named, instead of a
  second route-local copy).
- Instruction-as-bug: the button-enable rule is written explicitly (§4-2) because
  "thread counts" stated only in prose would not move the `disabled=` lines.
- Validate the instrument: §6-3 demands POST-body proof, not gate-green alone;
  stitch tests assert literal content, not topics.
- Merged tree is a different artifact: §6-2 runs gates on the merged tree.
