# SPEC: KI-036 creation-chat builds (chat talks, Build ignores thread, persona roleplays)

Status: SPEC — fix wave authorized by founder 2026-09-21 ("sorunu çözene kadar durma").
Timestamp: 2026-09-21-2238 (real clock). PLAN ref: Phase 2d, KI-036 row in KNOWN_ISSUES.

## §0 What happens today (evidence, not memory)

Creation page `apps/web/app/dashboard/new/page.tsx`:
- Every submit streams persona text only: `handleSubmit` (page.tsx:111-120) mints
  fire-and-forget via `POST /api/bots` (page.tsx:74-107) AND posts
  `POST /api/chat { botId, message, history }` via `useChatStream`
  (`use-chat-stream.ts:70-82`, SSE `\n\n` frames parsed at :92-104).
- First chat turn always carries `botId: null` (minted id commits after stream ends,
  page.tsx:67-72) — mint and first turn are unlinked by construction.
- `Build this bot` DOES call `POST /api/builder/start { botId, brief }`
  (page.tsx:124-173, disabled until `botId !== null`, page.tsx:214) — but `brief`
  is `firstBriefRef` ONLY (page.tsx:64,127): the first user message, never the
  refined thread. The AI-guided conversation is discarded at build time.
- Success sets local `runId` + a link to `/dashboard?runId=` (page.tsx:219).
  `BuilderProgress` (polls `GET /api/builder` every 2s, builder-progress.tsx:61-124)
  renders ONLY on `/dashboard` and `/dashboard/bots` — NOT on `/dashboard/new`,
  not on the detail page.

Chat route `apps/web/app/api/chat/route.ts`:
- SSE re-emits the persona lane verbatim (`reasoning|content|done|error`,
  route.ts:348-366). Sole DB write: one `ai_spend` row, reason `persona-run`
  (route.ts:79-81,247-279). Zero refs to builder/pg-boss/spec writes — chat is
  fully decoupled from building by construction.
- Gates: 401 / 403 trial+budget (KI-033) / 422 / honest 500 (route.ts:282-346).
  Missing session clock reads as NOT expired — fail-open direction LOCKED by
  KI-033 SPEC, owned by `isTrialExpired`. Do not "fix" this direction in this wave.
- System prompt is `buildPersonaPrompt()` with NO botName (route.ts:359-363).

Persona prompt `packages/ai/src/persona-prompt.ts:8-25`:
- L14 forbids claiming draft/simulation/live ("You create nothing in chat..."),
  L15 points at product buttons — but NEVER names the trigger (which button, and
  the rule that chat text describes while execution runs out-of-band), and says
  nothing about `/command`-style user text. Soft prose rule the model demonstrably
  ignores: `/avlan` → fake catch narration, `ban @google` → fake confirmation.
- Provenance: those strings exist NOWHERE in apps/web or packages (grep zero).
  `lib/demo/brain.ts` is exonerated (served only from `/demo`, never imported by
  the new page). `thinking-trace.tsx:7` renders only streamed reasoning — cannot
  fabricate. The roleplay is pure model output on the persona lane, streamed
  verbatim via `lib/ai/stream.ts:34-37` ("never fabricated" cuts both ways).
- Billing cap: prompt must stay ≤20 lines both variants (test asserts).

Backend chain (wired and live-proven, NOT the defect — do not rebuild):
mint (`api/bots`) → `POST /api/builder/start` (401/403/422/ownership-404,
INSERT builder_runs `queued`, pg-boss `send('builder')`) → gateway worker
(`queued→generating→syncing→live|failed`; budget pre-check fail-closed;
builder lane → fenced JSON → parseSpec → `recordSpend burn:builder`) → one TX:
`spec_versions` draft row + `bots.draft_spec_id` → poll `GET /api/builder` →
simulate (keyword-overlap, executes NOTHING) → preflight (Red blocks publish,
409) → publish moves `prod_spec_id` + audit. Live proof: live-smoke-003
(~24s, 1 call, 0.31696cr); Stage B honest scope: behavior execution NOT provable.
Tier-resolver fail-open→trial-allowance is DELIBERATE. None of this changes here.

