# Task Report: wave4e2-thread

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/components/ui/chat-thread.tsx

## Dependencies Added

- None. No new dependency; no manifest touched; no install run.

## Assumptions Made

- The integration contract (wave-4 pack) fixes the card/ribbon public interfaces as `PlanApprovalCardProps { onApprove: () => void; approving: boolean }` and `BuildStatusRibbonProps { phase: string | null; streaming: boolean; approving: boolean; stopped: boolean; onStop: () => void; onResume: () => void; }`. This task does not re-declare or wrap those types — it accepts already-composed `ReactNode` elements so no import of either component is needed and no coupling is created.
- Slot naming (`approvalCard`, `statusRibbon`) mirrors the component names used by the wave-4 slices (`plan-approval-card`, `build-status-ribbon`) and the version-history seam idiom (`onUndo`). No slice on disk passes props into `ChatAssistantRow` yet, so the names are chosen for the page-wiring slice to consume, not derived from an existing call site.
- Slots render inside the row's own `<li>` after the status branch (including the `thinking` branch), so the card/ribbon can attach to the plan-offer turn whichever state it is in. When both props are absent the output is the pre-existing tree plus two `{null}` renders, which produce no DOM.

## Open Questions for Orchestrator

- None. Page wiring (which message gets the slots, plan-arrival mounting, undo wiring) belongs to the page-integration slice and was not touched.

## Public Interface Exposed

```tsx
// apps/web/components/ui/chat-thread.tsx
import type { ReactNode } from 'react';
export interface ChatAssistantRowProps {
  message: ThreadRow;
  onRetry: (id: string) => void;
  approvalCard?: ReactNode;
  statusRibbon?: ReactNode;
}
export function ChatAssistantRow({
  message,
  onRetry,
  approvalCard,
  statusRibbon,
}: ChatAssistantRowProps): JSX.Element;
```

- Both new props are optional. Existing callers (`apps/web/app/dashboard/new/page.tsx:450`, `apps/web/app/dashboard/bots/[id]/page.tsx:1383`) pass only `{ message, onRetry }` and compile unchanged.

## Known Limitations

- Pass-through only: no approval logic, no status/phase logic, no fetch, no verdict import. This task adds the slots; the page-wiring slice decides when to fill them.
- No new tests authored (scope is MODIFY-one-file, no behavior change). Existing suite `components/ui/chat-thread.test.tsx` covers the unchanged render paths.
- No new user-facing strings. No frozen file touched. No `any`.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint apps/web/components/ui/chat-thread.tsx --max-warnings 0` (repo root) → exit 0, no output.
- `npx vitest run components/ui/chat-thread.test.tsx` (inside `apps/web`, where the jsdom workspace config resolves) → 1 file passed, 7 tests passed, exit 0. Note: running the same file from the repo root fails at collection with `Cannot find package '@/lib/chat/thread'` (root vitest lacks the `@/` alias) — an invocation error, not a code failure; the owning-workspace command is the correct gate.
