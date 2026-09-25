# Review Report: reviewer-ki036-prompt (Agent B persona trigger fix)

## Verdict
PASS

Agent B's change meets every element of SPEC §4 Agent B acceptance and breaks
nothing in the §5 must-not-break list visible from this scope. No fix agent needed.

## Per-criterion evidence (file:line cites)

1. TRIGGER line names `Build this bot`, states chat-describes + execution-out-of-band — PASS
   - `packages/ai/src/persona-prompt.ts:16`:
     `Drafts, simulations and publishes run only through the product buttons such
     as Build this bot. Chat text describes, execution stays out of band.`
   - Covers all three SPEC elements: subject (drafts/simulations/publishes),
     only-via-buttons with the named button, chat-describes + out-of-band
     execution. Wording is `stays out of band` where the SPEC paraphrases
     `is out-of-band` — semantically identical, and the tests lock the actual
     wording, so this is accepted as written.

2. SLASH rule present — PASS
   - `packages/ai/src/persona-prompt.ts:17`:
     `When the user types /command style text, describe what will happen and
     offer next steps. Never narrate a result as done.`
   - Handles `/command`-style input by describing, explicitly forbids narrating
     a result as done, exactly per SPEC.

3. L14/L15 honesty lines verbatim, ordering kept (prohibitions precede botName branch) — PASS
   - `packages/ai/src/persona-prompt.ts:14` (L14) and `:15` (L15) match the SPEC
     §0-quoted fragments exactly (`You create nothing in chat: never claim
     a draft is ready, a simulation is running, or a bot is live on a server.`
     / `Describe what will happen, offer next steps, and point to the product
     buttons that run draft, simulate and publish.`). No rewording, no reorder:
     the two new lines (:16 TRIGGER, :17 SLASH) are inserted AFTER L14/L15 and
     BEFORE the voice lines, and the `botName` branch (`:23-25`) remains an
     append-last push inheriting all prohibitions by position.

4. ≤20 lines BOTH variants, no emoji, no `!` — PASS
   - Lines array is 13 entries (`:8-22`), 14 with `botName`. Both under the
     20-line billing cap; enforced by test at
     `packages/ai/src/persona-prompt.test.ts:94-99` (green in the run below).
   - No emoji and no `!` in prompt OUTPUT, enforced by test at `:88-92`
     (green). Note for precision: the SOURCE contains `!==` at `:23`
     (`opts.botName.trim() !== ''`) — that is code, not prompt text, and the
     no-`!` rule governs the emitted prompt. No violation.
   - Nit (not a fail): `:43` retains an older looser `≤25` assertion alongside
     the new strict `≤20` test. Redundant but harmless; the strict test governs.

5. Tests are mutation-grade (literal phrases, both variants) — PASS
   - `packages/ai/src/persona-prompt.test.ts:102-138` (`trigger + slash rules
     (KI-036)`, 6 tests) assert literal substrings, not topics:
     `Build this bot` + `run only through the product buttons` (:103-113),
     `Chat text describes` + `execution stays out of band` (:115-125),
     `/command` + `Never narrate a result as done` (:127-137) — each in BOTH
     plain and `botName` variants.
   - Mental mutation check: deleting TRIGGER line (:16) reddens 4 tests;
     deleting SLASH line (:17) reddens 2 tests; deleting either half-sentence
     reddens its paired assertions. No test would stay green after its line is
     removed. Mutation-grade confirmed.

6. No scope leak by this agent — PASS (with notes)
   - Builder report lists only the two in-scope files; both exist on disk with
     the reviewed content.
   - `git status --porcelain -- packages/ai/` shows `M ai.test.ts`, `M index.ts`,
     `M lanes.ts` (modified) plus `?? persona-prompt.ts`, `?? persona-prompt.test.ts`
     (untracked). The three modified files are NOT claimed by this builder and
     belong to other waves / pre-existing tree dirt — not attributed to Agent B.
     `apps/web/app/dashboard/new/page.tsx` + `page.test.tsx` modifications are
     consistent with the parallel Agent A (ki036-newpage) scope.
   - Label nit: the persona files are UNTRACKED at HEAD (`git log` for the path
     is empty), so the builder CREATEd rather than MODIFYed them despite the
     SPEC's MODIFY label. Content is what the SPEC demands; the label mismatch
     is cosmetic and needs no fix.

## Gate outputs (real commands, run by reviewer from packages/ai)

- `npx tsc --noEmit` → exit 0 (TSC_EXIT:0). No type errors.
- `npx vitest run` → exit 0 (VITEST_EXIT:0). 5 files, 118/118 tests passed,
  including 23/23 in `persona-prompt.test.ts` (6 new KI-036 tests green).
  (`ai.test.ts` PG test loud-skips without DATABASE_URL — pre-existing,
  unrelated, skips cleanly.)
- `npx prettier --check src/persona-prompt.ts src/persona-prompt.test.ts` →
  exit 0 (PRETTIER_EXIT:0). Both files conform.
- ESLint: N/A — `packages/ai/package.json` scripts expose only
  `build`/`test`/`format`/`typecheck`; no lint script exists, so per protocol
  this is stated, not invented or silently skipped.

## Notes for orchestrator (not failures)

- `packages/ai/dist/` is STALE (built prompt reports 11/12 lines vs source
  13/14). `dist/` is build output; I did not rebuild (review-only scope).
  The merged-tree gates / build step should regenerate it.
- Merged tree is dirty from multiple waves (pre-existing + parallel Agent A).
  Merged-tree `tsc`+ESLint+Prettier+vitest per SPEC §6-2 remains orchestrator
  work; this review covers the Agent B scope only.
- Honesty block tests (`:140-158`) confirm L14/L15 phrases are asserted, so the
  verbatim lines are doubly locked (source order + test phrases).

## Fix instructions
None. Verdict is PASS — no fix agent, no re-spin.
