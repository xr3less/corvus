# Task Report: fix-verdict-combo-1810

**Wave timestamp:** 2026-09-24-1810 · **HEAD:** `d9cf8d7` · **Tree:** uncommitted (nothing committed, nothing pushed, no deploy, no migrate, no secret touched, no live POST)

## Status

SUCCESS — both defects fixed in one edit wave on the two files in scope; all four regression pins green on the real tree and each proven red under its own mutation; English-thread prompt content proven byte-identical by hash.

## What was landed

**Defect 1 — the 500 shape (adjudicated in `2026-09-24-0428_recon-verdict500_REVIEW_verdict-500.md`).** Both persona-lane calls posted a **system-only** message array. The GLM backend rejects a payload of system turns alone (HTTP 400 / code 1214), the router retried once and threw `RouterError`, and the bare catch mapped it to a 500 — so the judge call failed on every thread, in every language, before the model ran, and the brief call was queued to fail the moment a verdict said `yes`. Each call now ends with a short `user` turn (`CLOSE_USER_TURN`, route.ts:267), matching the idiom every other lane caller in the repo already uses (`chat/route.ts:428-432`, `builder-runs.ts:637-649`). Both catches now log the discarded error (route.ts:641, route.ts:679) in the same `console.error(sentence, error)` shape as `chat/route.ts:447`.

**Defect 2 — the language plumbing (adjudicated in `2026-09-24-1800_reconlang_REVIEW_verdict-langdrop.md`).** `buildVerdictPrompt` and `buildBriefPrompt` each take an optional `language` and append their Turkish guidance only for `'turkish'`; neither call site passed it, so `TURKISH_VERDICT_GUIDANCE` / `TURKISH_BRIEF_GUIDANCE` were unreachable in production and a Turkish thread was judged by English rules. The language is now derived route-side — founder-approved option (a), **no API or schema change** — by `deriveLanguage` (route.ts:256) and passed as the 3rd arg at the judge call (route.ts:627) and the 2nd arg at the brief call (route.ts:669).

**The derivation is keyed on the bytes the prompt actually carries.** The kept-ends views (`planView`/`replyView`, route.ts:616-617) are computed **once** and reused for both the derivation and the prompt, so text that is dropped from a long turn can never decide the guidance. Shape follows `lib/demo/brain.ts:60-118` (strong signal: a Turkish-specific letter `[çğışöüÇĞİŞÖÜ]` or one of 16 folded stems including `basla`/`evet`/`tamam`/`olur`; weak signal: two or more of the 14 short whole words), with the stems and words folded through this route's own `TURKISH_FOLD` so a diacritic-free spelling lands on the same needle — which is what keeps `Plan hazir. Baslayayim mi?` / `evet` (route.test.ts:34) resolving to `turkish`. Either plan **or** reply containing Turkish reads as `turkish`.

**`packages/ai` is unmodified.** Verified two ways: `find packages/ai -newermt "2026-09-24 18:42" -type f -not -path "*/node_modules/*"` → empty; and `OwnerLanguage` was already re-exported through the package barrel (`src/index.ts:13`), so the new import (route.ts:55) needs no package change. Guidance copy was not reworded.

## Files Touched

- **MODIFIED:** `apps/web/app/api/builder/verdict/route.ts`
  - SHA256 before `46173f3b3b0f7291e88dcd18c26a7b8d52f96f43aa7b28bac2da3bf137e39983` → after `acd6411917ab4bc891eedaa29837dfa134ffd425dbe1ae7c288d6f3fac908208`
  - New/changed lines: `:55` (`type OwnerLanguage` import), `:185-267` (detector block incl. `TURKISH_LETTERS :203`, `TURKISH_STEMS :207`, `TURKISH_WORDS :229`, `TURKISH_WORD_RE :246`, `isTurkishText :248`, `deriveLanguage :256`, `CLOSE_USER_TURN :267`), `:616-618` (`planView`/`replyView`/`language`), `:622-632` (judge call: 3-arg prompt + user turn), `:635-643` (judge catch logs at `:641`), `:666-673` (brief call: 2-arg prompt + user turn), `:676-681` (brief catch logs at `:679`). No other region of the file changed.
