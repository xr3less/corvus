# Task Report: fix-runbook-loop

## Status
SUCCESS

## Files Touched
- MODIFIED: infra/RUNBOOK.md (step 7.2.5 "Migrate (forward-only)"; net +9/-2 lines, lines 154-167)
- CREATED: Agent Reports/2026-09-23-0131_fix-runbook-loop_FIX_runbook-migrate-loop.md (this report)

No migration SQL file modified. No code file modified. Confirmed:
`git diff --name-only -- infra` → `infra/RUNBOOK.md` only.

## Dependencies Added
None.

## Assumptions Made
- **The "once" rule is kept, not weakened.** I did not replace "one file per command" with a
  "re-run everything" story. The guard is a *negative* instruction — "Do not loop over the whole
  folder" — plus a factual note that 0010 has a different safety class than every other file.
  Reason: the defect was an instruction-driven hazard (a copy-pasteable command that re-arms the
  trial), and a negative rule is the smallest change that makes the example non-replayable.
- **A second positive variant was rejected as scope creep.** I considered documenting the
  already-applied-files variant (applied = `CREATE TABLE IF NOT EXISTS` prints a NOTICE;
  not-applied = a real error) so a fresh operator could filter the folder without a journal.
  I dropped it: it is a new operational procedure that I cannot safely state as fact without
  exercising it, and it would add procedure to a founder-facing runbook that did not ask for one.
  Noted below as an open question instead.
- **Chose `0012_bot_runtime_config.sql` as the worked example** (not a `${FILE}` placeholder).
  It is a plausible next pending migration (0012 exists in the working tree). The step already
  says "Only if a migration is pending" and "Skip this step if nothing is pending", so a concrete
  illustrative filename is the right shape for this file's voice (the neighbours, step 4 and
  step 6, also use concrete commands — step 4's `pg-backup` and step 6's `pull web gateway caddy`).
  The copy explicitly frames it with "**If** `0012` is the new one", so it cannot be misread as
  "run 0012 unconditionally".
- The exact `-U "$POSTGRES_USER" -d "$POSTGRES_DB"` psql invocation, the `docker compose
  --env-file .env -f infra/compose/compose.yml` prefix, and the `< file` stdin form were all
  preserved verbatim from the original loop — only the shell `for` wrapper was removed. No
  technical change to the command the operator actually runs; only the scope of a single
  invocation narrowed from "every file" to "one file".

## Open Questions for Orchestrator
1. **No applied-migrations journal exists.** 0010 can only be manually excluded, per operator
   memory. If the box is ever rebuilt from scratch and the files are applied by hand, a re-run
   of the folder still re-arms the trial — the guard is now a rule, not a mechanism. A
   `schema_migrations`-style table (or a `psql ... --single-transaction -v ON_ERROR_STOP=1`
   runner script) would make the hazard structurally impossible rather than merely warned
   against. Out of scope for a docs-only fix; flagging as a follow-up candidate.
