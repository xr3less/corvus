# SPEC — AI verdict + AI-written build brief (2026-09-22-1939)

Founder-locked 2026-09-22 (2 messages): the word-list trigger is WRONG direction.
The model decides from the conversation whether the user accepted the plan, and
the model writes the builder brief from what the user actually wants. A bare
"yes"/"ok" alone NEVER starts anything. This SPEC supersedes the trigger parts
of `Agent Reports/2026-09-22-1902_orchestrator_SPEC_boption-chat.md` (C2, C3).
Everything else in that file stands (C1 ask line, C4 progress, C5 gates, C6
shell pin — shell pin already DONE and green).

## The shape (locked)

The chat lane gains a narrow tool: after the assistant posts the plan + ask
line, the NEXT user reply is judged by the MODEL (cheap single call on the
existing persona lane, structured yes/no/unclear JSON, capped input), not by
word matching. Verdict `yes` → the SAME model call (or one follow-up on the
same lane) writes a BUILD-BRIEF: 3–8 tight requirement lines distilled from
the whole thread (user wants + answers + confirmed plan, defaults marked).
The page POSTs that brief to the EXISTING /api/builder/start (unchanged
contract: botId + brief 1..2000, all KI-033 gates untouched). Verdict
`unclear` → no POST; the assistant asks one clarifying question. Verdict
`no` → normal chat continues.

Two spend rails: (1) verdict+brief calls ride the persona lane (cheapest),
metered as persona-run spend like any chat turn — no new billing path;
(2) the brief sent to builder/start is capped 1..2000 chars exactly as today,
so the builder billable ceiling (3 attempts/run) cannot move.

Why server-side, not client: the verdict must see the full thread + the plan
it judges, and the brief must be model-written (stitched user-turn concat
ships raw chat including chit-chat and misses what the plan confirmed). The
client keeps only once-guards (no double-POST); it never decides meaning.

## Tasks (disjoint write-scopes — order matters only where stated)

### V1 — Verdict + brief prompt builders (aibuild-prompts)
- CREATE: nothing. MODIFY: `packages/ai/src/persona-prompt.ts`,
  `packages/ai/src/persona-prompt.test.ts`. Touch NOTHING else.
- Add two exported pure string-builders beside buildPersonaPrompt:
  `buildVerdictPrompt(planText, userReply)` and `buildBriefPrompt(threadText)`.
  Verdict prompt: judge whether userReply accepts the plan in planText;
  answer with EXACTLY one JSON object `{"verdict":"yes"|"no"|"unclear"}`,
  no other text; `unclear` when hedged/conditional/off-topic; never treat a
  bare greeting as yes. Brief prompt: distill 3–8 requirement lines from the
  thread (wants + answers + confirmed plan items, defaults marked
  `[default]`), plain verbs, no code, no token talk, ≤1500 chars of output
  instruction. Both carry the Corvus no-code/no-token prohibitions in one
  line each.
- Tests: verdict prompt contains the JSON schema + unclear rule; brief
  prompt contains the 3–8 line rule + `[default]` marking + char-cap ask.
  Keep ALL existing assertions green (incl. the C1 ask line).
- Acceptance: vitest green, eslint+prettier clean, added prompt lines small
  (token discipline — verdict input capped by caller, see V2).

### V2 — Verdict + brief API route (aibuild-route)
- CREATE: `apps/web/app/api/builder/verdict/route.ts`,
  `apps/web/app/api/builder/verdict/route.test.ts`. MODIFY: nothing. If
  either exists, STOP → PARTIAL.
- `POST /api/builder/verdict { botId }`: session 401 (fail-closed) →
  KI-033 trial-clock 403 BEFORE body (same order as builder/start) →
  422 (botId must be uuid) → 404 ownership (same bots query incl.
  soft-deleted exclusion) → load last ~12 thread turns (server's own
  source: interview_progress or messages store — READ-ONLY, whichever the
  repo already has; if none exists server-side, accept `{ turns }` in the
  body capped at 12 × 500 chars and note it in the report) → require the
  last assistant turn to contain `Can I start?` else 409 `no_plan_asked`
  → ONE model call on the persona lane with buildVerdictPrompt (input
  capped: plan ≤1000 chars, reply ≤500 chars) → parse strict JSON
  (`{"verdict":...}` only; unparseable = `unclear`) → if `yes`, SECOND
  model call with buildBriefPrompt (thread ≤3000 chars) → clamp brief to
  1..2000 (slice+trim; empty after clamp = 422 `empty_brief`) →
  INSERT builder_runs + pg-boss send IDENTICAL to builder/start (same
  queue, singletonKey=runId, retryLimit 3; enqueue-fail flips failed via
  the same markEnqueueFailed shape) → 200 `{ runId, phase:'queued',
  verdict:'yes', briefChars }`. If `no`/`unclear` → 200
  `{ verdict, started:false }` with NO row and NO job. Both model calls
  metered as persona-run spend (reuse recordChatSpend shape; failures
  swallowed like chat). NO new billing path, NO gate reordering.
