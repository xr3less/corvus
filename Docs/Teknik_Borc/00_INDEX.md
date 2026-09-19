# Teknik borç — index

## Status: LIVE

> Opened 2026-09-19 after the Docs-vs-code audit. This folder is the working list of **known lies, gaps, and unfinished product promises** so the next agent does not treat a stale numbered doc as truth.
>
> Source audit: `Agent Reports/2026-09-19-0023_orchestrator_REVIEW_docs-code-audit.md` (HEAD `b5c9833`).
> Issue IDs live in `Docs/KNOWN_ISSUES.md` (KI-029…KI-034 plus older opens). This folder **does not replace** KNOWN_ISSUES — it groups the audit cluster with file-level pointers.

**How to use:** before writing a SPEC or coding from `02`/`04`/`05`/`06`/`07`/`08`/`09`/`10`, read the matching row here. If this folder and a numbered doc disagree, **this folder + KNOWN_ISSUES win** until the numbered doc is trued (KI-031).

**Not in this folder:** product code fixes as of the audit. Overnight (2026-09-19) some **worktree** fixes landed and are still uncommitted — see the status column below. Close rule unchanged: a row is not Resolved here until KNOWN_ISSUES says Resolved **and** the lying numbered doc is trued.

---

## At a glance

| ID     | Severity   | One line (2026-09-19 midday)                                                                                     | Detail                                                   |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| KI-029 | P0 deploy  | Repo fix LIVE-proven on box (`5c6c134`, web 313MB + gateway 638MB); local docker-build + deploy.yml run unproven | [KI-029_docker-copy.md](KI-029_docker-copy.md)           |
| KI-030 | P0 honesty | Unchanged — do not share `https://13-140-181-113.nip.io/`                                                        | [KI-030_honesty.md](KI-030_honesty.md)                   |
| KI-031 | P0 docs    | Unchanged — banners only; numbered bodies still lie                                                              | [KI-031_docs-stale.md](KI-031_docs-stale.md)             |
| KI-032 | P1 secrets | **RESOLVED (D-137)** — pushed (`4aed2ff` on origin); `.env.example` has shape-only `ENCRYPTION_KEY=`             | [KI-032_encryption-key.md](KI-032_encryption-key.md)     |
| KI-033 | P1 billing | Unchanged — trial clock / 1-bot / sleep not in product code                                                      | [KI-033_trial-unenforced.md](KI-033_trial-unenforced.md) |
| KI-034 | P1 ship    | Guards LIVE (prod 404s re-verified 2026-09-19); `07` map leg remains                                             | [KI-034_parked-routes.md](KI-034_parked-routes.md)       |

Already-open product debt (not new, still real): KI-016, KI-017, KI-018, KI-019, KI-024 — see [eski-aciklar.md](eski-aciklar.md) and `KNOWN_ISSUES.md`. (KI-015 RESOLVED 2026-09-19 evening, D-140.)

---

## Stamped numbered docs (do not implement from the stale sentences)

Each of these carries a `> **DRIFT (2026-09-19)**` banner pointing here:

- `02_strategy.md` — status line still says K2/K3 unsigned (LOCKED D-032/D-033)
- `04_design_language.md` — lead still `/pryzm` (production `/` is D-120)
- `05_architecture.md` — overclaims recipe interpreter, Kuma `/healthz`, Flash-via-OpenRouter, `17.11-bookworm`
- `06_data_model.md` — ledger/subscriptions as if live; missing `tier`/`attempt`
- `07_folder_structure_and_standards.md` — clone-pryzm KEPT, bots.ts mock-only, KI-014 open
- `08_core_pipeline.md` — glance is codegen+sandbox (the bug)
- `09_auth_and_billing.md` — Creem/ledger/DPA written as the live money path
- `10_deployment.md` — eval gate, CI GHCR, Kuma on-box, nightly dump NOW, workers-not-started

Also stamped: `DECISIONS.md` D-128 empty heading / body spliced under D-129; `LESSONS.md` L-021 heading missing.

---

## Close rule

A row leaves this folder only when: (1) KNOWN_ISSUES marks the KI Resolved with a decision/date, and (2) the numbered doc that lied has been trued in the same task. Do not delete files — move the body under a `## Resolved` heading and leave the filename.
