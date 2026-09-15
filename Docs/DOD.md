# DOD — Definition of Done

## Status: CANONICAL (template)

> The single, canonical answer to "is it actually done?" Quality criteria were scattered across the Reviewer gate, acceptance criteria, and `GLOBAL_RULES.md`; this file gathers them in one place so nothing is ambiguous. "It compiles" is not "it works." Project-independent; copy unchanged.

---

## 1. A single TASK is done when…

- [ ] **It works, not just compiles.** Typecheck + lint exit 0; the app runs; the relevant flow completes end-to-end without a runtime error.
- [ ] **It matches the design** (if it has UI). Compared against `04_design_language.md` or the named screenshot — layout, spacing, color, type, and interactive states all match.
- [ ] **It's tested.** At least one passing test per exported function / component prop / API route (`07_folder_structure_and_standards.md §5`).
- [ ] **It's safe.** No hardcoded secrets, keys, tokens, or PII. Inputs at trust boundaries are validated.
- [ ] **It's accessible** (if it has UI). Keyboard-navigable, visible focus, adequate contrast.
- [ ] **It passed the Reviewer gate.** A Reviewer sub-agent verified the above (`AGENT_CONSTITUTION.md §Workflow`).
- [ ] **It's recorded.** Touched files are reflected in `07`'s file-structure map; any significant choice is in `DECISIONS.md`.
- [ ] **Docs are current at the task's scale.** See the scaling table below — small tasks do less bookkeeping, never zero.

### Doc updates scale with task size

The full bookkeeping ritual exists so nothing is lost — but applying all of it to a one-line fix wastes effort, and wasted ritual gets skipped, and skipped ritual rots the docs. Scale it deliberately, matching the Phase 0 triage in the global orchestrator prompt:

| Task size | Required doc updates |
|---|---|
| **Small** — typo, one-line fix, copy tweak (single-agent, light review) | `PLAN.md` tick |
| **Medium** — one component/feature, full review gate | Small + `PROJECT_STATUS.md` + `07` (file map, and surface map if user-visible) + `KNOWN_ISSUES.md` if a defect was found or deferred |
| **Large** — multi-component, phase-level | Medium + `DECISIONS.md` entry for significant choices + `00_START_HERE.md` if the doc set changed |

---

## 2. A PHASE is done when…

- [ ] Every task in the phase meets the task DoD above.
- [ ] The phase's **cost & risk** note in `PLAN.md` was checked against reality (and any surprise logged in `LESSONS.md`).
- [ ] No `> OPEN QUESTION` or `> DECISION NEEDED` marker is left unresolved within the phase's scope.
- [ ] The founder has been told, in plain language, in conversation: what got done, what changed, what's next.

---

## 3. The product is VALIDATED when…

> This is the highest bar and the one that actually matters (`GLOBAL_RULES.md §2`, Prime Directive).

- [ ] Real target users — not friends, not the team — have actually used it.
- [ ] Their behavior was observed and recorded (`03_validation_plan.md`, evidence in `Screenshots/`).
- [ ] The result was measured against the success/fail bar that was set **in advance**.
- [ ] A commit / pivot / stop decision was made on the data and logged in `DECISIONS.md`.

Remember: "deployed" is not "validated." A live URL with no users does not tick a single box in this section.