2. I did NOT resurrect `ON_ERROR_STOP=1`. The original command has no `-v ON_ERROR_STOP=1`, so
   a batch that hits an already-applied file keeps going and exits 0 anyway. That is *not* the
   re-run hazard (0010's `UPDATE` is the hazard, via the `for` loop), and adding it would change
   the command's semantics beyond the task scope. Recording the observation, not acting on it.

## Public Interface Exposed
Documentation only. The step now reads:

> 5. **Migrate (forward-only).** Only if a migration is pending. Apply every new file in
>    `apps/gateway/drizzle/` once, in number order (`0001`, `0002`, ...). There is no
>    migration-runner script yet, so run them by hand — one file per command. If `0012` is
>    the new one, that command is:
>    `docker compose --env-file .env -f infra/compose/compose.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < apps/gateway/drizzle/0012_bot_runtime_config.sql`
>    **Do not loop over the whole folder.** `0010_accounts_trial_ends.sql` is the one file
>    in there that is NOT safe to run twice: its `UPDATE` re-arms the trial clock
>    (`now() + interval '3 days'`) for every account whose clock is NULL, turning an account
>    that should never expire into a 3-day lockout (0011's header warns about exactly this).
>    Run 0010 only against a database that has never seen it, then never again — so on a
>    brand-new server, run every file once in order, and on the live server only ever run
>    the files it has not seen yet.
>    Rules: never edit an old migration, never write new DDL by hand. If unsure, stop and
>    ask the orchestrator. Skip this step if nothing is pending.

## Known Limitations
- Docs-only. Nothing enforces the rule at run time — see Open Question 1.
- The fix removes the wildcard loop from the example, but a determined operator can still type
  a loop. This is a hazard-reduction change, not a mechanical guarantee.

---

## Verification Evidence

### Claim 1 — the example loop could replay 0010's UPDATE (VERIFIED from source)
`apps/gateway/drizzle/0010_accounts_trial_ends.sql:20`:
`UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;`
Preceded at `:18` by `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;`
(idempotent). So on a re-run, `:18` is a silent no-op and `:20` is the *only* statement that
still does work — and it does harm: it converts a deliberately-NULL fail-open clock into a fresh
3-day lockout. `0010`'s own header (`:2-4`) confirms NULL is *read as NOT expired* (fail-open) by
`isTrialExpired`.

`apps/gateway/drizzle/0011_credit_ledger_subscriptions.sql:5`:
`-- ⚠️  NEVER RE-RUN 0010's UPDATE (it RE-ARMS the trial).` with `:9-11` stating the statement
"was correct exactly once (grandfathering on deploy day)" and `:16` naming 0010 as "unlike 0010,
whose UPDATE is not [idempotent]". Both claims in the task brief confirmed.

### Claim 2 — "no loop is safe" was verified, not assumed
Enumerated every file in the folder so the guidance ("0010 is *the one* file that is NOT safe")
is a checked statement, not a guess. Statement kinds, per file:

| File | Statement class | Re-run safe? |
|---|---|---|
| 0001, 0002, 0003, 0004, 0005, 0006, 0007 | `CREATE TABLE/INDEX IF NOT EXISTS` only | yes |
| 0008 | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | yes |
| 0009 | `ADD COLUMN IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` | yes |
| **0010** | `ADD COLUMN IF NOT EXISTS` **+ bare `UPDATE`** | **NO** |
| 0011 | `CREATE TABLE/INDEX IF NOT EXISTS`; header `:12-13`, `:15-16` states it issues NO UPDATE and a second run is a no-op | yes |
| 0012 | `CREATE TABLE/INDEX IF NOT EXISTS`; header `:17-18` states a second run is a no-op | yes |

0010 is the only file in the folder containing a data-modifying statement (`UPDATE`/`INSERT`/
`DELETE`) at all. This is the evidence backing the word "the one file".

### Claim 3 — the fix removes the replay path
`grep 'for f in apps/gateway/drizzle' infra/RUNBOOK.md` → no match (was line 157). The step now
carries the 'once' rule (kept verbatim at `:154-155`), a single-file command, the negative guard
("Do not loop over the whole folder"), the consequence in plain terms ("3-day lockout"), and the
0011 header cross-reference.

### Claim 4 — Prettier
- PASS on the touched file: `npx --no-install prettier --check infra/RUNBOOK.md` →
  "All matched files use Prettier code style!" (exit 0).
- PASS on the touched scope: `npx --no-install prettier --check --ignore-unknown infra` → same.
- The repo's `npm run format` exits 1, caused by `apps/gateway/src/runtime/games/giveaway.ts` and
  `giveaway.test.ts`. **Instrument validated — these are NOT mine:**
  - `git ls-files --error-unmatch apps/gateway/src/runtime/games/giveaway.ts` → "did not match any
    file(s) known to git"; `git status --porcelain` → `?? apps/gateway/src/runtime/games/`
    (untracked directory = another writer's in-flight work, not part of my diff).
  - `git diff -- apps/gateway/src/runtime/games/giveaway.ts` is empty vs HEAD for the same reason.
  - mtime of `giveaway.ts` is `2026-09-23 01:37:06` — **6 seconds before** my first RUNBOOK edit
    at `01:37:12`; `infra/RUNBOOK.md` is the only file I opened for writing.
  - My marker text appears 0 times in `git diff -- apps`.
  Both files are Python-`#`-style-commented Game files that I never opened, and they match no
  migration/runbook term. Pre-existing/parallel, out of my scope, reported not fixed (Hard Rule 6 /
  Scope Guard). My four gates that matter (prettier on the file, prettier on infra, no loop, scope
  diff) are green.

### Claim 5 — no secrets
`git diff -- infra/RUNBOOK.md | grep "^+" | grep -icE "password|secret|token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY"` → `0`.
The added text contains no credential, no host, no key. No secret value is present in this report
either (presence checked by pattern only, never by printing values).

### Claim 6 — nothing else needed the same fix (enumerate consumers, not just the call site)
Searched the whole repo (excluding node_modules) for the same class — an instruction that tells an
operator to replay the drizzle folder:
- `grep -rn "for f in"` → the RUNBOOK line 157 was the **only** occurrence anywhere; now removed.
- `grep -rn "psql"` across `*.md`/`*.yml`/`*.sh` → 3 hits, all *descriptions*, no replay command:
  `Docs/06_data_model.md:202` already says "0010's trailing UPDATE is NON-IDEMPOTENT (re-arms the
  trial) — never re-run it"; `Docs/10_deployment.md:21` describes the loop but issues no command.
- `Docs/07_folder_structure_and_standards.md:77` independently describes 0010 as
  "NON-IDEMPOTENT ... Was correct exactly once on deploy day — NEVER re-run".

**Excluded sites and why:** `Docs/10_deployment.md:21` and `Docs/06_data_model.md:202` describe
(rather than instruct) the loop, and 06 already carries the never-re-run warning. Their text says
"psql loop over apps/gateway/drizzle/*.sql" as a *description of what the runbook does*; now that
the runbook no longer loops, that description is slightly stale. Both files are outside my declared
scope (`infra/RUNBOOK.md` only), so per Scope Guard I did not edit them. **Escalating:**
`Docs/10_deployment.md:21` should be re-worded in a follow-up task to match the new step 7.2.5.
`Docs/06_data_model.md:202`'s "psql -f per file by hand" phrasing remains accurate as-is.

### Claim 7 — the real path (not just grep)
This is a documentation step, so "the flow completes" means: the operator command in the step is a
valid, single-file, directly-runnable invocation. Verified structurally against the two established
conventions in the same section (step 4's `--profile backup run --rm pg-backup`, step 6's
`pull web gateway caddy` usage): same `docker compose --env-file .env -f infra/compose/compose.yml`
prefix, same `exec -T postgres` form, same psql flags as the original line. The only delta from the
original command is the removal of the shell `for` wrapper and the substitution of one concrete
filename — there is no new syntax to be wrong.

**Not exercised on a live database, by design:** the task explicitly forbids touching production,
and I have no PG instance here. I did not simulate the loop against a scratch DB. The 0010 hazard
itself is a *read* finding from the migration source + its own header + 0011's header + two
independent docs, not a claim I am making from execution. The remaining execution-shaped claim is
only "the command is still syntactically the same shape as the two neighbouring commands," which is
directly evident in the diff.
