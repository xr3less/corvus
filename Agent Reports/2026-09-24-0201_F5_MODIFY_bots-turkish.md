# Task Report: F5-bots-turkish

## Status
SUCCESS (with one cross-file drift reported, not fixed — out of scope)

## Files Touched
- MODIFIED: `apps/web/lib/bots.ts` (+79 / −23)

**Only that one file was written by me.** `git status` shows many other modified files under `apps/web/` (dashboard pages, `lib/http/refusal.ts`, `lib/chat/thread.ts`, `lib/demo/brain.ts`, test files) — those belong to the concurrently-running Turkish wave (F1/F2/F3/F4/F8/F15). I did not touch them; several of my measurements below are explicitly about their in-flight state.

## Dependencies Added
- None.

## Assumptions Made
1. **`CREDITS_PER_CHANGE` copy vs. value.** The acceptance says "CREDITS_PER_CHANGE copy simplified honest Turkish". I read that as the *copy around* the constant (its doc comment and the mock activity strings that print it), not the number. The value stays `1.1` — re-confirmed against the pricing source of truth: `packages/ai/src/cost.ts:10` `USD_PER_CREDIT = 0.005` is untouched, and the detail page's composer note prints the same `1.1` from its own local constant.
2. **Trial facts, stated honestly, verified from source not memory.** `3 gün` = migration `apps/gateway/drizzle/0010_accounts_trial_ends.sql:20` (`now() + interval '3 days'`); `1 bot` = the live-bot cap `mintGate()` refuses on (same file); `100` = `TRIAL_GRANT_CREDITS` in `apps/web/lib/auth/session.ts:102`. No number in the new copy is a remembered one.
3. **`TRIAL_BOT_LIMIT_MESSAGE` is defined as `TRIAL_DEAL`, not retyped.** The English pair was byte-identical, so this preserves behaviour exactly while making drift impossible. I did **not** add a "here is the fix" clause, which the acceptance's word "honest" invites: there is no delete-bot route in the app (verified: the only `DELETE` handler under `apps/web/app/api` is in `pick/vote/route.ts`) and no checkout exists, so a fix-clause would be a promise the product cannot keep. Naming the deal the person already has and claiming nothing more is the honest version.
4. **Mock/example exports translated even where unrendered.** `STATUS_LABEL`, `activityFor`, `PREFLIGHT_ROWS` and `MOCK_SPECS` are compat-only or unrendered today (verified consumer counts below). I translated their user-facing text for file-language coherence — a Turkish file exporting an English pill/label is residue the next consumer inherits — while leaving identifiers (`kind`, `channel`, bot names) in English. `MOCK_SPECS`' `title`/`detail` are provably dead strings: `explain()` reads `title` only as a fallback when `kind` is empty/unknown (`packages/spec/src/explain.ts:183`), and all six mock kinds (`welcome`, `xp`, `warn`, `greeting`, `reaction-role`, `auto-mod`) are cases explain() knows.
5. **Bot names left English** (`Study Hall`, `Draft Arena`, `Night Market mods`). They are pinned by test suites outside my write scope, and `lib/demo/brain.ts:24` records the established policy for a comparable case (gallery catalog rows "stay English… not translatable copy"). Changing them would require editing files I may not touch.
6. **`formatCount`'s `'en-US'` locale left unchanged** — see Open Question 3. It is a real decision, not a slip, and it sits outside this task's stated copy scope.

## Open Questions for Orchestrator
1. **CROSS-FILE DRIFT — the headline finding. The same trial event now speaks two languages depending on which route refuses.** My constant is Turkish, but the identical English expired sentence is still hard-coded in three route files that do **not** import `lib/bots.ts`:
   - `apps/web/app/api/builder/start/route.ts:42`
   - `apps/web/app/api/chat/route.ts:88`
   - `apps/web/app/api/builder/verdict/route.ts:89`

   So a user who exhausts the trial via **mint** (POST `/api/bots`, `/api/interview/start`, `/api/templates/[slug]/fork`) reads Turkish, while the same expired account reads English from **build** and **chat**. Each of those routes carries a comment declaring its bytes "byte-level law from the SPEC" and shared with "the chat route and the dashboard banner" — the banner *did* move to Turkish, so that invariant is already broken as of my change. **This needs one follow-up task** that points the three routes at the constant (and updates their three test files). I deliberately did not do it: my write scope is `apps/web/lib/bots.ts` ONLY, and three route files plus three test files would be a 7-file change.