Drift origin: D-105 built `/api/chat` as persona-only SSE for the detail
composer; D-107 rebuilt creation onto it with `botId: null` and no mint/build
step. D-134 backfilled mint + Build→`?runId=` (commit `ac17d4b`) but kept
first-message-only brief, no inline progress, soft-only prompt rule.

## §1 Root causes (R1–R4)

- R1 Conversation discarded: brief = first user message only. AI refinement never
  reaches the builder. (page.tsx:64,127)
- R2 Progress exiled: build starts on `/dashboard/new`, progress lives on
  `/dashboard?runId=`. User clicks Build and sees a link, not the build.
- R3 Prompt is prohibition without trigger: model is told what NOT to claim but
  never what runs a build (the named button) nor how to handle `/x` command text
  (describe, never narrate a result). GLM persona roleplays through the gap.
- R4 (mint race, minor): turn one is unattributed (`botId: null`); spend lands on
  the account but not the bot. Kept behavior unless the fix needs the id sooner —
  do NOT re-architect mint to block the first turn.

## §2 What SHOULD happen (locked contract)

08 §1: words → versioned behavior-spec draft (parseSpec-valid) → simulate draft →
publish = pointer move; spec is data, no codegen. 07 surface map: `/dashboard/new`
is Stage-1 Describe; output a draft, never a silent live write. KI-027: mint then
Build→run. Builder-progress: every visible phase comes from the server row
(D-104: no client-faked progress, ever). Honest limit stands: going-live on
Discord stays unwired copy on the new page until A8 says otherwise.

## §3 OSS patterns applied (web-researched 2026-09-21, not memory)

