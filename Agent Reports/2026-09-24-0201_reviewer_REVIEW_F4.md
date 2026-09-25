# Task Report: review-F4

## Status
SUCCESS (PASS) — with one required correction to the builder's risk claim, escalated below.

## Verdict
**PASS.** The change does exactly what it claims, on the real path, and I reproduced every
substantive claim independently. One statement in the builder's report — the mitigation claim
for a provider-wide 400 — is **false as written** and must be corrected before merge; the
underlying risk it mis-describes is escalated as an action for whoever owns the wave.

## What was reviewed
- Artifact: `apps/web/lib/ai/stream.ts` (+38 / −3), working tree, uncommitted.
- Builder report: `Agent Reports/2026-09-24-0201_F4_MODIFY_stream-usage.md`.
- Not reviewed (declared out of scope, and not touched by F4): `stream.test.ts` diff is a
  sibling agent's persona-lane work (verified: its diff is a grok-fallback test split, no
  `stream_options` assertion).

## Toolchain detected (not assumed)
- Package manager: **npm** (root `package-lock.json`; `workspaces: apps/*, packages/*`).
- Typecheck: `tsc --noEmit` (script `typecheck` in `apps/web/package.json`).
- Lint: `eslint` (root `lint` uses `--max-warnings 0`; `apps/web` script is bare `eslint .`).
- Format: `prettier --check` (`printWidth: 100`, `singleQuote: true`).
- Tests: `vitest run` (vitest 5.0.0), jsdom.
- Node v24.15.0.

## Commands run and results

### 1. Typecheck — tree is NOT clean, and the builder is right that it is not their file
```
cd apps/web && npx tsc --noEmit
```
- **Zero errors in `lib/ai/stream`** (`grep -c "lib/ai/stream"` → 0).
- The builder's cited error
  `app/dashboard/bots/page.tsx(53,8): error TS2304: Cannot find name 'STATUS_LABEL'`
  **is no longer in the tree.** I read that file: the import at `:16` is present and the
  reference at `:48` is bound — a sibling agent fixed it mid-run. The builder's observation
  was accurate when made; the tree moved under it.
- Current residual errors are in **untracked scratch files only**:
  `proxy.test.ts(33,10)`, and earlier in the run `scratch-probe2.test.ts`. Both `??` in
  `git status`; neither imports `lib/ai/` or `lib/ai/stream`.
- Confirmed independently: `app/dashboard/bots/page.tsx` imports nothing from `lib/ai/`
  (`grep -n "lib/ai\|@corvus/ai"` → no match). There is no path from F4 to that file.

### 2. Lint + format — clean
```
cd apps/web && npx eslint lib/ai/stream.ts          # exit 0, zero warnings
cd apps/web && npx prettier --check lib/ai/stream.ts # All matched files use Prettier code style!
cd apps/web && npx eslint .                          # exit 0
```

### 3. Focused tests — exactly as reported
```
cd apps/web && npx vitest run lib/ai/stream.test.ts
  → Test Files 1 passed (1) · Tests 11 passed (11)
cd apps/web && npx vitest run app/api/chat/route.test.ts lib/chat/thread.test.ts
  → Test Files 2 passed (2) · Tests 53 passed (53)
```
53/53 matches the builder's claim. The two consumer files are the *only* test files in the
web app that import the changed module (`grep -rln "ai/stream"` over `*.test.ts(x)`), so the
blast radius is fully covered by those two plus the focused file.

### 4. Real-path probe — I ran the builder's instrument myself
```
node "C:/Users/xr3less/AppData/Local/Temp/f4probe/probe.mjs"   # PROBE RESULT: ALL PASS
node "C:/Users/xr3less/AppData/Local/Temp/f4probe/neg.mjs"     # NEGATIVE CONTROL OK
```
- I read `/tmp/f4probe/probe.mjs` before trusting it. It is **not** a reimplementation: it
  `registerHooks` a resolver for extensionless relative imports and then imports the real
  `apps/web/lib/ai/stream.ts`, driving the real exported `chatStream` with a stub fetch. The
  assertion reads the bytes actually sent (`JSON.parse(init.body).stream_options`). Valid
  instrument.
- All 9 assertions PASS (C1 ×4, C2, C3, C4, C5 ×2).
- **Negative control verified by me:** `neg.mjs` deletes the `stream_options` line from the
  source *in memory only* (`registerHooks`/`load`, no repo file touched) and re-runs the C1
  assertion. It printed `NEGATIVE CONTROL OK: assertion fails without the change`. LESSONS §8
  satisfied — the guard was broken and watched to fail, not assumed.