- **MODIFIED (additive only):** `apps/web/app/api/builder/verdict/route.test.ts`
  - SHA256 before `30b588156fb81bad17b9d7f995b0322b6b5fa5fd3645dce2f4683c299e51f628` → after `4b79cd3d0b560e8da54e678ca3fec92526034c62321d18afda533118ead0e557`
  - **Proven additive:** `diff` against the pre-edit bytes reports **137 added lines, 0 removed**, two pure-insert hunks (`282a283,292`, `1129a1140,1266`). No existing assertion, read or `toHaveLength` was touched; no length pin added.
  - Added: needle constants `:290-291`; `describe('POST /api/builder/verdict - the persona calls carry shape and language')` at `:1163` with pin (i) `:1164`, pin (ii) `:1194`, pin (iii) `:1228`, pin (iv) `:1248`.
- **CREATED:** `Agent Reports/2026-09-24-1810_fixverdict_FIX_verdict-combo.md` (this report).
- **NOT touched:** `packages/ai/**` (zero bytes), shared manifests, any config (eslint/prettier/tsconfig), any other file.

## Dependencies Added

None — no new import beyond the type already in the package barrel, no install run, no manifest edit.

## The four regression pins

| # | Pin (test name / line) | Asserts |
|---|---|---|
| i | `hands the judge Turkish guidance when the owner wrote Turkish` `:1164` | `persona.calls[0].messages[0].content` contains `a Turkish yes is a yes`; last message is a non-empty `user` |
| ii | `hands the brief writer Turkish guidance on a Turkish yes` `:1194` | `persona.calls[1].messages[0].content` contains `write the requirement lines in Turkish`; last message is a non-empty `user`; build still starts |
| iii | `keeps an ASCII-only thread on the byte-identical English prompt` `:1228` | guidance needles **absent** on an ASCII English thread; `Answer with EXACTLY` still present |
| iv | `closes both message arrays with a non-empty user turn` `:1248` | for **both** calls: `messages[0].role === 'system'`, last role `user`, last content non-empty |

Both needles are re-declared in the test file, not imported, so a copy drift inside `packages/ai` fails this suite (the same second-independent-copy idiom the refusal-sentence pins use). Every pin is on captured payload bytes through the route's existing `__setPersonaCaller` seam — no new seam, no route export added beyond the pre-existing ones.

## Byte-identity: the English path is unchanged

Proven by hash, not by reasoning. Both route versions were loaded side by side and driven with the same ASCII English thread (plan ending `Can I start? Reply yes to build.`, reply `yes, go ahead`):

| | prompt SHA256 | chars | messages | last role | status |
|---|---|---|---|---|---|
| **pre-edit** (system-only, 2-arg prompt) | `2176621d9a79d66f36cd0e2049d1c379e3e35487e2f0703202fb80df0c7931dc` | 453 | 1 | system | 200 |
| **post-edit** (user turn, 3-arg prompt) | `2176621d9a79d66f36cd0e2049d1c379e3e35487e2f0703202fb80df0c7931dc` | 453 | 2 | user | 200 |

Identical hash. The prompt *content* the model reads is byte-for-byte what it read before; only the message-array shape changed (1 → 2 messages, ending in a user turn). This is the F3 V6 default property holding at the route level — and the negative pin (iii) pins it for good.

## Mutation proof (out-of-repo copy only)

Instrument construction: `robocopy <repo> <copy> /E /XD node_modules .next .git .vitest .vite .vite-temp /XJ` then junctions for `node_modules` at three levels. Reparse points asserted at **0 non-link** before every row (measured as `3/0`: exactly the three junctions I created). Baseline **re-copied per row** from a shadow dir so no row inherits another's mutation. Runner pinned: `node ./node_modules/vitest/vitest.mjs run app/api/builder/verdict/route.test.ts` from the copy's `apps/web` cwd; `RUN v5.0.0` banner asserted in every row. Exit codes captured true (a first PowerShell-based runner was discarded because PS 5.1 wraps native stderr as `NativeCommandError` and loses the exit code — replaced with a Node `spawnSync` driver).

