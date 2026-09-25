# Task Report: reviewer-docs10-deploy-loop

## Status
PASS

Independently re-derived the load-bearing factual claim (that `0010` is the *one* non-rerun-safe
migration) from source rather than inheriting it, hardened two instruments that gave misleading
outputs, and confirmed the pre-existing KI-031 dirty state is **not** this task's. All four
acceptance criteria met.

## Files Touched
- CREATED: Agent Reports/2026-09-23-0236_reviewer_REVIEW_docs10-deploy-loop.md (this report)

No file reviewed was modified. Read-only review: `Docs/10_deployment.md`,
`infra/RUNBOOK.md`, `apps/gateway/drizzle/0011_credit_ledger_subscriptions.sql`,
`apps/gateway/drizzle/0010_accounts_trial_ends.sql`, `Docs/06_data_model.md:202`,
`Docs/07_folder_structure_and_standards.md:77`, `.prettierrc`, `.prettierignore`,
`.github/workflows/{ci,deploy}.yml`, `packages/ai/src/{eval/spec-eval.test.ts,builder-prompt.test.ts}`,
`apps/gateway/package.json`, `package.json`. No installs, no commits, no git restore commands, no
production contact.

## Dependencies Added
None.

## Assumptions Made
- **Toolchain detection is deliberately minimal and stated:** Prettier 3.9.6 is the only formatter
  applicable to a Markdown doc; the repo's root `.prettierrc` is `printWidth 100`, `singleQuote`,
  `trailingComma: all`. There is no Markdown linter, and no typecheck/test applies to a prose file.
  I did not invent a gate that does not exist (Hard Rule: don't silently skip, don't invent).
- **"It works" for a docs change means the operator lands on the right step.** There is no executable
  path in this file — the doc contains no copyable command (the copyable command lives in the
  RUNBOOK, untouched by this task). So "the real path" = both cross-refs resolve to the lines they
  claim, and the described rule matches the runbook it points at. Both verified by reading the actual
  targets, not by trusting the fix report's quotations of them.
- **The pre-existing dirty state is excluded on evidence, not on the fix agent's word.** See
  Verification Evidence, Claim 4 — I established the 09-20 wave's provenance independently
  (dedicated wave report + per-hunk content match + sibling mtimes) before accepting the exclusion.
- I did not and cannot run `psql` against anything; production is out of scope and replaying 0010 is
  precisely the harm being documented. No live-DB verification is claimed.

## Open Questions for Orchestrator
1. **Commit hygiene, not a defect:** the KI-031 wave's edits to `Docs/10_deployment.md` are still
   uncommitted in the same file as this task's one-clause edit. The fix report flagged this (its Open
   Question 1) and it is true: `git diff --cached` for this file is empty, i.e. **index == HEAD**, so
   `git diff` shows all five hunks with no way to separate them by git alone. This file will land in
   whatever commit the orchestrator makes next, carrying the 09-20 wave's content with it. That is the
   wave's normal integration path, not a fault of this task — recorded so the committer is not
   surprised by the hunk count.
2. **A sibling range is stale, but it is a different defect class and correctly out of scope:**
   `Docs/06_data_model.md:202` says migrations are "applied in number order (`0001` → `0011`;
   RUNBOOK.md §7.2.5)" while `0012_bot_runtime_config.sql` has existed in the tree since 2026-09-20
   16:59. That is a stale *range*, not a replay instruction — it issues no loop and is not a hazard.
   The fix agent's Open Question 2 excluded this file on the grounds that its "per file by hand"
   phrasing is accurate as-is, which I agree with for *this* task's class; I am recording the
   separate range staleness so it is closed deliberately rather than by omission. Not this task's
   scope (it is a `06` edit, and `06` is outside the declared write scope).
