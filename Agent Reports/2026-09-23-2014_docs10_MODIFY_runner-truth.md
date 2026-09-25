# Task Report: docs10-runner-truth

## Status

SUCCESS

## Files Touched

- MODIFIED: Docs/10_deployment.md (§2 "How it ships" pipeline paragraph only — two spans)
- CREATED: Agent Reports/2026-09-23-2014_docs10_MODIFY_runner-truth.md (this report)

No other file written. No code, config, manifest, SQL, or workflow file touched.
`git status --porcelain -- Docs/10_deployment.md` → ` M Docs/10_deployment.md` (only in-scope file;
the other dirty paths in the tree are other agents' work, untouched by me — see Assumptions).

## Dependencies Added

None.

## Assumptions Made

- **§5 needed no change — verified, not assumed.** The task named "§2/§5 stale migration-runner
  paragraphs". On disk, §5 ("Monitoring & rollback", lines 37-41) contains **zero** migration tokens:
  `sed -n '36,60p' Docs/10_deployment.md | grep -n "migrat\|schema\|drizzle\|psql\|forward"` → NONE,
  and a whole-file grep puts every `migrat*`/`runner`/`psql`/`schema_migrations` hit on **line 21**
  (§2). The migration-runner staleness was entirely a §2 defect; §5's actual content (Kuma absent,
  manual `pg_dump`, rollback via `previous-sha`) is already true on disk. I therefore made no §5 edit.
  Recording this so the "§5" half of the task reads as _checked and empty_, not _missed_.
- **The "deploy.yml never run" clause was re-scoped, not deleted or repeated.** The task said to
  "verify, do not repeat from memory". Verified: the claim's only surviving source is
  `Docs/KNOWN_ISSUES.md` KI-029 ("committed deploy.yml never run end-to-end (manual-only, `DEPLOY_*`
  never set)", amended 2026-09-19) and `Docs/Teknik_Borc/KI-029_docker-copy.md:17,27`. Both are
  **2026-09-19-dated**. I could not execute an Actions-history check (`gh` is not installed in this
  environment: `timeout 30 gh run list` → "failed to run command 'gh': No such file or directory"),
  so I did **not** harden the claim to a bare present-tense "has never been run" nor refute it. I
  re-scoped it to what is actually attested — _"as of the last recorded check (KI-029, 2026-09-19)"_ —
  and named the KI so the next reader can re-check against live Actions history. This is the honest
  form: neither a memory-repeat nor an unsupported refutation.
- **The "box images came from the box, not GHCR" half IS independently evidenced** and is stated as
  fact, not as a KI echo: `infra/compose/compose.yml:59,83` pulls
  `ghcr.io/${GHCR_OWNER}/corvus-*:${TAG:-stable}` while `Docs/PLAN.md:132` (box-redeploy-003 SUCCESS)
  records the images being _built on the box from repo Dockerfiles_ and retagged `:stable`, explicitly
  noting "GHCR `:stable` not pushed". Those two together are the mechanism; the KI is only the date.
- **`ci.yml:115` → `ci.yml:117` was mine to fix, and I fixed it.** A parallel agent added the Migrate
  step to `ci.yml` _while this task was running_ (see Open Question 1), shifting `push: false` from
  line 115 to 117. The `ci.yml:115` citation sits inside the very span this task owns, and the shift
  was caused by the very change this task documents — leaving it would have shipped a false citation
  from my own paragraph. Re-verified against the live worktree immediately before writing: 117.
- **`deploy.yml:149-151` → `deploy.yml:156-158` was the same class.** The parallel `deploy-gates`
  agent's 7-line insert pushed the `pull`/`up` block down by 7. Re-verified: 156-158.
- Pre-existing dirty state in this file (KI-031 wave, 2026-09-20: DRIFT-banner removal + §4/§5/§6
  rewrites) was present before my first Read and is not mine. My net change is `4 insertions(+),
6 deletions(-)` — see Verification Claim 6.

## Open Questions for Orchestrator

