# Wave 4 pack — approval shortcut + ribbon + diff/undo hub (page integration lands HERE ONLY)

SPEC: `2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md` (read it first; frozen motor §1 applies).
Research is done — do not launch research agents.

## Objective

The owner approves with one click without losing paraphrase auto-start, sees one honest status pill with
local stop/resume, and can compare + undo versions. ALL `page.tsx` integration lands in this wave, once.

## Files in scope

You may CREATE (if any target already exists: STOP, report PARTIAL, do not overwrite):

- `apps/web/components/ui/plan-approval-card.tsx`
- `apps/web/components/ui/plan-approval-card.module.css`
- `apps/web/components/ui/build-status-ribbon.tsx`
- `apps/web/components/ui/version-history.tsx`
- `apps/web/app/api/bots/[botId]/versions/route.ts`

You may MODIFY:

- `apps/web/app/dashboard/new/page.tsx` (SOLE page integrator — no other wave touches it)
- `apps/web/components/ui/chat-thread.tsx`
- `apps/web/components/ui/DiffView.tsx` (collapse unchanged kinds ONLY)

You may NOT touch: SPEC §1 frozen files, `package.json`/lockfiles (no new runtime dependencies; declare
needs in your report).

## Contracts

- Consume READ-ONLY: `lib/conversations/client.ts` (wave1-conv), `lib/builder/checkpoints.ts` + `lib/builder/gates.ts`
  (wave3-resume). If any is absent or drifted: STOP that slice, report PARTIAL, escalate — do NOT fork or
  re-implement. Accept accuse-the-SPEC verdicts on `gates.ts`; escalate drift, never fork the file.
- Approval is ADDITIVE, never a blocking gate: `onApprove` calls the page `handleSubmit` with a canned
  approval word through `useChatStream` submit (mint-once + verdict once-guards unchanged). Card renders on
  plan arrival (not after the user reply) and stays correct after `no`/`unclear`.
- Ribbon `Durdur` is LOCAL-ONLY (halts polling); copy must never claim the server build stopped.
- Versions `GET` is READ-ONLY (`id createdAt isDraft isProd`, reusing `spec_versions` + `draft_spec_id` /
  `prod_spec_id`); undo reuses the existing publish rollback pointer-swap in one transaction with preflight
  red-blocks — never a new mutation path.
- FIRST STEP — endpoint check: verify the existing publish/rollback pointer-swap path on disk BEFORE touching
  DiffView or wiring undo. Only go-live was confirmed present. If the rollback path is absent: STOP the undo
  slice, report PARTIAL, escalate. Do not build a parallel mechanism.

## Acceptance criteria

- [ ] Rollback path verified on disk before undo wiring (named in report) — or undo slice PARTIAL + escalated.
- [ ] Plan arrival shows approval card; Onayla routes through submit path only; typed `evet`/paraphrase
      auto-start preserved (D-153 position gate intact).
- [ ] Ribbon shows one honest pill (`Hazır`/`Sohbet yazıyor`/`Onay gönderiliyor`/`Kurulum sürüyor`/`Durduruldu`);
      Durdur collapses polling locally + honest sentence; Devam et re-polls.
- [ ] Failed run shows Resume + Compare versions; DiffView collapses unchanged kinds (large-spec perf check).
- [ ] Refresh rehydrates 50 turns with `botId` intact, no stale verdict re-POST.
- [ ] Typecheck + eslint clean; tests green (card submit-path, ribbon states, versions read-only, undo swap).
- [ ] No frozen string altered (SPEC §3); no new dependency installed.

## New strings (only these; correct Turkish diacritics; no emoji/exclamation)

`Plan hazır — doğru görünüyor mu?`, `Planı onayla ve kurulumu başlat`,
`Değişiklik istersen yazman yeterli.`, `Onayın gönderiliyor…`, `Hazır`, `Sohbet yazıyor`,
`Onay gönderiliyor`, `Kurulum sürüyor`, `Durduruldu`, `Durdur`, `Devam et`,
`Sunucudaki kurulum devam eder.`, `Compare versions`, `No earlier version to undo to.`,
`Undo to previous version`, `Undo keeps the current version for re-apply.`

## Report

Write to `Agent Reports/<timestamp>_wave4-hub_CREATE_approval-ribbon-hub.md` in the standard schema
(Status / Files Touched / Dependencies Added / Assumptions / Open Questions / Public Interface Exposed /
Known Limitations). Whitelist: you needed only this pack + the SPEC.

## Toolchain + docs notes (2026-09-25 correction, applies to all waves)

- npm workspaces (NOT pnpm): typecheck `npm run typecheck --workspace @corvus/web`, lint
  `npx eslint <touched-files> --max-warnings 0` from the repo root, tests `npx vitest run <files>` in
  `apps/web`. Never create `pnpm-*` files (a stray pair was created and deleted 2026-09-25).
- apps/web/AGENTS.md: before writing App Router / client-component / route-handler code, read the relevant
  guide in `node_modules/next/dist/docs/` — in this monorepo `next` is hoisted to the repo root
  (`C:\Users\xr3less\Desktop\corvus\node_modules\next\dist\docs\`), NOT under `apps/web` — and heed
  deprecation notices.
