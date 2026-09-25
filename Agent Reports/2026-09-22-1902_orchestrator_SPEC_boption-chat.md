# SPEC — B-option chat-to-build + sticky layout (2026-09-22-1902)

Founder-locked 2026-09-22: option B (plain-text yes auto-starts the build, no
button hunt) + sticky bottom composer + sticky left rail. Founder amendment on
the trigger: a yes inside a LONGER sentence must ALSO fire (design's 20-char
cap is dropped by explicit founder order). Adjacency + user-role-only guards
stay — they are the accidental-spend protection.

Research basis: 8-agent workflow wf_b4773a02-ddd (3 maps + 4 research + 1
design synthesis, journal on file). Patterns copied: Lovable/v0/Bolt
say-build-it + auto-build-default, Anthropic Discord plugin `yes <id>` →
structured allow mapping, v0 Ask-mode confirmation vocabulary, shadcn
MessageScroller / assistant-ui inner-scroll shell. Do NOT rely on memory for
any of this — the contracts below are the source of truth.

## Locked contracts (all four tasks obey these; conflicts resolve toward this file)

### C1 — Ask line (verbatim lock)
After at most 2–3 short questions, the assistant posts a 2–4 bullet plan
summary ending with this EXACT line:
`Can I start? Reply yes to build.`
The auto-start matcher keys on the substring `Can I start?` in the
immediately-preceding assistant row (survives surrounding formatting).

### C2 — Trigger (fires auto-start) — ALL must hold
1. Newest message row is user-role. Assistant text, Retry rows, thinking
   traces, suggestion-chip fills NEVER fire (callers pass only user text).
2. The immediately-preceding assistant row contains `Can I start?`.
3. The user text contains a confirmation token as a STANDALONE word/phrase:
   case-insensitive, punctuation/emoji-insensitive, Unicode-aware
   word-boundaries (TR dotted/dotless I included). NO length cap — long
   sentences fire by founder order.
4. `botId !== null` (mint-race: a yes before mint lands is chat, not queued).
5. `runId === null` AND not already building AND no stream in flight
   (client once-guards: buildingRef + `building` state + runId short-circuit
   → double-send/StrictMode re-fire posts exactly ONE builder/start).
6. Server contract UNCHANGED (INSERT builder_runs queued → pg-boss send
   singletonKey=runId, retryLimit 3). No per-bot cross-run dedup in this
   slice — a second explicit yes after a terminal `failed` run may start a
   new run (billed separately); the hint copy says so.

### C3 — Confirmation allowlist (locked set, TR + EN)
`yes, yeah, yup, evet, ok, okay, tamam, olur, basla, başla, build it,
start build, start, go, go ahead, do it, yes please, hadi, hadi yap, yap,
oluştur, create it, let's go`
Word-boundary match (so `yesterday` does NOT fire on `yes`; `ok` inside
`joke` does NOT fire). Multi-word entries match with flexible inner
whitespace/punctuation.

### C4 — Progress source of truth
Existing `BuilderProgress` polling `GET /api/builder?runId=` every 2s,
phases queued→generating→syncing→live|failed. No client timers, no
optimistic phase jumps; live/failed stop polling. Inline section keeps
`aria-label="Build progress"` + `Follow the build` `?runId=` link.

### C5 — Gates stay honest, chat stays side-effect-free
`/api/chat` gates (401 → trial-clock 403 → 422 → 500 no-key → budget 403)
and `/api/builder/start` gates (401 → KI-033 trial 403 before body → 422 →
404 ownership → INSERT → enqueue-fail flips failed) are UNTOUCHED. A yes is
handled by the page calling builder/start, never by the chat lane.
Brief = stitchBrief user-turns-only 1..2000; assistant prose never enters it.
Errors surface verbatim in the existing buildError alert copy.

### C6 — Layout: inner-scroll shell, no position tricks
`.shell`: `min-height:100vh` → `height:100vh; height:100dvh;
overflow:hidden`. `.content` keeps `min-height:0`. Rail gets NO position
rule (flex sibling is inherently pinned once the page stops scrolling) —
only `min-height:0` so its foot stays visible. Explicitly NO
`position:sticky/fixed` anywhere (sticky overflow-ancestor + iOS
fixed-keyboard pitfalls). Keep the 900px column-stack breakpoint.
`.newScroll` (`flex:1; min-height:0; overflow-y:auto`) stays the ONLY
scroller; `.newAiBar` stays `flex:none` + gains
`padding-bottom: env(safe-area-inset-bottom)`.