2. **`TRIAL_BUDGET_MESSAGE` is a fourth English string of the same class**, in `apps/web/app/api/chat/route.ts:107` and mirrored at `apps/web/app/api/builder/verdict/route.ts:97` (`'Your 3-day trial has used its 100 AI credits for this month.'`). Not visible from `lib/bots.ts` and not in my scope; flagged so the follow-up can sweep the class rather than the instance.

3. **`formatCount` still groups digits with `'en-US'`** (`1,240 üye` where Turkish writes `1.240 üye`). The sibling Turkish wave assigned the *words* of the count line to the bots page and explicitly noted the grouping "comes from `formatCount` in `lib/bots.ts`, which is outside this file" — i.e. it is mine to decide. I left it because (a) the acceptance scopes me to the credit/trial copy, and (b) `apps/web/app/dashboard/bots/page.test.tsx:225` pins the rendered `'2,013 üye · 2 sunucu'` and is owned by that in-flight agent — changing the locale would red their test mid-flight and hand them a broken tree. **Decision needed:** if the owner-facing rule is "Turkish throughout", this should become `'tr-TR'` together with that test's pin, as its own atomic task.

4. **`CREDITS_USED` / `CREDITS_TOTAL` (`82` / `100`) left as-is.** They are dead compat exports (KI-030) that no page renders; `dashboard-rail.test.tsx:160` asserts they must never render as a real balance. Translating dead numbers is not among the acceptance criteria, and touching them would risk that guard for no user-visible gain.

## Public Interface Exposed
All exports keep their names, types and arities — **no consumer change is required anywhere**. Only string *values* moved to Turkish:

- `TRIAL_DEAL: string` — now `'Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi.'`
- `TRIAL_EXPIRED_MESSAGE: string` — now `'3 günlük deneme süren bitti — botların duraklatıldı. Hiçbir şey silinmedi.'`
- `TRIAL_BOT_LIMIT_MESSAGE: string` — now `= TRIAL_DEAL` (was a byte-identical English retype)
- `STATUS_LABEL: Record<BotStatus, string>` — now `Canlı` / `Deneme` / `Çevrimdışı`
- `activityFor(bot: MockBot): ActivityItem[]` — signature unchanged; texts/times now Turkish, `suffix` is ` · 1.1 kredi` or ` · kredi harcamadı`
- `PREFLIGHT_ROWS` — texts now Turkish
- `CREDITS_PER_CHANGE` — **value unchanged (`1.1`)**
- `MOCK_SPECS` (module-private) — `title`/`detail` now Turkish; `kind`/`channel` untouched

## Known Limitations
- **Does not translate the three route-local English copies** (Open Question 1) — so the trial story is Turkish on the mint path and English on the build/chat path until that follow-up lands.
- **Does not touch pricing**: `USD_PER_CREDIT`, `CREDITS_PER_CHANGE`'s value, and every `cost.ts` constant are byte-identical to before (verified).
- **Does not add a guard test.** `lib/bots.ts` has no test file of its own, and I may not create one under this scope (`FILES IN SCOPE: MODIFY apps/web/lib/bots.ts ONLY`). The byte-identity claim against `refusal.ts` is therefore asserted in a comment and was verified by external probe, not by an in-repo assertion — see Verification §3. A regression test that pins the two sentences would be the right harness fix.
- **Bot names and `formatCount`'s locale remain English**, for the reasons in Assumptions 5–6.

## Verification

### 1. Gates — all clean, on the real toolchain (`apps/web/package.json`)
| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0**, zero errors |
| Lint | `npx eslint lib/bots.ts` | **exit 0**, zero warnings |
| Format | `npx prettier --check lib/bots.ts` | **clean** |

### 2. Tests — focused: green. Full suite: see the attribution table (this matters)
Ran the nine suites that consume these constants or their surfaces:
`npx vitest run app/dashboard/page.test.tsx app/dashboard/bots/page.test.tsx "app/dashboard/bots/[id]/page.test.tsx" app/api/bots/route.test.ts app/api/interview/interview.test.ts app/api/templates/templates.test.ts app/interview/page.test.tsx lib/chat/thread.test.ts lib/demo/brain.test.ts`
→ **9 files passed, 241/241 tests passed.**

