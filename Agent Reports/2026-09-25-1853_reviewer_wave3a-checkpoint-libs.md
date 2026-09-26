# Review: wave3a-checkpoint-libs

## Verdict

PASS

## Task

reviewer-wave3a — verify wave3a-checkpoint-libs output (3 created files + its report). Fail closed on any doubt.

## Files confirmed on disk

- `apps/gateway/drizzle/0015_builder_checkpoint.sql` (exists, untracked, 1225 bytes)
- `apps/web/lib/builder/checkpoints.ts` (exists, untracked, 5103 bytes)
- `apps/web/lib/builder/gates.ts` (exists, untracked, 6631 bytes)
- Report `Agent Reports/2026-09-25-1847_wave3a-resume_CREATE_checkpoint-libs.md` (exists, read)

No "SUCCESS without files" situation. All three artifacts are real.

## 1. Does it actually work? (real toolchain, detected not assumed)

- Package manager: repo root `package.json` uses **npm** workspaces; `pnpm-lock.yaml` / `pnpm-workspace.yaml` exist as untracked files but `pnpm --filter web` matches nothing (`No projects matched the filters`). So pnpm filter commands are unusable here — used direct binaries instead.
- Typecheck: `apps/web` script is `tsc --noEmit`; ran root `node_modules/.bin/tsc --noEmit` from `apps/web` → **EXIT 0**, no output.
- ESLint: `node_modules/.bin/eslint apps/web/lib/builder/checkpoints.ts apps/web/lib/builder/gates.ts --max-warnings 0` → **EXIT 0**, no warnings.
- Vitest: not run — this slice created no test files and the task's follow-up (resume route + builder-runs tests) is explicitly out of scope. Stating this, not skipping silently: no unit tests exist for the two new libs, but the wave-3 pack assigns test Gates to the follow-up route task.
- Runtime smoke tests (node --experimental-strip-types, both modules imported and executed):
  - checkpoints: empty/misshaped detail → all-null defaults; `live`/`failed` lastGoodPhase → `checkpointAvailable === false`; `{syncing, brief}` → `true`; `checkpointNotice` returns the correct one of the two frozen strings; `writeCheckpoint` preserves unknown keys, `undefined` patch keeps previous value, null prev yields fresh record; `isRecord` rejects arrays/null/strings. All true.
  - gates: all six decision functions return the exact `{error, status}` pairs (401 unauthorized, 403 trial_expired with paid bypass, 422 invalid bot id with valid-uuid pass, 404 bot not found, 403 trial_budget_exceeded with paid branch naming the passed allowance, 409 no_plan_asked). GATE_ORDER has all 7 steps in SPEC order.

## 2. Contract check

- Migration `0015_builder_checkpoint.sql`: two `ADD COLUMN IF NOT EXISTS` (nullable `attempt integer`, `checkpoint_at timestamptz`) + one `CREATE INDEX IF NOT EXISTS` on `(bot_id, checkpoint_at)`. No UPDATE, no backfill, no NOT NULL, no column on any other table. `statement-breakpoint` style matches 0013 convention. Does not touch `builder_runs` phase/detail semantics. Note: `0014_conversations.sql` (Wave 1) is not on disk yet, so 0015 numbering assumes it lands first per SPEC §2 — expected, author documented this assumption; no renumber needed.
- checkpoints.ts: `CHECKPOINT_KEYS` is exactly the 7 SPEC-allowed additive keys (`briefChars, attempt, stepStartedAt, lastGoodPhase, checkpointBrief, error, provider`). `readPhase` accepts only `queued|generating|syncing` so terminal phases can never read as resumable. No `any` at code level (grep for `: any|as any|<any` → no matches; the only `any` is inside a comment). All unknown payloads pass through `isRecord`.
- gates.ts: mirrors the verdict route gate block (read-once honored per header note). Gate order `401 → 403-trial → 422 (botId + turns-shape step) → 404 → 403-budget → 409` matches SPEC §1. Byte-identity verified programmatically for all 7 locked message constants (TRIAL_ENDED, TRIAL_BUDGET, UNAUTHORIZED, INVALID_BOT, TURNS, BOT_NOT_FOUND, NO_PLAN) plus the paid-branch template literal and the `onTrial` predicate — all IDENTICAL to `apps/web/app/api/builder/verdict/route.ts`. `budgetRefusalMessage(tier, allowance)` correctly routes unknown/missing tier to the trial path via shared `isPlanTier`.
- Nothing imports `gates.ts`: repo-wide grep for `builder/gates` imports → only comments in `route.ts`/`run-timeline.tsx` mention the path; zero import statements. DESIGN-FIRST hold intact. Resume route `apps/web/app/api/builder/resume/route.ts` correctly does NOT exist yet (follow-up scope).
- Wave 3 copy strings byte-identical (em-dash verified): `RESUME_FRESH_NOTICE` and `RESUME_NO_CHECKPOINT_NOTICE`. `Resume build` label not in lib code — correct, owner surface owns it per report.

## 3. Code quality

- No secrets/credentials (grep for api-key/secret/sk-/bearer patterns → none). No frozen-string alterations (all 7 locked constants byte-identical; frozen files `verdict/route.ts`, `start/route.ts`, `bounds.ts`, `persona-prompt.ts`, `package.json` show zero modifications in git status). No emoji anywhere. `!` characters appear only as code operators (`!isRecord`, `!==`, `!session`, `|| !UUID_RE`), never inside string literals. No new runtime dependency: sole import is `isPlanTier` from `@corvus/ai`, already a declared dependency of `@corvus/web` (same import the verdict route uses); no manifest edited. No writes outside the three files: `apps/web/lib/builder/` contains exactly the two new files; other modified/untracked files in git status (`route.ts`, `globals.css`, `builder-progress.*`, `run-timeline.tsx`) belong to sibling waves, not this task.
- Minor observations (not findings, no fix required): `TURNS_MESSAGE` is exported from gates.ts but consumed by no function in the file (turns-shape lives in validateTurns+bounds by design); `GATE_ORDER` uses kebab names (`invalid-bot-id`, `turns-shape`) while error codes use spaces — intentional, documented split between step labels and wire codes.

## 4. Next.js compliance (per apps/web/AGENTS.md guide)

- Read `node_modules/next/dist/docs/index.md` (resolved from repo root; `apps/web/node_modules/next` not present — monorepo layout as the AGENTS.md block anticipates).
- Both new files are plain dependency-free TS libs: zero `next/*` imports, no `use client`/`use server` directives, no Route Handler/Server Component API usage whatsoever. No client/server boundary to violate; no deprecated App Router API in play. `isPlanTier` is a pure function import, server-safe.

## Required fixes

None.

## Evidence summary

- `tsc --noEmit` (apps/web): EXIT 0
- `eslint checkpoints.ts gates.ts --max-warnings 0`: EXIT 0
- checkpoints smoke: 11/11 assertions true; gates smoke: 11/11 assertions true
- 7/7 locked copy constants + paid branch + onTrial predicate: byte-identical to verdict route
- Frozen files: unmodified; no new deps; no out-of-scope writes
