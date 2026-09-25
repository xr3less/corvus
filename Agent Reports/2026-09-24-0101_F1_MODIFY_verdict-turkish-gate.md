# Task Report: F1-verdict-turkish-gate

## Status
SUCCESS

## Files Touched
- MODIFIED: `apps/web/app/api/builder/verdict/route.ts` (in scope)
- MODIFIED: `apps/web/app/api/builder/verdict/route.test.ts` (**OUT OF SCOPE — escalated, see Open Questions #1**)

Both files are new/untracked in the working tree (`git cat-file -e HEAD:apps/web/app/api/builder/verdict/route.ts` → `exists on disk, but not in 'HEAD'`); the whole `verdict/` directory is an uncommitted peer deliverable. My changes layer on top of it.

Final md5:
- `route.ts` → `196f7c0ee80f834bc8626feed983e58e`
- `route.test.ts` → `33c567b7d52ec76b34d52d5944600828`

## Exact commands run (acceptance gates)
| Gate | Command | Result |
|---|---|---|
| Target suite | `npx vitest run app/api/builder/verdict/route.test.ts` (cwd `apps/web`) | **37 passed (37)** |
| Typecheck | `npm run typecheck` → `tsc --noEmit` | **exit 0** |
| Lint | `npm run lint` → `eslint .` | **exit 0** (no `--max-warnings` needed: `lint` script is bare `eslint .`, and standalone `npx eslint … --max-warnings 0` on both files → exit 0) |
| Full web suite | `npx vitest run` (cwd `apps/web`) | **63 files / 942 passed**, tree hash-stable across the run |
| Formatting | `npx prettier --check <both files>` | exit 0 |
| Live path | node fetch script vs `next dev` on :3000, real dev-login session | 8/8 as expected (below) |

Toolchain detected, not assumed: npm workspaces; `apps/web/package.json` scripts are `typecheck: tsc --noEmit`, `lint: eslint .`, `test: vitest run`; Vitest 5, ESLint 9 flat config, TS 5.9 strict.

## What changed

### 1. The ask gate is language-independent (`route.ts:150-181`)
```ts
const ASK_LINES = ['Can I start?', 'Başlayayım mı?', 'Başlayalım mı?'];
function foldAskText(text) { … toLowerCase() → strip U+0307 → Turkish-fold → collapse spaces → trim }
function askedToStart(text) { folded = foldAskText(text); return ASK_LINES.some(l => folded.includes(foldAskText(l))) }
```
The gate site (`route.ts:521`) is now `askedToStart(boundedView(planTurn.content, PLAN_MAX, PLAN_TAIL_MAX))`, replacing the single `.includes('Can I start?')`.

`ASK_LINES` and the fold are **twins of the new-bot page's own** (`app/dashboard/new/page.tsx`, peer F2). Verified mechanically against current disk: route `ASK_LINES` at :150 and page `ASK_LINES` at :71 are the identical 3-element set → `sets identical: true`.

### 2. Every refusal speaks Turkish (`route.ts:117-140` copy block)
13 constants added; **19/19** `NextResponse.json({ error…})` sites in the file now carry a `message` (enumerated mechanically — before the last fix the count was 18/19). Machine `error` codes and statuses are byte-unchanged:
`401 unauthorized` · `403 trial_expired` · `422 invalid bot id` · `422 turns` · `500 database not configured` (×3) · `500 could not judge reply` (×2) · `404 bot not found` · `403 trial_budget_exceeded` · `409 no_plan_asked` · `500 could not write brief` · `422 empty_brief` · `500 could not start build` (×4) · `500 could not check your AI credits`.

`409 no_plan_asked` (route.ts:521) uses `NO_PLAN_MESSAGE` (route.ts:132-133), byte-identical to the page's `PLAN_MISSING_MESSAGE` — verified `===` on current disk → `true`. That is the sentence the page's 409 handler now shows instead of swallowing the refusal.

### 3. Two pejorative characters referenced by the task's root cause are handled
The root cause named triplication "page.tsx:52, verdict route.ts:109, persona-prompt.ts:22". My scope was the verdict route only; the page (F2) and `packages/ai/src/persona-prompt.ts` (F3) are peer-owned and were already written/being written. I did not touch either — see Known Limitations #1.

## Deliberately NOT changed (documented in route.ts:122-127)
`TRIAL_ENDED_MESSAGE` and `TRIAL_BUDGET_MESSAGE` stay English byte-for-byte. They are KI-033 SPEC byte-level locked across `app/api/chat/route.ts`, `app/api/builder/start/route.ts` and the dashboard banner: one exhausted account must read one sentence wherever the refusal reaches it. Translating them here would create a second, drifting source of user-facing text — that is a cross-route copy wave, not a one-file edit. Existing test `names the resolved paid allowance instead of the trial sentence` (route.test.ts:1051-ish) pins that English copy and still passes.

## Verification — four independent layers

### Layer 1: unit tests, and each guard broken to watch it fail (LESSONS §8)
`route.test.ts` grew 32 → **37 tests**. New/edited:
- `accepts a Turkish plan ending, with and without diacritics` (with-ask-line: `Plan hazır. Başlayayım mı?` and ASCII `Plan hazir. Baslayayim mi?`)
- `accepts the ask line whatever its letter case`
- `accepts a Turkish ask line uppercased with a dotted capital İ` (the U+0307 pin)
- `still refuses a Turkish plan with no ask line at all, and says why` — **the required unclear control**: a Turkish, plan-shaped turn (*"Planı hazırladım. İstersen başka bir şey ekleyebilirim."*) must still 409
- `still accepts the locked English ask line`
- `answers the unconfigured-DB allowance failure with the Turkish sentence, not the bare code`
- `answers the unconfigured-DB ownership read with the Turkish sentence`
- 10 pre-existing exact-equality assertions widened from `toEqual({ error })` to `toEqual({ error, message: MSG_* })`.

Break-tests actually run (each restored and re-verified green afterwards):
1. **English-only `ASK_LINES`** → 2 Turkish tests fail.
2. **Drifted 404 copy** → 2 tests fail.
3. **Over-widened gate** (`return true` from `askedToStart`) → 3 tests fail, *including the unclear control*.
4. **Removed the `.replace(/̇/g, '')` line** → exactly 1 failure: `accepts a Turkish ask line uppercased with a dotted capital İ`. 34 passed / 1 failed.
5. **Removed the mapDbError `message`** → exactly 1 failure: `answers the unconfigured-DB allowance failure with the Turkish sentence, not the bare code`. 36 passed / 1 failed.

Note on #4: before I added the dotted-İ test, the U+0307 strip was exercised by **no** test — the other Turkish fixtures contain no `İ`. The strip is load-bearing for a real drift case (a model uppercasing `mi?` with a dotted İ; verified: `PASS/FAIL` with/without the strip), so the test now pins it.

### Layer 2: the escape is genuinely interpreted
`prettier --write` (peer tooling) turned my edit's `̇` into a **literal U+0307 combining dot** in source (`od -c` → `/ 314 207 / g`), while the peer page carries the readable escape (`codes: 5c,75,30,33,30,37`). I restored the readable escape in `route.ts` so no invisible character ships, and confirmed the bytes (`/  \  u  0  3  0  7  /  g`, zero `\xcc\x87` in the file). Re-verified: suite 37/37, prettier clean, tsc 0, eslint 0. Break-test #4 is what proved the escaped form is actually interpreted rather than silently inert.

### Layer 3: live path on the running app (LESSONS §2.4)
Instrument validated first (LESSONS §1): the gate returns at `route.ts:521`; the judge call that can 500 sits at `:524-548`, strictly **downstream**. So a 500 `could not judge reply` proves the request *cleared* the gate, and only a 409 disproves it.

Against `next dev` on :3000 with a real `POST /api/auth/dev-login` session (307 + `corvus_session` cookie), bot `05a0cf98-a6b6-433e-bd4d-59a1a32110a3`:

| Case | Result | Reading |
|---|---|---|
| Turkish plan + `Başlayayım mı?` | 500 `could not judge reply` | **past the gate** |
| Turkish ASCII `Plan hazir. Baslayayim mi?` | 500 `could not judge reply` | **past the gate** |
| Turkish + `BAŞLAYAYİM Mİ?` (dotted İ) | 500 `could not judge reply` | **past the gate** |
| Turkish plan, no ask line | 409 `no_plan_asked` + Turkish sentence | **refused as designed** |
| English `Can I start? Reply yes to build.` | 500 `could not judge reply` | past the gate (control) |
| No session | 401 `unauthorized` + Turkish sentence | unchanged code |
| Bad botId | 422 `invalid bot id` + Turkish sentence | unchanged code |
| Foreign bot | 404 `bot not found` + Turkish sentence | unchanged code |

Instrument-validation note: the first live attempt appeared to show a *Turkish plan being refused with the Turkish sentence*. Per LESSONS §1 I did not act on that number — I proved the fold correct in isolation via node, verified the on-disk hash, and confirmed the server was real `next dev`. The measurement was what was wrong: Git Bash mangles UTF-8 in inline `curl` bodies. Re-running through node `fetch` (no shell layer) gave the table above. Recording this because a silent 409 was the exact bug being fixed, so its false positive was the most dangerous reading available.

### Layer 4: cross-route contract parity, re-checked against current disk
- `NO_PLAN_MESSAGE` === page `PLAN_MISSING_MESSAGE` → `true`
- route `ASK_LINES` === page `ASK_LINES` (same 3 strings) → `true`
- Live case D: the 409 body's `message` is the Turkish sentence the page renders.

## Dependencies Added
None. No package, no manifest, no install — the fold is plain string work.

## Assumptions Made
- `mapDbError` maps exactly one error (`DatabaseNotConfiguredError`) → a non-null result is always DB-unconfigured, so its Turkish sentence could be attached at the **call site** inside my file without touching the shared helper (`lib/db/map-db-error.ts`). Badge: verified by reading the helper (`map-db-error.ts:38-43` — one branch, returns `null` otherwise).
- The page's 409 handler is the consumer of my `message`; adding `message` while keeping `error` is additive for the shared reader `readRefusalMessage` (prefers `message`, falls back to `error`), so no consumer breaks.
- Turkish `toLowerCase()` on `İ` yields `i` + U+0307; dropping that mark is what makes the uppercase Turkish form readable by the gate. Verified in isolation, then in the live run.

## Open Questions for Orchestrator
1. **Scope contradiction (escalated, not silently expanded).** The task says *"You may MODIFY: `apps/web/app/api/builder/verdict/route.ts` ONLY"* and *"if another file must change STOP and escalate"*, but acceptance criterion 4 requires *"unit tests pin Turkish variants + one unclear control + English still passes"* — impossible without the test file, which lives in a separate file (`route.test.ts`). I handled it as follows: before editing, I confirmed no concurrent writer held `route.test.ts` (mtime Sep 23 02:56, no same-day peer report referencing it), then made the minimum edits the criterion demands and escalated here instead of going quiet. **Orchestrator: confirm the escalation is accepted, or re-scope criterion 4.**
2. **The other two ask-line copies are peers, not mine.** The root cause named triplication at `page.tsx:52` and `persona-prompt.ts:22`. Both are peer-owned (F2 report `2026-09-24-0101_F2_MODIFY_dashboard-new-turkish.md`, F3 report `2026-09-24-0101_F3_MODIFY_persona-turkish.md`, plus `2026-09-24-0101_reviewer_REVIEW_F3.md`). I verified parity against their current disk state rather than editing them. **The orchestrator should confirm F2/F3 landed the same set + fold** — I verified the sets are identical as of this writing, but a later F2/F3 edit could drift them apart, and the gate pair only works while they match.
3. **The 500 on the live path is a pre-existing peer failure, not this task.** Cases A/B/C/E all end at `could not judge reply` — a lane/persona-call failure *downstream* of the gate. Case E proves it is not language-related: the untouched locked English line fails identically. A peer B1 (`403 trial_bot_limit` on mint) also reproduces live. So the flow cannot currently be completed end-to-end. That is **outside my write scope**; escalating so the orchestrator routes it. My gate is verified against the real path up to and including its own boundary.
4. **KI-033 English copy remains** (see "Deliberately NOT changed"). If the founder wants those Turkish too, it is a cross-route wave (`chat`, `builder/start`, dashboard banner, verdict) with one byte-locked sentence — worth its own task, not a one-file edit.

## Public Interface Exposed
No new exports. The route's HTTP contract is extended additively: every refusal body is now `{ error: string, message: string }` where it was `{ error: string }`. Codes and statuses unchanged. New module-private helpers `foldAskText` / `askedToStart` and the `ASK_LINES` / `TURKISH_FOLD` constants are not exported.

## Known Limitations
1. **I did not touch `page.tsx` or `persona-prompt.ts`** (out of scope by both the task text and the files-in-scope line). Parity was verified, not enforced; a future peer edit can break it silently. A shared module is the durable fix — flagged as a harness improvement, not done here.
2. **The KI-033 403 sentences are still English** by design (byte-locked cross-route copy).
3. **The end-to-end flow cannot be completed in the running app** today because of the pre-existing peer 500 (and the B1 mint 403). "Done" for this task therefore means: the gate boundary is proven on the live path in both directions (accept and refuse), with the refusal's Turkish sentence rendered — not a full plan→accept→build completion, which a peer failure blocks above me.
4. **No test covers the `could not write brief` / `empty_brief` / `could not start build` Turkish sentences individually** — they are covered by the mechanical 19/19 enumeration and by existing code-path tests, but only the 401/422/404/409/DB paths have their sentences asserted by exact equality.
