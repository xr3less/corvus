# Task Report: F15-refusal-turkish

## Status

PARTIAL — the code is complete and its own gates are green; one pre-existing-contract test now fails **by design**, and that conflict needs an orchestrator decision (see Open Questions 1).

## Files Touched

- MODIFIED: apps/web/lib/http/refusal.ts (untracked-new in this wave; now 118 lines)
- No other file created, modified, or deleted. No manifest, lockfile, env, or migration touched. No git commit/stash/restore/push/checkout was run.

One temporary file was created and removed inside this task: `apps/web/vitest.f15-control.config.mjs` (an attribution control, deleted in the same step — `ls apps/web/vitest*.mjs` now shows only the repo's own two).

## Dependencies Added

None.

## Assumptions Made

- **`invalid_turns` has no producer, and its code is not the string the route emits.** The task named `invalid_turns` as a code to map. Grep across `apps/` and `packages/` finds **no producer** for that literal; the verdict route's real turn code is the *validator sentence itself* (`'turns must be an array'`, `'turns must be objects'`, `'turns must hold at most 12 turns'` — route.ts:301-303), sent as `error` alongside the Turkish `TURNS_MESSAGE`. I mapped `invalid_turns` to that Turkish sentence anyway (harmless, and it satisfies the acceptance criterion verbatim) and let the real sentences pass through unchanged. **This is evidence the criterion was written from a list of expected codes, not derived from the producers** — worth checking in the sibling F-tasks.
- **`budget` is mapped as the two budget codes that actually reach a browser:** `trial_budget_exceeded` (verdict + chat routes) and `budget_exceeded` (the `checkBudget` reason in `packages/ai/src/budget.ts:201`). `budget_exceeded` is never sent as a response `error` by either route today — they both map to `trial_budget_exceeded` — so I did **not** include it, to avoid mapping a code with no producer. The task's "budget etc" is satisfied by `trial_budget_exceeded`.
- **The tier-neutral `trial_budget_exceeded` sentence is a deliberate deviation.** The chat and verdict routes each keep two tier-aware sentences, but the two branches share one code, and the reader is tier-blind. Naming the trial would be false about the one fact a paying account can see — the exact reason the routes split the copy. `Bu ayın AI kredisi doldu` is true for both tiers and breaks the deliberate tier split no further than the single code already does. **This is new copy** (the only new sentence in the table); everything else is a byte already shipped by this wave.
- **Prose values pass through; code-shaped values are translated.** "Never raw code" and "keep the locked bytes" are in direct tension, and the resolution is reachability. A value carrying whitespace is a server sentence several locked suites assert (`could not fork` at HEAD gallery:336, `unknown questionId`, `question out of order`); translating it would mean inventing copy and breaking pre-existing contracts. A value with no whitespace is a machine token, so it gets the table or the generic. See the probe result below for what this deliberately does **not** catch.
- **A `Map`, not object indexing or a prototype-guarded record.** `record.error` values like `constructor` / `toString` would otherwise return an inherited Object member from a lookup object. A `Map` makes that structurally impossible.
- **`message` still wins unconditionally**, so every byte-locked English KI-033 sentence this wave ships is untouched whenever the server writes one. The table is reached only on the older code-only body.

## Open Questions for Orchestrator

1. **A wave-authored test asserts the exact behaviour F15 was written to remove, and it fails because F15 works.** `apps/web/app/gallery/page.test.tsx:409-423` ("falls back to the raw error code when a fork failure carries no message") feeds `{ error: 'trial_bot_limit' }` and asserts `toContain('trial_bot_limit')`. The same file, 45 lines earlier at :377, asserts `not.toContain('trial_bot_limit')` for the same code with a `message` present. Both lines were **added by this wave** (neither exists at HEAD). So the same wave both requires the code never to reach the screen and pins it reaching the screen — in one file. F15's AC2 ("never raw code") and that test cannot both hold. **I did not touch the test (out of scope) and did not weaken the reader to satisfy it.** Decision needed: retire that test as superseded by F15, or narrow F15's fallback. Recommend retiring it — it pins the defect.
2. **Three tests matching the task's "never raw code" claim do pass** and are worth knowing about: `gallery/page.test.tsx:405` and `interview/page.test.tsx:240` both assert `not.toContain('trial_expired')` on the message-bearing path, which F15 leaves intact because `message` wins.
3. **Same defect class left unfixed, deliberately, in two sibling readers** (both outside my single-file scope — flagged, not silently skipped):
   - `apps/web/lib/verdict/bounds.ts:66` `readRefusalMessage` — a **second, byte-identical copy** of the pre-F15 reader, and the one the **new-bot page** (`app/dashboard/new/page.tsx:35`) actually imports. It still leaks codes; F15 cannot reach that page.
   - `apps/web/lib/chat/thread.ts:144` `readHttpError` — `return payload.error` unmodified.
   - `apps/web/components/ui/builder-progress.tsx:54` `readErrorMessage` — a third same-shaped reader.
   If the acceptance target is "raw codes never leak **anywhere**", F15 closes one of four sites. This is the `LESSONS.md` §1.2 "enumerate every site sharing the class" situation.
4. **`lib/bots.ts:57-64` (F5) now carries a comment asserting my table is byte-identical to its constants, written by a concurrent agent while I worked.** I verified that claim rather than assuming it: `TRIAL_EXPIRED_MESSAGE` and `TRIAL_DEAL` are byte-identical to my `trial_expired` / `trial_bot_limit` entries. Two files now hold the same two sentences with only a comment tying them together — no test pins them equal. That is a drift seam.

## Verification

**Toolchain (detected, not assumed):** npm workspace `@corvus/web`; `vitest 5.0.0` with `apps/web/vitest.config.mjs`; `tsc --noEmit`; `eslint` (flat config, repo root); `prettier --check`.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` (apps/web) | **0 errors** |
| Lint | `npx eslint lib/http/refusal.ts` | **clean, exit 0** |
| Format | `npx prettier --check lib/http/refusal.ts` | **clean** |
| Prose surfaces | `npx vitest run app/interview/page.test.tsx "app/gallery/[slug]/page.test.tsx"` | **24/24 pass** |
| Full web suite | `npx vitest run` | **979 passed / 3 failed** of 982 |

**Attribution of the 3 full-suite failures — measured, not assumed.** Two of the three pages do not import my file at all (`grep -rln "lib/http/refusal" app/privacy app/dashboard/new` → empty), so they cannot be mine:
- `app/privacy/page.test.tsx` — missing "Privacy Policy" link; pre-existing, unrelated surface.
- `app/dashboard/new/page.test.tsx` — imports `@/lib/verdict/bounds`, not my module.
- `app/gallery/page.test.tsx` "falls back to the raw error code…" — **the one attributable to F15**, and it is the wave's own contradictory test (Open Question 1).

**Baseline discipline.** The tree was **moving during this task** — other agents edited `chat-thread.tsx`, `bots/[id]/page.tsx`, `lib/bots.ts` and `page.tsx` between my reads, and the pre-existing failure count moved from 24 (my first run) to 3 (my last) as they landed their fixes. So I isolated my change with an out-of-tree A/B control rather than trusting a stale baseline: a temporary vitest config aliasing `@/lib/http/refusal` to a byte-copy of the pre-F15 reader.

**The control instrument was itself validated before I trusted it** (`LESSONS.md` §1). My first attempt aliased the resolved filesystem path and **silently did nothing** — the control reported failures, which looked like a clean result. I caught it because the control's failure detail printed *my Turkish string* (`Received: "Ücretsiz 3 günlük deneme — …"`) where the pre-F15 reader would have printed `trial_bot_limit`. Re-aliasing the specifier `@/lib/http/refusal` made the control pass 21/21 in gallery, proving the alias engaged. Only then was the delta meaningful: **exactly one test differs between control and change — the gallery raw-code test in Open Question 1.** No test is fixed or broken by F15 either side of that one.

**Behavioural probe** (`node --experimental-strip-types`, importing the real file by absolute path, 38 assertions, kept out of the repo):
- All 14 known codes resolve to Turkish prose and never to themselves.
- `constructor` / `toString` → the Turkish generic, never an inherited member.
- `message` wins over `error`; empty/whitespace `message` falls through to the table.
- `null`, a bare string, `{}` → `null`; `allowErrorFallback: false` → `null` for a code, the message when present.
- The locked prose bytes (`could not fork`, `unknown questionId`, `question out of order`) pass through unchanged.
- **3 probe assertions fail, by design:** `could not fork`, `not found`, `slow down` return themselves. These are English server sentences on surfaces that are **English-only** (`app/gallery/page.tsx` and `app/interview/page.tsx` contain zero Turkish letters), and `could not fork` is asserted at HEAD. I report them as a known limitation rather than a pass, because a future reviewer re-running a naive "no code ever" check will hit exactly these three.

**Honest limitation on "it works".** Per `LESSONS.md` §2.4 I did **not** exercise this in the running app: the only surfaces this reader feeds are `/gallery`, `/gallery/[slug]`, `/interview` and the bot-detail build button, and the app was not started in this session. The evidence above is unit-level and probe-level. A human completing one flow — open `/interview`, force a code-only refusal, read a Turkish sentence instead of a token — is still outstanding and should be named in the review.

## Public Interface Exposed

No exported signature changed. `readRefusalMessage`, `readErrorMessage` and `forkErrorMessage` keep their exact parameter and return types, so all four call sites compile untouched (verified: `tsc` clean).

Internal additions (not exported): `TR_REFUSALS: ReadonlyMap<string, string>`, `UNKNOWN_CODE_REFUSAL: string`, `resolveRefusalError(error: string): string`.

Wire behaviour change on the `error`-only path, stated precisely:
- Known code → Turkish sentence.
- Unknown value **with** whitespace → returned unchanged (unchanged from before).
- Unknown value **without** whitespace → the Turkish generic `İstek tamamlanamadı — tekrar dene.` (was: the raw token).
- `message` present → byte-identical to before, always.

## Known Limitations

- **One of four same-class readers.** F15 fixes `apps/web/lib/http/refusal.ts` only; `lib/verdict/bounds.ts:66` (which the new-bot page imports), `lib/chat/thread.ts:144` and `components/ui/builder-progress.tsx:54` still leak codes. See Open Question 3.
- **One wave-authored test fails by design** (Open Question 1); F15's code is not weakened to make it pass.
- **Prose-valued codes on English surfaces** (`could not fork`, `not found`, `slow down`) still read as English. Translating them requires deciding those pages' language first, which is a product decision, not this task's.
- **The Turkish generic is new copy.** It is the only invented sentence; the other 13 entries are bytes already shipped this wave.
- **`trial_budget_exceeded` maps to one tier-neutral sentence** where the routes keep two tier-aware ones (rationale above). If a paying account's exhausted-credits line must name its own allowance, that needs a tier-aware reader — a larger change than this file.
- Not verified in the running app (see Verification).
