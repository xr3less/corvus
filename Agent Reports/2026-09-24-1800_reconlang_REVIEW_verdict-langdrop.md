# Task Report: recon-langdrop-1800

## Status
SUCCESS — defect CONFIRMED at file:line byte precision; fix scoped (2 files touched, 1 optional); no code written.

## Diagnosis — the `language` argument is dropped at both persona-lane call sites; the Turkish guidance branches are unreachable in production and untested everywhere

**The dropping lines (re-derived, citation `:534-537` verified accurate).** `apps/web/app/api/builder/verdict/route.ts:530-541` — the judge call builds a system-only array whose content is a 2-argument `buildVerdictPrompt` (HEAD `d9cf8d7`, all files untracked):

```ts
534	          content: buildVerdictPrompt(
535	            boundedView(planTurn.content, PLAN_MAX, PLAN_TAIL_MAX),
536	            boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX),
537	          ),
```

Two arguments. The callee's third parameter defaults the feature off — `packages/ai/src/persona-prompt.ts:70-74`:

```ts
70	export function buildVerdictPrompt(
71	  planText: string,
72	  userReply: string,
73	  language: OwnerLanguage = 'english',
74	): string {
```

`OwnerLanguage` is defined at `persona-prompt.ts:24` (`'english' | 'turkish'`) and re-exported through the package barrel (`packages/ai/src/index.ts:13`, `export * from './persona-prompt.js'`) — **no caller anywhere in the repo passes it.** The guidance that never flows: `TURKISH_VERDICT_GUIDANCE` at `persona-prompt.ts:60-63` ("a Turkish yes is a yes: evet, tamam, tamamdir, olur, basla, baslayabilirsin, and 'sen karar ver'…") is pushed only at `:82-84` under `if (language === 'turkish')`. Where it SHOULD flow: a derived language passed as the third arg at `route.ts:534-537` → appended by `persona-prompt.ts:82-84` → inside `messages[0].content` of the judge call.

**The brief call drops it too — same defect, one call later.** `route.ts:573`: `[{ role: 'system', content: buildBriefPrompt(threadText) }]` — one argument; `buildBriefPrompt(threadText, language: OwnerLanguage = 'english')` at `persona-prompt.ts:94`; `TURKISH_BRIEF_GUIDANCE` at `:65-68` (Turkish requirement lines; behavior-kind tokens stay English per the builder contract) gated at `:100-102`. A `yes` verdict writes a brief with neither rule.

