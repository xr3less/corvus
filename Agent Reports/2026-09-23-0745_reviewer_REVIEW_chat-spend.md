# Task Report: reviewer-chat-spend

## Status
FAILED

## Verdict
Verdict: FAIL

Failing gate: spec adherence / scope — `apps/web/app/api/chat/route.ts:25,432-438` injects a `buildPersonaPrompt()` system message into every persona call, a behavioral (non-spend) change outside the M-11/m-23/m-24/m-25 scope and undisclosed in the author report ("spend-accounting only"). Fix: split the prompt hunk into its own task/report with rationale, or remove it.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0745_reviewer_REVIEW_chat-spend.md
- READ (only): author report 0713, sweep-synthesis 0347 (M-11/m-23/m-24/m-25), route.ts, route.test.ts, package.json files, packages/ai/src/lanes.ts (price/lane-count provenance)

## Dependencies Added
None.

## Assumptions Made
- Toolchain detected from disk: npm workspaces (`package-lock.json` present; no pnpm/yarn/bun lockfile). Real commands used: `npm run test/typecheck/lint --workspace @corvus/web`, prettier via absolute paths.
- `package-lock.json` + `.env.example` dirt is pre-existing (testbot workspace entry, Creem billing keys, dev-login switch) from other uncommitted waves — not this task; author touched neither.
- Locked-copy check is presence + exact-string (per task brief: no HEAD byte-diff; HEAD predates this work).

## Open Questions for Orchestrator
- Is the `buildPersonaPrompt()` system-message injection intentional (wanted behavior, just mis-scoped), or accidental? If wanted, re-file as its own change; the pinning test (`route.test.ts:311`) already exists.
- The `req.signal.aborted` full-reserve branch (`route.ts:473-474`) has no abort-signal test — covered by code read only. Acceptable, or require a test?

## Public Interface Exposed
No interface changes by this review. Author's internals (from report, verified present): `reserveChatSpend`, `trueUpChatSpend`, `PERSONA_RESERVE_CALLS` (= 3, matches `LANES.persona.length` verified in `packages/ai/src/lanes.ts:109-141`), `PERSONA_RESERVE_CREDITS`. Gate semantics unchanged (spent + reserve > allowance refuses; exact landing allows — test-locked at `route.test.ts:789-801`).

## Known Limitations
- Review is static + suite-level: no live-provider or real-DB run (pool is stubbed by design); concurrency window (two turns racing before either INSERT lands) is narrowed, not eliminated, per author.
- No abort-signal test exists (see Open Questions).

## Verification (exact commands + results)
- `npm run test --workspace @corvus/web -- app/api/chat/route.test.ts` → 33/33 passed.
- `npm run test --workspace @corvus/web -- lib/chat/thread.test.ts` → 18/18 passed (sibling regression).
- `npm run typecheck --workspace @corvus/web` → exit 0. `npm run lint --workspace @corvus/web -- app/api/chat/route.ts app/api/chat/route.test.ts` → exit 0, zero warnings. `npx prettier --check` (absolute paths) on both files → clean.
- M-11: mid-stream-throw test pins one estimated row with success-row shape (`['acct-1','persona',null,null,'persona-run',null,null]`, `route.test.ts:369-379`); hold-kept path writes exactly one INSERT, zero UPDATEs (`:400-410`). Abort branch read-verified (`route.ts:473-475`) but untested.
- m-23: reserve-INSERT-before-true-up-UPDATE ordering test-locked (`route.test.ts:741-760`); refusal-before-reserve locked (403 paths assert zero INSERTs, `:699-739`).
- m-24: `$4.40` provenance confirmed (`packages/ai/src/lanes.ts:13`, wiro glm/5-2 out-price); 3-route multiplier confirmed (`lanes.ts:109-141`); boundary tests pass (98.5 → 403, 97.29664 → 200).
- m-25: `console.error('chat: persona stream failed mid-turn', streamError)` present (`route.ts:451`) and asserted (`route.test.ts:381-384`).
- Locked copy exact-string present: trial-ended (`route.ts:88`), trial-budget (`route.ts:107`), error frame (`route.ts:452`). Diff secret-scan: only `test-key` placeholders. No manifest/lockfile/.env edits by this task.
- MY OWN guard-break (not the author's): `UPDATE ai_spend` → `UPDATE_BROKEN ai_spend` in `trueUpChatSpend` → suite 3 failed / 30 passed; restored from outside-repo backup, SHA256 `60D2436B…` verified byte-identical before/after, region re-read clean (`UPDATE ai_spend` ×1, `UPDATE_BROKEN` gone); re-run 33/33 green. Test-file hash `8E4F902E…` untouched throughout.
