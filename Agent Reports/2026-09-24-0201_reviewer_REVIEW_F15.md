# Task Report: review-F15

## Status

**FAIL** — but read the split carefully: **the code F15 wrote is correct and its own gates are green.** The tree is red, the class is still open 3-of-4, and F15 introduces one new copy defect it did not disclose. Each of those needs an orchestrator decision; none is a defect in the reader's logic.

I did not write this code. Independent review, clean context. No edits, no git restore/commit/push/deploy/migrate, no secrets touched.

---

## 1. Gates — verified independently on the merged tree

Toolchain detected (not assumed): npm workspaces, `@corvus/web`, `vitest 5.0.0` via `apps/web/vitest.config.mjs`, `tsc --noEmit`, repo-root eslint flat config with `--max-warnings 0`, prettier 3.9.6.

| Gate | Command (run from the stated cwd) | Result |
|---|---|---|
| Typecheck | `cd apps/web && npx tsc --noEmit` | **exit 0, zero output** |
| Lint | `cd corvus && npx eslint --max-warnings 0 apps/web/lib/http/refusal.ts` | **exit 0, clean** |
| Format | `npx prettier --check apps/web/lib/http/refusal.ts` | **clean** |
| Prose surfaces | `cd apps/web && npx vitest run app/interview/page.test.tsx "app/gallery/[slug]/page.test.tsx"` | **24/24 pass** — the claim is exact |
| F15's other surface | `+ app/dashboard/bots/[id]/page.test.tsx` | **83/83 pass** |
| Focused disputed | `npx vitest run app/gallery/page.test.tsx` | **20 pass / 1 fail** (`:422`) |
| Full web suite | `npx vitest run` ×7 | **3 failed / 982 passed (985)** in 6 runs; one run showed 4 |

The suite size moved from the report's 982 to **985** — other agents landed tests while F15 worked. The file count also moved (63 → 64).

