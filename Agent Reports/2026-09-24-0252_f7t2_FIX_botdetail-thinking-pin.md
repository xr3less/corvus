# Task Report: F7T2-thinking-pin-botdetail

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.test.tsx (four `name:` matchers only)

No other file created, modified, or deleted. No report file other than this one.
No `git` write verb was run (no add/commit/stash/checkout/restore/reset); `git`
was used read-only (`status --short`, `diff --stat`, `diff --numstat`).

## Dependencies Added
None. No install command was run; no manifest or lockfile touched.

## Assumptions Made
- **No web research needed, stated per the research gate.** This task pins four
  test matchers to bytes that already exist in the local component source; no
  library version, model name, API surface, or pricing is involved. The only
  authoritative source is `thinking-trace.tsx` itself, which I read and copied
  from byte-for-byte rather than retyping from memory.
- **The Turkish header is NFC-composed.** Codepoints read from
  `thinking-trace.tsx:79` are `U+0044 U+00FC U+015F U+00FC U+006E U+00FC U+0079
  U+006F U+0072` (`Düşünüyor`): `ü` = U+00FC (not `u`+U+0308), `ş` = U+015F. I
  did not assume this — I measured it, because a decomposed-vs-composed
  mismatch would have produced a byte-unequal literal that *looks* identical on
  screen. Byte equality against the source is proven below.
- **The `it(...)` title at line 1709 was deliberately left in English**
  ("shows Thinking with elapsed time…"). Titles are dev-facing, not rendered
  copy; the brief says titles MUST stay untouched, and the F7 report treats
  rendered strings as the boundary. So the word "Thinking" legitimately survives
  inside one test title.
- **Line 1838's assertion is a negative (`queryByRole(...).toBeNull()`).** It
  was passing *vacuously* before this change (the label was wrong, so the
  negative trivially held). Retargeting it converted it from a vacuous pass into
  a real check. This is why the pre-change baseline was 3 red, not 4 — see
  Verification.

## Open Questions for Orchestrator
- **None for this task; it is complete and green.** Two observations that are
  outside this scope but worth recording:
  1. **The sibling site was fixed concurrently, mid-run, by a peer task.**
     `app/dashboard/new/page.test.tsx:470` was still
     `toContain('Thinking')` when I first grepped and read it, but had become
     `toContain('Düşüyor')`→`toContain('Düşünüyor')` (mtime 02:54:14) by the
     time I re-checked. My earlier read of that file returned stale bytes. It is
     now correct and its suite is green (evidence under Verification). Nothing
     is owed there — flagging only because my first measurement of it was
     invalid and I do not want that stale reading quoted downstream.
  2. No English `Thinking`/`Thought` header pin remains anywhere under
     `apps/web` outside node_modules — the four here were the last, after the
     F7-owned component/suite pins and the sibling at `new/page.test.tsx:470`.

## Public Interface Exposed
None. Test-only change; one line of reasoning:

```ts
// before
expect(screen.getByRole('button', { name: 'Thinking' })).toBeTruthy();
// after — line 1716 (identical shape at 1795, 1830; negative form at 1838)
expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();
```

No production file, prop, export, or endpoint was touched. The accessible-name
contract those assertions pin is unchanged in kind — only the expected string
moved, to match the shipped `Düşünüyor` that `thinking-trace.tsx:79` renders for
`status === 'thinking'`.

## Known Limitations
- **"Done" is at mounted-DOM level, not a browser drive.** The verification runs
  the real render path (`@testing-library/react` mounts the real `BotDetailPage`,
  which embeds the real `ChatAssistantRow` → `ThinkingTrace`) and the real
  streaming state machine through a stubbed SSE `fetch`. No browser was
  launched; this is a four-literal test-pin change with no behavioural surface of
  its own, so a visual pass belongs to the wave closeout, not to this file.
- **Whole-repo green is NOT claimed.** I verified the focused suite, its sibling,
  and the three static gates on the merged tree. Peers were writing sibling files
  during this task (proven above), so per LESSONS §1 a whole-repo run here would
  have measured a moving target.
- Only the `Düşünüyor` (thinking) header pin was exercised end-to-end. The
  `Düşündü` / `· Ns sürdü` done-state strings are pinned by F7's own suites and
  were not part of these four assertions.

## Verification

### Toolchain detected, not assumed
From `apps/web/package.json` + `vitest.config.mjs`: npm workspaces, runner
**vitest 5.0.0**, TS 5.9 strict, ESLint 9 flat config, Prettier 3.9.6. All
commands below run from `apps/web`. Every exit code is the tool's **true** exit
code (output redirected to a file, `$LASTEXITCODE` read immediately, log
byte-counted) — never the status of a pipe's tail.

