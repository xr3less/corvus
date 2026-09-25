# Task Report: recon-m13

## Status
SUCCESS

## Files Touched
- CREATED: Agent Reports/2026-09-23-0713_recon-m13_SPEC_migration-runner.md

## Dependencies Added
None. Design uses only deps already on disk (`pg` in apps/web + apps/gateway, `tsx` devDep in apps/gateway, postgres:17 in CI). No new package needed.

## Assumptions Made
- CI's `DATABASE_URL` (port 5432, service container) overrides every suite's local fallback (port 5434) in CI; locally suites share one scratch container. Both cases = many suites, one shared DB.
- Forward-only convention holds (RUNBOOK + every migration header): old files are never edited, so a checksum column is a tripwire, not a version manager.
- `--> statement-breakpoint` stays the statement separator (used by all drizzle files and both gateway suites that split SQL).

## Open Questions for Orchestrator
1. Journal adoption on dirty DBs: prod + long-lived dev/CI containers already have 0010's effects with no journal row. Does the runner backfill `schema_migrations` by inspection (e.g. probe `trial_ends_at`/`tier`/tables), by a one-time `--baseline` flag, or do we wipe disposable containers and hand-own prod?
2. Who runs the runner locally: a documented manual command, or a vitest `globalSetup` fallback when the journal table is absent? (CI step is serial and safe; globalSetup reintroduces concurrency questions.)
3. FALLBACK_DDL end-state: freeze-then-delete per suite as it converts (recommended), or keep one suite's copy permanently as offline belt-and-braces?
4. `0010`'s UPDATE is data, not schema. Should the runner refuse to run it against a DB whose journal shows it already applied (default journal behavior), with zero special-casing — confirmed acceptable?

## Public Interface Exposed
Proposed (not built):
- `apps/gateway/scripts/migrate.mjs` — CLI: `node migrate.mjs [--check]`, env `DATABASE_URL`. Exit 0 all-applied; non-zero with file + statement on failure. `--check` = verify-only for a CI gate variant.
- Journal table `public.schema_migrations(filename text PK, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`.
- npm script `migrate` in `apps/gateway/package.json` (orchestrator-owned edit — workspace manifest).

## Known Limitations
- Static recon only: no DB booted, no suite run. Applied-count claims (e.g. "3→8 failures on pristine DB") are taken from sweep item M-13, not re-proven here.
- Prior ci-seeding reports deliberately not read (scope); the TIER/TRIAL self-heals added there are treated as on-disk facts observed in the test files, nothing more.
- Line numbers are HEAD `d9cf8d7` working tree at recon time; uncommitted tree changes may shift them.

---

# M-13 recon: migration-state mess + minimal runner/journal design

## 1. Bug as filed (M-13, sweep synthesis)
`infra/RUNBOOK.md:155` — no migration runner, no applied-migrations journal. CI boots an empty DB (ci.yml has no migrate step); every suite hand-applies a different ad-hoc subset with swallowed failures. Failure count is a function of database state.

## 2. CI DB boot (file:line)
- `.github/workflows/ci.yml:11-24` — `postgres:17` service, `corvus`/`corvus_ci`/`corvus_ci`, port `5432`, health-checked.
- `.github/workflows/ci.yml:25-26` — job env `DATABASE_URL: postgresql://corvus:corvus_ci@localhost:5432/corvus_ci`.
- `.github/workflows/ci.yml:35-48` — Install → build spec → build ai → typecheck → lint → format → `npm test`. **No migration step anywhere.**
- Port mismatch that matters: every suite's local fallback is port **5434** (`apps/web/lib/db/pool.ts:12`, `apps/web/app/api/interview/interview.test.ts:26`, `apps/web/lib/auth/session-db.test.ts:27`, `packages/ai/src/ai.test.ts:598`, `apps/gateway/src/launch-blockers.test.ts:37`, `apps/gateway/src/start.test.ts:709`). In CI `process.env.DATABASE_URL` (5432) wins; locally the 5434 scratch container is shared by all suites.
- Root `npm test` = `npm run test --workspaces --if-present` (`package.json:18`) — sequential across workspaces, but **each workspace's vitest runs files in parallel threads against the one shared DB**.
- `.github/workflows/deploy.yml:58` — same `DATABASE_URL` shape; deploy never migrates either (RUNBOOK §7.2.5 stays manual).

