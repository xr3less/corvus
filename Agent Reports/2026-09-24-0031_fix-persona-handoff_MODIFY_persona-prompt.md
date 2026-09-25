# Task Report: fix-persona-handoff

Timestamp: 2026-09-24-0031 (system clock)
Agent id: fix-persona-handoff

## Status

SUCCESS (with an important process note — see "Concurrent writer" below).

## Files Touched

- MODIFIED: `packages/ai/src/persona-prompt.ts` — added the plain-language auto-start
  handoff line (:24). The stale-control copy removal (old :15-16) and the re-ask rule
  were already present on disk when this agent started; see "Concurrent writer".
- MODIFIED: `packages/ai/src/persona-prompt.test.ts` — added the handoff pin
  (`hands off in plain words: a written confirmation is all it takes`, :192-202).
- REGENERATED: `packages/ai/dist/` (gitignored; `npm run build --workspace @corvus/ai`).
  `apps/web` resolves `@corvus/ai` to `dist/index.js` at runtime, so a source-only
  change would not have reached the page.
- NOT touched (founder-locked, per task): `apps/web/app/dashboard/new/page.tsx`,
  `page.test.tsx`, `apps/web/app/api/builder/verdict/route.ts`, `app/api/chat/route.ts`.

## Concurrent writer (harness note — read this)

This agent's scope file was rewritten **by a peer session** (`corvus-51`, interactive,
idle) while this agent was reading it, at 00:14:27 (source) / 00:23:48 (second edit).
The peer is the author of the no-control replacement (:15-16), the re-ask rule (:23),
the Turkish acceptance-variant list, and `Agent Reports/2026-09-24-0023_fix-ui-autostart_MODIFY_persona-prompt.md`.
This agent did **not** duplicate that work; it verified it (all gates green, dist
rebuilt in sync by hash) and then added the one acceptance criterion that was still
unmet. Two writers touched one file inside the same half hour — the orchestrator's
disjoint-write-scope rule (Hard Rule 14) was violated at spawn time, not by either
agent's execution. Flagging, not escalating: no work was lost (the final file contains
both contributions and every pin is green).

## Dependencies Added

- none.

## Assumptions Made

- The ask line stays English and byte-exact (`Can I start? Reply yes to build.`); both
  gates match that substring literally (`page.tsx:52`, `route.ts:109`), so the Turkish
  handoff rides *alongside* it rather than translating it. A translated ask line would
  have closed the auto-start path.
- "Turkish handoff sentence" in the acceptance criteria means the *instructed reply
  content* (what the model is told to say to the owner), not the prompt's own language.
  Rewriting the whole prompt in Turkish would break ~20 verbatim English pins and is not
  what any gate reads. If the orchestrator meant the prompt itself in Turkish, that is a
  different task and should be re-specified.
- The handoff line is unconditional (sits with the ask rules), not gated on detected
  language — the prompt cannot detect locale, and the owner here writes Turkish.

## Open Questions for Orchestrator

1. **Peer report contains two live blockers outside this file.** `Agent Reports/2026-09-24-0023_fix-ui-autostart_MODIFY_persona-prompt.md`
   documents B1 (`POST /api/bots` → 403 `trial_bot_limit` on the dev account, so `botId`
   never commits and no verdict POST is possible) and B2 (`POST /api/builder/verdict` →
   500 `could not judge reply`, isolated to system-only message arrays at `route.ts:434-476`).
   Both reproduce on the founder's path. **The copy fix alone does not make the founder's
   thread work.** A follow-up task is required; neither is in this scope. This agent did
   not independently re-derive B1/B2 (the task forbade touching those files); the peer's
   report is the source.
2. Report filename: the task text named `..._MODIFY_persona-prompt.md` and the schema's
   real-clock timestamp was used (`2026-09-24-0031`). The task's own example timestamp
   (`2026-09-23`) was stale relative to the system clock.

## Public Interface Exposed

- `buildPersonaPrompt(opts?: { botName?: string }): string` — **unchanged signature**.
  Output: 17 lines plain / 18 with `botName` (cap 20 in the test budget). Two byte-exact
  copies of `Can I start? Reply yes to build.`; zero control/button names; no `!`; no emoji.