1. Explicit Build action only: Lovable Build-vs-Plan toggle + Bolt plan-mode —
   chat→build is a verified UI signal, never model narration.
   (https://docs.lovable.dev/features/projects/chat;
   https://support.bolt.new/best-practices/plan-mode)
2. Build as queued side-effect with deterministic idempotency; runId server-owned,
   delivered as structured data, persisted server-side — never recomputed client-side
   (v0 agent-API parts model; Next.js queue-handoff pattern).
   (https://vercel.com/blog/introducing-the-new-v0-api;
   https://api2.v0.dev/docs/api/v2/guides/handling-agent-interactions;
   https://markaicode.com/architecture/nextjs-agent-architecture/;
   https://community.vercel.com/t/fire-and-forget-next-js-api-route/15865)
3. SSE over fetch-POST; errors after 200 arrive in-stream; the run outlives the tab
   — SSE narrates status and carries runId only; abort kills narration, never the build.
   (https://dev.to/ahmed_mahmoud360/streaming-ai-responses-in-nextjs-sse-fetch-streams-and-what-breaks-in-production-4f76;
   https://medium.com/@anukritj/two-ways-to-stream-production-sse-in-the-next-js-app-router-55847ea2a814)
4. Tool-only actions + provenance boundary: assistant text is structurally incapable
   of starting a run; status claims without a backing backend event render as chat,
   never as build state; prompting alone does not cure roleplay (documented
   execution-hallucination failure mode).
   (https://discuss.ai.google.dev/t/topic-critical-execution-hallucination-in-gemini-api-shell-tool-integration/135658;
   https://www.salmanq.com/blog/llm-tool-call-hallucination/;
   https://github.com/anthropics/claude-code/issues/75568)

## §4 Wave plan (DAG, disjoint scopes)

```
ki036-newpage (MODIFY apps/web/app/dashboard/new/*)
    ∥  ki036-prompt (MODIFY packages/ai/src/persona-prompt*)
        → reviewer-newpage (fresh eyes, never the builder)
        → reviewer-prompt  (fresh eyes, never the builder)
            → orchestrator: merged-tree gates + local live repro → close or fix (cap 3)
```

| Agent | May MODIFY | Must NOT touch |
|---|---|---|
| ki036-newpage | `apps/web/app/dashboard/new/page.tsx`, `apps/web/app/dashboard/new/page.test.tsx` | everything else, esp. `packages/ai/**`, detail page, chat route, manifests |
| ki036-prompt | `packages/ai/src/persona-prompt.ts`, `packages/ai/src/persona-prompt.test.ts` | everything else, esp. `apps/web/**`, manifests |

No manifest edits, no installs (declare deps in report; orchestrator installs
centrally). No git restore commands (`stash`/`checkout --`/`restore`/`reset`).
Commit nothing, push nothing, deploy nothing, migrate nothing.

Agent A — ki036-newpage (MODIFY):
- Brief becomes the stitched thread: user turns in order, trimmed, total 1..2000
  chars (deterministic concat, NO model call). POST shape unchanged
  `{ botId, brief }`. First-message-only path deleted.
- Render the EXISTING `BuilderProgress` inline on the new page once `runId` is set
  (reuse — no new timers, no faked phases, D-104). Keep the `?runId=` link as well.
- Preserve: mint-on-first-submit, Build disabled until `botId`, trial 403 copy
  verbatim, FORBIDDEN-words list in page.test, honest empty/error states.
- Before writing code, read the relevant guide in
  `apps/web/node_modules/next/dist/docs/` (repo AGENTS.md: this Next.js has
  breaking changes vs training data) and heed deprecations.
- Gates: `tsc` + ESLint + Prettier on touched paths clean; new-page vitest file green.

Agent B — ki036-prompt (MODIFY):
- Add the TRIGGER line: builds/simulations/publishes run ONLY via the product
  buttons (name `Build this bot`); chat text describes, execution is out-of-band.
- Add the SLASH rule: when the user types `/command`-style text, describe what
  WILL happen and offer next steps — never narrate a result as done.
- Keep L14/L15 honesty lines verbatim; keep ≤20-line cap BOTH variants (plain +
  botName); keep no-emoji/no-`!`; botName branch carries the same rules.
- Tests assert the literal trigger/slash phrases in BOTH variants (mutation-grade:
  deleting the line must redden the test — match phrases, not topics).
- Gates: `packages/ai` suite green.

## §5 Locked must-not-break list

KI-033 gates + fail-open-clock direction; trial copy verbatim; FORBIDDEN user-copy
list; 20-line billing cap; `?runId=` link kept; progress rows server-truth only;
chat route stays side-effect-free (no builder logic smuggled into `/api/chat`);
worker/publish/simulate untouched; detail page untouched (twin tracked in §8).

## §6 Acceptance (wave-close bar)

1. Reviewers PASS ×2 (fresh, toolchain-detected, real commands).
2. Merged-tree `tsc`+ESLint+Prettier+vitest green (orchestrator run).
3. Local live repro, human-named: describe bot on `/dashboard/new` → press Build →
   runId appears + inline progress polls the REAL `GET /api/builder` → honest
   terminal phase; `spec_versions` row + `draft_spec_id` move + spend rows
   (`persona-run` + `burn:builder`) confirmed. Full `live` terminal phase required
   ONLY if the lane key exists locally — else record the lane gap LOUDLY and do
   not claim it (§2.7: silent-degrade systems need louder checks).

## §7 Review + recovery

Fresh reviewer per task (spec + builder report + touched files; detect real
toolchain, never assume). Fail → fix agent (changed prompt, never verbatim retry).
3rd failed review → STOP, escalate to founder with 2 options. Interface mismatch
between A/B outputs → spec (§4) is truth; drifted side re-spawns.

## §8 Follow-up work (on the plan, NOT a limitation note)

Detail-page twin: streamed AI suggestions never become behaviors ("Save as draft"
posts composer text only, `[id]/page.tsx:704-758`). Same defect class (§3-class
rule) — separate scoped task after this wave closes, with its own reviewer.

## §9 Scar-tissue steps applied

- Fix the class: §8 names the twin explicitly instead of narrowing to the new page.
- Instruction-as-bug: R3 fixes prompt text, and this SPEC was grepped against the
  research diagnosis (trigger + slash rule present above, not assumed).
- Validate the instrument: §6 demands the real-path repro, not gate-green alone;
  prompt tests are mutation-grade (§4-B).
- Merged tree is a different artifact: §6-2 runs gates on the merged tree, not on
  N green reports.
