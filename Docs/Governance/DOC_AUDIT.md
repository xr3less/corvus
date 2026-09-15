# DOC AUDIT — Keeping Docs True

## Status: CANONICAL (template)

> The system's single biggest threat is **staleness**: docs that no longer match reality are worse than no docs, because they mislead with confidence. This file is the concrete defense — a short, repeatable check that the documentation still tells the truth. Project-independent; copy unchanged.

---

## When to run it

- At the **end of every phase** (`PLAN.md`).
- **Before any validation session or public launch** — a stale doc in front of a user or a new agent is a real cost.
- Any time an agent reports that a doc contradicted what it found in the code.

The orchestrator runs the audit (or spawns a read-only `Explore` agent to do it) and records the result as a one-line note in `PROJECT_STATUS.md` + any findings in `LESSONS.md` if a pattern emerges.

---

## The checklist

Go through each line. Every "no" is a finding to fix in the same pass (or log as a `> TODO` if it's bigger).

### Truthfulness (does it match reality?)

- [ ] **File-structure map** in `07_folder_structure_and_standards.md` matches the actual folders/files in the repo. New significant files are listed; deleted ones are removed.
- [ ] **`PROJECT_STATUS.md`** describes where the project actually is today — phase, blocker, next step.
- [ ] **`PLAN.md`** checkboxes reflect what's really done vs. not. No "done" box for unfinished work; no unchecked box for finished work.
- [ ] **`05`–`10`** describe the system as it's actually built (stack, data model, pipeline, deployment), not an old plan.
- [ ] **`02_strategy.md`** still reflects the current strategy (or the change is logged in `DECISIONS.md` and old version archived).

### Completeness (is anything missing?)

- [ ] No doc marked CANONICAL or "done" still contains unfilled `{{placeholders}}` or `> TODO` markers.
- [ ] Every technical term used in the docs has a `GLOSSARY.md` entry.
- [ ] Every significant decision made since the last audit has a `DECISIONS.md` entry.
- [ ] No active doc references a file or folder that no longer exists.

### Integrity (do the links and layers hold?)

- [ ] Cross-references point to files/sections that exist (no dead links).
- [ ] No active doc links into `_archive/`.
- [ ] **`KNOWN_ISSUES.md`** is truthful — every open row is still open, resolved rows moved to its resolved log with a fix reference, and no fix was silently abandoned without a row.
- [ ] Statuses are honest: anything DRAFT that's actually locked → CANONICAL; anything superseded → archived with a reason.

---

## Output

A pass is one line in `PROJECT_STATUS.md`: `Doc audit YYYY-MM-DD — clean` or `... — N findings fixed`. If the audit keeps surfacing the same kind of drift, that's a lesson — record it in `LESSONS.md` and consider a rule that prevents it.
