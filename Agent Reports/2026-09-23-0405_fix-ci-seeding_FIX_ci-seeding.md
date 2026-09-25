# Task Report: fix-ci-seeding

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/api/interview/interview.test.ts
- MODIFIED: apps/web/app/api/templates/templates.test.ts

No production file changed. `apps/web/lib/bots.ts` (the `mintGate` cap) was read-only and is byte-identical.

## Dependencies Added
None.

## Assumptions Made
- The `tier`-missing 500s measured on a pristine DB and the M-12 cap-collision 403s are two layers of the same defect family (both are seeding/isolation failures, both fixed by test-side changes only). The pristine-DB baseline masked the cap collision behind `column "tier" does not exist`; the cap-collision mechanism itself was verified statically against `apps/web/lib/bots.ts:111` plus the suites' shared-owner structure, not by re-running the pre-fix files on a tier-present DB (doing so would have required a forbidden git-restore of the working tree).
- `vitest run` executes a file's tests sequentially in declaration order; cross-file parallel workers share one Postgres, so per-test unique owners (random tags) — not file-level serialization — are the correct isolation unit.
- The scratch container `corvus-ci-pg` (postgres:17, `corvus`/`corvus_ci`/`corvus_ci` on port 5434) was left running to match the suites' default `TEST_DATABASE_URL`; interview rows accumulate across runs but use per-run unique tags and never collide.

## Open Questions for Orchestrator
- `interview.test.ts` `afterAll` still does no row cleanup (unlike `templates.test.ts`, which deletes `tfork-*` rows). Harmless today because every account tag is unique per run, but a `DELETE FROM accounts WHERE discord_id LIKE 'interview-test-%'` + bots cleanup would keep the shared container tidy. Left untouched to keep the diff minimal — say the word and it is a one-block follow-up.
- M-13 (no migration runner / no journal) and m-50/m-52 are untouched per scope; the `TIER_COLUMN_DDL` self-heal added here is the same best-effort pattern as the existing `TRIAL_COLUMN_DDL` one, not a substitute for a real runner.

## Public Interface Exposed
None (test-only change). New test helpers, for reviewer reference:
- `interview.test.ts`: `freshOwner(tagPrefix): Promise<InterviewSession>` — mints a new running-trial account, `actAs` it, returns the session (used by the 5 flow tests: `itv-start`, `itv-foreign`, `itv-422`, `itv-order`, `itv-walk`).
- `templates.test.ts`: `forkAsFreshOwner(slug, body?): Promise<{ status, body }>` — forks as a fresh trial owner and restores the shared `session` reader in `finally` (used by happy-path, botName-override, double-fork tests). The shared `session` account now never mints; `afterAll` cleanup widened from `tfork-gate-%` to `tfork-%`.

## Known Limitations
- The pre-fix cap-collision 403 counts are derived by static analysis (shared-owner + `liveBotCount >= 1` → 403), not by executing the pre-fix files on a tier-present DB — the pristine-DB baseline surfaced the `tier`-missing 500s first, and re-running pre-fix content would have needed a forbidden working-tree restore.
- Full-suite (all web files) and cross-workspace runs were not executed; only the two in-scope files together, which is what the acceptance criteria require.
- The pre-existing `interview.test.ts` non-Postgres describes (unauthenticated 401s, unconfigured-DB 500s) are untouched and still pass.

## Verification evidence

### Guard broken first (unmodified files, pristine DB)
Fresh `postgres:17` container on port 5434 (`corvus`/`corvus_ci`/`corvus_ci`), no migrations applied — the CI shape. Ran the suites BEFORE any edit:
- `interview.test.ts`: **8 failed / 6 passed (14)** — every Postgres test that mints (`refuses a second bot`, `refuses an expired clock`, `fails open grandfathered/paid`, `takes effect without re-login`, `starts an interview`, `rejects unknown questionIds`, `rejects out-of-order`, `walks the full tree`) failed with `expected 500 to be 200`.
- `templates.test.ts`: **7 failed / 12 passed (19)** — every fork test (`fork 404 unknown slug`, `happy path`, `botName override`, `double fork`, `second-fork 403`, `expired clock`, `paid/NULL clock`) failed the same way.
- Root cause probed directly: manual `INSERT INTO accounts` + `SELECT tier, ...` (the gate's `MINT_ACCOUNT_SQL`, `apps/web/lib/bots.ts:130`) reproduced `column "tier" does not exist`. The suites apply only sibling migrations 0001–0003, and 0001+0002 create `accounts` with NO `tier` (added later by 0008, `apps/gateway/drizzle/0008_accounts_tier.sql`); neither suite self-healed `tier` (only `trial_ends_at`). The existing `TRIAL_COLUMN_DDL` pattern and the sibling precedent (`activity/route.test.ts:133`, `checkout/create/route.test.ts:576`) confirmed the missing piece.
- Cap-collision layer (M-12 mechanism, static): with `tier` present, `interview.test.ts`'s 5 flow tests share one `owner` — the first mint succeeds and the rest hit `mintGate`'s `liveBotCount >= 1` → 403 (`apps/web/lib/bots.ts:111`); `templates.test.ts`'s shared `session` account caps after its first fork. This matches the fixwave-batch reviewer's "interview (3) + templates (2)" deterministic 403s.

### The fix (test-side only)
1. `TIER_COLUMN_DDL` self-heal (`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'trial'`, mirroring 0008) added to `ensureSchema` in both files.
2. Fresh-owner isolation: `freshOwner()` in interview (5 flow tests), `forkAsFreshOwner()` + never-minting shared `session` in templates (happy-path, override, double-fork). No test asserts a weakened cap — the dedicated gate tests (`refuses a second bot/fork`, `expired`, `paid/NULL`) still mint-then-refuse against the production gate unchanged.

### After (exact commands, from `apps/web`)
- `DATABASE_URL=postgresql://corvus:corvus_ci@localhost:5434/corvus_ci npx vitest run app/api/interview/interview.test.ts app/api/templates/templates.test.ts` on a **fresh-restarted DB: 2 passed, 33 passed (33)**.
- Same command **twice in a row on the same DB state: 33/33, then 33/33** (deterministic, no order dependence within or across runs).
- Reversed file order (`templates... interview...`): **33/33**.
- `npx tsc --noEmit` in `apps/web`: exit 0.
- Root `npx eslint apps/web/app/api/interview/interview.test.ts apps/web/app/api/templates/templates.test.ts --max-warnings 0`: exit 0.
- `npx prettier --check` on both files: clean (after one `--write` pass).
- `git status --short` on `apps/web/lib/bots.ts` + both test files: only the two test files modified; production gate byte-identical. Diff contains no secrets/credentials (only `TEST_DATABASE_URL`, `corvus_ci`, `DISCORD_CLIENT_ID` fixture references) and no weakened-cap assertion (only comment citations of `liveBotCount >= 1` → 403).
