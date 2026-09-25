# Task Report: reviewer-gateway-smalls

## Status
SUCCESS

## Verdict
PASS

---

## Files Touched
- CREATED: Agent Reports/2026-09-23-0825_reviewer_REVIEW_gateway-smalls.md
- MODIFIED (transient, restored byte-identical): apps/gateway/src/runtime/dispatcher.ts — mutation applied then restored via plain `cp`; SHA256 verified identical before/after (aa a61ed8…5c375b). mtime is now 08:21 because of the restore; content is unchanged from the pre-review state. No source file was left modified by this review.

## Dependencies Added
None. No installs run, no manifest edits.

## Assumptions Made
- Toolchain detected, not assumed: `apps/gateway/package.json` scripts → `typecheck: tsc --noEmit`, `test: vitest run`, `format: prettier --check`. Lint lives at the repo root (`eslint.config.mjs`, root script `lint: eslint . --max-warnings 0`). Reviewer used the real commands for each.
- "Touched files" for the Prettier gate = the 14 files the author declared MODIFIED (8 sources + 6 test files).
- m-33's spec point was read as "resolution happens at the read side, `BOOT_CONFIG_SQL` unchanged", and verified as such rather than by mutating the SQL.

## Open Questions for Orchestrator
1. m-30's test does not actually exercise the guard it claims to. See Finding F-1 — non-blocking, but if a mutation-proven guard is required for m-30 the test must be upgraded (fake-timer handle without `unref`) rather than the source changed.
2. Author raised m-33's missing `ORDER BY` on `BOOT_CONFIG_SQL` as an Open Question. This review confirms the current behavior is correct (resolution is read-side only and order-independent for scoped/global), so the SQL follow-up is an optional hardening, not a defect.
3. m-36 remains ASSESS-ONLY with three options on the table (A durable Postgres port / B periodic flush / C keep in-memory). That is a product-shaped decision for the founder — flagged, not resolved here.

## Public Interface Exposed
Verified present and unchanged in shape from the author's claim:
- `resolveModuleConfig(configs: RuntimeConfigRow[], kind: RuntimeKind, guildId?: string | null): RuntimeConfigRow | null` — apps/gateway/src/runtime/loaders.ts:54
- `LoadBotOptions.guildId?: string | null` — apps/gateway/src/runtime/loaders.ts:40
- `getBadWordsRe(badWords: readonly string[]): RegExp` — apps/gateway/src/runtime/moderation/automod.ts:59
- Unchanged: `BOOT_LIVE_BOTS_SQL` (start.ts:310), `BOOT_CONFIG_SQL` (boot-modules.ts:21), `buildXpModule` (xp.ts:276).

## Known Limitations
- Independently mutation-proved ONE guard (m-31). m-28/m-29/m-30/m-32/m-33/m-35 were verified by region read + named test + suite-green, not each by mutation. The author's report disclosed this same limitation.
- The author's own m-34 mutation proof was corroborated only by their surviving backup artifact, not re-performed by this reviewer (the reviewer's single allowed mutation was spent on m-31, an unpinned guard, to maximise coverage value).
- No live/production contact was made — per task scope. "Does it work" here means suites + typecheck + lint + format on the real toolchain, not a live Discord gateway session. No browser-visible surface exists for these changes.
- No secret VALUE was read, printed, or recorded. Secret hygiene was checked by pattern-count only.

---

## Verification

### Gate 1 — DOES IT WORK