Full web suite → **61 files passed / 3 failed, 982 passed / 3 failed (985)**.

**Attribution — the 3 residual failures are NOT mine, and I proved it rather than assuming it.** The acceptance says "tests updated green", so a bare "3 red, not mine" would be worthless; each residual is traced to a file that provably cannot see my change:

| Residual failure | Owned by | Why it cannot be my file |
|---|---|---|
| `app/gallery/page.test.tsx` — "falls back to the raw error code…" | F15's in-flight `lib/http/refusal.ts` | `grep -c "lib/bots" apps/web/app/gallery/page.tsx` → **0**. The page imports `forkErrorMessage`; that table now resolves `trial_bot_limit` to Turkish, so the older test's expectation of the bare code is stale. |
| `app/dashboard/new/page.test.tsx` — "submitting streams the reply…" | F2/F8's in-flight chat-thread translation | `grep -c "lib/bots"` → **0** in both page and test. Source at `components/ui/chat-thread.tsx:59` now renders `Bu yanıt … kredi harcadı`; the test still expects `/This reply used 1.1 credits/`. |
| `app/privacy/page.test.tsx` — "points Privacy Policy and Terms…" | The landing translation wave | `grep -c "lib/bots"` → **0**. `app/page.tsx:942` now reads `Gizlilik Politikası`; the test still looks for the English accessible name. |

Two more points that make this attribution trustworthy rather than convenient:
- **The baseline was measured before I edited anything.** At HEAD-of-my-session the same full suite gave **6 files / 21 tests failing**. That count *fell* to 3/3 because the sibling agents landed their own fixes while I worked — my change did not add a single red.
- **All 17 failures my edit *did* initially cause are now green.** The first measurement after my edit showed 17 reds, all of them literal-English pins inside sibling-owned test files (`'Free 3-day trial — 1 bot, 100 AI credits.'` etc.). I did **not** edit those files. The sibling agents then changed them to either import the constant from my file or assert my exact Turkish bytes — e.g. `dashboard/bots/[id]/page.test.tsx` now carries the comment *"The trial sentences are byte-locked in `lib/bots.ts` and imported by the page, so the test reads the same source instead of retyping them"*, and `dashboard/bots/page.test.tsx:378` pins `'3 günlük deneme süren bitti — botların duraklatıldı. Hiçbir şey silinmedi.'` — my bytes, character for character.

### 3. The load-bearing invariant was verified mechanically, and the verifier was itself verified
My comment claims the two sentences are byte-identical to F15's Turkish refusal table in `lib/http/refusal.ts`, so a client shows the same words whether it prints the server's `message` or falls back to the table for a bare code. **Claim asserted in a comment → claim checked by probe:**

```
TRIAL_DEAL = "Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi."
TRIAL_EXPIRED = "3 günlük deneme süren bitti — botların duraklatıldı. Hiçbir şey silinmedi."
deal      === refusal['trial_bot_limit'] : IDENTICAL
expired   === refusal['trial_expired']   : IDENTICAL
```

**Negative control (LESSONS §8 — a guard is not a guard until you break the thing it guards):** I mutated `TRIAL_DEAL` to `'…100 kredi.'` in memory, re-ran the same comparison, and it reported `DRIFT DETECTED (checker works)`. Restored byte-exactly; re-ran prettier + eslint + tsc → all clean.

### 4. Scope discipline
`git status --short -- apps/web/lib/bots.ts` → `M apps/web/lib/bots.ts`, and that is the only file I wrote. No manifests, no installs, no git restore/commit/push, no deploy/migrate/secrets. `USD_PER_CREDIT` untouched (`packages/ai/src/cost.ts` not in my diff).

### What I did NOT verify
- **No human completed a flow in the running app** (LESSONS §2.4). I did not boot the dev server or click through the dashboard. The strings are proven to be the bytes the code emits (identity probe above + the green suites that render them), but a founder-observed pass over the trial copy is still owed — it is the same live-evidence debt the wave already tracks.
- **I did not run the gateway or `packages/spec` suites**, since my file is web-only and both were untouched.
