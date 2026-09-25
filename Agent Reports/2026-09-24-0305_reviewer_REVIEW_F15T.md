# Review Report: review-F15T (F15T-thread-busy)

## Status

**PASS** — both `busy` blocks in `apps/web/lib/chat/thread.test.ts` are verified as real, load-bearing guards on unified refusal-reader behavior. Every gate reproduces on the merged tree with true exit codes; the byte-match claim is exact; the independent mutation instrument fails the new assertions in both blocks (4/4 payloads), and the source-unchanged claim holds at sha256. The build report is accurate on every checkable claim, including its two self-named limitations.

I did not write this code. Independent review, clean context, no source/test/manifest/lockfile/env edit, no git restore/commit/push/deploy/migrate, no secrets touched. All probe work ran on temp copies outside the repo and was deleted afterwards.

**Research:** No web research was performed or needed — this is a pure-TypeScript test edit with no live versions, model names, APIs, or pricing involved. Stated as instructed. Toolchain versions below were read from the repo's own manifests, not from memory.

## Independent Verification (commands + results)

Toolchain **detected, not assumed**, from `apps/web/package.json` + root `package.json` + `package-lock.json`: npm workspaces, `typescript 5.9.3`, `vitest 5.0.0` (via `apps/web/vitest.config.mjs`), `eslint 9.39.5` (flat config at repo root, `--max-warnings 0`), `prettier 3.9.6` with repo-root `.prettierrc` (`printWidth: 100`, `singleQuote`, `trailingComma: all`). Exit codes captured directly, never through a pipe.

| Gate | Command (cwd) | Result |
|---|---|---|
| Typecheck | `cd apps/web && npx tsc --noEmit` | **exit 0**, zero output |
| Lint (apps/web) | `cd apps/web && npx eslint lib/chat/thread.test.ts --max-warnings 0` | **exit 0**, clean |
| Lint (repo root) | `npx eslint apps/web/lib/chat/thread.test.ts --max-warnings 0` | **exit 0**, clean |
| Lint non-vacuous | same, `--format json` | file **present** in results: `err 0 warn 0 msgs 0` — eslint really processed the file rather than matching nothing |
| Format | `cd apps/web && npx prettier --check lib/chat/thread.test.ts` | **exit 0**, "All matched files use Prettier code style!" |
| Target suite | `cd apps/web && npx vitest run lib/chat/thread.test.ts` | **18 passed (18)**, 1 file, **exit 0** (was 16/2 per the F15 review) |
| Full suite | `cd apps/web && npx vitest run` | **65 files / 994 tests passed**, **exit 0** — reproduces the report's number exactly |
| Sibling exclusion | `cd apps/web && npx vitest run components/ui/use-chat-stream.test.tsx` | **6/6 pass, exit 0** |

### Byte proof — asserted generic matches `refusal.ts:65` constant

Extracted the literal from `refusal.ts` on disk with a regex and counted exact UTF-8 byte matches in the test file:

| Check | Result |
|---|---|
| `refusal.ts:65` literal, UTF-8 hex | `c4b07374656b2074616d616d6c616e616d6164c4b120e280942074656b7261722064656e652e` |
| UTF-16 units | **34** |
| Exact byte-matches in test file | **4** (lines 99, 134, 136, 138 — the 4 new assertions) |
| ASCII-homoglyph variant (`I`/`i` for `İ`/`ı`) present | **False** |
| Raw `toBe('busy')` expectations left in file | **0** |
| Fixtures still feeding the code-shaped input | **4** (lines 98, 133, 135, 137) |

Both byte claims in the build report reproduce exactly, including that `U+0130`/`U+0131`/`U+2014` are the real codepoints and not ASCII lookalikes.

### Source-unchanged proof (task requirement)

| File | Report's checksum | My sha256 on merged tree | Verdict |
|---|---|---|---|
| `apps/web/lib/chat/thread.ts` | `98732901…` | `987329017aae3958d4b4d61487ea289c951ed202487db12e9faba3101a4b6f4e` | **IDENTICAL / MATCH** |
| `apps/web/lib/http/refusal.ts` | `80c87d19…` | `80c87d190c459dcb4ab8078fb73f93830f155f3168845e7bb4be62f376fb8c83` | **IDENTICAL / MATCH** |
| `apps/web/lib/chat/thread.test.ts` | `df78b264…` | `df78b264c31da73bcd4d2dea93cfa36c6a38faa1019310286107e091d1c0878f` | **MATCH** (the one in-scope file) |

### My own mutation instrument (not a re-run of the report's)