1. **A parallel agent edited `ci.yml` and `deploy.yml` mid-task, and one of its edits collided with my
   scope.** `.github/workflows/deploy.yml` mtime moved during my run (`20:18:50`), gaining a 5-line
   comment block + a `Migrate` step (`deploy.yml:42-45,74-75`) — the `gates` header's own comment says
   "Keep these steps in sync with ci.yml", and it now is. That is a _correct_ fix to
   inspect-docs-ci finding #10, and it made my handoff **better** (I can now write "`deploy.yml` runs
   the same runner step but never migrates the live database" as an on-disk fact with a citation,
   rather than as an inference). But note the two costs: (a) I had to re-resolve _every_ `deploy.yml`
   line citation mid-write, and (b) two citations in my span (`149-151`, and the inherited `ci.yml:115`)
   were invalidated by another agent's edit to a file I cannot touch. If more waves touch these
   workflows, the doc's line-number citations will keep rotting; a follow-up worth considering is
   citing _step names_ (`ci.yml` step "Migrate") instead of line numbers.
2. **`Docs/06_data_model.md:202` remains the sibling of this defect class** — it still claims "No
   migration-runner script … CI (`ci.yml`) has no migrate step". It was **not** in my scope and I did
   not touch it. A `2026-09-23-2014_docs06_MODIFY_migration-range.md` report exists in the tree, so I
   believe it is already owned by another agent — flagging only to confirm it is not orphaned by
   omission. (The earlier `2026-09-23-0245_docs06-range_MODIFY_migration-range.md` suggests this is
   its second pass.)
3. **`0011`/`0012`/`0013` are still untracked** (`git ls-files` tracks only `0001`–`0010`). My doc
   text says CI migrates "the throwaway CI database" and the runner applies `drizzle/*.sql` in
   filename order — both true of the _worktree_, but CI checkout will not see those three files until
   they are committed. This is inspect-docs-ci finding #8 and is **not mine to fix** (no git commands,
   no files outside scope). My wording does not assert a migration _count_, so it does not go stale
   when the commit lands — but the underlying gap still needs its commit wave.

## Public Interface Exposed

Documentation only. The two edited spans now read (line 21, §2):

