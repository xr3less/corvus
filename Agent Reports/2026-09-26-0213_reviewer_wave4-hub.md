# Review: reviewer-wave4-hub

## Verdict

PASS

Wave 4 (approval card + status ribbon + versions/undo + diff collapse + thread passthrough + page wiring) matches the locked SPEC (`2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md`) and pack (`2026-09-25-1806_wave-4-pack_approval-ribbon-hub.md`). All gates green on the merged tree, contracts hold, freeze intact. One non-blocking observation (§3, slots unused by page) — additive seam, no defect.

## 1. Works

Commands run myself on disk (working dir `C:\Users\xr3less\Desktop\corvus`):

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint` on all 11 Wave-4 touched files (`plan-approval-card.tsx`, `plan-approval-card.test.tsx`, `build-status-ribbon.tsx`, `build-status-ribbon.test.tsx`, `version-history.tsx`, `version-history.test.tsx`, `app/api/bots/[botId]/versions/route.ts`, `route.test.ts`, `app/dashboard/new/page.tsx`, `chat-thread.tsx`, `DiffView.tsx`) `--max-warnings 0` (repo root) → exit 0, no output.
- `npx vitest run components/ui/plan-approval-card.test.tsx components/ui/build-status-ribbon.test.tsx "app/api/bots/[botId]/versions/route.test.ts" components/ui/version-history.test.tsx components/ui/DiffView.test.tsx components/ui/chat-thread.test.tsx app/dashboard/new/page.test.tsx` (inside `apps/web`) → **7 files passed, 88 tests passed**, exit 0.
- Full suite `npx vitest run` (inside `apps/web`) → **73 files passed, 1060 passed, 73 skipped (1133 total)**, exit 0. (The `HTMLCanvasElement getContext` stderr line is a jsdom warning, not a failure — 0 failed.)
- Repo-root vitest invocation was not re-proven here; prior slice reports establish root-run `document is not defined` / `@/`-alias failures as invocation artifacts, and the pack mandates owning-workspace runs.

## 2. Scope purity

Artifact trust — all claimed files exist on disk (Get-Item byte sizes): `plan-approval-card.tsx` 1304, `.module.css` 1436, `.test.tsx` 1394, `build-status-ribbon.tsx` 2513, `.test.tsx` 2999, `version-history.tsx` 2691, `.test.tsx` 2432, `versions/route.ts` 4701, `route.test.ts` 7671, `dashboard/new/page.tsx` 32212, `chat-thread.tsx` 3322, `DiffView.tsx` 2454.

- `git diff --name-only -- verdict/route.ts start/route.ts bounds.ts persona-prompt.ts package.json package-lock.json` → empty (all frozen files + manifests untouched). No `pnpm-*` rows in `git status` (no junk).
- `git diff --name-only -- "apps/web/app/api/spec/rollback/"` → empty (rollback route untouched — reuse only, as required).
- `git diff` on `page.tsx` shows Wave-4 slices only: +3 imports, `APPROVAL_WORD`, `buildStopped` + reset effect, `historyKey`/`failedRunId` + reset effect, M-9 latch corroboration (`runFailedRunIdRef.current !== runId` guard + `setFailedRunId` mirror), `showApprovalCard`, `handleApprove`, `runFailed`/`showVersionHistory`/`handleUndo`, three mounts. No wave-4 slice touched another wave's files. Other modified files in the tree (`builder/route.ts`, `globals.css`, `builder-progress.*`, `use-chat-stream.*`, `dashboard-rail.*`, `lib/chat/thread.*`, `page.test.tsx` files) belong to other waves' uncommitted work, not Wave 4.
- Cross-component discipline: card slice owns `plan-approval-card.*` only; ribbon owns `build-status-ribbon.*` only; versions owns route + `version-history.*`; diff owns `DiffView.tsx`; thread owns `chat-thread.tsx`; page slices own `page.tsx` only. No slice edited another's component.

## 3. Contracts

- **Rollback verified before undo, reused not forked:** versions `route.ts:1-12` names the rollback swap (`rollback/route.ts:277-298`) and publish twin (`publish/route.ts:514-534`) with exact line cites; route module exports GET only (`export async function GET` is the sole method export — POST/PUT/PATCH/DELETE undefined). `git diff` on the rollback dir is empty.
- **Versions GET returns numeric version:** `VERSIONS_SQL` = `SELECT id, version, created_at ... ORDER BY version DESC` (route.ts:84-85); `VersionItem { id, version: number, createdAt, isDraft, isProd }` (route.ts:70-76); `toVersionItems` carries `version: row.version` (route.ts:99-104). Route shape `params: Promise<{ botId }>` + `await params` (route.ts:111,118) per Next docs.
- **`onUndo(versionId, versionNumber)`:** `VersionHistoryProps.onUndo: (versionId: string, versionNumber: number) => void` (version-history.tsx:15); row button calls `onUndo(version.id, version.version)` (line 81). Page `handleUndo(_versionId, versionNumber)` POSTs `{ botId: target, version: versionNumber }` (page.tsx:504-510) — matches `validateRollbackBody` (rollback/route.ts:127-144; 422 `version must be a positive integer`). The wave4e3c contract-blocker (UUID-only `onUndo`) is resolved; failed-run gate `showVersionHistory = runFailed && botId !== null` with M-9 ref as authority + `failedRunId` render mirror (page.tsx:499-503).
- **Card `onApprove` → submit path only:** `handleApprove() { handleSubmit(APPROVAL_WORD, []) }` (page.tsx:486-488) with `APPROVAL_WORD = 'evet'` echoing VERDICT_HINT's existing instruction. No fetch/verdict import in card (only comment mentions). Plan-arrival gate is positional (last row `role === 'assistant'`, `botId !== null`, `runId === null`, `!streaming`; verdict in flight keeps card in `approving` state) — D-153 position gate preserved, typed `evet`/paraphrase auto-start untouched.
- **Ribbon stop local-only:** `BuildStatusRibbon` has zero fetch (only comment mentions); `onStop`/`onResume` are page `setBuildStopped(true/false)` (page.tsx:597-598); stop unmounts `BuilderProgress` (page.tsx:600), resume re-mounts. Honest sentence `Sunucudaki kurulum devam eder.` next to `Devam et` (ribbon.tsx:62-69); no copy claims the server stopped. Precedence `stopped → approving → active build → streaming → idle`; only `queued`/`generating`/`syncing` count as active; single `role="status"` pill.
- **Diff collapse:** `DiffKind` widened with `'unchanged'` (DiffView.tsx:6); `KIND_LABEL: Record<Exclude<DiffKind, 'unchanged'>, string>` (line 22) — no new label string; unchanged rows render `<li><details><summary>{title}</summary>[before][after]</details></li>`, collapsed by default, no badge, no Accept/Reject. `git diff` confirms added/removed/changed JSX byte-identical (badge + title + before/after + Reject/Accept block unchanged).
- **Thread passthrough:** `approvalCard?`/`statusRibbon?: ReactNode` optional props (chat-thread.tsx:26-27), rendered inside the row's own `<li>` after the status branch (lines 78-79). Absent → `{null}` × 2, pre-existing tree unchanged; both existing callers compile unchanged.
- **Observation (non-blocking):** the page mounts card/ribbon/version-history in the info block directly and does not pass elements through the new `ChatAssistantRow` slots. The slots are a valid additive seam for future use; nothing in the pack required the page to use them. Not a defect, no fix required.

## 4. Freeze

- `VERDICT_HINT` / `PLAN_MISSING_MESSAGE` byte-identical: `git diff page.tsx` shows no `-/+` on either constant (only a comment referencing VERDICT_HINT). No Turkish visible-copy additions in `page.tsx` (added-line grep hits are comments only — `Durdur/Devam et` appear solely in code comments; rendered copy comes from the components).
- New rendered strings are exactly the pack allowlist, byte-exact: card's four lines (`Plan hazır — doğru görünüyor mu?`, `Planı onayla ve kurulumu başlat`, `Değişiklik istersen yazman yeterli.`, `Onayın gönderiliyor…`), ribbon pills + `Durdur`/`Devam et` + `Sunucudaki kurulum devam eder.`, versions `Compare versions` / `No earlier version to undo to.` / `Undo to previous version` / `Undo keeps the current version for re-apply.`. No emoji, no exclamation marks. Added-Turkish-line grep on DiffView/chat-thread hits only identifiers/comments in English (`unchanged`, `ReactNode`).
- `TURNS_MAX 12` / `TURN_MAX 2000` intact in `bounds.ts` (untouched, §2). `globals.css`: existing diff hunk is append-only (`@@ -159,3 +159,20 @@` — Wave 2's additive second `:root` with `--dashboard-*` tokens); the original `:root` block is byte-identical (belongs to Wave 2, not Wave 4 — Wave 4 touched no CSS globals).
- No `TURNS_MAX`/`boundedView`/`singletonKey` changes in the Wave-4 diff.

## 5. Quality

- No `any` in any Wave-4 file (grep hits are the English word "any" inside comments only).
- No secrets/keys; `C:\Users\xr3less\Desktop\wiroai.txt` never read. No new dependencies declared or installed; manifests untouched (§2).
- i18n: owner surface Turkish with correct diacritics, diagnostics English, per SPEC §3. a11y: card `<section aria-labelledby="plan-approval-title">`, ribbon single `role="status"` pill, versions `<section><h2>`, DiffView `aria-label="Accept/Reject {title}"` preserved on action paths.
- Route tests assert GET-only and mutation-free queries; version-history fetch fails closed (heading-only, no crash, no fake rows).