Built from scratch, outside the repo (`/tmp/f15t-probe/`, now deleted), from four copied modules (`thread.ts`, `thread.test.ts`, `refusal.ts`, `editor/drafts.ts`), sha256-verified identical to the repo on copy. **One line changed, nothing else**, restoring the pre-F15 leak:

```
refusal.ts:71   return /\s/.test(code) ? code : UNKNOWN_CODE_REFUSAL;
            →   return code;
```

| Direction | Result |
|---|---|
| **Control** (real repo bytes, same wiring) | **18 passed (18), exit 0** |
| **Mutant** (leak restored) | **2 failed / 16 passed, exit 1** — the failures are exactly the two pinned blocks: `expected 'busy' to be 'İstek tamamlanamadı — tekrar dene.'` at `:99` and `:134` |

A mutant run stops at the first `expect` in each block, so those two failures alone would not prove the other two assertions. I added a per-payload probe that prints the reader's **actual** output for all four payloads with the assertion removed:

| Payload the blocks feed | Real tree | Leak-restored mutant |
|---|---|---|
| `{error:'busy'}` @500 (`:98`) | `İstek tamamlanamadı — tekrar dene.` | `"busy"` |
| `{error:'busy'}` @403 (`:133`) | `İstek tamamlanamadı — tekrar dene.` | `"busy"` |
| `{error:'busy',message:'   '}` (`:135`) | `İstek tamamlanamadı — tekrar dene.` | `"busy"` |
| `{error:'busy',message:42}` (`:137`) | `İstek tamamlanamadı — tekrar dene.` | `"busy"` |

**All 4 new assertions are individually load-bearing** — each discriminates fixed from leaked, none is shadowed by a neighbour. Neighbour assertions in the same blocks also hold on real bytes: unreadable body 500 and `{detail:'x'}` → `The reply stopped unexpectedly. Try again.` (as the report claims).

### Exactly-scoped delta proof, independently re-derived

I reverse-applied the two new blocks back to their pre-edit text on my own copy of the merged file:

```
reverse-applied sha256  : dee8ff65913d0ffbbdf705b09fed61c0bf567950ba1ccbd03333bbcac006a0e2
report's claimed baseline: dee8ff65913d0ffbbdf705b09fed61c0bf567950ba1ccbd03333bbcac006a0e2
MATCH: True
```

So the task's delta is exactly those two blocks and nothing else in the file moved — proven, not asserted. **Note:** `git show HEAD:apps/web/lib/chat/thread.test.ts` is `9bc7b513…`, *different* from that baseline, because HEAD lacks the `stitchBrief` describe block. That mismatch is the signature of the mixed-authorship wave work the report disclosed, not a discrepancy in the report's claim — the report's baseline is a pre-edit working-tree hash, not a HEAD blob.

### Cited line numbers — all accurate

Re-derived from the reverse-applied baseline and the current file. Old block 1 = lines **94-99**, old block 2 = lines **129-136**, new block 1 = lines **94-102**, new block 2 = lines **132-139** — matching the report exactly. The block-2 title change and all three `toBe('busy')` → generic edits are at the claimed positions.

## Findings

