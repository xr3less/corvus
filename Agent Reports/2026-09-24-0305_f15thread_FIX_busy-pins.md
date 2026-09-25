# Task Report: F15T-thread-busy

## Status
SUCCESS — both `busy` assertion blocks in `apps/web/lib/chat/thread.test.ts` now pin the unified refusal-reader behavior (code-shaped-unknown → Turkish generic). All gates green; `thread.ts` and `refusal.ts` byte-identical before/after.

## Files Touched
- MODIFIED: apps/web/lib/chat/thread.test.ts — ONLY the two `busy` blocks (old lines 94-99 and 129-136; new lines 94-102 and 132-139). Block 1's title changed `passes server error text through, generic otherwise` → `renders the refusal generic for an unknown code, generic otherwise`, its `toBe('busy')` → `toBe('<generic>')`, and a 3-line `/* F15: … */` comment was added. Block 2's title changed `falls back to error when message is absent, empty, or whitespace` → `resolves the error code when message is absent, empty, or whitespace` and all three of its `toBe('busy')` → `toBe('<generic>')`. Fixtures still feed `{ error: 'busy' }` unchanged (4 sites) — the code-shaped input is the point of both blocks.
- No other file created, modified, or deleted. `thread.ts` and `refusal.ts` NOT touched (checksum-proof below). No manifest, lockfile, `.env`, config, or source edit. No install command. No git restore/commit/push/deploy/migrate/secrets. All mutation work ran on temp copies outside the repo; every temp artifact was deleted afterwards.

## Dependencies Added
None.

