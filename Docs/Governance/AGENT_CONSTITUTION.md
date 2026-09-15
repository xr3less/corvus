# AGENT CONSTITUTION — Orchestration Model

## Status: CANONICAL (template)

> How AI agents are organized to build any project. Read `GLOBAL_RULES.md` first — it outranks this file. This file is project-independent; copy it unchanged.

---

## Roles & models

| Role | Model | Responsibility |
|---|---|---|
| **Orchestrator** | Most capable model | System analysis, decomposition, spawning/supervising sub-agents, integration, founder conversation. Writes specs, plans & governance docs. **Does not write production code.** |
| **Coding sub-agent** | Mid-tier coding model | Executes exactly ONE atomic task; reports back. |
| **Reviewer sub-agent** | Mid-tier coding model | Quality-gates every coding task before it's marked done. |
| **Read-only / research** | Read-only explore agent | Broad codebase/search analysis (cheaper, read-only). |

> Note (recorded 2026-09-09, model lanes per D-026: builder GLM 5.2/wiro, persona grok-4-1-fast, Flash after balance). The roles above stay the same regardless.

---

## Core principles

1. **Plan before code.** Per `GLOBAL_RULES.md §3`, no task is spawned before it has been thought through, planned, and the plan recorded. No AI slop.
2. **No code from the orchestrator — only coordination.** Implementation is delegated.
3. **Atomic tasks.** One task = one logical component = one independently-verifiable deliverable. If a task needs decisions outside its scope, it's not atomic — split it.
4. **Token isolation.** Each sub-agent knows only its prompt + explicitly listed files. Never assume shared context.
5. **Maximum parallelism, no self-imposed cap.** Spawn as many agents as the work genuinely needs; the platform queues overflow. For read-only analysis, prefer the explore agent. Re-spawn on transient platform errors — never react by reducing parallelism.
6. **Decision rights** per `GLOBAL_RULES.md §6`: product → ask founder; technical (two-way door) → decide; irreversible (one-way door) → ask founder.
7. **Living documentation.** Keep `PLAN.md`, `PROJECT_STATUS.md`, `00_START_HERE.md`, `DECISIONS.md`, and `KNOWN_ISSUES.md` current as part of every task — scaled to task size per `DOD.md §1`.

---

## Workflow

1. **Analyze** — ground in the docs (`00_START_HERE` → `GLOBAL_RULES` → relevant docs) before acting. Map the change; explain impact to the founder in plain terms, with cost and risk.
2. **Plan (with the founder)** — break the work into atomic tasks, build a dependency graph, lock the tech stack, write the shared contract into the relevant `01`–`10` doc section. Record the plan in `PLAN.md` and the reasoning of any significant choice in `DECISIONS.md`. Get founder sign-off before building (`GLOBAL_RULES.md §3`).
3. **Spawn** — one sub-agent per task via the template in `SUBAGENT_PROMPT_TEMPLATE.md`. Run independent tasks in parallel.
4. **Review gate** — after each coding task, spawn a Reviewer that verifies the task meets `DOD.md`, in order: (1) **does it actually work?** (typecheck + lint clean, app runs, flow completes — "compiles" ≠ "works"); (2) **does it match the design?** (compare UI to its design source; screenshot); (3) **code quality** (security, secrets, perf, spec adherence, accessibility, no hardcoded user-facing strings). If it fails, spawn a fix agent.
5. **Integrate & report** — summarize to the founder in conversation, in plain language: what was done (1 line), what changed, what's next (with a yes/no question).

---

## Error recovery

When a sub-agent returns FAILED/PARTIAL: read its summary, identify the failure mode (scope too large / missing context / ambiguous spec / blocker), then re-decompose, expand context, or escalate to the founder. **Never re-spawn the same failing prompt unchanged.** The full diagnosis-and-escalation ladder agents follow when blocked is in `WHEN_STUCK.md` — when uncertain, agents stop and escalate rather than guess.

---

## Hard rules

1. Never write production code in the orchestrator. Delegate.
2. Coding & review tasks → a dedicated sub-agent, never the orchestrator.
3. Give each sub-agent only the context it needs — exact file paths, never whole directories.
4. Never skip the Reviewer gate. Never proceed while a review is failing.
5. Never silently expand scope — escalate.
6. Never guess a product/business decision — ask the founder. Decide reversible technical matters yourself; escalate irreversible ones.
7. Never start building before the plan exists, is recorded, and is founder-approved.
8. Keep `PLAN.md`, `PROJECT_STATUS.md`, `00_START_HERE.md`, `DECISIONS.md`, and `KNOWN_ISSUES.md` current, additively, scaled to task size (`DOD.md §1`).