- Tests: 409 when no ask line; no-row-no-job on unclear/no (assert via
  mocked pool: zero INSERT); strict-JSON fallback (garbage model output →
  unclear, no throw); brief clamp (3000-char thread → brief ≤2000);
  401/403-before-body/422/404 mirror builder/start. Mock the lane +
  pool — never hit a live provider or DB in tests.
- Acceptance: route test file green; eslint+prettier clean; no secret
  handling (no keys read here — the lane owns keys).

### V3 — New-page wiring + retire word-list (aibuild-newpage)
- Depends on V1 + V2 landed (import nothing that does not exist; if the
  verdict route file is absent, STOP → PARTIAL).
- MODIFY: `apps/web/app/dashboard/new/page.tsx`,
  `apps/web/app/dashboard/new/page.test.tsx`,
  `apps/web/app/dashboard/new/page.module.css`. DELETE (file deletions):
  `apps/web/lib/chat/confirm.ts`, `apps/web/lib/chat/confirm.test.ts`
  (retired by founder order — the model decides now, not the list).
- Page: DELETE the `Build this bot` button block → hint copy:
  `Describe, answer 2-3 questions, and say yes when the plan looks right —
  the assistant starts the build itself.` + failed-run note. ADD effect:
  when the newest row is a user row AND the preceding assistant row
  contains `Can I start?` AND botId !== null AND runId === null AND not
  building AND no stream in flight → POST /api/builder/verdict { botId }
  once (buildingRef once-guard + runId short-circuit; double-send posts
  exactly ONE verdict call) → `started` → setRunId + status row
  `Build started — follow progress below.` (existing BuilderProgress slot,
  aria-label + ?runId= link kept) → `verdict:no/unclear` → stay silent
  (the assistant's own clarifying reply is the UI) → error statuses surface
  via existing buildError copy. botId === null → `Saving your bot…`, no
  POST. CSS: `.newAiBar` += `padding-bottom: env(safe-area-inset-bottom)`.
- Tests: verdict-started sets runId with ONE POST; no-plan-asked silent;
  unclear silent with no runId; while-streaming silent; re-render single
  POST. Existing assertions kept green (update only what the button
  removal structurally requires).
- Acceptance: page tests green; eslint+prettier clean; no reference to
  `@/lib/chat/confirm` remains anywhere in apps/ (grep-proven);
  confirm.* files gone from disk.

### V4 — Independent review gate (aibuild-reviewer)
- Runs AFTER V1+V2+V3 all report SUCCESS. Fresh context: read the SPEC +
  the three builder reports + the touched files only.
- Verify in order: (1) real toolchain gates on the MERGED tree (detect
  from package.json scripts — npm workspaces: root typecheck/lint/format +
  per-workspace tests; never assume names); (2) verdict contract live:
  no-plan → 409, unclear → no row/no job, garbage model JSON → unclear,
  brief ≤2000, enqueue-fail → failed row; (3) mutation sense: break the
  ask-line check and watch a test go red; break the clamp and watch a
  test go red (LESSONS §4.1/§4.9 — a guard never broken is not a guard);
  (4) page flow with the real entry point (dev server + dev-login console
  line, /dashboard/new: plan → yes → inline progress OR honest error;
  LESSONS §2.2/§2.4 — name the human + flow); (5) confirm.* deletion +
  zero remaining imports; (6) no secret values in any report/log.
- Output: `Agent Reports/2026-09-22-1939_reviewer_REVIEW_aibuild.md`
  verdict PASS/FAIL with file:line findings. If FAIL → ONE fix wave
  (max 3 loops, then escalate).

## Standing scope guards (every task)
- Do NOT edit package.json/lockfiles/.env files or run npm install
  (declare deps in report; orchestrator installs centrally).
- Do NOT run any git command restoring from HEAD (no stash/checkout --/
  restore/reset) and do NOT commit. No SSH, no prod, no live keys.
- Never print/copy/transmit a secret value — presence by
  length/defined-only, never values in logs or reports.
- Do not change any dependency, version, or config to make things run.
  Report blockers instead.
- Read ONLY the files named in your REQUIRED CONTEXT. Do not scan
  Agent Reports/.
- Report schema (Status / Files Touched / Dependencies Added /
  Assumptions / Open Questions / Public Interface / Known Limitations);
  filenames:
  `Agent Reports/2026-09-22-1939_[agent-id]_[CREATE|MODIFY]_[component].md`
