# Task Report: reviewer-deploy-gates-2014

## Status
PASS

## Files Touched
- CREATED: Agent Reports/2026-09-23-2030_reviewer_REVIEW_deploy-gates.md
- MODIFIED: none
- DELETED: none

## Dependencies Added
- None.

## Assumptions Made
- Web research unneeded: this task is pure disk verification of two YAML files against each other. No library versions, model names, or APIs are at issue. Stated per task brief.
- The live 13-migration probe evidence is accepted from the builder report (throwaway postgres:17 on host port 55432, exit 0, idempotent, `--check` clean, container destroyed). I did NOT re-run a live Postgres probe; docker state was not re-verified. Everything else was independently re-run.
- `ci.yml` dirty state is pre-existing work from an earlier wave (mtime 07:29, docker-build guard job), not this wave. Verified via mtime + diff content.
- Other dirty files in the tree (.env.example, .gitignore, package-lock.json, many Agent Reports) are pre-existing; mtimes predate this session (09-20/21). This wave touched only deploy.yml.

## Open Questions for Orchestrator
- None blocking. Two builder follow-ups worth tracking (not defects): (1) no deploy-time `--check` against the live DB before `compose pull`; (2) migrations 0011-0013 are untracked (`git ls-files` returns 10, working tree has 13), so CI exercises 10 files until committed. Both are out of this task's scope.

## Public Interface Exposed
None (CI configuration only). One additive change to the `deploy` workflow's `jobs.gates.steps`: `Migrate (journaled runner over empty CI DB)` / `node apps/gateway/scripts/migrate.mjs`, plus a clarifying header-comment paragraph. No API, no exports.

## Known Limitations
- Workflow was not dispatched on GitHub runners; verification is local (YAML parse, structural diff, prettier, file reads). Same limitation the builder declared.
- No `actionlint` binary in this environment; schema check is limited to YAML parse + structural comparison. No `git restore`/`stash`/`checkout`/`reset`, no commit/push, no prod contact, no secrets touched.

## Verification

| # | Check (command) | Result |
|---|---|---|
| 1 | YAML parse both files: `node -e "require('js-yaml').load(...)"` | Both PARSED OK |
| 2 | Gates step count + order vs ci.yml (programmatic name+run/uses compare) | 10/10, identical order true, only-in-either `[]` |
| 3 | Migrate step exact text at `deploy.yml:74-75` | `- name: Migrate (journaled runner over empty CI DB)` / `run: node apps/gateway/scripts/migrate.mjs` — matches `ci.yml:37-38` verbatim, positioned after Install (line 72-73), before Build spec contract (line 76-77) |
| 4 | `services` block parity (`deploy.yml:48-61` vs `ci.yml:11-24`) | true (postgres:17, same user/pass/db, same health-check) |
| 5 | `env` parity (`deploy.yml:62-63` vs `ci.yml:25-26`) | true (`DATABASE_URL=...localhost:5432/corvus_ci`) |
| 6 | SHA pins: walked all 7 `uses:` in deploy.yml against `@[0-9a-f]{40}` | 7/7 pinned, 0 bad; ssh-action pin `appleboy/ssh-action@0ff4204d59e8e51228ff73bce53f80d53301dee2` intact with `envs: DEPLOY_TAG` (line 141, 150) |
| 7 | Manual-only: trigger keys of deploy.yml `on:` | `["workflow_dispatch"]` only — no push/pull_request trigger |
| 8 | Least-privilege default: top-level `permissions` | `{"contents":"read"}` (line 35-36); `build` job opts into `packages: write` only |
| 9 | Prettier: `npx prettier --check --ignore-unknown .github/workflows/deploy.yml` | "All matched files use Prettier code style!", exit 0 |
| 10 | Scope: `git status --porcelain -- .github/workflows/` + `git diff --stat -- .github/workflows/deploy.yml` | Only ci.yml (pre-existing) + deploy.yml; deploy.yml diff is 7 insertions, 0 deletions (5-line header comment + 2-line step) |
| 11 | ci.yml diff content confirms pre-existing | Its diff adds the docker-build guard job (+72 lines incl. its own Migrate line) — unrelated workstream, mtime 07:29 vs deploy.yml 20:18 |
| 12 | Runner script exists: `apps/gateway/scripts/migrate.mjs` | Present on disk |
| 13 | Builder report exists: `Agent Reports/2026-09-23-2014_deploy-gates_MODIFY_gate-sync.md` | Present, read (sole whitelisted context) |
| 14 | Secret scan: `git diff -- deploy.yml` grepped for password/secret/token/key | No matches (only `${{ secrets.* }}` references that pre-date this wave) |
| 15 | SSH-script lines (deploy.yml:152-158) untouched | Diff shows no changes below line 75; live-DB migration still hand-run per RUNBOOK ref |

Toolchain detection: repo uses npm (`npm ci`, `npx prettier`, `package-lock.json`); js-yaml resolved from the repo's own `node_modules`; prettier 3.9.6 via npx. No package-manager assumption needed beyond reading the files.
