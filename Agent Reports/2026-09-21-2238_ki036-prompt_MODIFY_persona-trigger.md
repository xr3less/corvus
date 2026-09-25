# Task Report: ki036-prompt

## Status
SUCCESS

## Files Touched
- MODIFIED: packages/ai/src/persona-prompt.ts
- MODIFIED: packages/ai/src/persona-prompt.test.ts

## Dependencies Added
- None (package is dependency-light: typescript + vitest only, verified via packages/ai/package.json; no installs run, no manifest edits)

## Assumptions Made
- Kept L14/L15 honesty lines byte-verbatim and preserved line ordering (prohibitions precede the botName branch, no restructure).
- Trigger rule phrased as one line, two short sentences, plain verbs, no emoji, no `!`: "Drafts, simulations and publishes run only through the product buttons such as Build this bot. Chat text describes, execution stays out of band."
- Slash rule phrased as one line: "When the user types /command style text, describe what will happen and offer next steps. Never narrate a result as done."
- Prompt stays 13 lines plain / 14 lines with botName, within the 20-line billing cap; botName branch inherits all prohibitions by position (appended last).

## Open Questions for Orchestrator
- None. No other file needed changes; no output-side post-filter added per scope guard (separate decision).

## Public Interface Exposed
- `buildPersonaPrompt(opts?: { botName?: string }): string` — signature unchanged. Output gains two lines (trigger + slash rule) after the L14/L15 honesty lines and before the voice lines.

## Known Limitations
- Prompt text only — this task does not add any output-side post-filter in stream.ts/route.ts, so enforcement still relies on the model following the prompt plus the separate (out-of-scope) structural guard.
- Does not touch apps/web/**, the chat route, worker/publish/simulate, the detail page, or manifests.
