# Task Report: review-F3

Timestamp: 2026-09-24-0101 (system clock; review ran 01:07–01:15)
Agent id: reviewer
Task type: REVIEW

## Status

PASS — with three findings the orchestrator must read, and one blocker corroborated.

Independent reviewer. I did not write this code. Every claim below was re-derived on the
merged tree; where I could not re-derive a builder claim I say so explicitly rather than
inheriting it.

## Toolchain detected

Not assumed — read from the manifests:

- npm workspaces monorepo (`package.json` `workspaces: ["apps/*", "packages/*"]`), `engines.node >=24`.
- Runner: **vitest** (`@corvus/ai` `test: vitest run`; `apps/web` runs it directly).
- Typecheck: **tsc** (`@corvus/ai` `typecheck: tsc --noEmit`).
- Lint: **eslint flat config** (`eslint.config.mjs`), root script `eslint . --max-warnings 0`.
- Format: **prettier** (`--check --ignore-unknown`).
- `apps/web` has no package.json `test` script; vitest is invoked directly.

## Files Touched

- REVIEWED: `packages/ai/src/persona-prompt.ts` (the F3 deliverable)
- REVIEWED: `packages/ai/src/persona-prompt.test.ts`
- REVIEWED (read-only, peer-owned): `apps/web/app/dashboard/new/page.tsx`,
  `apps/web/app/api/builder/verdict/route.ts`, `apps/web/lib/verdict/bounds.ts`,
  `apps/web/app/api/chat/route.ts`
- CREATED (this review): `Agent Reports/2026-09-24-0101_reviewer_REVIEW_F3.md`
- No code was edited. No git restore/commit/push, no deploy/migrate/secrets.

## Verification — commands and exit codes

| #   | Check                        | Command                                                          | Exit | Result                                                          |
| --- | ---------------------------- | ---------------------------------------------------------------- | ---- | --------------------------------------------------------------- |
| R1  | Package typecheck            | `npm run typecheck --workspace @corvus/ai`                       | 0    | clean                                                           |
| R2  | File lint                    | `npx eslint packages/ai/src/persona-prompt.ts --max-warnings 0`  | 0    | clean                                                           |
| R3  | Repo-wide lint               | `npx eslint . --max-warnings 0`                                  | 0    | clean                                                           |
| R4  | File format                  | `npx prettier --check packages/ai/src/persona-prompt.ts`         | 0    | clean                                                           |
| R5  | Package format               | `npm run format --workspace @corvus/ai`                          | 0    | clean                                                           |
| R6  | Focused test                 | `npx vitest run src/persona-prompt.test.ts` (cwd `packages/ai`)   | 0    | **42/42 passed**                                                |
| R7  | Full package suite           | `npx vitest run` (cwd `packages/ai`)                             | 0    | **158/158 passed, 6 files**                                     |
| R8  | Web — prompt consumers       | `npx vitest run app/api/chat/route.test.ts` (cwd `apps/web`)      | 0    | **35/35 passed**                                                |
| R9  | Web — verdict route          | `npx vitest run app/api/builder/verdict/route.test.ts`            | 0    | **34/34 passed**                                                |
| R10 | Web — new-bot page           | `npx vitest run app/dashboard/new/page.test.tsx`                  | 0    | **49/49 passed**                                                |
| R11 | Dist sync (independent)      | `npm run build --workspace @corvus/ai` + sha256 before/after      | 0    | identical `bbd3aa95…`; src `6edfc850…`                          |
| R12 | Criterion 3 across variants  | node, all 6 prompt variants                                      | 0    | zero residue (detail below)                                     |

Web total across the three touched-consumer suites: **118/118**.

### R11 — dist genuinely derived from src, re-derived not trusted

Hashed `packages/ai/dist/persona-prompt.js` → `bbd3aa95…`. Ran the real build
script. Re-hashed → **byte-identical `bbd3aa95…`**. Source stayed `6edfc850…`.
The shipped artifact matches the source, and the build is reproducible. This
independently confirms the builder's hash pair.

### R12 — criterion 3, verified by execution not by reading

