# Task Report: F4-stream-usage

## Status
SUCCESS

## Files Touched
- MODIFIED: `apps/web/lib/ai/stream.ts` (+38 / −3, three hunks)
- CREATED (outside the repo, scratch, not a deliverable): `/tmp/f4probe/probe.mjs`, `/tmp/f4probe/neg.mjs`

No other repository file was read or written. `apps/web/lib/ai/stream.test.ts` shows as modified in `git status`, but **not by me** — that diff is another agent's uncommitted persona-lane work (it splits the persona test to exercise the grok fallback). I did not touch it.

## Dependencies Added
- None.

## Assumptions Made
1. **Scope reading:** "final usage chunk parsed and carried (cost/credits) without inventing values when absent" = the existing provider-cost path (`extractCost` → `toCredits`) fed by a usage frame that now actually arrives, with the absent case keeping `NULL`. I did **not** introduce token-count → USD estimation; the locked contract is provider-reported cost only. `packages/ai/src/cost.ts` reads `usage.cost` / `usage.totalcost` / `root.totalcost` and nothing else.
2. **No new value is invented.** A usage frame that reports tokens but no cost field still yields `credits: 0` + `note: 'usage-unavailable'` — `extractCost` returns null for it. Verified as probe CASE 2. Honest absence beats a plausible-looking number.
3. The comment at :266–272 (now :293–312) was rewritten to state the new truth rather than deleted: asking is not receiving, and the three ways the usage frame still fails to arrive are named.
4. I chose **not** to make the flag route-conditional. It is inert-to-helpful on wiro (compat path with per-model validation, all 3 configured IDs probed live today), useful on DeepSeek, inert on OpenRouter, and unprobed on z.ai. A conditional would add a route-capability table the type does not carry, for one unprobed route already covered by the 4xx failover.

## Open Questions for Orchestrator
- **z.ai route (`zai-glm-5.3-flash`, last-but-two on the builder lane) is UNPROBED for `stream_options`.** Its published OpenAPI schema for `POST /paas/v4/chat/completions` (`docs.z.ai/api-reference/llm/chat-completion`) lists `do_sample, stream, thinking, reasoning_effort, temperature, top_p, max_tokens, tool_stream, tools, tool_choice, stop, response_format, request_id, user_id` — no `stream_options` — and z.ai documents an error family `1214 Parameter ${field} is invalid. Please check the documentation.` (400). Their guide shows the last chunk carrying `usage` **without** asking, so the flag may be unnecessary there. Two ways it can land: ignored (fine) or rejected 400 (fails over like any other 4xx, per probe CASE 5). **A live probe with a real `ZAI_API_KEY` would close this in one call; I hold no key.** If it 400s, the flag needs to become route-conditional.
- **wiro was probed indirectly, not end-to-end.** `GET https://llm.wiro.ai/v1/chat/models` is unauthenticated and returned the three configured IDs (`glm/5-2` ×2, `xai/grok-4-1-fast` ×2, `sonnet-5`) on 2026-09-24, so the IDs are live. What I could not do without a `WIRO_API_KEY` is send the actual request. End-to-end in-app proof still belongs to the merged-tree pass.

## Public Interface Exposed
- `buildStreamBody(route, options)` — **unchanged signature**, still internal (not exported). Its returned body now always carries `stream_options: { include_usage: true }` alongside `model`, `messages`, `temperature: 0`, `stream: true`, and the optional `max_tokens` / `reasoning_effort`.
- `StreamEvent`, `StreamOptions`, `chatStream` — **byte-identical** to before. No consumer change is required anywhere.
- New body field on the wire: `stream_options: { include_usage: true }` on every route of both lanes.

