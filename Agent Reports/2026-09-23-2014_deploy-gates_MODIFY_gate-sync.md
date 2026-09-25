# Task Report: deploy-gates-sync

## Status
SUCCESS

## Files Touched
- MODIFIED: .github/workflows/deploy.yml (gates-job header comment + one gates step)

Not touched (verified): `.github/workflows/ci.yml`, Dockerfiles, compose, any app code.
`ci.yml` shows as modified in `git status` but that is **pre-existing uncommitted work**, not
mine — mtime 2026-09-23 07:29:57 (this session ran at 20:18), and its diff is the unrelated
`docker-build` job. Evidence recorded under Verification.

## Dependencies Added
- None.

## Assumptions Made
- Resolved the drift by **adding** the migrate step, not by rewording the header. Rationale:
  `ci.yml:37-38` already runs this runner (`node apps/gateway/scripts/migrate.mjs`) into the
  job's own throwaway `postgres:17` service, and the step is already proven in CI. The
  deploy.yml gates job is likewise pointed at an ephemeral service DB
  (`deploy.yml:58` `DATABASE_URL=...localhost:5432/corvus_ci`) — never production. Adding it
  makes deploy.yml actually satisfy the contract its own header declares instead of
  documenting a weakened one, and keeps deploy.yml a strict superset-check of ci.yml rather
  than a gate that can silently lag it.
- Adding the step does **not** contradict RUNBOOK §7.2.5. §7.2.5 (lines 154-171) and line 182
  ("It does NOT run migrations — those stay an explicit step (7.2.5)") govern the **live
  `/opt/corvus` database**. The gates-job step runs against a CI container that is destroyed
  with the runner. Because that distinction is easy to lose, I stated it explicitly in the
  header comment rather than leaving it implied.

## Open Questions for Orchestrator
1. **Runner is still blind to production schema drift.** The added gate proves the migration
   chain applies from zero, but nothing checks the live DB against the journal. The runner
   already supports it — `node apps/gateway/scripts/migrate.mjs --check` exits non-zero when
   a file is pending (RUNBOOK §7.2.5, lines 158-159). A deploy-time `--check` before
   `compose pull` would turn "someone forgot to migrate" into a failed deploy instead of a
   crashed app. Out of this task's scope (it would touch the SSH script); flagging as a
   follow-up.
2. **CI cannot see 0011/0012/0013 yet.** `git ls-files apps/gateway/drizzle/` returns only
   `0001-0010`; the newer three are untracked. So the migrate step — in **both** workflows —
   exercises 10 files, not the 13 it applied in my probe, until those files are committed.
   This is finding #8 in `2026-09-23-1240_inspect-docs-ci_REVIEW_docs.md`; it is a commit-hygiene
   issue, not a workflow defect, and this task does not change it.
3. §7.2.5 is cited in the header. If the RUNBOOK is ever renumbered, that reference needs updating.

## Public Interface Exposed
None (CI configuration only). Observable changes to the `deploy` workflow:

- `jobs.gates.steps` gains one step, inserted after `Install` and before
  `Build spec contract`, matching `ci.yml:37-38`:
  ```yaml
  - name: Migrate (journaled runner over empty CI DB)
    run: node apps/gateway/scripts/migrate.mjs
  ```
- `jobs.gates` header comment gains a paragraph explaining the step is CI-local and that
  live-DB migration remains a hand-run step (RUNBOOK §7.2.5).

Unchanged (verified below): `on: workflow_dispatch` (manual-only), job graph
`gates -> build -> deploy`, `permissions: contents: read`, all `uses:` SHA pins, the
`appleboy/ssh-action@0ff4204...` pin and its `envs: DEPLOY_TAG` wiring.

## Known Limitations
- Not run on GitHub's runners. Verification was local: real YAML parse + the exact step
  command against a real `postgres:17` (details below). The workflow itself was not dispatched.
- The 4 SSH-script lines (deploy.yml:145-151) are untouched by design — no migration is run
  against production, per RUNBOOK §7.2.5.
- No `actionlint` available in this environment (checked: not on PATH), so lint-level schema
  checks beyond YAML parsing were not possible. The parse plus the structural/parity diff
  below cover the practical risks at this scale.

## Verification

**1. Real YAML parse (not a claim — js-yaml, the repo's own dependency).**
`node -e "require('js-yaml').load(...)"` on both files: both **PARSED OK**. Extracted structure
confirms `workflow_dispatch` is the sole trigger (manual-only preserved), job keys are
`gates, build, deploy`, and `permissions: {"contents":"read"}`.

**2. Gates parity with ci.yml (the drift that was to be closed).** Compared `jobs.gates.steps`
name+command pairs programmatically:

| Check | Result |
|---|---|
| ci.yml gates steps | 10 |
| deploy.yml gates steps | 10 |
| Identical order | **true** |
| Only in ci.yml | `[]` |
| Only in deploy.yml | `[]` |
| `services` block parity | true |
| `env` block parity | true |

**3. SHA-pin integrity.** Walked every `uses:` key in deploy.yml and matched `@<40-hex>`:
**all pinned, 0 exceptions**. ssh-action pin still
`appleboy/ssh-action@0ff4204d59e8e51228ff73bce53f80d53301dee2` with `envs: DEPLOY_TAG`.

**4. Repo's real format gate.** `npx prettier --check --ignore-unknown .github/workflows/deploy.yml`
-> **"All matched files use Prettier code style!"** (prettier 3.9.6, the repo's pinned version;
`.github` is inside the root `format` script's glob, so this is the gate CI will run).

**5. The step actually runs (real DB, real command — not just a parse).**
Started a throwaway `postgres:17` matching the CI service definition exactly (same user/password/db)
on host port 55432, then ran the literal `run:` command from the new step:

```
$ DATABASE_URL='postgresql://corvus:corvus_ci@localhost:55432/corvus_ci' node apps/gateway/scripts/migrate.mjs
migrate: applied 0001_init.sql ... 0013_runtime_kinds_tickets.sql
migrate: OK — applied 13 file(s).          EXIT CODE: 0
```

Second run (idempotency) -> `migrate: OK — nothing to do (13 files already journaled).` EXIT 0.
`--check` -> `migrate: OK — 13 files applied, journal clean.` EXIT 0.

I deliberately did **not** point the runner at host port 5432, which is occupied by what may be a
real dev database: the runner is forward-only and writes DDL, so probing it would have been
destructive. The throwaway container was destroyed afterwards; `docker ps -a` shows **0 leftovers**.

**6. Scope integrity.** `git status --porcelain -- .github/workflows/` -> only `ci.yml` (pre-existing,
07:29, unrelated `docker-build` job) and `deploy.yml` (mine, 20:18). `git diff --stat` for deploy.yml
is **7 insertions, 0 deletions** — the header paragraph plus the two-line step.

SECURITY: no secrets added or printed (names only); no production contact; no GHCR/server access;
no package.json / lockfile / .env edits; no `git restore` / `stash` / `checkout` / `reset`; no commit.

## Verification Method Note
Parsing method: `js-yaml` (present in `node_modules`, resolved via `require.resolve`). No
`actionlint` binary in this environment. Every claim above was produced by running a command and
reading its output; nothing is asserted from memory or from report recall. Line numbers cited refer
to the **pre-edit** deploy.yml for ci.yml comparisons, and RUNBOOK §7.2.5 to
`infra/RUNBOOK.md:154-171` (+ line 182).
