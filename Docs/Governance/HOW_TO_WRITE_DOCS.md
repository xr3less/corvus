# HOW TO WRITE DOCS — Style Guide

## Status: CANONICAL (template)

> For AI agents and humans alike. Read this before creating or editing any doc in this repo. Project-independent; copy unchanged.

---

## 1. The numbered-doc + folder taxonomy

All canonical docs use a `NN_slug.md` numbering scheme in the root:

| Range | Purpose |
|---|---|
| `00` | The map (`00_START_HERE.md`) — always read first |
| `01–04` | Product & strategy (vision, strategy, validation, design) |
| `05–10` | Engineering (architecture, data model, code standards, core pipeline, auth/billing, deployment) |
| `DECISIONS.md` | Decision log — no number, appended to continuously |
| `GLOSSARY.md` | Shared glossary — no number, kept current |
| `PLAN.md` | Live execution plan — no number, updated continuously |
| `PROJECT_STATUS.md` | Live status — no number, top banner always current |

Sub-folders have their own conventions:
- `Governance/` — AI operating-system docs (all-caps filenames: `GLOBAL_RULES.md`, `AGENT_CONSTITUTION.md`, etc.).
- `Marketing/` — positioning, launch, channel drafts (freeform filenames, dated if iterative).
- `_archive/` — superseded docs (moved here with a header note, never deleted).

**Rule:** do not invent new top-level docs without the orchestrator adding them to `00_START_HERE.md §Canonical file list` first. If you need a new doc, stop and escalate.

---

## 2. When to create vs update a doc

**Create a new doc** only when it is listed in `00_START_HERE.md §Canonical file list` and does not yet exist, OR the orchestrator has explicitly authorized it in the task brief.

**Update an existing doc** when a decision fills a TODO, a section goes stale, or a status changes (DRAFT → CANONICAL → LIVE).

**Never** silently create new top-level docs, new Governance files, or new canonical entries as a side-effect of another task. Flag the need to the orchestrator as an open question.

---

## 3. The DRAFT / CANONICAL / LIVE status convention

Every doc has exactly one status line at the top, right below the `# H1` title:

```
## Status: DRAFT (skeleton)
```

| Status | Meaning |
|---|---|
| `DRAFT (skeleton)` | Structure exists; content is TODO markers. Fill it. |
| `DRAFT` | Sections written but not yet founder-approved. May still change. |
| `CANONICAL` | Founder-approved. Locked — do not change without explicit authorization. Treat content as truth. |
| `LIVE` | Continuously-updated operational doc (`PLAN.md`, `PROJECT_STATUS.md`, `DECISIONS.md`, `GLOSSARY.md`, `KNOWN_ISSUES.md`). Always reflects the current moment. No approval cycle. |

When you move a doc from DRAFT to CANONICAL, add a `> Approved: YYYY-MM-DD` line directly below the status line.

---

## 4. How to mark TODOs and open decisions

Use these exact markers — they are searchable:

| Marker | Meaning |
|---|---|
| `> TODO:` | Work to be done (agent or human fills this in). |
| `> TODO (founder decision):` | A product/business decision that ONLY the founder can make. Agents must not invent an answer. |
| `> TODO (agent):` | Technical work an agent should do, not the founder. |
| `> OPEN QUESTION:` | Something unresolved that is blocking progress. Include who must answer it. |
| `> DECISION NEEDED:` | A fork — present the options; a choice is required before work continues. |

**Do not** use inline HTML comments or footnotes for this. Always use the blockquote `> ` prefix so they are visually scannable.

---

## 5. The authority-chain rule

When docs conflict, the one higher in the chain wins:

1. `Governance/GLOBAL_RULES.md` — highest. Never edit without explicit founder approval.
2. `02_strategy.md` (when CANONICAL) — locks target customer, pricing, scope.
3. `PLAN.md` / `PROJECT_STATUS.md` — current operational truth.
4. All other docs — supporting detail.

When you notice a conflict, do NOT silently pick one. Flag it to the orchestrator as an open question.

---

## 6. Keeping headers scannable

- Use `## 2. Section Title` (number + title) for top-level sections within a doc.
- Use `### Subsection Title` for sub-sections (no number needed).
- Keep section titles short (≤ 6 words). The title says WHAT, not HOW.
- Do not skip heading levels. One blank line before and after every heading.
- Never use bold to fake a heading — use real `#` headings.

---

## 7. One documentation layer, one audience

All docs — root (`00`–`10`, `DECISIONS.md`, `PLAN.md`, `PROJECT_STATUS.md`, `KNOWN_ISSUES.md`) and all of `Governance/` — are **AI-facing, English, exhaustive**. They record *everything* in full technical detail: this is the AI's working guide and the permanent record (`GLOBAL_RULES.md §4`).

The founder is **not** a documentation audience. He is served in conversation: plain language, analogies, business framing, per `GLOBAL_RULES.md Part 1`. Never build a parallel "summary layer" doc for him — one existed (`CEO_Ozet/`, retired v1.3.0) and was never read while every task paid to update it (see `LESSONS.md L-004`). Rules:

- User-facing names of product surfaces are still recorded in the founder's phrasing — in `07`'s **surface map**, which is the lookup bridge from "kayıt ol butonu" to files.
- The `GLOSSARY.md` keeps a plain-language meaning for every technical term, so any reader (agent, future maintainer, the founder if he ever opens a doc) shares one vocabulary.
- When the founder asks for something in writing, that is a request — write it then, on demand. Do not maintain an unrequested standing summary.

---

## 8. How docs cross-link

Use relative Markdown links and backtick-wrapped paths:

```markdown
See `03_validation_plan.md §5` for the session script.
See `Governance/GLOBAL_RULES.md` for decision rights.
```

- Link to the specific section (`§Section Name`) when the reference is precise.
- Do not link to `_archive/` from active docs — quote the relevant decision inline and note it is archived.
- Keep external URLs in `Marketing/`, not inside Governance or numbered docs.

---

## 9. Formatting rules

- **Tables** for comparisons, decisions, status summaries. Always a header row.
- **Code** in fenced blocks with a language identifier.
- **Lists**: `-` for unordered, `1.` for sequential steps.
- **Emphasis**: bold for the first instance of a key term; italic for placeholder text. Do not bold whole sentences.
- **Length**: as long as needed and no longer. No padding, no closing summary.
- **No emojis** in docs.

---

## 10. Placeholders in this template

Project-specific blanks use `{{DOUBLE_BRACES}}` (e.g. `{{PROJECT_NAME}}`, `{{TARGET_CUSTOMER}}`). When starting a new project, search for `{{` and every `> TODO` marker and fill them in. A doc with unfilled placeholders stays at `DRAFT (skeleton)`.

---

*This file is CANONICAL. Agents may propose additions via the orchestrator but must not edit it directly without authorization.*
