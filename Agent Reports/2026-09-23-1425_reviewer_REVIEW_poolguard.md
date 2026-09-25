# Task Report: reviewer-poolguard

## Status
PASS

The pool guard + 90-day boundary wave is verified by independent re-execution.
The guard truly bites (wiring removed in a throwaway copy: 3 failed / 5 passed;
restored: 8/8), the 90-day boundary test runs live against Postgres and passes
with an exact-number assertion, and all gates are green. The 6 failures the
builder recorded are identified below and are concurrent-wave artifacts,
unrelated to this change — the full web suite is 63 files / 927 tests green at
review time.

## Files Touched
- CREATED: Agent Reports/2026-09-23-1425_reviewer_REVIEW_poolguard.md (this report)
- MODIFIED: none
- DELETED: none (a throwaway mutated copy at
  `apps/web/lib/db/__pgbreak__/` was created for the break-and-watch run and
  removed afterwards; `git status` confirms no residue)

**No source, test, config, manifest, or env file was modified by this review.**

## Dependencies Added
None. No install was run.

## Assumptions Made
- "This wave" is judged against the pre-wave working-tree state (which already
  carried the reviewed webwire wiring in `pool.ts`), not against `HEAD` — both
  `pool.ts` and `pool.test.ts` differ from `HEAD` by design.
- The builder's break-and-watch evidence was re-executed independently rather
  than taken on report: the mutation ran against a throwaway copy, never the
  real file.
- Full-suite numbers move because the tree is moving (concurrent waves); the
  verdict rests on the focused suite plus gates plus a full suite run from the
  correct cwd at review time, not on reproducing the builder's exact stale
  counts.

## Open Questions for Orchestrator
- **OQ-1 (process defect, concur with sibling OQ-1).** Two tasks in this wave
  held `apps/web/lib/db/pool.test.ts` in MODIFY scope: `2026-09-23-1410`
  (sibling effect guard + live boundary) and `2026-09-23-2014` (call-shape
  guard). Final numstat vs HEAD is `272 2`, not the `167 1` the 1410 report
  claims — the 1410 figure is stale by the sibling's later +107/−1. Both
  contributions are additive and intact (deletions are exactly the 2 import
  lines), so no corruption occurred, but this was luck plus re-read discipline,
  not harness safety. Recommend a mechanical write-scope collision check before
  spawning a wave (Hard Rule 14).
- **OQ-2 (still open, inherited).** The credits-display SQL
  (`apps/web/app/api/credits/route.ts:75-77`) is textually identical to
  `REFILL_CREDITS_SQL` (`packages/ai/src/budget.ts:61-63`), asserted by comment
  only — no test pins the two strings equal, so a one-sided edit would silently
  desynchronise the gate from the customer-visible balance. Needs a
  production-scope owner; out of this review's scope.
- **OQ-3 (note, not a defect).** An early read in this session showed
  `pool.ts:90` as commented (`// MUTATION-M1 __setRefillPool(pool);`); every
  subsequent fresh read plus `grep` confirms the active call
  `__setRefillPool(pool);` at `:90` and numstat `15 0`. The first read was a
  stale snapshot. Recorded so nobody chases the ghost.