## Assumptions Made
- **No web research was performed**, per the task's explicit guardrail — no live versions, model names, APIs, or pricing are involved in a pure-TS test edit. Stated here as instructed.
- **Codepoint source for the Turkish generic (as required).** Copied byte-for-byte out of `apps/web/lib/http/refusal.ts` line 65 (`const UNKNOWN_CODE_REFUSAL = …`), never retyped: the literal was extracted with a regex over the file on disk and interpolated into the test source by script. Verified after the write: 4/4 occurrences in the test file are UTF-8 byte-identical to the refusal.ts literal (`utf8 hex c4b07374656b2074616d616d6c616e616d6164c4b120e280942074656b7261722064656e652e`, 34 UTF-16 units; note U+0130 `İ` and U+0131 `ı` are distinct from ASCII `I`/`i`, and U+2014 is an em dash, not a hyphen). A negative control confirmed the ASCII-homoglyph variant (`I` in place of `İ`) appears nowhere in the file.
- **Decision inside scope: assert the literal, not an import.** `UNKNOWN_CODE_REFUSAL` is module-private (not exported) in `refusal.ts`, so a test cannot import it without editing the source — which is forbidden. The test therefore pins the literal, which is what the task's AC asked for ("If the exact generic string lives in refusal.ts, assert against it accordingly"). Cost, named honestly: the literal is now duplicated in the test, so a future copy change in `refusal.ts` will fail this test rather than silently pass. That is the intended failure direction (the test is a pin), and `refusal.ts` is the single source of truth this test guards.
- **Chose to UPDATE, not retire, both blocks** (the two options the F15 report's Open Question 1 offered). Both fixtures are meaningful and still exercise real behavior: `busy` is a genuine unknown-code-shaped input, and `{ error: 'busy', message: <blank|non-string> }` genuinely exercises the message-then-error fallback ladder. Retiring them would have dropped coverage of the unknown-code branch entirely, leaving the very leak F15 closed unguarded by a unit test.
- Added a 3-line comment in block 1 explaining *why* the code token no longer reaches the screen, matching the file's existing commented-test convention (the KI-033 comment above the sibling block).

## Open Questions for Orchestrator
1. **Founder language decision still stands, unchanged by this task.** The F15 report (Open Question 2) escalated that Turkish refusal sentences are now reachable on otherwise-English surfaces (gallery, interview, dashboard/new, chat lane, builder poller). This task only made a *test* expect that shipped behavior — it neither widens nor narrows the reach. Not a new decision; naming it so the wave does not read this green test as settling the language question.
2. **Named, excluded, same-class check (LESSONS §2 — enumerate the class).** I grepped the whole repo for the class "test asserting a raw error *token* where a sentence belongs". One other site feeds `{ error: 'busy' }`: `apps/web/components/ui/use-chat-stream.test.tsx:96`. **Excluded with reason: it is NOT the same class** — it asserts `status: 'error'` on the rendered row, not the message text, so it does not pin the leak; and it is outside my write scope. Verified by reading it and running that suite (6/6 pass, exit 0, unaffected by this task). No other same-class site exists (the gallery raw-code test was already retired by F15).

## Public Interface Exposed
No exported signature changed — the task touched a test file only. `readHttpError(response)` keeps its `(Response) => Promise<string>` shape; `readRefusalMessage(payload, options?)` keeps its `(unknown, {allowErrorFallback?: boolean}) => string | null` shape. No production code path is affected by this task.

## Known Limitations
- **Not verified in the running app.** No human completed a refusal flow in a browser this task; evidence is gate-, suite-, hash-, and mutation-probe-level. Same honest limitation the F15 build report and its reviewer both recorded. For a test-only change to a pure-TS module this is the whole surface — there is no app flow this edit can alter — but it is named rather than glossed.
- The test pins a literal duplicate of a module-private constant (see Assumptions); a copy change in `refusal.ts` must be mirrored here.
- The `thread.test.ts` diff vs HEAD also contains other agents' uncommitted wave work (the `stitchBrief` block and two imports). That is not my authorship; my delta is proven exactly scoped below.

## Verification

Toolchain detected, not assumed: npm workspaces + package-lock.json, vitest 5.0.0 via `apps/web/vitest.config.mjs`, `tsc --noEmit`, ESLint 9 flat config at repo root `--max-warnings 0`, Prettier 3.9.6 with repo-root `.prettierrc` (printWidth 100, singleQuote, trailingComma all). Exit codes captured directly, never through a pipe (the one piped suite run captures `${PIPESTATUS[0]}`).

| Gate | Command (cwd) | Result |
|---|---|---|
| Typecheck | `cd apps/web && npx tsc --noEmit` | **exit 0**, zero output |
| Lint (apps/web) | `cd apps/web && npx eslint lib/chat/thread.test.ts --max-warnings 0` | **exit 0**, clean |
| Lint (repo root, project convention) | `npx eslint apps/web/lib/chat/thread.test.ts --max-warnings 0` | **exit 0**, clean |
| Lint non-vacuous | same, `--format json` | file **present** in results, `errorCount: 0 warningCount: 0 messages: 0` — proves eslint actually processed the file rather than matching nothing |
| Format | `cd apps/web && npx prettier --check lib/chat/thread.test.ts` | clean, **exit 0** (also clean *before* the edit, so the green is not an artifact of my change) |
| Target suite | `cd apps/web && npx vitest run lib/chat/thread.test.ts` | **18 passed (18)**, 1 file, **exit 0** — matches the 18/18 the AC expected (was 16 pass / 2 fail before) |
| Target suite re-run | same, after all edits, on the merged tree | **18/18 pass, exit 0** |
| Full suite | `cd apps/web && npx vitest run` | **65 files / 994 tests passed, exit 0** — the merged tree is green, not just my file |
| Sibling class check | `cd apps/web && npx vitest run components/ui/use-chat-stream.test.tsx` | 6/6 pass, **exit 0** |

### Source-unchanged proof (task requirement)
sha256, before → after. Sources are byte-identical; only the in-scope test file differs.

| File | Before (baseline) | After | Verdict |
|---|---|---|---|
| `apps/web/lib/chat/thread.ts` | `987329017aae3958d4b4d61487ea289c951ed202487db12e9faba3101a4b6f4e` | `987329017aae3958d4b4d61487ea289c951ed202487db12e9faba3101a4b6f4e` | **IDENTICAL** |
| `apps/web/lib/http/refusal.ts` | `80c87d190c459dcb4ab8078fb73f93830f155f3168845e7bb4be62f376fb8c83` | `80c87d190c459dcb4ab8078fb73f93830f155f3168845e7bb4be62f376fb8c83` | **IDENTICAL** |
| `apps/web/lib/chat/thread.test.ts` | `dee8ff65913d0ffbbdf705b09fed61c0bf567950ba1ccbd03333bbcac006a0e2` | `df78b264c31da73bcd4d2dea93cfa36c6a38faa1019310286107e091d1c0878f` | expected to differ (the one in-scope file) |

### Exactly-scoped delta proof
Because `thread.test.ts` also carries other agents' uncommitted wave work, "only my blocks changed" was proven rather than asserted: reverse-applying my two new blocks back to their old text reproduced the file at sha256 `dee8ff65…` — **byte-for-byte the pre-edit baseline**. So my delta is exactly those two blocks and nothing else in the file moved.

### Guard-actually-guards proof (mutation, not self-report)
The two new assertions were verified to be real guards, in temp copies outside the repo. **Instrument note, named because the first attempt was wrong:** the initial single-process probe query-busted `thread.ts` but not its static import of `refusal.ts`, so both directions read the same cached module and returned identical results. That is a broken instrument, not a finding; the probe was rebuilt as one process per direction (5th of the LESSONS §2 "validate the instrument" pattern).

- **Mutated** (the pre-F15 leak restored: `return /\s/.test(code) ? code : UNKNOWN_CODE_REFUSAL;` → `return code;`): the OLD assertions pass **4/4** while the NEW ones fail **0/4** → the new assertions genuinely fail if the leak comes back.
- **Control** (real repo bytes, same wiring): OLD fail **0/4**, NEW pass **4/4**.
- Neighbour assertions in the same blocks were checked on the real reader and still hold: unreadable body 500 → `The reply stopped unexpectedly. Try again.`; body with neither field → same.

### Files re-read after the edit to confirm content
`thread.test.ts:94-102` and `:132-139` read back correctly: 4 generic assertions, 0 raw `toBe('busy')` expectations, 4 fixtures still feeding the code-shaped input. `refusal.ts` line 65 and `thread.ts:136-147` re-read and unchanged.
