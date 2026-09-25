# Task Report: aibuild-prompts

## Status
SUCCESS

## Files Touched
- MODIFIED: packages/ai/src/persona-prompt.ts
- MODIFIED: packages/ai/src/persona-prompt.test.ts
- CREATED: Agent Reports/2026-09-22-1939_aibuild-prompts_MODIFY_verdict-prompts.md

## Dependencies Added
- None

## Assumptions Made
- Token discipline: builders embed caller-provided inputs (plan ≤1000, reply ≤500, thread ≤3000 per SPEC V2) with no truncation inside the builders — capping is the caller's job (V2 route).
- Verdict strict-JSON parse fallback (garbage → unclear) lives in the V2 route, not in the pure builder.
- Prettier already formatted the new lines; no style deviations introduced.

## Open Questions for Orchestrator
- None

## Public Interface Exposed
- `buildVerdictPrompt(planText: string, userReply: string): string` — pure; returns system+context lines embedding planText and userReply; demands EXACTLY one `{"verdict":"yes"|"no"|"unclear"}` object and no other text; unclear on hedged/conditional/off-topic/change-asking replies; bare greeting never yes; judges THIS plan only; one-line no-code/no-token prohibition.
- `buildBriefPrompt(threadText: string): string` — pure; returns distillation instruction embedding threadText; demands 3–8 tight requirement lines (wants + answers + confirmed plan items, guesses marked `[default]`); plain verbs, no code, no token/invite talk; output ≤1500 chars; one-line no-code/no-token prohibition.
- `buildPersonaPrompt(opts?: { botName?: string }): string` — unchanged, byte-identical C1 ask line (`Can I start? Reply yes to build.`).

## Known Limitations
- Builders do not enforce input caps or clamp output length themselves; V2 route must cap inputs and clamp the brief to 1..2000 (SPEC V2).
- Builders do not JSON-parse or validate model output; V2 route owns the strict parse with unclear fallback.
- What this task does NOT cover: V2 API route, V3 page wiring, V4 review gate.