**9-suite command (author's exact command, run from `apps/gateway`):**
```
npx vitest run src/db/builder-runs.test.ts src/runtime/connector/connector.test.ts src/runtime/dispatcher.test.ts src/runtime/registry.test.ts src/runtime/welcome/handler.test.ts src/runtime/moderation/moderation.test.ts src/runtime/games/xp.test.ts src/start.test.ts src/runtime/boot-modules.test.ts
```
- Run 1: `Test Files 9 passed (9)` / `Tests 161 passed (161)` — matches author's claim exactly.
- Run 2 (flake check): `Test Files 9 passed (9)` / `Tests 161 passed (161)` — identical. **No flake.**

**Typecheck (real command from package.json):**
`npm run typecheck --workspace @corvus/gateway` → resolves to `tsc --noEmit` → exit 0, no output.

**ESLint (8 touched sources, zero-warning gate):**
```
npx eslint apps/gateway/src/db/builder-runs.ts apps/gateway/src/runtime/dispatcher.ts apps/gateway/src/runtime/connector/index.ts apps/gateway/src/runtime/welcome/handler.ts apps/gateway/src/runtime/loaders.ts apps/gateway/src/start.ts apps/gateway/src/runtime/moderation/automod.ts apps/gateway/src/runtime/boot-modules.ts --max-warnings 0
```
→ exit 0, no output.

**Prettier (all 14 touched files):**
`npx prettier --check <8 sources + 6 test files>` → `All matched files use Prettier code style!` exit 0.

**Extra cross-check not requested by the author:** full gateway suite `npx vitest run` → `Test Files 31 passed (31)` / `Tests 405 passed (405)`. Confirms the wave broke nothing outside the 9 gated suites — relevant to "no undisclosed behavioral change".

### Gate 2 — SPEC ADHERENCE (region-read + grep verified)

| Defect | Where | Verified content |
|---|---|---|
| m-28 | builder-runs.ts:589–598 | `const accountId = await loadBotAccount(pool, job.botId);` → `if (accountId === null) throw new BuilderStepError('bot_gone');` sits BEFORE the first `chat()`. Test (builder-runs.test.ts:452, :479) asserts `chatCalls === 0`, `failedDetail === {error:'bot_gone', step:'generate'}`, no `INSERT INTO ai_spend`. |
| m-29 | connector/index.ts:231–235 | `void pollOnce().catch(() => undefined).finally(() => { inFlight = false; })` — rejection cannot escape; `inFlight` always released. |
| m-30 | connector/index.ts:242–249 | Guarded `typeof maybeUnref.unref === 'function'` inside try/catch. Sibling idiom claim independently verified live: giveaway.ts:382 and tempban.ts:226 use the identical shape. |
| m-31 | dispatcher.ts:91–95 | `await command.execute(interaction); lastUsed.set(key, at);` — stamp lands only after a successful execute. Eviction is lazy (`evictStaleEntries`, MAX_COOLDOWN_TRACK_MS 1h), no timer handle created → no leak. |
| m-32 | welcome/handler.ts:164, 203–227 | `const joinTimesByGuild = new Map<string, number[]>()`; ring looked up/created by `member.guild.id`; ring deleted when drained → bounded by live guilds, no timers. |
| m-33 | loaders.ts:54–67 | `scoped = rows.find(r => r.guildId === guildId)` → return; else `global = rows.find(r => r.guildId === null)` → `global ?? rows[0] ?? null`. Exactly scoped>global>first. `guildId` plumbing at loaders.ts:112 (`opts.guildId ?? null`). |
| m-34 | start.ts:432 | `.where(and(eq(bots.id, botId), eq(bots.status, 'live'), isNull(bots.deletedAt)))` — mirrors `BOOT_LIVE_BOTS_SQL` (start.ts:310–314: `status = 'live' AND deleted_at IS NULL AND prod_spec_id IS NOT NULL`). |
| m-35 | automod.ts:56–71 | Module-level `BAD_WORDS_RE_CACHE = new Map<string, RegExp>()`, `BAD_WORDS_RE_CACHE_MAX = 16`, key = normalized `words.join('\0')`, FIFO eviction when at cap. Cache is bounded. |
| m-36 | boot-modules.ts (whole file) + xp.ts:277 | ASSESS-ONLY confirmed: `boot-modules.ts` has zero store/XP-persistence wiring (grep for `store|Postgres` returns only the `buildXpModule` import/call). `xp.ts:277` still `const store = opts.store ?? new InMemoryXpStore();` — InMemory default intact, no rewire. |

**m-33 BOOT_CONFIG_SQL note (task asked to confirm):** `boot-modules.ts:21–23` is still `SELECT … FROM bot_runtime_config WHERE bot_id = $1` with **no ORDER BY** — unchanged by this wave. Resolution is genuinely read-side only (loaders.ts), and since scoped/global selection is by predicate rather than by row order, the missing ORDER BY does not affect m-33 correctness. Confirmed intact.

Each of m-28…m-35 also has a name-matched test in the expected file (m-28→builder-runs.test.ts, m-29/m-30→connector.test.ts, m-31→dispatcher.test.ts, m-32→welcome/handler.test.ts, m-33→registry.test.ts, m-34→start.test.ts, m-35→moderation.test.ts).

### Gate 3 — GUARD HONESTY (own transient mutation, no git restore)

Chose **m-31** deliberately: the author's report disclosed that only m-34 had been mutation-proven, so spending the reviewer's mutation on an *unproven* guard adds new information.

- File: `apps/gateway/src/runtime/dispatcher.ts`
- Backup: `/tmp/rev-gw/dispatcher.ts.bak` (OUTSIDE the repo)
- SHA256 before: `aaa61ed818045766d72d0f0faff7be9df1e63dde9d547d69044b8102a35c375b`
- SHA256 of backup: `aaa61ed818045766d72d0f0faff7be9df1e63dde9d547d69044b8102a35c375b` (match)
- Mutation applied: moved `lastUsed.set(key, at);` from after `await command.execute(...)` to before the `try` — i.e. reverted m-31 to the pre-fix stamp-before-execute behavior.
- SHA256 mutated: `b6175137f5a1e9d798ab29a231adc3ca7a0e123416d6eb12d9860f7e5554077f`
- Focused suite with guard broken: `npx vitest run src/runtime/dispatcher.test.ts` → `Test Files 1 failed (1)` / `Tests 1 failed | 7 passed (8)`; failing test `createDispatcher > m-31: a throwing command does not consume the cooldown window`, `AssertionError: expected 1 to be 2`. **The guard is load-bearing — 1 failure observed, exactly as required.**
- Restored via plain file copy: `cp /tmp/rev-gw/dispatcher.ts.bak apps/gateway/src/runtime/dispatcher.ts`
- SHA256 after restore: `aaa61ed818045766d72d0f0faff7be9df1e63dde9d547d69044b8102a35c375b` — **exact match** to before.
- Re-run to green: `npx vitest run src/runtime/dispatcher.test.ts` → `Tests 8 passed (8)`.
- No git command of any kind was used for the backup or restore (forbidden commands untouched). Temp backup dir removed afterwards.

**Corroboration of the author's m-34 proof:** the author's own backup artifact `/tmp/start.ts.guardbak` (24,657 bytes, mtime 2026-09-23 08:12) is still on disk; its SHA256 `a9ba12df5cfbbd010d0be310a35c80b357c3018d00beea6ed9749d770a3dac35` is identical to live `apps/gateway/src/start.ts`. The author's restore is therefore byte-verified, independently of their prose.

### Gate 4 — SCOPE / SECURITY

- **Manifest / lockfile / .env:** `git status --short` on touched paths shows `M package-lock.json` and `M .env.example`, but **neither is from this wave**. Evidence: `package-lock.json` diff is 18 insertions adding the unrelated `apps/testbot` workspace (no gateway dependency change); mtimes are `package-lock.json` 2026-09-20 11:09, `.env.example` 2026-09-21 19:36, `apps/gateway/package.json` 2026-09-15 22:45 — all predate the wave window (2026-09-23 08:03–08:16). `apps/gateway/package.json` is unmodified.
- **No installs run.**
- **Secrets:** pattern-count grep (`discord_token|client_secret|api[_-]?key|password[:=]|BEGIN … PRIVATE KEY|sk-…`) across all 8 touched sources → **0 hits in every file**. No secret values were read or recorded anywhere in this review.
- **Scope closure:** every file under `apps/gateway/src` with mtime in the wave window (08:03–08:16) is exactly the 14 files the author declared. No undisclosed file was touched by the wave. (`dispatcher.ts` now shows 08:21 solely because of this reviewer's verified restore.)
- **User-facing copy:** `runtime/welcome/greet.ts` (the `DEFAULT_WELCOME_TEMPLATE` copy anchor) mtime 2026-09-20 — untouched; `runtime/welcome/index.ts` untouched. The dispatcher denial string (`Slow down — try again in ${remaining}s.`) and the error-reply string are unchanged. The wave introduced no new user-facing strings that would require i18n.
- **No production contact** (no SSH, no box, no GHCR, no live keys).

### Gate 5 — ARTIFACTS EXIST

- Author report `Agent Reports/2026-09-23-0713_gateway-smalls-m28m35_FIX_gateway-smalls.md` exists on disk and was read in full.
- Every file the author claims MODIFIED exists, and each m-28…m-35 hunk was confirmed present by region read at the line ranges recorded in Gate 2 — claims match disk, not just prose.
- Author's guard backup artifact exists and hashes to live `start.ts` (Gate 3).
- All 8 defects have a name-matched test in the file the author claims.

---

## Findings (disclosed, non-blocking — none is a gate failure)

**F-1 — m-30's test does not exercise the guard it names.** `connector.test.ts:391` ("m-29/m-30: a throwing poll tick never escapes, and stop() still halts it") calls `start?.()` with the real global `setInterval`; no fake timers are installed (`grep useFakeTimers|vi.stubGlobal` → no hits in that file) and no handle lacking `unref` is ever supplied. The assertions are `typeof handle?.stop === 'function'` and `expect(() => handle?.stop()).not.toThrow()` — i.e. *the handle contract holds*, not *the guard fires*. The `typeof unref === 'function'` false-branch is therefore never executed by this suite. Severity: low — the guarded shape byte-matches the live, pre-existing sibling idiom at `giveaway.ts:382` and `tempban.ts:226`, so the code is correct-by-construction; only its proof is weaker than the test name implies. Disclosed by the author under Known Limitations ("Guard proof done for m-34 only"). Non-blocking.

**F-2 — m-29's proof is indirect, as its own comment admits.** The absence of an escaping rejection is argued in a comment ("without the m-29 catch this test file would observe an unhandled rejection and fail") rather than asserted. No `dangerouslyIgnoreUnhandledErrors` (or equivalent) is configured — verified in `apps/gateway/vitest.config.mjs` — so a rejection would surface. The test is still a real signal, just not a deterministic one. Non-blocking.

**F-3 — m-33's `render` envelope path is not guild-scoped.** `resolveModuleConfig` correctly picks the params row, but `render`'s async per-kind envelope read still awaits the promise and then picks the row without guild awareness. This is outside the declared scope ("read-side resolution only") and the author raised the follow-up. Non-blocking.

**F-4 — no live-path exercise.** For the record of what "works" means here: these are library-internal gateway fixes with no runnable or browser-visible surface, so verification is suites + typecheck + lint + format + region read. No gateway process was booted against a real Discord client (and doing so would require production credentials, which this review is forbidden to touch). This matches the author's own framing.

---

**Verdict rationale:** all five gates pass. Suite 161/161 green twice with no flake, typecheck/lint/prettier all clean on the real detected toolchain, all nine defects verified present at the claimed sites, the one independently chosen guard (m-31) is mutation-proven load-bearing, no manifest/secret/scope/production violation, and every claimed artifact exists with the claimed content. The three findings are coverage-strength observations, all disclosed by the author, none an undisclosed out-of-scope behavioral change. Verdict: **PASS**.