## 3. Migrations dir: numbering + head
`apps/gateway/drizzle/` holds exactly 12 files, `0001`–`0012`, head = `0012_bot_runtime_config.sql`:
- `0001_init.sql:4-15` bots (+`0001:19-30` user_records) · `0002_v11.sql:4-12` accounts/sessions/spec_versions · `0003_v12.sql:1-12` oauth_states/interview_progress/ai_spend · `0004_v13.sql:1-12` templates · `0005_guilds.sql:4-12` guild_installs · `0006_audit_events.sql:8-12` audit_events · `0007_builder_runs.sql:8-12` builder_runs · `0008_accounts_tier.sql:7` ADD COLUMN tier · `0009_ai_spend_attempt.sql:6-8` ADD COLUMN attempt + partial unique index · `0010_accounts_trial_ends.sql:18-20` ADD COLUMN trial_ends_at **+ `UPDATE ... now()+interval '3 days' WHERE trial_ends_at IS NULL` (the non-rerunnable statement)** · `0011_credit_ledger_subscriptions.sql:5-16` header (never re-run 0010, everything IF NOT EXISTS) · `0012_bot_runtime_config.sql:20-30` bot_runtime_config.
- Separator convention: `--> statement-breakpoint` (all files).
- Config: `apps/gateway/drizzle.config.ts:1-10` (drizzle-kit, schema `./src/db/schema.ts`, out `./drizzle`). No journal table, no `migrate()` call anywhere (grep-negative for `schema_migrations|drizzle-orm.*migrat|migrate(` outside this SPEC).
- RUNBOOK `infra/RUNBOOK.md:154-167`: manual one-file-per-command, "no migration-runner script yet", 0010 never-re-run rule, forward-only rules.

## 4. Per-suite ad-hoc subset inventory
| Suite | Sibling files attempted | Fallback | Swallowed-failure sites |
|---|---|---|---|
| `apps/web/lib/auth/session-db.test.ts` | 0001+0002 (`:79-82`) | INLINE_FALLBACK_SQL `:41-59`, always applied `:141` | `:125-133` tolerated-codes + unapplied list; `:160-168` loud warn (NOT silent). Self-heal trial only `:149-155` |
| `interview/interview.test.ts` | 0001+0002+0003 (`:113-117`) | FALLBACK_DDL `:55-101`, always `:132` | `catch {}` `:124-126` silent; self-heals TIER `:141-145` + TRIAL `:146-152`; log-only `:153` |
| `templates/templates.test.ts` | 0001+0002 (`:118-120`) | `:68+`, self-heal TIER `:137-140` + TRIAL `:150-152` | `catch {}` `:128-130` silent |
| `spec/spec.test.ts` | 0001+0002 (`:83-86`) | `:45-78`, always `:101` | `catch {}` `:93-95` silent. No self-heal |
| `simulate/simulate.test.ts` | 0001+0002 (`:79-82`) | `:41-74`, always `:97` | `catch {}` `:89-91` silent + second swallowed readFile `:455-459`. No self-heal |
| `spec/publish/publish.test.ts` | 0001+0002+0005+0012 (`:130-135`) | `:51-117` incl 0012 mirror `:104-117` | `catch {}` `:140-144` silent. No self-heal |
| `spec/rollback/rollback.test.ts` | 0001+0002+0005+0012 (`:132-136`) | same shape `:51-119` | `catch {}` `:140-144` silent. No self-heal |
| `bots/route.test.ts` | 0001 only (`:102-107`) | `:69-91` | `catch {}` `:108-110` silent. Self-heal TRIAL only `:115-121` |
| `bots/[botId]/activity/route.test.ts` | 0001+0003+0006 (`:114-118`) | `:61-103` | `catch {}` `:123-125` silent. Self-heals tier `:131-139` + attempt `:140-146` |
| `webhooks/creem/route.test.ts` | NONE (live path applies FALLBACK only `:1203`) | `:1145-1185` (has tier `:1153`, trial_ends_at `:1154`, ledger uidx `:1167-1169`) | No sibling read at all; no self-heal → order-dependent m-50 |
| `checkout/create/route.test.ts` | 0001+0002 (`:613-616`, via `path.join(import.meta.dirname)`) | `:559-577`, always `:629` | `:620-627` catch-with-warn (NOT silent — names the file) |
| `preflight/preflight.test.ts` | 0001 only (`:611-613`) | array `:586-602` | `catch {}` `:616-618` + per-statement `:622-624`; verification `:626-637` |
| `builder/start/route.test.ts` | 0001 only (`:586-588`) | array `:561-577` | `catch {}` `:591-593` + per-statement `:596-598`; verification `:601-612` |
| `builder/route.test.ts` | 0001+0007 (`:355-358`) | `:323-347` | `catch {}` `:363-365` + per-statement `:370-372`; verification `:374-385` |
| `packages/ai/src/ai.test.ts` | NONE read | NONE — requires real `ai_spend` (`:616-622` skip) | Self-heal attempt `:626-634` (skip on failure). No silent catch |
| `lib/interview/progress-store.test.ts` | NONE read | Inline PROGRESS_DDL only (`:209-210`) | `:211-216` warn (not silent) |
| `gateway/launch-blockers.test.ts` | 0001 only (`:278-282`, split `:246-251`) | NONE — throws (not swallowed) | Loud skip `:255-263`; `ctx.skip()` w/o return `:304,:403,:447,:499` (m-51) |
| `gateway/start.test.ts` | 0006 only, isolated schema (`:741-753`, read `:743-744`) | NONE | Loud skip `:732-739` |

