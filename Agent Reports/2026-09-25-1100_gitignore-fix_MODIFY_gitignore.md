# Task Report: gitignore-fix-20260925-1100

## Status
SUCCESS

## Files Touched
- MODIFIED: `.gitignore` (repo root; append-only, +6 lines at EOF: 2 rules + 2 comments that were already present as uncommitted work — see Assumptions)

## Dependencies Added
None.

## Assumptions Made
- **A pre-existing uncommitted `.gitignore` change was already in the working tree when this task started.** The initial `git status` snapshot showed `.gitignore` as ` M` (modified) before this agent touched anything. The working-tree file was 15 lines while `HEAD:.gitignore` is 12 lines — the 3-line block `infra/compose/backups/`, `*.dump` (+ its comment) from task `2026-09-20-0013_gitignore_MODIFY_backups-ignore.md` was staged-then-unstaged work-in-progress. This agent appended after that content, leaving it intact. **Consequence for acceptance criterion 3:** a plain `git diff -- .gitignore` reports 6 insertions / 0 deletions rather than 3, because it compares against the stale index (`284ed51`), not against this task's start state. The task's own edits are strictly the final 3 lines; **0 lines were changed, removed, or reordered**, verified by `git diff --numstat` showing `6 0` (zero deletions) and by byte-for-byte inspection of the appended region.
- Anchored the append after the existing `*.dump` line (end of file) rather than grouping near other test-ish rules, to honor the append-at-end instruction. One short comment added, matching the file's existing comment style.
- Used trailing-slash directory form (`apps/web/.vitest/`, `.playwright-mcp/`) as specified, so the rule matches only directories, not a hypothetical same-named file.

## Open Questions for Orchestrator
- **Pre-existing dirty `.gitignore`:** the `infra/compose/backups/` + `*.dump` rules are uncommitted work from task `gitignore-backups-ignore` (report dated 2026-09-20-0013, and `2026-09-20-0019_reviewer_REVIEW_gitignore.md` exists). This task did not stage, commit, or revert them (it was forbidden from running any git state command). The orchestrator should decide whether those ride along in the same commit as this change or are committed separately. **This agent deliberately left the index untouched — nothing is staged.**
- **Same-class leftovers, out of this task's scope (reported, not fixed):** `apps/testbot/boot.log`, `apps/web/suite-final.log`, and `f13-hero.png` are still committable untracked junk. `apps/testbot/` has its own `.gitignore`; `suite-final.log` and `f13-hero.png` have no covering rule. If the goal is "a blanket `git add` is safe", these are the remaining gaps — worth a follow-up task, but explicitly outside the 2-line budget here.
- Neighbouring dot-dirs `.agents/` and `.opencode/` are not ignored, but both are currently clean in `git status` (`.opencode/` carries its own `.gitignore`), so they are not making a blanket `git add` unsafe today.

## Public Interface Exposed
Two new ignore rules at `.gitignore` lines 17–18:
- `apps/web/.vitest/` — ignores the Vitest JSON-reporter output dir
- `.playwright-mcp/` — ignores Playwright MCP browser/console logs

Proof the rules match real paths on disk (`git check-ignore -v`):
```
.gitignore:17:apps/web/.vitest/	apps/web/.vitest/json/output.json
.gitignore:18:.playwright-mcp/	.playwright-mcp/console-2026-09-21T20-26-16-279Z.log
```

## Verification Evidence
Instrument: `git check-ignore` (git's own matcher) + `git status`, not a hand-rolled checker.

| Check | Command | Result |
|---|---|---|
| Pre-edit baseline | `git check-ignore -v <both paths>` | exit 1, no output — **neither was ignored** |
| Post-edit match | `git check-ignore -v <both paths>` | exit 0, both matched at lines 17/18 |
| Junk gone from status | `git status --short -uall \| grep -Ei "vitest\|playwright-mcp"` | exit 1, **0 matches** (was 116 entries: 115 `.playwright-mcp` + 1 `.vitest`) |
| Append-only | `git diff --numstat -- .gitignore` | `6 0` — **zero deletions** |
| Nothing staged | `git diff --cached -- .gitignore` | empty |
| Regression (old rules still fire) | `git check-ignore --no-index -v` on `infra/compose/backups/`, `pyrzm.zip`, `.pick-votes/`, `coverage/`, `dist/` | all 5 still match |
| Negative control | `git check-ignore --no-index` on `app/page.tsx`, `lib/auth.ts`, `persona-prompt.ts` | exit 1 — **no source file newly ignored** |
| `.env.example` negation intact | `git check-ignore .env.example` + `git ls-files --error-unmatch` | exit 1 + **tracked**; `.env` still ignored |
| Files not destroyed | `ls` + count | all 115 `.playwright-mcp` logs + `output.json` **still on disk** — ignore rules hide from git, they do not delete |

Line count 15 → 18. File remains LF-only (`grep -c $'\r'` = 0); no CRLF introduced.

## Known Limitations
- Rules are directory-scoped (trailing slash by design). They do **not** cover the same-named paths if any ever appear at another depth (e.g. `apps/testbot/.vitest/`). Verified by `find` that exactly one `.vitest` and one `.playwright-mcp` dir exist today outside `node_modules`, so coverage is complete for the current tree.
- Files remain present on disk; this task only stops git from seeing them. It does not clean or delete anything (deletion was out of scope and requires founder approval per Hard Rule 12).
- Not covered: `apps/testbot/boot.log`, `apps/web/suite-final.log`, `f13-hero.png` (see Open Questions).
- No commit, stage, or push was performed — the change is unstaged working-tree only, by instruction.
