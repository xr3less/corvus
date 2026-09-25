# Task Report: F8-chat-turkish

## Status
FAILED — escalated, no change shipped. The task as specified is unsatisfiable inside its own
constraints: "translate :88/:105-109/:169-213" + "tests green" + "MODIFY `route.ts` ONLY" cannot all
hold. The strings the task names are pinned byte-for-byte outside my write scope and are byte-level
locked across four producers by a SPEC I was not authorized to rewrite. A sibling agent on this same
wave (F1) reached the identical conclusion independently and escalated it the same way.

## Files Touched
- CREATED: `Agent Reports/2026-09-24-0201_F8_MODIFY_chat-turkish.md` (this report)
- MODIFIED: none. `apps/web/app/api/chat/route.ts` is byte-identical to how I found it.
  - To discharge the acceptance criteria with evidence rather than an assertion, I temporarily
    applied the Turkish copy, ran the suites, then restored the file from a copy held OUTSIDE the
    repo (`/tmp/f8/route.orig.ts`). No `git` command was used to restore anything.
  - `md5sum` after restore: `8831b9dd789666862692561a2a0720f4` — equal to the pre-edit hash and to the
    backup. `git diff --stat` reads the same pre-existing 110/11 as before I started (that dirty
    state predates this task; it is the KI-033 wave's own uncommitted work).

## Dependencies Added
None. No manifest touched, no install run.

## Assumptions Made
- **The acceptance anchor line numbers are load-bearing and English copy is not automatically a
  target.** `:88` and `:105-109` are not ordinary copy: `:88` carries an explicit in-file comment
  "Locked wording (KI-033 SPEC, byte-level): the SAME sentence the dashboard banner and the landing
  FAQ carry." I treated a stated byte-level SPEC lock as authority that outranks a translation
  instruction, and escalated instead of quietly overwriting it.
- I read the task's `:169-213` range as the eleven validation strings in `validateHistory` /
  `validateChatBody`, and did not treat the machine `error` codes themselves as the translation
  target (a code like `'body must be an object'` is both a human sentence and the API's machine
  vocabulary — see Open Questions).

## Open Questions for Orchestrator
1. **BLOCKER — tests pin the strings, and the test file is not in my scope.** `route.test.ts` pins
   the exact English text:
   - `route.test.ts:786` — `expect(await res.json()).toEqual({ error: 'trial_expired', message: TRIAL_ENDED_MESSAGE })`
   - `route.test.ts:866` and `:886` — the trial-budget sentence, pinned `toEqual` on the whole body
   - `route.test.ts:223` — `error: 'botId must be a uuid'`
   - `route.test.ts:229` — `error: 'body must be an object'`
   - `route.test.ts:749` — `const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — …'` (a second copy
     of the literal, so it cannot be satisfied by importing the route's constant either)
   Acceptance (1) and (3) are therefore mutually exclusive within my declared scope. Measured, not
   reasoned: with the Turkish copy applied, the isolated suite went 35/35 green → **34/35**
   (line 786 failed first), and with all named anchors applied the chat suite showed **4 failures**
   (`:223`, `:229`, `:786`, `:866`/`:886`). Restored to 35/35.

2. **The KI-033 sentences are a cross-route wave, not a one-file edit.** `route.ts:88` is
   byte-level locked with:
   - producers: `app/api/builder/verdict/route.ts:89` and `:97`/`:114`,
     `app/api/builder/start/route.ts:42`, `lib/bots.ts:56`
   - pins: 16 occurrences of the expired sentence and 10 of the budget sentence across
     `apps/web` (test files included; `lib/bots.ts:56` is the dashboard banner's single source)
   `lib/bots.ts` states it in the source: "Both strings are byte-level law from the SPEC; they appear
   in API bodies and on screen, so they live here once rather than being retyped (and drifting) per
   surface." And `builder/verdict/route.ts:121-126` states the same about this exact pair:
   "Deliberately NOT re-worded here: the two KI-033 403 sentences above. They are byte-level locked
   with the chat and builder/start routes (one exhausted account reads one sentence wherever the
   refusal reaches it), so translating them is a cross-route copy wave, not a one-file edit."
   Translating chat's copy alone produces precisely the failure those comments exist to prevent: the
   client prefers `message` over `error` (`lib/chat/thread.ts:135-149`), so one exhausted account
   would read Turkish in the chat composer and English on the dashboard banner — one situation, two
   languages, and a second originating source of user-facing text. **A canonical Turkish wording for
   these two sentences does not exist anywhere in the tree today** (verified: zero matches for
   Turkish trial/credit phrasings in any producer).

3. **The two pinned validation strings are shared API vocabulary, not chat-local copy.**
   `'body must be an object'` also originates in `app/api/simulate/route.ts:71`,
   `app/api/spec/publish/route.ts:387`, `app/api/spec/rollback/route.ts:129`,
   `lib/editor/drafts.ts:58` (with pins in `publish.test.ts:312`, `rollback.test.ts:443`).
   `'botId must be a uuid'` is pinned only in the chat suite. Note the asymmetry: of the eleven
   strings in the `:169-213` range, only these two are text-pinned at all — the other nine are
   asserted by status only (422), so they *could* be translated with no test change. A partial
   translation is possible but would leave the chat API speaking two languages.

4. **Which is the cheaper path? (recommendation, orchestrator's call)** Either
   (a) widen the scope of this task by one file to include `route.test.ts`, and treat the chat route
   as a deliberate, documented exception to the byte lock — accepting the two-language screen; or
   (b) split the real unit: one task that locks Turkish wording for the two KI-033 sentences and
   updates all four producers plus `lib/bots.ts` and every pin together, then translate the chat
   validation strings on top. (b) is what the code's own comments and the F1 sibling report call for.
   I recommend (b); (a) ships a documented inconsistency.

## Public Interface Exposed
None — unchanged. No export, signature, status code, `error` code, SQL, or ledger write was altered.
The KI-033 gate order (`:355` clock before body, `:377` allowance after the provider check), the
spend-reservation path (`:262-341`, `:419`, `:455-472`), and every `errorJson` status are untouched,
as required.

## Verification
- **Instrument checked before trust.** `npx vitest run app/api/chat/route.test.ts` → **35/35 passed**
  on the tree as found, and again after restore.
- `npx tsc --noEmit` → exit 0. `npx eslint app/api/chat/route.ts` → exit 0.
- The negative evidence above is a measured result: Turkish applied → 34/35 (then 4 failures with all
  anchors); restored → 35/35. The failure output named the pin line (`route.test.ts:786`) and printed
  expected-vs-received, so the cause is the pin, not an incidental error.
- **Restoration verified by hash**, not by description: `md5sum` identical before and after
  (`8831b9dd789666862692561a2a0720f4`), backup held outside the repo.
- **Harness note — the full-suite instrument is currently unreliable.** `npx vitest run` on the
  restored tree is **not green: 11 failed / 950 passed (64 files)**, in `app/dashboard/bots/page.test.tsx`,
  `app/dashboard/layout.test.tsx`, `components/ui/dashboard-rail.test.tsx`, `app/page.test.tsx`,
  `app/pryzm/page.test.tsx`. These are peer surfaces being edited concurrently in this wave — they
  failed identically with and without my change, so they are not mine. An untracked
  `apps/web/scratch-probe.test.ts` also appeared mid-run (not created by me). Acceptance (3) "tests
  green" therefore cannot currently be proven by the full suite for anyone; only the isolated chat
  suite is a trustworthy instrument right now.

## Known Limitations
- This task does **not** deliver Turkish chat copy. Nothing shipped.
- I did not touch `route.test.ts`, `lib/bots.ts`, or the three sibling routes — all outside scope.
- I could not complete the end-to-end flow in the running app for a UI screenshot: the change under
  discussion was refused, and per the F1 sibling report the live chat path currently fails
  downstream (`could not judge reply`) for reasons outside this file. "Done" here is therefore a
  verified refusal with evidence, not a shipped translation.
