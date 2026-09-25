# Orchestrator Spec — Intent-Based Start (Option 1: plan-offer state, no string gates)

Timestamp: 2026-09-25-1553. Founder decision: "Niyetle başla" + "1.den basla bakalim onayliyorum".
Phase: Planning (done) → Implementation (this spec) → Testing (review gate + live probe).

## 1. Problem (one paragraph)

The new-bot chat loops the plan instead of starting the build. Root cause, evidenced by the
2026-09-25 research council (4 agents, 445k tokens, live repo sources): TWO independent string
gates must both match — the page's `isPlanAsk` adjacency check
(`apps/web/app/dashboard/new/page.tsx:277-278`, ASK_LINES `:71`) and the route's `askedToStart`
ask-gate (`apps/web/app/api/builder/verdict/route.ts:604-608`, ASK_LINES `:151`) — plus the
persona prompt's repost-on-acceptance rule (`packages/ai/src/persona-prompt.ts:44`) which answers
a paraphrase approval ("baslat", "yap", "sen karar ver") with ANOTHER plan instead of letting a
verdict POST happen. Any paraphrase misses at least one gate and the plan re-renders forever.

## 2. OSS grounding (why Option 1 — do NOT rely on memory, these were verified 2026-09-25)

Surveyed, all permissive-licensed (MIT or Apache-2.0, raw LICENSE files fetched — attribution
required if code is copied, idioms need none): OpenHands/OpenHands + software-agent-sdk (MIT),
cline/cline (Apache-2.0), continuedev/continue (Apache-2.0), Aider-AI/aider (Apache-2.0),
huggingface/smolagents (Apache-2.0). Plus orchestration patterns: langchain-ai/langgraph (+
supervisor-py), openai/openai-agents-python, crewAIInc/crewAI, microsoft/autogen (code MIT via
LICENSE-CODE; prose CC-BY — copy code, not prose).