## Known Limitations
- **Does not make every provider report cost.** It makes the providers that need an opt-in (`OpenAI`-spec, DeepSeek) report it, and asks the rest. A provider that returns no cost field still produces a NULL spend row by design.
- **Does not touch `packages/ai/src/router.ts`** (non-streaming `chat()`). Out of scope; that path is non-streaming and already returns `usage` in the body.
- **Does not touch the route or the ledger.** `app/api/chat/route.ts` already translates `note: 'usage-unavailable'` into NULL `usd_cost`/`credits`; adding the flag changes how often that branch fires, not what it does.
- **Doc comments now contain a dated, route-by-route truth block.** It will go stale if a provider changes behavior; it is dated (`2026-09-24`) and source-linked so a later reader can tell what was verified when.

## Verification

### 1. Focused tests — green
- `npx vitest run lib/ai/stream.test.ts` → **11 passed / 11** (1 file).
- Consumers of this contract, both green: `npx vitest run app/api/chat/route.test.ts lib/chat/thread.test.ts` → **53 passed / 53** (2 files).

### 2. Real-path probe — green, on the module itself
Because the task's write scope forbade `lib/ai/stream.test.ts`, criterion 1 has **no in-repo assertion**. I did not leave that as a claim: `/tmp/f4probe/probe.mjs` imports the real `apps/web/lib/ai/stream.ts` (Node 24 type-stripping, extensionless `./cost` / `./lanes` / `./router` resolved by a `registerHooks` resolver — no repo file, no manifest) and drives **`chatStream`** with a stub fetch, asserting the bytes actually sent. `PROBE RESULT: ALL PASS`:

| Case | Assertion | Result |
|---|---|---|
| C1 | sent body has `stream: true` and `stream_options.include_usage === true` | PASS |
| C1 | cost frame `usage.cost: 0.02` → final event `{ t: 'done', credits: 4 }`, no `note` | PASS |
| C2 | usage frame with **tokens but no cost** → `credits: 0, note: 'usage-unavailable'` (nothing invented) | PASS |
| C3 | no usage frame at all (flag ignored) → `credits: 0, note: 'usage-unavailable'` | PASS |
| C4 | OpenRouter-shaped frame (content-free delta + `usage.cost`) → `credits: 1` | PASS |
| C5 | route 1 answers 400 → route 2 is reached **and also** opts in, and still meters | PASS |

**Negative control (guard proven, not assumed — LESSONS §8).** `/tmp/f4probe/neg.mjs` loads the same real `stream.ts` with the `stream_options` line deleted **in memory only** and re-runs the exact C1 assertion:
```
sent.stream_options = undefined
NEGATIVE CONTROL OK: assertion fails without the change
```
So the probe genuinely guards the change rather than passing for an unrelated reason.

### 3. Typecheck / lint / format
- **Lint — clean.** `npx eslint lib/ai/stream.ts` → exit 0, zero warnings.
- **Format — clean.** `npx prettier --check lib/ai/stream.ts` → "All matched files use Prettier code style!".
- **Typecheck — 1 error, and it is NOT in my file and NOT mine.**
  ```
  app/dashboard/bots/page.tsx(53,8): error TS2304: Cannot find name 'STATUS_LABEL'.
  ```
  `npx tsc --noEmit | grep -c "lib/ai/stream"` → **0 errors in the file I changed.** The failing file is `M` in the working tree under another agent's in-flight Turkish conversion (**F8**, `Agent Reports/2026-09-24-0201_F8_MODIFY_chat-turkish.md`): at `HEAD` that file's `StatusPill` uses `STATUS_LABEL[status]` with the import present; in the working tree the top of the file was reordered and the reference at line 53 was left with no binding in scope. `app/dashboard/bots/page.tsx` imports nothing from `lib/ai/` (line 15–29: react, next/navigation, lucide-react, `@/components/ui/builder-progress`, css modules) — **no path from my change to this error**, and the error is present with or without my edit. Escalating rather than expanding scope: the tree is not typecheck-clean through no fault of this task, and the fix belongs to whoever owns that file.

