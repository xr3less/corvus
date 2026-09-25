# Task Report: recon-verdict500-0428

## Status

SUCCESS

## Root Cause — verdict-lane 500 `{"error":"could not judge reply"}`

**The failing call site.** `apps/web/app/api/builder/verdict/route.ts:530-541` — the judge call posts a **system-only message array**: a single `{ role: 'system', content: buildVerdictPrompt(...) }`. That rides `defaultPersonaCaller` (`route.ts:269-275`) → `chat({ lane: 'persona', messages, maxTokens })` (`packages/ai`), which hand-rolls an OpenAI-style POST to `https://llm.wiro.ai/v1/chat/completions` with `body = { model, messages, temperature: 0, max_tokens }` (`packages/ai/src/router.ts:101-112, 237-246`). The provider returns a non-429 4xx; `router.ts:257-267` marks `clientErrorSeen`, tries exactly one more route, then throws `RouterError` (`router.ts:296`). The route's **bare catch at `route.ts:544-551` discards the error with no logging** and maps it to `{ error: 'could not judge reply', message: JUDGE_FAILED_MESSAGE }`, 500. Two fast 4xx round trips on the two wiro routes (persona lane order: wiro `glm/5-2` → wiro `grok-4-1-fast` → openrouter `glm-5.3-flash`, `packages/ai/src/lanes.ts:109-141`) match the ~100ms signature.

**Why system-only fails at the provider.** The GLM family's own OpenAPI schema states, in the `messages` description: *"Note: The input must not consist of system messages or assistant messages only"* (official z.ai schema, https://docs.z.ai/api-reference/llm/chat-completion.md), and the error table codes a malformed `messages` payload as HTTP 400 / code 1214 "Parameter messages is invalid" (https://docs.z.ai/api-reference/api-code). Independent OSS reproductions confirm the exact rejection for system-only arrays against the GLM/Zhipu backends: HKUDS/nanobot PR #3082 (system-only → `400 {"code":"1214","message":"messages 参数非法"}`, fixed by recovering a user turn) and openclaw issue #73688 (all GLM variants, `400 1214 "The messages parameter is illegal"`; fix = a non-empty user turn after system). Wiro's Direct LLM Gateway serves `glm/5-2` through that same provider backend in OpenAI-chat protocol (https://wiro.ai/docs/markdown/completions-api.md — model id `glm/5-2` on `https://llm.wiro.ai/v1`; every documented example carries a `user` message) and propagates the upstream protocol response, so the system-only body 4xxes on wiro too.

**Why chat succeeds with the same key.** Same lane, same wiro key, same `glm/5-2`, same Bearer auth — the only difference is the message array. Chat always ends with a user turn: `system buildPersonaPrompt() + ...history + { role:'user', content: message }` (`apps/web/app/api/chat/route.ts:428-432`). The builder worker does the same: `system + user` (`apps/gateway/src/db/builder-runs.ts:637-649`). Verdict is the repo's **only** system-only caller — it fails before the model runs, on every language and every plan, which is why the 500 is language-independent and instant.

**Minimal fix recipe (recipe only — no code written; file-scoped to route.ts + route.test.ts):**
1. `route.ts:530-541` — append a short `user` turn after the system turn (keep `buildVerdictPrompt` output as `messages[0]`; user turn carries e.g. the judge instruction). Byte-preserving variant: every existing test assertion reads `messages[0].content` only (`route.test.ts:258, 490, 715-723, 764, 782, 806`) and no test pins the array length (verified by grep), so appending leaves the suite green.
2. Apply the same fix at the brief call site `route.ts:572-574` — identical system-only defect one call later, otherwise verdict-yes now 500s as `could not write brief`.
3. In both catches (`:544`, `:578`) log the discarded error server-side (mirror chat's m-25 `console.error` at `chat/route.ts:447`) so lane/attempt classes become observable.
4. Additive regression pin in `route.test.ts`: persona messages array must end with a non-empty `user` turn.

No `@corvus/ai` change is needed — the router is shape-neutral by design; this is the OSS-precedented sanitizer (nanobot #3082 / openclaw #73688) applied at the route's two call sites, following the repo's own established system+user idiom.

**Research citations (current facts, not memory):** GLM messages contract + 1214 — docs.z.ai/api-reference/llm/chat-completion.md and docs.z.ai/api-reference/api-code; third-party reproductions — github.com/HKUDS/nanobot/pull/3082, github.com/openclaw/openclaw/issues/73688; wiro gateway surface — wiro.ai/docs/markdown/completions-api.md, wiro.ai/llm. Next.js 16.3.4 confirmed in `node_modules/next/package.json`; bundled docs dir exists (`node_modules/next/dist/docs/`) but the recipe touches no Next API.

## Files Touched

READ ONLY: apps/web/app/api/builder/verdict/route.ts; apps/web/app/api/builder/verdict/route.test.ts; apps/web/lib/verdict/bounds.ts; apps/web/lib/http/refusal.ts; apps/web/app/api/chat/route.ts; apps/web/lib/ai/stream.ts; packages/ai/src/{router,lanes,index,persona-prompt}.ts (+grep of ai.test.ts); apps/gateway/src/db/builder-runs.ts; Agent Reports/2026-09-24-0422_orchestrator_REVIEW_fixwave-verdict.md; node_modules/next/package.json + dist/docs existence check. CREATED: Agent Reports/2026-09-24-0428_recon-verdict500_REVIEW_verdict-500.md (this report, saved by orchestrator — read-only profile has no Write tool). MODIFIED: nothing.

## Dependencies Added

None.

## Assumptions Made

- WIRO_API_KEY (or OPENROUTER_API_KEY) is set in the deployed env — task states chat succeeds with the same key.
- ~100ms = two sequential fast 4xx round trips (wiro→wiro), not DNS/TLS (those classify `network`, would walk all three routes, and would fail chat identically).
- The exact wiro status (400/1214 propagation) is inferred from the provider contract + router mechanics; not probed live (no key access in read-only scope; live POST is the founder's §6 item).

## Open Questions for Orchestrator

- **Founder:** (a) confirm with one live POST that wiro `glm/5-2` returns 400 for system-only messages (needs the real key — agents must not touch secrets); (b) choose the exact user-turn copy for both call sites — it bills on every verdict/brief call (repo convention: ASCII, minimal tokens).
- **Orchestrator:** scope decision — does the fix ride as an inline one-file edit in the current wave (`route.ts` is already wave-touched) or a follow-up? It blocks the §6 live Turkish E2E gate either way.
- **Flagged, NOT in scope:** `route.ts:534-537` calls `buildVerdictPrompt` without the `language` arg (defaults `'english'`, `persona-prompt.ts:70-74`), so F3's `TURKISH_VERDICT_GUIDANCE` never reaches the judge even on Turkish threads — a separate latent judging-quality issue, not the 500.

## Public Interface Exposed

Unchanged — findings only. The route's response shapes (including the two 500 codes) stay byte-identical; the fix changes only the outbound provider payload plus adds server-side logs.

## Known Limitations

- Report saved by orchestrator (read-only profile has no Write tool and forbids redirect/heredoc writes).
- No live provider probe possible in scope (no key, no state changes); provider rule cited from official docs + OSS reproductions instead.
- Prior bringup notes not read (per REQUIRED CONTEXT limits); §6 pointers only.