HEADLINE FINDING: none of the five detect approval by matching magic words. All use explicit
state — a mode flag (Cline `mode = plan|act`, `togglePlanActModeProto.ts`), a slash command
(OpenHands `/plan` → ReadOnlyPlanningAgent delegate, `/execute` → AgentFinishAction, PR #10439),
a permission-policy override (Continue `PLAN_MODE_POLICIES`/`AUTO_MODE_POLICIES`,
`ToolPermissionService.switchMode()`), a y/n keystroke (Aider `confirm_ask()`, `io.py`), or a
numeric menu (SmolAgents `interrupt_after_plan()` 1=approve/2=modify/3=cancel). "Yap dedin mi
yapiyor" works there because once the session state says a plan is offered, the next user message
IS routed to the decider — authorization-by-context, never a keyword gate.

Chosen design (smallest change fixing the whole CLASS — LESSONS §3: both string gates go together,
never one call site): explicit plan-offer state by POSITION + the existing model-emitted verdict
object `{verdict: yes|no|unclear}` acted on by the verdict-route supervisor. Grounded in:
(1) SmolAgents step-callback gate (`examples/plan_customization/plan_customization.py` —
approve=yes/enqueue, modify=no+clarifier, cancel=unclear/no-op);
(2) Continue AskQuestion suspension (`extensions/cli/src/tools/askQuestion.ts` — the verdict call
is the same suspension point, returning the verdict object into the supervisor);
(3) OpenHands WAITING_FOR_CONFIRMATION loop (`04_confirmation_mode_example.py`,
`get_unmatched_actions`/`reject_pending_actions` — pending decision → judge → act-or-reject, but
the decider is the model verdict object per founder INTENT-BASED lock, not a risk threshold).

## 3. Contracts (source of truth — integration mismatches resolve in favor of THIS section)

### 3a. Client — `apps/web/app/dashboard/new/page.tsx` (owner: agent newpage-c)
- DELETE: `ASK_LINES` (:71), `TURKISH_FOLD` (:75-84), `foldTurkish` (:86-91), `isPlanAsk` (:94-97).
- REPLACE the adjacency gate (:277-278)
  `if (!prev || prev.role !== 'assistant' || !isPlanAsk(prev.text)) return;`
  with position-based plan-offer state:
  `if (!prev || prev.role !== 'assistant') return;`
  The turn immediately before the last user reply being an assistant turn IS the plan offer.
  No content check, no diacritic folding, no substring search anywhere in this file.
- KEEP byte-identical: all once-guards (`mintAttemptedRef`, `buildingRef`, `judgedUserIdRef`,
  `verdictFailedUserIdRef`, `runFailedRunIdRef`/`latchRunIdRef`), the turns-tail construction
  (slice `-VERDICT_TURNS_MAX`, `boundedTurn` cap, ending at the judged user row), the POST shape
  `{ botId, turns }`, all render branches, and ALL Turkish product strings
  (`MINT_FALLBACK_ERROR`, `START_FALLBACK_ERROR`, `PLAN_MISSING_MESSAGE`, `VERDICT_HINT`, hero,
  explainer, placeholder, cost, chips, back link).
- Header comment (:1-21) MUST be rewritten to describe the position-based trigger (it currently
  documents the ask-line contract being deleted).
- Owns test file `app/dashboard/new/page.test.tsx`: remove ask-line verbatim assertions; add:
  any assistant-prev → POSTs once; no re-POST for the same judged row; M-8 transport re-arm and
  M-9 failed-run fresh-verdict behavior preserved.

### 3b. Server — `apps/web/app/api/builder/verdict/route.ts` (owner: agent verdict-b)
- DELETE: `ASK_LINES` (:151), `askedToStart`, and the ask-line
- RENAME (behavior identical, deletion would break language detection): `foldAskText` → `foldTurkish`, `TURKISH_FOLD` → `FOLD_TO_ASCII`. `deriveLanguage` → `isTurkishText` → fold chain MUST stay intact — it feeds the judge's Turkish guidance. A future agent reading "delete TURKISH_FOLD" literally would silently break Turkish detection (spec corrected 2026-09-25-1625 after verdict-b/review findings).
  409 gate (:604-608). REPLACE with: 409 `no_plan_asked` fires ONLY when the posted turns contain
  zero assistant turns (genuine absence of any plan). Keep the code `no_plan_asked` and the
  `NO_PLAN_MESSAGE` bytes identical.
- `planView` = last assistant turn text in the posted turns (kept-ends `boundedView` with
  `PLAN_MAX`/`PLAN_TAIL_MAX` unchanged); `replyView` = last user turn text (`REPLY_MAX` /
  `REPLY_TAIL_MAX` unchanged). `deriveLanguage(planView, replyView)` unchanged.
- KEEP byte-identical and in order: 401 session → KI-033 trial-clock 403 → 422 shape → 404
  ownership (soft-deleted exclusion) → budget 403 → judge (`buildVerdictPrompt` + `CLOSE_USER_TURN`)
  → `parseVerdict` strict (garbage = unclear, never throws, never starts) → `recordVerdictSpend`
  (swallowed) → `buildBriefPrompt` → brief clamp 1..2000 → INSERT `builder_runs` → pg-boss send
  (`singletonKey` = runId, retryLimit 3) → `{ runId, phase: queued, verdict: yes, briefChars }`.
  Non-yes → 200 `{ verdict, started: false }`, no row, no job. All refusal sentences unchanged.
- Owns test file `app/api/builder/verdict/route.test.ts`: paraphrase approvals ("baslat", "yap",
  "sen karar ver", "you decide", Turkish + English + one non-Turkish/non-English approval) →
  yes + enqueue; hedged / conditional / change-asking / off-topic → unclear, no start; bare
  greeting → unclear; garbage judge output → unclear; zero-assistant-turns → 409 `no_plan_asked`;
  trial / budget / ownership refusals byte-identical.

### 3c. Persona — `packages/ai/src/persona-prompt.ts` (owner: agent persona-a)
- DELETE the ask-line contract: the byte-exact English final-line rule (:43), the Turkish accept
  line above it (:42), the repost-on-acceptance rule (:44 — LESSONS §9.2: THIS instruction is the
  loop defect, a paraphrase approval today earns another plan instead of a verdict POST), and the
  handoff sentence (:45, "yazman yeterli, ben baslatiyorum" — the product no longer reads any
  sentence, it reads the verdict object).
- REPLACE with (prompt language stays English): keep "After at most 2-3 short questions, post a
  2-4 bullet plan summary in the owner's language." then "Then wait for the owner's reply in
  their own words — any clear approval starts the build from the page; you never start, run, or
  claim any build yourself." Keep :28-41 and :46 ("never claim a build started...") as-is.
- KEEP identical: `TURKISH_VERDICT_GUIDANCE`, `TURKISH_BRIEF_GUIDANCE`, `buildVerdictPrompt` /
  `buildBriefPrompt` signatures and behavior, `OwnerLanguage` type.
- MUST rebuild `packages/ai/dist` with the package's real build script (no install) so the
  served `dist/persona-prompt.js` matches src — `@corvus/ai` resolves to dist, not src.
- Owns test file `packages/ai/src/persona-prompt.test.ts`: remove the two ask-line verbatim
  assertions; assert verdict tri-state shape, Turkish-guidance presence, and that no ask-line
  contract remains in the prompt.

### 3d. Shared — `apps/web/lib/verdict/bounds.ts`
UNCHANGED. Nobody touches it. Single source of truth for TURNS_MAX/TURN_MAX/PLAN_MAX/REPLY_MAX/
THREAD_MAX/BRIEF_MAX and `boundedView`. (If a bound must change, STOP and escalate — it is
imported by both callers.)

## 4. Frozen copy (translation wave FROZEN per founder order — these bytes do NOT change,
EXCEPT the five ask-line strings in §5 whose removal the founder explicitly approved)

