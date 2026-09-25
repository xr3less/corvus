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
| KI-031 | P0 docs    | **RESOLVED 2026-09-20** — 8 bodies trued + reviewed SUCCESS, banners removed, D-128 restored                     | [KI-031_docs-stale.md](KI-031_docs-stale.md)             |
| KI-032 | P1 secrets | **RESOLVED (D-137)** — pushed (`4aed2ff` on origin); `.env.example` has shape-only `ENCRYPTION_KEY=`             | [KI-032_encryption-key.md](KI-032_encryption-key.md)     |
| KI-033 | P1 billing | **RESOLVED (D-145)** — trial enforcement option A live (403 `trial_expired`, gateway pause → KI-035)             | [KI-033_trial-unenforced.md](KI-033_trial-unenforced.md) |
| KI-034 | P1 ship    | **RESOLVED 2026-09-20** — guards LIVE + `07` map leg trued with KI-031 wave                                      | [KI-034_parked-routes.md](KI-034_parked-routes.md)       |

Already-open product debt (not new, still real): KI-016, KI-017, KI-018, KI-019, KI-024 — see [eski-aciklar.md](eski-aciklar.md) and `KNOWN_ISSUES.md`. (KI-015 RESOLVED 2026-09-19 evening, D-140.)

---

## Stamped numbered docs (TRUED 2026-09-20 — banners removed)

KI-031 docs-true wave trued all 8 numbered legs (02/04/05/06/07/08/09/10), each reviewed SUCCESS. No `> **DRIFT (2026-09-19)**` banner remains in any numbered doc (grep-verified; only ledger references to this folder remain in `Teknik_Borc/` files themselves). Detail per leg: [KI-031_docs-stale.md](KI-031_docs-stale.md); closeout: `Agent Reports/2026-09-20-0922_orchestrator_NOTE_ki031-closeout.md`.

Also fixed 2026-09-20: `DECISIONS.md` D-128 body restored under its own heading (D-129 untouched). `LESSONS.md` L-021 heading verified present (`Docs/LESSONS.md:309`) — the "heading missing" claim was stale; only numeric order is off, harmless.

---

## Close rule

A row leaves this folder only when: (1) KNOWN_ISSUES marks the KI Resolved with a decision/date, and (2) the numbered doc that lied has been trued in the same task. Do not delete files — move the body under a `## Resolved` heading and leave the filename.
