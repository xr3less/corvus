# Task Report: docs07-map-refresh

## Status

SUCCESS

## Files Touched

- MODIFIED: Docs/07_folder_structure_and_standards.md

## Dependencies Added

- None

## Assumptions Made

- Treated the pre-edit **worktree** state (211 lines) as the baseline, not HEAD (199 lines). HEAD is behind: other agents' uncommitted edits to this file were already on disk before I started. My delta is measured against the worktree, and against HEAD the diff necessarily also contains their earlier changes — not mine to touch.
- The task said "add rows for 0011/0012/0013"; 0011 already had a row. I added 0012 + 0013 and corrected only the 0011 row's staleness note in place rather than duplicating it.
- Ran `prettier --write` on the target file because the baseline was prettier-clean and my unformatted additions broke the check. Prettier only realigned table-column padding; pre-existing cell text was preserved byte-for-byte after whitespace normalization (verified below).

## Open Questions for Orchestrator

- The `deploy.yml` header claims the same gate order as `ci.yml`, but `ci.yml:38` runs the migrate step and `deploy.yml` does not. I documented the gap in the `migrate.mjs` row but did not fix `deploy.yml` (out of scope — reviewer finding #10).
- 0011/0012/0013 and `migrate.mjs` are still untracked (`??`), so CI's checkout does not contain them (reviewer finding #8, BLOCKER-adjacent). Documented as "working tree, unmerged" rather than resolved; a commit wave is needed.
- `CREEM_TEST_PRODUCT_REFILL` is absent from `.env.example` (reviewer finding #7). Documented the route; the checklist gap still belongs to whoever owns `.env.example`.

## Public Interface Exposed

Docs-only change; no code interface. Rows added to `Docs/07 §1` (file-structure map, 8 rows) and `Docs/07 §1 → Surface map` (4 rows).

## Known Limitations

- Docs-only. Does not close reviewer findings #8 (untracked migrations), #9 (`start.test.ts` mock), #10 (`deploy.yml` gates), and does not touch `Docs/09` or `Docs/10`, which carry the same drift.
- Does not add the `.env.example` refill entry.

---

## Verification

Every path below was confirmed present on disk with Glob/Read before its row was written — nothing copied from memory or from the reviewer report alone.

| Row added (Docs/07 §1 map)                            | Path verified on disk                     | Evidence read                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/api/checkout/refill/route.ts`           | yes                                       | route.ts:1-60 (401/503 guards, `CREEM_TEST_PRODUCT_REFILL` at :163, REFILL_* constants :58-60)                  |
| `apps/web/app/api/checkout/` (row updated)            | yes (create/ success/ refill/)            | Glob of `apps/web/app/api/checkout/**/*.ts`                                                                     |
| `apps/web/app/api/webhooks/creem/` (dated)            | yes (route.ts + route.test.ts)            | `git status --porcelain` → `?? apps/web/app/api/webhooks/`                                                      |
| `apps/gateway/src/runtime/sweeper.ts`                 | yes (+ sweeper.test.ts)                   | sweeper.ts:1-50 (SWEEP_GRACE_MS, SQL, fail-open header); wiring `start.ts:45,564`, `gateway.ts:241-246,499-501` |
| `apps/gateway/src/runtime/tickets/`                   | yes (handler.ts + tickets.test.ts)        | handler.ts:1-30; registered `boot-modules.ts:35`                                                                |
| `apps/gateway/src/runtime/reaction-roles/`            | yes (handler.ts + reaction-roles.test.ts) | handler.ts:1-30; registered `boot-modules.ts:36`                                                                |
| `apps/gateway/drizzle/0012_bot_runtime_config.sql`    | yes                                       | 0012:1-35 (UNIQUE NULLS NOT DISTINCT, 6-value fence, re-run safe)                                               |
| `apps/gateway/drizzle/0013_runtime_kinds_tickets.sql` | yes                                       | 0013:1-14 (6→8 fence, DROP IF EXISTS + ADD)                                                                     |
| `apps/gateway/scripts/migrate.mjs`                    | yes                                       | migrate.mjs:1-45 (journal + sha256, `corvus-migrate` lock, `--check`); CI step `ci.yml:38`                      |

Surface-map rows added: `Kredi dolumu` (refill), `Bot uyku/uyanma` (sweeper), `Ticket sistemi (/ticket)`, `Rol seçici (reaction roles)`.

Cross-checked supporting claims: `RUNTIME_KINDS` 8-tuple at `runtime/config.ts:11-20`; `botRuntimeConfig` catalog at `db/schema.ts:113`; `discord.js ^14.27.0` at `apps/gateway/package.json`; `startSweeper` import at `start.ts:45`.

### Stale-note decision (the conditional in the task)

The "checkout/webhook unmerged" note was **kept with a dated re-verification**, because disk proved it still true: `git status --porcelain apps/web/app/api/webhooks/` returns `?? apps/web/app/api/webhooks/`, and `git ls-files apps/gateway/drizzle/` lists only `0001`–`0010` while 0011/0012/0013 all report `??`. Nothing was corrected on assumption — the note stands, now stamped `re-verified 2026-09-23`.

### Gates

| Check                                 | Result                                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prettier --check` on the file        | clean (was clean before my edit; re-verified clean after `--write`)                                                                                                                |
| Additive only                         | yes — line delta 211 → 222 = exactly 11 added rows; zero rows removed                                                                                                              |
| Section order                         | unchanged: `## 1`…`## 7` in original order                                                                                                                                         |
| Pre-existing content intact           | yes — 6 long pre-existing rows + naming/commit tables re-matched whitespace-insensitively, all OK                                                                                  |
| Secrets / prod / git-restore / commit | none — reads only (`git ls-files`, `git status`, `git diff`, `git show`); no `checkout`/`restore`/`reset`/`stash`, no commit, no manifest or `.env` edit, no secret values printed |

SECURITY: HEAD `d9cf8d7` untouched; no sub-agent git restore ran; no production, GHCR, Contabo, or live-key surface touched.