3. No applied-migrations journal exists (inherited from the RUNBOOK report's Open Question 1). The
   hazard is now closed at the *instruction* level in both the RUNBOOK and the docs; it remains
   un-closed at the *mechanism* level, unchanged by this task. Not a blocker for this review.

## Public Interface Exposed
Review verdict only. The clause under review, as it now reads on `Docs/10_deployment.md:21`:

> DB migrations are forward-only hand-applied SQL (`RUNBOOK.md §7.2` step 5: one `psql` file per
> command, new files only, in number order — **never a glob loop over `apps/gateway/drizzle/`** —
> no `drizzle-kit migrate`, no runner script), AFTER a manual pre-deploy `pg_dump` snapshot
> (`RUNBOOK.md §7.2` step 4). **Do not loop the folder**: `0010_accounts_trial_ends.sql` is the one
> file that is not safe to run twice — its `UPDATE` re-arms the trial clock
> (`now() + interval '3 days'`) for every account whose clock is NULL, turning an account that
> should never expire into a 3-day lockout (the warning in
> `0011_credit_ledger_subscriptions.sql`'s header calls out exactly this).

## Known Limitations
- Docs-only change; nothing enforces the rule at run time. This is hazard reduction, not a mechanical
  guarantee — the same caveat the fix report and the RUNBOOK fix both state honestly.
- I could not separate this task's hunk from the 09-20 wave's hunks with git (index == HEAD). I
  attributed them by independent evidence instead (Claim 4); that evidence is strong but it is
  inference from artifacts, not a git-native diff boundary.
- No live-box or live-DB verification is possible or permitted; production is out of scope by the
  task brief and by the nature of the change.

---

## Verification Evidence

### Toolchain (detected, not assumed)
Prettier 3.9.6, root `.prettierrc` = `{printWidth: 100, singleQuote: true, trailingComma: all}`.
Config resolution confirmed from prettier's own debug output:
`"ignorePath":[".gitignore",".prettierignore"]`, `"configPrecedence":"cli-override"`. Markdown is
prose and Prettier leaves it untouched, so no reflow is expected — see Claim 5 for the proof that it
was nonetheless genuinely checked.

### Claim 1 — no glob/loop migrate instruction survives except the negation — PASS
- `grep -c -E '\*\.sql|for f in|psql loop' Docs/10_deployment.md` → **0**. The loop *description* is
  gone, not merely reworded around.
- The only `glob`/`loop` hits in the file are on line 21 and both are the negation itself:
  `**never a glob loop over \`apps/gateway/drizzle/\`**` and `**Do not loop the folder**`. Verified
  by context extraction (60 chars either side), not by count alone.
- The exact stale literal `psql loop over` → **0** occurrences.
- **Class closed repo-wide, not just at this call site:** `grep -rn "psql loop\|loop over apps\|for f
  in" --include=*.md .` (excluding `node_modules` and `Agent Reports`) → **no output**. The runbook's
  original `for f in` line was removed by the 01:31 task; no doc anywhere now instructs a folder
  replay. Consumers enumerated, not just the producer.

### Claim 2 — required elements present exactly once — PASS
| Element | Count |
|---|---|
| ``one `psql` file per command`` | 1 |
| `new files only` | 1 |
| `Do not loop the folder` | 1 |
| ``RUNBOOK.md §7.2` step 5`` | 1 |
| `0011_credit_ledger_subscriptions.sql` | 1 |
| `never a glob loop` | 1 |

`appleboy/ssh-action is SHA-pinned (\`deploy.yml:134\`).` — the paragraph's original closing sentence
— is still present, so the edit did not truncate the fact sheet.

### Claim 3 — cross-refs resolve to real anchors — PASS (read from source)
| Doc claim | Resolved to | Real? |
|---|---|---|
| `RUNBOOK.md §7.2` step 5 | `infra/RUNBOOK.md:137` = `### 7.2 First deploy — pull -> env -> snapshot -> backup -> migrate -> pull -> up`; `:154` = `5. **Migrate (forward-only).**` | YES |
| `RUNBOOK.md §7.2` step 4 | `infra/RUNBOOK.md:150` = `4. **Database snapshot (pg_dump).**` | YES |
| `RUNBOOK.md §7.4` (S2) | `infra/RUNBOOK.md:202` = `### 7.4 Rollback` | YES |
| `0011_credit_ledger_subscriptions.sql`'s header | `...0011...sql:5` = `-- ⚠️  NEVER RE-RUN 0010's UPDATE (it RE-ARMS the trial).`; `:7` contains the exact `now() + interval '3 days'` string the doc quotes | YES |
| `deploy.yml:134`, `ci.yml:115`, `deploy.yml:22-23`, `deploy.yml:13-16`, `deploy.yml:149-151` | appleboy SHA-pinned / `push: false` / `workflow_dispatch` / rollback note / `pull`+`up` | all YES |
| `spec-eval.test.ts:1-10` "offline stub, no fetch, no key, NOT model quality" | header verbatim matches | YES |
| `builder-prompt.test.ts` `parseSpec` parity net | `packages/ai/src/builder-prompt.test.ts`, 10 `parseSpec` mentions | YES |
| "no `drizzle-kit migrate`, no runner script" | `drizzle-kit` only a devDependency (`apps/gateway/package.json:36`); no `migrate` script in root or gateway scripts; no runner/migration script file exists (only filename matches are two Agent Reports) | YES |

Every anchor is real. No dangling reference, no invented line number.

### Claim 4 — the load-bearing fact re-derived from source (the decisive check) — PASS
The doc asserts `0010_accounts_trial_ends.sql` **"is the one file that is not safe to run twice."**
That word *one* is the whole safety claim, so I re-derived it instead of trusting the report.

**First I validated the instrument, and it failed.** A naive statement-position scan
(`grep -ciE '^[[:space:]]*(UPDATE|INSERT|DELETE)[[:space:]]'`) returned **0 for every file** —
including `0010`, which I had already read and knew contains a bare `UPDATE` at line 20. A
measurement that reports "nothing found" for a thing known to be present is a broken instrument, and
the null result it produced would have "confirmed" the doc for the wrong reason. (This is LESSONS
§1.1 in the wild: validate the instrument before acting on the number.)

**Corrected instrument, run twice and cross-checked:**
1. Keyword scan per file → then manual classification of every hit (`grep -inE
   '\b(update|insert|delete)\b'` with comment lines excluded).
2. Full statement listing of `0010` itself.

Result — after excluding comments, the *only* data-modifying statement anywhere in
`apps/gateway/drizzle/` is:

`0010_accounts_trial_ends.sql:20` → `UPDATE "accounts" SET "trial_ends_at" = now() + interval '3 days' WHERE "trial_ends_at" IS NULL;`

Every other hit was `ON DELETE CASCADE` inside a `REFERENCES` clause (0002 ×2, 0003, 0005, 0011 ×2)
— a referential constraint, not a statement. `0010` contains exactly two statements: `:18`
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotent, silent no-op on re-run) and `:20` the bare
`UPDATE` (not idempotent, does real harm on re-run). This matches the doc's description precisely,
including *why* it is unsafe. **The word "one" is factually correct, verified from source.**

### Claim 5 — Prettier clean, verified by running it (with the instrument hardened) — PASS
`prettier --check` has a live trap in this repo: its `ignorePath` includes `.gitignore` **and** a
zero-match run still prints "All matched files use Prettier code style!" and **exits 0** (proved with
a nonexistent path → error printed, `exit=0`, same success line). "It printed the success line" is
therefore not evidence on its own. Three independent confirmations:

1. **The file is genuinely in scope, not silently ignored:** `git check-ignore -v
   Docs/10_deployment.md` → exit 1 (not ignored); `.gitignore` has no `Docs`/`*.md` rule;
   `.prettierignore` has no `Docs` entry.
2. **Real exit code, taken without a pipe:** `npx --no-install prettier --check
   Docs/10_deployment.md` → **exit 0**; `--list-different` → empty output.
3. **Decisive — prettier's own output diffed against the file on disk:**
   `npx --no-install prettier Docs/10_deployment.md | diff - Docs/10_deployment.md` → **IDENTICAL**,
   6139 bytes both sides. Prettier's rendered output is byte-identical to the committed-to-worktree
   file. This is a strictly stronger statement than `--check` passing.
4. **The instrument can fail (guard broken and watched to fail):** a probe file with deliberate bad
   spacing, checked with the same invocation and the repo config, → exit 1, "Code style issues found
   in the above file." The check is capable of reporting a failure; its PASS here means something.

### Claim 6 — headings intact; other sections unchanged in meaning; pre-existing state correctly excluded — PASS
- **Headings:** identical set and order between worktree and HEAD — lines 3, 9, 19, 25, 31, 37, 43
  (worktree) vs 3, 11, 21, 27, 33, 39, 45 (HEAD). The uniform 2-line shift is exactly the DRIFT
  banner removal. No heading added, removed, reordered, or renamed. Six numbered sections plus the
  Status heading, in original order.
- **The exclusion of the dirty state is correct, and established on evidence.** `git diff --cached`
  for this file is empty (**index == HEAD**), so git cannot draw the boundary; the fix report's Open
  Question 1 concedes this honestly. Independent evidence that the four non-line-21 hunks are the
  2026-09-20 KI-031 wave, not this task:
  - The wave's dedicated report `Agent Reports/2026-09-20-0905_docs10_MODIFY_deployment.md` exists on
    disk and states its scope: *"trued eval-gate, Kuma, backup, rotation, env-checklist, start.ts
    workers across S2/S4/S5/S6; DRIFT removed."* That maps **1:1** onto the four other hunks:
    `@@ -5,2 +4,0 @@` = "DRIFT removed"; `@@ -35 +33 @@` (§4) = env-checklist + rotation;
    `@@ -41 +39 @@` (§5) = Kuma + start.ts workers; `@@ -47 +45 @@` (§6) = backup.
  - No other hunk contains any migration, loop, or drizzle text — the migration clause appears in
    exactly one hunk (`@@ -23 +21 @@`). The content separates cleanly along the same line the
    attribution does.
  - Wave sibling docs (`02_strategy`, `05_architecture`, `06_data_model`, `08_core_pipeline`,
    `09_auth_and_billing`) all carry mtimes `2026-09-20 09:04–09:11`, matching the wave report's
    `2026-09-20-0905` timestamp; `10_deployment.md` is the only file in that family with a
    today mtime, consistent with wave-on-09-20 then this-task-today.
  - `Docs/10_deployment.md` mtime `2026-09-23 02:36:49` matches this task's `0236` timestamp and its
    report mtime `02:37`.
  **Conclusion: the four non-line-21 hunks are the 09-20 wave. Not attributed to this task.**
- **Meaning change confined to the intended clause:** the rewritten clause keeps every fact the old
  one carried (forward-only, hand-applied, no `drizzle-kit migrate`, no runner script, snapshot
  ordering, appleboy pin) and replaces only the *procedure description* with the fixed procedure.
  Nothing else in §2's paragraph changed. Sections 1, 3, and the S4/S5/S6 rewrites are the wave's.

### Claim 7 — trust artifacts, not summaries — PASS
- Fix report exists on disk: `Agent Reports/2026-09-23-0236_docs10-deploy-loop_FIX_deploy-docs-loop.md`,
  9417 bytes, mtime `Sep 23 02:37`. The claimed path is real.
- The claimed modified file is really modified: `git status --porcelain -- Docs/10_deployment.md` →
  ` M` (tracked, modified, unstaged) — exactly as the report states.
- "No other file modified" corroborated: no other file under `infra/`, `apps/gateway/drizzle/`, or
  the doc set carries a migration/runbook edit attributable to this task. The other files touched
  today (`giveaway.ts`, `start.ts`, testbot) are the parallel agents' in-flight work named in
  `Docs/PLAN.md`, matching the fix report's own Claim 6 reasoning — not this task's.
- The report's stated verification numbers reproduce: element counts (all 1), the grep results, and
  the prettier result all independently match what I measured.

### Claim 8 — no secrets, no scope violation — PASS
- Secret-pattern scan on the added line 21 alone → **0** hits. No credential, host, token, or key
  value appears in the reviewed text, and **no secret value is printed anywhere in this report**
  (presence was tested by pattern only, never by reading values). Production box, Contabo, GHCR and
  live keys were out of scope and were not contacted.
- No `.env`, manifest, lockfile, or config opened for writing; no install run; no `git stash` /
  `checkout --` / `restore` / `reset` run; nothing committed. `git stash list` is empty, so no
  restore-from-HEAD instrument was risked against the uncommitted wave.

### Acceptance criteria — final tally
| Criterion | Verdict |
|---|---|
| No glob/loop migrate instruction survives except the negation | **PASS** (Claim 1, class closed repo-wide) |
| Cross-refs resolve to real anchors | **PASS** (Claim 3, all read from source) |
| Prettier clean verified by running it | **PASS** (Claim 5, byte-identical output; zero-match trap eliminated) |
| Pre-existing dirty state correctly excluded from verdict | **PASS** (Claim 6, independently established) |
| Report written to exact path | **PASS** (this file) |

**Verdict: PASS.** The reword is accurate, complete, correctly scoped, and prettier-clean. The one
claim that could have silently carried an inherited error — that `0010` is *the one* non-rerun-safe
file — was re-derived from source under a validated instrument and holds. The two items worth the
orchestrator's attention are both pre-existing and explicitly **not** this task's: the uncommitted
09-20 wave sharing this file (commit-hygiene note) and the stale migration *range* in
`Docs/06_data_model.md:202` (different defect class, correctly excluded here).