**A flaky failure exists and is not characterised.** My first full run reported **4 failed / 981 passed**; six subsequent runs all reported 3/982. I could not reproduce the fourth in six attempts, so I cannot name it. It is *not* F15 (F15's module is imported by four files, all of whose suites I ran green except the disputed one), but the orchestrator should know the suite is not deterministic.

**F15's numbers check out.** The report claimed 979/982 with three failures; my 6 stable runs give 3 failures of the same three files plus 3 net-new passing tests.

---

## 2. The disputed test — the report is right, and I confirmed the contradiction at source

- `apps/web/app/gallery/page.test.tsx:377` — `expect(alert.textContent).not.toContain('trial_bot_limit');`
- `apps/web/app/gallery/page.test.tsx:422` — `expect(alert.textContent).toContain('trial_bot_limit');`

Traced to the actual failing diff:

```
AssertionError: expected 'Ücretsiz 3 günlük deneme — 1 bot, 100…' to contain 'trial_bot_limit'
 ❯ app/gallery/page.test.tsx:422:31
```

**Both lines are wave-authored.** `git diff HEAD -- apps/web/app/gallery/page.test.tsx` shows both `+ expect(...not.toContain('trial_bot_limit'))` and `+ it('falls back to the raw error code …')` as added lines; `git show HEAD:…` contains neither string. The test suite is modified this wave (`M`, +114/−8). So the wave forbids and requires the same code in one file — confirmed.

The received value is F15's `trial_bot_limit` entry, which is what the fix is *for*. **F15 was right not to touch the test and right not to weaken the reader.** Recommendation: retire `:405-423` as superseded (it pins the defect being removed). Narrowing F15's fallback to satisfy it would restore the leak the task exists to close.

---

## 3. Behavioural probe — all claims hold

Independent probe (`node --experimental-strip-types`, run from the OS temp dir, file imported by absolute path, outside the repo):

- All 14 codes resolve to Turkish prose, none returns itself.
- `constructor` / `toString` / `__proto__` / `valueOf` / `hasOwnProperty` → the Turkish generic, never an inherited member. The `Map` choice is doing real work; object indexing would have leaked here.
- `message` wins unconditionally: `{error:'trial_expired', message:'LOCKED ENGLISH'}` → `LOCKED ENGLISH`.
- Prose passthrough intact: `{error:'could not fork'}` → `could not fork`.
- Unknown code-shaped → generic. `null` / `{}` / bare string → `null`.
- `allowErrorFallback: false` → `null` for a bare code, the message when present.
- `forkErrorMessage({}, 403)` → `Fork failed (403). Try again.` — byte-locked at `page.test.tsx:438`, intact.

My own first detector flagged `could not check your AI credits` as untranslated — **my instrument was wrong, not the code**: that sentence is Turkish but carries no Turkish-specific diacritic. Caught and corrected; recorded because it is exactly the false-positive a naive "no code ever" check will produce.

---

## 4. Reachability — one finding the report understates

`message` wins unconditionally, and **every producer of the table's headline codes sends `message` too**:

- `trial_expired` — `app/api/builder/start/route.ts:125`, `app/api/chat/route.ts:356`, `app/api/builder/verdict/route.ts:409` all send `{ error, message: TRIAL_ENDED_MESSAGE }`.
- `trial_budget_exceeded` — `chat/route.ts:411` (3-arg `errorJson`) and `verdict/route.ts:505` both send a message.
- `trial_bot_limit` — `templates/[slug]/fork/route.ts:127`, `interview/start/route.ts:99`, `api/bots` all send `{ error: refused.code, message: refused.message }` via `mintRefusal` (`lib/bots.ts:174-181`).

So the 14-entry table is reached **only** on the legacy code-only shape. The reachable code-only producers I found are the `error(mapped.status, mapped.error)` sites (~20, all `database not configured`, which maps correctly) and route fallbacks like `could not fork`, `invalid brief`, `could not start build`. The `trial_*` / `no_plan_asked` entries are currently **defensive, not load-bearing.** That is not wrong — it is the older shape the task named — but the report frames the table as the fix's substance when in production today it mostly guards a shape the routes have already stopped emitting. Worth the orchestrator knowing before scoping siblings.

---

## 5. FAIL reasons

### 5.1 The class is 1-of-4, and the reachable site is not F15's — verified

| Reader | Site | State |
|---|---|---|
| `lib/http/refusal.ts:96` | F15 | fixed |
| `lib/verdict/bounds.ts:70` | `return record.error;` | **still leaks** |
| `lib/chat/thread.ts:144` | `return payload.error;` | **still leaks** |
| `components/ui/builder-progress.tsx:53` | `readApiError` returns raw `error` | **still leaks** |

`bounds.ts:66` is a byte-identical copy of the pre-F15 reader and is the one **`app/dashboard/new/page.tsx:34` actually imports** (also at `:323`, `:382`), so F15 cannot reach the new-bot page at all. `bounds.ts` is **untracked at HEAD** (`git cat-file -e HEAD:…` fails) — it is new this wave, so the wave shipped a fresh copy of the defective reader beside the fixed one. `thread.ts` is also `M` this wave. This is `LESSONS.md` §1.2 (enumerate every site sharing the class) and §1.5 territory. The report disclosed it accurately as Open Question 3 — the *builder* is not at fault; the *wave* is incomplete.

### 5.2 New, undisclosed: F15 puts Turkish copy on English-only pages

Not in the report. `grep -c "[çğıöşüÇĞİÖŞÜ]"`:

| Page | Turkish letters | F15 feeds it? |
|---|---|---|
| `app/gallery/page.tsx` | **0** | yes (`forkErrorMessage`) |
| `app/gallery/[slug]/page.tsx` | **0** | yes |
| `app/interview/page.tsx` | **0** | yes |
| `app/dashboard/bots/[id]/page.tsx` | 101 | yes |

Those three pages are English throughout, and their locked suites pin English bytes — `'Free 3-day trial — 1 bot, 100 AI credits.'`, `'Fork failed (403). Try again.'`. Before F15 a code-only body there printed a machine token; now `unauthorized` / `database not configured` / any mapped code prints a **Turkish sentence on an English page**. F15 trades one wrong output for another wrong output on those surfaces. The report notes the inverse limitation (English prose codes still read English) but not this one. This is a genuine, user-visible copy defect introduced by the change, and it needs a language decision for those pages before the table can be called correct there.

### 5.3 The criterion was written from a code list, not the producers — corroborated

`invalid_turns` appears in exactly two places repo-wide: F15's own comment and its own table. **Zero producers**, and zero test hits. The real turn code is the validator sentence itself (`app/api/builder/verdict/route.ts:301,308` — `'turns must be an array'`, `'turns must be objects'`), which is prose and passes through untouched, so the entry is dead. The report flagged this honestly and asked for it to be checked in sibling F-tasks — **that escalation is correct and should be actioned**, because if the F-task criteria were all written from an expected-code list, siblings may have dead criteria too.

---

## 6. Scope, artifacts, hygiene

- **Scope claim holds by mtime.** Files written in the 02:01–02:21 window are `layout.tsx` (F14), `chat-thread.tsx` (F7), `refusal.ts` (02:05, F15), `proxy.ts` (F9), `dashboard/page.tsx` (F11), `bots/[id]/page.tsx`, `lib/bots.ts` (02:21, F5) — other agents' files. F15's only authored artifact is `refusal.ts`.
- **Temp control removed, verified:** `ls apps/web/vitest*.mjs` → only `vitest.config.mjs` and `vitest.setup.mjs` (repo's own two, dated Sep 9/12).
- **Report exists at the claimed path:** `Agent Reports/2026-09-24-0201_F15_MODIFY_refusal-turkish.md`, 11,890 bytes, mtime 02:19.
- **The bots.ts drift seam is real, and the byte-equality claim is TRUE** (I checked rather than trusted it): `TRIAL_DEAL` ≡ table `trial_bot_limit`, `TRIAL_EXPIRED_MESSAGE` ≡ table `trial_expired`, both byte-identical. **No test pins them equal** — `grep` finds no test referencing `TR_REFUSALS`. Two files hold the same sentence tied only by a comment. The report called this correctly.
- **Producer-side drift, also real:** the English `'Your 3-day trial ended — your bots are paused. Nothing is deleted.'` is hard-coded in three routes (`start:42`, `chat:88`, `verdict:89`) that do not read the Turkish constant, while the mint path speaks Turkish — the same event in two languages. Disclosed by F5's comment, not F15's.
- Diff-shape note: `refusal.ts` and `bounds.ts` are **untracked at HEAD**, so "only refusal.ts modified" cannot be re-derived from `git diff`. I verified it by mtime instead. A `git add -N` at wave boundaries would make future reviews cheap.

**Honest limitation on "it works":** I did not start the app either — same reason as the builder. The evidence here is unit-, suite- and probe-level. `apps/web/.env.local` exists, so a real-path run is feasible; nobody has completed a refusal flow in the running app, and per `LESSONS.md` §2.4 that remains outstanding. I am naming it rather than claiming it.

---

## Assumptions Made

- Read the F15 report at its stated path plus the files it names; treated the build summary as a claim to test, not evidence.
- Treated `git status`/`git cat-file` (read-only) as in-scope; ran no state-changing git command.
- Probe run from the OS temp dir with an absolute `file://` import so no repo artifact was created.

## Open Questions for Orchestrator

1. **Decision the build summary asked for, now confirmed with source evidence:** retire `gallery/page.test.tsx:405-423`, or narrow F15's fallback. I recommend **retire** — the test pins the defect F15 removes, and narrowing restores the leak.
2. **Extend F15 to the class or accept 1-of-4.** Cheapest correct move: delete `bounds.ts`'s copy and have `dashboard/new/page.tsx` import F15's reader, then the same for `thread.ts:144` and `builder-progress.tsx:53`. Until then "raw codes never leak anywhere" is false.
3. **Decide the language of `/gallery`, `/gallery/[slug]`, `/interview`** (5.2) — they are English today and F15 now writes Turkish into them on the code-only path.
4. **Verify the F-task criteria against producers, not code lists** (5.3) — `invalid_turns` is proof at least one criterion was not derived from the code.
5. **The suite has an unreproduced 4th failure** (Section 1) — someone should catch it before this wave is called green.

## Public Interface Exposed

No exported signature changed — `readRefusalMessage(payload, options?)`, `readErrorMessage(res, fallback)`, `forkErrorMessage(payload, status)` all keep their original parameters and returns; all four call sites compile untouched (typecheck exit 0 confirms). Internal additions (not exported): `TR_REFUSALS` (`refusal.ts:36`), `UNKNOWN_CODE_REFUSAL` (`:65`), `resolveRefusalError` (`:67`).

Wire-behaviour delta, precisely: known code → Turkish sentence; unknown value with whitespace → unchanged; unknown value without whitespace → Turkish generic (was: raw token); `message` present → byte-identical to before, always.

## Known Limitations

- Not verified in the running app; no human has completed a refusal flow.
- Cannot re-derive F15's diff from git (file untracked at HEAD); scope verified by mtime instead.
- The 4th flaky failure is unnamed (6 attempts to reproduce, 1 occurrence).
- I reviewed F15 only; the three sibling readers are flagged, not reviewed.
