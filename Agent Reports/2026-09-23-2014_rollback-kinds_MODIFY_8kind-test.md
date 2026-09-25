# Task Report: rollback-kinds-widen

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/spec/rollback/rollback.test.ts
- CREATED: Agent Reports/2026-09-23-2014_rollback-kinds_MODIFY_8kind-test.md

`apps/web/app/api/spec/rollback/route.ts` NOT touched (mtime 2026-09-23 01:46, ~19h before this task started; production route untouched as required).

## Dependencies Added
- None (no manifest/install; `defaultTranslateProdSpec` is an added named import from the existing `../publish/route`).

## Assumptions Made
- The 8-kind truth is the 4-way on-disk agreement, not memory: `apps/gateway/src/runtime/config.ts:11-20`, `apps/gateway/src/db/schema.ts:111-114`, `apps/gateway/drizzle/0013_runtime_kinds_tickets.sql:12-14`, `apps/web/app/api/spec/publish/route.ts:66-76` (plus `packages/ai/src/builder-prompt.ts:19`). Note the brief cited `apps/web/.../publish/route.ts:66-78`; the kind tuple ends at :76 (`export type RuntimeKind` is :78). No kind was renamed from memory.
- `publish.test.ts` is the sibling that already performed this exact widening (its FALLBACK_DDL carries 8 kinds + the DROP/ADD re-assert, and its `ensurePg` already lists 0013). The rollback suite was the one file left at 6. I mirrored that established pattern rather than inventing a new one.
- Next.js `AGENTS.md` caution: `apps/web/node_modules/next/dist/docs/` is ABSENT (web has no local `node_modules`), but the docs DO resolve from the repo root — `node_modules/next/dist/docs/` exists (`01-app`, `02-pages`, `03-architecture`, `04-community`, `index.md`). This task writes no Next.js API code (test-only, no route/app surface), so no guide was load-bearing; noting the resolution path since the brief asked.
- The negative pin uses `NOT` the shared `bot_runtime_config` fence but a dedicated TEMP table — see Known Limitations / the race finding below.

