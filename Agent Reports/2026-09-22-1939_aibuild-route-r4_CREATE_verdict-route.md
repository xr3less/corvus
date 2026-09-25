# Task Report: aibuild-route-r4

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/api/builder/verdict/route.ts
- CREATED: apps/web/app/api/builder/verdict/route.test.ts

## Dependencies Added
- None (uses existing @corvus/ai, pg-boss, next/server; no manifest edits, no installs).

## Assumptions Made
- No server-side chat-thread store exists in the repo. The only server-side thread-ish store is `interview_progress` (interview Q/A pairs, not chat turns — verified via `apps/web/lib/interview/progress-store.ts` and gateway drizzle tables in `apps/gateway/drizzle/`). It can never supply the plan ask line, so per SPEC V2 fallback the route accepts a client-owned capped `turns` tail in the body (12 x 500 chars), mirroring POST /api/chat's `history` bound. `interview_progress` is never read here.
- `buildVerdictPrompt` and `buildBriefPrompt` both exist in `@corvus/ai` (verified live: `node -e import('@corvus/ai')` resolves both as functions; resolved dist carries `buildVerdictPrompt`). No STOP needed.
- Persona-lane calls go through the shared `@corvus/ai` `chat({ lane: 'persona' })` router via an injectable `__setPersonaCaller` seam (default = real lane; tests inject a stub). This mirrors the chat route's `chatStream` call shape and keeps keys inside the lane (route reads no key env itself).
- Spend metering reuses the chat shape exactly: `recordSpend(pool, { model: 'persona', reason: 'persona-run', refId: botId, usdCost })`, ledger failure swallowed with a `console.error` naming the cause via `mapDbError` (mirrors `recordChatSpend` in `apps/web/app/api/chat/route.ts`). `usdCost: null` is stored as NULL, never zeroed (router contract).
- Next.js route-handler convention verified against the bundled docs at `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (App Router `route.ts` exporting `POST`, `Response.json`/`NextResponse.json` both standard; no breaking change affects this route).
- Verdict input caps (plan 1000, reply 500) are defense-in-depth slices: a single turn is at most 500 chars, so the 1000-char plan slice can never actually truncate — documented in the test.
- Sources cited: `Agent Reports/2026-09-22-1939_orchestrator_SPEC_aibuild-verdict.md` V2; `apps/web/app/api/builder/start/route.ts` (gate order, boss shape, markEnqueueFailed); `apps/web/app/api/chat/route.ts` (chatStream + persona-run spend shape); `packages/ai/src/persona-prompt.ts` (imported builders, present); Next route-handler guide above.

## Open Questions for Orchestrator
- None blocking. One note: an empty `turns` array (or a thread with no user turn) reaches the lane with an empty reply slice; the verdict prompt then judges an empty reply, which the prompt's own unclear rule resolves to `unclear`. Deliberate — no extra 422 added beyond the SPEC. If you want empty-turns to be 409/422 instead, say so.

## Public Interface Exposed
- `POST /api/builder/verdict { botId: uuid, turns?: [{ role: 'user'|'assistant', content: 1..500 }] }` (turns max 12).
  - 401 `{ error: 'unauthorized' }` (fail-closed, incl. session-throw).
  - 403 `{ error: 'trial_expired', message }` BEFORE body parse (paid tier bypasses; missing/unknown tier = trial path).
  - 422 `{ error: 'invalid bot id' | turns-shape | 'empty_brief' }`.
  - 404 `{ error: 'bot not found' }` (ownership query incl. `deleted_at IS NULL`, never 403).
  - 409 `{ error: 'no_plan_asked' }` when the last assistant turn lacks the `Can I start?` substring — no lane call, no row, no job, no spend.
  - 200 `{ verdict: 'no'|'unclear', started: false }` — NO builder_runs row, NO boss job, one persona-run spend row.
  - 200 `{ runId, phase: 'queued', verdict: 'yes', briefChars }` — row + boss job identical to builder/start (`builder` queue, singletonKey=runId, retryLimit 3, retryDelay 30, expireInSeconds 3600, deleteAfterSeconds 604800), two persona-run spend rows.
  - 500 `{ error: 'could not judge reply' | 'could not write brief' | 'could not start build' | 'database not configured' }`.
- Test seams: `__setSessionReader/__resetSessionReader`, `__setBossFactory/__resetBossFactory`, `__setPersonaCaller/__resetPersonaCaller`, re-exported `__setPool`. `BUILDER_QUEUE = 'builder'`.

## Known Limitations
- Does NOT read any server-side thread store (none exists for chat); trust boundary is the client-sent `turns` tail, bounded but not authenticated against history.
- Verdict has no monthly-allowance (budget) gate — SPEC V2 meters both calls as spend but refuses nothing; the builder worker's own pre-call gate remains the billing ceiling.
- The `yes` path makes two sequential lane calls (verdict then brief); a brief-call failure after a successful verdict returns 500 with no row and no retry of the verdict.
- Tests are hermetic (mocked lane + mocked pool + stub boss): 19/19 green via `npx vitest run app/api/builder/verdict/route.test.ts`. `tsc --noEmit` clean, `eslint` clean, `prettier --check` clean. No live provider or DB touched; no secrets read or logged (lane owns keys).