### 4. Full web suite — 19 failures, all attributable to other agents' uncommitted work
`npx vitest run` → **943 passed / 962, 6 files failed**. **None of the 6 failing files imports `lib/ai/stream`** (verified by grep across all of them, including the bot-detail page which drives the chat UI). They are: `scratch-probe.test.ts` (untracked scratch, another agent), `app/page.test.tsx`, `app/dashboard/bots/page.test.tsx`, `app/dashboard/new/page.test.tsx`, `app/dashboard/bots/[id]/page.test.tsx` — all `M` in the working tree — and `components/ui/chat-thread.test.tsx`, which is **clean** and fails because F8's uncommitted Turkish edit to `components/ui/chat-thread.tsx` changed `Retry` → `Tekrar dene` and the spent line while the test still asserts the English copy (`expect(screen.getByText(/This reply used 0.075 credits/))`). **Reported, not fixed** — out of scope, and mid-flight work by another agent. The full run also proved non-deterministic across two invocations (21 then 19 failures), which is consistent with sibling agents writing the tree while it ran.

### Comment accuracy (:266–272 region → now :293–312)
The old comment claimed the request body "intentionally stays minimal per the locked contract." That sentence is now false and was replaced with what is true: the usage frame is asked for on every route, asking is not receiving, and the absent case is surfaced as `usage-unavailable` — never as a zero-cost run. The file-header block gained a dated `USAGE OPT-IN` truth note with per-route live evidence, which is also the source trail for the z.ai open question above.

### Sources (live, fetched today — none from memory)
- OpenAI, `Create chat completion` + streaming-events reference — `stream_options.include_usage` streams an extra chunk before `[DONE]` with `choices: []` and populated `usage`: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/
- OpenAI cookbook, `How to stream completions` — same, with the observed chunk sequence: https://developers.openai.com/cookbook/examples/how_to_stream_completions
- DeepSeek, `Chat Completions API` — "If omitted or set to `false`, the `usage` field is absent from all chunks except the last one"; no separate usage-only chunk is emitted: https://api-docs.deepseek.com/api/create-chat-completion/
- wiro, LLM Gateway landing page — "Protocol-correct SSE on every route, including streamed tool-call arguments and **a final usage frame when you ask for one**": https://wiro.ai/llm
- wiro, Help Center — "When usage data is available, the response also reports the charged amount in `usage.cost`": https://support.wiro.ai/en/articles/16928386-how-do-i-use-the-wiro-llm-gateway-completions-api-in-vs-code-cursor-and-other-ai-tools
- wiro, Direct LLM Gateway docs — Chat Completions is explicitly OpenAI Chat JSON and SSE: https://wiro.ai/docs/markdown/completions-api.md
- OpenRouter, API Streaming + response schema — usage always returned in the final chunk; client docs mark `include_usage` **deprecated, "This field has no effect. Full usage details are always included"**: https://openrouter.ai/docs/api-reference/streaming
- z.ai, `Chat Completion` OpenAPI — `stream_options` **absent** from the request schema: https://docs.z.ai/api-reference/llm/chat-completion
- z.ai, `Errors` — `1214 Parameter ${field} is invalid. Please check the documentation.` (400): https://docs.z.ai/api-reference/api-code
- z.ai, `Streaming Messages` — `usage` "only appears in the last chunk" without an opt-in: https://docs.z.ai/guides/capabilities/streaming
- Live probe: `GET https://llm.wiro.ai/v1/chat/models` (unauthenticated) returned the configured model IDs on 2026-09-24.

## Verification file:line
| What | Where |
|---|---|
| `stream_options` sent | `apps/web/lib/ai/stream.ts:105` |
| why, inline | `apps/web/lib/ai/stream.ts:100-104` |
| header truth block | `apps/web/lib/ai/stream.ts:26-49` |
| comment updated to truth | `apps/web/lib/ai/stream.ts:293-312` |
| absent-cost → `usage-unavailable` | `apps/web/lib/ai/stream.ts:309-314` |
| cost read from the usage frame | `apps/web/lib/ai/stream.ts:~434` (`extractCost(chunk)`) |
| downstream NULL translation (untouched, already correct) | `apps/web/app/api/chat/route.ts:271`, `:325` |