> CI (`ci.yml`): migrate the throwaway CI database with the journaled runner (`ci.yml:37-38`) →
> spec-dist build → … CI **never pushes images** — the `docker-build` job is build-only
> (`push: false`, `ci.yml:117`). Images reach GHCR only through `deploy.yml`, which is manual-only
> (`workflow_dispatch`, `deploy.yml:22-23`); as of the last recorded check (KI-029, 2026-09-19) it has
> not been run end-to-end — `DEPLOY_*` never set — so the box images to date were built on the box,
> not pulled from GHCR (`Docs/KNOWN_ISSUES.md` KI-029; box-redeploy-003). Deploy (`deploy.yml`): SSH
> to box → `docker compose pull && docker compose up -d` (`deploy.yml:156-158`; order in
> `infra/RUNBOOK.md §7.2`). Rollback: … DB migrations go through the journaled forward-only runner:
> `apps/gateway/scripts/migrate.mjs` applies each unjournaled `apps/gateway/drizzle/*.sql` in filename
> order (`.sort()`, `migrate.mjs:88`), one transaction per file, and records filename + sha256 in
> `public.schema_migrations` (`migrate.mjs:51-81`); a checksum mismatch on a journaled file — or a
> journaled file missing from disk — is a hard fail (`migrate.mjs:30-49`), and `--check` verifies
> without applying (`migrate.mjs:109-115`). CI runs it against its throwaway Postgres (`ci.yml:37-38`);
> `deploy.yml` runs the same step inside its own gates but **never migrates the live database**
> (`deploy.yml:42-45,74-75`). The box stays a deliberate hand-run step — from the repo root,
> `node apps/gateway/scripts/migrate.mjs` — and only AFTER the manual pre-deploy `pg_dump` snapshot
> (`RUNBOOK.md §7.2` steps 4-5). History: `0010_accounts_trial_ends.sql` is the one file in that folder
> that was NOT safe to run twice by hand — its trailing `UPDATE` (`0010:20`) re-arms the trial clock
> (`now() + interval '3 days'`) for every account whose clock is NULL, turning an account that should
> never expire into a 3-day lockout (0011's header warns about exactly this). The journal retires that
> hazard into the mechanism: applied once, never re-run. Never edit an applied migration file.
> appleboy/ssh-action is SHA-pinned (`deploy.yml:141`).

## Known Limitations

- **Docs-only.** Nothing enforces the forward-only rule mechanically for a hand-run operator on the
  box — the runner's checksum tripwire only fires if the runner is actually used. Same hazard-reduction
  shape as the RUNBOOK fix, not a guarantee.
- **I did not run `gh` or any Actions-history lookup** (`gh` unavailable here), so the "not run
  end-to-end" claim is re-scoped to its recorded-check date rather than freshly confirmed or refuted.
- **I did not run migrations, `psql`, or touch any database.** Production is out of scope; a replay of
  0010 is precisely the harm being documented.
- **Line-number citations in this doc are inherently rot-prone** — this task had to repair two of them
  because a sibling wave edited the cited workflow files mid-flight (Open Question 1).
- The `0011` header warning I paraphrase is real (`0011:5`), but I inherited the "0010 is the one
  non-rerun-safe file" enumeration from the whitelisted RUNBOOK/docs06 context rather than re-deriving
  it file-by-file. Grepping the folder shows `0011`/`0012`/`0013` self-describe as `IF NOT EXISTS`
  idempotent; I did not audit `0001`-`0009` individually.

---

## Verification Evidence

### Claim 1 — the runner EXISTS with the described behavior (not memory)

Read `apps/gateway/scripts/migrate.mjs` in full (144 lines). Confirmed on disk:

- `migrate.mjs:88` — `const entries = (await readdir(DRIZZLE_DIR)).filter((f) => f.endsWith('.sql')).sort();`
  = filename order, as claimed. (`DRIZZLE_DIR` = `../drizzle/`, line 13.)
- `migrate.mjs:51-81` — `applyFile` wraps each file in `BEGIN` … per-statement `db.query` … `INSERT
INTO public.schema_migrations(filename, checksum)` … `COMMIT`, with `ROLLBACK` + `fail` on error =
  "one transaction per file" + "records filename + sha256".
- `migrate.mjs:30-49` — `validateChecksums`: a journaled file missing from disk fails (lines 33-39);
  a checksum mismatch on a journaled file fails (lines 40-48) = "hard fail", forward-only.
- `migrate.mjs:109-115` — `if (CHECK_ONLY) { if (pending.length > 0) fail('pending migrations: …'); }`
  = `--check` verifies without applying.

### Claim 2 — CI DOES migrate; the step is real and at the cited lines

`sed -n '37,38p' .github/workflows/ci.yml` →
`      - name: Migrate (journaled runner over empty CI DB)` / `        run: node apps/gateway/scripts/migrate.mjs`.
At HEAD (`d9cf8d7`) this step does **not** exist (`git show HEAD:.github/workflows/ci.yml | grep -n "migrate"`
→ no match); it is uncommitted worktree state, which is the tree this doc describes. Noted, not hidden.

### Claim 3 — `deploy.yml` runs the runner but does NOT migrate the live database

`sed -n '42,45p;74,75p' .github/workflows/deploy.yml` →
`  # The \`Migrate\` step below is the same runner ci.yml uses, against this job's own throwaway Postgres
service — it proves the migration chain applies cleanly from zero and touches nothing else. This
workflow does NOT migrate the live database: that stays an explicit hand-run step (RUNBOOK §7.2.5).`and the step`- name: Migrate (journaled runner over empty CI DB)`/`run: node apps/gateway/scripts/migrate.mjs`.
Independently corroborated by `infra/RUNBOOK.md:182`("It does NOT run migrations — those stay an
explicit step (7.2.5)") — the workflow comment and the RUNBOOK agree, so this is not one source's claim.
Note the step appears in the`gates`job (against its own throwaway Postgres), **not** in the`deploy`
job's SSH script (`deploy.yml:152-158` = pull/up/ps only) — which is exactly what my sentence says.

### Claim 4 — the hand-applied forward-only rule + 0010 warning are KEPT and true

`infra/RUNBOOK.md:154-171` (step 5 "Migrate (forward-only)") now prescribes the **runner**, not a
`psql` loop: line 157 `node apps/gateway/scripts/migrate.mjs`, line 159 `--check`, lines 160-162 the
journal + checksum tripwire, lines 163-169 the 0010 history, line 170 "never edit an old migration,
never write new DDL by hand". The 0010 hazard is real at source: `0010_accounts_trial_ends.sql:20` is
`UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;`, and
`0011_credit_ledger_subscriptions.sql:5` is `-- ⚠️  NEVER RE-RUN 0010's UPDATE (it RE-ARMS the trial).`
Both anchors verified by reading the files, not by quoting a report.
The **snapshot-before-migrate** ordering is likewise on disk: RUNBOOK step 4 (lines 150-153) is the
`pg_dump`, step 5 (154) is the migrate — so "AFTER the manual pre-deploy `pg_dump` snapshot
(`RUNBOOK.md §7.2` steps 4-5)" is the runbook's own order, not my invention.

### Claim 5 — the "never glob loop" contradiction is GONE, with the rule preserved

| Phrase                          | Occurrences in file |
| ------------------------------- | ------------------- |
| `no runner script`              | **0**               |
| `never a glob loop`             | **0**               |
| ``one `psql` file per command`` | **0**               |
| `has never been run`            | **0**               |
| `Do not loop the folder`        | **0**               |

and the replacements are present exactly once each: `migrate.mjs`, `schema_migrations`,
`ci.yml:37-38`, `deploy.yml:42-45,74-75`, `never migrates the live database`, `0010:20`.
The "never glob" instruction is not merely deleted — it is superseded by the mechanism that made it
obsolete (the journal), which is why `0010` survives as _history_ rather than as a live prohibition.
This is the deliberate direction the RUNBOOK already took (its step 5 calls the old rule retired:
"retires into the mechanism: journaled once, never re-run"), so doc and runbook now agree.

### Claim 6 — every cited anchor re-resolved against the live worktree, immediately pre-write

| Citation                                   | Resolves to                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `ci.yml:37-38`                             | `Migrate (journaled runner over empty CI DB)` / `run: node apps/gateway/scripts/migrate.mjs`       |
| `ci.yml:117`                               | `push: false`                                                                                      |
| `deploy.yml:22-23`                         | `on:` / `workflow_dispatch:`                                                                       |
| `deploy.yml:13-16`                         | `# Rollback: re-run this workflow with \`previous-sha\` = the last good SHA. That skips`           |
| `deploy.yml:141`                           | `uses: appleboy/ssh-action@0ff4204d59e8e51228ff73bce53f80d53301dee2 # v1.2.5`                      |
| `deploy.yml:156-158`                       | `…compose.yml pull web gateway caddy` / `…up -d web gateway caddy` / `…ps`                         |
| `deploy.yml:42-45,74-75`                   | the "does NOT migrate the live database" comment / the Migrate step                                |
| `0010:20`                                  | `UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;` |
| `migrate.mjs:88 / 51-81 / 30-49 / 109-115` | `.sort()` / `applyFile` / `validateChecksums` / `if (CHECK_ONLY)`                                  |
| `RUNBOOK.md §7.2` steps 4-5                | lines 150-153 (pg_dump) / 154-171 (migrate)                                                        |

File states at final write: `ci.yml` md5 `2ee536320e1c9a00c4816beb6869079e`, `deploy.yml` md5
`e5e9bacb4098962407b0199035cdba99`, `Docs/10_deployment.md` md5 `da82ba59ffb4189880da882696643e07`.
Every heading intact and in original order (`grep -n "^## "` → 3, 9, 19, 25, 31, 37, 43); §1, §3, §4,
§5, §6 not opened for writing. `git diff --stat Docs/10_deployment.md` → `4 insertions(+), 6
deletions(-)` against HEAD, all of it inside the §2 line-21 paragraph (the larger HEAD→worktree diff
is the pre-existing KI-031 wave, which was present at my first Read).

### Claim 7 — Prettier clean

`npx --no-install prettier --check Docs/10_deployment.md` →
`All matched files use Prettier code style!` (exit 0). Repo config `.prettierrc`: `printWidth: 100`,
`singleQuote`, `trailingComma: all`. The file is prose; no reflow was needed.

### Claim 8 — no secrets, no out-of-scope write, no git-restore

- Secret-pattern scan of my rewritten paragraph alone (`password|secret|api[_-]?key|token|BEGIN …
PRIVATE KEY`) → **0 hits**. No credential, host, or key value appears in this report either.
- **No git command that restores from HEAD was run** — no `stash`, `checkout --`, `restore`, or
  `reset`. Nothing was committed or staged. No `gh`/network mutation.
- Only `Docs/10_deployment.md` was written by me. No `.env`, `package.json`, lockfile, migration SQL,
  or workflow file was opened for writing.
- Note the two workflows **were being modified by other agents during this task** (deploy.yml mtime
  `2026-09-23 20:18:50`); I read them and re-read them, and never wrote to them.

### Claim 9 — the real path

Documentation: "it works" means the sentences are accurate and an operator following them lands on
the right step. Verified by reading the _targets_ of every cross-reference rather than trusting the
reports that described them (migrate.mjs source, both workflow files, RUNBOOK §7.2, 0010/0011
headers). There is no executable path in this file to exercise; the copyable command lives in the
RUNBOOK. **Not exercised against a live database, by design** — production is out of scope, and a
replay of 0010 is exactly the harm being documented.