Key structural facts: no suite applies more than 4 files; none applies the full 0001–0012 chain; 0008/0009/0010/0011 coverage comes only via self-heal one-liners or not at all. `session-db.test.ts:72-78` documents why `new URL(relative, import.meta.url)` reads can silently miss under vitest (dev-server URL at module scope) — the runner sidesteps this by reading from disk in plain Node, never through vitest module URLs.

## 5. Minimal design
**Runner location:** `apps/gateway/scripts/migrate.mjs` (new, plain Node + `pg` — both already deps; no build step, no tsx needed). Gateway owns it because it owns `drizzle/` + `drizzle.config.ts`. Trigger: `migrate` npm script in `apps/gateway/package.json` (orchestrator-owned manifest edit) → `node scripts/migrate.mjs`.
**Journal schema (DB table, not file):** file journal would need cross-process locking under parallel vitest; a table rides the same Postgres every suite already shares.
```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```
**Runner algorithm (≤60 lines):** connect via `DATABASE_URL` (fail fast if unset — never fall back to 5434 inside the runner); `CREATE TABLE IF NOT EXISTS schema_migrations`; `SELECT filename, checksum`; list `drizzle/0*.sql` sorted; for each missing file: sha256 → split on `--> statement-breakpoint` → apply statements in order → `INSERT` journal row. Checksum mismatch on an already-journaled file = hard fail (forward-only tripwire). Wrap each file's statements+insert in one transaction; take `pg_advisory_xact_lock(hashtext('corvus-migrate'))` first so two concurrent invocations serialize. `0010` needs zero special-casing: journaled once, never re-run — the manual exclusion rule retires into the mechanism. `--check` flag = exit non-zero if any file unapplied (optional CI gate variant).
**CI integration point:** one new step in `gates` job, `.github/workflows/ci.yml` between Install (`:35-36`) and Test (`:47-48`): `npm run migrate --workspace @corvus/gateway` (job env already provides `DATABASE_URL`). Serial before vitest → no contention by construction.
**Rollout order:** Wave 0 — runner + journal + CI step, zero suite changes (prove the journal fills green). Wave 1 — interview + templates (KI-033 tier/clock columns, M-12) + creem (needs 0011, fixes m-50 class) + activity (widest real-file subset). Wave 2 — spec, simulate, publish, rollback, bots, session-db, checkout. Wave 3 — minimal-schema suites (preflight, builder-start, builder-route: replace FALLBACK arrays with runner + keep their `REQUIRED_TABLES` verification) + gateway suites + ai.test + progress-store.
**FALLBACK_DDL fate:** FREEZE immediately (no new edits, no new self-heals), DELETE per suite as it converts, KEEP the `REQUIRED_TABLES` pg_tables verifications permanently as the "did the runner really run?" guard. Rationale: duplicated DDL is the drift source (m-50 missing-tier, m-52 dead migration-first path); verification queries are cheap and honest.
**What a fix agent CREATES:** `apps/gateway/scripts/migrate.mjs`; optionally `apps/gateway/scripts/migrate.test.mjs` (advisory-lock + journal-idempotence proof against disposable DB).
**What it MODIFIES:** `.github/workflows/ci.yml` (one step); `apps/gateway/package.json` (one `migrate` script — orchestrator-owned); `infra/RUNBOOK.md:154-167` (replace hand-per-file with runner command, keep 0010 warning as history); per-wave suite files (delete FALLBACK/ensureSchema bodies, call nothing — CI step owns schema; keep loud-skip probes + REQUIRED_TABLES checks).

## 6. Risks
- **Dirty-DB adoption** (biggest): journal starts empty on DBs that already have 0010's data effects. Backfill-by-inspection vs `--baseline` flag vs wipe-disposable/hand-own-prod — orchestrator Q1. Wrong choice re-arms trial clocks.
- **Parallel-suite contention locally** (dev runs vitest without the CI step): mitigated by advisory lock + journal PK, but two runners racing first-boot is the exact path to test; the fix wave must prove it, not assert it.
- **Statement splitting:** `--> statement-breakpoint` split + per-file transaction breaks if a future migration puts a non-transactional statement (e.g. `CREATE INDEX CONCURRENTLY`) in the chain — runner must fail loudly on it, and the convention needs one line in the contributing path.
- **`CREATE EXTENSION pgcrypto` privilege:** already tolerated elsewhere (`launch-blockers.test.ts:266-276`); runner should tolerate extension failure the same way and continue, since pg17 provides `gen_random_uuid()` core.
- **Scope creep magnet:** checksums, `--check`, per-file transactions are the ceiling. No down-migrations, no seed data, no per-suite sharding — each is a separate design if ever wanted.
