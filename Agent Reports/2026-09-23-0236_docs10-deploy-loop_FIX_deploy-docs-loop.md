# Task Report: docs10-deploy-loop

## Status
SUCCESS

## Files Touched
- MODIFIED: Docs/10_deployment.md (section 2 "How it ships", migration clause inside the existing CI/Deploy paragraph on line 21; net +4/-6 lines for the whole file, of which my change is one sentence replaced by one longer sentence — the remaining hunks are pre-existing, see Assumptions)
- CREATED: Agent Reports/2026-09-23-0236_docs10-deploy-loop_FIX_deploy-docs-loop.md (this report)

No other file modified. No code, no config, no manifest, no migration SQL touched.
`git status --porcelain -- Docs/10_deployment.md` → ` M Docs/10_deployment.md` (only in-scope file).

## Dependencies Added
None.

## Assumptions Made
- **The stale wording was re-worded, not deleted.** The paragraph is a dense one-line fact sheet; removing the migration clause outright would have dropped the "forward-only hand-applied, no `drizzle-kit migrate`, no runner script" facts that the rest of the doc depends on. I kept every fact and replaced only the *procedure description* (`psql` loop over `apps/gateway/drizzle/*.sql`) with the fixed procedure (one file per command, new files only, never a glob loop) plus the negative guard and the two cross-refs. This mirrors the RUNBOOK fix, whose chosen shape was a *negative* instruction ("Do not loop over the whole folder") rather than a rewritten procedure.
- **Cross-refs named concretely, as the RUNBOOK step names them.** `RUNBOOK.md §7.2` step 5 and the `0011_credit_ledger_subscriptions.sql` header are the two anchors the whitelisted report used; I cite both by their real identifiers (verified: RUNBOOK `### 7.2 First deploy` at line 137, step 5 at line 154; 0011's warning at its lines 5-13).
- **The 0010 consequence is restated in the docs' own voice.** The RUNBOOK says "3-day lockout"; I used the same plain-language phrasing so the two files cannot drift in what they claim the hazard *is*. Numbers (`now() + interval '3 days'`, NULL clock) are copied from the migration source, not retyped from memory.
- **Pre-existing dirty state in this file — NOT mine.** `Docs/10_deployment.md` was already modified in the worktree before I opened it (the `2026-09-20` KI-031 "docs-true" wave: removal of the DRIFT banner, and rewrites of sections 4, 5, 6). Those hunks appear in `git diff` alongside mine but were present on my first Read; mtime of the wave's sibling docs is `2026-09-20`, and the wave has its own staged report (`Agent Reports/2026-09-20-0905_docs10_MODIFY_deployment.md`). I did not touch them. My edit is confined to the migration clause of line 21. Flagged, not fixed (Scope Guard).

## Open Questions for Orchestrator
1. **`git diff` on this file is not a reliable picture of my change.** Because the KI-031 wave's edits are still uncommitted in the same file, a reviewer diffing `HEAD → worktree` will see ~5 hunks and may attribute them to me. The honest scope statement is: *one clause on line 21*, and the other hunks pre-date this task. If the review gate diffs this file, it should compare against the worktree state at task start, not against HEAD. (Committer note: this also means this file will land in whichever commit the orchestrator makes next, carrying the earlier wave's content with it.)
2. **`Docs/06_data_model.md:202` is the remaining sibling of this defect class** and was explicitly excluded by the RUNBOOK agent's own enumeration ("`psql -f per file by hand` phrasing remains accurate as-is"). I agree with that read — it describes, does not instruct, and already carries the never-re-run warning — so I did not touch it (out of scope). Recording it so the class is closed deliberately rather than by omission.
3. No applied-migrations journal exists (RUNBOOK report's Open Question 1). With the loop gone from both the RUNBOOK and now the docs, the hazard is closed at the *instruction* level in both places; it remains un-closed at the *mechanism* level. Unchanged by this task.

## Public Interface Exposed
Documentation only. The migration clause now reads:

> DB migrations are forward-only hand-applied SQL (`RUNBOOK.md §7.2` step 5: one `psql` file per
> command, new files only, in number order — **never a glob loop over `apps/gateway/drizzle/`** —
> no `drizzle-kit migrate`, no runner script), AFTER a manual pre-deploy `pg_dump` snapshot
> (`RUNBOOK.md §7.2` step 4). **Do not loop the folder**: `0010_accounts_trial_ends.sql` is the one
> file that is not safe to run twice — its `UPDATE` re-arms the trial clock
> (`now() + interval '3 days'`) for every account whose clock is NULL, turning an account that
> should never expire into a 3-day lockout (the warning in
> `0011_credit_ledger_subscriptions.sql`'s header calls out exactly this).

Everything else in the paragraph (CI chain, no-eval-merge-gate, `push: false`, `deploy.yml`
manual-only, rollback via `previous-sha`, step-4 snapshot, `appleboy/ssh-action` pin) is byte-identical
to before my edit.

## Known Limitations
- Docs-only. Nothing enforces the rule at run time; a determined operator can still type a loop. This
  is the same hazard-reduction, not a mechanical guarantee, that the RUNBOOK fix delivers.
- I did not run `psql` against anything. The claim "0010 is the one non-rerun-safe file" is inherited
  from the RUNBOOK report's per-file enumeration (its Verification Evidence, Claim 2), which I read as
  whitelisted context rather than re-derived. If that enumeration is wrong, this doc inherits the error.
- No live-server verification is possible or permitted (production out of scope).

---

## Verification Evidence

### Claim 1 — no glob/loop migrate command survives in the file
`grep -n "glob\|loop over\|for f in\|\*\.sql" Docs/10_deployment.md` → **one** hit, and it is the
*negation itself* ("**never** a glob loop over `apps/gateway/drizzle/`"). The `psql` loop description
is gone: `grep -c "drizzle/\*\|for f in\|\`psql\` loop" Docs/10_deployment.md` → `0`.
No line in the file now instructs or implies replaying the folder.

### Claim 2 — every required element is present exactly once
| Element | Count |
|---|---|
| ``one `psql` file per command`` | 1 |
| `new files only` | 1 |
| `Do not loop the folder` | 1 |
| ``RUNBOOK.md §7.2` step 5`` | 1 |
| `0011_credit_ledger_subscriptions.sql` | 1 |

The cross-refs resolve, verified from source: `infra/RUNBOOK.md` line 137 is
`### 7.2 First deploy — pull -> env -> snapshot -> backup -> migrate -> pull -> up` and line 154 is
step `5. **Migrate (forward-only).**`; `apps/gateway/drizzle/0011_credit_ledger_subscriptions.sql:5` is
`-- ⚠️  NEVER RE-RUN 0010's UPDATE (it RE-ARMS the trial).` Both anchors are real, not assumed.

### Claim 3 — wording agrees with the fixed RUNBOOK step 5
Compared clause by clause against RUNBOOK lines 154-167: same rule ("one file per command"), same
ordering rule ("new files only", RUNBOOK's "run every file once in order" / "only ever run the files it
has not seen yet"), same negative guard ("Do not loop" / "never a glob loop"), same named cause
(`0010_accounts_trial_ends.sql`, its `UPDATE`, `now() + interval '3 days'`, NULL clock), same 0011
header cross-ref. The doc no longer contradicts the runbook; it now paraphrases it.

### Claim 4 — no other section changed in meaning
All six section headings intact and in original order (`grep -n "^## "` → lines 3, 9, 19, 25, 31, 37,
43). Sections 1, 3 and 4-6 were not opened for writing. The `git diff` hunks outside line 21 are the
pre-existing KI-031 wave (see Assumptions) — byte-identical to the content of my first Read of the
file, taken *before* any edit.

### Claim 5 — Prettier clean
`npx --no-install prettier --check Docs/10_deployment.md` →
"All matched files use Prettier code style!" (exit 0). Repo config is root `.prettierrc`
(`printWidth: 100`, `singleQuote`, `trailingComma: all`); the file is prose and Prettier leaves it
untouched, so no reflow was needed.

### Claim 6 — no secrets, no config/manifest/dependency change
- My added clause, scanned alone for `password|secret|token|api[_-]?key|BEGIN … PRIVATE KEY` → **0**.
- Whole-diff scan reports 3 hits, all on lines belonging to the pre-existing KI-031 wave and all
  *prose about policy*, not values: "All secrets in environment … injected via Compose env-file" (§4),
  "shards isolate per-token" (§5), "Tokens stay AES-256-GCM envelopes" (§6). No credential, host, or
  key value appears in any of them. **No secret value is printed anywhere in this report** — presence
  was checked by pattern only, never by reading values.
- No `.env`, `package.json`, lockfile, or CI/config file was opened for writing. No install command was
  run. No git command that restores from HEAD (`stash`/`checkout --`/`restore`/`reset`) was run, and
  nothing was committed.

### Claim 7 — the real path
This is a documentation change, so "it works" means the sentence is accurate and the operator following
it lands on the correct step. Verified by reading the *actual* target of both cross-refs (RUNBOOK §7.2
step 5 text; 0011's header lines) rather than trusting the report that described them. There is no
executable path to exercise; the doc contains no command the reader copies from here (the copyable
command lives in the RUNBOOK, unchanged by this task).
**Not exercised on a live database, by design** — production is out of scope and a replay of 0010 is
precisely the harm being documented.