- `buildVerdictPrompt`, `buildBriefPrompt` — untouched.

## Known Limitations

- **Not verified in a running browser by this agent.** The peer verified the reply content
  live (Playwright, dev stack) before this agent's line existed. This agent verified the
  gates, the dist sync, and the guards by break-test; it did **not** re-drive the live page
  after adding :24. Per LESSONS §2.4 the flow is not "done" until someone completes it in the
  running app — and per B1/B2 above it cannot complete there yet regardless of copy.
- Guard-3 (Turkish handoff) was proven by removing the line and watching 1 test fail;
  restore re-verified 42/42. Guard-1/2 (no-control pins) proven by re-injecting the stale
  `Build this bot` copy and watching 2 tests fail.
- `dist/` is gitignored; a fresh clone without `npm run build --workspace @corvus/ai`
  would serve whatever dist it was built with.

## Verification (file:line evidence, all on the merged tree at md5
`persona-prompt.ts=09ba07372610a8d49f936bb05bb48a03`, `persona-prompt.test.ts=1f31d46cfc0073fa89a46daeb728e5e0`)

| gate | command | result |
|---|---|---|
| handoff line present | `grep -n "yazman yeterli" packages/ai/src/persona-prompt.ts` | `:24` |
| zero control copy in source | `grep -c "Build this bot\|product buttons" packages/ai/src/persona-prompt.ts` | `0` |
| zero control copy in dist | `grep -c "Build this bot\|product buttons" packages/ai/dist/persona-prompt.js` | `0` |
| dist carries new line | `grep -c "yazman yeterli, ben baslatiyorum" packages/ai/dist/persona-prompt.js` | `1` |
| dist matches source | `npm run build --workspace @corvus/ai` then grep | rebuild clean, line present |
| ask-line copies | `buildPersonaPrompt().split('Can I start? Reply yes to build.').length-1` | `2` |
| line budget | `buildPersonaPrompt().split('\n').length` plain / botName | `17` / `18` (cap 20) |
| no `!` | `buildPersonaPrompt().includes('!')` | `false` |
| ai unit | `npm test --workspace @corvus/ai` | **158 passed / 6 files** (42 in persona-prompt.test.ts) |
| ai typecheck | `npm run typecheck --workspace @corvus/ai` | clean |
| web typecheck | `npx tsc --noEmit` (apps/web) | clean |
| eslint | `npx eslint packages/ai/src/persona-prompt.ts packages/ai/src/persona-prompt.test.ts --max-warnings 0` | clean |
| prettier | `npx prettier --check` (both files) | clean |
| web consumers | `npm test --workspace @corvus/web -- app/api/chat/route.test.ts app/api/builder/verdict/route.test.ts app/dashboard/new/page.test.tsx` | **106 passed / 3 files, zero edits to those files** |
| guard 3 broken | remove :24 → run | **1 failed / 41 passed** (pin catches it) |
| guards 1+2 broken | re-inject `product buttons … Build this bot` → run | **2 failed / 40 passed** (no-control pins catch it) |
| gates untouched | `page.tsx:207`, `route.ts:424-426` | adjacency + ask-line gates read as before |

## Copy shipped (prompt lines 15-16 + new 23-24)

```
- Describe what will happen, offer next steps in words, and never name a control or ask the owner to press or click anything.
- Drafts, simulations and publishes are started by the product from the page, never by chat text: never ask the owner to run them another way. Chat text describes, execution stays out of band.
…
- After at most 2-3 short questions, post a 2-4 bullet plan summary ending with this exact line: Can I start? Reply yes to build.
- When the owner signals acceptance in any wording (yes, evet, tamam, tamamdir, basla, "sen karar ver", "you decide"), you must post the 2-4 bullet plan AGAIN, ending with that same exact line: … not only in the first plan.
- Alongside that exact line, tell the owner, in their own language, that a written confirmation is all it takes, because the product starts the build from that reply. In Turkish say it plainly: yazman yeterli, ben baslatiyorum.   ← added by this task
```