I executed the built `dist/persona-prompt.js` and scanned all six variants
(persona, persona+botName, verdict×2, brief×2), separating the prohibition
instruction from real copy:

- `Build this bot` — **0 occurrences** in every variant.
- `!` — **0 occurrences** in every variant.
- `click|press|button` — the only matching line is the no-control *prohibition*
  itself (`never name a control or ask the owner to press or click anything`,
  source line 34). I checked it is **pre-existing**, not F3-introduced: it is
  quoted as line 37 of `2026-09-24-0023_fix-ui-autostart_MODIFY_persona-prompt.md`.
  Zero non-prohibition control copy.

### F3 behaviour, verified by execution

- Turkish accept line present in the persona prompt **and positioned above** the
  English line: Turkish at index 2166, English at 2329 → `TR < EN` is true, so a
  tail-keeping view reaches the English line. The builder's ordering rationale holds.
- Language guidance is **additive and isolated**: the Turkish verdict text
  (`sen karar ver`) is present **only** in the `turkish` variant, absent in default;
  same for the brief's English-kind-token guidance. No language leaks into the default path.
- Verdict JSON contract `{"verdict":"yes"|"no"|"unclear"}` is present in **both**
  language variants.
- Default path identity: `buildVerdictPrompt(p,r) === buildVerdictPrompt(p,r,'english')`
  → **true**; `buildBriefPrompt(t) === buildBriefPrompt(t,'english')` → **true**.
  The omitted-argument and explicit-english paths are the same bytes.
- ASCII-only convention holds where it matters: the two builder guidance arrays
  emit **0 non-ASCII characters**, and `verdict_tr`/`brief_tr` are fully ASCII.

### Cross-file integration, independently replicated

I re-implemented both peer gates' fold logic from source and ran the prompt's real
emitted line through them:

- `page.tsx` `ASK_LINES` (line 71) accepts the Turkish line → **true**; accepts the
  English line → **true**.
- `verdict/route.ts` `ASK_LINES` (line 150) through `boundedView(plan, 1000, 500)` on a
  **4,000+ char plan**: English accepted → **true**; Turkish accepted → **true**.
  The kept tail is exactly `…Baslayayim mi? Baslamak icin evet yaz.\nCan I start? Reply yes to build.`
  — the English line survives at the very end, which is what the route's gate reads.

So the "alongside, above" decision is verified correct against both consumers on the
real long-plan path, not just on a toy plan.

### Report file on disk — verified

The F3 builder report exists:
`Agent Reports/2026-09-24-0101_F3_MODIFY_persona-turkish.md`, 12,008 bytes.

### Residue sweep (F1 / F2 / F3 defect classes)

Repo-wide grep across `*.ts,tsx,js,jsx,md` excluding `node_modules` and `dist/`:

- `Build this bot` — every hit is either a **historical Agent Report** (correct record of
  the deleted button) or a **negative assertion** (`expect(prompt).not.toContain('Build this bot')`
  at `persona-prompt.test.ts:111,117`; `queryByRole('button', {name:'Build this bot'})` → `toBeNull()`
  at `page.test.tsx:425,1454`). **No live copy anywhere.** F3 residue clean.
- F2's silent-409 is repaired in the current tree: the route writes both a code and an
  honest message (`route.ts:515` `{ error: 'no_plan_asked', message: NO_PLAN_MESSAGE }`),
  and the page shows `VERDICT_HINT` (Turkish, `page.tsx:61`) instead of a raw code.
- No secrets or hardcoded credentials in the reviewed file.
- No `.only` / `.skip` / `todo` in the focused test file.

## Findings

### 1. MEDIUM — the new public surface has **zero** committed regression tests

`packages/ai/src/persona-prompt.test.ts` has 42 tests and all pass, but:

```
grep -n "turkish|OwnerLanguage|'english'" packages/ai/src/persona-prompt.test.ts  → 0 matches
grep -n "Baslayayim|Baslamak icin"        packages/ai/src/persona-prompt.test.ts  → 0 matches
```

