# Task Report: expansion-e2b-builderkinds

## Status
SUCCESS

## Files Touched
- MODIFIED: packages/ai/src/builder-prompt.ts (two kinds lines were present as an uncommitted working-tree change on entry; verified verbatim against E1's final list and config.ts, left byte-identical after a temporary break-the-guard edit was reverted)
- CREATED: packages/ai/src/builder-prompt.parity.test.ts (3-test parity net over the executable-kind vocabulary)

## Dependencies Added
- None. No manifest edits, no installs.

## Assumptions Made
- E1's report (Agent Reports/2026-09-23-0915_e1_CREATE_tickets-runtime.md) is the vocabulary authority per SPEC wave-E2 whitelist rule; its 8-tuple (welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles) copied verbatim, order preserved.
- builder-prompt.ts's pre-existing uncommitted kinds lines were prior in-wave work, not drift: they match E1's list and config.ts RUNTIME_KINDS exactly, so no content change was needed — only verification + the parity test.
- No web research needed: the kind list is an in-repo locked contract (SPEC + E1 report + config.ts on disk), not a current-facts question. No versions, model names, or APIs involved.
- Parity test deliberately does NOT import apps/gateway/src/runtime/config.ts (@corvus/ai must not depend on the gateway package); the duplication is intentional and the test is the drift net. Comment in the test file says so.

## Open Questions for Orchestrator
- None. No scope expansion needed; no other files require changes.

## Public Interface Exposed
- buildBuilderPrompt() output now contains exactly two added lines vs HEAD: `Executable behavior kinds: welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles. Emit ONLY these kinds.` + `Anything outside these kinds is dropped at runtime — never emit it.` The 4 standing one-liners + fenced-JSON contract are byte-identical (existing 11 verbatim tests still green).
- Parity test exports nothing; it pins EXECUTABLE_KINDS literal list (comment cites E1 report filename + config.ts) and asserts: (1) every kind named on the kinds line, (2) exact ordered list equality, (3) honest runtime-drop line present.

## Known Limitations
- Break-the-guard proof (live, 2026-09-23): deleted `tickets,` from the kinds line -> parity suite red (2 failed, 1 passed), then restored -> full ai suite green (6 files, 135 tests). Proof output captured, file restored byte-identical.
- Gates run: `vitest run` 135/135 green; `tsc --noEmit` clean; `eslint --max-warnings 0` on both touched files clean; `prettier --check` on both clean.
- Full web/gateway suites NOT run (out of scope; E2's other files belong to sibling tasks). ai suite green only.
- Security: no secrets read/printed (presence checks n/a — no secret-adjacent code touched); no package.json/lockfile/.env edits; no npm install; no git restore/commit (read-only git diff/status/show only); no SSH/Contabo/GHCR/production contact.
