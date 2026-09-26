# Task Report: wave4e3a-page-card

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/dashboard/new/page.tsx (+37 lines, additive only)

## Dependencies Added

- None.

## Assumptions Made

- `APPROVAL_WORD = 'evet'` is not new user-facing copy: it echoes the word the page already instructs the person to type (VERDICT_HINT `...“evet” yaz...` and both hint lines). It appears in the thread as the person's own turn, exactly as if typed.
- `approving` = `building || streaming`, the two in-flight flags the page already owns. No new loading state was created.
- Plan-arrival condition uses the page's existing position idiom: thread's last row is an assistant turn (no content reads), `botId !== null`, `runId === null`, `!streaming`. A verdict POST in flight (`building`) keeps the card mounted but in the `approving` state so the button shows the sending line instead of vanishing mid-flight.
- The card renders in the info block between the status lines and the run-progress section. Ribbon/versions/resume wiring are separate slices and were not touched.

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

- No new exports. Internal additions only: `APPROVAL_WORD` constant, `showApprovalCard` derived boolean, `handleApprove()` wrapper (`handleSubmit(APPROVAL_WORD, [])`), and one conditional `<PlanApprovalCard onApprove={handleApprove} approving={building || streaming} />` mount.

## Known Limitations

- Card stays mounted after a `no`/`unclear` hint (thread still ends on an assistant turn); a further click re-sends `evet` through the normal submit path and the judge re-decides — consistent with the additive-entry design.
- Card is hidden while `streaming` is true (the hook's streaming guard would swallow the submit), and hidden once `runId` is set.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint apps/web/app/dashboard/new/page.tsx --max-warnings 0` (repo root) → exit 0, zero warnings.
- `npx vitest run app/dashboard/new/page.test.tsx` (in `apps/web`) → 1 file passed, 58 passed / 58 (baseline preserved; page.test.tsx untouched by this slice — its working-tree diff predates this task).
- End-to-end wiring proof (temporary test, since deleted): plan streams → card `Planı onayla ve kurulumu başlat` appears → click sends `/api/chat` `{message: 'evet'}` → verdict POST `{botId, turns}` ends at `{role:'user',content:'evet'}` → `verdict: yes` lands `run-9` with the `?runId=` link. Result: 1 passed / 1.
- Frozen checks: TURNS_MAX/bounds/verdict route untouched; VERDICT_HINT, PLAN_MISSING_MESSAGE, and all Turkish copy byte-identical (`git diff` shows +37/-0, import + constant + visibility + handler + mount only). D-153 verdict effect (`useEffect` ~lines 260-363) byte-preserved in behavior.
- Next.js docs read before coding (per apps/web mandate): `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` (`'use client'` boundary rules) — confirmed the change is a plain client-component import inside an existing `'use client'` page; no App Router API touched. No web research needed (no version/API dependency).
