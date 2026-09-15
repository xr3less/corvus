# HOW TO USE THIS TEMPLATE

## Status: CANONICAL (meta)

> This file is about the template itself, not about any one project. It explains how to start a new project from this folder, and how to keep the template improving over time. When you instantiate a project, you can delete this file from the copy (or keep it — it's harmless). The MASTER copy of the template keeps this file forever.

---

## Template version

**Current version:** `v1.3.0`
**Released:** 2026-08-25

Every project records, in its `00_START_HERE.md`, which template version it was started from. When the master template improves, older projects know what they're missing and can pull the change deliberately.

---

## Part A — Start a new project (the 10-step checklist)

1. **Copy** this whole folder. Rename it to the new project.
2. **Read** `Governance/GLOBAL_RULES.md` — these principles carry over unchanged. Do not rewrite them.
3. **Read** `LESSONS.md` — the company's accumulated hard-won lessons. Start the project already knowing them.
4. **Fill `00_START_HERE.md`**: replace `{{PROJECT_NAME}}`, write the one-paragraph "what is this," and stamp the template version you started from.
5. **Fill the product docs** `01`–`04` with the founder (vision, strategy, validation, design). Per `GLOBAL_RULES.md §3.4`, finish these before any build.
6. **Fill the engineering docs** `05`–`10` once the stack is chosen. Record stack choices in `DECISIONS.md`.
7. **Start the living logs**: first real entry in `DECISIONS.md`, `KNOWN_ISSUES.md` empty and ready (it fills as defects and failed attempts appear).
8. **Seed `GLOSSARY.md`** with any project-specific terms as they appear.
9. **Work the plan**: `PLAN.md` is your live checklist; tick boxes, keep `PROJECT_STATUS.md` current.
10. **Sweep for leftovers**: search the whole folder for `{{` and for `> TODO` — anything unfilled stays at `DRAFT (skeleton)`.

> Rule of thumb: `Governance/` and this meta layer are **copied unchanged**. The numbered `01`–`10` docs are **filled in** per project. Everything else is **lived in** day to day.

---

## Part B — Keep the template improving (the feedback loop)

A template that never changes rots. This one is designed to compound (see `LESSONS.md §The feedback loop`):

1. A project records a lesson in its own `LESSONS.md`.
2. When the same lesson appears in **2+ projects**, promote it into this MASTER template — usually a new principle in `Governance/GLOBAL_RULES.md` or a fix to a numbered doc.
3. **Bump the version** below and add a changelog line.
4. Future projects inherit it automatically; existing projects can pull it when they choose.

**Who does this:** the orchestrator, at the end of a project or major phase, asks "what did we learn that every future project should inherit?" and proposes promotions to the founder.

---

## Part C — Template changelog

> Newest at the top. One line per version. This is the template's own history, separate from any project.

| Version | Date | Change |
|---|---|---|
| `v1.3.0` | 2026-08-25 | Context-economy pass: added `KNOWN_ISSUES.md` (open bugs + failed-attempt registry — global LESSONS §3.5 requires reading it before any spec), a **surface map** in `07 §1` (founder phrase → files bridge, e.g. "kayıt ol butonu"), task-type **reading paths** in `00_START_HERE` (index first, file second, never the folder), and **doc-updates-scaled-by-task-size** in `DOD §1`. FIX tasks now **reproduce first** (`SUBAGENT_PROMPT_TEMPLATE`). **Retired the `CEO_Ozet/` founder-summary layer** (never read for months, cost every task) — founder is served in conversation; moved to `_archive/CEO_Ozet/`. `GLOSSARY.md` reframed as shared vocabulary (2 columns). |
| `v1.2.0` | 2026-06-14 | Added `Governance/DOC_AUDIT.md` (recurring anti-staleness check), `Governance/WHEN_STUCK.md` (escalation ladder — no guessing, no infinite loops), and `Screenshots/_INDEX.md` (image index + naming rule). |
| `v1.1.0` | 2026-06-14 | Agent Reports made scalable: added `_INDEX.md` (one-line-per-report table of contents, read first), a rotation rule (keep newest ~50, older move to `_archive/Agent Reports/`), and `_archive/_ARCHIVE_INDEX.md` (every archived item gets a recorded reason). |
| `v1.0.0` | 2026-06-14 | Initial template: governance OS, two-language layers (AI/CEO), decision log, glossary, lessons + feedback loop, definition of done, numbered product/engineering skeletons. |

---

## Part D — What NOT to add (keep it lean)

The biggest threat to this system is **staleness** — docs that no longer match reality are worse than no docs. Every file you add multiplies that risk. Before adding a new top-level doc, ask:

- Can this live as a section in an existing doc instead? (Usually yes.)
- Does it create compounding value across projects, or is it a one-off note? (One-offs go in `DECISIONS.md` or `LESSONS.md`.)
- Will someone actually keep it current? (If not, don't create it.)

Deliberately omitted until a project genuinely needs them: standalone risk register, standalone security/privacy doc, user-facing changelog. Add them per project only when the project's size demands it — not by default.
