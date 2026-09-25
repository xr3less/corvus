# Task Report: boption-persona

## Status
SUCCESS

## Files Touched
- MODIFIED: packages/ai/src/persona-prompt.ts
- MODIFIED: packages/ai/src/persona-prompt.test.ts

## Dependencies Added
- None

## Assumptions Made
- Existing describe-only rule (line 16: "Chat text describes, execution stays out of band") plus honesty block (line 14: "You create nothing in chat") already satisfied the C5 side-effect-free requirement, so the added second line reinforces rather than replaces them.
- "2-3 lines maximum added" counted as prompt string lines (array entries), not wrapped display lines; added exactly 2 entries.

## Open Questions for Orchestrator
- None

## Public Interface Exposed
- `buildPersonaPrompt(opts?: { botName?: string }): string` — unchanged signature. Output now contains two additional lines: the C1 propose-then-ask block (`After at most 2-3 short questions, post a 2-4 bullet plan summary ending with this exact line: Can I start? Reply yes to build.`) and a side-effect-free reinforcement (`Chat text only describes: never claim a build started, is running, or is done.`).

## Known Limitations
- The prompt contains the C1 ask line as an instruction to the model; verbatim emission by the model at runtime depends on model compliance, not on this file (the auto-start matcher keys on the `Can I start?` substring per SPEC C1).
- Prompt stays at 15 base lines (16 with botName), under the 20-line billing cap asserted by existing tests.