Keep byte-identical: `VERDICT_HINT`, `PLAN_MISSING_MESSAGE` + route `NO_PLAN_MESSAGE`,
`TRIAL_ENDED_MESSAGE` ("Your 3-day trial ended — your bots are paused. Nothing is deleted."),
`TRIAL_BUDGET_MESSAGE` + paid variant, route Turkish refusals (:129-141), page hero/explainer/
placeholder/cost/chips/back strings, `START_FALLBACK_ERROR`, `MINT_FALLBACK_ERROR`,
`CLOSE_USER_TURN`. Rationale for keeping the two hint strings: VERDICT_HINT ("kısaca "evet" yaz
ya da...") stays true under intent-based start (evet remains one valid approval); the 409 message
now fires only on genuine absence of any assistant turn.

## 5. Approved removals (NOT frozen — founder approved Option 1 which deletes the string gates)

`Can I start? Reply yes to build.` · `Baslayayim mi? Baslamak icin evet yaz.` ·
`Başlayayım mı?` / `Baslayayim mi?` · `Başlayalım mı?` / `Baslayalim mi?` ·
`yazman yeterli, ben baslatiyorum` notice. No other product string may change.

## 6. Gates that MUST NOT change (KI-033 option A + ownership, fail-closed)

Chat route: clock 403 before body, allowance after provider check, throw → 500 (never fake-allow).
Verdict route order (§3b). Spend holds true-up, swallowed+logged, never break reply/verdict.
No new runtime dependencies (copy idioms only, hand-rolled fetch preserved). No destructive ops
(push/deploy/real-data migration/secret rotation) without founder approval.

## 7. Acceptance (per agent + merged tree)

- Typecheck + lint clean with the project's REAL commands (detect toolchain from
  package.json/lockfile — npm, pnpm, yarn, or bun; never assume; if a check doesn't exist, say so).
- Owned tests green, including the NEW paraphrase/position cases in §3.
- Orchestrator runs the FULL gates on the MERGED tree after all three land (LESSONS §6.1: N green
  trees are not the tree that ships) + a live probe: Turkish paraphrase approval → 200
  `verdict: yes, phase: queued` + a `builder_runs` row; hedged reply → unclear, no row.
- "Done" = the flow completed in the running app and is named in the report (LESSONS §2.4) —
  green suites alone are claims, not evidence.

## 8. Standing constraints (every agent)

Tech Horoscope: TypeScript strict (repo's real tsconfig) · Next.js 16 App Router · no new deps.
Whitelist: read ONLY this spec file. Do NOT scan the Agent Reports directory.
Manifests: do NOT edit package.json/lockfiles or run installs — declare needed deps in the report.
Git: while this wave is uncommitted, NO `stash`/`checkout --`/`restore`/`reset` (LESSONS §7.1).
Secrets: never read `C:\Users\xr3less\Desktop\wiroai.txt`, never print/commit/embed keys.
Scope guard: touching files, decisions, or work beyond §3 → STOP and escalate via Open Questions.
Reports: `Agent Reports/2026-09-25-1553_<agent-id>_<TASKTYPE>_<component>.md`, schema from the
prompt template (Status / Files Touched / Dependencies Added / Assumptions / Open Questions /
Public Interface / Known Limitations). Return a brief summary to the orchestrator.