### 5. The honest-absence chain, verified end to end in source
- `apps/web/lib/ai/stream.ts:309-314` — `buildDone(null)` → `{ credits: 0, note: 'usage-unavailable' }`.
- `apps/web/lib/ai/stream.ts:414` — cost read from the usage frame via the pre-existing
  `extractCost(chunk)`; no new parsing path.
- `packages/ai/src/cost.ts` — `extractCost` reads `usage.cost`, `usage.totalcost`,
  `root.totalcost` and nothing else. **Confirmed: no token math anywhere.**
- `apps/web/app/api/chat/route.ts:271` and `:325` — `note === 'usage-unavailable'` → NULL
  `usd_cost`/`credits`, never zero. Untouched by F4; the flag changes how often that branch
  fires, not what it does.
- Client: the raw code never renders. `use-chat-stream.ts:69` maps it and
  `chat-thread.tsx:59` supplies Turkish copy. Not user-facing residue.

### 6. Residue checks
- **Single body site:** `buildStreamBody` is defined at `:94` and called at `:361`; a
  repo-wide grep for `chat/completions` finds exactly one other outbound site
  (`packages/ai/src/router.ts:237`) and that file has **no `stream`** in it — it is the
  non-streaming path, correctly untouched. So "every route" is literally true: there is no
  second streaming body builder that could have been missed. LESSONS §2 (enumerate the class,
  not the call site) is satisfied by construction here.
- **No hardcoded user-facing English** in `stream.ts`; the only literal is the machine code
  `'usage-unavailable'`, consumed by code on both sides.
- **Anchors present:** `stream_options: { include_usage: true }` at `:105`; USAGE OPT-IN header
  block at `:26-48`; truth-updated comment at `:292-308`.

### 7. Contract unchanged — verified, not taken on trust
Extracted and diffed the declared interface from `git show HEAD:…` against the working tree:
`StreamEvent` **IDENTICAL**, `StreamOptions` **IDENTICAL**, `chatStream` signature **IDENTICAL**.
No consumer change is required anywhere, and none is present. The old comment's claim that the
body "intentionally stays minimal per the locked contract" was false once the flag was added —
it now says so honestly, which is the right treatment (a corrected comment, not a deleted one).

## The one thing that must be corrected: the failover mitigation is overstated

The builder's Open Question 1 says of a z.ai rejection: *"If it rejects, the failover covers it
(probe CASE 5)."* **That is not what the code does**, and I built a probe to check rather than
reason about it:

```
node "C:/Users/xr3less/AppData/Local/Temp/f4review/failover.mjs"
```

The failover rule at `apps/web/lib/ai/stream.ts:377-397` is: any 4xx except 429 sets
`clientErrorSeen = true`, and **the next 4xx throws**. The lane tolerates exactly **one** 4xx,
not a chain. My probe, with every wiro route answering 400 to the new body:

```
builder routes: wiro-glm-5-2 -> wiro-grok-4-1-fast -> wiro-sonnet-5 -> openrouter-... -> zai-... -> deepseek-chat -> anthropic-...
persona routes: wiro-glm-5-2 -> wiro-grok-4-1-fast -> openrouter-...
CASE A lane=builder: THREW: chatStream: lane "builder" failed at wiro-grok-4-1-fast=http-400.   (routes attempted: 2)
CASE A lane=persona: THREW: chatStream: lane "persona" failed at wiro-grok-4-1-fast=http-400.  (routes attempted: 2)
CASE B one 4xx then success: RESOLVED {"t":"done","credits":2} after 2 attempts
```

CASE B reproduces the builder's CASE 5 — and it passes for the reason the builder assumed,
*only because the second route is a different gateway*. The real lane shape is
**2–3 consecutive wiro routes** (`packages/ai/src/lanes.ts:52-79` builder, `:109-140` persona),
all on `llm.wiro.ai` behind the **same `WIRO_API_KEY`**. If wiro's gateway rejects
`stream_options`, it rejects it for all of them, and both lanes throw after two attempts —
before reaching any non-wiro route. That is a **total chat outage on both lanes**, not a
graceful degradation, and it is the opposite of what the report's mitigation says.

This is not hypothetical hand-waving: the repo already records wiro as a **400ing,
field-validating gateway**. `packages/ai/src/lanes.ts:56-57` and `Docs/DECISIONS.md:2638` both
record a live probe where wiro returned `400 invalid_request_error / unsupported_capability`
for a body field it did not accept (`reasoning_effort` on `glm/5-2`).