1. **No defects found.** Every acceptance-relevant claim in the build report reproduced under independent instruments.
2. **Class sweep re-run with my own instrument** (`LESSONS` §2 — assert the set *and* its size). Repo-wide search for tests still asserting a raw refusal code as message text: **no matches**; `toBe('busy')` appears **nowhere** in `apps/`; only the 4 fixtures remain. One grep hit needed adjudication and I read it: `apps/web/lib/db/map-db-error.test.ts:31` `expect(mapped?.error).toBe('database not configured')`. **Excluded with reason — different class:** it pins the JSON wire code the builder route emits (`mapped?.error`, a field of a returned object), not a sentence shown on screen, and it is explicitly titled "keeps the exact literal error string the builder route uses". Correctly excluded.
3. **The report's sibling exclusion is correct, verified by reading the file, not by trusting the claim.** `apps/web/components/ui/use-chat-stream.test.tsx:96` does feed `{error:'busy'}` — but its assertion at `:109` is `…assistant')?.status).toBe('error')`, a row *status*, and its only text assertion is `'Recovered.'` at `:125`. It does not pin the leak. Same class: **no**. Suite 6/6 green.
4. **The pinned behavior is on the real screen path.** `readHttpError` has exactly one production consumer — `apps/web/components/ui/use-chat-stream.ts:94` — which writes its return value into the row's `error` field (`patchMessage(… , error: message)`), i.e. the text a person reads, not a throwaway. So the two blocks pin genuine user-visible behavior rather than a private helper's idle branch. Worth stating because it is what makes these assertions worth keeping rather than retiring.
5. **The duplicated literal is a named cost with the right failure direction.** Confirmed `UNKNOWN_CODE_REFUSAL` is **not exported** from `refusal.ts`, so pinning the literal was the only option that did not require editing out-of-scope source. A future copy change in `refusal.ts` will fail this test loudly. The report names this rather than hiding it; I agree with the trade.

## Accuracy of build report

**Accurate on every checkable claim.** Reproduced exactly: typecheck/lint/format exits; 18/18 on the focused suite; **65 files / 994 tests** on the full suite; both source checksums; the 4-occurrence byte-match and its hex/unit counts; the homoglyph negative control; the cited old/new line numbers; the reverse-apply baseline hash; the mutant-vs-control direction and its per-block failure sites; the sibling-suite result and the sibling-class exclusion; and the two self-named limitations (test-only change not exercised in a browser; mixed-authorship diff vs HEAD).

I could not falsify anything. Two additive notes, neither a contradiction:

- The report's mutant claim ("OLD assertions pass 4/4 while the NEW ones fail 0/4") is stated as an aggregate; I verified it per payload instead and got the same direction on all four, which is the stronger form of the same claim.
- The report's "Lint (repo root, project convention)" row is redundant with its apps/web row but harmless; both are exit 0 and I re-ran both.

## Scope / artifacts / hygiene

- **In-scope files:** only `apps/web/lib/chat/thread.test.ts` is modified by this task (mtime **03:08:53**, inside the fix window). The report file exists on disk at its claimed path (mtime **03:12:33**).
- **No manifest/lockfile/env touched by this fix**, verified by mtime against the fix window: `.env.example` **2026-09-21**, `package-lock.json` **2026-09-20**, `apps/web/package.json` **2026-09-19** — all days before the 02:42–03:12 window. The `package-lock.json` modification is an `apps/testbot` `discord.js` stanza from a concurrent agent, not this task, exactly as the report states.
- **`thread.ts` (02:57) and `refusal.ts` (02:05) mtimes** confirm they belong to the *preceding* F15-unify task and the wave, not to this one; both hashes match the report's "before" column, so neither moved during this task.
- **No install command, no git state-changing command, no secrets.** My own probe work was confined to `/tmp` and every artifact was deleted; the repo's three in-scope hashes are unchanged after my review, and `git status` shows no new untracked file from me.

## Assumptions

- Read only the two whitelisted reports; treated the build report as a claim to test, not as evidence.
- `git show`/`git status`/`git diff` used read-only — no stash/restore/checkout/commit.
- The temp probe's `vitest` resolved to **v3.2.7** from the repo-root `node_modules` (a plain-object config in a temp dir cannot resolve the apps/web package); the authoritative version is the apps/web run at **v5.0.0**. The mutation result is substance-identical under either (pure TS, no API surface involved), but the instrument difference is named rather than papered over.
- My first attempt to re-check the report's "prettier clean *before* the edit" claim ran the baseline file from `/tmp`, where no `.prettierrc` applies, and reported a false formatting warning. That was a **broken instrument, not a finding** (`LESSONS` §1). Re-run with `--config .prettierrc` from inside the repo: **exit 0**, confirming the report's claim.

## Open Questions for Orchestrator

1. **Founder language decision remains open and is unaffected by this task** — the F15 report's Open Question 2 (Turkish refusal sentences now reachable on otherwise-English surfaces) still stands. This task only made a test expect shipped behavior; it neither widens nor narrows the reach. Do not read this green suite as settling it.
2. **The `invalid_turns` dead-entry concern** carried over from the F15 review is untouched here and still open for the sibling-criteria audit.
3. Nothing to escalate on this task's code. No fix agent needed.

## Public Interface Exposed

No exported signature changed — this task touched a test file only. Verified on merged bytes: `readHttpError(response)` keeps `(Response) => Promise<string>` at `thread.ts:136`; `readRefusalMessage(payload, options?)` keeps `(unknown, {allowErrorFallback?: boolean}) => string | null` at `refusal.ts:87`. No production code path is affected by this task, and no production file's bytes moved.

## Known Limitations

- **Not verified in a running browser.** No human completed a chat refusal flow in the app during this review. For a test-only change to a pure-TS module there is no app flow this edit can alter, and I did confirm the reader's single production consumer and the screen field its output lands in by reading the code — but the app was not run, and I name that rather than implying otherwise. Evidence here is gate-, suite-, hash-, and mutation-probe-level.
- The test pins a literal duplicate of a module-private constant (see Findings 5); a copy change in `refusal.ts` must be mirrored in the test.
- Full-suite green describes the merged tree **at this moment** on a live wave; other agents' uncommitted work is in the same file and could change it after this review.
