# Task Report: fix-css-guard

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/dashboard/bots/[id]/page-disabled-guard.test.tsx (4 tests, CSS regression guard)
- CREATED: Agent Reports/2026-09-23-0405_fix-css-guard_CREATE_css-guard.md (this report)

Nothing else was created, modified, or deleted by this task. The working-tree modifications to `apps/web/app/dashboard/bots/[id]/page.module.css` (numstat `40 0`), `page.tsx`, and `page.test.tsx` visible in `git status` are pre-existing (the uncommitted parent/grandparent wave) and were never touched — verified below.

## Dependencies Added
None. No install run, no manifest edit.

## Assumptions Made
- The three `:disabled` rule blocks in `apps/web/app/dashboard/bots/[id]/page.module.css` are the locked contract: ghost (:143-150), primary (:188-195), text (:219-224), each with a `:disabled:hover` arm. Line numbers cited from the read of the current working tree.
- `opacity: 0.5` + `cursor: not-allowed` are the accepted design signal (task-specified); resting-value restatement (ghost transparent + 0.15 border, primary #fafafa bg/border + `transform: none`, text #a1a1aa) is the correct pin, per the parent tasks.
- A separate guard file colocated with the surface (`page-disabled-guard.test.tsx`, beside `page.test.tsx`) satisfies "colocate without touching that file". The default `vitest.config.mjs` has no `include` filter, so Vitest's default include (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) discovers the new file with no config change.
- `hoverBody` matching `.cls:hover` via regex also matches the `:disabled:hover` arm textually, but the enabled-rule assertions target declarations only present in the enabled rule bodies (`#141417` ghost bg, `#d4d4d8` primary bg, `#fafafa` text colour), so they pin the enabled path, not the disabled arm.

## Open Questions for Orchestrator
None blocking. One note: the mutation tests assert failing counts as 1-of-4 check groups (ghost / primary / text / enabled-hovers) rather than raw `expect` counts — a finer failure count would be brittle against assertion-count changes. If a future edit wants per-declaration failure counts, the helpers already isolate them.

## Public Interface Exposed
None. Test-only file; no exported symbols, component props, API surface, or markup change. The guard reads the stylesheet as file text (`readFileSync`, same idiom as `app/dashboard/new/page.test.tsx:1265` and `app/pryzm/page.test.tsx:12`) and exports nothing consumed by other suites.

## Known Limitations
- Guard is textual (selector + declaration regexes on file text), not computed-style: it pins the rule's presence and wording, not the rendered pixel. The parent tasks already proved the computed-style effect in real Chrome; this guard prevents silent deletion, not specificity-order regressions from unrelated rules.
- `hoverBody('.ghostAction')` regex-matches the first `.ghostAction:hover` occurrence, which is the enabled rule (:127) since it precedes the disabled block — correct today, but a reorder that moves a `:disabled:hover` block above the enabled rule would need the helper revisited. The disabled-body matcher is order-independent (matches the exact two-selector pair).
- The `cursor: pointer` baseline count (enabled rules) is read dynamically, not hardcoded, so the altered-declaration mutation test survives future enabled-rule edits as long as the disabled `not-allowed` pin stands.

---

## Verification evidence

All commands run with real results; the real stylesheet was never edited.

### 1. Guard content (what it asserts)

New file `apps/web/app/dashboard/bots/[id]/page-disabled-guard.test.tsx`, 4 tests:
1. All three `:disabled` selectors exist WITH their `:disabled:hover` arms (`disabledBody` requires the exact `.cls:disabled, .cls:disabled:hover { ... }` pair) plus locked declarations: every rule `opacity: 0.5` + `cursor: not-allowed`; ghost transparent bg + `rgb(255 255 255 / 0.15)` border + `transform: none`; primary `#fafafa` bg/border + `transform: none`; text `#a1a1aa` colour.
2. Enabled `:hover` rules still present with their live values (ghost `#141417`, primary `#d4d4d8`, text `#fafafa`) — guards both the fix and the enabled path.
3. Mutation A (in-memory only): full stylesheet text with the `.primaryAction:disabled` block regex-removed → exactly 1 of 4 check groups throws (`checkPrimaryDisabled`), the other three pass, `checkAll` throws.
4. Mutation B (in-memory only): same text with the primary disabled `cursor: not-allowed` flipped to `cursor: pointer` → exactly 1 of 4 check groups throws (`checkPrimaryDisabled`), the other three pass.

### 2. Gates — exact commands, real results

| Gate | Command (cwd noted) | Result |
|---|---|---|
| New file, isolation | `npx vitest run "app/dashboard/bots/[id]/page-disabled-guard.test.tsx"` in `apps/web` | **4/4 passed**, 1 file |
| New file + neighbours | `npx vitest run "app/dashboard/bots/[id]/page.test.tsx" "app/dashboard/bots/[id]/page-disabled-guard.test.tsx" "app/dashboard/bots/page.test.tsx" "app/dashboard/page.test.tsx"` in `apps/web` | **102/102 passed** (4 files: 54 detail + 4 guard + neighbours; detail suite count unchanged at 54) |
| Typecheck | `npx tsc --noEmit` in `apps/web` | **exit 0**, no output |
| ESLint (new file) | `npx eslint "apps/web/app/dashboard/bots/[id]/page-disabled-guard.test.tsx" --max-warnings 0` at repo root | **exit 0**, zero warnings |
| Prettier (new file) | `npx prettier --check --ignore-unknown "app/dashboard/bots/[id]/page-disabled-guard.test.tsx"` in `apps/web` | **exit 0** after one `--write` pass (first check flagged style issues; `--write` fixed, re-check clean) |
| Scope guard | `git status --short "apps/web/app/dashboard/bots/[id]/"` + `git diff --numstat` on the CSS | new file `??`; CSS still exactly `40 0` (pre-existing wave); `page.tsx`/`page.test.tsx` modifications pre-existing, untouched by this task |

### 3. Guard-broken-and-watched (real file never edited)

Both mutation tests operate on an in-memory `variant` string; the failing counts were observed live:
- Initial run: 3/4 passed with the first Mutation-B instrument (`expect(cssSource).not.toContain('cursor: pointer')` — wrong, because the enabled rules legitimately use `cursor: pointer`). This was an instrument defect, not a guard defect; fixed the instrument to count `cursor: pointer` occurrences (+1 in variant) and assert on the disabled body. Re-run: **4/4 passed**.
- Mutation A observed: `checkPrimaryDisabled(variant)` throws `missing .primaryAction:disabled / .primaryAction:disabled:hover rule`; ghost/text/enabled pass; `checkAll` throws. Failing count: **1 of 4**.
- Mutation B observed: `checkPrimaryDisabled(variant)` throws on the `cursor: not-allowed` regex; ghost/text/enabled pass. Failing count: **1 of 4**.
- Real-file integrity: `expect(cssSource).toContain('.primaryAction:disabled')` (A) and pointer-count equality (B) assert inside the tests that the on-disk file still holds the rules.

### 4. No secrets
No secret printed, read, or written. No `.env`, manifest, lockfile, config, CSS, page, or existing test touched. No git restore/commit command run. No production contact.