The entire F3 deliverable — the Turkish accept line, the `OwnerLanguage` type, both
`language` parameters, and the english-default identity — is **unguarded**. The
builder's V6/V7 checks were performed as ad-hoc transcription comparisons in the
session, not committed as tests. Consequence: any future edit that drops the Turkish
line, reorders it below the English one, or breaks the language branch passes a green
suite. This is exactly the shape `LESSONS.md` §1 warns about — a guard is not a guard
until you have broken the thing it guards and watched it fail; here there is no guard
to break. The sub-agent template requires "unit tests for the public interface", and
the interface gained two parameters and one exported type.

This is a **coverage gap, not a functional defect** — the behaviour itself is correct and
I verified it directly (see F3 behaviour above). It does not fail any of the four
numbered acceptance criteria as relayed. It is, however, the one item I would require
before calling this change durable.

### 2. LOW-MEDIUM — `persona-prompt.ts` is untracked; the "byte-identical" claim is not reproducible

```
git ls-files packages/ai/src/            → persona-prompt.ts ABSENT
git status --porcelain packages/ai/      → ?? packages/ai/src/persona-prompt.ts
git show HEAD:packages/ai/src/persona-prompt.ts → fatal: exists on disk, but not in HEAD
```

`persona-prompt.ts`, `persona-prompt.test.ts`, `builder-prompt.parity.test.ts`, and all of
`apps/web/app/api/builder/verdict/` are **untracked**. Nothing of this feature exists in
HEAD, so it appears in no diff and no review until staged, and is one `git clean` from
being lost.

Directly relevant to F3: **I could not re-derive the builder's V6 "byte-identical to
pre-F3" comparison**, because no pre-F3 baseline exists anywhere on disk or in git. I
searched for a backup and found none. I verified the weaker, reproducible form instead:
the omitted-argument path is identical to the explicit `'english'` path for both prompts
(true/true), and the english variants contain no Turkish guidance. That establishes the
default is well-formed and uncontaminated; it does **not** establish historical byte
identity. The builder's V6 remains an unevidenced assertion from my seat.

### 3. INFO — concurrent peer edits produced transient red; **not** F3-attributable

I observed the verdict route suite fail, then fail differently, then pass, in one window:

- run A → 2 failures (two 404 ownership tests)
- run B/run C/run D → 3 failures (three 409 ask-line tests)
- final run → **34/34 pass**
- each failing test **passed in isolation** (`-t "returns 409 with no row…"` → 1 passed / 33 skipped)

While those runs were in flight I watched the files change under me:
`apps/web/app/api/builder/verdict/route.ts` mtime advanced `01:09:28 → 01:09:54` and
`route.test.ts` changed at `01:09:54`. Both files are untracked, i.e. a peer wave is
editing them concurrently. This matches the builder's note 2 exactly, and it confirms
the moving-target reading.

**These failures must not be counted against F3.** After the peer settled, all three
consumer suites are green (35 + 34 + 49 = 118/118, R8–R10). Independently confirmed:
`persona-prompt.ts` does not appear in any failure stack, and F3 changed nothing under
`apps/web/`.

### 4. INFO — blocker B2 corroborated by code reading; the Turkish verdict/brief path has no production consumer

Both corroborated, not merely accepted:

- **B2 (system-only call shape).** `verdict/route.ts:527` and `:567` both build
  `[{ role: 'system', … }]` — system-only. The working path, `chat/route.ts:429`, is
  `[{role:'system'}, ...history, {role:'user'}]` — always carries a user message. So
  "system-only fails, system+user works" is consistent with the code. I **could not
  reproduce the live HTTP 400** myself (it needs live lane credentials and a network
  call), so I record it as corroborated-by-reading, not independently reproduced.
  It is genuinely pre-existing: the call shape is in the untracked route file, and F3
  touched only `packages/ai`.
- **The language args are genuinely unwired.** `:537` calls
  `buildVerdictPrompt(plan, reply)` and `:567` calls `buildBriefPrompt(threadText)` —
  neither passes a language. Production always takes the `'english'` default.

Net effect: the Turkish verdict/brief guidance is a real capability with **zero
production consumers today**, and B2 blocks observing it there even once wired. The
builder disclosed both accurately. The chat path — what the owner actually reads — is
fully Turkish with no wiring needed, because language selection there is the model's job
per the new prompt line.