## Public Interface Exposed
No production interface changed. This review created no code and changed no
interfaces. (`pool.ts` surface unchanged; `pool.test.ts` carries the sibling's
effect guard + live boundary and the second agent's call-shape guard.)

## Known Limitations
- The break-and-watch mutation was executed against a throwaway copy of the
  module, not by editing the real file — structurally the same module, but a
  copy. The real file was never mutated by this review.
- The live-PG boundary leg proves the gate side (`refillAllowance`); the
  display side (`credits/route.ts`) shares the SQL textually (verified
  identical) but is not string-equality-tested (OQ-2).
- No booted server / real HTTP request was performed; evidence is vitest suites
  plus the mutation run. Production-bundling identity (one `@corvus/ai`
  instance per Next process) remains the webwire review's compiled-artifact
  evidence, not re-derived here.
- `apps/gateway` was not run (out of scope).

---

## Verification

### V1 — Build report exists; wave scope is exactly the two pool files
- `Agent Reports/2026-09-23-1410_poolguard_FIX_pool-guard.md` exists and was read.
- `git diff --numstat -- apps/web/lib/db/pool.ts apps/web/lib/db/pool.test.ts`
  = `15 0` / `272 2`. `pool.ts` (`15 0`) is the prior reviewed webwire wiring
  only — `git diff` shows exactly the import, the 13-line comment, and the one
  call; this task touched nothing in it. `pool.test.ts` deletions are exactly
  the 2 import lines (`git diff -U0 | grep -c "^-[^-]"` = 2); every other hunk
  is additive. All other modified paths in the tree belong to concurrent waves
  (distinguished by path; none is in this task's scope).

### V2 — Guard bites (independently re-executed, throwaway copy)
- Real file untouched throughout: `grep -n "__setRefillPool(pool)"`
  `apps/web/lib/db/pool.ts` → line 90 active, before and after.
- Mutated copy (`__pgbreak__/`, wiring line neutralised, real file intact):
  `npx vitest run lib/db/__pgbreak__/pool.test.ts` → **3 failed / 5 passed**.
  Failing: the effect-based positive (`expected +0 to be 1000`), the
  count+identity guard (`toHaveBeenCalledTimes(1)`, 0 calls), and the
  stand-in-path call-shape test (post-URL construction never wires). Passing by
  design: the stand-in effect pin (seam reads 0 either way) and the instrument
  check (mock still intercepts — prod-side mutation). This matches the sibling
  2014 report's M1 shape (3 failed / 5 passed on the 8-test file) and subsumes
  the 1410 claim (1 failed / 4 passed on the earlier 5-test baseline).
- Throwaway copy deleted; real suite after: **8/8 green**.
- `pool.ts` numstat still exactly `15 0`. **Guard is real, not decorative.**

### V3 — 90-day boundary tested live, not a TODO
- `describe.skipIf` live-PG suite at `pool.test.ts:287-329` **executed** (22–54 ms
  runs across my runs), never skipped: inserts an 89-day-old refill row (1000,
  must count) and a 91-day-old refill row (5000, must NOT count), wires the live
  pool to the seam, asserts `refillAllowance(accountId)` resolves to **exactly
  `1000`** — a leaking aged row would read 6000 and fail. Cleanup via
  `DELETE FROM accounts` in `finally` with run-unique `discord_id`s.
- SQL identity confirmed on disk: `packages/ai/src/budget.ts:61-63` and
  `apps/web/app/api/credits/route.ts:75-77` carry the same
  `interval '90 days'` text. No TODO; OQ-2 records the remaining string-equality
  gap.

### V4 — Gates (all run by me, from `apps/web`)
| Command | Result |
|---|---|
| `npx vitest run lib/db/pool.test.ts --reporter=verbose` | **8/8 passed** (2 KI-021, 2 effect guard, 3 call-shape, 1 live boundary executed) |
| `npm run typecheck` (`tsc --noEmit`) | exit 0 |
| `npx eslint lib/db/pool.test.ts lib/db/pool.ts --max-warnings 0` | exit 0 |
| `npx prettier --check lib/db/pool.test.ts lib/db/pool.ts` | clean |
| `npx vitest run` (full web) | **63 files, 927/927 passed** |

### V5 — The 6 failing tests: identified, attributed, currently green
The builder's 915/921 snapshot named three files:

1. **`apps/web/app/api/spec/rollback/rollback.test.ts`** (2 failures at builder
   time — 5× TS2345 type errors from a concurrent edit). At review time:
   `npx vitest run app/api/spec/rollback/rollback.test.ts` → **23/23 passed**,
   web `tsc --noEmit` exit 0. The file imports `__setPool`/`__resetPool` from
   `pool.ts` for its own hermetic injection only — no refill-seam linkage.
   Verdict: **concurrent-wave transient, resolved, unrelated.**
2. **`apps/web/components/ui/ai-chat-input.test.tsx`** (3 failures). At review
   time: green standalone and in the full suite. Imports no pool, no
   `@corvus/ai`, no seam (checked). Verdict: **concurrent-wave artifact,
   unrelated.** (Note: running vitest from the repo root instead of `apps/web`
   breaks the `@/` alias and produces `Cannot find package '@/lib/utils'` —
   a cwd artifact, not a code defect; correct-cwd runs are green.)
3. **`apps/web/app/dashboard/bots/[id]/page.test.tsx`** (1 failure). At review
   time: green standalone and in the full suite (75/75 together with
   ai-chat-input). Imports `@/lib/bots` and the page only — no pool, no seam
   (checked). Verdict: **concurrent-wave artifact (timing-sensitive UI test on
   a moving tree), unrelated.**

None of the three imports or depends on `pool.test.ts` or the refill seam;
`pool.ts` was not touched by this task. The failures were recorded, not fixed —
correctly, per scope — and all three are green now. The full-suite total moved
915/921 → 927/927 because the tree moved (the second guard agent's +3 tests
plus concurrent waves' fixes/additions), not because of anything this task did.

### V6 — No side effects, no secrets
Hermetic guard opens no socket (unroutable fixture URL, `query` intercepted,
`pg` connects lazily); live leg uses only the repo's checked-in CI fixture
literals against the local fixture database. Secret scan over the touched scope
clean. No Discord, no HTTP, no SSH, no box/Contabo/GHCR contact. No manifest,
lockfile, `.env`, or config edit; no install; no git restore/stash/checkout/
reset/commit; no secret value read, printed, or transmitted.

## SECURITY
Production box, Contabo, GHCR, and live keys were never touched. No SSH, no box
`.env`, no registry push, no deploy. No `package.json`/lockfile/`.env` edit, no
install, no commit, and no git command that restores from HEAD. No secret value
was read, printed, copied, or transmitted — connection strings are the repo's
own checked-in CI fixture literals, presence-checked by reachability only. All
tests ran hermetically except the repo-sanctioned live-Postgres boundary idiom
against the local fixture database. This review modified no source file, and
its one throwaway artifact was deleted.