| Row | Mutation | Exit | Observed |
|---|---|---|---|
| **baseline** | pre-edit bytes for both files, no mutation | **0** | 37/37 passed — **instrument validated on an unmodified copy** |
| **A** | removed `{ role: 'user', content: CLOSE_USER_TURN },` at both call sites (2 occurrences) | **1** | 3 failed / 38 passed: pin **(i)** red `expected { role: 'system', …(1) } to match object { role: 'user' }`, pin **(ii)** red (same), pin **(iv)** red (same) |
| **B** | forced `deriveLanguage` → `'english'` | **1** | 2 failed / 39 passed: pin **(i)** red `expected 'Judge whether the user reply accepts …' to contain 'a Turkish yes is a yes'`; pin **(ii)** red `expected 'Distill the thread into 3-8 tight req…' to contain 'write the requirement lines in Turkish'` |
| **C** | unmodified post-edit bytes (control) | **0** | 41/41 passed |
| **D** *(extra)* | forced `deriveLanguage` → `'turkish'` (misfire probe) | **1** | 3 failed: pin **(iii)** red **plus two pre-existing reply-view byte pins red** — `bills an over-bound reply as exactly REPLY_MAX chars` (`expected 831 to be 500`) and `sends an in-bound reply to the judge byte-identical` (string mismatch) |

Row D is the one that matters for the trap named in the brief: it proves the ASCII-misfire interlock is live rather than decorative. Forcing `turkish` on an ASCII thread inserts the guidance between the `Reply:` → `Answer with EXACTLY` markers, and the *pre-existing* `replyView` byte pins go red — so the derivation genuinely must not misfire, and the suite enforces it. Each row's stated failure was observed at the line it claims; no citation in this table depends on a line that is absent from its own evidence.

**Cleanup.** Junctions were unlinked **explicitly by name first** (never recursively through a link), then the repo's `node_modules/vitest/package.json` and all five `@corvus/*` links were asserted intact, then each copy was deleted. Post-delete assertion re-verified the markers: both copies gone from `%TEMP%`, repo `node_modules` and all workspace links intact. `%TEMP%\f7t3_*` (another agent's evidence) and `%TEMP%\f523-instrument` (read-only source of the pre-edit bytes) were **not** touched.

## Gates (real tree, true exit codes, no pipe)

| Gate | Command | Result |
|---|---|---|
| Focused suite | `node ./node_modules/vitest/vitest.mjs run app/api/builder/verdict/route.test.ts` (apps/web cwd) | `RUN v5.0.0` · **41 passed (41)** · before the edit: 37 passed · **EXIT 0** |
| Full web suite | `node ./node_modules/vitest/vitest.mjs run` (apps/web cwd) | `RUN v5.0.0` · **65 files passed · 925 passed + 73 skipped (998)** · **EXIT 0** |
| Typecheck | `npx tsc --noEmit` (apps/web cwd) | **EXIT 0**, zero output bytes |
| Typecheck coverage | `npx tsc --noEmit --listFiles` | lists `app/api/builder/verdict/route.ts` **and** `route.test.ts` |
| Lint | `npx eslint <both files> --max-warnings 0` | **EXIT 0**, zero output bytes |
| Lint (JSON validation) | `--format json` | both files `messages=0 suppressedMessages=0` |
| Formatter | `npx prettier --check <both files>` (apps/web cwd authoritative) | `All matched files use Prettier code style!` **EXIT 0** |

No `.only`, `.skip` or `.todo` in the touched test file (grep clean).

## Investigated and explained: full-suite worker aborts (NOT attributed to this change)

Parallel-mode full-suite runs produced two worker-process aborts in files outside my scope:

| Run | File aborted | Worker exit code |
|---|---|---|
| run 1 | `app/api/builder/start/route.test.ts` | `3221226505` (0xC0000405) |
| run 3 | `lib/auth/session-db.test.ts` | `3221226505` (0xC0000409) |

Evidence gathered before drawing any conclusion:

- Both files pass **in isolation** (start: 20/20) and **together in one parallel run** (2 files / 41 tests, exit 0).
- Both files' import graphs are disjoint from the change: `session-db.test.ts` has **zero** hits for `verdict`/`persona-prompt`/`buildVerdictPrompt`; `start/route.test.ts`'s only hit is a **comment** (`:445`, the word "verdict" in prose). `session-db.test.ts` opens a real Postgres `Pool` with a 5000 ms connect timeout, which the verdict route never does.
- The aborts are **not reproducible**: parallel runs 2, 4, 5 → **EXIT 0**; a serialized run (`--no-file-parallelism`) → **EXIT 0**, 65 files / 925 passed.
- **Positive control:** a second out-of-repo copy (`fvc_control`) built identically but holding the **post-edit** bytes ran **3/3 parallel full suites green** (925 passed each).
- **Honest limit:** the pre-edit baseline copy also ran 5/5 green in parallel, so I **cannot** claim the abort class is *proven* pre-existing on this tree — the pre-edit bytes were never run in parallel mode at the repo cwd in this session.

Conclusion as stated: the evidence points to a flaky worker abort under parallel load on an uncommitted 231-file tree (3072 tests, ~7 GB free of 16 GB, jsdom environment created 65 times), with no code path connecting it to the touched route. Flagged for the reviewer below rather than declared benign.

## Assumptions Made

- The adjudicated provider contract (GLM system-only → 400/1214) is taken as context from the whitelisted 0428 report; I re-derived every byte claim from disk but did not re-prove the provider, and made no live POST.
- Option (a) — derive the language server-side from turn text — was approved by the founder; no request field was added and the POST body stays `{ botId, turns }`.
- The derived signal is the kept-ends view (the bytes the prompt carries), not the raw turn: text truncated out of a long turn cannot influence the guidance.
- `CLOSE_USER_TURN` copy is `'Follow the instructions above.'` — ASCII, 5 tokens, minimal per repo convention. The founder owns this copy; it bills on every verdict and brief call (~5 input tokens each), and changing the string later is a one-line edit at route.ts:267.
- The Turkish guidance adds ~2 lines to each call **only** on Turkish-derived threads; the F3 wave already shipped that text on the founder's lock, so wiring it up needs no new spend sign-off.

## Open Questions for Orchestrator

1. **Full-suite worker aborts (2 of 6 parallel runs) — second opinion requested.** This is the only thing in this report I could not close out. Recommended: the reviewer attempt a reproduction (e.g. 3 parallel full-suite runs) and, if it reproduces, treat it as a harness-level flake task (vitest pool configuration or machine memory headroom — note `pool: 'vmThreads'` is the hint vitest itself prints), not as a verdict-route defect. The serialized run (`--no-file-parallelism`) is a deterministic green witness in the meantime.
2. **`packages/ai/src/persona-prompt.test.ts` still has zero `'turkish'` coverage** — both guidance branches are exercised only through the route now, never at package level. Per the task this was explicitly out of scope; recording it as the approved separate follow-up, **not** expanding scope.
3. **The half-false wording, unchanged by design.** `TURKISH_VERDICT_GUIDANCE[0]` asserts "The plan and the reply are in Turkish". On a Turkish-plan + English-`yes, go ahead` thread (the shape `route.test.ts:737-765` exercises) that sentence is half-false. The copy is founder-locked, so per instruction I did **not** reword it — flagged as a possible copy decision for the founder, with the derivation deliberately keyed on either-or so the guidance still reaches the judge.

## Public Interface Exposed