**The feature is dead end-to-end, provably.** Repo-wide grep (node_modules excluded): the only `buildVerdictPrompt`/`buildBriefPrompt` production callers are `route.ts:534` and `route.ts:573` (plus the route's own header comment). `packages/ai/src/persona-prompt.test.ts` calls both prompts **ten times, always in the 2-arg/1-arg default form** (`:240, 247, 256, 262, 268` / `:276, 282, 287, 292, 297`) and contains **zero tests passing `'turkish'`** — its only Turkish assertions (`:182-190`) target `buildPersonaPrompt`, the chat prompt, not the judge/brief prompts. So `TURKISH_VERDICT_GUIDANCE`/`TURKISH_BRIEF_GUIDANCE` are unreachable in production AND unexercised by any test: shipped dead code on the exact path F3 built them for.

**Symptom (this defect) vs symptom (the verdict-500) — why the 500 fix alone does not close this.** The 500 root cause (0428, adjudicated): system-only message array → provider 4xx (GLM 1214-class contract) → `RouterError` → bare catch `route.ts:544-551` → instant `could not judge reply` 500, **language-independent, no verdict ever produced**. This defect is a *quality* drop on the same call: once the user-turn append lands (or for any provider that tolerates system-only), the call **succeeds** but the judge reads an English-default prompt — `route.ts:534-537` still calls 2-arg, so `:82-84` never fires. Symptom: no error anywhere; Turkish threads get judged without the locked Turkish-acceptance vocabulary (`olur`, `baslayabilirsin`, `sen karar ver` left unruled, hedges unweighted) and the brief without the Turkish-wording rules — silent misjudgments, `unclear`-heavy verdicts, and briefs that can drift off the owner's wording / translate behavior-kind tokens (a builder-contract violation). **The 0428 recipe's user-turn append changes the message SHAPE, not the prompt CONTENT — `buildVerdictPrompt` would still be called 2-arg.** The two fixes are independent: fixing one leaves the other fully latent. They are natural to land in one edit because they touch the same two lines.

**Every caller sharing the class (fix-or-exclude each) — the class is "persona-lane system-prompt builders whose optional language argument every caller omits".**

| Site | Verdict | Reason |
|---|---|---|
| `route.ts:534-537` (judge) | **FIX** | The flagged site; guidance `:60-63` must reach the judge. |
| `route.ts:573` (brief) | **FIX** | Byte-identical defect; guidance `:65-68` must reach the brief writer; otherwise verdict-yes degrades the brief silently. |
| `persona-prompt.test.ts` ×5 verdict + ×5 brief | **EXCLUDE (intentional)** | These pin the byte-identical default path (F3's V6 contract, extended by `:70-74`'s default). They are the constraint, not the bug. |
| `defaultPersonaCaller` `route.ts:269-275` → `chat({lane:'persona'})` | **EXCLUDE (language-neutral)** | Transport only; no prompt text. No `packages/ai` change needed for either this fix or the 500 fix. |
| All other persona-lane callers (chat `route.ts:428-432`, builder worker `builder-runs.ts`) | **EXCLUDE (different prompt)** | They use `buildPersonaPrompt`/`builder-prompt`, not the verdict prompts; grep confirms no `buildVerdictPrompt`/`buildBriefPrompt` hits outside route.ts + tests. |

**F3 Turkish-verdict path and the `:1838`-style citation risk.** The path is: Turkish owner thread → plan turn ends `Başlayayım mı?` (either case, ± diacritics — gate already passes it via `ASK_LINES`/`foldAskText`, `route.ts:150-181`) → verdict POST → `:534-537` judge call → language defaulted to `'english'` → guidance dead. Citation risk (pin-wave §3.1 lesson): re-derived `:534-537` rather than trusting the 0428 flag — it is exact (call expression `:534-537`, arguments `:535-536`, enclosing system-message literal `:530-541`); the brief citation precision is `:573` for the prompt call inside the `:572-574` `personaCaller` statement. The sibling-defect flag in the allowed 0428 report matches disk exactly.

## Scoped recipe (recipe only — no code written)

1. **`route.ts` — derive the language from bytes the route already holds.** No `language` field exists in the POST body (`app/dashboard/new/page.tsx:296` sends `{ botId, turns }` only), no locale cookie is read server-side (`proxy.ts` checks `SESSION_COOKIE` presence only), no language column exists (`drizzle/0001_init.sql:4-15`). The only honest signal is the turn text itself — and the route already owns the fold idiom (`TURKISH_FOLD`/`foldAskText`, `:156-174`), with repo precedent for the detector shape (`lib/demo/brain.ts:60-118`: diacritic-or-stem strong rule, ≥2 weak-word rule). Add a small route-local `deriveLanguage(planText, reply): OwnerLanguage` next to the existing folds and pass it: third arg at `:534-537`, second arg at `:573`.
2. **Byte-identity guarantee:** with `'english'` derived, both prompts are byte-identical to today (F3's V6 property holds; default at `:70-74`/`:94` untouched; `packages/ai` unmodified).
3. **Regression pins in `route.test.ts`** (additive, no length assertions, no change to existing reads):
   - Turkish fixture (reuse the `:519` plan-turn forms) + prompt-capturing persona stub: assert `persona.calls[0].messages[0].content` contains a `TURKISH_VERDICT_GUIDANCE` needle (e.g. `a Turkish yes is a yes` — ASCII per repo convention) → **language plumbed end-to-end**.
   - Yes-verdict Turkish thread: assert `persona.calls[1].messages[0].content` contains a `TURKISH_BRIEF_GUIDANCE` needle (e.g. `requirement lines in Turkish`) → **brief guidance present**.
   - Negative pin on an ASCII-English fixture: guidance needle absent (pins the default path at the route level).
   - If the 500-shape fix rides the same wave (same two lines): one more assertion — both message arrays end with a non-empty `user` turn (0428's proposed pin).
4. **Optional, cheap:** `packages/ai/src/persona-prompt.test.ts` additive — `buildVerdictPrompt(p, r, 'turkish')` contains guidance; `buildVerdictPrompt(p, r) === buildVerdictPrompt(p, r, 'english')` (extends F3 V6 to the suite).
5. **Constraints that shape the pins (re-derived, 0428's list confirmed):** all existing `messages[0].content` reads are `:258, :490, :715-723, :764, :782, :806`; every `toHaveLength` in the file asserts call/db/boss/spend **counts**, never message-array length — appending or adding guidance breaks none of them *provided the Turkish fixtures are the only ones guided* (no Turkish-fixture test reads `.content`). **Real interlock:** `replyView` (`route.test.ts:275-281`) slices `'Reply:'`→`'Answer with EXACTLY'`, and `buildVerdictPrompt` inserts guidance between those markers (`:82-90`) — so the three `replyView` tests (`:767-811`, exact-length and `endsWith` assertions) stay green **only because their fixtures are pure-ASCII** and must resolve to `'english'`; the derivation must not misfire on ASCII-only English text (this is why the plan/reply-keyed fold rule, not an eager diacritic guess on the ask line, belongs in the recipe). The `:719-723` plan-block slice (`Plan:`→`Reply:`) is unaffected either way.
6. **Logging:** none needed for this defect (the spend row already meters both calls; catch-logging is the 0428 sibling's item).

## Files Touched
- READ ONLY: apps/web/app/api/builder/verdict/route.ts; apps/web/app/api/builder/verdict/route.test.ts; packages/ai/src/persona-prompt.ts; packages/ai/src/persona-prompt.test.ts; packages/ai/src/index.ts; apps/web/app/dashboard/new/page.tsx (client POST shape); apps/web/lib/interview/session-bind.ts; apps/web/lib/demo/brain.ts (detector precedent); apps/web/proxy.ts; apps/gateway/drizzle/0001_init.sql; targeted greps (callers, length pins, locale, schema).
- CREATED: Agent Reports/2026-09-24-1800_reconlang_REVIEW_verdict-langdrop.md (this report — saved by orchestrator; read-only profile has no Write tool).
- MODIFIED: nothing.

## Dependencies Added
None.

## Assumptions Made
- The 0428 adjudicated record is accepted as context for the sibling 500 defect (shape, route order, provider citations) — every byte claim here was re-derived from disk, not carried over.
- `deriveLanguage` scoping assumes the founder accepts turn-text derivation as the signal (vs a body field or stored preference — see Open Questions); the recipe is written so the signal choice only changes the helper's input, not the call-site wiring.
- No live provider/model behavior is claimed; no web research was performed or needed (bytes-on-disk diagnosis; provider contracts are the sibling task's cited territory).

## Open Questions for Orchestrator
- **Founder — language signal (product decision):** (a) derive from turn text server-side (recipe above, no API/schema change); (b) add `language` to the POST body (client + route + both test files; the page needs the same detector anyway); (c) store owner language on the account (schema + migration + billing-adjacent). Recipe assumes (a) unless overruled.
- **Founder — derivation key (accuracy/copy decision):** the guidance text asserts "the plan and the reply are in Turkish" — a Turkish plan with an English `yes, go ahead` (the exact shape `route.test.ts:737-765` exercises) makes that half-false. Key on reply, plan turn, or either-or? May warrant a per-turn wording tweak in `TURKISH_VERDICT_GUIDANCE` itself (copy is founder-locked territory). Not decided here.
- **Founder — billing/copy confirmation:** guidance adds ~2 lines to each call, only on Turkish-derived threads (~60 extra billed tokens total). The F3 wave already shipped that text on the founder's lock; the orchestrator should confirm wiring it up needs no new spend sign-off.
- **Orchestrator — sequencing:** land this with the 0428 500-shape fix (same two call sites, one edit wave, one shared regression pin) or separately? Either way it is a prerequisite for the §6 live Turkish E2E to measure what the guidance was built to fix.

## Public Interface Exposed
Unchanged — diagnosis only. The route's request/response shapes stay byte-identical (language is derived server-side, never a new request field under recipe (a)); prompts for English-derived threads are byte-identical to today; `packages/ai` exports nothing new.

## Known Limitations
- Report saved by orchestrator (read-only profile has no Write tool and forbids redirect/heredoc writes).
- No browser drive, bytes + suite reads only — no dev server, no live POST, no DB touch; nothing executed beyond read-only git/grep.
- The `'turkish'` branches of both prompts remain untested on disk until the pins land; this report only scopes them.
- Only the two allowed Agent Reports were read (plus grep hits across the reports directory for caller enumeration — file names and the re-derived lines only, no other report opened).