## Assessment of the builder's deliberate deviation (criterion 1)

The task's criterion 1 says the accept line arrives "in user language". The builder
emitted the Turkish line **alongside and above** the byte-exact English line rather than
replacing it, and explained why. **I verified the justification is correct**, not
rationalised: three live gates match the English literal —
`page.tsx` `isPlanAsk` (:270, :426) and `verdict/route.ts` `askedToStart` (:519) — and my
long-plan replication shows a hard replacement would have closed auto-start silently,
with no error anywhere. The English line is a machine-read protocol token, not
owner-facing English-only CTA residue, so this is consistent with the F3 defect class
rather than a violation of it: the owner-facing CTA is now Turkish, the protocol token
stays. The builder escalated the cross-file alternative instead of expanding scope —
correct behaviour.

Separately, the builder's open question 3 (`Başlayalım mı?` vs `Başlayayım mı?`) needs no
action: the page and route lists already accept **both**, and the prompt's ASCII
`Baslayayim mi?` folds to the same string as `Başlayayım mı?`. Verified `true`.

## PASS / FAIL per criterion

| Criterion (as relayed in the task)                                                       | Verdict | Evidence                                                                    |
| ---------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| F3: no `Build this bot` copy, no English-only CTA residue                                 | **PASS** | R12 — 0 hits in all 6 variants; remaining hits are historical reports / negative assertions |
| Turkish owner-facing CTA present and positioned so the tail-keeping view reaches English   | **PASS** | exec — TR idx 2166 < EN idx 2329; both gates accept on a 4,000+ char plan     |
| `buildVerdictPrompt` / `buildBriefPrompt` take language guidance                          | **PASS** | exec — guidance present for `turkish`, absent for default                     |
| Verdict JSON shape unchanged                                                              | **PASS** | exec — `{"verdict":"yes"\|"no"\|"unclear"}` in both variants                  |
| No regression on the default path                                                         | **PASS** | exec — no-arg ≡ `'english'` for both prompts                                  |
| Gates: typecheck + lint zero warnings                                                     | **PASS** | R1–R5, R7 — all exit 0                                                        |
| Focused vitest for touched files                                                          | **PASS** | R6 — 42/42; R7 — 158/158; R8–R10 — 118/118                                    |
| Report file exists on disk                                                                | **PASS** | `2026-09-24-0101_F3_MODIFY_persona-turkish.md`, 12,008 bytes                  |
| Dist matches src / build reproducible                                                     | **PASS** | R11 — identical `bbd3aa95…` after rebuild                                     |
| Residue: F1 English-only gate / F2 silent-409 + English strings + Build button            | **PASS** | residue sweep — F2 repaired in current tree; F3 clean                         |
| Unit tests for the new public interface                                                   | **FAIL** | Finding 1 — zero committed tests for the F3 surface                           |

## Known Limitations

1. I could not re-derive the builder's V6 historical byte-identity (no baseline exists;
   see Finding 2). The reproducible subset is verified.
2. I did not reproduce B2's live HTTP 400 — that needs live lane credentials. Corroborated
   by code reading only.
3. Live model behaviour (the builder's V10 matrix and plan-turn transcripts) is a claim
   from a prior session that I did not re-run; my verification of prompt *content* is
   exhaustive and executed, but I did not make live model calls.
4. Two peer files were actively mutating during this review. My R8–R10 numbers are from
   a settled read (`01:14`); if the peer wave resumes, those suites should be re-run.

## Open Questions for Orchestrator

1. **Add the missing F3 tests before closing this wave** (Finding 1). Minimum: the Turkish
   line present in `buildPersonaPrompt`, ordered above the English line; guidance present
   iff `language === 'turkish'`; no-arg ≡ `'english'`. Without them the change is correct
   but unguarded.
2. **Stage the untracked files** (Finding 2). `persona-prompt.ts` and its test are not in
   git; the feature is one `git clean` from gone and appears in no diff.
3. **Wiring the language arg + fixing B2 are both cross-file and both outside F3.** They
   belong in a follow-up task: fix the system-only call shape first (B2), then pass the
   detected language at `:537`/`:567`. Until then the Turkish verdict guidance is dead code
   in production.
