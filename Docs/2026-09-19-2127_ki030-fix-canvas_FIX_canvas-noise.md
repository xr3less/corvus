# Task Report: ki030-fix-canvas-noise

## Status

SUCCESS

The single failing assertion in `apps/web/app/page.test.tsx` is fixed by a test-only change. `VelarisCanvas`'s WebGL probe now receives `null` from a stubbed `HTMLCanvasElement.prototype.getContext`, so it takes the null-context early return it already handles and logs nothing. All 4 tests in the file pass, all four gates are clean, and no production file or locked KI-030 copy string was touched.

## Files Touched

- MODIFIED: apps/web/app/page.test.tsx
- CREATED: Docs/2026-09-19-2127_ki030-fix-canvas_FIX_canvas-noise.md (this report)

No other file was read-modified. No production file changed.

## Dependencies Added

- None. No installs run, no manifest edited.

## Assumptions Made

- **Chose the stub approach over the filter approach.** The spec allowed either. Stubbing returns a real value to the component (rather than suppressing a message after the fact), so the component exercises its genuine null-context code path and the console assertion stays a true positive for any _other_ error. Filtering a known string would have made the assertion blind to that string forever, including in a future real regression.
- **Hoisted the stub to file scope (`beforeAll`/`afterAll`) rather than scoping it to the one failing test.** All four tests in the file render `<HomePage />`, so all four hit the canvas probe. Probed first with a per-test spy: that made test 1 pass but left jsdom's noise printing as stderr under tests 2-4. The file-level stub silences the noise for the whole file at a cost of 6 lines and no added per-test ceremony. Restored in `afterAll` so the prototype patch cannot leak into sibling files.
- **`mockReturnValue(null)` rather than a mock object.** `VelarisCanvas` already has an explicit `if (gl === null) return;` guard, so null is the component's own supported input and needs no fabricated WebGL surface.
- **Per-test `consoleError.mockRestore()` and `vi.unstubAllGlobals()` in the existing `finally` left untouched.** Only the canvas stub changed.

## Open Questions for Orchestrator

1. **No other test file shares this defect — verified, no follow-up needed.** Grep confirms `landing-islands` is imported by zero test files and `apps/web/app/page.test.tsx` is the only test that renders `HomePage`. The other 11 `from './page'` matches under `apps/web/app/**` are each file's own sibling page import. So this is a one-site fix, not a call-site-only fix over a wider class.
2. **The reviewer's per-test approach would also have worked and is marginally smaller.** I shipped the file-level variant because it removes the stderr noise rather than only satisfying the assertion. If the fix wave prefers the smallest possible diff, reverting to a spy inside test 1's existing `try` is a two-line version of the same fix — the remaining three tests would still emit jsdom stderr but assert nothing about it. Flagging as a taste call, not a defect. The orchestrator already holds my recommendation (keep what I shipped).

## Public Interface Exposed

- None. Test-only change; no exports, no routes, no production behavior altered.

## Known Limitations

- **Instrument validated against a real failure, not just a green run.** A `not.toHaveBeenCalled()` assertion passes trivially if the spy is dead, so I injected `console.error('__PROBE__')` into the test and confirmed it still failed the assertion (`expected "error" to not be called at all, but actually been called 1 times` / `"__PROBE__"`), then removed the probe. The guard is live: it catches real console errors and ignores only the canvas noise.
- **Leakage checked empirically.** Ran `page.test.tsx` together with `terms/page.test.tsx` (2 files, 8 tests) — both green, so the prototype stub does not bleed across files.
- **Not verified: the real browser path.** The stub is correct for jsdom, but I did not run the app in a browser to confirm `VelarisCanvas` still renders its WebGL effect on a real GPU. The production file is untouched and was already working before the KI-030 wave, so the risk is nil — but per the "done means a human completed the flow in the running app" rule, this task's claim is scoped to the test instrument, not to a click-through.
- **Ran no git commands**, per the stop rules (uncommitted wave, another agent's work in the tree). Verification is from gate output and file reads only.

## Gate Evidence (frozen final state)

| Gate       | Command                                                                                     | Result                                                             |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Vitest     | `npx vitest run --config apps/web/vitest.config.mjs apps/web/app/page.test.tsx` (repo root) | 4/4 pass, 1 file passed                                            |
| Typecheck  | `npx tsc --noEmit -p apps/web/tsconfig.json`                                                | clean, zero output                                                 |
| Lint       | `npx eslint --max-warnings 0 apps/web/app/page.test.tsx`                                    | clean, zero output                                                 |
| Format     | `npx prettier --check apps/web/app/page.test.tsx`                                           | `All matched files use Prettier code style!` (no `--write` needed) |
| Leakage    | `page.test.tsx` + `terms/page.test.tsx` in one run                                          | 8/8 pass, no cross-file bleed                                      |
| Instrument | injected `console.error('__PROBE__')`, expected failure observed, probe removed             | guard confirmed live                                               |

## Diff Summary (the whole change)

Two hunks in `apps/web/app/page.test.tsx`:

1. Import line gains `afterAll, beforeAll`.
2. Between the `lenis` mock and the `describe`, a 12-line block declaring `getContextSpy`, stubbing `HTMLCanvasElement.prototype.getContext` to return `null` in `beforeAll`, and restoring it in `afterAll`, with a comment naming the jsdom limitation and why null is the component's supported input.

Nothing else changed. All 11 copy assertions inside the console-error test are byte-identical, including the locked strings (`free while in preview — limits not enforced yet`, `Starter`, `Corvus Pro`, `Corvus Studio`, `$10`, `$29`, `faq-item` length 5, `Skip to content`). No KI-030 copy string was added, changed, or removed.