**Weighing it fairly, this is a documentation defect, not a code defect.** Counter-evidence is
strong and I fetched it live today: wiro's own gateway page states "a final usage frame **when
you ask for one**" (https://wiro.ai/llm) — a direct statement that wiro supports the ask — and
the earlier 400 was a *model capability* rejection (`unsupported_capability`), not a
request-schema rejection. So the flag is probably accepted. But "probably" is not what
`stream.ts:31-34` asserts: that header block presents wiro as settled route-by-route truth
while the builder's own Open Question 2 admits it was never end-to-end probed. The header and
the caveat need to agree.

**Required corrections (report/orchestrator action, no code change implied):**
1. Strike "the failover covers it" and replace it with the true blast radius: a provider-wide
   4xx on the primary gateway kills **both lanes** at the 2nd route, because the 1-4xx budget
   is exhausted by the same gateway. The builder's Open Question 2 (wiro not end-to-end
   probed) is the honest version of this and should be the one that survives.
2. `stream.ts:31-34` should carry the same caveat as z.ai's — wiro is **documented**, not
   **probed** — or the block should state that the ask is unverified on the primary route.

**Escalated action for the wave owner (no agent can do it — needs a real `WIRO_API_KEY`):**
one live `POST https://llm.wiro.ai/v1/chat/completions` with `stream_options` in the body,
before merge. If wiro 400s, the flag must become route-conditional, and per (1) it must be
conditional for **all** wiro routes, not just the first. If wiro 200s (the expected outcome,
given its docs), this closes and the report's line can simply be corrected.

## Trust artifacts, not summaries
- Builder report exists: `Agent Reports/2026-09-24-0201_F4_MODIFY_stream-usage.md`, 99 lines,
  with real content (probe table, source list, file:line table).
- `apps/web/lib/ai/stream.ts` is really modified: `git diff --numstat` → `38  3`.
- `git status` shows ` M apps/web/lib/ai/stream.ts` (unstaged, uncommitted).
- Probe files really exist at `C:/Users/xr3less/AppData/Local/Temp/f4probe/{probe,neg}.mjs`.
- Report's file:line table is accurate except one soft citation: it lists the `extractCost`
  call site as `:~434`; the actual line is `:414`. The file's mtime (01:44:01) predates the
  report (01:52:32), so the report describes the current version — this is an imprecise
  citation, not drift. The comment block it cites as `:293-312` is at `:292-308`.

## Merged-tree state (NOT F4's, escalated for the wave owner)
Full web suite on the tree as it stands: **16 failed / 983** across 6 files. **None of the 6
imports `lib/ai/stream`** — I checked each one individually. All 56 failures in
`app/dashboard/bots/[id]/page.test.tsx` trace to a single sibling defect:
`ReferenceError: CREDITS_PER_CHANGE is not defined` at
`apps/web/app/dashboard/bots/[id]/page.tsx:1039` — the symbol is exported from
`lib/bots.ts:182` but dropped from that file's import block (it *was* imported at HEAD,
`grep -c` → 2 uses). The remaining failures are the same class of in-flight Turkish-conversion
drift (tests asserting English copy against converted components). The run was also
non-deterministic across invocations, consistent with siblings writing the tree mid-run.
**The wave owner must re-gate the merged tree; N green trees are not the tree that ships.**

## Files Touched
None. Read-only review. No edits, no git restore/commit/push/deploy/migrate/secrets.

## Dependencies Added
None.

## Assumptions Made
- Treated `git status`/mtime as the source of truth for "what F4 changed", not the report's prose.
- Treated the isolated wiro question as product-risk documentation rather than a code defect,
  since wiro's own live docs support the flag and the failure mode is unobserved.

## Open Questions for Orchestrator
1. **Needs a real `WIRO_API_KEY`:** one live POST with `stream_options` before merge (see above).
   No agent can close this; it is the only unverified item in F4.
2. **Report correction required:** the builder's "failover covers it (probe CASE 5)" claim must
   be replaced with the true blast radius (both lanes die at the 2nd route under a provider-wide
   4xx). My probe `C:/Users/xr3less/AppData/Local/Temp/f4review/failover.mjs` is the evidence.
3. The merged tree is not gated and is being written by siblings mid-run; re-gate belongs to the
   wave owner, not to F4.

## Public Interface Exposed
None (review task).

## Known Limitations
- I could not send a real request to any provider (no keys held), so wiro and z.ai remain
  unprobed end-to-end — same limitation the builder reported, and the reason item 1 exists.
- My failover probe drives the real module but with a stub fetch; it proves the **branch logic**
  under a 4xx, not that any specific provider returns one.