### (0) Baseline red — the pins genuinely failed before the fix
```
npx vitest run "app/dashboard/bots/[id]/page.test.tsx"   (pre-change)
→ Tests  3 failed | 56 passed (59)
```
3 (not 4) failures, because line 1838 is the vacuous negative described above.
This is the instrument that proves the assertions were really pinning the old
bytes and were not passing for an unrelated reason.

### (1) The change is exactly four substring swaps — proven by reversal
I asserted the blast radius rather than trusting "replace_all did 4".
- `name: 'Thinking'` occurrences pre-change: **4**, at lines 1716, 1795, 1830,
  1838 (matches the brief's line list exactly).
- Pre-change md5: `a958d2ecb6bee2fbc63940a5ee2ea3ab`
- Post-change md5: `948c25ee4bc8a1fc2c4c8c8767d687a7`
- I applied the **inverse** substitution (`Düşünüyor` → `Thinking`) to the
  post-change file in `%TEMP%` (outside the repo) and hashed the result:
  **`a958d2ecb6bee2fbc63940a5ee2ea3ab` — byte-identical to the pre-change file.**
  That is a constructive proof that those four substrings are the *entire* delta:
  no whitespace, no line-ending, no unrelated byte moved. Temp file deleted.
- Byte equality of the new literal against the source, measured with `-ceq` on
  the extracted strings, not by eye:
  ```
  FROM_TEST: Düşünüyor   TEST_CODEPOINTS: U+0044 U+00FC U+015F U+00FC U+006E U+00FC U+0079 U+006F U+0072
  FROM_SRC : Düşünüyor   SRC_CODEPOINTS : U+0044 U+00FC U+015F U+00FC U+006E U+00FC U+0079 U+006F U+0072
  BYTE_EQUAL: True
  ```
- English header pins remaining in the file: **0**.
- `it(...)` titles at 1709/1738/1769/1807/1825 read back verbatim, unchanged.
- Caller-supplied fixture prose still present and untouched: `Weighing the
  options` (2), `The provider is busy.` (3), `Here is the rule.` (1).

### (2) Gates on the merged tree

| Command (cwd `apps/web`) | Exit | Output |
|---|---|---|
| `npx vitest run "app/dashboard/bots/[id]/page.test.tsx"` | **0** | Test Files 1 passed (1) · **Tests 59 passed (59)** |
| `npx tsc --noEmit` | **0** | **0 bytes** — clean |
| `npx eslint "app/dashboard/bots/[id]/page.test.tsx" --max-warnings 0` | **0** | **0 bytes** — clean, zero warnings |
| `npx prettier --check "app/dashboard/bots/[id]/page.test.tsx"` | **0** | `All matched files use Prettier code style!` |

59/59 is the full file count the F6 reviewer measured independently, so no test
was lost or skipped by this change.

### (3) The instrument was found to be unreliable mid-task — and re-measured
While measuring the sibling ownership site, I hit exactly LESSONS §1 and stopped:

1. `grep` reported `app/dashboard/new/page.test.tsx:470` as
   `toContain('Thinking')`, and a `Read` of that region agreed.
2. Running that suite failed with `expected 'A welcome bot for my study
   serverDüşü…' to contain 'Thinking'` — while the vitest code frame printed
   beneath it showed line 470 as `toContain('Düşünüyor')`. **The expected and
   received values disagreed with each other's own evidence** — the assertion
   text had changed on disk *during* the run.
3. Re-measured: line 470 is now `toContain('Düşünüyor')`, md5
   `04b574ab593ced726319bcab4d293bc0`, mtime **02:54:14** (mid-task, set by a
   peer). My first two readings of that file were stale, not wrong-at-the-time.
4. Re-ran both suites against the settled tree:
   ```
   npx vitest run "app/dashboard/bots/[id]/page.test.tsx" "app/dashboard/new/page.test.tsx"
   → Test Files  2 passed (2) · Tests  108 passed (108) · exit 0
   ```
   Post-run hashes unchanged (`948c25…` / `04b574…`), so nothing moved underneath
   *that* run. I am therefore reporting the sibling as **correct and green**, and
   explicitly retracting the transient failure as an artifact of my measurement,
   not a defect in anyone's file.

### (4) Scope hygiene
`git status --short` limited to my scope shows only
` M apps/web/app/dashboard/bots/[id]/page.test.tsx`. The large
`diff --stat` for this file (761+/128−) is the wave's uncommitted F6 Turkish
translation, pre-existing and foreign to this task; my own delta is the four
literals proven in (1). No manifest, lockfile, `.env`, or `thinking-trace.tsx`
change. No secrets, no credentials.