## Open Questions for Orchestrator
1. **Pre-existing fragility surfaced (not introduced, not fixed — out of scope).** `FALLBACK_DDL`'s trailing `ALTER TABLE ... ADD CONSTRAINT ... CHECK` is a *validating* add. On the long-lived CI database `bot_runtime_config` already holds 8-kind rows, so if that DDL ever narrows the fence the statement fails with a raw Postgres constraint error at `ensurePg` and takes 12 tests down with an opaque message. It is correct today (the DDL now matches the shipped 8 kinds), but the failure mode when it drifts is undiagnosable. Suggested follow-up for whoever owns the harness: `NOT VALID` on that re-assert (semantics-identical for new rows, immune to pre-existing data), or accept it as the loud canary it currently is. I did not change it because the fence is correct and the change is outside a test-only widen.
2. `Docs/06_data_model.md` §5 / `Docs/10_deployment.md` and `PLAN.md:195` 6-vs-8 drift (findings #1/#2/#4 of `2026-09-23-1240_inspect-docs-ci_REVIEW_docs.md`) remain open. This task closes only the test-side half of finding #4; the `rollback/route.ts:18` comment still names ~6 kinds. All are doc/comment-only and outside my scope.
3. Report timestamp: the brief specified the exact string `2026-09-23-2014`; the system clock at write time reads `2026-09-23-2044`. I used the brief's string verbatim in the filename per instruction. (Noting the discrepancy rather than silently reconciling it.)

## Public Interface Exposed
None. Test-only file; no exported surface added. New module-level test scaffolding (all module-private):
- `MIGRATION_SOURCES: readonly string[]` — the sibling migrations `ensurePg` applies, now including `0013_runtime_kinds_tickets.sql`.
- `WIDENING_MIGRATION: string` — the 0013 path, pinned separately so an assertion can name it.
- `RUNTIME_KINDS_8: readonly string[]` — the 8-kind truth in `config.ts:11-20` order.
- `expectKindSet(expected: readonly string[]): Promise<void>` — reads the live fence via `pg_get_constraintdef`, asserts the set AND its length, embeds the applied/unreadable source split in the failure message.
- `ALIAS_DIRECTION_CASES` — the alias→canonical direction table.

## Known Limitations
- **What this task does NOT cover:** the `rollback/route.ts:18` header comment still enumerates ~6 kinds (doc drift, out of scope); `Docs/*` and `PLAN.md:195` 6-vs-8 drift untouched; no branch/alias added to `KIND_ALIASES`; the production route's behaviour is unchanged (test-only task).
- **Honest bound on `expectKindSet`:** it asserts the SET read off the live constraint, not the SQL text that produced it. A fence widened by some path other than the shipped migration still passes. What it cannot pass is the 6-kind DDL this suite used to build — the drift it exists to catch. The gap for "0013 was dropped from the source list but FALLBACK_DDL masks it" is closed separately by the two no-DB pins in `describe('the widening migration is a real input, not a masked one')` (`:500-523`), which assert both that `MIGRATION_SOURCES` contains the 0013 path and that the 0013 file on disk really declares all eight kinds plus its `DROP`.
- **Negative pin runs on a TEMP table, not `bot_runtime_config`.** Deliberate: narrowing the real fence would mutate a table `publish.test.ts` writes E1-kind rows to, and vitest runs the two files in parallel workers against the same database — a real cross-file race, not a hypothetical. The temp table carries an identical CHECK, so the dialect under test (6-member IN-list vs 8) is the same while the blast radius is one session. Consequence: this test pins the *fence semantics*, not the literal constraint name `bot_runtime_config_kind_check` (that name is pinned by `expectKindSet` against the real table).
- Full web suite has ONE pre-existing failure unrelated to this scope — see Verification §3.

## Verification

### 1. What changed on disk
`apps/web/app/api/spec/rollback/rollback.test.ts`, 5 additions to the suite (16 → 23 tests, +2 no-DB describes, +1 DB case, +1 negative pin, +1 source pin), and these three widenings:
- `FALLBACK_DDL` (`:117-135`): `bot_runtime_config` CHECK now lists all 8 kinds, with a trailing `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` pair mirroring 0013's own statements. Rationale recorded inline: `CREATE TABLE IF NOT EXISTS` is a no-op on the long-lived CI database, so the re-assert is what guarantees the fence on both a fresh fallback and a table born under the old DDL.
- `MIGRATION_SOURCES` (`:148-158`): added `../../../../../gateway/drizzle/0013_runtime_kinds_tickets.sql`. The loop now records which sources applied vs. went unreadable (`pgSource`), reported in the fence test's failure message.
- New blocks: `RUNTIME_KINDS_8` (`:318`), `expectKindSet` (`:338`), `ALIAS_DIRECTION_CASES` (`:393`), `describe('rollback carries the 8-kind vocabulary (pure translator)')` (`:453`), `describe('the widening migration is a real input, not a masked one')` (`:500`), the two DB cases (`:900`, `:981`).

The 8-kind assertion also rides the route's own write path, not just the fence: `:900` publishes a v1 carrying all eight kinds (one via its alias `panel`), publishes a v2 carrying only `status`, then rolls back to v1 and asserts all eight rows are re-inserted by the route's DELETE-then-INSERT with `specVersion: 1`, and that `tickets.params.items[0].title === 'Support'` (the alias resolved to its canonical kind; the literal `'panel'` never reaches the table).

### 2. Gates — run from `apps/web` (toolchain detected from disk, not assumed)
npm workspaces monorepo (`package-lock.json`; no pnpm/yarn/bun lockfile). Scripts per `apps/web/package.json`: `typecheck: tsc --noEmit`, `lint: eslint .`, `format: prettier --check`, `test: vitest run`.
- Focused suite: `npx vitest run app/api/spec/rollback/rollback.test.ts` → **1 file passed, 23 passed / 23, 0 failed**. Baseline before my change was **16 passed / 16**.
- Typecheck: `npx tsc --noEmit` → **exit 0**.
- Lint: `npx eslint "app/api/spec/rollback/rollback.test.ts" --max-warnings 0` → **exit 0, zero warnings**.
- Prettier: `npx prettier --check "app/api/spec/rollback/rollback.test.ts"` → **"All matched files use Prettier code style!"**. (Before `--write` it flagged 4 wraps in lines I added — all my own, no pre-existing drift in this file. Confirmed by diffing the proposed output: 4 hunks, all inside my new blocks.)
- Verified the DB cases actually EXECUTE rather than silently skip: `--reporter=verbose` shows all 23 as `✓` (no `↓`), DB cases at 6-72ms against the live `corvus-ci-pg` on :5434.

### 3. Full web suite (recorded honestly)
`npx vitest run` from `apps/web` → **Test Files 1 failed | 62 passed (63); Tests 1 failed | 926 passed (927)**.
The single failure is `app/dashboard/bots/[id]/page.test.tsx > bot detail page > shows the attachment count on the user row only when files are attached` — a jsdom UI test that READS a chat thread/attachment count. It is **pre-existing and unrelated**:
- `page.test.tsx` does not import or reference my file (`grep -c "rollback.test"` → 0).
- It fails identically in isolation (1 failed | 55 passed / 56) with the rollback suite not running.
- It is an uncommitted file from another wave (`git diff --stat HEAD` → 513 insertions), untouched by me (mtime outside my session).
- The failure reproduces before and after my change. My scope has no path to it.
**Instrument caveat, recorded because it affects the count I am reporting:** an earlier full run of mine reported `906 passed (907)` with **62** files, and later runs reported `926 passed (927)` with **63**. The delta is not mine — `find` shows other agents concurrently writing to this shared working tree during my session (`lib/db/pool.test.ts` mtime 20:41, after my 20:31 run; also `app/auth/error/page.test.tsx`, `app/api/chat/route.test.ts`, `app/page.test.tsx`, `lib/demo/brain.test.ts` all touched during my window). So the full-suite total is not a stable number in this tree and I am reporting both observations rather than one number as if it were fixed. The FOCUSED count (23/23) is stable across 5+ consecutive runs and is the one that isolates this task.

### 4. Guard honesty — I broke each guard and watched it fail (no git restore commands anywhere)
Backup taken to `%TEMP%\rollback-kinds-backup\` (outside the repo), SHA256-verified identical, restored by plain file copy. No `stash`/`checkout --`/`restore`/`reset` at any point. Backup dir removed at the end.
- **Guard A — "ensurePg sources include 0013":** removed the 0013 entry from `MIGRATION_SOURCES` → **1 failed | 22 passed**, failing exactly `ensurePg sources name the 0013 widening file`. Restored (hash match), re-ran → 23/23.
- **Guard B — "FALLBACK_DDL fence is 8 kinds":** narrowed both CHECK literals in `FALLBACK_DDL` back to the pre-0013 six (`RUNTIME_KINDS_8` deliberately left intact) → **12 failed**, first failure naming `ensurePg`'s `ADD CONSTRAINT` ("check constraint ... is violated by some row" — the pre-existing fragility of Open Question 1). Restored (hash match), re-ran → 23/23.
- **Guard C — `expectKindSet` names the drift rather than leaking a Postgres error:** under the Guard B mutation the first DB case failed with the intended message, not a bare constraint error: `bot_runtime_config_kind_check is not the 8-kind fence. A 6-kind fence here is 0012's pre-0013 DDL and means the widening never reached this database — the two E1 kinds (tickets, reaction-roles) cannot be stored.` followed by `fence=...; expected=[8 kinds]; actual=[6 kinds]; applied=[...5 sources...]; unreadable=[]`. The assertion ordering (fence before INSERT) is what produces this.
- **Guard D — cross-file safety:** ran rollback + publish together (the two files sharing the table) → **2 files passed, 52/52**.

### 5. Defect I found in my OWN first draft, and fixed
My initial negative pin narrowed the real `bot_runtime_config` constraint with a `DROP`/`ADD ... NOT VALID` pair plus a `try/finally` restore. It was wrong in two ways and I caught both by running it:
1. A plain `ADD CONSTRAINT` validates existing rows, and by then sibling tests had written E1 rows — so it failed on THEIR data. I first papered over this with `NOT VALID`, which was still wrong for the deeper reason below.
2. **The real problem: it mutated a table another test file writes to, in parallel.** vitest runs `rollback.test.ts` and `publish.test.ts` in separate workers against one database, so narrowing the shared fence intermittently broke `publish.test.ts`'s INSERTs — a flake I would have been introducing into a file I do not own.
Rewritten to use a session-scoped TEMP table with no transaction (a constraint violation aborts a transaction, which then poisons that pooled connection for whichever test gets it next — observed as `current transaction is aborted` on the following test). The temp table carries an identical CHECK, so the 6-vs-8 dialect under test is unchanged and the blast radius is one session. Post-fix: 5 consecutive focused runs 23/23, plus the 52/52 pairing.

### 6. Scope / security
- Only `apps/web/app/api/spec/rollback/rollback.test.ts` modified. `route.ts` untouched (mtime + zero grep hits for any of my identifiers).
- No production access (no SSH/box .env/Contabo/GHCR), no live keys, no secret values printed.
- No manifest/lockfile/`.env` edits, no installs, no commits, no pushes, no DB migration run against real data, no file deleted outside scope.
- No git command that restores from HEAD (`stash`/`checkout --`/`restore`/`reset`) was run at any point — the wave's uncommitted work was preserved; guard cycles used an outside-repo copy.

## Research Sources
No web research was needed: this task is bounded by on-disk artifacts, and the brief's RESEARCH FIRST directive is satisfied by reading them rather than by external lookup. Every kind name and line citation above was read off disk this session (`config.ts:11-20`, `schema.ts:111-114`, `0013:12-14`, `publish/route.ts:66-76`, `builder-prompt.ts:19`, `0012:28-29`). Per Principle 5b, no version/model/API/pricing fact was asserted from memory.