## Tasks (disjoint write-scopes — all four run in parallel)

### T1 — Persona script (boption-persona)
- CREATE: nothing. MODIFY: `packages/ai/src/persona-prompt.ts`,
  `packages/ai/src/persona-prompt.test.ts`. Touch NOTHING else.
- Append a propose-then-ask block to `buildPersonaPrompt`: after at most
  2–3 short questions the assistant must post a 2–4 bullet plan summary
  ending with the C1 ask line verbatim. Keep describe-only + slash rule
  intact; no side-effect language.
- Acceptance: prompt text contains the C1 line verbatim; questions cap
  2–3 stated; existing tests green + new assertion on the ask line.

### T2 — Yes-matcher pure helper (boption-confirm)
- CREATE: `apps/web/lib/chat/confirm.ts`,
  `apps/web/lib/chat/confirm.test.ts`. MODIFY: nothing. If either file
  already exists, STOP and report PARTIAL — do not overwrite.
- Export `isBuildConfirmation(text: string): boolean` implementing C2-rule-3
  against the C3 allowlist: normalize (trim, lowercase incl. TR, strip
  punctuation/emoji), word-boundary contains-match, NO length cap.
- Acceptance: fires on `yes`, `evet`, `YES!`, `tamam, başla`,
  `yes, add XP roles too` (long-sentence fires — founder order),
  `oluştur`; does NOT fire on `yesterday's log`, `joke's on me`, ``,
  `maybe later`, assistant prose passed as text is irrelevant (caller-side).
  Unicode TR cases (`BAŞLA`, `oluştur`) covered. colocated test file green.

### T3 — New-chat auto-start + progress + composer pad (boption-newpage)
- MODIFY: `apps/web/app/dashboard/new/page.tsx`,
  `apps/web/app/dashboard/new/page.test.tsx`,
  `apps/web/app/dashboard/new/page.module.css`. Touch NOTHING else.
- Delete the `Build this bot` button block; replace with hint copy:
  `Describe, answer 2-3 questions, then type yes to start the build.`
  (plus one line: a yes after a failed build starts a fresh run).
- Add an effect watching `useChatStream` messages: when C2 rules 1–2–3
  hold on the newest user row AND C2 rules 4–5 hold, call the EXISTING
  `handleBuild` once (reuse stitchBrief + POST, unchanged). On success
  setRunId + status row `Build started — follow progress below.`; progress
  renders in the existing slot (BuilderProgress + `?runId=` link, C4).
  Errors → existing buildError alert copy (C5). `botId === null` wait shows
  `Saving your bot…` state instead of queueing the yes (mint race, C2-4).
- CSS: `.newAiBar` gains `padding-bottom: env(safe-area-inset-bottom)`.
  No chat-route or builder-route changes.
- Acceptance: test fires on long-sentence yes after ask line; silent on yes
  WITHOUT preceding ask line; silent while streaming/building;
  exactly-one-POST under re-render; button block gone; existing tests green.

### T4 — Inner-scroll shell pin (boption-shellpin)
- MODIFY: `apps/web/app/dashboard/layout.module.css`,
  `apps/web/components/ui/dashboard-rail.module.css`. Touch NOTHING else.
- Implement C6 exactly. Rail: add only `min-height:0` (no position rule).
- Acceptance: shell height-capped (`100vh` + `100dvh` fallback,
  `overflow:hidden`); 900px breakpoint intact; rail + composer pinned with
  page scroll eliminated on desktop width; full typecheck/lint/prettier
  green (no JS test — reviewer verifies live in browser).

## Standing scope guards (every task)
- Do NOT edit package.json/lockfiles/.env files or run npm install (declare
  needed deps in your report; the orchestrator installs centrally).
- Do NOT run any git command restoring from HEAD (no stash/checkout --/
  restore/reset) and do NOT commit. No SSH, no prod, no live keys.
- Never print/copy/transmit a secret value — presence by
  length/defined-only, never values in logs or reports.
- Do not change any dependency, version, or config to make things run.
  Report blockers instead.
- Read ONLY this SPEC file as report context. Do not scan Agent Reports/.
- Report filename schema:
  `Agent Reports/2026-09-22-1902_[agent-id]_[CREATE|MODIFY]_[component].md`
  with the fixed report structure (Status / Files Touched / Dependencies
  Added / Assumptions / Open Questions / Public Interface / Known
  Limitations).
