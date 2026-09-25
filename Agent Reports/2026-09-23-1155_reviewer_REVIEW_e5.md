# Task Report: review-e5-safety

## Status
FAIL (merged-tree integration; in-scope E5 halves individually PASS — see Interface-Match Verdict)

## Files Touched (reviewed, NOT modified)
- apps/gateway/src/runtime/dispatcher.ts + dispatcher.test.ts (exist on disk, untracked, read in full)
- apps/gateway/src/runtime/connector/index.ts, games/xp.ts, moderation/index.ts, games/giveaway.ts (exist, read in full)
- apps/gateway/src/runtime/tickets/handler.ts, reaction-roles/handler.ts (read for interface check only — out of E5 scope)
- apps/gateway/src/runtime/registry.ts, loaders.ts, boot-modules.ts, feature-modules.ts (read for wiring check)
- apps/web/components/ui/error-card.tsx + error-card.test.tsx (exist, read in full)
- apps/web/app/dashboard/bots/[id]/page.tsx (toScanRow/ErrorCard wiring, lines ~98-165, ~589-594, ~1262-1332)

## Verification (evidence, all on merged working tree)
- Toolchain detected from package.json (NOT assumed): gateway `@corvus/gateway` vitest 3 / tsc; web `@corvus/web` vitest 5 / tsc. No lint-staged, no inventing.
- `npx tsc --noEmit -p apps/gateway/tsconfig.json` → exit 0, no output.
- `npx tsc --noEmit -p apps/web/tsconfig.json` → exit 0, no output.
- `npx eslint <6 gateway touched files> --max-warnings 0` → exit 0. `npx eslint <error-card, error-card.test, page.tsx> --max-warnings 0` → exit 0.
- Gateway tests run FROM apps/gateway (repo-root invocation uses wrong vitest major and mis-resolves): `npx vitest run dispatcher.test.ts connector.test.ts xp.test.ts giveaway.test.ts moderation.test.ts` → 5 files, 106/106 passed (11 + 27 + 18 + 18 + 32).
- Web tests run FROM apps/web (repo-root invocation fails with `document is not defined` — wrong environment, NOT a code defect): `npx vitest run error-card.test.tsx page.test.tsx page-disabled-guard.test.tsx` → 3 files, 65/65 passed (5 new ErrorCard + 60 existing).
- Grep-proof E5b: `toScanRow` reads `.fix` via `readFixOf` (page.tsx:137-156); Red branch `fix={row.fix}` (:1279), Yellow branch `row.fix !== null` (:1291). Fix strings no longer dropped.
- Grep-proof E5a2: zero bare `interaction.reply(` remain in the 4 in-scope handler files outside `respondCompat` internals + the already-safe connector catch fallback (:204-208).
- No new BotEvents: registry.ts union unchanged/closed (no InteractionCreate/Ready representable); loaders.ts EVENT map unchanged; the 4 in-scope modules emit no new events (connector [], xp MessageCreate only, moderation MessageCreate only, giveaway []).
- Secrets: none touched, printed, or transmitted. No package.json/lockfile/.env edits; no git restore/commit; no prod/SSH/GHCR. Presence-by-shape only.

## E5 acceptance criteria vs evidence
- [x] >3s slow handler completes with NO 10062 path: dispatcher defers before execute; test `defers before execute` asserts defer-first ordering, 1 defer, 0 error replies (dispatcher.test.ts:286-315).
- [x] Simulated 429 with retry-after backs off and completes: test asserts 2 defers + sleep [5ms] + execute called once (317-331).
- [x] Exhausted retries → honest error, never silent drop: test asserts execute never called, exactly 1 reply containing /rate-limit/i, no throw, `dispatcher-ack-error` logged (333-353). Error reply itself is in a bare try/catch and can never escape.
- [x] Fix card: Red row renders `check: detail` + fix action + retry (`runScan`); Yellow fix as secondary line; counts/summary/publish Red-block (`failingNames`, page.tsx:589-594) untouched.
- [x] Suites green (with the workspace-dir caveat above).

## Interface-Match Verdict (the core of this review)
- IN-SCOPE MATCH (dispatcher ↔ connector/xp/moderation/giveaway): AGREE. Dispatcher defers first (skipped if already replied/deferred; cooldown-deny replies pre-ack and returns early, never reaching execute). All 4 handlers branch `followUp` when `deferred || replied`, else `reply` — exactly one message per branch. Deferred+followUp and undeferred+reply paths line up; no double-ack possible between these two halves. followUp-over-editReply design note is sound (Ephemeral payloads throughout: denials, guards, validation errors — editReply could not carry them).
- MERGED-TREE MISMATCH (dispatcher ↔ tickets/reaction-roles): DOUBLE-ACK PATH EXISTS. The dispatcher defers ALL commands in the registry (all 7 modules via boot-modules.ts/feature-modules.ts → loaders.ts), but tickets/handler.ts (~10 bare `interaction.reply(` in success paths; only the catch fallback at ~515 is defer-safe) and reaction-roles/handler.ts (~10 bare `reply(`; only ~567 fallback is safe) were NOT converted (outside E5's spec scope). Under defer-first, every successful /ticket and /role command will throw InteractionAlreadyReplied on its bare reply(); the module try/catch then sends a spurious failure followUp — the action (ticket opened, picker posted) succeeds while the user is told it failed. Welcome module has no slash replies (grep: no matches) and is safe.
- Per VERDICT RULES ("instant FAIL: double-ack path"), the merged tree fails E5's objective ("slash commands stop racing") even though every in-scope file is correct. This is a spec-scoping defect (E5 converted 4 of 6 reply-bearing modules), not a builder error.

## Known Limitations / observations (not verdict-driving)
- Handler unit tests only exercise the undeferred path (fakes `replied:false, deferred:false`); deferred-ack proof rests on dispatcher tests + code inspection. No live-Discord verification (per constraints).
- `withRateLimitRetry` wraps full `execute()`: a 429 thrown mid-handler (e.g. on followUp after a channel.send already happened) retries the WHOLE execute — possible duplicate side effects (double giveaway post). Bounded (default 2 retries) but not idempotent. Recommend a follow-up wave: retry only ack/error-reply steps, not execute — or document handler idempotency.
- page.tsx working-tree diff (301 insertions) mixes non-E5 changes (publish/rollback, M-10 note) with E5b's scan wiring; scan semantics verified intact as inspected, but E5-only isolation is impossible on this tree.
- All E5 code files are untracked (`??`) on disk — artifacts confirmed present by Read, but uncommitted. Trust-artifacts check passes for existence; commit is orchestrator's call (I commit nothing per constraints).

## Dependencies Added
None (review added nothing).

## Assumptions Made
- discord.js 14 semantics (`reply` throws InteractionAlreadyReplied when deferred/replied; `followUp` valid post-defer with Ephemeral) taken from E5a2's disk-verified 14.27.0 reading + dispatcher fake behavior; not re-verified against live Discord per constraints.

## Open Questions for Orchestrator
1. Tickets + reaction-roles bare-reply conversion: spawn a follow-up wave (same respondCompat pattern, 2 files) BEFORE enabling defer-first in production? Shipping E5 as-is breaks /ticket and /role user-visible responses. This is the FAIL remediation.
2. Execute-level 429 retry idempotency: accept whole-execute retry, or narrow retry to ack/error-reply steps only? Recommend the latter.
3. page.tsx carries non-E5 changes in the same file — confirm E6b tail ownership/signature compatibility (`runScan` intact) before parallel merge.