No change to any exported surface. `POST`'s request shape is unchanged (`{ botId, turns }` — no language field) and its response shapes are unchanged, including both 500 codes and their Turkish sentences. The pre-existing test seams (`__setPool`, `__setPersonaCaller`, `__setBossFactory`, `__setSessionReader`, `__reset*`, `BUILDER_QUEUE`, `PersonaCaller`, `PersonaResult`, `VerdictSession*`, `BuilderBoss`) are untouched; `deriveLanguage`, `isTurkishText`, `TURKISH_*` and `CLOSE_USER_TURN` are module-local and not exported. `packages/ai` exports nothing new.

## Known Limitations

- **The half-false case is recorded, not fixed** (see Open Question 3): a Turkish plan with a purely English reply derives `turkish` and hands the judge guidance whose first line claims both turns are Turkish. Accepting the half-false case is deliberate — the alternative (key on reply only) would drop the guidance exactly on the Founder's realistic path, and the copy is locked.
- **Signal richness.** Derivation reads the turn text only. There is no locale cookie, no language column and no body field to consult (`proxy.ts` checks `SESSION_COOKIE` presence only; `drizzle/0001_init.sql` has no language column), so a thread written entirely in diacritic-free, stem-free Turkish with no short Turkish words could derive `english`. The weak-word set requires two hits precisely so ordinary English cannot misfire; the trade is a narrow false-negative band rather than false positives, which is the safe direction (a false positive corrupts the English byte-identity pins).
- **Unknown Turkish stems.** 16 stems cover the realistic owner vocabulary but not the language; a Turkish reply outside that vocabulary and without diacritics relies on the two-short-word rule.
- **The two full-suite worker aborts remain unexplained** — reported above rather than waved away.
- **No live verification.** No live POST, no real key, no browser drive, no DB touch: correctness is pinned by the suite and by the byte hash, and the §6 live Turkish end-to-end remains the orchestrator-plus-founder gate.
- **No line-number claims are carried over from the whitelisted reports.** Every `file:line` in this report was re-derived from disk after the edit; the earlier reports' numbers refer to the pre-edit file and shift in the places listed under Files Touched.
- **Provenance note.** The pre-edit bytes used for the baseline row and the byte-identity probe came from `%TEMP%\f523-instrument\corvus\...` (another agent's copy, mtime 01:19/01:20 today), verified `sha256`-identical to the hashes I recorded immediately before editing. I read from that copy and never wrote to it.

## Research statement

**Web research was not needed for this task, and none was performed.** The only live-fact dependency is the provider contract for a system-only message array (GLM → HTTP 400 / code 1214), which the brief designates as already-adjudicated context in the whitelisted 0428 report (sourced there to `docs.z.ai/api-reference/llm/chat-completion.md`, `docs.z.ai/api-reference/api-code`, `wiro.ai/docs/markdown/completions-api.md`, plus the nanobot #3082 / openclaw #73688 reproductions). This task consumed that adjudication and did not re-prove it. Every other fact used here was read from the tree: `next@16.3.4` and `vitest@5.0.0` (web) / `3.2.7` (root) from the installed `package.json` files, `OwnerLanguage` and both prompt signatures from `packages/ai/src/persona-prompt.ts:24,70-74,94`. No version, model name, API surface or price was taken from memory.

**OSS-first (memory rule):** no external OSS pattern was borrowed. The fix follows three repo-internal precedents — the route's own `TURKISH_FOLD`/`foldAskText` idiom (`route.ts:156-181`), the `lib/demo/brain.ts:60-118` detector shape, and the `chat/route.ts:428-432` system-plus-user message shape — so there is no repo/URL to cite.

**Next.js docs check (`apps/web/AGENTS.md`):** the bundled docs directory **is** present at `apps/web/node_modules/next/dist/docs/` (the package resolves from the workspace root: `node_modules/next/dist/docs/` → `01-app`, `02-pages`, `03-architecture`, `04-community`, `index.md`). No guide was needed: this task adds no Next API, no route, no layout, and no config — it edits the body of an existing route handler and its test.
