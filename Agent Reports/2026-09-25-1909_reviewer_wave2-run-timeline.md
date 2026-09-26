# Review Report: reviewer-wave2 (run-timeline)

## Verdict

PASS — in-scope acceptance holds (verification §1, §2, §4 below). The 2 failing M-9 tests in `apps/web/app/dashboard/new/page.test.tsx` are a real but OUT-of-scope break with a concrete Wave-4 fix (§3). Per task brief this is a recorded Wave-4 finding, not a wave-2 fail.

## Files Confirmed on Disk

All present: `apps/web/components/ui/run-timeline.tsx` (created, 7647 bytes), `apps/web/app/api/builder/route.ts`, `apps/web/components/ui/builder-progress.tsx`, `apps/web/components/ui/builder-progress.module.css`, `apps/web/app/globals.css`, `apps/web/app/api/builder/route.test.ts`, `apps/web/components/ui/builder-progress.test.tsx`. Reports read (whitelisted only): orchestrator SPEC `2026-09-25-1806`, wave-2 pack `2026-09-25-1806_wave-2-pack_run-timeline.md`, builder report `2026-09-25-1902_wave2-time_CREATE_run-timeline.md`. Next.js guides read: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` + `05-server-and-client-components.md`. Never read `wiroai.txt`. No source edits, no git restore commands (read-only review).

## 1. Does it actually work? — YES

Toolchain detected per SPEC §5 (npm workspaces, not pnpm):

- Typecheck `npm run typecheck --workspace @corvus/web` from repo root → exit 0, zero errors. Covers the whole web workspace, so downstream `page.tsx` still compiles against the extended hook signature (backward-compatible optional 3rd param).
- Lint `npx eslint <5 TS/TSX touched files> --max-warnings 0` from root → exit 0. (CSS files are ignored by the eslint config — 2 warnings if passed explicitly; that is config behavior, not a defect. Stated, not skipped.)
- Tests via `npm run test --workspace @corvus/web -- --run <file>` (vitest v5.0.0 inside `apps/web`):
  - `app/api/builder/route.test.ts` → 15/15 pass (live-PG path loud-skips, PG unreachable — expected).
  - `components/ui/builder-progress.test.tsx` → 12/12 pass.
  - Total 27/27 green.
- Instrument note (validate-before-acting): bare `npx vitest run <files>` from the repo root FAILS with `Cannot find package '@/lib/http/refusal'` (alias resolves only inside `apps/web`). This is a harness invocation artifact, not a code defect — the workspace-scoped command above is the correct instrument and is green.

## 2. Contract check — HOLDS

- Polling unchanged: `intervalMs = 2000` default (`builder-progress.tsx:66`), re-poll scheduled only while non-terminal (`:128-132` via `TERMINAL_PHASES = ['live','failed']`). Unknown-phase strings stop the timer and re-poll only via the Retry button (`retryNonce` effect dep, `:140-143`) — proven green by the two `Retry check` tests.
- Detail readers `isRecord`-guarded everywhere (`run-timeline.tsx:49-51,81,94,101`; `route.ts:30-32`; `builder-progress.tsx:40-42`). Zero new `any`: grep for `: any`, `<any`, `as any` across all three source files → 0 matches (only English words "any" in comments).
- Missing keys degrade honestly: blank/non-primitive → absent (`formatEntry`, `allowlistedCheckpointDetail`), empty detail → `Ayrıntı henüz yok`, malformed row detail → `{}`. Unknown phase string → `Unexpected builder phase` (`run-timeline.tsx:118-131` + `unknownPhase` path in the hook) with `Retry check` re-poll; green test `treats an unknown phase name outside the allowlist as an error`. Mutation probe is builder-attested (forced `if (false)` → 1 red → restored green); not re-run here because this review is scope-guarded read-only, but the guard code plus its passing test were inspected directly.
- Failed shows real cause verbatim (`readFailureCause`, no transform) + `step`/`attempts` extras, polling stopped — green test `shows the real failure cause verbatim`.
- GET widen is allowlist-only: 7 named checkpoint keys (`briefChars attempt stepStartedAt lastGoodPhase checkpointBrief error provider`), string-if-non-empty else finite-number-only, active phases only; `live`/`failed` branches, gate order, SQL/JOIN, and enqueue paths byte-untouched (diff shows one added hunk, no other hunks). `rawPreview`/`_builder` provably dropped (route tests assert key absence).

## 3. Downstream break adjudication (M-9 pair) — OUT of scope, Wave-4 fix recorded

Reproduced both failures myself with the correct instrument:

- `app/dashboard/new/page.test.tsx:1424` (`a failed build lets a later yes post…`) → `Unable to find an element with the text: Build failed`.
- `app/dashboard/new/page.test.tsx:1523` (`a live second run keeps the run gate closed…`) → same matcher failure.
  Findings: (a) REAL break but OUT of wave-2 scope — `page.tsx` integration lands once in Wave 4 per SPEC §4, and both files (`new/page.tsx`, `new/page.test.tsx`) are outside the wave-2 file scope (wave-2 `git diff --name-only` contains exactly its 6 files, nothing else). (b) NOT a freeze violation — the new readout `Build failed with error` is on the pack's new-strings list and in SPEC §3's Wave-2 list; all other frozen strings verified byte-intact (`Queued/Generating/Syncing/Live`, `No run started`, `Could not reach the builder`, `Unexpected builder phase`). Testing Library `getByText` defaults to full-string exact match, so the old assertion can never match the new readout — pure assertion staleness as the primary cause. Whether a secondary poll-timing issue hides behind it is unknowable until the string is fixed. (c) REQUIRED Wave-4 fix (concrete, file-level): in `apps/web/app/dashboard/new/page.test.tsx` lines 1424 and 1523, change `getByText('Build failed')` → `getByText('Build failed with error')`, then re-run the full `new/page.test.tsx` suite (58 tests); if either test stays red after the string fix, the Wave-4 owner investigates page-owned poll timing (display poll vs latch poll on run-1). Optional touch-up in the same wave: `new/page.tsx:187` comment still says `honest "Build failed"` — comment-only, update for accuracy. I did NOT edit these files (out of scope).

## 4. Quality — CLEAN

- No secrets/credentials in any touched file (full reads); no new runtime dependency (`package.json`/lockfiles unmodified per `git status`); new imports are `react`, the pre-existing `@/lib/http/refusal`, relative files, and CSS only.
- Frozen strings: no alterations beyond the one pack-mandated readout change (§3b). All 8 pack strings present with correct Turkish diacritics; grep confirms `Kurulum adımları`, `Ayrıntıları göster/gizle`, `Ayrıntı henüz yok`, `Build timeline`, `Step detail`, `Build failed with error`, `Retry check`. No emoji; `!` appears only in code operators (`!==`, `!=`, `!cancelled`, `!isBuilderPhase`) — zero in string literals.
- `globals.css`: diff purely additive (one +17-line second `:root` with `--dashboard-*` only); first `:root` byte-identical (md5 `85c7bf40fe52d98af78de086c0e3f469` matches `HEAD` for lines 1–30). `builder-progress.module.css`: zero removed lines (additive-only, existing classes untouched).
- Write-scope: `git diff --name-only` = exactly the 6 wave-2 files; untracked `apps/web/lib/builder/` + `0015_builder_checkpoint.sql` belong to wave-3, untouched by this wave. No manifest edits, no `pnpm-*` files.
- Process note: builder disclosed one file-only `git stash push`+pop on `builder-progress.tsx`. Tree verified sane: `git stash list` empty, status shows only expected modifications. No action needed.
- Non-blocking observations (no fix required): `--dashboard-*` tokens are defined but `builder-progress.module.css` keeps hardcoded hex values (pack required only additive tokens — met); the pre-existing flat-stepper classes (`.steps`/`.step`) are now unused but retained, consistent with the additive mandate; `route.test.ts` test named `forwards no detail at all for an unknown phase` actually exercises an active phase with internals-only detail — pre-existing name nit, out of scope.

## 5. Next.js compliance — NO VIOLATIONS

Per the guides read: route handler uses `export async function GET(req: Request)` + `NextResponse.json` (convention-conformant); no `dynamic = 'force-static'` — correct, this session-gated poll must stay dynamic/uncached. Both UI files place `'use client'` above imports (boundary-correct for `useState`/`useEffect`/event handlers); no server-only imports added (`readRefusalMessage` import pre-dates this wave); no deprecated App Router or client-component API usage observed.
